---
title: 家庭 Homelab 的 Agent 全流程接管：Web 控制台服务篇
date: 2026-10-05 20:00:00
updated: 2026-11-21 11:00:00
tags:
  - AI Agent
  - SafeLine
  - GitLab
  - Zabbix
  - 系统运维
categories:
  - 系统运维
  - 系统维护
keywords: 雷池 WAF, SafeLine, GitLab, Zabbix, LiteLLM, Agent 接管, API, 控制台服务, 巡检
description: 家里十几个 Web 控制台（雷池 WAF、GitLab、Zabbix、LiteLLM、WeKnora 等）API 互不相通，逐项建"Agent 操作面"：API 是操作面、UI 是核对面，凭据 600 文件统一托管、探活固定最便宜请求、写操作前后读状态留痕、降级路径写死。两个真实故障——WAF 升级后管理 API 403、Zabbix systemd job 队列死锁——都靠逐接口二分与 list-jobs 定位，附可复现命令。
cover: /img/cover/agent-ops.jpg
toc: true
copyright: true
---

家里有十几个 Web 控制台，每个都有自己的登录页：雷池 SafeLine（国产开源 WAF，挡公网流量的）、GitLab（自托管代码仓）、Zabbix（主机与服务监控）、LiteLLM（大模型网关）、WeKnora（自托管语义知识库）、DataEase（BI）等，十几套 API 互不相通，Agent 想接手得逐个"读懂"。这是主机层通道建完之后的第二批接管对象，也是量最大的一块。这篇记录给这批服务统一建"Agent 操作面"的做法，以及两个真实故障怎么靠这套操作面定位的。

原则一句话：**API 是操作面，UI 是核对面**。Agent 干活走 API，改完去 UI 对应页面用真实请求核对一次。拆开的原因是 UI 显示和 API 返回可能不一致，这轮里真实出现过，不是多疑。

## 操作面四件套：每项服务同一套

十几项服务，每项做同样的四件事：

**1. 凭据统一托管。** 每项服务的 API token 单独存一个 600 权限的文件，命名规则 `~/.config/<服务>-<标识>/api-token`。为什么不放环境变量——会漏进日志；为什么不放共享配置——一个服务改密码影响别人。脚本读文件、不回显。

**2. 探活接口固定。** 每项服务指定一个"最便宜的探活请求"（版本接口、健康检查端点），巡检只打这一个。探活失败才升级深度检查。反直觉的地方：巡检本身会变成自家服务的负载源，不固定探活面，全量接口轮询比故障本身更伤库。

**3. 写操作留痕。** 所有经 API 的写操作（改规则、建用户、调策略），Agent 执行前后各读一次相关状态，diff 写进报告。API 返回 200 不等于状态变了——WAF 上就遇到过返回成功但实际没生效的策略项。

**4. 降级路径写死。** API 不可用时走什么通道、走到哪一级算失败，每项服务写明：

| 服务 | 降级通道 |
| --- | --- |
| 雷池 WAF | SSH 进容器看日志 |
| GitLab | 走 Runner 机器 |
| Zabbix | 查数据库 |

## 两个 API 通道救回来的故障

**故障一：WAF 升级后管理 API 403，UI 登录正常。**

纯 UI 排查会卡在"到底是哪个权限"，而且 UI 上根本看不出异常。定位靠同一会话内的逐接口矩阵：登录拿到 JWT 后，把版本探测、授权、审计等 40 多个管理接口打一遍，按返回归类。先并读三个口径接口：

```bash
# 版本/授权/许可三个接口并读，口径不一致的一对就是病灶
curl -sk -H "Authorization: Bearer $JWT" https://waf-host:9443/api/open/system/edition
curl -sk -H "Authorization: Bearer $JWT" https://waf-host:9443/api/open/system/authorize
curl -sk -H "Authorization: Bearer $JWT" https://waf-host:9443/api/open/system/license/status
```

