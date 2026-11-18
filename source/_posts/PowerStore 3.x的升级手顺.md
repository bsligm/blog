---
title: PowerStore 3.x的升级手顺
date: 2023-07-28 09:40:00
updated: 2023-07-28 09:40:00
tags:
  - 存储
  - PowerStore
categories:
  - 基础设施
keywords: PowerStore, 升级, 存储, DELL EMC, 企业存储
description: 详细介绍DELL EMC PowerStore 3.x版本的升级步骤，包括驱动器固件升级、无中断软件升级和PowerStore T型号软件升级等关键操作流程。
cover: /medias/featureimages/1.jpg
toc: true
copyright: true
---

# PowerStore 3.x的升级手顺

DELL EMC PowerStore是新一代企业级存储解决方案，具有高性能、高可靠性和易于管理的特点。为了确保系统稳定性和获得最新功能，定期升级PowerStore系统是必要的。本文将详细介绍PowerStore 3.x版本的升级步骤。

## 驱动器固件升级

在进行软件升级之前，建议先升级驱动器固件以确保最佳兼容性和性能。

### 1. 禁用Call Home通知

手动禁用通知，以防止在软件升级期间向支持部门发送Call Home警报。

**操作步骤：**

1. 在设置页面上，选择支持部分中的"禁用支持通知"
2. 选择要为其暂停通知的设备，然后单击"修改"
3. 在修改维护模式滑出面板中：
   - 选中"启用维护模式"选项
   - 在"维护窗口持续时间"字段中指定小时数（对于PowerStore T型号群集，指定2小时）
4. 单击"应用"
5. 对群集中的任何其他设备重复此过程

### 2. 更新驱动器固件

**准备工作：**
从DELL支持网站下载最新的驱动器固件更新包。驱动器固件更新包包含PowerStore群集中驱动器的固件更新。

**升级步骤：**

1. 选择Settings图标，然后选择Cluster部分中的Upgrades
2. 选择"上传程序包"
   
   ![上传程序包](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202307280941821.png "上传程序包按钮")
   
   ![选择文件](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202307280941330.png "选择文件对话框")

3. 选择驱动器固件更新程序包，然后选择"打开"
4. 驱动器固件更新程序包将上传并显示在软件包表中
5. 在软件包表中选择驱动器固件更新程序包，然后选择"升级"

**验证方法：**

可以通过以下方式验证驱动器固件版本：

1. 运行REST API调用：
   ```bash
   curl -kv --user admin:xxxxx -X GET https://<appliance IP>:443/api/rest/software_package?select=* | python -mjson.tool
   ```

2. 运行CLI命令：
   ```bash
   pstcli -d xx.xx.xx.xx -u <user> -p <password> software_package show-output nvp |egrep "name|software_package_type|release_version"
   ```

3. 在PowerStore Manager中查看：
   硬件 > 设备 > appliance > 组件 > 驱动器页面

4. 运行服务命令：
   ```bash
   svc_diag list --show_drives
   ```

## PowerStore无中断软件升级

PowerStore支持无中断软件升级（NDU），可以在不影响业务的情况下完成系统升级。

### 1. 升级准备

在开始升级之前，请完成以下准备工作：

1. 获取最新PowerStoreOS并将其上传到系统（如果未启用自动下载）
2. 查看发行说明
3. 运行升级前运行状况检查和其他必要的系统运行状况检查工具
4. 确保两个节点的主机连接都有备用连接
5. 在升级之前完成配置更改或管理操作，因为在进行升级时这些更改或管理操作不可用
   - 这些管理操作包括vVol虚拟机任务，例如创建虚拟机、重新启动虚拟机、将虚拟机迁移到其他ESXi主机以及创建虚拟机快照

### 2. 自动下载升级程序包

对于已启用支持连接的系统，当更新程序包在支持网站上推出时，可以自动将其下载到系统。

**功能特点：**
- 更新包将通过支持连接安全隧道安全地传输到您的系统
- 自动下载适用于软件更新程序包、驱动器固件更新程序包、适用的语言包和兼容的运行状况检查程序包
- 当各种更新程序包类型都可使用较新的兼容程序包时，最新自动下载的程序包会覆盖在升级页面上先前已准备好安装的任何较旧程序包
- 当系统上有新的升级程序包可用时，您会在PowerStore Manager中收到警报通知

**启用方法：**
1. 选择设置图标
2. 在群集部分选择升级
3. 启用自动下载

> **注意：** 自动下载不会在系统上安装任何更新程序包，它只会将它们从支持网站下载到您的系统上，以供手动安装。您必须选择特定的下载程序包，然后选择升级按钮以安装它。

## PowerStore T软件升级

PowerStore T型号的软件升级需要特别注意升级顺序和时间安排。

### 1. 升级准备

**准备工作：**
1. 手动关闭通知，以防止在软件升级期间向支持部门发送Call Home警报
2. 从支持网站下载最新的PowerStore T升级程序包
3. 将软件升级包上传到PowerStore Manager

**上传步骤：**
1. 在PowerStore Manager中，选择设置图标
2. 选择群集部分中的升级
3. 选择上传程序包
4. 选择要上传的PowerStore T型号升级程序包，然后选择打开

### 2. 执行升级

在升级PowerStore T型号群集之前，请仔细查看并执行知识库文章000183630"如何准备PowerStore无中断升级(NDU)"中的步骤。

**升级步骤：**
1. 执行升级PowerStore T型号群集上的软件中的步骤
2. 每个设备的PowerStore T型号软件升级需要大约一个小时到一个半小时才能完成
3. 成功升级PowerStoreOS软件后，请在新固件捆绑包可用时升级驱动器固件

> **注意：** 如果软件升级过程失败，请查看并解决群集上的所有关键警报，然后重试升级。

## 升级PowerStore T型号群集上的软件

使用PowerStore Manager来升级PowerStore T型号群集上的节点固件和PowerStoreOS。

### 1. 操作步骤

1. 打开PowerStore Manager
2. 选择Settings图标，然后选择Cluster部分中的Upgrades
3. 如果尚未将PowerStore T型号软件升级程序包上传到PowerStore Manager：
   - 选择上传程序包
   - 选择要上传的PowerStore T型号软件升级程序包，然后选择打开
   - PowerStore T型号软件升级程序包会上传到PowerStore Manager并显示在软件包表中
4. 在软件包表中选择PowerStore T型号软件升级程序包，然后选择升级
5. 每个设备的PowerStore T型号软件升级需要大约一个小时到一个半小时才能完成
6. 返回登录屏幕后，关闭浏览器会话并打开新会话，然后再次登录以刷新UI

### 2. 升级结果

在软件升级过程中会发生以下情况：

- 主设备的主节点将故障切换到设备的辅助节点
- 您将从PowerStore Manager断开连接
- 在故障切换过程完成后，您可以重新登录到PowerStore Manager

**重要提示：**
- 安装新版本的PowerStoreOS时，PowerStore Manager表中的列布局设置将重置为其默认布局
- 升级PowerStoreOS时，对PowerStore Manager中的列布局设置的更改不会保留

## 总结

PowerStore 3.x的升级过程需要仔细规划和执行。通过遵循本文档中的步骤，您可以安全地完成系统升级，确保业务连续性和系统稳定性。

建议在升级前：
1. 详细阅读官方发行说明
2. 在测试环境中验证升级过程
3. 确保有足够的维护窗口时间
4. 准备好回滚计划
5. 通知相关业务部门升级时间安排