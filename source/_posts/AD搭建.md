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

在部署域控制器时需要注意以下重要事项：

- 在生产环境中部署域控制器前，建议先在测试环境中进行验证
- 确保 DNS 设置正确，域控制器通常也是 DNS 服务器
- 建议配置静态 IP 地址以确保域服务的稳定性
- 定期备份 AD 域数据，防止意外情况导致数据丢失

## 总结

通过以上步骤，我们完成了 Windows Server 系统的安装以及 AD 域服务的配置。AD 域服务的部署是构建企业网络环境的重要基础，掌握其安装和配置方法对于系统管理员来说至关重要。

在实际应用中，还需要根据具体需求进行更详细的配置，如：

- 组织单位（OU）结构设计
- 组策略配置
- 用户和计算机账户管理
- 信任关系配置
- 备份和恢复策略制定

建议在正式部署前制定详细的规划文档，并在测试环境中充分验证后再应用到生产环境。
