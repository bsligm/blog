---
title: Ubuntu 安装英伟达驱动与 CUDA
date: 2023-11-09 11:40:00
updated: 2026-11-23 22:35:00
tags:
  - Ubuntu
  - Linux
categories:
  - 系统运维
keywords: Ubuntu, 英伟达驱动, CUDA, runfile 安装, DKMS, nouveau, Secure Boot
description: 2023 年 Ubuntu 通过 runfile 安装 NVIDIA 驱动与 CUDA Toolkit 的记录，补充驱动与 CUDA 运行时兼容、安装渠道取舍和最小算例验收。
cover: /img/cover/cuda-driver.jpg
toc: true
copyright: true
---

这是 2023 年用独立安装包部署 NVIDIA 驱动与 CUDA Toolkit 的记录。驱动负责设备和内核接口，Toolkit 提供编译器、开发工具与库。服务进程还可能从容器或框架发行包加载运行时，所以三者要分别定位。

当时用 runfile 是为了固定版本。复用这份经验时，先按目标 GPU、发行版、内核和负载核对支持范围，再选镜像、包管理器或 runfile。后来的 [DGX Spark 推理环境](/2026/11/19/DGX-Spark-vLLM部署与多Agent接入/) 与 [PVE GPU 虚拟化](/2026/11/19/PVE双宿主机与GPU切分实录/) 还要核对容器架构或宿主与来宾驱动，不能直接套这里的命令。

## 准备

