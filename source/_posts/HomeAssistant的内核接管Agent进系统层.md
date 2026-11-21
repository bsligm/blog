---
title: Home Assistant 的内核接管：让 Agent 摸到 HAOS 的系统层
date: 2026-10-03 22:00:00
updated: 2026-11-21 11:00:00
tags:
  - Home Assistant
  - HAOS
  - AI Agent
  - Docker
  - 系统运维
categories:
  - 系统运维
  - 系统维护
keywords: HAOS, Home Assistant, 内核接管, Docker 容器, REST API, SSH, Agent, 智能家居
description: HA 官方 API 全是应用层的，容器、磁盘、HAOS 升级这些系统层问题 Agent 必须 SSH 进 HAOS 内核才够得着。记录把 HAOS 改造成 Agent 可接管形态的做法：应用层与系统层双通道按权限分开建、系统层三类真实任务、容器内修改只许诊断，以及 SSH root 的收口边界。
cover: /img/cover/haos-kernel.jpg
toc: true
copyright: true
---

Home Assistant 是我智能家居的中枢，跑在一台家用服务器上：HAOS（Home Assistant 的操作系统本体，装 HA 和所有集成容器的那层）本身、加上第三方集成容器，都在这台机器上。问题出在——它一旦出事，要么是某个集成容器崩了，要么是系统盘快满了，要么要升级 HAOS 本身——这三类问题全在官方 API 外面，之前每次都得自己开 Web UI 翻，或者临时 SSH 进去看。改造前 Agent 只能读官方 API 的实体状态，应用层看着正常、系统层出了问题时，人就是瓶颈。

目标很直接：日常操作走应用层 API，系统层操作走 SSH 进 HAOS 内核，任何一步都不需要人打开 UI。真正花时间的不是两个通道本身——API 装完就有，SSH 开一下就行——而是两者的分工：每层各有什么权限、哪些操作必须走哪条路、升级会保留什么又会丢什么。这条边界不清，出问题的排查成本是两头查。

## 通道分工：按权限分两层，不是按协议分

| 层 | 通道 | 覆盖 | 权限 |
| --- | --- | --- | --- |
| 应用层 | REST + WebSocket API | 实体、自动化、集成配置、日志读取 | 长期 token，只读为主 |
| 系统层 | SSH 进 HAOS 内核 | 容器管理、系统包、磁盘、内核参数、HAOS 升级 | 管理网段限定，root |

应用层通道从装完就有：长期 access token 建在专门的服务账号上（不是主账号），scope 按"读多写少"给。Agent 日常巡检走这一层：实体状态、集成健康、最近事件，全不碰系统。

系统层是这次新开的。HAOS 的 SSH 默认不开，开了就是 root——这个权限级别在家庭环境里必须配套收口动作，见下文。

## 系统层通道：dropbear，不是 OpenSSH

HAOS 的 SSH 和家里其他 Linux 主机的 OpenSSH 不是一个东西：它用的是 dropbear——HAOS 自带的轻量 SSH 实现——独立端口、独立口令（把家里其他机器的统一口令搬过来直接失败，收口动作见后文）。连接形态因此单独写死在通道定义里：这套参数解决两件事——密钥登录到系统层，和把 HA 侧的备份原样拉回本地并验证完整：

```bash
HA=root@<haos>
SSH="ssh -i $HOME/.ssh/id_ed25519 -o UserKnownHostsFile=$KH -o ConnectTimeout=20 -p 22222 $HA"
# dropbear 无 sftp-server：scp 必须加 -O 走 sftp 协议兼容层
scp -O -i "$HOME/.ssh/id_ed25519" -o UserKnownHostsFile="$KH" -P 22222 \
    "$HA:/mnt/data/supervisor/backup/$SLUG.tar" "$OUT/HA-$NAME.tar"
tar tf "$OUT/HA-$NAME.tar" >/dev/null && echo "tar OK"   # 回读：tar 结构可读才算完整
```

