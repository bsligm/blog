---
title: PowerStore 3.x 的升级手顺
date: 2023-07-28 09:40:00
updated: 2026-11-19 09:40:00
tags:
  - 存储
  - PowerStore
categories:
  - 基础设施
keywords: PowerStore, 升级, 存储, DELL EMC, 企业存储
description: 详细介绍 DELL EMC PowerStore 3.x 版本的升级步骤，包括驱动器固件升级、无中断软件升级和 PowerStore T 型号软件升级等关键操作流程。
cover: /medias/featureimages/1.jpg
toc: true
copyright: true
---

本手顺适用于 DELL EMC PowerStore 3.x 群集，覆盖三类操作：驱动器固件升级、PowerStoreOS 无中断软件升级（NDU）与 PowerStore T 型号群集升级。升级期间群集的配置变更及 vVol 等管理任务不可用，需预留维护窗口并提前完成健康检查；建议先升级驱动器固件，再做软件升级。

## 驱动器固件升级

在进行软件升级之前，建议先升级驱动器固件以确保最佳兼容性和性能。

### 1. 禁用 Call Home 通知

手动禁用通知，以防止在软件升级期间向支持部门发送 Call Home 警报。

**操作步骤：**

1. 在设置页面上，选择支持部分中的"禁用支持通知"
2. 选择要为其暂停通知的设备，然后单击"修改"
3. 在修改维护模式滑出面板中：
   - 选中"启用维护模式"选项
   - 在"维护窗口持续时间"字段中指定小时数（对于 PowerStore T 型号群集，指定 2 小时）
4. 单击"应用"
5. 对群集中的任何其他设备重复此过程

### 2. 更新驱动器固件

**准备工作：**
从 DELL 支持网站下载最新的驱动器固件更新包。驱动器固件更新包包含 PowerStore 群集中驱动器的固件更新。

**升级步骤：**

1. 选择 Settings 图标，然后选择 Cluster 部分中的 Upgrades
2. 选择"上传程序包"
3. 在文件选择对话框中选中驱动器固件更新程序包，然后选择"打开"
4. 驱动器固件更新程序包将上传并显示在软件包表中
5. 在软件包表中选择驱动器固件更新程序包，然后选择"升级"

上传入口与文件选择界面分别如下，注意确认页面右上角的群集上下文后再上传：

![上传程序包](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202307280941821.png "上传程序包按钮")

![选择文件](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202307280941330.png "选择文件对话框")

**验证方法：**

可以通过以下方式验证驱动器固件版本：

1. 运行 REST API 调用（口令以 `admin:<password>` 形式给出，写在命令行会进入 shell history，建议改用交互式输入或凭据文件）：
   ```bash
   curl -kv --user admin:<password> -X GET https://<appliance IP>:443/api/rest/software_package?select=* | python -mjson.tool
   ```

2. 运行 CLI 命令（`<password>` 同样会进入 shell history，可在 `-p` 后留空交互式输入）：
   ```bash
   pstcli -d xx.xx.xx.xx -u <user> -p <password> software_package show-output nvp | grep -E "name|software_package_type|release_version"
   ```

3. 在 PowerStore Manager 中查看：
   硬件 > 设备 > appliance > 组件 > 驱动器页面

4. 运行服务命令（`svc_diag` 需使用 service 账户，`admin` 与 `<user>` 均无权限执行）：
   ```bash
   svc_diag list --show_drives
   ```

## PowerStore 无中断软件升级

PowerStore 支持无中断软件升级（NDU），可以在不影响业务的情况下完成系统升级。

### 1. 升级准备

在开始升级之前，请完成以下准备工作：

1. 获取最新 PowerStoreOS 并将其上传到系统（如果未启用自动下载）
2. 查看发行说明
3. 运行升级前运行状况检查和其他必要的系统运行状况检查工具
4. 确保两个节点的主机连接都有备用连接
5. 在升级之前完成配置更改或管理操作，因为在进行升级时这些更改或管理操作不可用
   - 这些管理操作包括 vVol 虚拟机任务，例如创建虚拟机、重新启动虚拟机、将虚拟机迁移到其他 ESXi 主机以及创建虚拟机快照

