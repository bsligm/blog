---
title: Ubuntu安装英伟达驱动与CUDA
date: 2023-11-09 11:40:00
updated: 2023-11-09 11:40:00
tags: 
  - Ubuntu
  - Linux
categories: 
  - 系统运维
keywords: Ubuntu, 英伟达驱动, CUDA, GPU, Linux驱动安装
description: 详细介绍在Ubuntu系统中安装英伟达显卡驱动和CUDA工具包的完整步骤，包括驱动安装、CUDA配置和环境变量设置等关键环节。
cover: /medias/featureimages/2.jpg
toc: true
copyright: true
---

# Ubuntu安装英伟达驱动与CUDA

在深度学习、科学计算和图形处理等领域，英伟达GPU发挥着重要作用。要在Ubuntu系统中充分发挥GPU的性能，需要正确安装英伟达驱动和CUDA工具包。本文将详细介绍完整的安装过程。

## 准备阶段

在开始安装之前，需要做好以下准备工作：

### 1. 确认硬件兼容性

访问英伟达官网确认您的GPU型号支持的驱动版本：
[NVIDIA驱动下载页面](https://www.nvidia.cn/Download/index.aspx?lang=cn)

### 2. 检查系统依赖

确保Ubuntu系统已安装必要的编译工具：

```bash
sudo apt update
sudo apt install gcc g++ make
```

### 3. 下载驱动文件

从英伟达官网下载适用于您GPU型号的驱动程序文件。

![NVIDIA驱动下载页面示例](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202311091122261.png "NVIDIA驱动下载页面示例")

## 安装英伟达驱动

按照以下步骤安装英伟达显卡驱动：

### 1. 上传驱动文件

将下载的驱动文件上传到Ubuntu系统中。

### 2. 添加执行权限

为驱动文件添加执行权限：

```bash
chmod +x NVIDIA-Linux-*.run
```

### 3. 执行驱动安装

运行驱动安装程序：

```bash
sudo ./NVIDIA-Linux-*.run
```

安装过程中按照提示进行操作，通常需要：
- 接受许可协议
- 选择安装组件
- 确认安装路径

### 4. 验证安装结果

重启系统后，验证驱动是否安装成功：

```bash
nvidia-smi
```

如果安装成功，将显示GPU信息和驱动版本：

![nvidia-smi命令输出示例](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202311091238068.png "nvidia-smi命令输出示例")

## 安装CUDA工具包

CUDA是英伟达提供的并行计算平台和编程模型，用于开发GPU加速应用程序。

### 1. 确认CUDA版本兼容性

通过`nvidia-smi`命令确认支持的CUDA版本：

![CUDA版本兼容性检查](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202311091241712.png "CUDA版本兼容性检查")

### 2. 下载CUDA安装包

访问CUDA官方归档页面选择合适的版本：
[CUDA Toolkit Archive](https://developer.nvidia.com/cuda-toolkit-archive)

![CUDA版本选择页面](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202311091241098.png "CUDA版本选择页面")

### 3. 下载并安装CUDA

使用runfile方式安装CUDA：

```bash
# 下载run文件
wget https://developer.download.nvidia.com/compute/cuda/12.2.2/local_installers/cuda_12.2.2_535.104.05_linux.run

# 运行安装程序
sudo sh cuda_12.2.2_535.104.05_linux.run
```

安装过程中注意：
- 取消驱动程序的安装（如果已安装最新驱动）
- 选择需要的组件进行安装

![CUDA安装界面示例](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202311091258885.png "CUDA安装界面示例")

### 4. 配置环境变量

编辑bash配置文件：

```bash
sudo vim ~/.bashrc
```

在文件末尾添加以下环境变量（路径根据实际安装情况调整）：

```bash
# CUDA环境变量配置（请根据实际安装路径调整）
export PATH=/usr/local/cuda-12.2/bin${PATH:+:${PATH}}
export LD_LIBRARY_PATH=/usr/local/cuda-12.2/lib64${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}
export CUDA_HOME=/usr/local/cuda-12.2
```

使配置生效：

```bash
source ~/.bashrc
sudo ldconfig
```

### 5. 验证CUDA安装

检查CUDA编译器版本：

```bash
nvcc -V
```

成功安装后将显示CUDA编译器版本信息：

![nvcc命令输出示例](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202311091305908.png "nvcc命令输出示例")

## 常见问题及解决方案

### 1. 驱动安装失败

如果驱动安装失败，可能的原因包括：
- Secure Boot启用：需要在BIOS中禁用Secure Boot
- 内核模块冲突：卸载开源nouveau驱动

卸载nouveau驱动：

```bash
sudo apt remove --purge nvidia-*
sudo apt autoremove
sudo apt autoclean
```

### 2. CUDA版本不匹配

确保CUDA版本与驱动版本兼容，必要时升级驱动或降级CUDA。

## 总结

通过以上步骤，您已经成功在Ubuntu系统中安装了英伟达驱动和CUDA工具包。现在您可以开始进行GPU加速的开发工作了。

建议定期检查并更新驱动程序，以获得最佳性能和新功能支持。在生产环境中使用时，建议先在测试环境中验证安装过程。