这三条命令做的事：用同一个登录 token 同时问 WAF 三个问题——"你是哪个版本""授权了吗""许可干净吗"——三个答案对不上，口径不一致的那个就是病灶。现场返回：`edition` 说是商业版，`license/status` 说许可干净，唯独 `authorize` 的提示字段残留了半截字符串——三个接口三种口径。全量回归里 403 只出现在这一对接口上。后来确认那是补丁只覆写了字符串前 4 字节、后 9 字节原样残留，"补丁打到一半"在 UI 弹窗抑制规则里根本看不见。该不一致记为已知状态，巡检对 authorize 单接口做了豁免。

归类口径必须先定义（PASS / 404 / 许可门控 / 403），不然全量打出来的结果只是一堆数字。UI 正常只证明登录态加前端渲染这条链没断，管理面是否一致只有接口级对比能看出来。

**故障二：Zabbix 打补丁后 systemd job 队列死锁，API 层只表现为 `apiinfo.version` 超时。**

补丁升级本身成功，约一小时后 unattended-upgrades 批量重启服务：mysql 先被停，它的 start job 排在 zabbix-server 的 stop job 后面，而 zabbix-server 卡在"database is down: reconnecting"循环里对 SIGTERM 免疫，两个 job 互相等，队列死锁。最坑的是 Zabbix 自己的监控页全程全绿——agent 进程活着，采集照跑。诊断链可照跑：

```bash
# 1) 服务"看起来在跑"：active 但起不来
systemctl show zabbix-server -p ActiveState -p SubState

# 2) 关键一步：看 job 队列，而不是再看服务状态
systemctl list-jobs    # 现场：zabbix-server stop running + mysql start waiting

# 3) 确认谁真的活着
pgrep -a mysqld; pgrep -a zabbix_server

# 4) 解死锁：TERM 给 10 秒，不行就 KILL 卡住 deactivating 的那个
kill -TERM <zabbix_server_pid>; sleep 10; pkill -9 -x zabbix_server
```

大白话版：systemd 里"服务起不来"，第一步不是再看服务状态（状态显示 active，是假象），而是 `systemctl list-jobs` 看任务队列——死锁就藏在队列里。队列显示 zabbix-server 的 stop 在跑、mysql 的 start 在等，各等对方。先把僵住的进程 TERM 给 10 秒，不行再 KILL。

验证复用同一条探活，前后对比：

```bash
curl -s --max-time 10 -X POST http://zabbix-host:8080/api_jsonrpc.php \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"apiinfo.version","params":{},"id":1}'
# 故障中：超时；恢复后：{"jsonrpc":"2.0","result":"7.4.16","id":1}
```

就是巡检用的那条最便宜探活：问 Zabbix API 要个版本号，超时即故障、返回数字即恢复，前后对比自成证据链，不依赖任何 UI 截图。

两个坑：`systemctl start mysql` 表现为"挂死"而不是"排队"，因为 mysql.service 带 `TimeoutSec=infinity`，waiting 的 job 无限阻塞；队列里已有 job 时不要再发 start/restart，每条命令只是再排一个 job。这条写进了故障手册：**监控面全绿的系统，系统层可能已经死锁**；探活超时时先 `systemctl list-jobs`，再看服务状态。时间账：故障 67 分钟，用上 list-jobs 后诊断加修复约 3 分钟——成本在工具选择，不在复杂度。

## 巡检节奏：三段，产出的是归因链路

固定节奏的巡检代替"出事了再查"：

- **探活轮**：所有服务的最便宜探活，一轮跑完，失败项升级深度检查；
- **深度检查**：只针对失败项，走各自写明的那条降级路径；
- **报告**：每轮一份，状态变化（不是全量状态）进 Agent 知识库存档。

探活轮的可代码化部分，原则是"每层只用最便宜的验证"：TCP connect 验证端口层、HTTP 只读首页状态码验证应用层，零凭据、零写操作，轮询本身不构成负载源：