两个坑都踩出来才写进通道定义的：dropbear 默认不带 sftp-server，新版 scp 默认走 SFTP 协议，不加 `-O` 会直接握手失败——所以 `-O` 是这个通道的固定参数，不是可选优化；`tar tf` 回读是因为"scp 退出码 0"只证明文件字节到了，tar 结构可读才算完整。备份闭环的完整链路：触发 → 等完成 → `scp -O` 拉回 → restic 推远端仓 → HA 侧轮转（保 2 份 `ops-` 前缀快照）→ 本地 14 天轮转；restic 的 forget/prune 遇陈旧锁先 `restic unlock` 再重试一次，失败不阻断——产物已入仓，锁是本地问题。

## 系统层面：三类真实任务

这个通道不是白开的。接管跑通后，Agent 通过系统层实际处理过三类任务：

**容器故障。** 某个第三方集成以容器方式跑，崩溃后应用层只看到"集成不可用"，看不出是容器 OOM 还是镜像挂了。系统层一步定位，关键在退出码分流：

```bash
# 定位：看退出码。137=OOMKilled（容器被杀），2=应用自身报错
$SSH "docker ps -a --filter name=<addon> --format '{{.Names}} {{.Status}} exit={{.State}}'"
$SSH "docker logs --tail 50 --timestamps <addon-container>"
# 重建：镜像不动、配置不动，只重建容器本体
$SSH "docker stop <addon-container> && docker rm <addon-container>"
$SSH "ha addon reload <addon>"        # 走 HA 的 addon 机制重建，而不是手搓 docker run
```

退出码是分流判据：137 要去调内存限额、看宿主压力，2 是集成自身问题要看日志，两者处置完全不同——定位的产物不是"容器挂了"四个字，而是该走哪条处置路径。重建走 `ha addon reload` 而不是裸 `docker run`，保证配置来源仍是 HA 托管的 compose，重建结果不会被下次升级的容器清单当成"野容器"。这段是示意等价实现，真实脚本多了重建后的状态回读。

**磁盘水位。** HAOS 系统盘不大，数据库加备份慢慢会涨。Agent 定期查 `df`，水位过线时先查占用大头（`/var/lib/mysql`、备份目录、容器日志）。容器日志的轮转策略在系统层改一次就长期生效，不用每次手动清。

**HAOS 升级。** 应用层 UI 只能选"升级 HA"，HAOS 本体的升级必须走系统层。升级前必做的一步是快照，用的就是 Supervisor（HAOS 的容器管理器）的 full backup。这段代码解决"备份什么时候算完成"：`ha backups new` 是异步的——CLI 返回 slug 不代表备份完成，完成判定用"两次采样文件大小稳定"，比轮询状态文本更抗实现变化：

```bash
NAME="ops-$(date +%F-%H%M)"
SLUG=$($SSH "ha backups new --name $NAME" | awk '/^slug:/{print $2}')
[[ "$SLUG" =~ ^[0-9a-f]{8}$ ]] || { echo "ERROR invalid backup slug"; exit 1; }
# 完成判定：文件大小连续两次采样不变且非零，而不是看"进度条"
for i in $(seq 1 120); do
    sleep 10
    SZ=$($SSH "stat -c %s /mnt/data/supervisor/backup/$SLUG.tar 2>/dev/null || echo 0")
    SZ2=$($SSH "sleep 8; stat -c %s /mnt/data/supervisor/backup/$SLUG.tar 2>/dev/null || echo 0")
    if [ "$SZ" = "$SZ2" ] && [ "$SZ" != "0" ]; then echo "done size=$SZ"; break; fi
done
```

两次采样间隔 8 秒且都从远端取，防的是"本地时钟快、远端还在写"的假稳定。快照名带 `ops-` 前缀是刻意的：后面轮转只删自己创建的前缀，不碰用户手动备份。轮转走 `--raw-json` 回读，Agent 侧精确圈定对象：

```bash
LIST=$($SSH "ha backups list --raw-json")
printf '%s' "$LIST" | python3 -c '
import sys, json
b = json.load(sys.stdin)["data"]["backups"]
b = sorted((x for x in b if x["name"].startswith("ops-") and x["type"] == "full"),
           key=lambda x: x["date"], reverse=True)
print("\n".join(x["slug"] for x in b[2:]))' | while IFS= read -r old; do
    $SSH "ha backups remove $old" || echo "WARN backup removal failed: $old"
done
```

