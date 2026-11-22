---
title: Steam Deck 原生移植三部曲：一款 Switch 两款 PS4 的准原生之路
date: 2026-11-06 21:00:00
updated: 2026-11-22 21:00:00
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
description: 一 Switch 两 PS4（异界锁链 / 战神 3 Remastered / 血源诅咒）搬上 Steam Deck 做"准原生"：三堵墙各拆一遍，Deck 是验收场不是工地——candidate 环境白名单重建、bwrap 只读根、存档 sha256 硬断言，以及 60fps 开关不生效的诊断路径。
cover: /img/cover/deck-trilogy.jpg
toc: true
copyright: true
---

想在 Steam Deck 上原生玩 Switch 游戏，不用模拟器、不靠运行时模拟，怎么做到？路线只有三条：模拟器（Ryujinx 这类，快但兼容性看天）、兼容层（转译，稳但每帧交税）、真·原生——AOT 移植，把 AArch64 代码静态重编译成本机 x86-64 原生码，慢但体验上限最高。

我押第三条：把三款游戏的 PC 移植项目搬上 Deck——异界锁链 [Switch]、战神 3 Remastered [PS4]、血源诅咒 [PS4]。目标是厂商原生移植的水准，不是"能跑就行"。定位先写死：**个人使用，不分发游戏资产**。

技术口径先说清，避免标题党：**AOT 重编译只发生在 Switch 那一关**——AArch64 指令集不同，必须静态重译成 x86-64。两款 PS4 Remastered 本来就是 x86-64，CPU 关天然成立，它们的战场在 GPU 渲染与平台集成（Vulkan 后端 + Deck 适配），不经过重编译器。所以"准原生"对三款是三条不同的路，本文的 AOT 管线（LLVM lift、SPIR-V 转译）主要写给异界锁链，PS4 两作的部分偏验收与集成。

## 三堵墙：挡的是架构差，不是单点难度

Switch 是 AArch64 + Maxwell GPU + Horizon 系统服务（Switch 的系统服务层，音频/输入/NFC 都走它），Deck 是 x86-64 + Vulkan（AMD 开源驱动 RADV），直接搬有三堵墙：

| 墙 | 问题 | 破法 |
| --- | --- | --- |
| A：CPU 指令集 | AArch64 代码跑不了 x86-64 | LLVM AOT 重编译，把 Switch 二进制静态重译成 x86-64，运行时零解释 |
| B：GPU 着色器 | Maxwell SASS 不是 Vulkan | SASS → SPIR-V（复用 Ryujinx 的转译器）→ Vulkan，跳过 Metal 那一步 |
| C：系统服务 | Horizon 的服务调用（音频、输入、NFC） | 在宿主二进制里 HLE 重新实现，不搬 HOS 内核 |

结论：这条路线不需要 HOS 内核、不需要 Hypervisor、不需要 TrustZone。早期调研里"HOS 上 x86 不可能"的判断被推翻之后我才敢立项。三堵墙都有活跃的参考实现（ScarletNX 通用管线、totk-recomp 针对塞尔达系列），不是从零造轮子，做的是把上游成果对齐到 Deck 的验收标准。

AOT 构建侧的落法是"函数发现 → 逐函数 lift 成 C → 宿主 clang 编译"（非 QEMU、非动态翻译）。以 ultratears 1.4.3 的 Linux 移植为例，构建入口在 `tools/prepare_linux_game.py`，分三步走：

```powershell
python3 tools/prepare_linux_game.py --dump /absolute/local-dump --data /absolute/project-data --stage check
python3 tools/prepare_linux_game.py --dump /absolute/local-dump --data /absolute/project-data --stage romfs
python3 tools/prepare_linux_game.py --dump /absolute/local-dump --data /absolute/project-data --stage lift
python3 tools/build_linux.py --target game --exefs /absolute/local-dump/exefs --generated /absolute/project-data/generated --out /absolute/game-build --jobs 1
```

上游口径（8 核）：lift 约 2 分钟，compile 约 15 分钟。按指令量切 chunk，二次构建只重编变更部分，运行期零解释开销，代价全摊在构建里。实际跑下来的瓶颈不是 CPU 而是磁盘——30 万文件的 romfs 打包占了一大截。

