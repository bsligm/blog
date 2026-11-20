---
title: Ubuntu 安装英伟达驱动与 CUDA
date: 2023-11-09 11:40:00
updated: 2026-11-20 12:00:00
tags:
  - Ubuntu
  - Linux
categories:
  - 系统运维
keywords: Ubuntu, 英伟达驱动, CUDA, runfile 安装, DKMS, nouveau, Secure Boot
description: Ubuntu 上用 runfile 安装 NVIDIA 专有驱动与 CUDA 工具包：停图形界面再装、安装器三处取舍（32 位库/X 配置/DKMS）、CUDA 版本不得高于 nvidia-smi 上限，nouveau 屏蔽与 Secure Boot 的排查，环境变量与多版本共存的坑。
cover: /medias/featureimages/2.jpg
toc: true
copyright: true
---

NVIDIA GPU 在 Ubuntu 上要跑起来分两步：先装专有驱动（决定可用的最高 CUDA 版本），再装 CUDA 工具包（编译器与运行库）。这篇覆盖 runfile 安装全过程与常见失败排查；操作会改内核模块和系统级配置，建议先在测试机验证。

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

先看 `nvidia-smi` 右上角的 `CUDA Version`——这是**驱动支持的上限**，装的工具包版本不能高于它：

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

## 常见问题

### 1. 驱动安装失败

两类常见原因：

- **Secure Boot 启用**：未签名的内核模块被拒绝加载。BIOS 里禁用 Secure Boot，或按安装器提示登记 MOK（Machine Owner Key）后重启完成签名。
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

`nvidia-smi` 的 `CUDA Version` 是驱动支持的最高版本，工具包装得比它高就运行时不可用。要么升驱动，要么降 CUDA。

### 3. 安装后 `nvcc` 找不到

通常是环境变量未生效或路径未收录：`source ~/.bashrc` 后确认 `echo $CUDA_HOME` 指向实际安装目录；依赖动态链接器的话确认 `/etc/ld.so.conf.d/cuda.conf` 存在、重跑 `sudo ldconfig`，用 `ldconfig -p | grep cudart` 验证。

## 总结

两条验收线：`nvidia-smi` 正常出表（驱动能加载），`nvcc -V` 能出版本（工具包可用），都过了环境才算可用。

- **版本硬约束只有一个**：CUDA 工具包版本 ≤ `nvidia-smi` 报的 `CUDA Version`。那项是驱动支持的上限，不是已装版本——先装高版本 CUDA 再回头升驱动，比反过来代价大。
- **内核升级会让 `.run` 装的驱动失联**，模块要重编译。生产机锁内核小版本，或改用 DKMS / 发行版仓库的 `nvidia-driver-*` 包。
- **`CUDA_HOME` 别写死版本号**：多版本共存时 `/usr/local/cuda` 符号链接才是切换开关，写死 `cuda-12.2` 会让切版本变成改 `.bashrc`。
- **临时环境不继承变量**：`sudo -i`、cron、systemd 服务、CI runner 都不读 `~/.bashrc`，脚本里显式用绝对路径或走 `/etc/profile.d/`。