"前缀 + type=full"两个条件同时满足才进轮转候选，保留最近 2 份。HAOS 侧一切以 `ha` CLI 的结构化输出为准，不看 UI——这也是升级后"对比版本号、检查各集成状态"的具体做法：`ha os info` 读前后版本 diff，`ha addon list --raw-json` 逐集成核状态，结果写回巡检报告。整条链路里没有一步需要人打开 UI。

## 容器内修改：诊断的路，不是修改的路

HA 本体是一个容器，第三方集成容器也是容器。这里有一个容易走偏的做法：从 HAOS 内核里 `docker exec` 进 HA 容器改文件。能成，但反直觉的地方是：**HA 升级时容器是整体替换的，改的文件没了**。修改在下次升级时被静默丢掉，写入当时没有任何报错；而且绕过了应用层的配置机制（`configuration.yaml`、UI 配置），出问题时两头查。

收口规则：容器内的配置变更一律走应用层 API 或配置文件挂载；系统层的 `docker exec` 只用于诊断，不用于修改。诊断产出的是日志和状态，修改必须走会被升级保留的路径。

## 权限收口：收在"谁能连"上

SSH root 在家庭网里的风险面主要是"谁能连"。收口动作：

- 端口只放行管理网段（与 Windows 侧同一个限定逻辑）；
- 主用密钥登录，口令登录保留但走独立于统一密码的单独口令——HAOS 对统一口令不认，这事本身就说明了它是独立系统，别试图统一它；
- Agent 每次系统层操作在报告里标注"系统层"，与应用层操作区分——权限级别不同，出问题的排查路径也不同。

## 全站位置：一套通道口径覆盖四类系统

HA 这条线打通后，接管面覆盖：

| 系统 | 通道 |
| --- | --- |
| Windows 主机 | WinRM |
| Linux 服务机 | SSH |
| HAOS | SSH 系统层 + API 应用层 |
| Web 控制台服务 | 各自的 API |

结论统一：**每个系统给出"应用层 + 系统层"两个明确通道，操作分级，不靠一个万能通道走天下**。

## 成果：三类系统层任务全部闭环，整条链路没打开过 UI

现在 HAOS 上跑着两层通道：应用层 REST + WebSocket API（长期 token，只读为主）加系统层 SSH（管理网段限定，root），权限边界就是前文那张分工表，两边各管各的。

| | 之前（痛点） | 之后（结果） |
| --- | --- | --- |
| 出问题时 | 容器崩了 / 盘满了 / 要升级 HAOS，都得人开 UI 或临时 SSH 上去看 | Agent 系统层通道常开，三类任务全程零 UI 操作 |
| 容器故障定位 | 应用层只报"集成不可用"，登上去翻日志 | 退出码分流：137 查内存、2 查日志，定位即给出处置路径 |
| HAOS 升级 | UI 只能升 HA 本体；HAOS 升级靠人 SSH，快照全靠手动 | 快照（双采样判完成、`ops-` 前缀轮转保 2 份）→ 升级 → 版本 diff → 逐集成核状态 → 写回报告 |
| 升级后丢修改 | `docker exec` 改的文件下次升级被静默吃掉 | 规则钉死：容器内只许诊断不许修改，修改走会被升级保留的路径 |

三类系统层任务都跑出过真实结果，全程零 UI 操作。家里四类系统的通道口径也统一了：Windows 走 WinRM、Linux 服务机走 SSH、HAOS 走系统层加应用层、Web 控制台走各自 API，每个系统都是"应用层 + 系统层"两个明确通道——出问题时先定层，排查路径一眼可判。

## 未闭环清单

| 事项 | 状态 |
| --- | --- |
| HAOS 自动升级策略 | 未完全交给 Agent，目前是"Agent 巡检提示 + 人工确认执行" |
| 升级失败的回滚演练 | 未做，是全托管的前提 |

## 小结

HA 的接管没有高难动作：官方 API 维护得好，系统层是一个开关加三类任务。真正花时间的是两层的边界：升级会保留什么、会丢什么，每种操作该挂在哪个权限级别、出问题走哪条排查路径。

只留一条经验：**Agent 管 HA，先给每个操作定层——系统层的活不要图省事走应用层，修改能不能活过升级是唯一的路由标准。**

---

HAOS 主机的具体 IP、域后缀与凭据均已脱敏；版本号与行为取自当时现场记录，未经二次复测，仅作口径参考。
