---
title: Windows域环境下批量部署BitLocker
date: 2023-02-22 11:00:00
updated: 2026-11-19 11:00:00
tags:
  - AD域控制器
  - Helpdesk
  - PowerShell
  - 安全
categories:
  - 基础设施
  - 安全管理
keywords: BitLocker, 批量部署, AD域, 组策略, TPM, 数据加密, 安全管理
description: 在 Windows 域环境下批量部署 BitLocker 磁盘加密的完整方案，涵盖 DC 组件准备、启动脚本编写、组策略配置与实施验证。
cover: /medias/featureimages/6.jpg
toc: true
copyright: true
---

BitLocker 是 Windows 自带的全盘加密功能，可在设备丢失或被盗时保护硬盘数据。在域环境中，借助组策略可以完成策略下发、批量启用与恢复密钥集中备份，无需逐台操作。

本文给出一套已验证的落地方案，包含四个环节：域控制器组件准备 → 客户端启动脚本 → 组策略配置 → 实施与验证。

**前置条件**

- 客户端已加入域，且域控制器承担 DNS 角色。
- 客户端具备 TPM 2.0 芯片。本方案按 TPM 2.0 的「仅 TPM 解锁」路径设计，未包含 TPM 1.2 与无 TPM 设备：这两类设备需要额外的启动 PIN、启动密钥或 USB 起始盘，加密器策略与用户交互流程均不同，应单独设计，不与本方案混用同一 GPO。
- 已准备一个供客户端写入恢复密钥的网络共享，客户端计算机账户对其具备写入权限。

> **风险提示**：磁盘加密属于不可逆操作，且加密过程耗时较长。务必先在测试 OU 验证，并确认恢复密钥备份链路可用后再扩大范围。

## 域控制器配置

### 1. 启用 BitLocker 网络解锁功能

在域控制器的服务器管理器中添加 BitLocker 相关功能：

1. 打开"服务器管理器"
2. 选择"管理" → "添加角色和功能"
3. 在功能选择中勾选"BitLocker 驱动器加密"和"BitLocker 网络解锁"
4. 完成安装向导

「BitLocker 驱动器加密」与「BitLocker 网络解锁」属于**功能**而非**角色**，两者在不同 Windows Server 版本中的分组位置可能略有差异；下图为本文当时操作界面的截图，实际操作请对照本机向导中的功能列表确认。

![DC 添加 BitLocker 组件](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230221113330078.png "添加BitLocker网络解锁功能")

## 脚本编写

组策略启动/关机脚本虽以 SYSTEM 身份运行，但直接下发 `.ps1` 会受到执行策略与调用方式差异影响，因此采用「批处理包 PowerShell」形式：同一个 `.bat` 文件内含 PowerShell 主体，批处理部分只负责把它提取出来并调用，分发时只需一个文件。

### 1. 批处理脚本

脚本逻辑：定位 `:ps1` 标记行 → 导出其后的内容为临时 `.ps1` → 判断系统盘状态 → 若从未加密则启用 BitLocker 并输出恢复密钥。

```batch
@echo off
REM 定位 :ps1 标记所在行号
for /f "delims=:" %%i in ('findstr /n "^:ps1$" "%~f0"') do set "PS1START=%%i"

REM 按行号截取 PowerShell 主体。
REM 不用 more +行号：more 会按控制台宽度硬折行并改写换行符，
REM 脚本较长或含中文时导出的 .ps1 会被静默破坏
powershell -NoProfile -Command "Get-Content -LiteralPath '%~f0' | Select-Object -Skip %PS1START% | Set-Content -LiteralPath (Join-Path $env:TEMP 'bitlocker.ps1') -Encoding UTF8"
powershell -NoProfile -ExecutionPolicy remotesigned -File "%TEMP%\bitlocker.ps1"
goto :eof

:ps1
# 仅检查系统盘，避免多数据盘场景误判
$vol = Get-BitLockerVolume -MountPoint 'C:'

# ProtectionStatus = Off 只说明「保护未开启」，已加密但暂停保护的设备同样是 Off；
# 叠加判断 EncryptionStatus，才能区分「从未加密」与「已加密/暂停保护」
if ($vol.ProtectionStatus -eq 'Off' -and $vol.EncryptionStatus -eq 'Off') {
    # 若已给「Domain Computers」授予共享写权限，关机脚本以 SYSTEM 运行可直接写入，无需本行
    net use "\\服务器\共享" "<口令>" /user:"<域>\<账号>"

    # 启用加密，并将输出追加到以计算机名命名的文本文件
    manage-bde -on C: -RecoveryPassword >> "\\服务器\共享\$env:COMPUTERNAME.txt"
}
```

