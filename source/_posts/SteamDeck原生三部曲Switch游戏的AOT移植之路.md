---
title: Steam Deck 原生三部曲：三款 Switch 游戏的 AOT 移植之路
date: 2026-11-06 21:00:00
updated: 2026-11-21 11:00:00
tags:
  - Steam Deck
  - 游戏移植
  - AOT
  - Vulkan
  - NativeDeck
categories:
  - 桌面维护
  - 系统维护
keywords: Steam Deck, Switch, AOT 重编译, LLVM, SPIR-V, Vulkan, Horizon, 异界锁链, 战神3, 血源诅咒, RADV, 遥操测试
description: 三款 Switch 游戏（异界锁链/战神3/血源诅咒）的 PC 重编译项目 AOT 搬上 Steam Deck 做"准原生"：三堵墙各拆一遍，Deck 是验收场不是工地——candidate 环境白名单重建、bwrap 只读根、存档 sha256 硬断言，以及 60fps 开关不生效的诊断路径。
cover: /img/cover/deck-trilogy.jpg
toc: true
copyright: true
---

想在 Steam Deck 上原生玩 Switch 游戏，不用模拟器、不靠运行时模拟，怎么做到？路线只有三条：模拟器（Ryujinx 这类，快但兼容性看天）、兼容层（转译，稳但每帧交税）、真·原生——AOT 移植，把 Switch 的 AArch64 代码静态重编译成本机 x86-64 原生码，慢但体验上限最高。这个项目押第三条：把三款游戏（异界锁链、战神 3 重制版、血源诅咒）的 PC 重编译项目搬上 Deck，做到厂商原生移植的标准层次。前 → 后：**从"能跑"到准原生（厂商移植水准），血源 30-60fps 可玩。**定位也先写清，防止口径漂移：**个人使用 + 自媒体 demo，不上传私有游戏资产**。目标定高，取舍才有判据；边界定死，"不做什么"才有判据。

## 三堵墙：挡的是架构差，不是单点难度

Switch 是 AArch64 + Maxwell GPU + Horizon 系统服务（Switch 的系统服务层，音频/输入/NFC 都走它），Deck 是 x86-64 + Vulkan（AMD 开源驱动 RADV），直接搬有三堵墙：

| 墙 | 问题 | 破法 |
| --- | --- | --- |
| A：CPU 指令集 | AArch64 代码跑不了 x86-64 | LLVM AOT 重编译，把 Switch 二进制静态重译成 x86-64，运行时零解释 |
| B：GPU 着色器 | Maxwell SASS 不是 Vulkan | SASS → SPIR-V（复用 Ryujinx 的转译器）→ Vulkan，跳过 Metal 那一步 |
| C：系统服务 | Horizon 的服务调用（音频、输入、NFC） | 在宿主二进制里 HLE 重新实现，不搬 HOS 内核 |

结论是这条路线**不需要 HOS 内核、不需要 Hypervisor、不需要 TrustZone**——早期调研里"HOS 上 x86 不可能"的判断被推翻，修正后才敢立项。三堵墙都有活跃的参考项目（ScarletNX、LAS Recomp、totk-recomp），本项目不是从零造轮子，做的是"把上游成果对齐到 Deck 的验收标准"。

AOT 构建侧的落法是"函数发现 → 逐函数 lift 成 C → 宿主 clang 编译"（非 QEMU、非动态翻译）：

```powershell
.venv\\Scripts\\python recomp\\gen.py --exefs build\\extracted\\v101\\exefs --out generated\\v101 \
    --patches recomp\\patches-v101.txt --version v101
.venv\\Scripts\\python tools\\build_game.py --version v101
# Lifting takes about 15 s, a clean compile about 200 s on 24 threads.
```

lift 15 秒、干净构建 200 秒（24 线程）是管线的一手口径；按指令量切 chunk，二次构建只重编变更部分，运行期零解释开销，代价全摊在构建里。

GPU 墙的大头在对齐语义：Maxwell 与 Vulkan 的行为差逐条建表，每个可见的坏画面都能回溯到一条语义差。转译器不重造，复用 Ryujinx 1.3.2 再叠自己的补丁，并把转译器自身的 sha256 写进每个着色器缓存键——转译器一改缓存自动失效，杜绝"缓存还是旧的、代码已经变了"的幽灵 bug。

## 上游成熟度：工作量分布在上游，验收标准在自己

三款游戏的上游成熟度差异很大，直接决定工作量分布：

- **血源诅咒**（bbport）：上游最成熟，原生 x86-64 执行 + 自研 Vulkan 渲染器，Deck 上 30-60fps 可用，工作重心在验收和平台集成；
- **异界锁链**（astral-chain-pc-recomp）：LLVM 静态重编译管线完整，但上游明说"尚未针对 4GB VRAM 和 Deck 优化"，这块要自己补；
- **战神 3**（SpartanPort）：上游在 Deck/RADV 上有已知的渲染损坏，动手前先确认新版是否修掉，否则搬过去也是坏的。

