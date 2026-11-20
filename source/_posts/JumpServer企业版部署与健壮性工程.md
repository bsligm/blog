---
title: JumpServer 企业版部署与健壮性工程：从单节点到可验证的高鲁棒性
date: 2026-11-20 12:30:00
updated: 2026-11-20 12:30:00
tags:
  - 基础设施
  - 堡垒机
  - 系统运维
categories:
  - 系统运维
  - 安全管理
keywords: JumpServer 企业版, PAM, 高鲁棒性, systemd timer, PostgreSQL 备份, 健康巡检, AD 组同步, LDAP 部门映射, AccessKey HMAC, AI Agent, JMS Admin API, AI Native, 故障恢复演练
description: JumpServer 企业版从部署到 AI Native 改造：原子备份、两分钟巡检、AD 部门自动映射、一次 500 故障完整恢复，以及让 Codex 走 HMAC 签名 Admin API 纳管资产并录像审计。
cover: /img/cover/jumpserver-ent.jpg
toc: true
copyright: true
---

2023 年那篇[《JumpServer 单节点无外置数据库部署》](/2023/10/18/Jump%20server单节点无外置数据库部署/)解决的是「装起来」：一台 Linux、一套离线包、内置数据库，能登、能跳、能审计就算收工。这篇是公司环境的版本，解决的是「活得久、管得宽」：同样的单节点形态，但部署理念换了一套——安装只是起点，备份要原子、巡检要分钟级、部门归属要自动、回退要按对象、健康状态要能证明不是假绿，最后还要把管理员操作面整个开放给 AI Agent。

环境一句话：PVE 单节点上的一台虚拟机，Ubuntu 26.04，JumpServer 企业版 v4.10.18，PostgreSQL 16 + Redis 7 内置，13 个组件容器，承载全公司的特权访问入口。地址、主机名、内部产品名均脱敏；所有容器名、端口、命令可直接照抄。

## 部署理念：先想清楚会怎么死

单节点形态的死法就几种，部署方案按死法倒推：

| 死法 | 对策 |
| --- | --- |
| 容器挂了 | Docker 自动恢复策略 + 组件级 `jmsctl restart`，不做整栈循环重启 |
| 数据库坏了 | 每日 pg_dump 原子备份 + 升级前强制 dump + 按时间戳命名的回退点 |
| 宿主机/盘坏了 | PVE 层备份作业覆盖，但如实标注：备份与生产同盘，故障域未隔离（见末节） |
| 没人知道它病了 | 两分钟粒度健康巡检，状态原子落盘，接 Zabbix，失鲜也告警 |
| 升级升不上去 | 升级前必须有 dump；回退路径事先走通过一次 |

这条原则贯穿全文：**每一项健壮性措施都能回答「它防哪种死法、怎么证明它真在工作」**。证明不了的写进未闭环清单，不假装收口。

## 承载与运维通道

### 虚拟机设计

| 项 | 值 | 说明 |
| --- | --- | --- |
| 承载 | PVE 单节点上的一台 VM | 宿主机单节点无 HA，风险已标注 |
| OS | Ubuntu 26.04.1 LTS | ostype `l26` |
| 网络 | 单网卡入 VLAN，与业务平面隔离 | 堡垒机流量与业务流量分 VLAN |
| 存储 | virtio/scsi 落 ZFS | 与宿主机备份同卷，故障域未隔离 |
| guest agent | 启用 | 这是关键决策，下一节展开 |
| 开机自启 | 启动链内 | 宿主机重启后自动恢复 |

### 无密码运维通道

这台机器最容易被忽略的决策是 guest agent。堡垒机自己纳管全网资产，但**谁来管堡垒机**？如果运维入口依赖堡垒机自身的 SSH 凭据，凭据一丢就死循环。

解法：PVE 宿主机装好 `qemu-guest-agent` 之后，`qm guest exec` 提供了一条不需要 VM 内部任何凭据的执行通道：

