---
title: Windows沙盒 sandbox 实际应用案例
date: 2023-03-04 11:00:00
updated: 2026-11-19 11:00:00
tags:
  - Windows 11
  - Helpdesk
  - 安全
categories:
  - 基础设施
  - 安全管理
keywords: Windows沙盒, Sandbox, 安全隔离, 虚拟化, Flash Player, IE浏览器
description: 用 Windows 沙盒解决真实 IT 支持问题的案例：通过 MappedFolders 与 LogonCommand 自动安装 Flash Player，在隔离环境中运行依赖 IE 的过时管理系统。
cover: /medias/featureimages/5.jpg
toc: true
copyright: true
---

## 背景介绍

IT 支持工作中常遇到一类两难需求：某个仍在使用的管理系统只兼容过时的浏览器与插件，而这些组件本身已不适合装在办公机上。

本次案例即属此类：打印机联机认证使用理光的格兰林系统，删除已注册 IC 卡时必须在 IE 浏览器中访问其后台，而该后台依赖 Flash Player 插件。Flash Player 已全面停止支持，存在已知安全风险且历史上捆绑软件较多，不应安装在物理机上。

处理思路是把「不安全的运行环境」与「主机」彻底分开：在 Windows 自带的沙盒中临时安装并运行所需组件，用完即销毁。落地方式是沙盒配置文件（`.wsb`）+ `MappedFolders` 映射脚本目录 + `LogonCommand` 自动执行安装，双击文件即可得到装好 Flash Player 的干净环境。

## Windows 沙盒简介

Windows 沙盒是 Windows 10 Pro/Enterprise 和 Windows 11 Pro/Enterprise 版本中内置的一个轻量级虚拟化环境，具有以下特点：

- **临时性**：沙盒是临时桌面环境，关闭后所有数据（含本次安装的 Flash Player）全部清除
- **隔离性**：沙盒与主机系统隔离，主机不受沙盒内软件影响
- **安全性**：沙盒内的应用程序**默认**无法访问主机文件系统，但通过 `MappedFolders` 显式映射的目录是明确例外——本案例正是依靠这一例外把安装脚本送进沙盒
- **便捷性**：无需配置虚拟机，一键启动

需要注意，映射目录是**真实的读写通道**（可设为只读），因此映射范围应保持最小：只映射存放安装脚本的目录，绝不映射用户主目录或包含凭据的路径。

