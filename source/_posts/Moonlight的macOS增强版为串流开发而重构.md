---
title: Moonlight macOS 增强实录：设备列表的异步竞态怎么修
date: 2026-10-19 21:00:00
updated: 2026-11-23 22:35:00
tags:
  - Moonlight
  - 串流
  - macOS
  - Swift
  - CI
categories:
  - 系统维护
  - 桌面维护
keywords: Moonlight, Sunshine, macOS, 串流, Xcode, CI, USB 设备诊断
description: "从切页拔插后设备列表偶尔回退开始，追到 Moonlight macOS 的两个异步数据源。记录如何淘汰旧结果，以及设置迁移、CI、帧时间采样和公开发行怎么核验。"
cover: /img/cover/moonlight-stream.jpg
toc: true
copyright: true
---

我在 Mac 上调串流时，遇到过一个不容易重现的现象。设备已经拔掉，切回设置页却还能看到它。列表再刷一次又对了。这样的故障多拔插几次未必能说明问题，关键要看扫描期间页面状态何时变了，回调为什么还能更新界面。我保留台式机端的 Sunshine 服务，从客户端设备页追这条时序。当时也在做原生设置和发行，所以得把同一处改动带过配置回读、实机诊断和打包。

Sunshine 在台式机上捕获和编码画面，Mac 上的 Moonlight 接收、解码并显示，再把键盘和手柄输入送回去。改客户端设置时，得分清哪些选项会在开始串流时与主机协商，哪些只会改变 Mac 本机的显示或输入行为。比如提高客户端的目标帧率，需要主机实际按相应速率出帧，Mac 本地的设备列表则由 macOS 枚举。

## 为什么设备已经拔了，列表还能回到旧状态

设备扫描最容易在切页时出错。下面用简化代码说明时序，省略了后台扫描和界面数据的细节：

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

