---
title: JumpServer 单节点无外置数据库部署
date: 2023-10-18 13:40:00
updated: 2026-11-23 22:35:00
tags:
  - 基础设施
  - 堡垒机
  - 系统运维
categories:
  - 系统运维
  - 安全管理
keywords: JumpServer, 堡垒机, 单节点部署, 离线安装, LDAP, 资产授权
description: 2023 年 JumpServer v3.7.2 单节点离线部署记录，重点是 LDAP、资产授权、同故障域权衡与数据库、录像和恢复配置的验收。
cover: /img/cover/jumpserver-oss.jpg
toc: true
copyright: true
---

这是 2023 年 JumpServer v3.7.2 系列的单节点离线部署记录。目标是用较少的外部依赖，把登录、资产授权和会话审计放到同一个入口。安装器自带数据库与 Redis 容器，因此部署可以在同一台主机完成。下面的安装包、组件和界面只对应当时版本。

单节点让第一次交付和排障更集中，也把数据库、录像和服务绑在同一故障域。数据库放到外部只能解除其中一项依赖。若要求宿主机故障后仍可建立会话，还需要分别设计应用入口、连接组件、录像存储和恢复验收。后来我把几个环节拆开处理，见 [JumpServer 企业版部署与健壮性工程](/2026/11/20/JumpServer企业版部署与健壮性工程/)。

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

按 CPU 架构从[官方下载页](https://community.fit2cloud.com/#/download/jumpserver/v3-7-2)取离线安装包。2023 年部署时用的 v3.7.2 系列；新版本安装器参数名有调整（容器镜像换 PostgreSQL、组件增减），照新版文档为准。

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

### 关键设计决策

- **`VOLUME_DIR` 是本次部署主要的持久化入口。** 我用它盘点数据库、录像和任务日志的增长，再按实际挂载核对配置和备份的归处。目录集中便于盘点，在线复制目录无法证明数据库一致。
- **`DOCKER_SUBNET` 独立成段**。容器内部网段与业务网段、宿主网段都不重叠，排障时 `ip route` 一眼分清内外。选 `192.168.250.0/24` 只是默认值不冲突，换环境按实际网段规划改，改完装之前定死——装完再改要重建容器网络。
- **`SECRET_KEY` 与数据库恢复配套。** 原环境里的密文需要原加密配置来解密。迁移时按对应版本官方说明保留和验证，副本单独放在受控存储中，按恢复工单授权取用。[JumpServer 升级说明](https://docs.jumpserver.org/zh/v2/install/upgrade/upgrade/)
- **内置 vs 外置数据库**。选内置（安装时外置数据库/Redis 全选 `n`）换的是部署简单和备份集中；代价是数据库和 Web、Koko 等业务容器同机同盘，任一组件把盘写满会连累数据库。外置方案把数据库独立出来，但多一套需要单独运维的 MySQL/PostgreSQL，中小环境不划算。

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

> 初始管理员身份以该版本的安装文档和实际初始化流程为准。完成初始配置后，改用按人分配的管理员账号，按组织策略启用 MFA。

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

1. **访问边界**。客户端入口启用 HTTPS，管理入口只提供给授权人员。组件注册用的 token 和数据库记录解密用的密钥是不同用途，配置另入受控备份。
2. **分层恢复**。数据库使用与版本匹配的一致性备份和恢复流程，录像按实际挂载和保留期核对，配置与密钥另行受控保存。在隔离环境先查目录登录及资产权限，再用批准的测试会话验证可连接、可回放。原始记录没有完整的恢复演练证据，此处是后续验收要求。
3. **特权账号收敛**。堡垒机的价值在把 root/Administrator 从人手里收走；授权规则仍长期授予这些账号，追责能力与纳管前没区别。按「独立账号优先、特权账号按需申请且带有效期」收敛，定期复查长期未使用的授权规则。

## 常见问题

### 1. 端口冲突

改**实际生效的** `/opt/jumpserver/config/config.txt` 中对应端口项（`HTTP_PORT`、`SSH_PORT`、`MAGNUS_*_PORT`）后重启服务；只改 `config-example.txt` 不生效。

### 2. 启动失败

先确认 Docker 正常（`systemctl status docker`、`docker ps -a`），对异常容器 `docker logs <容器名>` 看报错。常见原因：端口占用、`DOCKER_SUBNET` 与现有网段冲突、磁盘空间不足。

### 3. LDAP 同步失败

依次核对：主机到 LDAP 的网络与端口连通性、绑定账户的搜索权限、Base DN 与过滤条件是否匹配。测试连接通过但同步不到人，通常是过滤条件或 Base DN 范围问题，不是凭据问题。

## 总结

- 形态取舍：依赖少、部署快、备份点集中；代价是数据库与录像同宿主故障域，无高可用。
- 单机内能收口的两件事：HTTP 换 HTTPS；`/data/jumpserver` 备份并**实际做一次恢复演练**——没演练过不算有可用性。
- 单机收口不了的：主机故障即全员失去运维通道，要么把可接受的恢复时间写出来由使用方认可，要么改外置数据库与高可用方案。
- 特权账号收敛不是一次性动作，按安全建议第 3 条定期复查。
