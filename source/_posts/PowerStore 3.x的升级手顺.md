---
title: PowerStore 3.x 的升级手顺
date: 2023-07-28 09:40:00
updated: 2026-11-19 15:30:00
tags:
  - 存储
  - PowerStore
categories:
  - 基础设施
keywords: PowerStore, 升级, 存储, DELL EMC, 企业存储
description: DELL EMC PowerStore 3.x 升级手顺：先驱动器固件、后 PowerStoreOS 的顺序约束，Call Home 维护窗口的设置，NDU 期间不可用的 vVol 管理任务，以及按设备数量估算维护窗口。
cover: /medias/featureimages/1.jpg
toc: true
copyright: true
---

本手顺适用于 DELL EMC PowerStore 3.x 群集，覆盖三类操作：驱动器固件升级、PowerStoreOS 无中断软件升级（NDU）与 PowerStore T 型号群集升级。升级期间群集的配置变更及 vVol 等管理任务不可用，需预留维护窗口并提前完成健康检查；建议先升级驱动器固件，再做软件升级。

控制台入口路径本文统一写作 **Settings → Cluster → Upgrades**，装了中文语言包的环境对应「设置 → 群集 → 升级」，是同一入口，下文不再重复标注。

## 驱动器固件升级

先升驱动器固件再升 PowerStoreOS。新版 PowerStoreOS 对盘面固件有兼容性要求，反过来的顺序会让已升级的节点运行在不受支持的固件组合上，此时的告警与回退都比先升固件麻烦。

### 1. 禁用 Call Home 通知

手动禁用通知，以防止在软件升级期间向支持部门发送 Call Home 警报。

**操作步骤：**

1. 进入 **Settings → Support**，选择「禁用支持通知」
2. 选择要为其暂停通知的设备，然后单击「修改」
3. 在修改维护模式滑出面板中：
   - 选中「启用维护模式」选项
   - 在「维护窗口持续时间」字段中指定小时数（对于 PowerStore T 型号群集，指定 2 小时）
4. 单击「应用」
5. 对群集中的任何其他设备重复此过程

### 2. 更新驱动器固件

**准备工作：**
从 DELL 支持网站下载最新的驱动器固件更新包。驱动器固件更新包包含 PowerStore 群集中驱动器的固件更新。

**升级步骤：**

1. 进入 **Settings → Cluster → Upgrades**
2. 选择「上传程序包」
3. 在文件选择对话框中选中驱动器固件更新程序包，然后选择「打开」
4. 驱动器固件更新程序包将上传并显示在软件包表中
5. 在软件包表中选择驱动器固件更新程序包，然后选择「升级」

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

已启用支持连接（SupportConnect）的群集可以从支持网站的安全隧道自动拉取更新包，覆盖软件更新包、驱动器固件更新包、语言包和配套的运行状况检查包。有新包时 PowerStore Manager 会发告警通知。

启用方式：**Settings → Cluster → Upgrades** → 打开 Auto Download。

两点必须清楚：

- **自动下载只下载、不安装**。包落到系统上后仍需手动选中并点 Upgrade 才会执行，别把它当成「已经更新了」。
- **新包会覆盖旧包**。同一类型出现更高兼容版本时，之前在升级页准备好但未安装的包会被替换。如果维护窗口是按某个特定版本评估的，下载后先确认包版本再动手，不要等到执行当天才发现被换过。

## PowerStore T 软件升级

PowerStore T 型号的软件升级需要特别注意升级顺序和时间安排。

### 1. 升级准备

**准备工作：**
1. 手动关闭通知，以防止在软件升级期间向支持部门发送 Call Home 警报
2. 从支持网站下载最新的 PowerStore T 升级程序包
3. 将软件升级包上传到 PowerStore Manager

**上传步骤：**
1. 在 PowerStore Manager 中进入 **Settings → Cluster → Upgrades**
2. 选择「上传程序包」，选中 PowerStore T 型号升级程序包后点「打开」

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
2. 进入 **Settings → Cluster → Upgrades**
3. 如果尚未将 PowerStore T 型号软件升级程序包上传到 PowerStore Manager：
   - 选择上传程序包
   - 选择要上传的 PowerStore T 型号软件升级程序包，然后选择打开
   - PowerStore T 型号软件升级程序包会上传到 PowerStore Manager 并显示在软件包表中
4. 在软件包表中选择 PowerStore T 型号软件升级程序包，然后选择升级
5. 等待升级完成，期间页面可能返回登录屏幕
6. 返回登录屏幕后，关闭浏览器会话并打开新会话，然后再次登录以刷新 UI

### 2. 升级结果

升级过程中主设备的主节点会故障切换到辅助节点，管理会话随之断开，PowerStore Manager 需要等故障切换完成后重新登录。期间主机 I/O 由 NDU 保证不中断，受影响的是管理面而非数据面——这也是为什么升级窗口内不要安排配置变更和 vVol 任务。

界面自定义不随升级保留：PowerStore Manager 各列表的列布局在装上新版 PowerStoreOS 后重置为默认。如果运维团队依赖自定义列（比如按容量使用率排序的视图），提前告知，升级后需重新配置。

## 总结

这条升级链路的顺序不能颠倒：先禁 Call Home 通知并开维护模式，再升驱动器固件，最后才做 PowerStoreOS 的无中断升级。固件先行的原因是新系统对盘面兼容性有新要求，反过来做会把已升级的节点留在不受支持的组合上。

维护窗口的长度由设备数量决定：单台设备约 1 至 1.5 小时，群集按台数累加，不能按「一次升级」估时。期间主设备主节点会故障切换到辅助节点，管理会话会被断开，页面跳回登录屏属于正常过程而非升级失败；升级完成后必须关掉旧浏览器会话重新登录，否则 UI 仍是旧版本缓存。

三件容易踩空的事：升级期间 vVol 相关的虚拟机任务（创建、迁移、打快照）全部不可用，需提前与虚拟化团队错开时间；PowerStore Manager 的列布局设置在升级后会被重置为默认，有人依赖自定义视图的话提前说明；自动下载只负责把程序包取到系统上，不会自行安装，别把它当成已更新。

若升级失败，先处理群集上的所有关键警报再重试，不要在警报未清的情况下反复提交升级。