1. 按 GPU 型号在[NVIDIA 驱动下载页](https://www.nvidia.cn/Download/index.aspx?lang=cn)确认支持的驱动版本并下载 `.run` 文件。

![NVIDIA 驱动下载页面示例](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202311091122261.png "NVIDIA驱动下载页面示例")

2. 装编译工具（runfile 现场编译内核模块）：

```bash
sudo apt update
sudo apt install gcc g++ make
```

## 安装驱动

把 `.run` 文件上传到目标机后：

```bash
chmod +x NVIDIA-Linux-*.run
```

安装前必须停图形界面、切纯文本控制台，否则显示服务占着 GPU，安装器直接失败（按实际显示管理器替换服务名）：

```bash
sudo systemctl stop gdm      # 或 lightdm / sddm
sudo init 3                  # 切换至多用户文本模式
```

再运行安装程序：

```bash
sudo ./NVIDIA-Linux-*.run
```

交互界面里真正要做的取舍只有三处，其余保持默认：

- **32-bit compatibility libraries**：不装的话 Steam/Wine 等 32 位程序调 GPU 会失败；纯计算服务器可以不装。
- **是否自动更新 X 配置**：Docker/调度器/容器里用 GPU 时选 No，不要动 `xorg.conf`，否则 `nvidia-container-runtime` 与宿主的设备映射可能不一致。
- **是否注册 DKMS**：选 Yes，内核升级自动重编译驱动模块；选 No 就要每次内核升级后手动重跑安装程序——这是生产机驱动突然失联的常见原因。

重启后验证：

```bash
nvidia-smi
```

正常出表、显示 GPU 与驱动版本即为成功：

![nvidia-smi 命令输出示例](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202311091238068.png "nvidia-smi命令输出示例")

## 安装 CUDA 工具包

先用 `nvidia-smi` 读驱动版本，再按要运行的 CUDA 应用或框架查最低驱动要求。界面上的 `CUDA Version` 是驱动报告的支持版本，不代表已装 Toolkit，也不能替代 [NVIDIA 的次版本兼容规则](https://docs.nvidia.com/deploy/cuda-compatibility/latest/minor-version-compatibility.html)。

![CUDA 版本兼容性检查](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202311091241712.png "CUDA版本兼容性检查")

到[CUDA Toolkit Archive](https://developer.nvidia.com/cuda-toolkit-archive)选版本：

![CUDA 版本选择页面](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202311091241098.png "CUDA版本选择页面")

runfile 方式安装，下文 `12.2.2` 与 `535.104.05` 为示例版本，以实际选择为准：

```bash
# 下载run文件
wget https://developer.download.nvidia.com/compute/cuda/12.2.2/local_installers/cuda_12.2.2_535.104.05_linux.run

# 运行安装程序
sudo sh cuda_12.2.2_535.104.05_linux.run
```

安装时两处注意：驱动已装好就**取消勾选驱动**，避免覆盖；只选需要的组件。

![CUDA 安装界面示例](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202311091258885.png "CUDA安装界面示例")

配置环境变量：

```bash
sudo vim ~/.bashrc
```

文件末尾添加（路径按实际安装情况调整）：

```bash
# CUDA环境变量配置（请根据实际安装路径调整）
export CUDA_HOME=/usr/local/cuda-12.2
export PATH=$CUDA_HOME/bin${PATH:+:${PATH}}
export LD_LIBRARY_PATH=$CUDA_HOME/lib64${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}
```

生效并让动态链接器收录运行库目录：

```bash
source ~/.bashrc
# 让动态链接器收录 CUDA 运行库目录
echo "/usr/local/cuda-12.2/lib64" | sudo tee /etc/ld.so.conf.d/cuda.conf
sudo ldconfig
```

验证：

```bash
nvcc -V
```

出版本信息即成功：

![nvcc 命令输出示例](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202311091305908.png "nvcc命令输出示例")

## 关键设计决策

**安装渠道。** 当时为了锁定指定版本，选的是 runfile。发行版软件仓库提供的分支、版本和内核适配要按当前发行版核对。选定一种管理方式后，尽量在同一渠道升级和卸载。内核更新前核对目标内核的模块构建与签名，支持 DKMS 的组合也要在重启后读回实际模块状态。

**专有驱动 vs 开源内核模块。** 2023 年对当时的卡，专有驱动是稳妥选择。这个选项在新一代架构上变成关键项：部分新特性要求开源内核模块（`-m=kernel-open`），Blackwell 系卡在 PVE 上的实测也全部建立在开源模块上——后面 GPU 切分篇的黑名单 `nouveau` 报 `unknown chipset` 就是这个背景。

**nouveau 为什么必须禁。** nouveau 与专有驱动争抢同一块 GPU，modeset 冲突会让安装器直接失败。屏蔽只处理模块加载，和"卸载 NVIDIA 驱动"是两件事。

**版本兼容怎么查。** 先用目标 Toolkit 或应用版本定位官方兼容表，再核对驱动、架构和功能限制。CUDA 11 起，同一主版本内存在带限制的次版本兼容。依赖新驱动功能或 PTX 即时编译的应用需要单独验证，不能看到版本数字接近就签字。

## 常见问题

### 1. 驱动安装失败

两类常见原因：

- **Secure Boot 启用**：未签名或签名不受信的模块可能被拒绝。按组织基线使用发行版支持的签名模块或受控的 MOK 签名与登记流程，重启后核对模块确实加载。
- **nouveau 冲突**：开源 nouveau 与专有驱动不能共存，先屏蔽 nouveau。

屏蔽 nouveau（注意与"卸载 NVIDIA 专有驱动"是两件事，此处只要前者）：

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

重启后确认：

```bash
lsmod | grep nouveau   # 无输出即为已屏蔽
mokutil --sb-state     # 确认 Secure Boot 状态
```

### 2. CUDA 版本不匹配

先对照兼容矩阵、应用实际加载的运行时以及首次失败的错误，再决定调整驱动或运行时。容器里的 CUDA 库版本与宿主 `nvcc -V` 可能不同，两边都要读回。

### 3. 安装后 `nvcc` 找不到

通常是环境变量未生效或路径未收录：`source ~/.bashrc` 后确认 `echo $CUDA_HOME` 指向实际安装目录；依赖动态链接器的话确认 `/etc/ld.so.conf.d/cuda.conf` 存在、重跑 `sudo ldconfig`，用 `ldconfig -p | grep cudart` 验证。

## 总结

我把验收分三层：`nvidia-smi` 用来读设备与驱动，`nvcc -V` 用来定位实际调用的编译器，最后在目标用户和运行环境下跑最小 CUDA 算例。前两层通过也可能在第三层遇到动态库或容器设备透传错误。本文保留的是安装与版本检查过程，未附原始算例结果。

- **内核升级会让 `.run` 装的驱动失联**，模块要重编译。生产机锁内核小版本，或改用 DKMS / 发行版仓库的 `nvidia-driver-*` 包。
- **`CUDA_HOME` 别写死版本号**：多版本共存时 `/usr/local/cuda` 符号链接才是切换开关，写死 `cuda-12.2` 会让切版本变成改 `.bashrc`。
- **临时环境不继承变量**：`sudo -i`、cron、systemd 服务、CI runner 都不读 `~/.bashrc`，脚本里显式用绝对路径或走 `/etc/profile.d/`。
