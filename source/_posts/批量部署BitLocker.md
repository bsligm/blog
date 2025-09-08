---
title: Windows域环境下批量部署BitLocker
date: 2023-02-22 11:00:00
updated: 2023-02-22 11:00:00
tags: 
  - AD域控制器
  - Helpdesk
  - PowerShell
  - 安全
categories: 
  - 基础设施
  - 安全管理
keywords: BitLocker, 批量部署, AD域, 组策略, TPM, 数据加密, 安全管理
description: 详细介绍在Windows域环境下批量部署BitLocker磁盘加密的完整方案，包括DC配置、脚本编写、组策略设置和实施步骤。
cover: /medias/featureimages/6.jpg
toc: true
copyright: true
---

# Windows域环境下批量部署BitLocker

BitLocker是Windows系统提供的全盘加密功能，能够有效保护存储在硬盘上的数据安全。在企业环境中，通过组策略可以实现BitLocker的批量部署和统一管理。本文将详细介绍在Windows域环境下批量部署BitLocker的完整方案。

> **重要提示**：本方案仅适用于具有TPM 2.0芯片的PC设备。

## 域控制器配置

### 1. 启用BitLocker网络解锁功能

在域控制器服务器管理器中添加BitLocker网络解锁角色功能：

1. 打开"服务器管理器"
2. 选择"管理" → "添加角色和功能"
3. 在功能选择中勾选"BitLocker驱动器加密"和"BitLocker网络解锁"
4. 完成安装并向导

![DC添加BitLocker组件](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230221113330078.png "添加BitLocker网络解锁功能")

## 脚本编写

由于PowerShell脚本通过组策略推送时无法以管理员身份运行，因此需要通过批处理文件来执行PowerShell脚本。

### 1. 批处理脚本

创建批处理文件来调用PowerShell脚本：

```batch
@echo off
REM 提取并执行PowerShell脚本部分
for /f "delims=:" %%i in ('findstr /n "^:ps1$" "%~f0"') do (
    more +%%i "%~f0" > "%temp%\bitlocker.ps1"
)
powershell -executionpolicy remotesigned -file "%temp%\bitlocker.ps1"
goto :eof

:ps1
# PowerShell脚本部分
# 检查BitLocker状态
get-bitlockervolume | find "Off"
if ($? -eq $true) {
    # 连接网络共享路径
    net use \\UNC路径 "password" /user:domain\username  
    # 启用BitLocker并保存恢复密钥到网络共享
    manage-bde -on C: -RecoveryPassword >> \\UNC路径\$env:COMPUTERNAME.txt
}
else {
    exit
}
```

> **说明**：上述脚本为批处理代码，其中包含了PowerShell脚本部分。

### 2. 脚本功能说明

该脚本的主要功能包括：
1. 检查当前系统C盘的BitLocker状态
2. 如果未启用，则连接到指定的网络共享路径
3. 启用C盘的BitLocker加密
4. 将恢复密钥保存到网络共享路径下的以计算机名命名的文本文件中

## 组策略配置

### 1. 创建BitLocker组策略对象

1. 打开"组策略管理编辑器"
2. 创建新的组策略对象（GPO）用于BitLocker配置

![创建BitLocker GPO](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230221110312204.png "创建BitLocker组策略对象")

### 2. 配置BitLocker恢复信息存储

导航到：`计算机配置` → `策略` → `管理模板` → `Windows组件` → `BitLocker驱动器加密`

将"将BitLocker恢复信息储存在active directory域服务中"设置为**已启用**。

### 3. 配置操作系统驱动器加密策略

导航到：`计算机配置` → `策略` → `管理模板` → `Windows组件` → `BitLocker驱动器加密` → `操作系统驱动器`

将"选择如何才能恢复BitLocker保护的操作系统驱动器"设置为**已启用**。

![BitLocker驱动器加密配置](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230221111148766.png "操作系统驱动器加密设置")

### 4. 配置关机脚本

创建另一个组策略对象用于执行关机脚本：

1. 创建新的GPO用于关机脚本执行
2. 导航到：`计算机配置` → `Windows设置` → `脚本(启动/关机)` → `关机`
3. 添加之前创建的批处理脚本

![关机脚本配置](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230221112332612.png "关机脚本设置")

## 实施步骤

按照以下步骤实施BitLocker批量部署：

### 1. 链接组策略对象

将上述两条GPO链接到需要开启BitLocker的组织单位（OU）。

### 2. 更新组策略

在客户端执行以下命令强制更新组策略：

```cmd
gpupdate /force
```

### 3. 执行重启

重启客户端计算机以触发BitLocker加密过程。

### 4. 验证部署结果

1. 检查网络共享路径下是否存在以计算机名命名的文本文件
2. 确认恢复密钥已成功重定向保存

![恢复密钥文件](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230221112816203.png "恢复密钥文件")

### 5. 验证AD备份

检查域控制器中计算机账户是否已备份BitLocker恢复密钥：

![AD中BitLocker密钥备份](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/image-20230221113029252.png "AD中密钥备份")

## 安全建议

1. **TPM芯片**：确保所有目标设备都配备TPM 2.0芯片
2. **网络共享安全**：保护存储恢复密钥的网络共享路径
3. **备份策略**：定期备份AD中的BitLocker恢复信息
4. **用户培训**：向用户说明BitLocker的作用和注意事项
5. **监控告警**：建立BitLocker状态监控机制

## 故障排除

### 1. 脚本执行失败
- 检查PowerShell执行策略
- 验证网络共享路径访问权限
- 确认脚本路径正确

### 2. BitLocker启用失败
- 检查TPM状态
- 确认系统满足BitLocker要求
- 查看系统事件日志

### 3. 恢复密钥未保存
- 验证组策略配置
- 检查网络连接
- 确认AD权限设置

## 总结

通过本文介绍的方案，可以在Windows域环境中实现BitLocker的批量部署和统一管理。该方案具有以下优势：

1. **自动化程度高**：通过组策略实现无人值守部署
2. **安全性强**：恢复密钥自动备份到AD和网络共享
3. **管理便捷**：集中管理加密策略
4. **可扩展性好**：适用于大规模部署场景

建议在生产环境中部署前：
1. 在测试环境中充分验证
2. 制定详细的回滚计划
3. 建立完善的监控机制
4. 做好用户沟通和培训