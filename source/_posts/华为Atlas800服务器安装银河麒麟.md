---
title: 华为Atlas800服务器安装银河麒麟
date: 2023-08-07 16:00:00
updated: 2023-08-07 16:00:00
tags: 
  - 银河麒麟
  - 服务器
  - 华为
  - Atlas800
categories: 
  - 基础设施
  - 服务器管理
keywords: Atlas800, 银河麒麟, 服务器安装, 华为服务器, NPU驱动, CANN框架
description: 详细介绍华为Atlas800服务器安装银河麒麟操作系统的完整过程，包括通过IBMC安装系统、NPU驱动安装和CANN框架配置等关键步骤。
cover: /medias/featureimages/2.jpg
toc: true
copyright: true
---

# 华为Atlas800服务器安装银河麒麟

华为Atlas 800推理服务器是基于昇腾AI处理器的高性能AI推理服务器，广泛应用于图像识别、语音识别、自然语言处理等AI场景。本文将详细介绍在Atlas 800服务器上安装银河麒麟操作系统的完整过程。

## 通过IBMC安装银河麒麟

iBMC（integrated Baseboard Management Controller）是华为服务器的集成基板管理控制器，用于远程管理和监控服务器硬件。

### 1. 默认iBMC配置信息

- 默认IP地址：192.168.2.100
- 子网掩码：255.255.255.0
- 默认用户名：Administrator
- 默认密码：Admin@9000

### 2. 安装步骤

#### 步骤1：访问iBMC管理界面

使用浏览器访问iBMC默认地址：

![iBMC登录界面](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202308071622732.png "iBMC登录界面")

#### 步骤2：配置iBMC网络

根据实际网络环境配置iBMC的网络参数：

![iBMC网络配置](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202308101158988.png "iBMC网络配置界面")

#### 步骤3：挂载系统镜像

1. 进入"虚拟控制台" → "镜像文件"
2. 上传银河麒麟系统ISO镜像文件
3. 设置从CD/DVD启动

![挂载镜像文件](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202308101159890.png "镜像文件管理")

![设置启动项](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202308071624116.png "启动项设置")

![虚拟控制台](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202308071624431.png "虚拟控制台界面")

#### 步骤4：执行系统安装

参照华为官方文档完成银河麒麟系统的安装：
[华为Atlas 800安装指南](https://support.huawei.com/enterprise/zh/doc/EDOC1100311722/426cffd9)

## NPU驱动安装

NPU（Neural Processing Unit）是昇腾AI处理器的核心组件，需要安装相应的驱动程序才能正常使用。

### 1. 获取驱动与固件

1. 登录[Ascend HDK](https://support.huawei.com/enterprise/zh/ascend-computing/ascend-hdk-pid-252764743/software)软件下载页面
2. 选择Ascend HDK 22.0.0系列版本
3. 根据产品系统架构在"软件分类"中勾选"910-aarch64"或"910-x86_64"
4. 下载以下软件包：
   - Ascend-hdk-910-npu-driver_XXXXXX.run（驱动包）
   - Ascend-hdk-910-npu-firmwarer_XXXXXX.run（固件包）

![Ascend HDK软件下载](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202308071635608.png "Ascend HDK软件下载")

> **重要提示**：请确保获取同一版本下的驱动包和芯片固件包。

### 2. 传输软件包

通过以下方式将驱动和固件传输到银河麒麟操作系统：
- 通过iBMC远程管理
- 通过SCP协议
- 通过其他共享路径

### 3. 创建专用用户

驱动需要以HwHiAIUser身份运行，需要创建该用户：

```bash
# 创建HwHiAIUser用户
sudo useradd HwHiAIUser

# 为HwHiAIUser设置密码
sudo passwd HwHiAIUser
```

### 4. 安装驱动程序

执行以下命令安装NPU驱动：

```bash
# 进入驱动与固件目录
cd $path

# 为驱动和固件文件添加可执行权限
chmod +x Ascend-hdk-910-npu-driver_XXXXXX.run
chmod +x Ascend-hdk-910-npu-firmwarer_XXXXXX.run

# 执行驱动完整安装
./Ascend-hdk-910-npu-driver_XXXXXX.run --FULL

# 安装完成后重启系统
sudo reboot

# 验证驱动安装是否成功
npu-smi info

# 执行固件安装
./Ascend-hdk-910-npu-firmwarer_XXXXXX.run --FULL

# 再次重启系统
sudo reboot
```

## CANN框架安装

CANN（Compute Architecture for Neural Networks）是华为昇腾AI处理器的异构计算架构，提供完整的AI开发和推理能力。

### 1. 下载CANN框架

访问华为官方下载页面获取CANN框架：
[CANN框架下载](https://support.huawei.com/enterprise/zh/ascend-computing/cann-pid-251168373/software)

### 2. 传输安装包

将CANN安装包复制到银河麒麟操作系统的指定路径`$path`

### 3. 安装依赖环境

安装Python 3和pip工具：

```bash
# 安装Python 3
sudo yum install python3

# 安装pip
sudo yum install python-pip
```

### 4. 安装CANN框架

执行以下命令安装CANN框架：

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

1. 检查NPU状态：
   ```bash
   npu-smi info
   ```

2. 验证CANN框架：
   ```bash
   python3 -c "import torch; print(torch.__version__)"
   ```

## 注意事项

1. **版本兼容性**：确保驱动、固件和CANN框架版本相互兼容
2. **权限管理**：严格按照要求使用专用用户执行相关操作
3. **备份策略**：在安装前做好系统备份
4. **网络配置**：确保服务器网络连接稳定
5. **硬件检查**：安装前后检查硬件状态

## 总结

通过以上步骤，您已经成功在华为Atlas 800服务器上安装了银河麒麟操作系统，并配置了NPU驱动和CANN框架。这套环境可以用于AI推理、模型训练等高性能计算任务。

建议在生产环境中部署时：
1. 制定详细的安装计划和回滚方案
2. 充分测试驱动和框架的稳定性
3. 配置完善的监控和告警机制
4. 定期更新驱动和框架版本
5. 建立完整的文档记录