GPU 墙的大头在对齐语义：Maxwell 与 Vulkan 的行为差逐条建表，每个可见的坏画面都能回溯到一条语义差。着色器转译器不重造，复用 Ryujinx 的 xlate 管线再叠自己的 Linux 路径补丁（`tools/run_ryujinx_xlate.py`），28667 个真实游戏着色器全部走这条管线转换。

## 上游成熟度：工作量分布在上游，验收标准在自己

三款上游成熟度差异很大，直接决定工作量分布：

- **血源诅咒**（bbport 0.7 experimental）：上游三款中最成熟，原生 x86-64 执行 + 自研 Vulkan 渲染器，Deck 上 30-60fps 可玩；0.7 为实验版，上游 issue 记录有 0.51→0.7 的性能退化，“可玩”不等于“无退化”，工作重心在验收和平台集成；
- **异界锁链**（astral-chain-pc-recomp）：LLVM 静态重编译管线完整，但上游明说"尚未针对 4GB VRAM 和 Deck 优化"，这块要自己补；
- **战神 3**（SpartanPort）：上游在 Deck/RADV 上有已知的渲染损坏，动手前先确认新版是否修掉，否则搬过去也是坏的。

拆开理由是验收标准三作共用一套，不是各自"能跑"。97 项验收矩阵（18+63+16），外加一轮盲区审计把案例集本身也审了一遍——验收标准也会过时，它自己也需要验收。每条案例从 `not_run` 起步，证据挂上才推进："看起来覆盖了"不算覆盖。

## Deck 是验收场，不是工地

这个项目最容易搞砸的地方是"在 Deck 上又改又测"：rootfs 只读（steamos-readonly）、系统盘小、存档珍贵，重活在 Deck 上做等于边开飞机边换发动机。

纪律定死一条：构建、AOT、迭代全在远端 Runner 上做；Deck 只做最终验收，且验收过程必须轻拿轻放。落地成 `tools/deck_pool_ab.py`（在 totk-native 仓里），每次在 Deck 上跑一轮受控会话：

- 启动走 `systemd-run --user` 包一层，SSH 断了进程不死（`setsid nohup` 挡不住 logind 的 cgroup 回收，实测出来的）；
- 环境固化在一个 candidate 脚本里：语言、陀螺、手柄过滤、帧率开关全部显式声明，不接受"上次好像是这么设的"；
- 存储保护：bwrap 只读根 + 任务独占的精确挂载，可用空间低于 2 GiB 直接拒绝启动，会话结束写 `result.json`，其中 `player_saves_unchanged` 是硬断言——测完存档没被动过，这轮测试才算干净。

候选环境按白名单式重建：先 unset 掉上一轮可能残留的诊断变量，再显式声明这一轮要用的。上次为了抓帧开的 `DM_NVN_TSV` 忘了关，这一轮的数字就全带毒：

```bash
#!/usr/bin/env bash
set -euo pipefail
# 诊断/遥操类：全 unset，要开就这一轮显式开
ulimit -c 0
unset TOTK_INPUT_FIFO TOTK_INPUT_SCRIPT TOTK_INPUT_AUDIT TOTK_FS_LOG
unset TOTK_AUDIO_CAPTURE TOTK_HEADLESS TOTK_SHOT TOTK_SNAP
unset DM_NVN_TSV DM_NVN_TSV_CALLS DM_NVN_FRAMES DM_NVN_PROF DM_NVN_LIFELOG
# 这一轮要验证的行为：逐条显式声明
export XDG_DATA_HOME="$HOME/.local/share/ultratears/test-profiles/⟨test-profile⟩"   # 独立 profile，不碰正式存档
export TOTK_GYRO=1
export TOTK_LANG=zh-Hans TOTK_OPERATION_MODE=handheld TOTK_STEAMDECK_UI=1
export TOTK_FPS60=1 TOTK_REALTIME=1
export SDL_VIDEO_DRIVER=x11 SDL_VIDEODRIVER=x11
export SDL_GAMECONTROLLER_IGNORE_DEVICES_EXCEPT="0x045e/0xc0de"
export SDL_GAMECONTROLLERCONFIG_FILE=".../deck-experience-20261107/test-pad-mapping.txt"
exec "/home/deck/native-recomp/totk-native/releases/⟨build-id⟩/run.sh"   # 前作 TOTK 构建；遥操现场取自该会话
```

