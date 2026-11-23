---
title: Home Assistant 运维实录：实体状态、HAOS 升级和备份怎么验
date: 2026-10-03 22:00:00
updated: 2026-11-23 17:30:00
tags:
  - Home Assistant
  - HAOS
  - AI Agent
  - Docker
  - 系统运维
categories:
  - 系统运维
  - 系统维护
keywords: HAOS, Home Assistant, REST API, 备份恢复, Agent, 系统运维
description: 从集成异常排查到 HAOS 升级，记录应用状态和系统状态如何分开验证，备份如何回读，以及哪些变更仍需人工批准。
cover: /img/cover/haos-kernel.jpg
toc: true
copyright: true
---

Home Assistant 有次只报「集成不可用」。从应用侧看，实体的确没有更新，但这个状态既可能是集成报错，也可能是底层进程退出。我先用应用 API 确定影响范围，再读系统日志和容器退出状态。能分清这两层，才知道该查配置、查磁盘，还是查进程为什么被杀。

## 从「不可用」查到进程退出

日常读实体状态、事件和可用性走 Home Assistant 支持的应用接口。需要确认磁盘用量、容器状态或系统升级结果，再用受限管理路径查系统。系统级权限只留给明确需要的任务，升级和其他高权限变更由人工批准。

容器退出码 `137` 表示进程因 `SIGKILL` 退出。要判定是 OOM，还要核容器的 `OOMKilled` 状态和对应时间段的内核日志；停止超时后被强制终止也会出现同一个退出码。其他非零退出码按应用自己的日志解释。这比见到异常就重启多一步，但能决定下一步查内存、退出流程，还是配置。

另外踩过一次容器内临时改文件的坑：当时看着生效，升级替换容器后，改动就没了。后面的变更只走 Home Assistant 支持的持久化配置入口，容器内部留作诊断现场。

## 备份、升级和读回

HAOS 和 Home Assistant Core 分别更新。HAOS 支持从界面或 CLI 更新，我这次用 CLI，方便在同一条记录里对比升级前后的版本和状态。步骤是先建备份并回读归档，再升级，最后核 OS 版本、相关应用和关键实体。版本对上只说明升级生效，关键实体重新出数才是应用层的读回。

传文件时还有个容易记反的细节：新版 OpenSSH 的 `scp` 默认使用 SFTP，`-O` 是改用旧 SCP 协议。只有确认目标端不支持 SFTP、同时允许旧 SCP 时，才需要考虑这个兼容选项。

这轮实测覆盖了容器异常定位、磁盘检查、升级后的版本与应用状态核对。备份传回后做了归档结构检查；连续两次文件大小不变只是提示写入可能结束，归档可读也不能证明可以恢复。升级仍由人工确认，升级失败后的恢复演练还没有完成。

文档：[HAOS 升级](https://www.home-assistant.io/common-tasks/os/#updating-the-home-assistant-operating-system)、[备份与恢复](https://www.home-assistant.io/common-tasks/general/backups/)、[OpenSSH scp 手册](https://man.openbsd.org/scp)、[Docker 容器退出状态](https://docs.docker.com/reference/cli/docker/container/ls/)。
