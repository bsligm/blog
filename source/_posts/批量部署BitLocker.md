---
title: Windows域环境下批量部署BitLocker
date: 2023-02-22 11:00:00
updated: 2026-11-20 12:00:00
tags:
  - AD域控制器
  - Helpdesk
  - PowerShell
  - 安全
categories:
  - 基础设施
  - 安全管理
keywords: BitLocker, 批量部署, AD域, 组策略, TPM 2.0, 恢复密钥
description: 域环境批量部署 BitLocker：bat 包 ps1 脚本（ProtectionStatus+EncryptionStatus 联合判定）、GPO 配置，恢复密钥双通道留存（AD 对象 + 共享文本兜底）。
cover: /img/cover/bitlocker.jpg
toc: true
copyright: true
---

BitLocker 补上设备侧的一环：账号在域上，密码会泄露，盘里的数据不能只靠登录密码守着。域环境里靠组策略完成策略下发、批量启用与恢复密钥集中备份，不用逐台操作。这篇给出一套已验证的落地方案：域控制器组件准备 → 客户端脚本 → 组策略配置 → 实施与验证。

## 关键设计决策

- **仅 TPM 解锁，不叠加启动 PIN**：办公机放人看得到、锁得住的物理位置，TPM 密封的启动密钥已能防拆盘偷读；叠加 PIN 换来的是每次开机多一步交互，批量环境里摩擦成本不成比例。TPM 1.2 与无 TPM 设备策略完全不同（启动密钥/USB 起始盘），单独设计，不共用同一 GPO。
- **恢复密钥集中托管给域（AD Recovery）**：密钥落在计算机对象的 `msFVE-RecoveryInformation` 子对象下，随 AD 复制与备份走，运维不用维护第二份清单；脚本里的共享文本重定向是旁路兜底，不是主渠道。
- **关机脚本触发而非启动脚本**：下班关机是批量窗口，加密耗时与「关机变慢」的体感绑定在一起，用户接受度好于开机等加密；代价是组策略脚本有默认超时，超时被强杀会留下「半程加密」，需在测试 OU 实测后决定是否调整（策略名与默认值随版本不同，以本机编辑器为准）。

**前置条件**

- 客户端已入域，域控制器承担 DNS 角色。
- 客户端具备 TPM 2.0。本方案按「仅 TPM 解锁」路径设计，不含 TPM 1.2 与无 TPM 设备：这类设备需要启动 PIN、启动密钥或 USB 起始盘，加密策略与交互流程都不同，应单独设计，不共用同一 GPO。
- 已有一个供客户端写恢复密钥的网络共享，计算机账户对其有写权限。

> **磁盘加密接近不可逆且耗时长，务必先在测试 OU 验证、确认恢复密钥备份链路可用后再扩大范围。**

## 域控制器配置

在服务器管理器里添加 BitLocker 相关功能：

1. 「管理」→「添加角色和功能」
2. 功能选择中勾选「BitLocker 驱动器加密」和「BitLocker 网络解锁」
3. 完成安装向导

两者属于**功能**而非**角色**，在不同 Windows Server 版本里分组位置可能略有差异，以本机向导的功能列表为准。下图为当时操作界面：

![DC 添加 BitLocker 组件](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230221113330078.png "添加BitLocker网络解锁功能")

## 脚本

组策略启动/关机脚本虽以 SYSTEM 身份运行，但直接下发 `.ps1` 受执行策略与调用方式差异影响，所以采用「批处理包 PowerShell」：同一个 `.bat` 内含 PowerShell 主体，批处理部分只负责提取并调用，分发只需一个文件。

### 1. 批处理脚本

逻辑：定位 `:ps1` 标记行 → 导出其后内容为临时 `.ps1` → 判断系统盘状态 → 从未加密则启用 BitLocker 并输出恢复密钥。

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

> **判定条件为什么是两个字段**：旧写法 `get-bitlockervolume | find "Off"` 后接 `if ($? -eq $true)`，`$?` 反映的是 `find` 是否命中而非加密状态；多盘时任一卷含 `Off` 就误触发，「已加密但暂停保护」同样命中 `Off`，会对已加密卷重复发起操作。现改为 `ProtectionStatus` 与 `EncryptionStatus` 联合判定。验证：`(Get-BitLockerVolume -MountPoint 'C:').ProtectionStatus`。

> **凭据处理**：`net use` 只是保底写法，会把明文凭据写进分发到 SYSVOL 的脚本。更稳妥的是在共享 ACL 给「Domain Computers」修改权限，由计算机账户直接写入，脚本里不出现账号口令。

> **可选简化**：不想依赖行号截取，就拆成 `.bat` 与 `.ps1` 两个文件一同分发，批处理只调用同目录的 `.ps1`。

### 2. 执行流程

1. 读系统盘的保护状态与加密状态。
2. 仅「从未加密」时继续。
3. 启用 C 盘加密，`manage-bde` 输出落盘到网络共享。

> **恢复密钥两种存放方式的定位**：`>>` 重定向写入的是 `manage-bde` 的**控制台输出文本**（含 48 位恢复密钥段落），**不是** `.vrk` 密钥容器，两者不能互相替代。本方案双写：AD 备份是运维查询与恢复的**主用渠道**（「Active Directory 用户和计算机」里可按恢复密码对象检索）；共享文本是旁路兜底，用于 AD 备份失败或脱机归档。不双写就只留 AD 备份并删掉脚本里的重定向。