```bash
# 从 PVE 宿主直接执行 VM 内任意命令，零凭据
qm guest exec 102 -- /bin/sh -c 'docker ps -a --format "{{.Names}}|{{.Status}}"'
qm guest exec 102 -- /bin/sh -c 'ss -lntp | grep -E ":80|:2222"'
```

这条通道后来还成了全套配置采集的基础——整个系统档案（容器全景、端口清单、数据面统计）都是经它一次性读回的，不留任何临时 SSH 账号。

## 版本选型：一次失败升级教会的事

时间线：

1. 初装社区版 4.10.19
2. 试用企业版，生产稳定在 v4.10.18-ee
3. 2026-09 一次 v5.0.0 升级尝试，两周内判定失败，回退 ee

回退能走通，靠的是升级前恰好有一份 dump。但这次事故留下三条硬规矩：

- **升级前必须有一份升级时间戳可识别的 dump**，`jmsctl backup_db` 跑完核对文件存在再动生产
- **回退路径必须事先走通一次**。我们这次是「恰好」回退成功，不算验证；验证标准是回退演练过
- **升级残留要当故障源管理**：v5 的 `kael` 容器停在 Exited、1.4 GB 的安装包和解压目录留在 `/opt/`——只要残留还在，下次误操作就可能二次翻车。残留不删，升级就没结束

另一个教训是**版本事实要验容器不信目录名**。`/opt/` 下同时有三个版本的目录，真实生产版本只有一个判定依据：

```bash
docker ps --format "{{.Names}}|{{.Image}}" | grep -vE "postgres|redis"
# 期望全部是 jumpserver/*:v4.10.18-ee
readlink /opt/current/installer   # 软链指向才是 jmsctl 实际使用的安装目录
```

## 组件与网络设计

13 个容器，四个业务面：

| 面 | 组件 | 端口 | 用途 |
| --- | --- | --- | --- |
| Web | web / core / celery | 80 | 前端 + API + 异步任务 |
| 协议网关 | koko / razor / xrdp / lion | 2222 / 3389 / 3390 / 4822 | SSH、RDP、Linux 图形、图形转发 |
| 数据代连 | magnus | 33061-33062 / 54320 / 15210 / 14330 / 27018 / 63790 | MySQL、PostgreSQL、Oracle、SQL Server、MongoDB、Redis |
| 内置存储 | postgresql / redis | 仅 127.0.0.1:5432 / 6379 | 数据库与缓存 |

网络取舍两个：

- **PostgreSQL 只绑 127.0.0.1**。代连需求全部走 magnus 的协议代理端口，数据库本体不对任何业务网段暴露。代价是查库必须进容器（`docker exec -it jms_postgresql psql -U postgres -d jumpserver`），换来的是「数据库端口泄漏」这类故障整个不存在。
- **容器网段 `DOCKER_SUBNET` 独立成段**，与业务网段、宿主网段都不重叠。跳板机的容器内部网络是最容易被当成「反正不对外」的地方，出问题时反而最难查——独立网段让 `ip route` 一眼分清内外。

## 健壮性工程：四个 systemd timer

这是本篇的重点。2026-10-30 一轮加固把四件事全部 timer 化，每项有明确的服务名、文件路径和回退对象。

### 1. 每日数据库备份（`jms-daily-backup.timer`，每日 03:10，漏跑补跑）

```bash
# 核心逻辑（定时器触发）
pg_dump -Fc jumpserver > /tmp/jms-<时间戳>.dump   # 临时文件完整写入
mv /tmp/jms-<时间戳>.dump /data/jumpserver/db_backup/  # 原子改名，杜绝半截备份
pg_restore --list /data/jumpserver/db_backup/jms-<时间戳>.dump  # 校验可读
```

三个设计点：

- **pg_dump 自定义格式 + 原子改名**。旧的 `jmsctl backup_db` 直接写目标路径，进程被杀就留半截文件；现在先写临时文件，完整后才 `mv`（同文件系统内是原子操作）
- **`pg_restore --list` 校验**。备份文件存在不等于备份有效，每次备份后立即验证可读。这一步拦下过「磁盘写满的假备份」
- **目录 0700、文件 0600**。备份里是 `SECRET_KEY` 加密过的资产凭据，权限就是最小化原则