这里的 generation 是页面当前这轮扫描的编号。设想第一次扫描后台还在跑，用户拔了设备、切到别页又切回来。第一次扫描晚到的结果如果直接覆盖界面，就会把旧设备重新画回来。主线程回调先核对页面状态和编号，过期结果丢弃。页面仍可见时再补扫，让界面从新的总线快照生成。VID/PID 代表厂商和产品类型，可用于匹配规则，同型号设备的唯一身份还得看单独的标识。实际实现见 [设备页扫描](https://github.com/opsbsligm/moonlight-macos-enhanced/blob/cc6aa76f1459/Limelight/macOS/ViewControllers/SettingsDevicesPane.swift#L639)。

设备页其实收两种异步结果。总线扫描读的是这台 Mac 的设备。远端主机检查读的是当前选中主机的状态。切主机时，本机 USB 枚举的意义没变，旧主机的检查结果却已经不能用。所以代码分别保存 `busScanGeneration` 和 `hostCheckGeneration`，发布主机结果前另外核对还是不是同一台主机。回归时我把场景拆成拔插、切页和切主机，分别观察设备行是否消失、旧扫描会不会覆盖新列表、上一个主机的诊断状态会不会串过来。 [主机检查的发布条件](https://github.com/opsbsligm/moonlight-macos-enhanced/blob/cc6aa76f1459/Limelight/macOS/ViewControllers/SettingsDevicesPane.swift#L621)

验证时可以把旧扫描的结果故意放到切页之后再返回。若它被丢弃，界面仍可见时应等一次补扫，以新快照为准。切主机则看两件事：远端诊断随主机变，本机 USB 行仍来自本机快照。这样两条路径可以分别追问到代码。它们属于设备诊断，主机侧实际接管 USB 的重定向仍处于冻结状态。

当串流断开要回头排查时，会话摘要按低频事件保留已写入的状态。异常退出可能只留下不完整的末条记录，回读采用能解析的事件。分享诊断材料前还需要单独脱敏。

## 持久化配置和界面顺序分开

设备页是六个原生设置分区之一，其余是串流、视频、音频、输入和应用。常调参数可以直接在界面修改，视频页集中显示编解码、分辨率、帧率和色彩，可用组合由客户端和串流主机共同决定。分区枚举有一处容易被当成笔误的编号：

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

六区标签栏采用原生 `NSSegmentedControl`，并在支持时设置 `role = .tabs`。下面是设置原生标签语义的关键片段。编译期判断处理 SDK 能否识别 API，运行期检查处理 API 在当下系统是否可用。这两层判断本身不构成旧版系统兼容承诺。

```swift
#if ML_APPKIT_TABS_ROLE
if #available(macOS 27.0, *) {
  control.role = .tabs
}
#endif
```

选中态交给系统绘制，应用负责维护选择值、显示顺序与配置迁移。[原生标签栏实现](https://github.com/opsbsligm/moonlight-macos-enhanced/blob/cc6aa76f1459/Limelight/macOS/ViewControllers/LiquidGlass/LiquidGlassTabBar.swift)。

兼容旧分区编号只是第一步。旧配置里的字段可能缺失，界面仍然要给出明确值。以视频时序为例，模型读取 VSync 和时序缓冲级别，前者缺失时取默认值，后者把已保存的整数映射回下拉选项。复核这类改动时，我会分别拿空配置和已有配置启动，再改一次设置、重启回读。只检查界面画出来，会漏掉“第一次看着对，下次启动回到了默认值”的问题。 [旧字段回读与缺省值](https://github.com/opsbsligm/moonlight-macos-enhanced/blob/cc6aa76f1459/Limelight/macOS/ViewControllers/SettingsModel%2BPersistence.swift#L356)

## 同一个审计任务为何耗时差十倍

当时一项审计和构建、其他测试争用同一台 macOS runner，并发时触发了原有超时，日志最后只剩 `Terminated: 15`。同一审计单独运行约 140 秒，争用的一次执行跑到 1,803 秒后触发了 30 分钟门槛。这两次是历史现场记录。这个对照把排查范围缩到了调度和资源，单看 SIGTERM 无法做同样的判断。

处理分三层：

1. 用同一项审计做单跑对照，核对超时记录与当时并行的作业。
2. 分支已有合并请求时，由合并请求流水线执行相同检查，减少重复排队。
3. 审计按测得的最慢一轮单独调整预算，构建继续使用原来的超时。

```yaml
audit:python:
  stage: lint
  tags: [macos]
  timeout: 60 minutes
workflow:
  rules: &pipeline_rules
    # open merge request => judged by the MR pipeline, not this push one
    - if: '$CI_PIPELINE_SOURCE == "push" && $CI_OPEN_MERGE_REQUESTS'
      when: never
```

以上仅节选重复流水线的排除规则。运行合并请求和默认分支流水线的规则仍需完整配置。耗时最长的变异测试单独串行，避免和日常门禁反复争抢同一资源。

## 出包侧：版本号只认构建产物

构建时曾遇到 CI 传入的版本和打包读取的版本不一致。出包环节从已经构建的 App 读短版本号和构建号，并在暂存副本完成资源安装后再签名。下面只展示读取版本的部分。GitHub Release 的公开附件使用架构标识命名。

```bash
# Single source of truth: version info comes from the built app's Info.plist.
VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$APP_PATH/Contents/Info.plist")
BUILD_NUM=$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$APP_PATH/Contents/Info.plist")
```

这次收口后，发布核对多了一步真正读取产物。打包脚本拿到的是 App 自己声明的版本，下载者拿到的是有架构标记和校验文件的 DMG。CI 变量适合发起构建，排查版本串包时应检查包内信息；SHA-256 校验可以核对下载是否一致，无法用来判断签名、公证或某台设备的实际兼容性。

## 实机记录

串流流畅度容易被平均帧率掩盖。我给现场记录保留了每个采样窗口的 `fps` 和 `frameP95`。后者是该窗口的帧时间第 95 百分位，用来看较慢的一端。原生路径日志有 148 条记录，窗口帧率中位数是 31.88，对应的帧时间 P95 中位数为 44.444 ms。仅缩放的一组有 139 条，分别是 62.63 和 27.777 ms。这里取的是各采样窗口数值的中位数，未把原始帧并在一起重新计算分位数。

两组帧率基线已经不同，记录可以帮助找到值得继续追的路径，无法单凭这组数字把差异归给缩放功能。要继续定位，应固定主机输出和客户端刷新率，逐次只改一个设置，再一起核对帧时间和提交等待。 [原生路径记录](https://github.com/opsbsligm/moonlight-macos-enhanced/blob/cc6aa76f1459/docs/evidence/frame-time-2026-10-15/group-native.log) · [仅缩放记录](https://github.com/opsbsligm/moonlight-macos-enhanced/blob/cc6aa76f1459/docs/evidence/frame-time-2026-10-15/group-scaling-only.log)

八周后，我在自己的 Mac 上日常串流时，已经能从设置页调整常用参数，断连后回看会话摘要，排查设备时也能刷新本机 USB 列表。USB 重定向的端到端测试没有完成，公开 README 将它列为冻结项。第二台不同芯片代际的 Mac 也未进行同样的验收。

## 串流占卡前，先把台式机从推理池摘掉

被串流的台式机平时也承担对话推理。做长时间串流测试前，我先从 [WeKnora 路由](/2026/10/11/%E6%8A%8A%E5%AE%B6%E9%87%8C%E7%9A%84%E7%AE%97%E5%8A%9B%E5%85%A8%E6%8E%8F%E5%87%BA%E6%9D%A5WeKnora%E6%A8%A1%E5%9E%8B%E4%BF%9D%E9%9A%9C%E5%AE%9E%E5%BD%95/) 摘掉这台机器，再停本机模型服务。串流期间其他推理池继续接收请求。台式机要重新接回时，先用一次真实请求确认模型就绪，再把流量放回来。

## 源码与发行

[项目源码及支持范围](https://github.com/opsbsligm/moonlight-macos-enhanced)记录了当前目标系统与冻结项。[v1.6.0-build2191](https://github.com/opsbsligm/moonlight-macos-enhanced/releases/tag/v1.6.0-build2191)提供 arm64 DMG 和 SHA-256 校验文件。