拆开理由是**验收标准三作共用一套，不是各自"能跑"**：63 条可勾选案例（输入/UI/画面/系统/性能五类），外加一轮盲区审计把案例集本身也审了一遍——**验收标准也会过时，它自己也需要验收**。每条案例从 `not_run` 起步，证据挂上才推进："看起来覆盖了"不算覆盖。

## Deck 是验收场，不是工地

这个项目最容易搞砸的地方是"在 Deck 上又改又测"：rootfs 只读（steamos-readonly）、系统盘小、存档珍贵，重活在 Deck 上做等于边开飞机边换发动机。

纪律定死一条：**构建、AOT、迭代全在远端 Runner 上做；Deck 只做最终验收，且验收过程必须轻拿轻放**。落地成一个测试电池（deck-experience），每次在 Deck 上跑一轮受控会话：

- 启动走 `systemd-run --user` 包一层，SSH 断了进程不死（`setsid nohup` 挡不住 logind 的 cgroup 回收，实测出来的）；
- 环境固化在一个 candidate 脚本里：语言、陀螺、手柄过滤、帧率开关全部显式声明，不接受"上次好像是这么设的"；
- 存储保护：bwrap 只读根 + 任务独占的精确挂载，可用空间低于 1GiB 自动停会话，会话结束写 `exit.json`，其中 `player_saves_unchanged` 是硬断言——**测完存档没被动过，这轮测试才算干净**。

候选环境按白名单式重建：先 unset 掉上一轮可能残留的诊断变量，再显式 export：

```bash
#!/usr/bin/env bash
set -euo pipefail
ulimit -c 0
unset TOTK_INPUT_FIFO TOTK_INPUT_SCRIPT TOTK_FS_LOG TOTK_AUDIO_CAPTURE TOTK_INPUT_AUDIT
unset DM_NVN_TSV DM_NVN_TSV_CALLS DM_NVN_FRAMES DM_NVN_PROF DM_PRESENT_HZ DM_PRESENT_INTERVAL DM_DETCLOCK
unset TOTK_HEADLESS TOTK_SHOT LARECOMP_FNPROF
export XDG_DATA_HOME="$HOME/.local/share/ultratears/test-profiles/⟨test-profile⟩"
export TOTK_GYRO=1
export TOTK_LANG=zh-Hans TOTK_OPERATION_MODE=handheld TOTK_STEAMDECK_UI=1
export TOTK_FPS60=1 TOTK_REALTIME=1 TOTK_UNCAPPED=1 TOTK_UNCAPPED_HZ=60 TOTK_UNCAPPED_INTERVAL=1
export TOTK_CLOTH_REALTIME=1 TOTK_HIGHFPS_FIX=1 SDL_VIDEO_DRIVER=x11 SDL_VIDEODRIVER=x11
export SDL_GAMECONTROLLER_IGNORE_DEVICES_EXCEPT="0x045e/0xc0de"
export SDL_GAMECONTROLLERCONFIG_FILE=".../deck-experience-20261107/test-pad-mapping.txt"
exec "/home/deck/native-recomp/totk-native/releases/⟨build-id⟩/run.sh"
```

"继承上一个环境"是回归的最大来源，所以候选环境必须白名单式重建。手柄那行只认注入手柄、过滤 Deck 自带的，输入归因才干净。

启动侧把"轻拿轻放"从口头纪律变成内核级事实：bwrap（bubblewrap，Linux 命名空间沙箱工具）只读根 + 三个任务独占的可写挂载（case 目录、存档副本、扩展目录）：

```python
cmd=['bwrap','--ro-bind','/','/','--proc','/proc','--dev-bind','/dev','/dev',
     '--bind',str(B),str(B),
     '--tmpfs',str(Path.home()/'.local/share'),
     '--bind',str(state),str(original),
     '--bind',str(B/(g+'-extensions')),str(ext),
     '--tmpfs','/tmp','--ro-bind','/tmp/.X11-unix','/tmp/.X11-unix',
     '--die-with-parent',str(B/'scripts'/(g+'-candidate.sh'))]
```

`--ro-bind / /` 把整个 rootfs 读只，游戏写盘只落进这几个挂载点；游戏二进制一行没改，只是路径背后换成了测试副本。

存档断言是"文件内容哈希全等"，不是"目录没动"——游戏完全可以原地覆盖同一个文件：

```python
def inventory(root):
    rows={}
    for p in sorted(root.rglob('*')):
        if p.is_file():
            a=p.stat()
            with p.open('rb') as f:h=hashlib.file_digest(f,'sha256').hexdigest()
            z=p.stat();assert (a.st_size,a.st_mtime_ns)==(z.st_size,z.st_mtime_ns)
            rows[str(p)]=dict(size=a.st_size,sha256=h)
    return rows
```

