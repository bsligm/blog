---
title: Jump server单节点无外置数据库部署
date: 2023-10-18 13:40:00
updated: 2026-11-19 15:30:00
tags:
  - 基础设施
  - 堡垒机
  - 系统运维
categories:
  - 系统运维
  - 安全管理
keywords: JumpServer, 堡垒机, 单节点部署, 离线安装, Linux, 安全运维
description: JumpServer 堡垒机单节点无外置数据库的离线部署记录，涵盖环境准备、安装配置、LDAP 对接、资产管理与日常运维命令。
cover: /medias/featureimages/4.jpg
toc: true
copyright: true
---

JumpServer 是开源的运维安全审计系统（堡垒机），提供身份认证、账号管理、授权控制与操作审计四类能力。

本文记录**单节点 + 内置数据库**的离线部署方式：不引入外置 MySQL/Redis，由安装器自带容器承担持久化，适合运维规模有限、希望尽量少依赖的中小型环境。生产环境如需高可用或大容量录像存储，应改用外置数据库方案，部署参数与本流程不同。

流程：基础设施要求 → 离线安装 → 系统配置（LDAP/资产/授权）→ 运维与安全建议。

## 基础设施要求

部署前确认以下条件满足：

### 1. 硬件环境

- Linux 主机环境（推荐使用 Ubuntu 20.04 或 CentOS 7.6 及以上版本）
- CPU：2 核及以上
- 内存：4GB 及以上
- 硬盘：50GB 及以上可用空间（录像与任务日志写入 `VOLUME_DIR`，实际应按审计保留期估算）

### 2. 网络环境

- 可访问外网的网络环境（仅用于下载安装包，离线环境可提前下载后拷入）
- 确保相关端口未被占用（80、2222、33061、33062、63790 等）

### 3. 系统依赖

安装必要的系统工具。以下命令以 Debian/Ubuntu 为例：

```bash
sudo apt update
sudo apt install wget curl tar gettext iptables
```

RHEL/CentOS 系对应为：

```bash
sudo yum install -y wget curl tar gettext iptables
```

> 包名与包组名称随发行版版本存在差异（如较新版本使用 `dnf`，`iptables` 可能已被 `nftables` 替代），请以本机软件源实际提供的包为准。

## 部署过程

### 1. 下载安装包

访问 JumpServer 官方下载页面，根据 Linux 主机 CPU 架构下载对应的离线安装包：

