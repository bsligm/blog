---
title: "Chromium 113 启动崩溃"
date: 2023-05-18 11:00:00
updated: 2026-11-23 22:35:00
tags:
  - Chromium
  - 浏览器
  - Windows
  - AD域控制器
  - Helpdesk
categories:
  - 基础设施
  - 桌面维护
keywords: Chromium, Chrome, Edge, STATUS_STACK_BUFFER_OVERRUN, Exploit Protection, 硬件强制堆栈保护, 组策略
description: "部分终端更新后报 STATUS_STACK_BUFFER_OVERRUN，回退版本后恢复访问。"
cover: /img/cover/chromium-crash.jpg
toc: true
copyright: true
---

> **版本说明**：这是 2023 年 5 月 Chromium 113 的现场记录。系统、浏览器和终端组件的组合会影响结果，不能据此推断今天的产品版本。

部分办公电脑升到 Chromium 113 后，Chrome 和 Edge 一启动就退出，报 `STATUS_STACK_BUFFER_OVERRUN`。同批还有能用的电脑，我拿两边的版本、系统补丁和策略做对照。

## 先把异常码和根因拆开

在用户态，微软文档把 `0xC0000409` 用作快速失败（fail-fast）的异常报告，首个异常参数提供更细的失败码。看见这个名字，只能确认程序走了异常终止路径，必须结合子码、故障进程、模块和转储才能追原因。旧记录曾怀疑堆栈保护与第三方组件的交互，证据能确认的是升级后在部分设备复现、采取历史恢复措施后可用；根因仍缺完整证据。[微软 fast-fail 说明](https://learn.microsoft.com/en-us/cpp/intrinsics/fastfail?view=msvc-170)

故障机、同版本正常机和升级前版本各留一个样本。用同一个批准的业务入口比较，记录 Windows 和浏览器版本、补丁时间、终端软件和策略。端点软件也可能在同一批次更新，时间上重叠时要把两条版本链摆在一起，免得看到一次回退成功，就把所有差异都归给某一项保护。

## 只读收集一次故障时间窗

下面只从应用日志取时间、事件号和来源。知道是哪一段以后，再到受控环境查故障进程、模块和转储。

```powershell
$windowStart = (Get-Date).AddHours(-2)
$events = @{
  LogName   = 'Application'
  Id        = 1000, 1001
  StartTime = $windowStart
}
Get-WinEvent -FilterHashtable $events -MaxEvents 40 |
  Select-Object TimeCreated, Id, ProviderName
```

| 现场现象 | 下一份要看的证据 |
| --- | --- |
| 浏览器启动即退出 | 时间匹配的应用事件、故障进程和版本 |
| 同版只有一部分机器失败 | 受影响设备共同的系统补丁、终端组件和策略 |
| 旧版能够打开页面 | 同一测试用户和原业务路径是否都通过 |
| 单台修好但批量仍失败 | 目标批次的实际版本、策略结果与启动行为 |

## 先恢复少量用户，再评估下一批

当时先回退版本，先把业务入口恢复。推下一版时，从当初那批出过问题的机器里选样本，写清回退用的版本和截止时间，拿同一个用户、同一个入口试。换了机器或入口，结果另记。

批量时先圈少量设备，确认策略确实落地，再按原路做一次业务回验。出现新失败要停在当前批，保留正常和异常对照，避免把临时设置写进覆盖全域的默认策略。和 {% post_link edge无法打开 "早年的 Edge 网页兼容复盘" %} 一样，这次最有用的是把错误表象、版本对照和真正的业务结果分开。
