---
title: Jump server单节点无外置数据库部署
date: 2023-10-18 13:40:00
updated: 2026-11-19 13:40:00
tags:
  - 基础设施
  - 堡垒机
  - 系统运维
categories:
  - 系统运维
  - 安全管理
keywords: JumpServer, 堡垒机, 单节点部署, 离线安装, Linux, 安全运维
description: 详细介绍JumpServer堡垒机单节点无外置数据库的部署过程，包括环境准备、安装配置、LDAP对接、资产管理等完整操作步骤。
cover: /medias/featureimages/4.jpg
toc: true
copyright: true
---

# Jump server单节点无外置数据库部署

JumpServer是全球首款完全开源、符合4A规范的运维安全审计系统，提供了身份验证、账号管理、授权控制和安全审计等功能。本文将详细介绍JumpServer单节点无外置数据库的部署过程。

## 基础设施要求

在开始部署之前，请确保满足以下基础设施要求：

### 1. 硬件环境
- Linux主机环境（推荐使用Ubuntu 20.04或CentOS 7.6及以上版本）
- CPU：2核及以上
- 内存：4GB及以上
- 硬盘：50GB及以上可用空间

### 2. 网络环境
- 可访问外网的网络环境（用于下载安装包）
- 确保相关端口未被占用（80、2222、33061、33062、63790等）

### 3. 系统依赖
安装必要的系统工具：

```bash
sudo apt update
sudo apt install wget curl tar gettext iptables
```

## 部署过程

### 1. 下载安装包

访问JumpServer官方下载页面，根据Linux主机CPU架构下载对应的离线安装包：

[JumpServer下载页面](https://community.fit2cloud.com/#/download/jumpserver/v3-7-2)

### 2. 安装包处理

将下载的安装包移动到`/opt`目录并解压：

```bash
# 移动安装包到/opt目录
mv jumpserver-offline-installer-v*.tar.gz /opt

# 进入/opt目录并解压
cd /opt
tar -xf jumpserver-offline-installer-v*.tar.gz

# 进入解压后的目录
cd jumpserver-offline-installer-v*
```

### 3. 配置文件修改

根据实际情况配置config文件，也可以不做任何修改使用默认配置：

```bash
sudo vim config-example.txt
```

#### 重要配置项说明

```bash
# JumpServer configuration file example.
#
# 如果不了解用途可以跳过修改此配置文件, 系统会自动填入
# 完整参数文档 https://docs.jumpserver.org/zh/master/admin-guide/env/

################################## 镜像配置 ###################################
#
# 国内连接 docker.io 会超时或下载速度较慢, 开启此选项使用华为云镜像加速
# DOCKER_IMAGE_MIRROR=1

################################## 安装配置 ###################################
#
# JumpServer 数据库持久化目录, 默认情况下录像、任务日志都在此目录
# 请根据实际情况修改, 升级时备份的数据库文件(.sql)和配置文件也会保存到该目录
#
VOLUME_DIR=/data/jumpserver

# 加密密钥, 迁移请保证 SECRET_KEY 与旧环境一致, 请勿使用特殊字符串
# (*) Warning: Keep this value secret.
# (*) 勿向任何人泄露 SECRET_KEY
#
SECRET_KEY=

# 组件向 core 注册使用的 token, 迁移请保持 BOOTSTRAP_TOKEN 与旧环境一致,
# 请勿使用特殊字符串
# (*) Warning: Keep this value secret.
# (*) 勿向任何人泄露 BOOTSTRAP_TOKEN
#
BOOTSTRAP_TOKEN=

# 日志等级 INFO, WARN, ERROR
#
LOG_LEVEL=ERROR

# JumpServer 容器使用的网段, 请勿与现有的网络冲突, 根据实际情况自行修改
#
DOCKER_SUBNET=192.168.250.0/24

################################## 访问配置 ###################################
# 对外提供服务端口, 如果与现有服务冲突请自行修改
#
HTTP_PORT=80
SSH_PORT=2222
MAGNUS_MYSQL_PORT=33061
MAGNUS_MARIADB_PORT=33062
MAGNUS_REDIS_PORT=63790
```

### 4. 执行安装

安装JumpServer（单节点，无外置数据库部署，全部选择n）：

```bash
# 安装
./jmsctl.sh install

# 启动
./jmsctl.sh start
```

### 5. 验证安装

安装完成后，JumpServer配置文件路径为：`/opt/jumpserver/config/config.txt`

常用管理命令：

```bash
cd /opt/jumpserver-offline-release-v3.7.2-amd64

# 启动
./jmsctl.sh start

# 停止
./jmsctl.sh down

# 卸载
./jmsctl.sh uninstall

# 帮助
./jmsctl.sh -h
```

### 6. 访问JumpServer

安装成功后，通过浏览器访问JumpServer：

```
地址: http://<JumpServer服务器IP地址>:<服务运行端口>
用户名: admin
密码: admin
```

![JumpServer登录界面](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202310181002748.png "JumpServer登录界面")

> **重要提示**：首次登录后请立即修改默认密码，确保系统安全。

## 系统配置

部署完成后需要进行系统配置，包括资产配置、用户管理、LDAP对接以及安全策略设置等。

### 1. LDAP对接配置

通过LDAP对接可以实现与企业AD域的集成，统一用户认证：

1. 登录JumpServer管理后台
2. 进入"系统设置" → "认证设置" → "LDAP设置"
3. 配置LDAP服务器信息

![LDAP设置步骤1](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202310181007029.png "LDAP设置界面")

![LDAP设置步骤2](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202310181007281.png "LDAP同步设置")

### 2. 资产配置

添加需要管理的服务器资产：

1. 点击"控制台" → "资产管理" → "资产列表"
2. 点击"创建"按钮添加新资产
3. 填写资产信息，包括IP地址、协议、端口等

![创建资产信息](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202310181010659.png "资产创建界面")

### 3. 用户与用户组管理

创建用户和用户组以便进行权限分配：

1. 进入"用户管理" → "用户列表"
2. 创建用户或从LDAP同步用户
3. 创建用户组并分配用户

![用户管理](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202310181014686.png "用户列表")

![用户组管理](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202310181014272.png "用户组列表")

### 4. 资产权限分配

根据业务需求对资产进行权限分配：

1. 进入"控制台" → "权限管理" → "资产授权"
2. 根据需求对资产文件夹、OU或单个资产对用户或用户组进行授权

![资产权限分配](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202310181017807.png "资产授权界面")

## 安全建议

1. **密码安全**：定期更换管理员密码，使用复杂密码策略
2. **访问控制**：严格控制访问JumpServer的IP范围
3. **日志审计**：定期检查操作日志，发现异常行为
4. **备份策略**：定期备份`/data/jumpserver`目录下的数据
5. **版本更新**：关注JumpServer官方更新，及时升级到最新稳定版本

## 常见问题

### 1. 端口冲突
如果默认端口被占用，需要修改config-example.txt中的端口配置。

### 2. 启动失败
检查Docker服务是否正常运行，查看日志文件获取详细错误信息。

### 3. LDAP同步失败
确认LDAP服务器配置正确，网络连通性正常。

## 总结

通过以上步骤，您已经成功部署了JumpServer单节点无外置数据库环境。JumpServer作为开源堡垒机解决方案，能够有效提升企业运维安全水平，实现操作审计和权限控制。

建议在生产环境中部署时：
1. 使用HTTPS协议保护数据传输安全
2. 配置高可用方案确保服务连续性
3. 制定完善的权限管理策略
4. 定期进行安全评估和漏洞扫描
