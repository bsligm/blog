---
title: 为串流开发重构 Moonlight：macOS 增强版的八周记录
date: 2026-10-19 21:00:00
updated: 2026-11-21 11:00:00
tags:
  - Moonlight
  - 串流
  - macOS
  - Swift
  - CI
categories:
  - 系统维护
  - 桌面维护
keywords: Moonlight, Sunshine, macOS, 串流, Xcode, CI, 单 runner, 对标, USB 重定向
description: "为串流开发 fork Moonlight 的 macOS 客户端做了八周增强：对标清单先于代码、壳层全做而核心层只动两处、单 runner 下 Terminated 15 超时的三层处理，以及 hardware_validated=false 的多机型验收边界。"
cover: /img/cover/moonlight-stream.jpg
toc: true
copyright: true
---

主力台式机双卡 + 高刷显示器，想接进多个房间，串流是首选，但现成的 macOS 客户端不够细：部分参数只能改 plist 配置文件、USB 重定向设备列表行为不符预期、崩溃后没有可回读的现场。方案对比下来结论先放出来：**Moonlight/Sunshine 依然是最成熟的串流方案**（Moonlight 是串流客户端，Sunshine 是串流端主机上的服务端），于是 fork 它的 macOS 客户端做增强（下称 Moonlight Enhanced），跑了八周。前 → 后一句话：**原版改配置 → 全参数 UI 可达**。

## 对标清单先于代码

动手前先把"增强"落到一张可勾选的清单上，每一项有明确的验收方式：

- 设置页：串流/视频/音频/输入/应用/设备六个分区，所有可调参数 UI 可达，不用改 plist；
- 视频：编码、分辨率、帧率、色彩（10-bit）逐项暴露，取值与 Sunshine 侧真实能力核对过；
- USB 重定向：设备列表实时刷新，断连自动回收，重连不串设备；
- 崩溃现场：崩溃前落盘一份会话摘要（分辨率/帧率/输入状态/最近事件），下次启动可回读。

清单的价值在于防止"顺手多加功能"——范围漂移比范围小更贵，小可以补，漂移要全量回归。它最终落成一张真机验收操作单：判据机器可读（逐行可 grep），"机器报告"与"人眼声明"两半缺一不可，缺一行就是 UNKNOWN；`hardware_validated` 是脚本退出码，不是口头声明。

崩溃现场那条的落法是"事件流即落盘"：每条事件一行 JSON，串行队列独占句柄，写一行 fsync 一行——崩溃停在任何一行，文件里都只有完整的行。代价是每事件一次 fsync，前提是事件为会话级（一局几次）不是帧级，诊断报告出机前过脱敏（MAC/UUID/家庭路径换占位符）。

USB 那条的实现是整条链路不信任旧状态：

```swift
private func scanBus() {
  guard MLUSBScanShouldStart(busScanInFlight, !pageIsVisible, true, false,
                            0, busScanGeneration, 0, 0) else { return }
  busScanInFlight = true
  let generation = busScanGeneration
  DispatchQueue.global(qos: .utility).async {
    var status = MLUSBBusSnapshotStatus.busUnreadable
    let devices = MLUSBBusSnapshotCopyDeviceIdentities(&status)
    DispatchQueue.main.async {
      busScanInFlight = false
      guard MLUSBScanMayPublish(!pageIsVisible, generation, busScanGeneration, true) else {
        if pageIsVisible { scanBus() }   // 切走又切回：旧结果丢弃，立即补扫
        return
      }
      rows = panel.acceptBusSnapshot(devices, status: status, hostIsPaired: hostIsPaired)
      panelRevision += 1
    }
  }
}
```

每次刷新给"这一轮"盖一个 generation 编号，后台线程回主线程时再核编号——扫描期间切走又切回，旧结果丢弃并立即补扫，防"拔了设备列表还在"。断连回收不靠事件回调，靠"快照里没出现 = 这一轮的行不再生成"；规则按 VID/PID 允许清单每次对全新快照重算，重连时同一设备回到同一规则，不串。

## 工程拆分：结论是壳层做全，核心层少动

Moonlight 客户端是跨平台 C++ 核心 + 各平台壳，增强原则一句话：**壳层做全，核心层少动**。