官方文档参考：[Windows 沙盒配置指南 | Microsoft Learn](https://learn.microsoft.com/zh-cn/windows/security/threat-protection/windows-sandbox/windows-sandbox-configure-using-wsb-file)

![Windows 沙盒架构](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230303131900199.png "Windows沙盒架构图")

## 解决方案实施

### 1. 启用 Windows 沙盒功能

首先确保 Windows 沙盒功能已启用：

1. 打开"控制面板" → "程序" → "启用或关闭 Windows 功能"
2. 勾选"Windows 沙盒"选项
3. 点击"确定"并重启计算机

### 2. 编写批处理脚本

创建批处理文件，用于在沙盒内自动完成「连接共享 → 取安装包 → 静默安装」：

```batch
@echo off
REM 连接网络共享路径
net use "\\UNC路径" "<口令>" /user:"<域>\<账号>"

REM 复制Flash Player安装文件到沙盒下载目录
xcopy "\\UNC路径\flashplayer.exe" "C:\Users\WDAGUtilityAccount\Downloads\" /i /Y /Q

REM 静默安装Flash Player
C:\Users\WDAGUtilityAccount\Downloads\flashplayer.exe /verysilent /suppressmsgboxes
```

三处要点：

- **凭据占位**：`<口令>` 与 `<域>\<账号>` 为占位符，实际使用时替换为专用只读账户。该脚本会被映射进沙盒，不要把域管理员凭据写入其中。
- **`xcopy` 必须带 `/i /Y /Q`**：`LogonCommand` 是无人值守执行的，若目标目录不存在或需要覆盖确认，`xcopy` 会停在交互提问上，导致安装流程整体挂起。`/i` 在目标不存在且源为文件时按文件创建，`/Y` 抑制覆盖确认，`/Q` 关闭文件回显。
- **路径统一为 `C:\Users\...`**：Windows 路径不区分大小写，但脚本与配置文件中的大小写混用会增加阅读与检索成本，统一写法更便于比对。

将批处理文件保存在`C:\SandboxScripts`目录下：

![批处理脚本位置](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230303134422839.png "批处理脚本存储位置")

### 3. 编写沙盒配置文件

创建.wsbs 格式的配置文件来定义沙盒环境：

```xml
<Configuration>
  <!-- 映射文件夹，将主机文件夹映射到沙盒环境 -->
  <MappedFolders>
    <MappedFolder>
      <HostFolder>C:\SandboxScripts</HostFolder>
      <SandboxFolder>C:\Users\WDAGUtilityAccount\Downloads\sandbox</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
  </MappedFolders>

  <!-- 登录后自动执行的命令 -->
  <LogonCommand>
    <Command>C:\Users\WDAGUtilityAccount\Downloads\sandbox\flashplayer.bat</Command>
  </LogonCommand>
</Configuration>
```

将配置文件保存为`flashplayer.wsb`格式：

> 上文脚本之所以绕道网络共享取安装包，是因为 `MappedFolders` 映射源被设为 `<ReadOnly>true</ReadOnly>`：映射目录在沙盒内不可写，无法把文件暂存过去，因此改为先把安装包取到沙盒自身可写的 `Downloads` 目录再执行（`LogonCommand` 直接执行只读目录中的 `.bat` 没有问题，执行只需要读权限）。如果不希望脚本携带共享凭据，可以去掉 `ReadOnly` 并由映射目录直接提供安装包，代价是沙盒对该主机目录获得写入面。

![沙盒配置文件](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230303133712953.png "沙盒配置文件")

### 4. 运行沙盒环境

双击执行`flashplayer.wsb`文件启动 Windows 沙盒，系统将自动：

1. 启动沙盒环境
2. 映射指定文件夹
3. 执行登录命令安装 Flash Player

![沙盒运行结果](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230303142847558.png "沙盒运行验证")

## 安全注意事项

使用 Windows 沙盒处理此类问题时，需要注意以下安全事项：

1. **数据隔离**：沙盒与主机隔离，沙盒内的软件与配置不会写回主机系统。
2. **临时性**：沙盒关闭后本次会话产生的数据全部丢弃，因此每次启动都需重新安装 Flash Player；若某次会话产生了需要保留的输出（如导出的配置、截图），必须在关闭前主动取出，否则不可恢复。
3. **映射即通道**：`MappedFolders` 是沙盒访问主机文件的唯一显式通道，应保持只读且范围最小；不要映射用户主目录、桌面或任何含凭据的路径。
4. **网络访问**：沙盒默认可访问网络。本案例需要访问共享与打印机管理后台，如需收紧可在主机侧通过防火墙/网络策略限制沙盒可达范围。
5. **凭据暴露面**：映射进沙盒的脚本若含明文凭据，等同于把凭据交给沙盒内运行的所有代码。优先使用共享侧的最小权限账户，并在用完后撤销临时授权。

## 应用场景扩展

Windows 沙盒不仅适用于本案例，还可以用于以下场景：

1. **恶意软件分析**：在隔离环境中运行可疑程序
2. **软件测试**：测试新软件对系统的影响
3. **文档查看**：安全查看来源不明的文档
4. **系统维护**：运行可能影响系统的维护工具
5. **培训演示**：提供干净的演示环境

## 总结

通过 Windows 沙盒，我们成功解决了需要在 IE 浏览器中运行 Flash Player 的特殊需求，同时确保了主机系统的安全。这种方法既满足了业务需求，又避免了在生产环境中安装不安全软件的风险。

Windows 沙盒作为微软提供的轻量级虚拟化解决方案，在处理此类特殊需求时具有显著优势：
- 无需额外的虚拟化软件
- 启动速度快
- 安全隔离性好
- 使用简单便捷

建议在遇到类似需求时，优先考虑使用 Windows 沙盒作为解决方案。
