---
title: JumpServer 单节点无外置数据库部署
date: 2023-10-18 13:40:00
updated: 2026-11-20 12:00:00
tags:
  - 基础设施
  - 堡垒机
  - 系统运维
categories:
  - 系统运维
  - 安全管理
keywords: JumpServer, 堡垒机, 单节点部署, 离线安装, LDAP, 资产授权
description: JumpServer 单节点 + 内置数据库的离线部署：jmsctl 安装与配置项取舍、LDAP 对接、资产纳管与用户组授权、SECRET_KEY 一致性约束、录像备份恢复演练与高频故障排查。
cover: /medias/featureimages/4.jpg
toc: true
copyright: true
---

JumpServer 是开源堡垒机，提供身份认证、账号管理、授权控制与操作审计四类能力。这篇记录**单节点 + 内置数据库**的离线部署：不引入外置 MySQL/Redis，持久化由安装器自带容器承担，适合依赖要少的中小型环境；要高可用或大容量录像，改外置数据库方案，那是另一套部署参数。

流程：环境要求 → 离线安装 → 系统配置（认证/资产/用户/授权）→ 安全建议 → 常见问题。

## 基础设施要求

| 项 | 要求 |
| --- | --- |
| 系统 | Ubuntu 20.04 / CentOS 7.6 及以上 |
| CPU | ≥2 核 |
| 内存 | ≥4 GB |
| 磁盘 | ≥50 GB 可用，录像与任务日志写入 `VOLUME_DIR`，按审计保留期估算 |
| 网络 | 下载安装包需外网，离线环境提前下载拷入；80、2222、33061、33062、63790 端口空闲 |

系统依赖（Debian/Ubuntu）：

```bash
sudo apt update
sudo apt install wget curl tar gettext iptables
```

RHEL/CentOS 系：

```bash
sudo yum install -y wget curl tar gettext iptables
```

> 包名随发行版版本有差异（新版用 `dnf`，`iptables` 可能被 `nftables` 替代），以本机软件源实际提供的包为准。

## 部署过程

### 1. 下载安装包

