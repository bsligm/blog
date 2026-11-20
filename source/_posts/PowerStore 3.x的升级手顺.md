---
title: PowerStore 3.x 的升级手顺
date: 2023-07-28 09:40:00
updated: 2026-11-20 12:00:00
tags:
  - 存储
  - PowerStore
categories:
  - 基础设施
keywords: PowerStore, 驱动器固件升级, PowerStoreOS, NDU, 维护窗口
description: PowerStore 3.x 升级手顺：先驱动器固件后 PowerStoreOS 的顺序约束、Call Home 维护窗口、NDU 期间 vVol 任务不可用的边界、自动下载只下载不安装的坑，以及按设备数量累加的维护窗口估算（单台 1–1.5 小时）。
cover: /medias/featureimages/1.jpg
toc: true
copyright: true
---

DELL EMC PowerStore 3.x 群集的升级分三步：驱动器固件、PowerStoreOS 无中断升级（NDU）、PowerStore T 型号群集升级。顺序不能颠倒——先固件后系统，新 PowerStoreOS 对盘面固件有兼容性要求，反着做会把已升级的节点留在不受支持的组合上。升级期间配置变更与 vVol 等管理任务不可用，需预留维护窗口并完成健康检查。

控制台入口统一写作 **Settings → Cluster → Upgrades**，中文语言包环境是「设置 → 群集 → 升级」，同一入口，下文不再重复。

## 驱动器固件升级

### 1. 禁用 Call Home 通知

防止升级期间向支持部门发 Call Home 警报：

1. **Settings → Support** →「禁用支持通知」
2. 选中要暂停通知的设备，点「修改」
3. 在维护模式面板里勾选「启用维护模式」，指定维护窗口小时数（PowerStore T 型号群集指定 2 小时）
4. 点「应用」，对群集中其他设备重复

### 2. 更新驱动器固件

从 DELL 支持网站下载最新的驱动器固件更新包，然后：

1. 进入 **Settings → Cluster → Upgrades** →「上传程序包」，选中固件包上传，包会显示在软件包表中
2. 在软件包表中选中该包，点「升级」

上传前先确认页面右上角的群集上下文，传错群集等于白升：

![上传程序包](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202307280941821.png "上传程序包按钮")

![选择文件](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202307280941330.png "选择文件对话框")

**验证固件版本**，四种方式任选：

1. REST API（口令写在命令行会进 shell history，建议交互式输入或凭据文件）：
   ```bash
   curl -kv --user admin:<password> -X GET https://<appliance IP>:443/api/rest/software_package?select=* | python -mjson.tool
   ```

2. CLI（`-p` 后留空可交互式输入）：
   ```bash
   pstcli -d xx.xx.xx.xx -u <user> -p <password> software_package show-output nvp | grep -E "name|software_package_type|release_version"
   ```

3. PowerStore Manager：硬件 > 设备 > appliance > 组件 > 驱动器页面

4. 服务命令（`svc_diag` 需 service 账户，`admin` 与 `<user>` 均无权限）：
   ```bash
   svc_diag list --show_drives
   ```

## PowerStoreOS 无中断升级

### 1. 升级准备

1. 上传最新 PowerStoreOS（未启用自动下载时）
2. 查看发行说明
3. 跑升级前运行状况检查与其他必要检查
4. 确认两个节点的主机连接都有备用连接
5. 升级前完成所有配置变更与管理操作——升级期间它们不可用，包括 vVol 虚拟机任务：创建、重启、迁移到其他 ESXi 主机、打快照

### 2. 自动下载

启用 SupportConnect 的群集可从支持网站安全隧道自动拉取更新包（软件包、固件包、语言包、配套检查包），有新包时 Manager 发告警。启用方式：**Settings → Cluster → Upgrades** → 打开 Auto Download。

两点必须清楚：

- **自动下载只下载、不安装**，包落下后仍需手动选中点 Upgrade。
- **新包会覆盖旧包**：同类型出现更高兼容版本时，已上传未安装的包会被替换。维护窗口按特定版本评估过的，下载后先确认包版本再动手，别等到执行当天发现被换过。

## PowerStore T 型号群集升级

### 1. 准备与上传

1. 按上文禁用 Call Home 通知
2. 从支持网站下载最新的 PowerStore T 升级程序包
3. **Settings → Cluster → Upgrades** →「上传程序包」，选中包上传

执行前完整走一遍知识库文章 000183630《如何准备 PowerStore 无中断升级(NDU)》（Dell Support 站点 https://www.dell.com/support 可按编号搜索）。

### 2. 执行

1. 按下一节的单设备操作步骤执行，耗时与会话处理以该节为准
2. PowerStoreOS 升级成功后，在新固件捆绑包可用时升级驱动器固件

> 升级失败时，先解决群集上的所有关键警报再重试。

### 3. 单设备操作步骤

单设备升级约 1–1.5 小时，维护窗口按设备数量累加：

1. 打开 PowerStore Manager，进入 **Settings → Cluster → Upgrades**
2. 包未上传过就先上传（步骤同上）
3. 在软件包表中选中 PowerStore T 升级包，点「升级」
4. 等待完成，期间页面可能返回登录屏幕
5. 跳回登录屏后，**关掉旧浏览器会话、开新会话重新登录**刷新 UI

### 4. 升级过程发生了什么

主设备的主节点会故障切换到辅助节点，管理会话随之断开，Manager 要等故障切换完成才能重新登录。主机 I/O 由 NDU 保证不中断，受影响的是管理面不是数据面——这也是升级窗口内不排配置变更和 vVol 任务的原因。

界面自定义不随升级保留：各列表的列布局装上新版 PowerStoreOS 后重置为默认。依赖自定义列（如按容量使用率排序的视图）的，提前告知，升级后重新配置。

## 总结

- **顺序**：禁 Call Home 开维护模式 → 驱动器固件 → PowerStoreOS，颠倒则节点落在不受支持的固件组合上。
- **估时**：单台 1–1.5 小时按台数累加，不按"一次升级"估。
- **登录屏跳回是正常过程**不是升级失败；完成后必须换新会话登录，否则 UI 还是旧版缓存。
- **vVol 虚拟机任务（创建/迁移/打快照）升级期间全不可用**，提前与虚拟化团队错开。
- **自动下载只取包不安装**；升级失败先清关键警报再重试，别在警报未清时反复提交。
