---
title: "批量装机前，我怎么封一份 Windows 10 镜像"
date: 2023-09-08 15:00:00
updated: 2026-11-23 22:35:00
tags:
  - Windows
  - 封装
  - 系统部署
categories:
  - 系统运维
  - 基础设施
keywords: Win10封装, 系统部署, 批量部署, 镜像制作, NTlite, Dism++, 系统优化
description: "2023 年在虚拟机里做参考镜像，从装软件到重打包 ISO。留着换机时最容易漏的首启、驱动和加域检查。"
cover: /img/cover/win10-image.jpg
toc: true
copyright: true
---

2023 年做 Windows 10 批量装机，同一套软件和设置要在每台电脑上点一遍。我先在虚拟机里做一份参考镜像，留好原始 ISO 和改动记录，再打成新 ISO。真正麻烦的是镜像到了另一台电脑上，驱动、首启和加域还得重新过一遍。

> **适用范围**：Windows 10 Home/Pro 常规支持已于 2025 年 10 月结束。LTSC 等版本应按各自生命周期核对，使用扩展安全更新的环境还要单独核实资格与期限。本文保留历史过程，[微软生命周期公告](https://learn.microsoft.com/en-us/lifecycle/products/windows-10-home-and-pro) 和当前受支持的系统版本决定新项目选型。

## 关键设计决策

- **捕获和重打包是两步。** 历史流程最后替换 ISO 的 `install.esd`，却没有留下 `Sysprep /generalize` 的执行证据。包能启动并进入 OOBE 只说明安装路径通了，不能据此把捕获镜像交给不同目标机。跨机器部署前按 [Microsoft Sysprep 说明](https://learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/sysprep-process-overview?view=windows-11) 对参考安装做通用化，再捕获。
- **Dism++ 增量备份。** 多个镜像版本共用一个文件、只存差异，省空间。链条是相互依赖的：回滚到旧版本需要前面所有链文件都在，断一环就不能独立回退。
- **制作用账户和交付身份分开。** 原做法用内置管理员制作镜像，版本记录缺少目标机账户状态的验收。重做时不在可分发镜像留持久化管理员凭据或个人配置，终端管理员与用户身份由首启、注册和组织策略交付。
- **电源方案带回退。** 卓越性能只在部分平台（工作站/HEDT）可见，装机按「卓越性能 → 高性能」顺序探测回退，避免笔记本上硬编码一个方案。
- **最小镜像原则。** 改动越少，镜像适用面越广、维护越轻。「封装内容小结」把实际改动逐项列出，改版时能对账，也是验收时的决策标准。

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

挂载 ISO 执行安装：

![系统安装界面1](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081513034.png "系统安装界面")

![系统安装界面2](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081513216.png "分区设置")

### 3. OOBE 设置

完成 OOBE（Out of Box Experience，初始设置向导）：

![OOBE设置](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081514271.png "初始设置向导")

### 4. 参考机账户

原流程曾在参考虚拟机里使用内置管理员完成设置。这个账户属于制作过程，不能把它的密码、登录状态或专用配置带给目标电脑。正式交付前检查镜像里只留下批准的默认配置，由部署工具在首启发放各台设备所需的身份。历史账户设置截图不再引用。

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

再到控制面板 → 电源选项激活：

![电源计划设置](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081514681.png "电源计划配置")

### 2. 个性化设置

按企业基线设定桌面外观（主题、桌面图标、任务栏样式；桌面右键 → 个性化）：

![个性化设置](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081514582.png "个性化配置")

### 3. Edge 浏览器插件安装

按需安装两个扩展：

- **Adblock Plus**：广告拦截
- **百度药丸（Baidu Capsule）**：专门过滤百度系广告与追踪，与 Adblock Plus（负责通用页面广告拦截）互补

![Adblock Plus安装](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081514393.png "Adblock Plus")

![百度药丸安装](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081514234.png "百度药丸")

### 4. 环境功能安装

按下图在「启用或关闭 Windows 功能」中勾选业务所需组件，具体项由目标场景决定：

![功能安装](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081514895.png "功能组件安装")

### 5. 功能与本地策略设置

开启存储感知控制磁盘占用，本地策略与系统设置两处保持一致：

- 开启存储感知，执行频率设为每天
- 存储感知子项全部开启，临时文件保留阈值设为 1 天

![存储感知策略设置](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081514146.png "组策略配置")

![存储感知设置](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081514301.png "存储感知配置")

## 系统清理与优化

封装前用 Dism++ 做一次清理，减少镜像体积与首启后的无效残留。清理项按界面提供的勾选项按需选择，不确定的项目保持默认不勾选，避免误删运行库导致定制软件无法运行。

## 系统封装

用 Dism++ 的系统备份功能导出系统镜像，支持增量备份，多个版本可共用一个镜像文件，节省空间：

![Dism++系统备份](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081514056.png "系统备份功能")

## 封装内容小结

这份镜像相对原版 ISO 的实际改动只有五处，逐项列出是为了下次改版时能对得上账：

1. 删除 OOBE 创建的账户，改用内置 Administrator 完成配置
2. 启用高性能 / 卓越性能电源计划
3. 开启存储感知并设为每天执行
4. Edge 中预装 Adblock Plus 与百度药丸扩展
5. 按需启用所需 Windows 功能组件

每多预装一项，就多一项要在下次改版时重新验证的东西——这条在「关键设计决策」里作为验收标准，改版前先过一遍这份小结。

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

## 怎样验一个可分发的包

重打包后的 ISO 先在干净虚拟机中测试启动和首启，再选不同目标机型复验存储、网络、补丁和驱动。使用源自完整参考系统的镜像时，在捕获前核对通用化成功，发布前回读设备身份与管理员状态，最后再进入正式设备注册或加域流程。[AD 部署记录](/2021/05/06/AD搭建/) 交代了加域以后的 DNS、登录和组策略验证。旧流程没有留下跨机型验收矩阵，不能把一个虚拟机装通扩大到异构终端普遍可用。

## 安全与合规提醒

1. **授权合规**：确认 Windows 镜像与激活方式具备合法授权
2. **软件许可**：预装软件需符合其许可协议，商业软件注意批量授权与序列号处理方式
3. **企业策略**：封装内容遵循本单位安全基线与合规要求
4. **先验证再分发**：批量下发前在真机验证驱动、加域、定制软件与账户策略是否符合预期

## 总结

原流程留下了参考机配置、Dism++ 备份和 NTlite 重打包三个检查点。对批量装机最有用的是能追溯每个检查点用的源镜像和改动清单。

不过镜像不是做完就一劳永逸：累积补丁会把镜像越拉越旧，新机型也会缺驱动。每个镜像版本都要留下「基于哪个 ISO、打了哪批补丁、在哪些真机验证过驱动/加域/软件」的记录，否则半年后没人说得清手上这份镜像处于什么状态，只能从头再封一次。

## 历史证据边界

翻回当年的文件，没找到通用化日志，也没留各机型的发布记录。浏览器扩展清单只能当那时装过什么看，后续要按组织现在的扩展清单重新确认。