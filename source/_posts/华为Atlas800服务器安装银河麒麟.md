---
title: 华为 Atlas800 服务器安装银河麒麟
date: 2023-08-07 16:00:00
updated: 2026-11-19 16:00:00
tags:
  - 银河麒麟
  - 服务器
  - 华为
  - Atlas800
categories:
  - 基础设施
  - 服务器管理
keywords: Atlas800, 银河麒麟, 服务器安装, 华为服务器, NPU 驱动, CANN 框架
description: 详细介绍华为 Atlas800 服务器安装银河麒麟操作系统的完整过程，包括通过 iBMC 安装系统、NPU 驱动安装和 CANN 框架配置等关键步骤。
cover: /medias/featureimages/2.jpg
toc: true
copyright: true
---

本文记录在华为 Atlas 800 推理服务器上部署银河麒麟操作系统，并依次完成 NPU 驱动、芯片固件与 CANN 框架安装的完整手顺。全流程通过 iBMC 带外管理完成系统安装，无需现场接键盘显示器；驱动、固件与 CANN 三者版本必须互相匹配，混版会导致 NPU 不可用。

## 通过 iBMC 安装银河麒麟

iBMC（integrated Baseboard Management Controller）是华为服务器的集成基板管理控制器，用于远程管理和监控服务器硬件。

### 1. 默认 iBMC 配置信息

- 默认 IP 地址：192.168.2.100
- 子网掩码：255.255.255.0
- 默认用户名：Administrator
- 默认密码：出厂默认口令，首次登录后立即修改

上述地址与凭据为出厂默认值，实际以设备随机服务标签与随箱文档，以及对应机型 iBMC 版本官方文档为准。

### 2. 安装步骤

#### 步骤 1：访问 iBMC 管理界面

使用浏览器访问 iBMC 默认地址：

![iBMC 登录界面](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202308071622732.png "iBMC登录界面")

#### 步骤 2：配置 iBMC 网络

根据实际网络环境配置 iBMC 的网络参数：

![iBMC 网络配置](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202308101158988.png "iBMC网络配置界面")

#### 步骤 3：挂载系统镜像

1. 进入"虚拟控制台" → "镜像文件"
2. 上传银河麒麟系统 ISO 镜像文件
3. 设置从 CD/DVD 启动

下图依次为镜像文件挂载入口、一次性启动项设置，以及挂载后虚拟控制台中出现的安装引导画面：

![挂载镜像文件](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202308101159890.png "镜像文件管理")

![设置启动项](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202308071624116.png "启动项设置")

![虚拟控制台](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202308071624431.png "虚拟控制台界面")

#### 步骤 4：执行系统安装

参照华为官方文档完成银河麒麟系统的安装：
[华为 Atlas 800 安装指南](https://support.huawei.com/enterprise/zh/doc/EDOC1100311722/426cffd9)

## NPU 驱动安装

NPU（Neural Processing Unit）是昇腾 AI 处理器的核心组件，需要安装相应的驱动程序才能正常使用。

### 1. 获取驱动与固件

1. 登录[Ascend HDK](https://support.huawei.com/enterprise/zh/ascend-computing/ascend-hdk-pid-252764743/software)软件下载页面
2. 选择 Ascend HDK 22.0.0 系列版本
3. 根据产品系统架构在"软件分类"中勾选"910-aarch64"或"910-x86_64"
4. 下载以下软件包：
   - Ascend-hdk-910-npu-driver_XXXXXX.run（驱动包）
   - Ascend-hdk-910-npu-firmware_XXXXXX.run（固件包）

![Ascend HDK 软件下载](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202308071635608.png "Ascend HDK软件下载")

> **重要提示**：请确保获取同一版本下的驱动包和芯片固件包。

### 2. 传输软件包

通过以下方式将驱动和固件传输到银河麒麟操作系统：
- 通过 iBMC 远程管理
- 通过 SCP 协议
- 通过其他共享路径

### 3. 创建专用用户

驱动需要以 HwHiAIUser 身份运行，需要创建该用户：

```bash
# 创建HwHiAIUser用户
sudo useradd HwHiAIUser

# 为HwHiAIUser设置密码
sudo passwd HwHiAIUser
```

### 4. 安装驱动程序

执行以下命令安装 NPU 驱动：

```bash
# 进入驱动与固件目录
cd $path

# 为驱动和固件文件添加可执行权限
chmod +x Ascend-hdk-910-npu-driver_XXXXXX.run
chmod +x Ascend-hdk-910-npu-firmware_XXXXXX.run

# 执行驱动完整安装
./Ascend-hdk-910-npu-driver_XXXXXX.run --FULL

# 安装完成后重启系统
sudo reboot

# 验证驱动安装是否成功
npu-smi info

# 执行固件安装
./Ascend-hdk-910-npu-firmware_XXXXXX.run --FULL

# 再次重启系统
sudo reboot
```

此处先装驱动、后装固件：驱动刚装完时固件仍为旧版本，`npu-smi info` 可能提示驱动与固件版本不匹配，属预期告警，不代表驱动安装失败。完成固件安装并再次重启后该提示应消失；若仍存在，再核对驱动包与固件包是否为同一版本。

## CANN 框架安装

CANN（Compute Architecture for Neural Networks）是华为昇腾 AI 处理器的异构计算架构，提供完整的 AI 开发和推理能力。

### 1. 下载 CANN 框架

访问华为官方下载页面获取 CANN 框架：
[CANN 框架下载](https://support.huawei.com/enterprise/zh/ascend-computing/cann-pid-251168373/software)

### 2. 传输安装包

将 CANN 安装包复制到银河麒麟操作系统的指定路径`$path`

### 3. 安装依赖环境

CANN 依赖 Python 3 与 pip。银河麒麟默认不提供可用软件源，需先按所购系统的授权方式配置本地或网络源，否则 `yum` 会因源不可用而失败。

```bash
# 安装Python 3
sudo yum install python3

# 安装pip（aarch64 源内常见包名为 python3-pip，以实际源内包名为准）
sudo yum install python-pip
```

### 4. 安装 CANN 框架

执行以下命令安装 CANN 框架：

```bash
# 为安装包添加可执行权限
chmod +x $path/Ascend-cann-nnae_xxxxxx_linux-aarch64.run

# 执行完整安装
$path/Ascend-cann-nnae_xxxxxx_linux-aarch64.run --FULL

# 安装完成后重启系统
sudo reboot
```

## 验证安装结果

安装完成后，可以通过以下方式验证系统是否正常工作：

1. 检查 NPU 状态：
   ```bash
   npu-smi info
   ```

2. 验证 CANN 框架：
   ```bash
   python3 -c "import torch; print(torch.__version__)"
   ```

## 注意事项

1. **版本兼容性**：确保驱动、固件和 CANN 框架版本相互兼容
2. **权限管理**：严格按照要求使用专用用户执行相关操作
3. **备份策略**：在安装前做好系统备份
4. **网络配置**：确保服务器网络连接稳定
5. **硬件检查**：安装前后检查硬件状态

## 总结

通过以上步骤，您已经成功在华为 Atlas 800 服务器上安装了银河麒麟操作系统，并配置了 NPU 驱动和 CANN 框架。这套环境可以用于 AI 推理、模型训练等高性能计算任务。

建议在生产环境中部署时：
1. 制定详细的安装计划和回滚方案
2. 充分测试驱动和框架的稳定性
3. 配置完善的监控和告警机制
4. 定期更新驱动和框架版本
5. 建立完整的文档记录
