---
title: PowerStore 3.x 升级实录：版本兼容、维护窗口与业务验收
date: 2023-07-28 09:40:00
updated: 2026-11-23 17:30:00
tags:
  - 存储
  - PowerStore
categories:
  - 基础设施
keywords: PowerStore, 驱动器固件升级, PowerStoreOS, NDU, 维护窗口
description: 一份 PowerStore 3.x 维护记录，整理目标版本与盘固件的兼容性、群集健康检查、主机多路径和升级后的业务验收。
cover: /img/cover/powersstore-upgrade.jpg
toc: true
copyright: true
---

虚拟机和备份都压在同一套存储上时，升级窗口要同时回答两个问题。阵列升级期间，主机还有没有可用路径？升级结束后，哪些管理操作才能重新开放？这篇是 PowerStore 3.x 的维护记录，菜单和截图来自当时的版本。

## 先定升级路径

旧稿把「先升盘固件，再升系统」写成了通用顺序。Dell 的驱动器固件 FAQ 建议**先升级 PowerStoreOS，再安装与目标版本兼容的盘固件包**。开始前按设备型号、当前版本和目标版本查发行说明，确认是否需要中间版本、适用的健康检查包以及盘固件支持范围。包名里的构建号只能用来识别软件包。

Dell 还记录了一个容易漏掉的情况。部分盘固件更新在 PowerStoreOS 3.0.x 和 3.2.0.x 上可能报告成功，但实际没有更新任何驱动器。以管理界面读到的逐盘固件版本为准。[Dell 盘固件 FAQ](https://www.dell.com/support/kbdoc/en-us/000214519/powerstore-powerstore-drive-firmware-upgrades-and-frequently-asked-questions-faq)

## 维护窗口怎么排

1. 记录每台设备的 OS 和驱动器固件版本、群集健康状态、关键卷的主机连接与多路径状态。对照目标版本的升级文档执行预升级健康检查。遇到阻断项，查清原因后再排期。
2. 从主机侧确认两节点的备用路径可用，并与虚拟化、备份团队对齐维护时间。把计划中的 vVol 创建、迁移和快照任务挪出窗口。具体受限操作以本次版本的升级文档为准。
3. 给管理会话切换、健康检查重跑和业务回验留时间。时间按设备数量、版本路径、现场负载及评估结果安排。盘固件阶段应单独估时，驱动器数量和 I/O 压力都会影响时长。
4. 需要抑制 Call Home 通知时，在 PowerStore Manager 的 **Settings → Support** 里按设备启用维护模式，按预计作业时长设置截止时间，结束后确认通知恢复。

[参照 Dell 的 NDU 准备指南](https://www.dell.com/support/kbdoc/en-us/000183630/powerstore-how-to-prepare-for-a-powerstore-non-disruptive-upgrade-ndu)

## 执行顺序和检查点

当时的版本在 **Settings → Cluster → Upgrades** 上传、选择和安装升级包。点开始前重新核对设备与包版本。启用自动下载的环境也要做这一遍，真正用的是窗口里选中的包。

![PowerStore Manager 的上传入口](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202307280941821.png "上传程序包按钮")

![选择升级文件](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202307280941330.png "选择文件对话框")

| 检查点 | 需要确认的结果 |
| --- | --- |
| PowerStoreOS 升级中 | 从主机侧观察路径和 I/O。管理会话断开时，重连后核对升级任务和群集状态 |
| PowerStoreOS 升级后 | 所有目标节点版本正确，群集健康，主机路径恢复到基线，再进入盘固件阶段 |
| 盘固件升级后 | 在 **Hardware → Drives** 核对适用驱动器的实际固件版本，检查告警是否清除 |
| 恢复变更前 | 验证关键存储路径和代表性业务，确认支持通知恢复，再开放暂停的任务 |

面对失败先保留任务状态和告警。版本不一致、主机路径异常或健康检查阻断时，停止推进并按对应版本的 Dell 指引处理。能否回退取决于当前升级阶段和厂商支持路径，执行前就要确认。

这次最值得保留的是验收顺序。先回读阵列版本，再从主机侧看 I/O，最后让虚拟化和备份恢复任务。维护窗口应该排到业务验证结束。