手柄那行只认注入手柄、过滤 Deck 自带的，输入归因才干净。每个 `TOTK_*` / `DM_NVN_*` 都能 clone `totk-native` 在 `src/` 里 grep 到，不是凭记忆写的。

启动侧把"轻拿轻放"从口头纪律变成内核级事实：bwrap（bubblewrap，Linux 命名空间沙箱工具）只读根 + 本 case 目录独占可写，存档是拷进来的测试副本——跑坏也不心疼：

```python
# totk-native/tools/deck_pool_ab.py:424
command = ['bwrap', '--ro-bind', '/', '/', '--proc', '/proc', '--dev-bind', '/dev', '/dev',
           '--bind', str(case), str(case), '--tmpfs', '/tmp',
           '--ro-bind', '/tmp/.X11-unix', '/tmp/.X11-unix', '--die-with-parent', str(release / 'run.sh')]
```

`--ro-bind / /` 把整个 rootfs 读只，游戏写盘只落进这几个挂载点；游戏二进制一行没改，只是路径背后换成了测试副本。

存档断言是"文件内容哈希全等"，不是"目录没动"——游戏完全可以原地覆盖同一个文件：

```python
# totk-native/tools/deck_pool_ab.py:43
def inventory(root):
    """Size and content of every regular file under root, with no symlink allowed anywhere."""
    rows = {}
    for path in sorted(root.rglob('*')):
        if path.is_file():
            assert not path.is_symlink(), path
            with path.open('rb') as stream:
                rows[str(path)] = dict(size=path.stat().st_size,
                                       sha256=hashlib.file_digest(stream, 'sha256').hexdigest())
    return rows
```

跑前拍一张 inventory，跑完再拍一张，逐文件 sha256 对照。不等就报错，这一轮不算数。退出时写 `result.json`（真实产物，`totk-42` 会话）：

```json
# totk-native/tools/deck_pool_ab.py:511
{
  "returncode": -15,
  "elapsed_seconds": 301.4,
  "requested_stop": true,
  "player_saves_unchanged": false,
  "player_save_files": 15,
  "screenshot_exists": true,
  "focus_restored": true,
  "hardware_validated": false
}
```

`player_saves_unchanged: false` 真实发生过：长跑会话里游戏自己写了配置/缓存，硬断言抓了脏轮，不靠人眼复核。

全程写 `foreground-samples.jsonl`（每秒一行：进程活否 + 余量），事后归因用。

## 反直觉的坑：60fps 开关设了，窗口标题写着 30.0

没有报错、没有崩溃、帧曲线还很稳——"能跑、没崩"是最容易骗过去的判据。遥操会话抓不了屏（gamescope 下 x11grab 只抓到黑图），帧率探针装在窗口标题里：

```c
# totk-native/src/host/window_sdl.c:195
snprintf(title, sizeof title, "UltraTears  |  game %.1f fps  |  shown %.1f fps",
         (game - game0) / s, (shown - shown0) / s);
SDL_SetWindowTitle(window, title);
```

标题走 X11 属性，SSH 里随时可读、跨会话存活。诊断现场就是它：标题稳定 `30.0 fps`，env 里 `TOTK_FPS60=1`。标题、STATS 周期行、帧时 p50 三个独立来源交叉一致，才判"开关没生效"。

根因：Linux 移植漏了帧控制器。上游 Windows 版有七处帧控制器指令 + 七处计时指令 + 四处布料/头发更新点，搬 Linux 时没搬过来，env 变量生效了，下游补丁没跟上，引擎按 30 帧节奏推进游戏时间。后来在 `ports/ultratears-linux/highfps/` 补了一套计时适配：`nd_totk_timing.c` 用已完成画面的单调时间算五样本平均帧长，逐指令精确匹配后重新生成五个候选编译单元，原函数结果逐字节校验一致才允许替换。装上去之后 60fps 成为上限——但 README 里写得很清楚：安装验证和玩家测试分开，不保证所有场景到 60。