| 层 | 动作 | 理由 |
| --- | --- | --- |
| 设置页 | 六分区全部用原生 Swift 重做 | 原版跨平台组件，控件行为与 macOS 不贴合 |
| 核心 C++ | 只动两处：USB 事件回调粒度、崩溃摘要落盘时机 | 每动一行，跨平台回归代价重付一遍 |
| 打包 | Xcode 工程 + 外部依赖 xcframework，开发期 ad-hoc 签名，出包前收紧 | — |

有两个体现取舍的细节。第一个：分区枚举的 raw value 不连续：

```swift
enum SettingsPaneType: Int, CaseIterable {
  case stream = 0
  case video = 1
  case audio = 5
  case input = 2
  case app = 3
  case legacy = 4
  case devices = 6
  static var allCases: [SettingsPaneType] {
    [.stream, .video, .audio, .input, .app, .devices]
  }
}
```

0/1/5/2/3/6 不是笔误：选中项会持久化到用户 defaults，重排编号等于把老用户"上次打开的页"挪到别的分区；新增"设备"分区取下一个空闲值 6，`allCases` 显式列展示顺序——存储值与展示顺序解耦。

第二个：设置页六分区标签栏用系统原生分段控件 + tabs 语义，不自绘玻璃拟态。`role = .tabs` 一行是验收红线——浅色胶囊外观、选中项高亮全由系统画。难点在两层守卫：macOS 26 SDK 根本没有 `role` 这个符号，`#available` 挡不住编译，得再套一层编译期开关 `#if`；跑在旧系统上时 `#available(macOS 27.0, *)` 再挡一次运行期：

```swift
public func makeNSView(context: Context) -> NSSegmentedControl {
  let control = NSSegmentedControl()
  control.segmentStyle = .rounded
  control.trackingMode = .selectOne
#if ML_APPKIT_TABS_ROLE
  if #available(macOS 27.0, *) {
    control.role = .tabs
  }
#endif
  control.target = context.coordinator
}
```

自绘好看，但可访问性、键盘导航、高亮状态全要自己保——**在"高频进入但停留短"的设置页，系统控件的隐性价值大于自绘的视觉价值**。这条写进项目红线：控件不许换，CI audit 脚本对着源码字面量盯，不靠人记。

## 反直觉的坑：Terminated: 15 不是代码问题

CI（自建 GitLab 上的自动化构建与测试流水线）超时表现为 `Terminated: 15`，看起来像代码问题，实际是排队 + 单 runner 的并发瓶颈：**错误信息指向执行，根因却在调度**。结构性约束：Xcode 构建只能在 macOS runner 上跑，家里只有一台。审计 job 单跑 140 秒左右，但和变异测试电池、安全 job 共用一台 8 核 runner 时实际跑过 1803 秒、被旧 30 分钟线杀掉——这就是 `Terminated: 15` 的真实长相。

处理分三层：

1. **重试先于归因**：`Terminated: 15` 的 job 单跑一次，过了就记"单 runner 并发"，不再对着 diff 找原因；
2. **rules 层防同 SHA 双流水线**：一次 push 会同时生成 push 和 MR 两条流水线，十五个安全 job 为一次裁决排队、Mac job 全部空等（pipeline 791/792 就是这条的证据）；
3. **超时线按实测写、注释里留证据链**：构建 30 分钟线不动，审计类按实测单独放宽：

```yaml
audit:python:
  stage: lint
  tags: [macos]
  # pipeline 647: ~140s alone vs 1803s (killed at the old 30m ceiling)
  timeout: 60 minutes
workflow:
  rules: &pipeline_rules
    # open merge request => judged by the MR pipeline, not this push one
    - if: '$CI_PIPELINE_SOURCE == "push" && $CI_OPEN_MERGE_REQUESTS'
      when: never
```

规则本体就一条：分支挂着 open MR 时，push 流水线直接不建。不写证据链，超时线就只是拍出来的数：60 分钟是 pipeline 647 买回来的。最重的变异测试电池（改坏一小块代码、看测试抓不抓得住）单独 200 分钟线加 `resource_group` 串联，不和它要保护的门禁抢核。

## 出包侧：版本号只认构建产物

版本号只认构建产物的 Info.plist、不认 CI 变量，DMG 固定命名 `Moonlight-<版本>-build<构建号>.dmg`：