按 CPU 架构从[官方下载页](https://community.fit2cloud.com/#/download/jumpserver/v3-7-2)取离线安装包。

### 2. 安装包处理

```bash
# 移动安装包到/opt目录
mv jumpserver-offline-installer-v*.tar.gz /opt

# 进入/opt目录并解压
cd /opt
tar -xf jumpserver-offline-installer-v*.tar.gz

# 以解压出的实际目录名为准，记录到变量后续复用
JMS_DIR="$(ls -d /opt/jumpserver-offline-* | head -n1)"
echo "安装目录: $JMS_DIR"
cd "$JMS_DIR"
```

> **目录名以解压结果为准**：包名与解压目录名并不总是一致（例如离线包 `jumpserver-offline-installer-v*`，解压目录可能是 `jumpserver-offline-release-v3.7.2-amd64`）。先 `ls /opt` 确认真实目录名再 `cd`，下文统一以 `$JMS_DIR` 指代。

### 3. 配置文件

可不改，默认配置能装。

```bash
sudo vim config-example.txt
```

> `config-example.txt` 只是安装期模板，**安装器据此生成实际生效的 `/opt/jumpserver/config/config.txt`**；装完再调参要改后者并重启服务，改模板不生效。

#### 关键配置项

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

交互向导会依次问是否用外置数据库、外置 Redis 等，本方案**全部选 `n`**（全用自带内置容器）；误选 `y` 会转而要外部连接地址与凭据，与本方案不符。

```bash
# 安装
./jmsctl.sh install

# 启动
./jmsctl.sh start
```

### 5. 管理命令

常用命令（在 `$JMS_DIR` 下执行）：

```bash
cd "$JMS_DIR"   # 上文解压得到的实际目录名

# 启动
./jmsctl.sh start

# 停止
./jmsctl.sh down

# 卸载
./jmsctl.sh uninstall

# 帮助
./jmsctl.sh -h
```

### 6. 访问

```text
地址: http://<JumpServer服务器IP地址>:<服务运行端口>
用户名: admin
密码: admin
```

![JumpServer 登录界面](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202310181002748.png "JumpServer登录界面")

> **`admin/admin` 是出厂默认账户，仅首次登录有效**，登录后强制改密。日常运维改用专用管理员账户并开启 MFA。

## 系统配置

接住运维流量前按顺序配四件事：LDAP 认证 → 资产纳管 → 用户与用户组 → 资产授权。顺序不是习惯：用户来源先固定，才谈得上按组授权；资产先纳管，授权才有引用对象。组与资产文件夹这两层搭好后再写规则，后续扩容只往组与文件夹里加成员，规则不用改。

### 1. LDAP 对接

对接企业 AD 域做统一认证，不在堡垒机内维护一套独立账号：

1. 「系统设置」→「认证设置」→「LDAP 设置」
2. 填 LDAP 服务器地址、绑定账户与密码、Base DN

最容易配错的是 Base DN 与用户过滤条件：范围填小同步不到人，填大会把服务账号、停用账号一起拉进来，比本地账号更难收敛。绑定账户只要读取权限，不用域管理员。

配完先「测试连接」，再「同步」拉一次核对用户数量。测试通过但同步不到人，多半是过滤条件或 Base DN 问题，不是密码错。堡垒机内保留一个本地管理员账户作为 LDAP 故障时的登录通道，其余用户全走域认证。

![LDAP 设置步骤 1](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202310181007029.png "LDAP设置界面")

![LDAP 设置步骤 2](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202310181007281.png "LDAP同步设置")

### 2. 资产纳管

1. 「控制台」→「资产管理」→「资产列表」→「创建」
2. 填 IP、协议与端口，归入对应资产节点（文件夹）

协议与端口填的是 JumpServer 主动连接目标机的地址：SSH 走 22、RDP 走 3389，填错会在连接阶段报超时而不是配置校验错。资产节点层级值得提前设计——它既是授权作用域，也是按业务线批量放权的单位，事后重新分组要逐条改授权规则。

被纳管一侧要放通堡垒机到目标端口的访问。端口不通时错误发生在连接阶段，容易被误判成账号密码错误，先确认网络可达再查凭据。

![创建资产信息](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202310181010659.png "资产创建界面")

### 3. 用户与用户组

授权对象是用户组不是个人，先把组划出来：

1. 「用户管理」→「用户列表」：本地用户手工建，域用户从 LDAP 同步
2. 按业务线或运维职责建用户组，把用户分进组

日常加人只改组成员，不动授权规则；对个人直接授权会留下一条规则，人员流动时没人记得回收，这是权限膨胀最常见的路径。反过来也要留意：域用户离职调岗后，同步不一定会自动收回已有授权，账号禁用与规则回收仍需人工确认一次。

![用户管理](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202310181014686.png "用户列表")

![用户组管理](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202310181014272.png "用户组列表")

### 4. 资产授权

授权规则把「谁」能以「哪个账号」访问「哪些资产」绑在一起：

1. 「控制台」→「权限管理」→「资产授权」
2. 对用户或用户组，按资产文件夹、节点或单资产授权

作用域尽量选资产文件夹而不是逐台单点，规则数量可控，回收只改一处。「账号」决定用户落到目标机用哪个身份：root/Administrator 长期授予用户组，审计日志里就只剩「某人用了 root」，追责能力大打折扣。更稳的做法：每人独立目标账号，特权账号按需申请且带有效期。

![资产权限分配](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202310181017807.png "资产授权界面")

## 安全建议

三条必须单独盯住的：

1. **`SECRET_KEY` 与 `BOOTSTRAP_TOKEN` 一致性**。纳管账号的凭据由 `SECRET_KEY` 加密落库，容器重建、升级、整机迁移都必须沿用旧值，换新则既有密文全部解不开，只能逐台重录；`BOOTSTRAP_TOKEN` 不一致表现为组件注册不上。两者要离线留存一份并与数据库备份放在一起，否则单独备份数据库没有恢复价值。
2. **`VOLUME_DIR` 的备份与恢复**。该目录（示例 `/data/jumpserver`）同时承载数据库、任务日志与录像，单节点形态下与系统数据同故障域。按审计保留期倒推容量、单独备份，**实际做过一次恢复**而不是只确认备份文件存在；录像缺失等于审计能力缺失。
3. **特权账号收敛**。堡垒机的价值在把 root/Administrator 从人手里收走；授权规则仍长期授予这些账号，追责能力与纳管前没区别。按「独立账号优先、特权账号按需申请且带有效期」收敛，定期复查长期未使用的授权规则。

## 常见问题

### 1. 端口冲突

改**实际生效的** `/opt/jumpserver/config/config.txt` 中对应端口项（`HTTP_PORT`、`SSH_PORT`、`MAGNUS_*_PORT`）后重启服务；只改 `config-example.txt` 不生效。

### 2. 启动失败

先确认 Docker 正常（`systemctl status docker`、`docker ps -a`），对异常容器 `docker logs <容器名>` 看报错。常见原因：端口占用、`DOCKER_SUBNET` 与现有网段冲突、磁盘空间不足。

### 3. LDAP 同步失败

依次核对：主机到 LDAP 的网络与端口连通性、绑定账户的搜索权限、Base DN 与过滤条件是否匹配。测试连接通过但同步不到人，通常是过滤条件或 Base DN 范围问题，不是凭据问题。

## 总结

- 形态取舍：依赖少、部署快、备份点集中；代价是数据库与录像同盘同容器，无高可用。
- 单机内能收口的两件事：HTTP 换 HTTPS；`/data/jumpserver` 备份并**实际做一次恢复演练**——没演练过不算有可用性。
- 单机收口不了的：主机故障即全员失去运维通道，要么把可接受的恢复时间写出来由使用方认可，要么改外置数据库与高可用方案。
- 特权账号收敛不是一次性动作，按安全建议第 3 条定期复查。