### 2. 两分钟健康巡检（`jms-health.timer`）

巡检不是 `docker ps` 看一眼就完事，检查项分四层：

| 层 | 检查项 |
| --- | --- |
| 容器 | 12 个业务容器健康状态 |
| 数据 | PostgreSQL 可查询、Redis 响应 |
| 入口 | Web 健康接口、RDP 发布机 3389、启用中的远程应用是否有成功发布与在线发布机 |
| 自身 | 每日备份的时效（昨天有没有跑成）、日志属主、轮转失败状态 |

两个关键机制：

- **状态原子落盘**：结果写 `/var/lib/jms-health/current.json`，原子替换。下游（Zabbix、值班脚本）读到的永远是完整文件，不会出现读到一半的状态
- **失鲜独立告警**：健康值的采样时间戳单独一个 Zabbix 对象，**文件停止更新本身就是告警**——巡检挂了比业务挂了更可怕，因为它让你以为业务还活着

Zabbix 侧四个对象：原始状态、健康值、采样时间戳，再加异常与失鲜两条告警规则。失鲜规则盯时间戳不盯数值，专治「旧文件假绿」。

### 3. 身份层：LDAP 登录 + AD 部门自动映射（cron 每日 03:30，自研脚本）

身份分两层。第一层是登录：JumpServer 的 LDAP 认证直接对接 AD，80 个域用户零本地账号，Base DN 与过滤条件按部门 OU 收口——范围填小同步不到人，填大会把服务账号、停用账号一起拉进来，这是 LDAP 配置里最容易翻车的地方。

第二层是部门归属：LDAP 只解决「能登录」，不解决「进对组」。自研同步脚本每天把 AD 的部门/组结构重算成 JumpServer 用户组，规则很直接——AD 里 OU=研发的人自动进 JMS 的 `dev` 组，OU=运维进 `ops` 组，脚本维护一份部门到组的映射表。入职加进 AD 对应 OU，第二天 03:30 同步跑完就自动出现在堡垒机对应组里，管理员不建任何账号；离职在 AD 禁用，脚本跳过禁用账号，自动从组里移出。

设计约束四条：

- **幂等**：全量重算 + 差异 PATCH，跑一百次和跑一次结果一样
- **白名单**：`systemadmin` 等系统组永不触碰，脚本写错也不炸管理通道
- **敏感信息外置**：AD 账号与 JumpServer AK/SK 在 `/etc/default/jms-group-sync`，脚本本体零凭据，日志可以放心看
- **API 走 AccessKey HMAC-SHA256 签名**，不落 session cookie，无状态调用可重试

```text
Authorization: Signature keyId="<AK>", algorithm="hmac-sha256",
  headers="(request-target) date",
  signature="<base64(HMAC-SHA256(SK, '(request-target): <method> <path>\ndate: <date>'))>"
```

这套签名后来还成了无头 Agent 接堡垒机 API 的认证方式——机器调机器，没有浏览器 cookie 可偷，HMAC 是唯一说得通的方案。

依赖链要如实说：DC1 挂 → LDAP 不通 → 同步失败 → 新入职用户进不了堡垒机，但存量用户登录不受影响（组关系已落库）。这是可接受的降级。

### 4. 日志轮转收口

加固前日志轮转规则重复且属主混乱，rsyslog 新旧规则打架。收口方式：保留发行版 rsyslog 规则的 12 份轮转与 50 MiB 阈值，旧重复规则改成说明文件归档，新规则指定 `syslog:adm / 0640`，修正现存日志属主，`logrotate -d` 调试加实跑双验证，全程不重启日志服务。**合并前先确认没有业务在依赖旧规则的轮转间隔**——这条比改配置本身容易踩坑。

## 一次真实故障：API 500 的完整恢复

2026-10-30 上午，Web 端「网站连接」弹窗点不动，API 返回 500。复盘完整链路：