## UI 与美术资产：准原生的最后一公里

能跑和准原生之间差的是观感层，不显山露水但占了不少：

- **按键提示**：按实际绑定手柄出图标，Xbox/Nintendo 两套布局都要对；
- **画面**：掌机分辨率下的马赛克/模糊逐项过，超分路径（FSR 各版本）在 4GB 显存约束下重新选型；
- **平台集成**：Steam 库条目、封面、控制器模板，做到游戏模式里"看起来就是个正常游戏"；
- **中文化**：支持简中的上游直接用，不支持的按资产管线补，不硬改字符串表。

## 成果

- 血源诅咒（bbport 0.7 experimental）在 Deck 上 30-60fps 可玩，三款里上游最成熟、验收直接落地的一款；上游 issue 记录有 0.51→0.7 的性能退化，“可玩”不等于“无退化”；
- 三作共用一套 97 项验收矩阵（18+63+16），标准本身被盲区审计过一轮；
- 受控会话跑通：bwrap 内核级隔离 + 存档 sha256 硬断言 + 全程留痕，可复现。

三款从"能在 Deck 上跑起来"到按厂商移植水准逐项验收：观感层（按键提示、超分选型、平台集成、中文化）+ 可复现的验收电池，血源 30-60fps 可玩。

## 未闭环

| 事项 | 状态 |
| --- | --- |
| 中文配音（三款全量） | 仅调研：格式管线（XVAG/Wwise/FSB5）与 TTS 许可、法律边界已确认，实施未授权 |
| TOTK 60fps 全场景验收 | 计时适配已装、60fps 为上限；单场景已验证，全游戏逐场景 + 长期稳定性未闭环（修复前现场：标题稳定 30.0 fps，帧时 p50 31.91ms） |
| 血源 bbport 0.7 → 正式版 | 等上游发布；issue 有 0.51→0.7 性能退化 |
| 战神 3 RADV 渲染损坏 | 等上游修复后收口 |
| hardware_validated | 三款均 false：代码合入、CI 绿、遥操会话跑通，都不等于"用户手里那台 Deck 上日常可玩" |

## 最后

三堵墙都是上游破的，我实际做的是验收对齐：受控会话、97 项矩阵、存储硬断言。真正花时间的仍是文档不写的部分：Deck 只读 rootfs 逼着构建远端化、logind 的 cgroup 回收让 `setsid nohup` 失效、60fps 开关不生效还不报错。

一条经验：验收读运行时数字，不读进程活着。

项目代码：总仓 [opsbsligm/nativedeck](https://github.com/opsbsligm/nativedeck)——`ports/ultratears-linux` 为王国之泪 1.4.3 的 AOT 移植管线（含 60fps 计时适配 `highfps/`），`ports/totk-recomp-linux` 为 TOTK 1.0.0 已安装内容的输入路径（免重建 XCI）；前作塞尔达两作独立成仓：[opsbsligm/botw-native](https://github.com/opsbsligm/botw-native)（旷野之息）、[opsbsligm/totk-native](https://github.com/opsbsligm/totk-native)（王国之泪，验收电池 `tools/deck_pool_ab.py` 在此仓）。本三部曲中唯一独立成仓的是异界锁链：[opsbsligm/astral-native](https://github.com/opsbsligm/astral-native)（上游 captainj-sparrow/astral-chain-pc-recomp，本地固定 1.5.0）；战神 3 走上游 [SpartanPort](https://github.com/FelipePrado0/SpartanPort)（固定 windows-v3.1.0）、血源走上游 [bbport](https://github.com/deadinside28/bloodborne_pc)（0.7 experimental），均尚未拆仓。

---

游戏名为专有名词保留；内网节点名、IP 与凭据引用均已脱敏；帧率与帧时取自当时遥操会话的现场记录，仅作口径参考。代码引用均可在对应仓库 clone 后逐行核对。
