---
title: Chromium 内核 113 STATUS_STACK_BUFFER_OVERRUN 解决方案
date: 2023-05-18 11:00:00
updated: 2026-11-20 12:00:00
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
description: Chromium 113 崩溃 STATUS_STACK_BUFFER_OVERRUN 定位：硬件强制堆栈保护命中的 fail-fast，非传统栈溢出。单机仅审核，企业按映像 GPO 下发 IFEO 缓解。
cover: /img/cover/chromium-crash.jpg
toc: true
copyright: true
---

终端与应用层的交付物一致性里有一类最难处理的故障：同一台装法、同一批镜像的机器，某个内核版本升级后浏览器整批起不来。2023 年 5 月 Chromium 内核到 v113 后，部分终端的 Chrome/Edge 启动即崩，错误码 `STATUS_STACK_BUFFER_OVERRUN`，域内批量出现，依赖浏览器的业务入口直接断。这篇是浏览器内核级故障定位的实战样本：从表象的错误码，到根因落在 Windows 的哪一层防护，再按单机/企业两条路径处置。

先纠正一个常见的误读。微软社区把它描述为「堆栈溢出」，但 `STATUS_STACK_BUFFER_OVERRUN`（`0xC0000429`）不是写穿栈边界的传统溢出，而是 **硬件强制堆栈保护（CET 影子栈）与 CFG 等 exploit 防护命中时的快速失败（fast-fail）**，由系统主动终止进程。（另一个常一起出现的 `0xC0000409` 是 `STATUS_FATAL_APP_EXCEPTION`，泛指 fail-fast，两者不是一回事。）论坛说法是表象，处置针对的正是这套防护机制。

参考：[微软社区 — Edge 浏览器崩溃讨论](https://learn.microsoft.com/zh-hans/answers/questions/8007f833-2959-419a-8408-e0cc0bfcbd5d/microsoft?forum=microsoftedge-all&referrer=answers)

## 关键设计决策

- **崩在哪个进程，怎么判断。** Chromium 是多进程模型：浏览器主进程、GPU、网络、每个标签页一个渲染进程。渲染进程崩了是「Aw, Snap」单标签页重启；这篇的症状是浏览器本体起不来，崩的是被系统防护 kill 的主程序映像。定位手段就是看终止码落在哪个进程——终止码是 fail-fast，说明杀进程的是 Windows 自己的防护层，而不是浏览器自己写穿内存，排查方向从浏览器翻到系统侧。
- **为什么回滚内核版本能解决。** 硬件强制堆栈保护（HSP）在 Windows 11 22H2 起随内存完整性默认开启；Chromium 113 开始启用 CET 影子栈支持，HSP 的强制范围随之覆盖浏览器进程树。只要有一枚未带 CET 支持编译的驱动或模块挂在进程里，命中即 fast-fail。回滚浏览器内核等于把影子栈支持退回上一代基线，所以有效——但代价是整台机器的浏览器行为退回旧版本，影响面远大于「只对浏览器放宽」。这也是本文选按映像放宽防护（Exploit Protection / IFEO）而不是回滚内核的原因：把代价圈在 `chrome.exe`/`msedge.exe` 两个映像里。
- **为什么「仅审核」而不是「关」。** 审核模式下防护命中只记事件不终止进程，浏览器能起来，事件日志留痕——根因（哪个模块命中）还能查。直接关闭防护则连证据都没有，之后要恢复默认时也无法证明哪些模块本来就有问题。代价是审核期间防护实际不拦，属临时可用性处置，不是长期方案。
- **为什么用 IFEO 组策略而不是浏览器命令行开关。** 命令行参数（如 `--no-sandbox`）需要改启动方式，域内已部署的机器启动入口不受控；Exploit Protection 的 GUI 逐台点又不规模化。IFEO 缓解位图经注册表 GPO 按映像名下发，开机即生效、逐机可回读验证（`gpresult /r` + 注册表三值），是唯一能批量且可审计的路径。

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

「仅审核」表示防护命中时只产生事件不终止进程：浏览器可正常启动，事件日志保留命中记录便于确认根因。

![Windows安全中心配置步骤1](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230607114706037.png "添加Chrome程序到保护列表")

上图确认已添加目标程序，下图确认「硬件强制实施的堆栈保护」已改为替代系统设置并置为仅审核：

![Windows安全中心配置步骤2](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230607114725430.png "配置硬件强制堆栈保护")

需要同时使用 Chrome 和 Edge 时，两个映像要**分别添加、分别配置**：Exploit Protection 与下文的 IFEO 缓解策略都按可执行文件名匹配，对 `chrome.exe` 的配置不会影响 `msedge.exe`。

配置完成后重启浏览器验证。

## 批量解决方案

域内大面积同类报错时，逐台配置不可持续。把等效设置落到注册表 IFEO（Image File Execution Options）缓解策略键，通过 AD 组策略按映像统一下发。

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

两个键都是同一布局的缓解策略位图，分工不同：`MitigationOptions` 决定策略是否对该映像**强制生效**，`MitigationAuditOptions` 决定策略**未强制时是否仅记录审计事件**。两者相互独立、位图结构一致，故示例取相同数值且需分别创建。位图中某位对应哪种缓解机制由 Windows 版本定义，微软未给出稳定公开映射，**不建议手工修改数值本身**。

Edge 终端需按同样方式再建一组，只把键路径末段换成 `msedge.exe`。

### 3. 应用并验证策略

保存 GPO 后，在客户端执行以下命令强制刷新：

```cmd
gpupdate /force
```

随后确认注册表三个值已落地，并重启浏览器验证是否还会崩溃。若策略未生效，用 `gpresult /r` 核查 GPO 链接与作用范围。

## 注意事项

- 配置削弱目标浏览器进程的堆栈保护强度，属临时可用性处置，不建议长期保留在生产终端
- 批量下发前先在测试 OU 验证，再分批 rollout 控制影响面
- 客户端须能正常联系域控制器取得策略，否则不生效
- 定期复查 GPO 适用性：上游版本修复后及时撤销，不长期压制防护

## 总结

- `STATUS_STACK_BUFFER_OVERRUN` 是 exploit 防护命中后的快速失败，不是真正的栈溢出；
- 单机：Exploit Protection 中把目标映像「硬件强制实施的堆栈保护」改为仅审核；企业：等效 IFEO 缓解策略经 GPO 按映像下发，`chrome.exe` 与 `msedge.exe` 分别配置；
- 临时处置，跟踪 Chromium 与微软后续版本，上游修复后撤销 GPO、恢复默认防护。

## 待人工确认

- 本次崩溃对应的是哪个 Windows 版本/更新的 HSP 默认开启变化（22H2 内核 22621 起默认内存完整性+HSP），当时域内机器的实际系统版本需对照事件日志确认；
- 位图值 `…0010…`（第 16 字节，0 起算 byte 15 置 `0x10`）正是微软文档中 CFG 启用（`EnableCfg`）的标准位图；`EAFModules` 置空值表示按模块全量审计。位定义随 Windows 版本有增补，数值照抄本文示例即可，恢复默认前建议用 `Get-ProcessMitigation -Name chrome.exe` 读回当前实际值留档。