```python
import datetime, json, socket, time, urllib.request
from pathlib import Path

HOST, stop = "127.0.0.1", Path("monitor.stop")
for _ in range(300):            # 有界轮数，外加 stop 文件双止损
    if stop.exists(): break
    result = {"at": datetime.datetime.now().isoformat()}
    for name, port in [("ssh", 22), ("zabbix_server", 10051)]:
        try:
            socket.create_connection((HOST, port), timeout=2).close()
            result[name] = True
        except OSError:
            result[name] = False
    try:
        result["frontend_http"] = urllib.request.urlopen(
            f"http://{HOST}:8080/", timeout=3).status
    except Exception:
        result["frontend_http"] = None
    print(json.dumps(result), flush=True)   # JSONL，一行一轮
    time.sleep(5)
```

这个脚本做的事：每 5 秒试连两个 TCP 端口和一个 HTTP 首页，每轮输出一行 JSON。两个容易忽略的设计：监控脚本自己也会变成孤儿进程，所以封顶轮数和外部停止开关都是止损件，不裸写 `while True`；输出 JSONL 一行一轮，落盘即结构化，事后归因不用翻日志格式。

这个节奏跑下来，真正值钱的产出不是"发现故障"，而是**故障的归因链路完整**：哪个接口、什么返回、系统层什么状态，三段都有记录，复盘不用重新翻。

## 边界：哪些不放

全部接管不是目标。明确不放的：

- **计费/配额类写操作**（LiteLLM 的 key 额度调整）：读可以，写要人工确认；
- **对外暴露的策略变更**（WAF 对公网的规则）：Agent 提 diff，人批准后执行；
- **证书签发**：频率低、影响面大，保持人工。

放与不放的分界线就一条：**错了能不能在十分钟内无痕回滚**。能，放；不能，留人工确认环节。

## 成果：十几项服务同一套四件套，两个真实故障都靠 API 通道定位

接管前，出问题是逐个服务开 UI 翻：WAF 403 卡在"到底哪个权限"，Zabbix 监控页全绿却不知道系统层已经死锁，翻完一圈，花在"打开页面"上的时间比"查"还长。

现在家里十几项 Web 控制台服务（雷池 WAF、GitLab、Zabbix、LiteLLM、WeKnora、DataEase 等）全部跑在同一套四件套上：600 权限凭据文件、固定最便宜探活接口、写操作前后读状态留痕、降级路径写死。每项服务多出来的只有自己的连接串和降级通道一行。

- **两个真实故障都是靠 API 通道定位的，不是靠人开 UI 翻。** 雷池 WAF 升级后管理 API 403 而 UI 登录正常，同一 JWT 下逐接口对比定位到版本探测与授权接口口径不一致（授权态字段残留半截字符串），记为已知状态并做巡检豁免；Zabbix 补丁后 unattended-upgrades 批量重启造成 mysql 与 zabbix-server 的 systemd job 队列死锁，API 层只表现为 `apiinfo.version` 超时，`systemctl list-jobs` 加 `pkill -9` 解死锁后同一条探活即恢复——"监控面全绿、系统层已死锁"已写进故障手册。
- **巡检产出的归因链路是可直接复盘的。** 探活轮 → 失败项深度检查 → 报告三段节奏，每轮记录"哪个接口、什么返回、系统层什么状态"，复盘不用重新翻日志；状态变化进 Agent 知识库存档，口径收敛在一份报告里。
- **哪些动作留给人，分界线只有一条。** 错了能不能十分钟内无痕回滚：能，放给 Agent；不能，留人工确认环节。计费配额、对公网策略、证书签发三类已明确留在人工侧，边界写死、不靠临场判断。

## 未闭环清单

| 事项 | 状态 |
| --- | --- |
| 服务层统一告警面 | 未建。告警源分散，Zabbix 只覆盖主机层 |
| 服务层异常的实时发现 | 未闭环。API 探活失败、队列积压目前靠巡检轮发现，非实时 |

## 小结

十几项服务的接管没有新协议、新组件，难在判定标准的对齐：探活打哪个接口、写操作怎么证明生效、降级走到哪一级算失败、哪些动作留给人。

只留一条经验：**Web 控制台服务交给 Agent，API 是操作面、UI 是核对面——200 不算数，前后读到的状态差才算数。**

---

各服务的域名、IP 与凭据均已脱敏；行为与故障现象取自当时现场记录，未经二次复测，仅作口径参考。
