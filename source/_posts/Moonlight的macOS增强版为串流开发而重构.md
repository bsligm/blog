---
title: 为串流开发重构 Moonlight：macOS 增强版的八周记录
date: 2026-10-19 21:00:00
updated: 2026-11-20 20:30:00
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
description: "为串流开发 fork Moonlight 的 macOS 客户端做了八周增强：对标清单怎么先于代码、Swift 壳层全做而核心层只动两处的拆分原则、单 macOS runner 下 Terminated 15 超时的三层处理，以及 hardware_validated=false 这条多机型验收边界。"
cover: /img/cover/moonlight-stream.jpg
toc: true
copyright: true
---

主力台式机是双卡 + 高刷显示器，客厅和书房都想接它。方案对比下来结论先放出来：**Moonlight/Sunshine 依然是最成熟的串流方案，但原版 macOS 客户端不够用**——设置项不够细（部分参数只能改配置文件）、USB 重定向的设备列表行为不符合预期、崩溃时没有可回读的现场。于是 fork 了 Moonlight 的 macOS 客户端做增强（下称 Moonlight Enhanced），跑了八周。这篇按"为什么改、改成什么、怎么验证"三段记。

## 对标清单先于代码

动手前先把"增强"落到一张可勾选的清单上，每一项有明确的验收方式：

- 设置页：串流/视频/音频/输入/应用/设备六个分区，所有可调参数 UI 可达，不用改 plist；
- 视频：编码、分辨率、帧率、色彩（10-bit）逐项暴露，取值与 Sunshine 侧真实能力核对过；
- USB 重定向：设备列表实时刷新，断连自动回收，重连不串设备；
- 崩溃现场：崩溃前落盘一份会话摘要（分辨率/帧率/输入状态/最近事件），下次启动可回读。

清单的价值在于**防止"顺手多加功能"**：八周里出现过两次想加"手势映射"的冲动，都因为不在清单上而压住。拆开理由是：范围漂移比范围小更贵，小可以补，漂移要全量回归。

USB 重定向那条验收（断连回收、重连不串设备）的实现，是整条链路不信任旧状态：

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

每次刷新给"这一轮"盖一个 generation 编号，后台线程读总线快照回主线程时再核编号：用户扫描期间切走又切回，旧结果直接丢弃并立即补扫，防"拔了设备列表还在"。断连回收不靠事件回调，靠"快照里没出现 = 这一轮的行就不再生成"；规则匹配每次对全新快照重算，重连时同一设备自然回到同一规则，不串。

## 工程拆分：结论是壳层做全，核心层少动

Moonlight 客户端是跨平台 C++ 核心 + 各平台壳。增强原则一句话：**壳层做全，核心层少动**。

| 层 | 动作 | 理由 |
| --- | --- | --- |
| 设置页 | 六分区全部用原生 Swift 重做 | 原版是跨平台组件，控件行为和 macOS 不贴合 |
| 核心 C++ | 只动两处：USB 设备事件回调粒度、崩溃摘要落盘时机 | 每动一行，跨平台回归的代价都要重付一遍 |
| 打包 | Xcode 工程 + 外部依赖 xcframework，开发期 ad-hoc 签名，出包前统一收紧 | — |

分区重做里有个体现取舍的细节：分区枚举的 raw value 是不连续的：

```swift
enum SettingsPaneType: Int, CaseIterable {
  // NOTE: Raw values are pinned to keep backward compatibility with persisted selection.
  case stream = 0
  case video = 1
  case audio = 5
  case input = 2
  case app = 3
  case legacy = 4
  case devices = 6  // 下一个空闲值；重排编号等于把老用户的存档选择挪到别的页

  static var allCases: [SettingsPaneType] {
    [.stream, .video, .audio, .input, .app, .devices]
  }
}
```

0/1/5/2/3/6 不是笔误：选中项会持久化到用户 defaults，重排编号等于把老用户"上次打开的页"挪到别的分区。新增"设备"分区只取下一个空闲值 6，`allCases` 再显式列一次展示顺序——"存储值"和"展示顺序"解耦，一次代价换掉持久值迁移表。

一个值得记的控件决策：设置页六分区标签栏最终用系统原生分段控件 + tabs 语义，而不是自绘的玻璃拟态标签。自绘好看，但可访问性、键盘导航、高亮状态全要自己保——**在设置页这种"高频进入但停留短"的界面上，系统控件的隐性价值大于自绘的视觉价值**。这条写进了项目红线：这个控件不许换。

## 反直觉的坑：Terminated: 15 不是代码问题

CI 超时表现为 `Terminated: 15`，看起来像代码问题，实际是排队 + 单 runner 的并发瓶颈。反直觉的地方是：**错误信息指向执行，根因却在调度**，对着 diff 找原因会找很久。结构性约束是：macOS 的 Xcode 构建只能在 macOS runner 上跑，家里只有一台，任意时刻最多一个 macOS 构建在跑，其余排队。审计 job 单跑 140 秒左右，但和变异测试电池、安全 job 共用一台 8 核 runner 时，它实际跑过 1803 秒、被旧 30 分钟线杀掉——这就是 `Terminated: 15` 的真实长相。

处理分三层：

