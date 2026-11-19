---
title: Windows Server安装以及AD域服务搭建
date: 2021-05-06 11:00:00
updated: 2026-11-19 11:00:00
tags:
  - Server
  - Helpdesk
  - Windows
categories:
  - 桌面维护
  - 服务器管理
keywords: Windows Server, AD域, 服务器安装, 域控制器, Active Directory
description: 详细介绍Windows Server系统的安装过程以及AD域服务的配置步骤，包括系统安装、角色配置、域控制器部署等关键环节，帮助系统管理员快速搭建企业级域环境。
cover: /medias/featureimages/0.jpg
toc: true
copyright: true
---

Active Directory（AD）域服务提供集中式的身份认证、账号与资源管理能力，是 Windows 域环境的基石。本文记录从裸机安装 Windows Server 到完成域控制器（DC）部署的完整流程：安装方式选择 → 系统基础配置 → 添加 AD 角色 → 提升为域控制器 → 结果验证。

适用于新建小型域环境，或为现有域增补域控的场景。执行前需具备 Windows Server 安装镜像，以及服务器物理访问权限或带外管理接口访问权限。

## 系统安装准备

安装服务器系统的方式有很多，除常规的 U 盘安装介质外，也可以通过 iDRAC 等带外管理接口挂载镜像远程安装。

### 1. U 盘安装方式

使用 U 盘安装介质时需要注意以下事项：

- 如果服务器有阵列卡，需要提前到品牌官网下载对应驱动，否则可能无法识别磁盘
- 准备好 Windows Server 安装镜像文件和可启动的 U 盘

### 2. 远程管理安装方式

以 DELL 服务器为例，使用 iDRAC（IPMI 接口，各家厂商名称不同）进行安装：

- 在 BIOS 中配置好 iDRAC，并接入本地局域网便于日后管理，或者使用网线直连 PC
- DELL 服务器 iDRAC 的默认管理地址通常为 192.168.0.120（以随机标签与机型文档为准）
- 线缆连接完成后在 BIOS 中配置地址以及管理密码

### 3. 服务器开机从镜像启动

开机后按自检画面提示的快捷键进入一次性启动菜单（Dell 机型通常为 `F11`，其他机型以画面提示为准），选择 U 盘或 iDRAC 虚拟光驱作为启动设备。

下图为安装程序的语言与版本选择界面，注意区分「带桌面体验」与 Server Core 版本，两者的图形管理工具可用性不同：

![系统安装](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081509096.png "系统安装界面")

确认版本后，安装程序开始复制文件并展开镜像，期间服务器会自动重启数次，无需人工干预：

![安装过程](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081509385.png "安装过程界面")

镜像展开完成后，需设置内置 Administrator 账户的密码，之后即可首次登录：

![完成安装](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081509728.png "安装完成界面")

## 系统基础配置

在安装完成 Windows Server 系统后，需要进行一些基础配置：

### 1. 更改计算机名和固定 IP 地址

- 更改计算机名为易于识别的名称
- 配置静态 IP 地址以确保服务稳定性
- 完成配置后重启服务器使设置生效

![更改计算机名](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081509513.png "更改计算机名界面")

![固定 IP 地址](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081509381.png "配置静态IP地址界面")

## 域服务安装与配置

### 1. 添加角色功能

添加 AD 域服务功能以及 DHCP 服务（如果由交换机、路由器、防火墙等分配可忽略）：

![添加域服务功能](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081509842.png "添加AD域服务角色")

确认域服务安装：

![域服务确认安装](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081509441.png "域服务安装确认")

### 2. 配置域控制器

将服务器提升为域控制器：

#### 步骤 1：启动域控制器部署向导

点击提示中的"部署后配置"，选择"将服务器提升为域控制器"：

![启动域控制器部署](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081509594.png "启动域控制器部署向导")

#### 步骤 2：部署新域与域名

配置新域和域名信息：

![部署新域与域名](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081510494.png "配置域名信息")

#### 步骤 3：配置域控制器与 DNS 服务

设置域控制器和 DNS 服务选项：

![配置域控与 DNS 服务](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081510311.png "配置域控制器和DNS服务")

#### 步骤 4：其他选项及安装

配置其他安装选项：

![其他选项及安装](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081510564.png "其他安装选项")

#### 步骤 5：设置目录服务还原模式密码

为目录服务还原模式设置密码：

![设置 DSRM 密码](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081510798.png "设置DSRM密码")

#### 步骤 6：确认配置选项

检查并确认所有配置选项：

![确认配置选项](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081510256.png "确认配置选项")

#### 步骤 7：预安装检查

执行预安装检查以确保所有要求都满足：

![预安装检查](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081510759.png "预安装检查")

#### 步骤 8：完成安装

安装完成后重启服务器，域控制器部署完成：

![安装完成](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081510752.png "安装完成界面")

## 验证域控制器功能

安装完成后，通过以下方式验证域控制器功能是否正常：

1. 打开"服务器管理器"，查看"通知"区域是否有错误信息
2. 使用"Active Directory 用户和计算机"管理工具查看域结构
3. 在客户端计算机上尝试加入域

## 注意事项

- **DNS 是硬依赖**。域控制器同时承担 DNS 角色，网卡的 DNS 必须指向本机（或已有的域内 DNS），指向公网 DNS 会导致 SRV 记录解析不到、客户端加域失败。
- **上游转发单独配**。域内 DNS 接管后要在条件转发器或根提示里补上外部解析出口，否则内网解析正常、外网全断，容易被误判成域服务故障。
- **静态 IP 不可协商**。地址变更会让 `_msdcs` 区域记录与实际地址不一致，故障表现为间歇性登录变慢而非直接报错，排查成本很高。
- **备份要含 System State**。只备份文件卷无法还原 AD 数据库，域控备份必须走包含 System State 的方案，并确认备份窗口早于复制周期。

## 总结

这台域控制器的交付路径很短：装系统 → 改计算机名与静态 IP → 添加 AD DS（按需含 DHCP）角色 → 提升为域控制器并集成 DNS → 重启后以「服务器管理器通知无报错、ADUC 可见域结构、客户端成功加域」三步收口。

链路里有两处事后很难补救：域名与 NetBIOS 域名上线后再变更代价极高，向导第 2 步就要按最终命名填写；DSRM 密码是 AD 数据库异常时唯一的本地登录通道，必须纳入密码保管流程，不能作为向导里一次性的过场。

到这里只完成了一台域控制器的交付，投产前还需补齐三项：

1. **第二台域控制器**。单台 DC 故障期间加域、域登录、组策略刷新全部不可用，System State 备份的权威副本也随之失效。
2. **还原演练**。域控备份必须包含 System State，并且实际做过一次非授权还原；「备份任务成功」不等于具备恢复能力。
3. **时间同步与站点规划**。PDC Emulator 指向可靠 NTP 源——Kerberos 对时间偏差敏感；多场地部署要提前在「AD 站点和服务」登记子网，否则客户端会跨场地认证与复制。

组织单位划分、组策略体系、账户生命周期属于域稳定后的持续治理，与本文的部署交付是两个阶段，不宜在同一窗口内一起改动。