> **原判定条件的问题**：旧写法 `get-bitlockervolume | find "Off"` 后接 `if ($? -eq $true)`，`$?` 反映的是 `find` 是否命中，而不是加密状态本身；多盘场景下任一卷含 `Off` 就会误触发，而「已加密但暂停保护」同样命中 `Off`，会导致对已加密卷重复发起操作。现改为基于 `ProtectionStatus` 与 `EncryptionStatus` 两个字段联合判定。验证命令：`(Get-BitLockerVolume -MountPoint 'C:').ProtectionStatus`。

> **凭据处理**：`net use` 仅为保底写法，会把明文凭据写进分发到 SYSVOL 的脚本。更稳妥的做法是在共享 ACL 中给「Domain Computers」赋予修改权限，由计算机账户直接写入，脚本中不出现任何账号与口令。

> **可选简化**：如果不想依赖行号截取，可以直接拆成 `.bat` 与 `.ps1` 两个文件，组策略分发时一同放入 SYSVOL 共享，批处理只负责调用同目录的 `.ps1`。

### 2. 脚本执行流程

1. 读取客户端系统盘的 BitLocker 保护状态与加密状态。
2. 仅在「从未加密」时继续，避免对已加密或暂停保护的设备重复发起操作。
3. 启用 C 盘加密，并把 `manage-bde` 输出落盘到网络共享。

> **恢复密钥两种存放方式的定位**：`>>` 重定向写入的是 `manage-bde` 的**控制台输出文本**（含 48 位恢复密钥段落与卷信息），**不是** `.vrk` 密钥容器文件，两者不能相互替代。本方案同时保留共享落盘与下文的 AD 备份：AD 备份是运维查询与恢复的**主用渠道**（可在「Active Directory 用户和计算机」中按恢复密码对象检索）；共享文本文件是旁路兜底，用于 AD 备份失败或需要脱机归档的场景。若不需要双写，可只保留 AD 备份并删除脚本中的重定向。

## 组策略配置

### 1. 创建 BitLocker 组策略对象

1. 打开"组策略管理编辑器"
2. 创建新的组策略对象（GPO）用于 BitLocker 配置

![创建 BitLocker GPO](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230221110312204.png "创建BitLocker组策略对象")

### 2. 配置 BitLocker 恢复信息存储

导航到：`计算机配置` → `策略` → `管理模板` → `Windows组件` → `BitLocker驱动器加密`

将「将 BitLocker 恢复信息存储在 Active Directory 域服务中」设置为**已启用**。

### 3. 配置操作系统驱动器加密策略

导航到：`计算机配置` → `策略` → `管理模板` → `Windows组件` → `BitLocker驱动器加密` → `操作系统驱动器`

将「选择如何才能恢复受 BitLocker 保护的操作系统驱动器」设置为**已启用**，并在选项中勾选「允许 BitLocker 在没有附加用户认证的情况下启动」及「将恢复密码存储在 Active Directory 中」，否则客户端可能因策略要求附加认证而无法自动解锁。

![BitLocker 驱动器加密配置](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230221111148766.png "操作系统驱动器加密设置")

### 4. 配置关机脚本

另建一个 GPO 用于下发脚本：

1. 创建新的 GPO 用于关机脚本执行。
2. 导航到：`计算机配置` → `Windows 设置` → `脚本(启动/关机)` → `关机`。
3. 添加上文创建的批处理脚本。

![关机脚本配置](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230221112332612.png "关机脚本设置")

> **关机脚本的超时风险**：BitLocker 加密在脚本触发后才真正开始，而组策略脚本执行存在默认超时限制，超时后可能被强制终止，导致加密未完成即关机（下次开机会继续，但用户会感知到关机明显变慢）。生产环境应评估组策略中脚本执行超时相关设置（具体策略名称与默认值随 Windows 版本不同，请以本机组策略编辑器为准），并优先考虑改为**启动脚本**触发，或改用运维工具批量下发。务必在测试 OU 实测关机耗时后再确定触发方式。