1. **重试先于归因**：`Terminated: 15` 的 job 单跑一次，过了就记"单 runner 并发"，不再对着 diff 找原因。这条省掉了很多伪排查；
2. **rules 层防同 SHA 双流水线**：一次 push 会同时生成 push 流水线和 MR 流水线，pipeline 791/792 就是这条的证据——十五个安全 job 为一次裁决排队，Mac job 全部空等；docs-only 按路径过滤是后续优化，尚未入库；
3. **超时线按实测写、注释里留证据链**：构建 30 分钟线不动，审计类按实测单独放宽：

```yaml
audit:python:
  stage: lint
  tags: [macos]
  cache: {}
  # Measured ~140s alone; pipeline 647 recorded 1803s (killed at the old
  # 30m ceiling) while the mutation battery and security jobs shared the
  # 8-core runner.
  timeout: 60 minutes

workflow:
  rules: &pipeline_rules
    # A branch with an open merge request is judged by that merge request,
    # not by its own push pipeline. Pipeline 791 and 792 are the evidence:
    # one push made both, fifteen security jobs queued for one verdict.
    - if: '$CI_PIPELINE_SOURCE == "push" && $CI_OPEN_MERGE_REQUESTS'
      when: never
    - if: '$CI_PIPELINE_SOURCE == "push"'
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    - if: '$CI_PIPELINE_SOURCE == "web"'
```

不写证据链，超时线就只是拍出来的数：60 分钟是 pipeline 647 买回来的，不是嫌 15 分钟紧。最重的变异测试电池单独 200 分钟线加 `resource_group` 串联，不和它要保护的门禁抢核。

## 两条验收线：串流能用，不等于开发机可用

这个项目最花时间的不是功能，是分清楚两条验收线：

- **串流可用**：真实桌面连上、10-bit 色彩正确、USB 重定向在真实设备（手柄、摄像头）上验证、断连重连无残留。全部过完才算"能用"；
- **开发机可用**：崩溃摘要可回读、设置项改动能持久化、打包签名链完整。这条线服务于"继续开发"，不服务于"今晚看电影"。

八周结束时的状态：对标清单全部勾完，两条线都过，增强版在自己的桌面上日常使用；**但在第二台 Mac（不同芯片代际）上的实机验收没做**，按惯例标 `hardware_validated=false`（对多机型而言）。CI 全绿 + 包能装 + 自己机器好用，这三件事加起来也不等于"所有 Mac 上都好用"，这条边界要写清楚，不然交付物会被高估。

## 与算力池的联动：GPU 释放暂不保障 WeKnora

这台被串流的台式机，同时也是 [WeKnora 推理池](/2026/10/11/%E6%8A%8A%E5%AE%B6%E9%87%8C%E7%9A%84%E7%AE%97%E5%8A%9B%E5%85%A8%E6%8E%8F%E5%87%BA%E6%9D%A5WeKnora%E6%A8%A1%E5%9E%8B%E4%BF%9D%E9%9A%9C%E5%AE%9E%E5%BD%95/) 的长/短对话池。串流开发期要长时间占卡，走的是"暂停序列"：WinRM 停模型服务 → 确认双卡占用归零 → 串流开发 → 恢复序列（先起模型验端点，再放路由）。两条线共享同一套暂停/恢复脚本，没有为串流单独写一套。

这个联动目前的边界要如实说：**串流侧长时间占卡时，WeKnora 的推理能力是暂停的，GPU 释放策略没有反向保障 WeKnora**——是"用完恢复"，不是"两边同时可用"。

## 成果：八周后 Moonlight Enhanced 已在日常使用，对标清单 0 漂移

- 设置页六分区（串流/视频/音频/输入/应用/设备）全部参数 UI 可达、不改 plist；USB 重定向设备列表实时刷新、断连自动回收、重连不串设备；崩溃前落盘会话摘要（分辨率/帧率/输入状态/最近事件），下次启动可回读；
- 八周对标清单全部勾完、0 漂移——两次想加"手势映射"的冲动都因不在清单上被压住，省掉的是全量回归；
- "壳层全做、核心层只动两处"的拆分守住了上游合入的可能性：核心 C++ 每少动一行，跨平台回归的代价就少付一遍；
- 与 WeKnora 算力线共享同一套暂停/恢复脚本，串流开发期占卡不需要为它单写一套流程。

## 未闭环清单

| 事项 | 状态 |
| --- | --- |
| 第二台 Mac（不同芯片代际）实机验收 | 未做，`hardware_validated=false` |
| 上游合入评估 | 未做，差异收敛回干净 diff 集后评估 |
| GPU 释放反向保障 WeKnora | 未做，当前只有暂停/恢复序列，无同时可用性保障 |

上游合不进去的话，按"下游 fork + 季度重基"的节奏维护。

## 小结

八周下来，功能本身不是难点：对标清单、壳层重构、CI 处理，都有章法。真正花时间的仍是文档不写的部分：单 runner 下 `Terminated: 15` 把调度瓶颈伪装成代码问题、"串流能用"和"开发机可用"是两条独立的验收线、自己机器好用不等于多机型验收。

只留一条经验：**增强型 fork 先定对标清单，`hardware_validated` 按机型口径写，CI 全绿不等于多机型可用。**

---

版本号、CI 时长与 runner 配置取自当时现场记录；未覆盖的机型行为以验收后口径为准。
