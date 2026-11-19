---
title: Chromium 内核 113 STATUS_STACK_BUFFER_OVERRUN 解决方案
date: 2023-05-18 11:00:00
updated: 2026-11-19 15:30:00
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
description: 处理 Chromium 内核升级到 v113 后 Chrome/Edge 启动即崩溃并返回 STATUS_STACK_BUFFER_OVERRUN 的问题，提供 Exploit Protection 单机处置与 AD 组策略按映像名下发两种方式。
cover: /medias/featureimages/3.jpg
toc: true
copyright: true
---

2023 年 5 月 Chromium 内核升级到 v113 后，部分终端上的 Chrome/Edge 无法启动，页面或进程直接返回「喔唷，崩溃了」与 `STATUS_STACK_BUFFER_OVERRUN`。该问题在域内环境中会批量出现，直接阻断依赖浏览器的业务系统入口。

## 问题描述

崩溃时的两类表现：

- 标签页提示「喔唷，崩溃了，此网页出现问题」
- 进程异常终止，错误码 `STATUS_STACK_BUFFER_OVERRUN`

微软社区讨论中把它描述为「堆栈溢出」，但 `STATUS_STACK_BUFFER_OVERRUN`（`0xC0000409`）实际是 Windows 在**控制流防护 CFG 与硬件强制堆栈保护等 exploit 防护机制命中时的快速失败（fast-fail）**，由系统主动终止进程，并非传统意义上写穿栈边界导致的栈溢出。论坛说法描述的是表象，处置手段正是针对这套防护机制。

参考：[微软社区 — Edge 浏览器崩溃讨论](https://learn.microsoft.com/zh-hans/answers/questions/8007f833-2959-419a-8408-e0cc0bfcbd5d/microsoft?forum=microsoftedge-all&referrer=answers)

## 单机解决方案

在 Windows 安全中心为该浏览器映像单独放宽硬件强制堆栈保护，使其从「命中即终止」降级为「仅记录」。

### 1. 在 Exploit Protection 中添加目标程序

1. 打开 Windows 安全中心 → **应用和浏览器控制**
2. 进入 **Exploit Protection**，切换到 **程序设置**
3. 点击 **添加程序** → **选择要自定义的程序**，指向浏览器主程序：
   - Chrome：`C:\Program Files\Google\Chrome\Application\chrome.exe`
   - Edge：`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`
4. 展开 **硬件强制实施的堆栈保护**
5. 勾选 **替代系统设置**，选择 **仅审核**

「仅审核」表示防护命中时只产生事件而不终止进程，因此浏览器可正常启动，同时在事件日志中保留命中记录，便于后续确认根因。

![Windows安全中心配置步骤1](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230607114706037.png "添加Chrome程序到保护列表")

上图确认已添加目标程序，下图确认「硬件强制实施的堆栈保护」已改为替代系统设置并置为仅审核：

![Windows安全中心配置步骤2](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230607114725430.png "配置硬件强制堆栈保护")

需要同时使用 Chrome 和 Edge 时，两个映像要**分别添加、分别配置**：Exploit Protection 与下文的 IFEO 缓解策略都按可执行文件名匹配，对 `chrome.exe` 的配置不会影响 `msedge.exe`。

配置完成后重启浏览器验证。

## 批量解决方案

域内出现大面积同类报错时，逐台配置 Exploit Protection 不可持续。可把等效设置落到注册表的 IFEO（Image File Execution Options）缓解策略键上，通过 AD 组策略按映像统一下发。

### 1. 创建并链接组策略对象

1. 打开「组策略管理」控制台（`gpmc.msc`）
2. 右键需要应用策略的组织单位（OU）
3. 选择「在这个域中创建 GPO 并在此处链接」
4. 按用途命名，例如 `Chrome_Edge_内核113_崩溃缓解`

![创建组策略对象](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230607115112741.png "创建并链接组策略对象")

### 2. 配置注册表设置

编辑该 GPO，导航到 `计算机配置` → `首选项` → `Windows设置` → `注册表`，依次新建下列三项。

**EAFModules**

- 操作：新建
- Hive：`HKEY_LOCAL_MACHINE`
- 键路径：`SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\chrome.exe`
- 值名称：`EAFModules`
- 值类型：`REG_SZ`
- 数值数据：留空

![配置EAFModules注册表项](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230607115401671.png "配置EAFModules注册表项")

**MitigationAuditOptions**

- 操作：新建
- Hive：`HKEY_LOCAL_MACHINE`
- 键路径：`SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\chrome.exe`
- 值名称：`MitigationAuditOptions`
- 值类型：`REG_BINARY`
- 数值数据：`000000000000000000000000000000100000000000000000`

![配置MitigationAuditOptions注册表项](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230607115714897.png "配置MitigationAuditOptions注册表项")

**MitigationOptions**

- 操作：新建
- Hive：`HKEY_LOCAL_MACHINE`
- 键路径：`SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\chrome.exe`
- 值名称：`MitigationOptions`
- 值类型：`REG_BINARY`
- 数值数据：`000000000000000000000000000000100000000000000000`

![配置MitigationOptions注册表项](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230607115944451.png "配置MitigationOptions注册表项")

两个键都是同一布局的缓解策略位图，分工不同：`MitigationOptions` 决定策略是否对该映像**强制生效**，`MitigationAuditOptions` 决定策略在**未强制时是否仅记录审计事件**。两者是相互独立的值，位图结构一致，因此示例中取相同数值，且需分别创建。位图中具体某一位对应哪种缓解机制由 Windows 版本定义，微软未给出稳定公开映射，**不建议手工修改数值本身**。

Edge 终端需按同样方式再建一组，只把键路径末段换成 `msedge.exe`。

### 3. 应用并验证策略

保存 GPO 后，在客户端执行以下命令强制刷新：

```cmd
gpupdate /force
```

随后确认注册表三个值已落地，并重启浏览器验证是否还会崩溃。若策略未生效，用 `gpresult /r` 核查 GPO 链接与作用范围。

## 注意事项

1. 上述配置会削弱目标浏览器进程的堆栈保护强度，属于临时可用性处置，不建议长期保留在生产终端
2. 生产环境批量下发前，先在测试 OU 验证
3. 分批次 rollout，控制单次影响面
4. 确保客户端能正常联系域控制器取得策略，否则配置不会生效
5. 定期复查该 GPO 的适用性：一旦上游版本修复，应及时撤销而不是长期压制防护

## 总结

`STATUS_STACK_BUFFER_OVERRUN` 是 exploit 防护命中后的快速失败，不是真正的栈溢出。单机在 Exploit Protection 中把目标映像的「硬件强制实施的堆栈保护」改为仅审核即可恢复；企业环境把等效的 IFEO 缓解策略通过 GPO 按映像下发，`chrome.exe` 与 `msedge.exe` 需分别配置。

这是绕开防护触发的临时手段，应跟踪 Chromium 与微软的后续版本，在上游修复后撤销配置并恢复默认防护。