1. **现象**：部分资产的连接方式列表接口 500，图形会话建不出来
2. **定位**：12 个容器全健康、内存充足、无 OOM——容器层无异常，问题在数据层。查连接方式配置，发现一个历史遗留应用（v5 试用残留）发布状态为 failed 但保持启用，且排在列表首位
3. **根因**：前端默认选第一项，core 的 `Applet.select_host()` 迭代这个应用的空发布池时抛 `TypeError: 'NoneType' object is not iterable`
4. **恢复**：停用这个 failed 应用（保留历史记录），回读确认连接方式列表只剩可用项。**没有升级、没有重建、没有重启任何组件**
5. **验收**：用真实浏览器会话打通一次完整的网站连接，会话正常结束，API 回读 `is_success=true`，录像 1.8 MB 归档完整

这个故障的教训是结构性的：**启用状态的残留比禁用状态的残留危险得多**。禁用只是占地方，启用就是活的故障源。所以加固清单里有一条专门的动作——把 v5 残留的服务账号全部停用，组件统计接口里允许出现「历史离线项」，不清零图表（清零意味着删审计数据，更亏）。

还有一个更隐蔽的并发问题，当时准备补丁但按最小变更原则没有立即上生产：定时任务 `clean_orphan_session` 会把「尚未发送首次心跳的新建会话」误判为孤儿提前结束——会话实际在跑、录像还在写，数据库里却已标结束。补丁思路是给清理任务加 5 分钟宽限期，隔离环境复现竞态 + 5 项回归测试通过后才算数，等待生产任务进程重载窗口再上。**补丁没上生产之前，它只是补丁**。

## Agent 通道：让 AI Agent 用 JMS API 干活

堡垒机解决的是「人怎么安全地操作资产」。但运维动作越来越多由 AI Agent 发起——排障脚本、自动纳管、定期巡检。Agent 没有浏览器、没有 session cookie、没有鼠标，它只有一条路：API。

### 认证：AccessKey HMAC-SHA256 签名

JumpServer 的 Admin API 支持 AccessKey 认证。给 Agent 建一个专用服务账号，生成一对 AK/SK，之后每个请求都带签名头：

```text
Authorization: Signature keyId="<AK>", algorithm="hmac-sha256",
  headers="(request-target) date",
  signature="<base64(HMAC-SHA256(SK, '(request-target): <method> <path>\ndate: <date>'))>"

Date: <RFC 1123 GMT 时间>
```

为什么不用 Token 或 Basic Auth：

- **Token 要刷新、会过期**，Agent 长跑任务跑到一半 token 失效就断链。HMAC 签名无状态，AK/SK 不变就永远有效
- **Basic Auth 把密码放每个请求头**，日志一漏全漏。HMAC 只泄露签名，SK 本身不上网
- **签名绑定 `(request-target) + date`**，重放攻击的时间窗口被 date 卡死（服务端校验时间差）

这套签名和上面 AD 组同步脚本用的是同一套——同步脚本就是 Agent 认证的第一次实战，跑了一年多没出过认证问题。

### Agent 能干什么：管理员权限的 API 面

JMS Admin API 把 Web 界面上管理员能做的操作全部暴露了。Agent 用同一个 AK/SK，能干的事包括：

| 动作 | API 端点 | 说明 |
| --- | --- | --- |
| 添加资产 | `POST /api/v1/assets/assets/` | 指定地址、平台、协议，自动进入资产列表 |
| 添加账号 | `POST /api/v1/assets/<id>/accounts/` | 给资产绑定登录凭据（用户名+密码/密钥） |
| 创建授权 | `POST /api/v1/perms/asset-permissions/` | 把用户组 × 资产 × 账号绑成一条规则 |
| 查询会话 | `GET /api/v1/terminal/sessions/` | 谁正在连哪台机器、什么状态 |
| 结束会话 | `PATCH /api/v1/terminal/sessions/<id>/` | Agent 发现异常会话可以直接踢 |
| 系统升级 | `POST /api/v1/settings/...` 或 `jmsctl upgrade` | 版本管理 |