```bash
# Single source of truth: version info comes from the built app's Info.plist.
VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$APP_PATH/Contents/Info.plist")
BUILD_NUM=$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$APP_PATH/Contents/Info.plist")
DMG_NAME="Moonlight-${VERSION}-build${BUILD_NUM}.dmg"
bash "${SCRIPT_DIR}/codesign-bundle.sh" "$STAGING_DIR/$APP_NAME.app"
```

两点：`BUILD_NUMBER`/`GIT_SHA` 走命令行参数而不是 xcconfig（xcodebuild 不跑 scheme PreActions、解析期拿不到派生目录，踩过"CI 静默回退、制品版本漂移"之后的修法）；签名做在 staging 副本上且在安装语言表之后——先签名再塞文件，签名覆盖范围就不完整。

## 两条验收线：串流能用，不等于开发机可用

最花时间的不是功能，是分清楚两条验收线：**串流可用**（真实桌面连上、10-bit 色彩正确、USB 重定向在真实设备上验证、断连重连无残留）与**开发机可用**（崩溃摘要可回读、设置项改动能持久化、打包签名链完整）。前者服务"今晚看电影"，后者服务"继续开发"。

八周结束时：对标清单全部勾完、两条线都过，增强版在自己桌面上日常使用；**但第二台 Mac（不同芯片代际）的实机验收没做**，按惯例标 `hardware_validated=false`。CI 全绿 + 包能装 + 自己机器好用，不等于"所有 Mac 上都好用"。

## 与算力池的联动：串流占卡时，知识库推理是暂停的

这台被串流的台式机，同时也是 [WeKnora 推理池](/2026/10/11/%E6%8A%8A%E5%AE%B6%E9%87%8C%E7%9A%84%E7%AE%97%E5%8A%9B%E5%85%A8%E6%8E%8F%E5%87%BA%E6%9D%A5WeKnora%E6%A8%A1%E5%9E%8B%E4%BF%9D%E9%9A%9C%E5%AE%9E%E5%BD%95/) 的长/短对话池——WeKnora 是自托管的语义知识库，模型推理就在这台机器的两张卡上。串流开发期要长时间占卡，走"暂停序列"：WinRM 停模型服务 → 确认双卡占用归零 → 串流开发 → 恢复序列（先起模型验端点，再放路由），两条线共享同一套暂停/恢复脚本。边界要如实说：**串流侧长时间占卡时，WeKnora 的推理是暂停的**，是"用完恢复"，不是"两边同时可用"。

## 成果：八周后 Moonlight Enhanced 已在日常使用，对标清单 0 漂移

- 六分区全部参数 UI 可达、不改 plist；USB 设备列表实时刷新、断连自动回收、重连不串设备；崩溃前落盘会话摘要，下次启动可回读；
- 八周对标清单全部勾完、0 漂移——两次想加"手势映射"的冲动都因不在清单上被压住，省掉的是全量回归；
- "壳层全做、核心层只动两处"守住上游合入的可能性：核心 C++ 每少动一行，跨平台回归代价少付一遍；
- 与 WeKnora 算力线共享同一套暂停/恢复脚本，串流开发期占卡不需要为它单写一套流程。

前 → 后：原版部分参数改 plist、USB 列表行为不符预期、崩溃后无现场；增强版全参数 UI 可达、设备列表实时刷新且断连回收、崩溃摘要可回读。

## 未闭环清单

| 事项 | 状态 |
| --- | --- |
| 第二台 Mac（不同芯片代际）实机验收 | 未做，`hardware_validated=false` |
| 上游合入评估 | 未做，差异收敛回干净 diff 集后评估 |
| GPU 释放反向保障 WeKnora | 未做，当前只有暂停/恢复序列，无同时可用性保障 |

上游合不进去的话，按"下游 fork + 季度重基"节奏维护。

## 小结

功能本身不是难点，真正花时间的仍是文档不写的部分：单 runner 下 `Terminated: 15` 把调度瓶颈伪装成代码问题、"串流能用"和"开发机可用"是两条独立的验收线、自己机器好用不等于多机型验收。

只留一条经验：**增强型 fork 先定对标清单，`hardware_validated` 按机型口径写，CI 全绿不等于多机型可用。**

---

版本号、CI 时长与 runner 配置取自当时现场记录；未覆盖的机型行为以验收后口径为准。
