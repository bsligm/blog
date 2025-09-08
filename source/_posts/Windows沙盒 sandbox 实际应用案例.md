---
title: Windows沙盒 sandbox 实际应用案例
date: 2023-03-04 11:00:00
updated: 2023-03-04 11:00:00
tags: 
  - Windows 11
  - Helpdesk
  - 安全
categories: 
  - 基础设施
  - 安全管理
keywords: Windows沙盒, Sandbox, 安全隔离, 虚拟化, Flash Player, IE浏览器
description: 介绍如何使用Windows沙盒解决实际问题的案例，通过沙盒环境安全地运行过时且不安全的软件，如Flash Player和IE浏览器。
cover: /medias/featureimages/5.jpg
toc: true
copyright: true
---

# Windows沙盒 sandbox 实际应用案例

## 背景介绍

在日常IT支持工作中，我们经常会遇到一些特殊的软件兼容性问题。本次案例的背景是：

打印机联机认证服务使用的是理光的格兰林系统，在删除已注册的IC卡时，需要使用IE浏览器访问后台管理系统。然而，该系统依赖于Flash Player插件，而Flash Player已经全面停止支持，且存在大量安全风险和捆绑软件，不适合安装在物理机上。

在这种情况下，Windows自带的沙盒应用成为了解决问题的完美方案。

## Windows沙盒简介

Windows沙盒是Windows 10 Pro/Enterprise和Windows 11 Pro/Enterprise版本中内置的一个轻量级虚拟化环境，具有以下特点：

- **临时性**：沙盒是一个临时的桌面环境，关闭后所有数据都会被清除
- **隔离性**：沙盒与主机系统完全隔离，保护主机安全
- **安全性**：运行在沙盒中的应用程序无法访问主机文件系统
- **便捷性**：无需复杂的虚拟机配置，一键启动

官方文档参考：[Windows 沙盒配置 | Microsoft Learn](https://learn.microsoft.com/zh-cn/windows/security/threat-protection/windows-sandbox/windows-sandbox-configure-using-wsb-file)

![Windows沙盒架构](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230303131900199.png "Windows沙盒架构图")

## 解决方案实施

### 1. 启用Windows沙盒功能

首先确保Windows沙盒功能已启用：

1. 打开"控制面板" → "程序" → "启用或关闭Windows功能"
2. 勾选"Windows沙盒"选项
3. 点击"确定"并重启计算机

### 2. 编写批处理脚本

创建批处理文件用于在沙盒中自动安装Flash Player：

```batch
@echo off
REM 连接网络共享路径
net use \\UNC路径 "你的密码" /user:你的域名\你的用户名

REM 复制Flash Player安装文件到沙盒下载目录
xcopy \\UNC路径\flashplayer.exe C:\users\WDAGUtilityAccount\Downloads\

REM 静默安装Flash Player
C:\users\WDAGUtilityAccount\Downloads\flashplayer.exe /verysilent /suppressmsgboxes
```

将批处理文件保存在`C:\SandboxScripts`目录下：

![批处理脚本位置](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230303134422839.png "批处理脚本存储位置")

### 3. 编写沙盒配置文件

创建.wsbs格式的配置文件来定义沙盒环境：

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

![沙盒配置文件](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230303133712953.png "沙盒配置文件")

### 4. 运行沙盒环境

双击执行`flashplayer.wsb`文件启动Windows沙盒，系统将自动：

1. 启动沙盒环境
2. 映射指定文件夹
3. 执行登录命令安装Flash Player

![沙盒运行结果](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230303142847558.png "沙盒运行验证")

## 安全注意事项

使用Windows沙盒处理此类问题时，需要注意以下安全事项：

1. **数据隔离**：沙盒环境与主机完全隔离，不会对主机系统造成影响
2. **临时性**：沙盒关闭后所有数据自动清除，不会留下任何痕迹
3. **权限控制**：沙盒中的应用程序无法访问主机敏感数据
4. **网络访问**：根据需要控制沙盒的网络访问权限

## 应用场景扩展

Windows沙盒不仅适用于本案例，还可以用于以下场景：

1. **恶意软件分析**：在隔离环境中运行可疑程序
2. **软件测试**：测试新软件对系统的影响
3. **文档查看**：安全查看来源不明的文档
4. **系统维护**：运行可能影响系统的维护工具
5. **培训演示**：提供干净的演示环境

## 总结

通过Windows沙盒，我们成功解决了需要在IE浏览器中运行Flash Player的特殊需求，同时确保了主机系统的安全。这种方法既满足了业务需求，又避免了在生产环境中安装不安全软件的风险。

Windows沙盒作为微软提供的轻量级虚拟化解决方案，在处理此类特殊需求时具有显著优势：
- 无需额外的虚拟化软件
- 启动速度快
- 安全隔离性好
- 使用简单便捷

建议在遇到类似需求时，优先考虑使用Windows沙盒作为解决方案。