关键点是**管理员权限**：Agent 用 admin 角色的 AK/SK，操作等价于管理员在 Web 界面上点鼠标。纳管新服务器、给新入职员工开权限、结束异常会话——这些以前必须找一个有 Web 登录权限的人来点，现在 Agent 直接完成。

### 实操：Codex 通过 JMS API 纳管资产

一个完整的「Agent 纳管新资产」流程：

```python
import requests, hmac, hashlib, base64
from email.utils import formatdate

AK = "your-access-key-id"
SK = "your-secret-key"
BASE = "https://jms.example.com/api/v1"

def sign(method, path, date):
    string_to_sign = f"(request-target): {method.lower()} {path}\ndate: {date}"
    sig = base64.b64encode(
        hmac.new(SK.encode(), string_to_sign.encode(), hashlib.sha256).digest()
    ).decode()
    return f'Signature keyId="{AK}",algorithm="hmac-sha256",headers="(request-target) date",signature="{sig}"'

def api_request(method, path, body=None):
    date = formatdate(usegmt=True)
    headers = {"Date": date, "Authorization": sign(method, path, date)}
    if body: headers["Content-Type"] = "application/json"
    return requests.request(method, BASE + path, json=body, headers=headers, timeout=30)

# 1. 添加资产
asset = api_request("POST", "/assets/assets/", {
    "name": "新服务器-01",
    "address": "10.0.2.50",
    "platform": "Linux",
    "protocols": [{"name": "ssh", "port": 22}],
    "nodes": ["/运维/生产环境"]   # 资产节点 ID
}).json()
asset_id = asset["id"]

# 2. 绑定登录账号
api_request("POST", f"/assets/{asset_id}/accounts/", {
    "name": "root",
    "username": "root",
    "secret": "the-password",   # 或 SSH 密钥
    "secret_type": "password"
})

# 3. 授权给运维组
api_request("POST", "/perms/asset-permissions/", {
    "name": "运维组-新服务器-01",
    "users": [],
    "user_groups": ["<运维组ID>"],
    "assets": [asset_id],
    "accounts": ["root"],
    "actions": ["connect", "upload", "download", "refresh"],
    "date_expired": "2099-12-31"
})

# 4. 验证：回读授权规则
rules = api_request("GET", f"/perms/asset-permissions/?name=运维组-新服务器-01")
print(f"授权规则已创建: {rules.json()['count']} 条")
```

四步走完，一台新服务器从「裸 IP」变成「运维组可通过堡垒机 SSH 连接、有录像审计的纳管资产」。全程 Agent 完成，人只负责确认。

### 宿主机 OS 账户：打通最后一环

资产纳管只解决了「堡垒机能跳过去」。Agent 要真正操作宿主机（装补丁、改配置、重启服务），还需要宿主机 OS 层的凭据。两个来源：

- **JMS 资产账号**：上面第 2 步绑定的 root 密码/密钥。Agent 从 JMS API 读取该账号的 secret，通过 SSH/RDP 协议网关（koko 2222 / razor 3389）建立连接
- **独立凭据库**：宿主机管理员密码存在 Agent 的凭据库（如 `~/.config/` 下 mode 600 文件），不走 JMS 账号体系。适合宿主机本身不在 JMS 纳管范围的情况

我们的实际做法是**双轨并行**：宿主机已纳管 JMS 的，Agent 走 JMS 账号（好处是每次连接都有录像审计）；未纳管的，走独立凭据库（好处是不受 JMS 故障影响）。后续方向是全部收口到 JMS 账号——**Agent 的每一次 OS 操作都落在堡垒机录像里**，这就是 AI Native 的执行审计层。

### AI Native 闭环

把上面三块拼起来，运维闭环变成：

```
人（自然语言）→ AI Agent（Codex）
                    │
                    ├── JMS Admin API（HMAC 签名）
                    │     ├── 添加资产 + 账号 + 授权
                    │     ├── 查询/结束会话
                    │     └── 系统设置/升级
                    │
                    ├── SSH/RDP 协议网关（koko/razor）
                    │     └── 宿主机 OS 操作（装补丁/改配置/重启）
                    │
                    └── 录像归档（每次连接自动录像）
                          └── 审计层：谁（Agent）在什么时候对哪台机器做了什么
```

