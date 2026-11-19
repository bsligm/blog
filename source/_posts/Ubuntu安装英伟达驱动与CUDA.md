---
title: Ubuntu 安装英伟达驱动与 CUDA
date: 2023-11-09 11:40:00
updated: 2026-11-19 11:40:00
tags:
  - Ubuntu
  - Linux
categories:
  - 系统运维
keywords: Ubuntu, 英伟达驱动, CUDA, GPU, Linux 驱动安装
description: 详细介绍在 Ubuntu 系统中安装英伟达显卡驱动和 CUDA 工具包的完整步骤，包括驱动安装、CUDA 配置和环境变量设置等关键环节。
cover: /medias/featureimages/2.jpg
toc: true
copyright: true
---

在 Ubuntu 上启用 NVIDIA GPU 的并行计算能力，需依次安装专有驱动与 CUDA 工具包：驱动决定可用的最高 CUDA 版本，CUDA 提供编译器与运行库。本文适用于带独立 NVIDIA GPU 的 Ubuntu 主机，覆盖驱动安装、CUDA 安装、环境变量配置与常见失败排查；操作会修改内核模块与系统级配置，建议先在测试机验证。

## 准备阶段

在开始安装之前，需要做好以下准备工作：

### 1. 确认硬件兼容性

访问英伟达官网确认您的 GPU 型号支持的驱动版本：
[NVIDIA 驱动下载页面](https://www.nvidia.cn/Download/index.aspx?lang=cn)

### 2. 检查系统依赖

确保 Ubuntu 系统已安装必要的编译工具：

```bash
sudo apt update
sudo apt install gcc g++ make
```

### 3. 下载驱动文件

从英伟达官网下载适用于您 GPU 型号的驱动程序文件。

![NVIDIA 驱动下载页面示例](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202311091122261.png "NVIDIA驱动下载页面示例")

## 安装英伟达驱动

按照以下步骤安装英伟达显卡驱动：

### 1. 上传驱动文件

将下载的驱动文件上传到 Ubuntu 系统中。

### 2. 添加执行权限

为驱动文件添加执行权限：

```bash
chmod +x NVIDIA-Linux-*.run
```

### 3. 执行驱动安装

安装 `.run` 前需先停止图形界面并切到纯文本控制台，否则安装器会因显示服务占用 GPU 而失败（按实际显示管理器替换服务名）：

```bash
sudo systemctl stop gdm      # 或 lightdm / sddm
sudo init 3                  # 切换至多用户文本模式
```

再运行驱动安装程序：

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

如果安装成功，将显示 GPU 信息和驱动版本：

![nvidia-smi 命令输出示例](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202311091238068.png "nvidia-smi命令输出示例")

## 安装 CUDA 工具包

CUDA 是英伟达提供的并行计算平台和编程模型，用于开发 GPU 加速应用程序。

### 1. 确认 CUDA 版本兼容性

通过`nvidia-smi`命令确认支持的 CUDA 版本：

![CUDA 版本兼容性检查](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202311091241712.png "CUDA版本兼容性检查")

### 2. 下载 CUDA 安装包

访问 CUDA 官方归档页面选择合适的版本：
[CUDA Toolkit Archive](https://developer.nvidia.com/cuda-toolkit-archive)

![CUDA 版本选择页面](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202311091241098.png "CUDA版本选择页面")

### 3. 下载并安装 CUDA

使用 runfile 方式安装 CUDA。下文 `12.2.2` 与 `535.104.05` 为示例版本，runfile 文件名含具体版本号，实际以 CUDA Toolkit Archive 页面选择结果为准：

```bash
# 下载run文件
wget https://developer.download.nvidia.com/compute/cuda/12.2.2/local_installers/cuda_12.2.2_535.104.05_linux.run

# 运行安装程序
sudo sh cuda_12.2.2_535.104.05_linux.run
```

安装过程中注意：
- 取消驱动程序的安装（如果已安装最新驱动）
- 选择需要的组件进行安装

![CUDA 安装界面示例](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202311091258885.png "CUDA安装界面示例")

### 4. 配置环境变量

编辑 bash 配置文件：

```bash
sudo vim ~/.bashrc
```

在文件末尾添加以下环境变量（路径根据实际安装情况调整）：

```bash
# CUDA环境变量配置（请根据实际安装路径调整）
export CUDA_HOME=/usr/local/cuda-12.2
export PATH=$CUDA_HOME/bin${PATH:+:${PATH}}
export LD_LIBRARY_PATH=$CUDA_HOME/lib64${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}
```

使配置生效：

```bash
source ~/.bashrc
# 让动态链接器收录 CUDA 运行库目录
echo "/usr/local/cuda-12.2/lib64" | sudo tee /etc/ld.so.conf.d/cuda.conf
sudo ldconfig
```

### 5. 验证 CUDA 安装

检查 CUDA 编译器版本：

```bash
nvcc -V
```

成功安装后将显示 CUDA 编译器版本信息：

![nvcc 命令输出示例](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202311091305908.png "nvcc命令输出示例")

## 常见问题及解决方案

### 1. 驱动安装失败

如果驱动安装失败，常见原因有两类：

- Secure Boot 启用：未签名的内核模块会被拒绝加载。可在 BIOS 中禁用 Secure Boot，或按安装器提示登记 MOK（Machine Owner Key）后重启完成签名。
- 内核模块冲突：开源 nouveau 驱动与 NVIDIA 专有驱动冲突，需先屏蔽 nouveau。

屏蔽 nouveau 驱动（注意：屏蔽开源 nouveau 与卸载 NVIDIA 专有驱动是两件事，此处需要的是前者）：

```bash
# 若此前装过 NVIDIA 官方驱动，先彻底卸载
sudo apt remove --purge 'nvidia-*'
sudo apt autoremove
sudo apt autoclean

# 屏蔽 nouveau 并重建 initramfs，随后重启生效
echo -e "blacklist nouveau\noptions nouveau modeset=0" | sudo tee /etc/modprobe.d/blacklist-nouveau.conf
sudo update-initramfs -u
sudo reboot
```

重启后确认 nouveau 已不再加载、Secure Boot 状态符合预期：

```bash
lsmod | grep nouveau   # 无输出即为已屏蔽
mokutil --sb-state     # 确认 Secure Boot 状态
```

### 2. CUDA 版本不匹配

`nvidia-smi` 输出的 `CUDA Version` 表示驱动支持的最高 CUDA 版本，安装更高的 CUDA 工具包会导致运行时不可用。需保证 CUDA 工具包版本不高于该值，否则升级驱动或降级 CUDA。

### 3. 安装后命令找不到

`nvcc: command not found` 通常是环境变量未生效或路径未收录：先执行 `source ~/.bashrc` 并确认 `echo $CUDA_HOME` 指向实际安装目录；若依赖动态链接器收录，确认 `/etc/ld.so.conf.d/cuda.conf` 存在后重新执行 `sudo ldconfig`，可用 `ldconfig -p | grep cudart` 验证。

## 总结

通过以上步骤，您已经成功在 Ubuntu 系统中安装了英伟达驱动和 CUDA 工具包。现在您可以开始进行 GPU 加速的开发工作了。

建议定期检查并更新驱动程序，以获得最佳性能和新功能支持。在生产环境中使用时，建议先在测试环境中验证安装过程。
