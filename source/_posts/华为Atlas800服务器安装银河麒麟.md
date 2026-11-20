---
title: 华为 Atlas800 服务器安装银河麒麟
date: 2023-08-07 16:00:00
updated: 2026-11-20 12:00:00
tags:
  - 银河麒麟
  - 服务器
  - 华为
  - Atlas800
categories:
  - 基础设施
  - 服务器管理
keywords: Atlas800, 银河麒麟, iBMC, NPU 驱动, CANN, aarch64
description: Atlas 800（aarch64）经 iBMC 装银河麒麟，再装 NPU 驱动、固件与 CANN：三次重启时序、版本三元组硬匹配、npu-smi 出表不等于 CANN 可用。
cover: /medias/featureimages/2.jpg
toc: true
copyright: true
---

计算与存储主题的三篇老文是算力层的起点，这篇是国产算力路径的一篇：华为 Atlas 800 服务器（8×Ascend 910，aarch64）装银河麒麟，再装 NPU 驱动、芯片固件与 CANN。全程走 iBMC 带外管理装系统，不用现场接键盘显示器。

注意 910 是**训练级** NPU，与官方「Atlas 800 推理服务器（型号 3000/3010）」对应的 310/310P 不是一回事，选型和驱动包别混。

这条线和 NVIDIA 栈的差别在生态不在流程：驱动、固件、CANN 的版本三元组必须按华为适配表互相匹配，混版就是 NPU 不可用；CANN 是 C++ 与算子层的生态位，和 CUDA 的差距体现在算子覆盖与第三方框架适配，不在安装手顺上。

## 通过 iBMC 安装银河麒麟

iBMC（integrated Baseboard Management Controller）是华为服务器的基板管理控制器，远程装系统全靠它。

### 1. 出厂默认配置

| 项 | 值 |
| --- | --- |
| IP | 192.168.2.100 |
| 子网掩码 | 255.255.255.0 |
| 用户名 | Administrator |
| 密码 | 出厂默认，首次登录立即修改 |

均为出厂默认值，实际以设备随机服务标签、随箱文档及对应机型 iBMC 版本的官方文档为准。

### 2. 安装步骤

**步骤 1**：浏览器访问 iBMC 默认地址登录。

![iBMC 登录界面](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202308071622732.png "iBMC登录界面")

**步骤 2**：按实际网络环境配置 iBMC 网络参数。

![iBMC 网络配置](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202308101158988.png "iBMC网络配置界面")

**步骤 3**：挂载系统镜像并设置一次性 CD/DVD 启动：

1. 「虚拟控制台」→「镜像文件」，上传银河麒麟 ISO
2. 设置从 CD/DVD 启动

下图依次为镜像挂载入口、一次性启动项设置，以及挂载后虚拟控制台的安装引导画面：

![挂载镜像文件](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202308101159890.png "镜像文件管理")

![设置启动项](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202308071624116.png "启动项设置")

![虚拟控制台](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202308071624431.png "虚拟控制台界面")

