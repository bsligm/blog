---
title: Chromium浏览器 内核113 STATUS_STACK_BUFFER_OVERRUN解决方案
date: 2023-05-18 11:00:00
updated: 2023-05-18 11:00:00
tags: 
  - Chromium
  - 浏览器
  - Windows
  - AD域控制器
  - Helpdesk
categories: 
  - 基础设施
  - 桌面维护
keywords: Chromium, Chrome, Edge, STATUS_STACK_BUFFER_OVERRUN, 堆栈溢出, 浏览器崩溃, AD域, 组策略
description: 解决Chromium浏览器内核更新到v113版本后出现的STATUS_STACK_BUFFER_OVERRUN错误问题，提供单机和批量解决方案。
cover: /medias/featureimages/3.jpg
toc: true
copyright: true
---

# Chromium浏览器 内核113 STATUS_STACK_BUFFER_OVERRUN解决方案

## 问题描述

2023年5月，Chromium内核更新到了v113版本，导致部分Chrome/Edge浏览器无法正常启动。用户在打开浏览器时会遇到以下错误信息：

- "喔唷，崩溃了"
- STATUS_STACK_BUFFER_OVERRUN 错误代码

根据微软官方论坛的信息，该问题的根本原因是"堆栈溢出"导致的浏览器崩溃。

相关链接：[Microsoft Community - Edge浏览器问题讨论](https://answers.microsoft.com/zh-hans/microsoftedge/forum/all/microsoft/8007f833-2959-419a-8408-e0cc0bfcbd5d)

## 单机解决方案

对于单台计算机出现的问题，可以通过以下步骤解决：

### 1. 配置Windows安全中心

1. 打开Windows安全中心
2. 选择"应用和浏览器控制"
3. 点击"Exploit Protection"
4. 选择"程序设置"
5. 点击"添加程序"，选择"选择要自定义的程序"
6. 浏览并选择chrome.exe（通常位于`C:\Program Files\Google\Chrome\Application\chrome.exe`）
7. 展开"硬件强制实施的堆栈保护"选项
8. 选择"替代系统设置"
9. 设置为"仅审核"模式

![Windows安全中心配置步骤1](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230607114706037.png "添加Chrome程序到保护列表")

![Windows安全中心配置步骤2](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230607114725430.png "配置硬件强制堆栈保护")

设置完成后，重新启动Chrome浏览器进行测试，问题应该得到解决。

## 批量解决方案

由于集团内部出现了大量的STATUS_STACK_BUFFER_OVERRUN报错，严重影响业务运行，需要采用批量解决方案。

### 1. 使用AD组策略进行批量配置

通过Active Directory组策略可以统一为域内所有计算机配置解决方案。

#### 步骤1：创建并链接组策略对象

1. 打开"组策略管理"控制台
2. 右键点击需要应用策略的组织单位（OU）
3. 选择"在这个域中创建GPO并链接到此处"
4. 为新的组策略对象命名（例如："Chrome v113堆栈溢出修复"）

![创建组策略对象](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230607115112741.png "创建并链接组策略对象")

#### 步骤2：配置注册表设置

1. 编辑新创建的组策略对象
2. 导航到：`计算机配置` → `首选项` → `Windows设置` → `注册表`

##### 2.1 配置EAFModules注册表项

- 操作：新建
- Hive：HKEY_LOCAL_MACHINE
- 注册表项路径：`SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\chrome.exe`
- 注册表项名称：`EAFModules`
- 注册表项类型：`REG_SZ`
- 值：保持为空

![配置EAFModules注册表项](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230607115401671.png "配置EAFModules注册表项")

##### 2.2 配置MitigationAuditOptions注册表项

- 操作：新建
- Hive：HKEY_LOCAL_MACHINE
- 注册表项路径：`SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\chrome.exe`
- 注册表项名称：`MitigationAuditOptions`
- 注册表项类型：`REG_BINARY`
- 值：`000000000000000000000000000000100000000000000000`

![配置MitigationAuditOptions注册表项](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230607115714897.png "配置MitigationAuditOptions注册表项")

##### 2.3 配置MitigationOptions注册表项

- 操作：新建
- Hive：HKEY_LOCAL_MACHINE
- 注册表项路径：`SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\chrome.exe`
- 注册表项名称：`MitigationOptions`
- 注册表项类型：`REG_BINARY`
- 值：`000000000000000000000000000000100000000000000000`

![配置MitigationOptions注册表项](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230607115944451.png "配置MitigationOptions注册表项")

#### 步骤3：应用并验证策略

1. 完成组策略配置后，保存设置
2. 在客户端计算机上执行以下命令更新组策略：
   ```cmd
   gpupdate /force
   ```
3. 重新启动Chrome浏览器进行测试

## 注意事项

1. 在生产环境中应用组策略前，建议先在测试环境中验证
2. 批量部署时，建议分批次进行，以减少对业务的影响
3. 需要确保所有客户端计算机都能正常连接到域控制器以获取策略
4. 定期检查组策略的执行状态，确保配置生效

## 总结

通过以上单机和批量解决方案，可以有效解决Chromium浏览器v113版本的STATUS_STACK_BUFFER_OVERRUN问题。对于企业环境，推荐使用AD组策略进行统一配置，以提高效率并确保一致性。

建议关注Chromium官方和微软的后续更新，以获取更彻底的解决方案。