## 组策略配置

### 1. 创建 BitLocker GPO

「组策略管理编辑器」里新建 GPO 用于 BitLocker 配置：

![创建 BitLocker GPO](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230221110312204.png "创建BitLocker组策略对象")

### 2. 恢复信息存储

`计算机配置` → `策略` → `管理模板` → `Windows组件` → `BitLocker驱动器加密`：

「将 BitLocker 恢复信息存储在 Active Directory 域服务中」设为**已启用**。

### 3. 操作系统驱动器加密策略

同目录下 `操作系统驱动器`：

「选择如何才能恢复受 BitLocker 保护的操作系统驱动器」设为**已启用**，选项勾选「允许 BitLocker 在没有附加用户认证的情况下启动」与「将恢复密码存储在 Active Directory 中」——不勾前者，客户端可能因策略要求附加认证而无法自动解锁。

![BitLocker 驱动器加密配置](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230221111148766.png "操作系统驱动器加密设置")

### 4. 关机脚本

另建一个 GPO 下发脚本：

1. 新建 GPO。
2. `计算机配置` → `Windows 设置` → `脚本(启动/关机)` → `关机`。
3. 添加上文的批处理脚本。

![关机脚本配置](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230221112332612.png "关机脚本设置")

> **超时风险已在设计决策里说明**。触发方式定之前先在测试 OU 实测关机耗时；如果实测不超时且希望更稳，可改**启动脚本**触发或改用运维工具批量下发。

## 实施

1. **链接 GPO**：两条 GPO 链接到要开 BitLocker 的 OU。
2. **更新组策略**：客户端 `gpupdate /force`。
3. **重启**：触发加密。
4. **验证部署**：
   - 客户端 `manage-bde -status`，确认「转换状态」从「加密百分比」推进到「完全加密」。
   - 共享下存在以计算机名命名的文本文件，且含 48 位恢复密钥段落。

![恢复密钥文件](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230221112816203.png "恢复密钥文件")

5. **验证 AD 备份**：「Active Directory 用户和计算机」里给目标计算机账户开「查看器功能」，确认其下已生成 `BitLocker Recovery Password` 对象。

![AD 中 BitLocker 密钥备份](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230221113029252.png "AD中密钥备份")

## 安全建议

1. **TPM**：目标设备须 TPM 2.0；TPM 1.2 与无 TPM 设备单独设计启动认证。
2. **共享安全**：恢复密钥文件等同明文口令，共享限最小可访问范围，启用 SMB 加密与访问审计。
3. **备份**：定期备份 AD 中的 BitLocker 恢复信息，验证可检索、可导出。
4. **双通道留存**：AD 备份与共享文本至少保一条可用链路；重装或脱域后 AD 对象可能丢，脱机归档更稳。
5. **用户告知**：提前说明加密期间性能下降、不要强制断电、恢复密钥怎么取。
6. **监控告警**：加密状态与密钥备份失败都要有监控，避免「已加密但无密钥」。

## 故障排除

### 1. 脚本执行失败

- PowerShell 执行策略与脚本编码（含中文建议 UTF-8 with BOM）。
- 共享写权限：关机脚本以 SYSTEM 运行，确认计算机账户或脚本内凭据可写。
- `%TEMP%` 下 `bitlocker.ps1` 是否生成且内容与 `:ps1` 之后一致（截取失败时文件可能为空）。

### 2. BitLocker 启用失败

- 客户端 `Get-Tpm`，确认 `TpmPresent` 与 `TpmReady` 均为 `True`。
- 系统是否满足 BitLocker 要求（UEFI/BIOS 与安全启动配置、遗留恢复分区异常）。
- 事件日志 `Application and Services Logs → Microsoft → Windows → BitLocker-API`。

### 3. 恢复密钥未保存

- `gpresult /r` 或 `gpresult /h report.html` 验证组策略生效。
- 关机时网络连通性（关机阶段网络栈可能已降级，可启用「关闭前等待网络」相关策略）。
- AD 侧权限：计算机账户需能在自身对象下创建 `msFVE-RecoveryInformation` 子对象（默认满足，被自定义 ACL 收紧时复查）。

## 总结

方案的价值不在脚本本身，而在挂在 OU 上：新计算机对象落进该 OU 就自动纳入加密范围，不用人登录终端执行。恢复密钥走 AD 的 `msFVE-RecoveryInformation` 子对象，兜底再落一份共享文本，管理动作全部收敛在组策略一侧。

- **测试 OU 先跑通「加密完成 → AD 检索到密钥 → 真用这串密钥解锁一次」**。只确认加密启动不够：密钥备份失败在客户端往往静默，等硬盘真要恢复发现 AD 里没对象，就晚了。
- **降级路径按最坏成本划**：`manage-bde -off C:` 解密耗时与加密同量级，推下去就很难快速撤回，灰度范围按这个成本定。
- **提前和用户打招呼**：启用当天关机明显变慢，加密期间强制断电触发完整性重新校验——这部分沟通成本比技术实施更高。
- **加密状态与密钥备份失败要有监控**，否则整套设计的可恢复性只存在于「没人出事」的假设里。