## 实施步骤

按照以下步骤实施 BitLocker 批量部署：

### 1. 链接组策略对象

将上述两条 GPO 链接到需要开启 BitLocker 的组织单位（OU）。

### 2. 更新组策略

在客户端执行以下命令强制更新组策略：

```cmd
gpupdate /force
```

### 3. 执行重启

重启客户端计算机以触发 BitLocker 加密过程。

### 4. 验证部署结果

1. 在客户端执行 `manage-bde -status`，确认「转换状态」由「加密百分比」逐步推进到「完全加密」。
2. 检查网络共享路径下是否存在以计算机名命名的文本文件，并确认其中包含 48 位恢复密钥段落。

![恢复密钥文件](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230221112816203.png "恢复密钥文件")

### 5. 验证 AD 备份

在域控制器上打开「Active Directory 用户和计算机」，为目标计算机账户开启「查看器功能」，检查其下的 `BitLocker Recovery Password` 对象是否已生成：

![AD 中 BitLocker 密钥备份](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230221113029252.png "AD中密钥备份")

## 安全建议

1. **TPM 芯片**：确认目标设备具备 TPM 2.0；TPM 1.2 与无 TPM 设备需按上文单独设计启动认证方式。
2. **网络共享安全**：恢复密钥文件等同明文口令，共享必须限制为最小可访问范围，并启用 SMB 加密与访问审计。
3. **备份策略**：定期备份 AD 中的 BitLocker 恢复信息，并验证可检索、可导出。
4. **双通道留存**：AD 备份与共享文本至少保留一条可用链路；设备重装或脱域后 AD 对象可能丢失，脱机归档更稳妥。
5. **用户告知**：提前说明加密期间设备性能下降、不要强制断电，以及恢复密钥的获取流程。
6. **监控告警**：建立加密状态与密钥备份失败的监控，避免「已加密但无密钥」的最坏情况。

## 故障排除

### 1. 脚本执行失败

- 检查 PowerShell 执行策略与脚本文件编码（含中文时建议 UTF-8 with BOM）。
- 验证网络共享访问权限：关机脚本以 SYSTEM 运行，需确认计算机账户或脚本内凭据可写入。
- 确认 `%TEMP%` 下已生成 `bitlocker.ps1`，且内容与 `:ps1` 之后一致（截取失败时文件可能为空）。

### 2. BitLocker 启用失败

- 检查 TPM 状态：在客户端执行 `Get-Tpm`，确认 `TpmPresent` 与 `TpmReady` 均为 `True`。
- 确认系统满足 BitLocker 要求（UEFI/BIOS 与安全启动配置、未存在遗留恢复分区异常）。
- 查看事件日志 `Application and Services Logs → Microsoft → Windows → BitLocker-API`。

### 3. 恢复密钥未保存

- 验证组策略是否生效：`gpresult /r` 或 `gpresult /h report.html`。
- 检查关机时的网络连通性（关机阶段网络栈可能已降级，可考虑启用「关闭前等待网络」相关策略）。
- 确认 AD 侧权限：计算机账户需具备在自身对象下创建 `msFVE-RecoveryInformation` 子对象的权限（默认满足，被自定义 ACL 收紧时需复查）。

## 总结

借助「组策略下发 + 关机/启动脚本触发 + AD 集中备份」这条链路，可以在域环境中实现 BitLocker 的批量启用与统一管理：

1. **自动化程度高**：策略与脚本随 OU 链接自动下发，无需逐台操作。
2. **密钥可控**：恢复密钥自动备份到 AD，并有共享文本兜底。
3. **策略集中**：加密要求、允许启动方式、备份行为统一由 GPO 管理。
4. **可扩展**：按 OU 灰度推进即可覆盖大规模终端。

上线前建议完成四件事：

1. 在测试 OU 完整验证「加密完成 → 密钥可在 AD 检索 → 实际用恢复密钥解锁」全链路，而不只是确认加密已启动。
2. 制定回滚计划（`manage-bde -off C:` 的降级耗时同样可观，需提前告知用户）。
3. 建立加密状态与密钥备份失败的监控。
4. 提前与用户沟通关机变慢、加密期间不要强制断电等影响。