hash 前后各 stat 一次，不等就报错不启动——宁可拒绝半状态基线。退出时全量对照会话开场基线：

```json
// totk-42/exit.json（真实产物）
{
  "returncode": -15,
  "ended": 1794232731.764613,
  "test_stop": true,
  "player_saves_unchanged": false
}
```

这条 `false` 真实发生过：长跑会话里游戏自己写了配置/缓存，硬断言抓了脏轮，不靠人眼复核。

全程留 `monitor.jsonl`（每秒一行：进程活否 + 余量），事后归因用。

## 反直觉的坑：60fps 开关设了，窗口标题写着 30.0

没有报错、没有崩溃、帧曲线还很稳——"能跑、没崩"是最容易骗过去的判据。遥操会话抓不了屏（gamescope 下 x11grab 只抓到黑图），帧率探针装在窗口标题里：

```c
snprintf(title, sizeof title, "UltraTears  |  game %.1f fps  |  shown %.1f fps",
         (game - game0) / s, (shown - shown0) / s);
SDL_SetWindowTitle(window, title);
```

标题走 X11 属性，SSH 里随时可读、跨会话存活。诊断现场就是它：标题 `30.0 fps`，env 里 `TOTK_FPS60=1`。标题、STATS 周期行、帧时 p50（31.91ms）三个独立来源交叉一致，才判"开关没生效"。根因线索落在源码注释里：60fps 依赖一套 60 FPS game patch 加实时帧步进，注释标着 *not ported yet*——env 变量生效了，下游补丁没跟上，引擎按 30 帧节奏推进游戏时间，所以稳在 30。

## UI 与美术资产：准原生的最后一公里

"能跑"和"准原生"之间差的是观感层，工作量不显山露水但占了不少：

- **按键提示**：按实际绑定手柄出图标，Xbox/Nintendo 两套布局都要对；
- **画面**：掌机分辨率下的马赛克/模糊逐项过，超分路径（FSR 各版本）在 4GB 显存约束下重新选型；
- **平台集成**：Steam 库条目、封面、控制器模板，做到游戏模式里"看起来就是个正常游戏"；
- **中文化**：支持简中的上游直接用，不支持的按资产管线补，不硬改字符串表。

## 成果：血源在 Deck 上 30-60fps 可用，三作共用一套验收标准

- 血源诅咒在 Deck 上 30-60fps 可用，三款里上游最成熟、验收直接落地的一款；
- 三作共用一套 63 条案例的验收标准，且标准本身被盲区审计过一轮；
- deck-experience 受控会话跑通：内核级隔离 + 存档硬断言 + 全程留痕。

前 → 后：三款游戏从"能在 Deck 上跑起来"，到按厂商移植水准逐项验收——准原生的观感层（按键提示、超分选型、平台集成、中文化）+ 可复现的验收电池，血源 30-60fps 可玩。

## 未闭环清单

| 事项 | 状态 |
| --- | --- |
| 中文配音（三款全量） | 仅调研：格式管线（XVAG/Wwise/FSB5）与 TTS 许可、法律边界已确认，实施未授权 |
| TOTK 60fps 解锁 | 未生效：窗口标题稳定 30.0 fps，帧时 p50 31.91ms |
| 战神 3 RADV 渲染损坏 | 等上游修复后收口 |
| hardware_validated | 三款均 false：代码合入、CI 绿、遥操会话跑通，都不等于"用户手里那台 Deck 上日常可玩" |

## 小结

三堵墙都是上游破的，本项目实际做的是验收对齐：遥操电池、63 条案例、存储硬断言。真正花时间的仍是文档不写的部分：Deck 只读 rootfs 逼着构建远端化、logind 的 cgroup 回收让 `setsid nohup` 失效、60fps 开关不生效还不报错。这也是"AI Agent 参与游戏工程"的样本：Agent 做源码审计、案例生成、遥操编排、归因；人把三关——目标（准原生）、纪律（Deck 轻拿轻放）、验收（读数字不读心跳）。

只留一条经验：**验收读运行时数字，不读进程活着。**

项目代码：总仓 [opsbsligm/nativedeck](https://github.com/opsbsligm/nativedeck)（证据链与验收纪律所在；战神 3 的 ultratears 移植落在 `ports/ultratears-linux`）。三款里唯一独立成仓的是异界锁链：[opsbsligm/astral-native](https://github.com/opsbsligm/astral-native)；血源走上游 bbport、以验收对齐为主，未单拆仓。

---

游戏名为专有名词保留；内网节点名、IP 与凭据引用均已脱敏；帧率与帧时取自当时遥操会话的现场记录，仅作口径参考。
