---
title: Windows 10 系统封装详细教程
date: 2023-09-08 15:00:00
updated: 2026-11-19 15:30:00
tags:
  - Windows
  - 封装
  - 系统部署
categories:
  - 系统运维
  - 基础设施
keywords: Win10封装, 系统部署, 批量部署, 镜像制作, NTlite, Dism++, 系统优化
description: Windows 10 系统封装的完整流程，覆盖虚拟机安装、账户与策略预配置、Dism++ 清理备份、NTlite 替换 install.esd 打包 ISO，适用于企业批量部署与全新安装场景。
cover: /medias/featureimages/3.jpg
toc: true
copyright: true
---

企业 IT 运维中常要重复面对同一件事：给不同部门批量装机，而每个部门的定制软件、环境变量、本地策略都不完全一样。逐台手工配置的时间成本随终端数量线性增长，且难以保证一致性。

系统封装的思路是把标准软件、环境配置、系统变量与本地策略预先配置好，连同系统状态一并打包成可分发的 ISO，装机时只做一次镜像写入。下文按虚拟机准备、系统与账户配置、策略与优化、清理备份、ISO 打包的顺序记录完整过程。

## 事前准备

| 类别 | 工具 / 资源 | 用途 |
| --- | --- | --- |
| 系统镜像 | [Windows 10 ISO](https://www.microsoft.com/zh-cn/software-download/windows10ISO) | 封装基线 |
| 镜像制作 | [NTlite](https://www.ntlite.com/download/) | 替换映像并打包 ISO |
| 精简优化 | [Dism++](https://www.chuyu.me/zh-Hans/) | 系统清理与备份 |
| 启动环境 | [优起通 PE](https://www.itsk.com/thread-416919-1-1.html) | 装机与恢复 |
| 驱动 | [万能驱动](https://www.itsk.com/forum.php?mod=viewthread&tid=416918&highlight=%CD%F2%C4%DC%C7%FD%B6%AF) | 批量装机后的硬件适配 |
| 虚拟化 | Hyper-V / VMware | 封装工位 |

> 时效提示：微软 ISO 下载页对非浏览器访问可能返回 403，请用浏览器打开并以官网当期页面为准；Dism++ 的分发重心已转向 GitHub Releases，官网链接若失效请转 GitHub 获取。

## 系统安装过程

### 1. 部署虚拟机环境

新建一台专用虚拟机作为封装工位，避免在实体机上封装引入驱动残留：

![虚拟机创建](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081513580.png "创建虚拟机")

### 2. 安装 Windows 10 系统

挂载 ISO 执行安装，下图分别是安装入口与分区设置界面：

![系统安装界面1](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081513034.png "系统安装界面")

![系统安装界面2](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081513216.png "分区设置")

### 3. OOBE 设置

完成初始设置向导（Out of Box Experience）：

![OOBE设置](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081514271.png "初始设置向导")

### 4. 用户账户配置

删除 OOBE 过程中创建的普通用户账户，改用内置 Administrator 完成后续封装，避免用户配置目录被写进镜像：

> **重要**：务必先启用 Administrator 账户再删除当前账户，否则可能把自己锁在系统之外。

依次操作：删除 OOBE 创建的默认用户 → 在「本地用户和组」中启用 Administrator（下图依次为删除默认用户、取消账户已禁用、账户列表确认状态）：

![删除用户账户](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081514423.png "删除默认用户")

![启用Administrator](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081514417.png "启用管理员账户")

![账户管理](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081514093.png "账户设置")

### 5. 登录 Administrator 账户

注销当前会话，改用 Administrator 登录：

![登录Administrator](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081514774.png "管理员登录")

## 标准软件安装与环境配置

### 1. 电源计划优化

以管理员身份打开命令提示符，导入「卓越性能」计划：

```cmd
powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61
```

非管理员执行会因权限不足失败。「卓越性能」仅在部分平台（主要为工作站 / HEDT 芯片组）可用，普通笔记本执行后可能提示方案不存在；此时回退到「高性能」即可：

```cmd
powercfg -duplicatescheme 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c
```

下图为命令执行结果：

![启用卓越性能命令](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081514835.png "命令执行")

再到控制面板 → 电源选项激活该计划：

![电源计划设置](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081514681.png "电源计划配置")

### 2. 个性化设置

按企业基线设定桌面外观，包括主题、桌面图标与任务栏样式（桌面右键 → 个性化）：

![个性化设置](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081514582.png "个性化配置")

### 3. Edge 浏览器插件安装

按实际需要安装浏览器扩展，本例安装两个：

- **Adblock Plus**：广告拦截
- **百度药丸**：站内搜索体验增强，不承担广告拦截

![Adblock Plus安装](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081514393.png "Adblock Plus")

![百度药丸安装](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081514234.png "百度药丸")

### 4. 环境功能安装

按下图在「启用或关闭 Windows 功能」中勾选业务所需组件，具体项由目标场景决定：

![功能安装](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081514895.png "功能组件安装")

### 5. 功能与本地策略设置

推荐开启存储感知以控制磁盘占用。本地策略与系统设置两处需保持一致：

- 开启存储感知，执行频率设为每天
- 存储感知子项全部开启，临时文件保留阈值设为 1 天

![存储感知策略设置](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081514146.png "组策略配置")

![存储感知设置](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081514301.png "存储感知配置")

## 系统清理与优化

封装前用 Dism++ 做一次清理，减少镜像体积与首启后的无效残留。清理项按界面提供的勾选项按需选择，不确定的项目保持默认不勾选，避免误删运行库导致定制软件无法运行。

## 系统封装

清理完成后，用 Dism++ 的系统备份功能导出系统镜像。该功能支持增量备份，多个版本可共用一个镜像文件，节省存放空间：

![Dism++系统备份](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081514056.png "系统备份功能")

## 封装内容小结

这份镜像相对原版 ISO 的实际改动只有五处，逐项列出是为了下次改版时能对得上账：

1. 删除 OOBE 创建的账户，改用内置 Administrator 完成配置
2. 启用高性能 / 卓越性能电源计划
3. 开启存储感知并设为每天执行
4. Edge 中预装 Adblock Plus 与百度药丸扩展
5. 按需启用所需 Windows 功能组件

改动越少，镜像的适用面越广、后续维护越轻。每多预装一项，就多一项要在下次改版时重新验证的东西。

## ISO 镜像打包

### 1. 准备工作

1. 解压原版 ISO
2. 将封装得到的 ESD 文件重命名为 `install.esd`
3. 用它替换解压目录中 `sources` 下的原 `install.esd`

![ESD文件替换](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081514703.png "文件替换")

### 2. 使用 NTlite 创建 ISO

1. 打开 NTlite，添加映像文件夹，选中上一步解压后的 ISO 目录：

   ![添加映像文件夹](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081514600.png "添加映像")

   ![映像加载](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081514596.png "映像加载")

2. 点击创建 ISO：

   ![创建ISO](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081515838.png "创建ISO")

3. 等待写入完成：

   ![创建进度](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081515760.png "创建进度")

   ![创建完成](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081515657.png "创建完成")

## 使用说明

产出的 ISO 可用于：

- 物理机全新安装
- 虚拟机部署（VMware、Hyper-V 等）
- 集成到批量部署工具链

> **注意**：封装镜像只适用于全新安装，不能用于在已有系统上做版本升级。

装机建议配合优起通 PE 与万能驱动使用，先写镜像再补驱动，可覆盖大部分异构机型。

## 安全与合规提醒

1. **授权合规**：确认 Windows 镜像与激活方式具备合法授权
2. **软件许可**：预装软件需符合其许可协议，商业软件注意批量授权与序列号处理方式
3. **企业策略**：封装内容遵循本单位安全基线与合规要求
4. **先验证再分发**：批量下发前在真机验证驱动、加域、定制软件与账户策略是否符合预期

## 总结

流程主线是：虚拟机内装系统 → 用 Administrator 完成软件与策略预配置 → Dism++ 清理并备份 → 用 NTlite 替换 `install.esd` 重打包 ISO。终端越多，省下的重复装机时间越可观。

不过封出来的镜像不是做完就一劳永逸。累积补丁会把镜像越拉越旧，新机型也会缺驱动，所以每个镜像版本都要留下「基于哪个 ISO、打了哪批补丁、在哪些真机上验证过驱动/加域/软件」的记录，否则半年后没人说得清手上这份镜像到底处于什么状态，只能从头再封一次。
