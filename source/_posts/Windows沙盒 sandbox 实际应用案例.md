---
title: Windows沙盒 sandbox 实际应用案例
date: 2023-03-04 11:00:00
updated: 2026-11-20 12:00:00
tags:
  - Windows 11
  - Helpdesk
  - 安全
categories:
  - 基础设施
  - 安全管理
keywords: Windows沙盒, Sandbox, 安全隔离, 虚拟化, Flash Player, IE浏览器
description: 用 Windows 沙盒解决 IT 支持两难题：MappedFolders 映射安装脚本目录、LogonCommand 自动静默装 Flash Player，在隔离环境运行依赖 IE 的打印机联机认证后台，关窗即销毁。
cover: /medias/featureimages/5.jpg
toc: true
copyright: true
---

终端管理里有一类需求靠账号体系压不住：某个仍在使用的管理系统只兼容过时的浏览器与插件，而这些组件本身已不适合装在办公机上。本案例即属此类：打印机联机认证使用理光的格兰林系统，删除已注册 IC 卡时必须在 IE 中访问其后台，后台依赖 Flash Player 插件——Flash 已全面停止支持，存在已知安全风险且历史上捆绑软件较多，不应装在物理机上。账号权限控制的是「谁能进」，控制不了「进了会装什么」，隔离边界得挪到运行时。

思路是把「不安全的运行环境」与「主机」彻底分开：用 Windows 自带沙盒临时安装运行所需组件，用完即销毁。落地方式：沙盒配置文件（`.wsb`）+ `MappedFolders` 映射脚本目录 + `LogonCommand` 自动执行安装，双击即得装好 Flash Player 的干净环境。

## 关键设计决策

- **映射目录设只读，脚本绕道网络共享取安装包**：`ReadOnly` 让沙盒对主机目录只有读权，暴露面最小；代价是安装包不能直接放进映射目录，脚本要先 `net use` 连共享、把文件取到沙盒内可写的 `Downloads` 目录再装。脚本里因此带了一份明文凭据——换成专用只读账号，用完撤销。
- **`LogonCommand` 自动执行安装**：沙盒启动即装完 Flash，使用者双击 `.wsb` 就能干活，不需要会操作的人。代价是这条命令无人值守执行，`xcopy` 缺一个抑制交互的开关都会挂起在提问上。
- **隔离边界按「什么没被隔开」验收**：沙盒是轻量虚拟化环境（独立于宿主内核运行，隔离注册表、文件系统与桌面），关窗即销毁；网络**默认开放**（`.wsb` 配置文件里 `Networking` 节设为 `Disable` 可关，默认情况下无 VPN/802.1X 区分，本案例正好依赖它访问打印机后台），身份上默认用户是本地 `WDAGUtilityAccount` 而非域会话——`net use` 存的是域账号的真实凭据，网络会话以那个域账号建立。把它当虚拟机用会高估隔离强度，把它当一次性干净环境用正合适。

## Windows 沙盒简介

Windows 沙盒是 Windows 10/11 Pro/Enterprise 内置的轻量虚拟化环境：每次启动都是全新实例，关闭后本次会话的全部改动（含临时安装的 Flash Player）随之消失，不残留到主机。

沙盒内程序默认无法访问主机文件系统，唯一例外是 `MappedFolders` 显式映射的目录，本案例靠它把安装脚本送进沙盒。

映射目录是**真实的读写通道**（可设为只读），范围保持最小：只映射安装脚本目录，绝不映射用户主目录或含凭据的路径。

官方文档参考：[Windows 沙盒配置指南 | Microsoft Learn](https://learn.microsoft.com/zh-cn/windows/security/threat-protection/windows-sandbox/windows-sandbox-configure-using-wsb-file)

![Windows 沙盒架构](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230303131900199.png "Windows沙盒架构图")

## 解决方案实施

### 1. 启用 Windows 沙盒功能

确保 Windows 沙盒功能已启用：

1. 打开「控制面板」→「程序」→「启用或关闭 Windows 功能」
2. 勾选「Windows 沙盒」选项
3. 点击「确定」并重启计算机

### 2. 编写批处理脚本

批处理脚本在沙盒内自动完成「连接共享 → 取安装包 → 静默安装」：

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

批处理文件保存在 `C:\SandboxScripts` 目录下：

![批处理脚本位置](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230303134422839.png "批处理脚本存储位置")

### 3. 编写沙盒配置文件

创建 `.wsb` 配置文件定义沙盒环境：

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

保存为 `flashplayer.wsb`：

> 上文脚本之所以绕道网络共享取安装包，是因为 `MappedFolders` 映射源被设为 `<ReadOnly>true</ReadOnly>`：映射目录在沙盒内不可写，无法把文件暂存过去，因此改为先把安装包取到沙盒自身可写的 `Downloads` 目录再执行（`LogonCommand` 直接执行只读目录中的 `.bat` 没有问题，执行只需要读权限）。如果不希望脚本携带共享凭据，可以去掉 `ReadOnly` 并由映射目录直接提供安装包，代价是沙盒对该主机目录获得写入面。

![沙盒配置文件](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230303133712953.png "沙盒配置文件")

### 4. 运行沙盒环境

双击 `flashplayer.wsb` 启动沙盒，系统自动：

1. 启动沙盒环境
2. 映射指定文件夹
3. 执行登录命令安装 Flash Player

![沙盒运行结果](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230303142847558.png "沙盒运行验证")

## 安全注意事项

使用时的安全事项：

1. **数据隔离**：沙盒与主机隔离，沙盒内的软件与配置不会写回主机系统。
2. **临时性**：沙盒关闭后本次会话产生的数据全部丢弃，因此每次启动都需重新安装 Flash Player；若某次会话产生了需要保留的输出（如导出的配置、截图），必须在关闭前主动取出，否则不可恢复。
3. **映射即通道**：`MappedFolders` 是沙盒访问主机文件的唯一显式通道，应保持只读且范围最小；不要映射用户主目录、桌面或任何含凭据的路径。
4. **网络访问**：沙盒默认可访问网络。本案例需要访问共享与打印机管理后台，如需收紧可在主机侧通过防火墙/网络策略限制沙盒可达范围。
5. **凭据暴露面**：映射进沙盒的脚本若含明文凭据，等同于把凭据交给沙盒内运行的所有代码。优先使用共享侧的最小权限账户，并在用完后撤销临时授权。

## 总结

这个需求最终没有靠「在办公机上装 Flash」解决，而是靠 `.wsb` 文件把它压成了双击一下：`MappedFolders` 把安装脚本送进沙盒，`LogonCommand` 在登录时自动执行，关窗即销毁，主机始终不留 Flash Player。

这个方案的成本结构要算清楚。它省掉了虚拟机的镜像维护，但每次启动都要重跑一遍安装，因此只适合「一年点几次」的低频操作；如果某个遗留后台需要每天使用，把凭据和共享路径长期写死在 `.wsb` 里，反而不如一台受控的隔离虚拟机好管。

边界也很清楚：沙盒与主机之间唯一的数据通道就是映射目录，`ReadOnly` 设与不设直接决定沙盒对主机目录有没有写入权，脚本里带不带共享明文凭据决定了暴露面有多大。这三项配置在保存 `.wsb` 时就该按最小权限定死，而不是等用起来再调。

恶意软件初筛、来源不明文档查看、一次性维护工具验证这类需求可以复用同一套模板，只把 `LogonCommand` 换成对应的启动动作。