这比传统「人登录堡垒机 → 点鼠标 → 操作宿主机」多了两件事：**操作者可以是机器**（无头 Agent 不需要浏览器），**每一次操作都有录像**（Agent 干的事和人干的事审计标准一致）。

未闭环：Agent 的 AK/SK 目前是 admin 全权限，还没有做按操作粒度收权（只给资产写权限不给用户管理权限）。下一步是 JMS 的角色权限体系拆细，给 Agent 一个「能管资产但不能改用户」的中间角色。

## 回退策略：按对象，不按整库

所有加固项在动生产前先落备份，且备份分两层：

- 主机层 `/var/backups/jms-hardening-<日期>/`：修改前的数据库 dump、旧配置、旧 crontab
- 容器数据层 `/opt/jumpserver/data/ops-backups/hardening-<日期>/`：被修改对象的原值（应用启用状态、字段默认值、服务账号状态）

回退规则：**按对象编号恢复，不整库覆盖**。每个 timer、脚本、监控对象都有明确名称和编号，回退时按编号取对应原值。整库覆盖的诱惑在于省事，代价是把加固期间新增的正常数据也一起抹掉——数据库 dump 的时间点早于你要回退的那个对象的状态。

另有一条反直觉的：「恢复那个 failed 应用」看似是最简单的回退，实际上会**重新引入故障**，所以它被明确标注为「不建议作为一般回退」。回退路径也要逐条评估，不能默认「改回去就是回退」。

## 验收标准与未闭环

已验证：

- 每日备份连续产出且 `pg_restore --list` 校验通过
- 健康巡检持续产出，Zabbix 四个对象采集正常、规则表达式无错误
- 网站连接故障恢复后真实会话 + 录像归档双验收
- AD 组同步连续运行，幂等性经多次重跑核对

未闭环（如实列出）：

- **整库恢复演练没做过**。pg_dump 能读不算恢复成功，`pg_restore` 进一个干净库并核数据才算。演练排在下一个维护窗口
- **备份与生产同盘**。VM 落 ZFS 单盘，备份同盘，盘毁一起没。隔离备份需要额外存储目标（NAS 或对象存储），已立项未实施
- **HTTPS 未启用**。Web 仍是 80 明文，`config/nginx/cert/` 证书目录就位但没接。内网环境可接受，管理员凭据过网的暴露面还在
- **孤儿会话宽限补丁**在隔离环境验证完毕，待生产重载窗口
- **授权规则回收机制**：存量规则接近永久有效且含个人名规则，收敛方案已定（独立账号优先、特权按需带有效期），执行未完成
- **Zabbix 告警的通知送达**没做过故障演练。采集正常不等于告警真能到值班人手上
- **Agent 权限粒度**：Agent 的 AK/SK 目前是 admin 全权限，还没拆出「能管资产不能改用户」的中间角色
- **整库恢复演练**之外还差一次「Agent 全流程演练」：用 Agent 跑一遍 纳管→授权→SSH 操作→回读录像 的完整链路并在生产验收

## 小结

单节点不丢人，丢人的是单节点装完就不管。这篇的四个 timer 加一套按对象的回退策略，本质是把「这台机器现在活着」变成「这台机器活着这件事可以被独立验证」——备份能读、巡检能证明在跑、巡检挂了也会响、回退按对象取原值。

再往前一步是把操作者也变成可验证的：AD 部门映射让「人进对组」自动化，HMAC 签名让 Agent 能拿着和同步脚本同一套认证直接调管理员 API，录像归档让 Agent 干的每一件事都有审计留痕。堡垒机从「人的入口」变成「人和 Agent 共用的受控执行层」，这是这套环境里 AI Native 落得最实的一块。

下一阶段的增量是隔离备份目标和整库恢复演练，把「未闭环」清单上的前两条划掉。届时堡垒机的故障域才算真正从单盘里搬出去。
