---
title: "用 Windows Sandbox 运行旧打印机工具"
date: 2023-03-04 11:00:00
updated: 2026-11-23 22:35:00
tags:
  - Windows 11
  - Helpdesk
  - 安全
categories:
  - 基础设施
  - 安全管理
keywords: Windows沙盒, Sandbox, 安全隔离, 虚拟化, Flash Player, IE浏览器
description: "2023 年一次 IC 卡维护，附离线只读的沙盒配置。"
cover: /img/cover/windows-sandbox.jpg
toc: true
copyright: true
---

一次给老打印机做 IC 卡维护，后台得用旧浏览器和插件。我开了一次 Windows Sandbox 跑工具。那次要连打印机后台。后面另附一个离线例子，看目录只读和关窗后的清理效果。

![Windows 沙盒架构](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230303131900199.png)

## 沙盒关窗会销毁什么

Windows Sandbox 提供临时桌面。会话结束后，沙盒里安装的应用和内部临时状态被清理。宿主共享文件夹则仍然在宿主上，可写映射中的改动不会随关窗回滚。网络、剪贴板和设备重定向都是为兼容任务按需打开的通道，开一个就要各验一个。[微软 Windows Sandbox 配置说明](https://learn.microsoft.com/en-us/windows/security/threat-protection/windows-sandbox/windows-sandbox-configure-using-wsb-file)

旧现场用专用目录给沙盒提供安装材料。任务还要访问设备管理后台，网络就成了额外的约束。需要联网时，先在受管网络真实核可达范围。限定不了访问边界，就换成接入专用隔离网络的测试虚拟机，网络审计和维护责任都要有人接。

| 通道 | 决定开放前问什么 | 结果怎么验 |
| --- | --- | --- |
| 目录映射 | 是只读投递，还是确实要向宿主导出结果？ | 宿主只暴露专用目录，写入应按策略拒绝 |
| 网络 | 是否只需离线，或者有明确目标？ | 离线关闭网络；联网只走批准范围 |
| 剪贴板与设备 | 是否需要跨环境携带任何内容？ | 各测一次能否跨会话复制或重定向 |
| 关窗 | 哪些运行结果应销毁，哪些要交接？ | 重启后查沙盒状态；宿主目录和外部服务另核 |

## 验一份离线只读配置

离线例子里，宿主的 `C:\SandboxInput` 只放普通样例文件。进沙盒后从 `C:\Input` 读一遍，再试着写一份新文件。预期是读得到，写入被拒。

```xml
<Configuration>
  <Networking>Disable</Networking>
  <ClipboardRedirection>Disable</ClipboardRedirection>
  <PrinterRedirection>Disable</PrinterRedirection>
  <MappedFolders>
    <MappedFolder>
      <HostFolder>C:\SandboxInput</HostFolder>
      <SandboxFolder>C:\Input</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
  </MappedFolders>
</Configuration>
```

配置打开后，我会先读一遍样例文件，再试写一份进去，看是否真被拦住。换了 Windows 版本、管理员策略或硬件，这两步重来一遍。

## 当时验证了哪一步

历史现场验证了旧后台可访问，工具能完成那次维护。持续运行则要考虑软件支持、网络访问记录以及失败时谁接手。之后我做 {% post_link Windows-Servers的Agent接管PowerShell7与WinRM双通道 "远程运维通道" %} 时沿用这个判断标准：连上了、有权限、业务真的做完了，三件事分开留证据。
