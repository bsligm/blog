---
title: "借一个 Windows Sandbox 管老打印机"
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
description: "一次 IC 卡维护用到了旧浏览器和插件。我把工具放进临时桌面，另外留了一个离线只读的配置例子。"
cover: /img/cover/windows-sandbox.jpg
toc: true
copyright: true
---

2023 年帮忙做一次 IC 卡维护，旧打印机后台还要用旧浏览器和插件。我只为这次操作开了个 Windows Sandbox，日常办公留在宿主。用到的网络和目录得另外管，尤其是共享目录，关窗口也不会把写进宿主的东西收回来。长期运行应换成厂商支持的管理入口。

![Windows 沙盒架构](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230303131900199.png)

## 沙盒关窗会销毁什么

Windows Sandbox 提供临时桌面。会话结束后，沙盒里安装的应用和内部临时状态被清理。宿主共享文件夹则仍然在宿主上，可写映射中的改动不会随关窗回滚。同样需要单独检查网络、剪贴板和设备重定向。它们是为兼容任务按需打开的通道，各自需要验收。[微软 Windows Sandbox 配置说明](https://learn.microsoft.com/en-us/windows/security/threat-protection/windows-sandbox/windows-sandbox-configure-using-wsb-file)

旧现场用专用目录给沙盒提供安装材料。任务还要访问设备管理后台，网络就成了额外的约束。需要联网时，先在受管网络真实核可达范围。没有办法限定访问边界时，可以换成接入专用隔离网络的测试虚拟机，保留网络审计和明确的维护责任。

| 通道 | 决定开放前问什么 | 结果怎么验 |
| --- | --- | --- |
| 目录映射 | 是只读投递，还是确实要向宿主导出结果？ | 宿主只暴露专用目录，写入应按策略拒绝 |
| 网络 | 是否只需离线，或者有明确目标？ | 离线关闭网络；联网只走批准范围 |
| 剪贴板与设备 | 是否需要跨环境携带任何内容？ | 分别测是否可跨会话复制或重定向 |
| 关窗 | 哪些运行结果应销毁，哪些要交接？ | 重启后查沙盒状态；宿主目录和外部服务另核 |

## 验一份离线只读配置

下面是单独准备的离线示例。宿主准备一个仅含普通样例文件的 `C:\SandboxInput`。在沙盒的 `C:\Input` 检查文件可读，尝试创建新的演示文件时则应收到拒绝。用这两个结果验映射与写权限。

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

配置打开后，我会先读一遍样例文件，再试写一份进去，看是否真被拦住。换 Windows 版本、管理员策略或硬件以后，用同样的两步再验。

## 当时验证了哪一步

历史现场验证了旧后台可访问，工具能完成那次维护。持续运行则要考虑软件支持、网络访问记录以及失败时谁接手。之后我做 {% post_link Windows-Servers的Agent接管PowerShell7与WinRM双通道 "远程运维通道" %} 时，也按这个思路判断：连接成功、操作权限和业务结果各留一条证据。