### 2. 自动下载升级程序包

对于已启用支持连接的系统，当更新程序包在支持网站上推出时，可以自动将其下载到系统。

**功能特点：**
- 更新包将通过支持连接安全隧道安全地传输到您的系统
- 自动下载适用于软件更新程序包、驱动器固件更新程序包、适用的语言包和兼容的运行状况检查程序包
- 当各种更新程序包类型都可使用较新的兼容程序包时，最新自动下载的程序包会覆盖在升级页面上先前已准备好安装的任何较旧程序包
- 当系统上有新的升级程序包可用时，您会在 PowerStore Manager 中收到警报通知

**启用方法：**
1. 选择设置图标
2. 在群集部分选择升级
3. 启用自动下载

> **注意：** 自动下载不会在系统上安装任何更新程序包，它只会将它们从支持网站下载到您的系统上，以供手动安装。您必须选择特定的下载程序包，然后选择升级按钮以安装它。

## PowerStore T 软件升级

PowerStore T 型号的软件升级需要特别注意升级顺序和时间安排。

### 1. 升级准备

**准备工作：**
1. 手动关闭通知，以防止在软件升级期间向支持部门发送 Call Home 警报
2. 从支持网站下载最新的 PowerStore T 升级程序包
3. 将软件升级包上传到 PowerStore Manager

**上传步骤：**
1. 在 PowerStore Manager 中，选择设置图标
2. 选择群集部分中的升级
3. 选择上传程序包
4. 选择要上传的 PowerStore T 型号升级程序包，然后选择打开

### 2. 执行升级

在升级 PowerStore T 型号群集之前，请仔细查看并执行知识库文章 000183630《如何准备 PowerStore 无中断升级(NDU)》中的步骤；该编号可在 Dell Support 站点（https://www.dell.com/support）直接搜索获取。

**升级步骤：**
1. 按下一节《升级 PowerStore T 型号群集上的软件》操作步骤执行，升级耗时与升级后的会话处理以该节为准
2. 成功升级 PowerStoreOS 软件后，请在新固件捆绑包可用时升级驱动器固件

> **注意：** 如果软件升级过程失败，请查看并解决群集上的所有关键警报，然后重试升级。

## 升级 PowerStore T 型号群集上的软件

使用 PowerStore Manager 升级 PowerStore T 型号群集上的节点固件和 PowerStoreOS。单个设备的升级约需 1 小时至 1.5 小时，规划维护窗口时按设备数量累加。

### 1. 操作步骤

1. 打开 PowerStore Manager
2. 选择 Settings 图标，然后选择 Cluster 部分中的 Upgrades
3. 如果尚未将 PowerStore T 型号软件升级程序包上传到 PowerStore Manager：
   - 选择上传程序包
   - 选择要上传的 PowerStore T 型号软件升级程序包，然后选择打开
   - PowerStore T 型号软件升级程序包会上传到 PowerStore Manager 并显示在软件包表中
4. 在软件包表中选择 PowerStore T 型号软件升级程序包，然后选择升级
5. 等待升级完成，期间页面可能返回登录屏幕
6. 返回登录屏幕后，关闭浏览器会话并打开新会话，然后再次登录以刷新 UI

### 2. 升级结果

在软件升级过程中会发生以下情况：

- 主设备的主节点将故障切换到设备的辅助节点
- 您将从 PowerStore Manager 断开连接
- 在故障切换过程完成后，您可以重新登录到 PowerStore Manager

**重要提示：**
- 安装新版本的 PowerStoreOS 时，PowerStore Manager 表中的列布局设置将重置为其默认布局
- 升级 PowerStoreOS 时，对 PowerStore Manager 中的列布局设置的更改不会保留

## 总结

PowerStore 3.x 的升级过程需要仔细规划和执行。通过遵循本文档中的步骤，您可以安全地完成系统升级，确保业务连续性和系统稳定性。

建议在升级前：
1. 详细阅读官方发行说明
2. 在测试环境中验证升级过程
3. 确保有足够的维护窗口时间
4. 准备好回滚计划
5. 通知相关业务部门升级时间安排