[JumpServer 下载页面](https://community.fit2cloud.com/#/download/jumpserver/v3-7-2)

### 2. 安装包处理

将下载的安装包移动到 `/opt` 目录并解压：

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

> **目录名以解压结果为准**：不同版本的包名与解压出的目录名并不完全一致（例如离线包名为 `jumpserver-offline-installer-v*`，而解压出的目录可能是 `jumpserver-offline-release-v3.7.2-amd64`）。执行 `ls /opt` 确认真实目录名后再 `cd`，不要直接套用下文示例中的写死路径。下文统一以 `$JMS_DIR` 指代该目录。

### 3. 配置文件修改

按需修改配置文件的参数，也可以不做任何修改使用默认配置：

```bash
sudo vim config-example.txt
```

> `config-example.txt` 只是安装期的输入模板，**安装器会据此生成实际生效的配置文件** `/opt/jumpserver/config/config.txt`。安装完成后如需调整参数，应修改后者并重启服务，改模板文件不会生效。

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

安装 JumpServer。交互安装向导会依次询问是否使用外置数据库、外置 Redis 等，本文采用单节点内置数据库部署，因此**这些问题全部选择 `n`**（即全部使用安装器自带的内置容器）。若误选 `y`，向导会转而要求填写外部数据库/Redis 的连接地址与凭据，与本文方案不符。

```bash
# 安装
./jmsctl.sh install

# 启动
./jmsctl.sh start
```

### 5. 验证安装

安装完成后，实际生效的配置文件位于 `/opt/jumpserver/config/config.txt`（由安装期的 `config-example.txt` 生成）。

常用管理命令（在解压目录下执行）：

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

### 6. 访问 JumpServer

安装成功后，通过浏览器访问 JumpServer：

```text
地址: http://<JumpServer服务器IP地址>:<服务运行端口>
用户名: admin
密码: admin
```

下图为登录入口，默认管理员账户即上述 `admin`：

![JumpServer 登录界面](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202310181002748.png "JumpServer登录界面")

> **重要提示**：`admin/admin` 是 JumpServer 的出厂默认账户，**仅首次登录有效**，首次登录后系统会强制要求修改密码。请在首次登录时立即改密，并避免把该账户用于日常运维，日常改用专用管理员账户并开启 MFA。

## 系统配置

要让这台堡垒机真正接住运维流量，需要按顺序配好四件事：统一认证（LDAP）、资产纳管、用户与用户组、资产授权。顺序不是习惯问题：用户来源先固定，才谈得上按组授权；资产先纳管，授权才有可引用的对象。把用户组和资产文件夹这两层搭好之后再写授权规则，后续扩容只需往组与文件夹里加成员，规则本身不用改。

### 1. LDAP 对接配置

通过 LDAP 对接可与企业 AD 域集成，实现统一用户认证，避免在堡垒机内维护一套独立账号：

1. 登录 JumpServer 管理后台
2. 进入「系统设置」→「认证设置」→「LDAP 设置」
3. 填写 LDAP 服务器地址、绑定账户与密码、Base DN

这里最容易配错的是 Base DN 与用户过滤条件：范围填小了同步不到人，填大了会把服务账号、离职停用账号一起拉进来，反而比本地账号更难收敛。绑定账户只需要读取权限，不要用域管理员账号来做同步。

配完先点「测试连接」，再用「同步」拉一次并核对用户数量。测试连接通过但同步不到用户，多半是过滤条件或 Base DN 的问题，不是密码错，具体排查见「常见问题」。堡垒机内保留一个本地管理员账户作为 LDAP 故障时的登录通道，其余用户全部走域认证。

![LDAP 设置步骤 1](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202310181007029.png "LDAP设置界面")

![LDAP 设置步骤 2](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202310181007281.png "LDAP同步设置")

### 2. 资产配置

把需要被运维的服务器纳管进来：

1. 进入「控制台」→「资产管理」→「资产列表」
2. 点击「创建」添加新资产
3. 填写资产的 IP 地址、协议与端口，并归入对应的资产节点（文件夹）

协议与端口填的是 JumpServer 主动连接目标机的地址：SSH 资产走 22，RDP 资产走 3389，填成目标机上其他服务的端口会在连接阶段报超时而不是配置校验错误。资产节点的层级值得提前设计，它既是授权的作用域，也是后续按业务线批量放权的单位，事后重新分组需要逐条改授权规则。

被纳管一侧还需放通堡垒机到目标端口的访问。端口不通时错误发生在连接阶段，容易被误判成目标机账号密码错误，先确认网络可达再查凭据。

![创建资产信息](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202310181010659.png "资产创建界面")

### 3. 用户与用户组管理

授权的对象是用户组而不是个人，所以先把组划出来：

1. 进入「用户管理」→「用户列表」，本地用户手工创建，域用户从 LDAP 同步
2. 按业务线或运维职责创建用户组，再把用户分配进组

日常加人只改组成员，不动授权规则；直接对个人授权的操作会留下一条规则，人员流动时没人记得回收，这是堡垒机最常见的权限膨胀路径。反过来也要留意：域用户离职或调岗后，同步动作不一定会自动收回它在堡垒机上已有的授权，账号禁用与规则回收仍需人工在堡垒机侧确认一次。

![用户管理](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202310181014686.png "用户列表")

![用户组管理](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202310181014272.png "用户组列表")

### 4. 资产权限分配

授权规则把「谁」可以以「哪个账号」访问「哪些资产」绑在一起：

1. 进入「控制台」→「权限管理」→「资产授权」
2. 对用户或用户组，按资产文件夹、节点或单个资产授予访问权限

作用域尽量选资产文件夹而不是逐台单点，规则数量可控，回收时也只需改一处。规则里的「账号」决定了用户落到目标机上用哪个身份登录：直接把 root 或 Administrator 长期授予用户组，审计日志里就只剩「某人在某台机器上用了 root」，追责能力大打折扣。更稳的做法是每人使用独立的目标账号，root 这类特权账号按需申请、并给授权设置有效期，让长期持有的特权尽量小。

![资产权限分配](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202310181017807.png "资产授权界面")

## 安全建议

通用运维安全要求不再重复，以下三条是这套部署方式下必须单独盯住的：

1. **`SECRET_KEY` 与 `BOOTSTRAP_TOKEN` 的一致性**。目标机上纳管的账号密码等凭据由 `SECRET_KEY` 加密落库，容器重建、版本升级、整机迁移都必须沿用旧值，一旦换新，既有凭据密文全部无法解密，只能逐台重新录入。`BOOTSTRAP_TOKEN` 不一致则表现为组件注册不上。两者要在备份体系里离线留存一份，且与数据库备份放在一起，否则单独备份数据库并无恢复价值。
2. **录像与会话记录的落盘位置**。`VOLUME_DIR`（本文示例为 `/data/jumpserver`）同时承载数据库、任务日志与录像，单节点形态下它与系统数据是同一个故障域。按审计保留期倒推容量并单独备份这个目录，**实际做过一次恢复**而不是只确认备份文件存在；录像缺失等同于审计能力缺失，出事故时补不回来。
3. **纳管资产侧的特权账号收敛**。堡垒机的价值在于把 root/Administrator 从人的手里收走，如果授权规则仍把这些账号长期授予用户组，审计日志里只剩「某人用了 root」，追责能力与纳管前没有本质区别。按「独立账号优先、特权账号按需申请且带有效期」来收敛，并定期检查长期未使用的授权规则。

## 常见问题

### 1. 端口冲突

默认端口被占用时，修改**实际生效的配置文件** `/opt/jumpserver/config/config.txt` 中的端口项（`HTTP_PORT`、`SSH_PORT`、`MAGNUS_*_PORT`），随后重启服务；仅改安装目录下的 `config-example.txt` 不会生效。

### 2. 启动失败

先确认 Docker 服务正常（`systemctl status docker`、`docker ps -a`），查看异常容器的 `docker logs <容器名>` 定位报错。常见原因是端口被占用、`DOCKER_SUBNET` 与现有网段冲突，或磁盘空间不足。

### 3. LDAP 同步失败

依次核对：JumpServer 所在主机到 LDAP 服务器的网络与端口连通性、绑定账户的搜索权限、Base DN 与用户过滤条件是否匹配。若测试连接通过但同步不到用户，通常是过滤条件或 Base DN 范围问题，而不是凭据问题。

## 总结

至此，JumpServer 单节点无外置数据库环境部署完成，并已打通「AD 统一认证 → 资产纳管 → 用户组授权 → 操作审计」的基本闭环。该形态的优点是依赖少、部署快、备份点集中；代价是数据库与录像同盘同容器，不具备高可用能力。

剩下要处理的是这套形态本身的边界，按能否在单机内解决分两拨。单机内就能收口的：把 HTTP 换成 HTTPS，避免登录凭据与页面内容明文经过中间链路；把 `/data/jumpserver` 的备份与恢复演练排进例行运维，演练做完才有资格谈可用性。单机解决不了的：数据库与录像同盘同容器，主机故障期间所有人都会失去运维通道，因此要么明确写出可接受的故障恢复时间并由使用方认可，要么改走外置数据库与高可用方案，那是另一套部署参数。授权侧的特权账号收敛不是一次性动作，按上一节第 3 条定期复查。
