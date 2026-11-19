---
title: 华为 Atlas800 服务器安装银河麒麟
date: 2023-08-07 16:00:00
updated: 2026-11-19 15:30:00
tags:
  - 银河麒麟
  - 服务器
  - 华为
  - Atlas800
categories:
  - 基础设施
  - 服务器管理
keywords: Atlas800, 银河麒麟, 服务器安装, 华为服务器, NPU 驱动, CANN 框架
description: 华为 Atlas 800（aarch64）经 iBMC 虚拟介质安装银河麒麟，再依次装 NPU 驱动、固件与 CANN：三次重启的时序、驱动先装时的版本不匹配告警属预期，以及用 npu-smi 与 CANN 工具链分层验证（import torch 不能验证 CANN）。
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

1. 进入「虚拟控制台」→「镜像文件」
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
3. 根据产品系统架构在「软件分类」中勾选 `910-aarch64` 或 `910-x86_64`
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

以下命令中 `$path` 指驱动与固件 `.run` 包所在目录，先按其实际位置定义（本文示例为 `/opt/ascend/pkg`）：

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

此处先装驱动、后装固件：驱动刚装完时固件仍为旧版本，`npu-smi info` 可能提示驱动与固件版本不匹配，属预期告警，不代表驱动安装失败。完成固件安装并再次重启后该提示应消失；若仍存在，再核对驱动包与固件包是否为同一版本。

## CANN 框架安装

CANN（Compute Architecture for Neural Networks）是华为昇腾 AI 处理器的异构计算架构，提供完整的 AI 开发和推理能力。

### 1. 下载 CANN 框架

访问华为官方下载页面获取 CANN 框架：
[CANN 框架下载](https://support.huawei.com/enterprise/zh/ascend-computing/cann-pid-251168373/software)

### 2. 传输安装包

将 CANN 安装包复制到前述 `$path` 目录（与驱动包同目录即可）

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

按层次分三步验证，各步失败对应的故障面不同：

1. **设备在位**。`npu-smi info` 应列出全部 NPU，卡数与 `lspci | grep -i ascend` 的计数一致；卡数不足说明驱动或固件未正确加载。
2. **CANN 工具链可用**。加载安装时生成的 `set_env.sh`（自定义安装路径时以实际路径为准），确认环境变量已注入、工具链目录非空：
   ```bash
   source /usr/local/Ascend/ascend-toolkit/set_env.sh
   env | grep -i ascend
   ```
   注意 CANN nnae 包本身不含 PyTorch，`python3 -c "import torch"` 成功与否与 CANN 是否装好无关，不能作为 CANN 的验证手段；需要 PyTorch 训练/推理时另行安装对应的昇腾适配层。
3. **算例跑通**。用与当前 CANN 版本配套的官方 sample 跑一次最小的算子编译与执行（样例包需按版本号在华为支持站点另行下载），这一步通过才算业务可用的环境。

## 注意事项

1. **先核对版本三元组**。驱动、固件、CANN 三者按华为适配表配对，装之前用 `npu-smi info` 记录当前固件版本，装完再对比，避免升完驱动才发现固件不匹配。
2. **专用用户先建再装**。`HwHiAIUser` 要在执行安装脚本之前创建完毕，安装属主由执行身份决定，事后补用户不会修正已落盘的目录权限。
3. **安装前完成系统备份或快照**。驱动与固件安装会改动内核模块和板载固件，失败后回退成本高，通过 iBMC 挂虚拟介质做系统镜像备份是当前最省事的路径。
4. **重启窗口预先申请**。全程三次重启，且每次重启后需确认 NPU 在位（`npu-smi info` 应列出全部卡数），卡数少于物理数量说明驱动或固件未正确加载。

## 总结

这台 Atlas 800 的交付顺序是：iBMC 挂镜像装银河麒麟 → 建 `HwHiAIUser` → 装 NPU 驱动 → 装固件 → 装 CANN → 依次以 `npu-smi info`、CANN 工具链、官方算例三层验证。全程有三次重启（驱动、固件、CANN 各一次），规划停机窗口时别只算一次。

几个只有踩过才会记住的点：

- **驱动、固件、CANN 三者是绑定的版本三元组**，不能只升其中一个。跨版本混装的结果通常是 `npu-smi` 正常但算子报错，排查成本远高于一次装对。
- **`HwHiAIUser` 先建好再动手**。驱动要以该用户身份运行，用户必须在执行安装脚本之前建好；root 直装完再补建用户，已落盘目录的属主不会自动修正，后续以该用户启动的任务会因权限不足失败。
- **aarch64 的软件源包名与 x86 不同**，Python/pip 依赖按源内实际包名确认，别照搬 x86 手册。

装完只是有了硬件通道。`npu-smi info` 出表只证明驱动与固件加载成功，业务模型能不能跑还得用目标模型跑一轮完整的推理或训练才算数。也是在这一步，把固件、驱动、CANN 三个版本号一并记进资产台账——以后判断任何一次升级是否可行，依据的就是这三个号。