**步骤 4**：虚拟控制台里装系统，过程参照[华为 Atlas 800 安装指南](https://support.huawei.com/enterprise/zh/doc/EDOC1100311722/426cffd9)。

## NPU 驱动与固件

### 1. 获取驱动与固件

登录[Ascend HDK](https://support.huawei.com/enterprise/zh/ascend-computing/ascend-hdk-pid-252764743/software)下载页：

1. 选 Ascend HDK 22.0.0 系列版本
2. 「软件分类」按系统架构勾选 `910-aarch64` 或 `910-x86_64`
3. 下载两个包：
   - Ascend-hdk-910-npu-driver_XXXXXX.run（驱动）
   - Ascend-hdk-910-npu-firmware_XXXXXX.run（固件）

![Ascend HDK 软件下载](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202308071635608.png "Ascend HDK软件下载")

> **驱动包与固件包必须是同一版本**，跨版本混装后面会付代价。

### 2. 传输与建用户

两个 `.run` 包通过 iBMC、SCP 或任意共享路径传到系统里。

驱动以 `HwHiAIUser` 身份运行，**先建用户再装**：

```bash
# 创建HwHiAIUser用户
sudo useradd HwHiAIUser

# 为HwHiAIUser设置密码
sudo passwd HwHiAIUser
```

### 3. 装驱动，再装固件

`$path` 指 `.run` 包所在目录，按实际位置定义（本文示例 `/opt/ascend/pkg`）：

```bash
export path=/opt/ascend/pkg

# 进入驱动与固件目录
cd $path

# 为驱动和固件文件添加可执行权限（XXXXXX 替换为下载包的实际版本号）
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

先驱动后固件：驱动刚装完时固件还是旧版，`npu-smi info` 报版本不匹配**属预期**，不代表驱动装败。固件装完再重启，提示应消失；仍存在再核对两个包是否同版本。

## CANN 框架

CANN（Compute Architecture for Neural Networks）是昇腾的 AI 计算架构，工具链与官方算例都在里面，版本同样要与驱动、固件匹配。

1. 从[官方页面](https://support.huawei.com/enterprise/zh/ascend-computing/cann-pid-251168373/software)下载 CANN 安装包，放入 `$path`（与驱动包同目录即可）。
2. 装依赖。CANN 依赖 Python 3 与 pip；银河麒麟默认没有可用软件源，先按所购系统的授权方式配本地或网络源，否则 `yum` 直接失败：

```bash
# 安装Python 3
sudo yum install python3

# 安装pip（aarch64 源内常见包名为 python3-pip，以实际源内包名为准）
sudo yum install python-pip
```

3. 安装并重启：

```bash
# 为安装包添加可执行权限
chmod +x $path/Ascend-cann-nnae_xxxxxx_linux-aarch64.run

# 执行完整安装
$path/Ascend-cann-nnae_xxxxxx_linux-aarch64.run --FULL

# 安装完成后重启系统
sudo reboot
```

## 验证

分三层，每层失败对应的故障面不同：

1. **设备在位**。`npu-smi info` 列出全部 NPU，卡数与 `lspci | grep -i ascend` 的计数一致；不足说明驱动或固件没加载对。
2. **CANN 工具链可用**。加载安装生成的 `set_env.sh`（自定义路径以实际为准），确认环境变量注入、工具链目录非空：
   ```bash
   source /usr/local/Ascend/ascend-toolkit/set_env.sh
   env | grep -i ascend
   ```
   CANN nnae 包本身不含 PyTorch，`python3 -c "import torch"` 成不成功都与 CANN 无关，不能当验证手段；要 PyTorch 推理/训练另装昇腾适配层。
3. **算例跑通**。用与当前 CANN 版本配套的官方 sample 跑一次最小算子编译与执行（样例包按版本号在华为支持站点另行下载）。这层过了才算业务可用。

## 注意事项

1. **版本三元组先核对**。驱动、固件、CANN 按华为适配表配对；装前用 `npu-smi info` 记录当前固件版本，装完对比，避免升完驱动才发现固件不匹配。
2. **`HwHiAIUser` 先建再装**。安装属主由执行身份决定，事后补用户不会修正已落盘的目录权限。
3. **装前做系统备份或快照**。驱动与固件动的是内核模块和板载固件，失败回退成本高；iBMC 挂虚拟介质做镜像备份是最省事的路径。
4. **三次重启窗口预先申请**。驱动、固件、CANN 各一次，每次重启后都确认 NPU 在位，卡数少于物理数量说明没加载对。

## 关键设计决策

**aarch64 决定内核与驱动的耦合。** 910 NPU 驱动只发布到特定内核版本，驱动与银河麒麟发行版自带的内核版本是硬绑定，OS 与驱动包版本错配时 `--FULL` 安装直接报内核不兼容。先装 OS 定死内核版本，再按内核版本反查驱动包，顺序反了要重装。

**装完 OS 先验证 iBMC 再装驱动。** iBMC 是唯一的带外管理通道，后面驱动与固件各要重启一次，iBMC 不通就得现场插键鼠。装完系统第一件事用新 IP 登录 iBMC 确认网络与虚拟控制台正常，再动驱动。

**先驱动后固件、中间那次重启不能省。** 驱动装完固件还是旧版，`npu-smi info` 的版本不匹配告警是预期状态；固件装完重启后告警才应消失。把两次重启合成一次能省时间，但中间状态对不上时说不清是驱动问题还是固件问题。

**验证分三层，每层对应不同故障面。** `npu-smi info` 只证明驱动与固件加载成功；工具链 `set_env.sh` 加载后目录非空只证明 CANN 落盘完整；业务可用要等官方算例跑通。跳过第三层等于交付一台"能看卡但没验证过能算"的机器。

## 总结

交付顺序固定：iBMC 挂镜像装银河麒麟 → 建 `HwHiAIUser` → 驱动 → 固件 → CANN → `npu-smi info`、CANN 工具链、官方算例三层验证。

- **停机窗口按三次重启算**，别按一次算。
- **跨版本混装的典型症状是 `npu-smi` 正常但算子报错**，排查成本远高于一次装对。
- **aarch64 软件源包名与 x86 不同**，Python/pip 按源内实际包名确认，别照搬 x86 手册。
- **`npu-smi` 出表只证明驱动与固件加载成功**，业务能不能跑得用目标模型跑一轮完整推理/训练才算数。
- **把固件、驱动、CANN 三个版本号记进资产台账**——以后任何一次升级是否可行，依据就是这三个号。
