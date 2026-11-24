---
title: "关于我"
date: 2021-05-06 11:00:00
type: "about"
layout: "about"
---

我叫李广明。以前做系统集成，装过服务器和存储，也去过不少客户现场。现在给具身智能研发做基础设施，主要做 GPU、模型服务和日常运维。

## 工作

最近部署了两台 PVE 宿主，一台供桌面和基础服务，一台跑边缘推理。为了看四路一起跑会等多久，我用同一套输入测了几轮。固定核的那一轮反而慢了，最后撤回。配置和数字在{% post_link PVE双宿主机与GPU切分实录 "PVE 部署笔记" %}。

我也管过目录和堡垒机。{% post_link 三台域控部署实录 "三台域控" %}那篇记的是本地和云上的部署，{% post_link JumpServer企业版部署与健壮性工程 "JumpServer" %}里有一次连不上资产的故障。最近在试用 Agent 做运维，先让它读状态和找日志，再拿测试资产试授权。{% post_link AI-Native的五个维度从接管到自运转 "家里那套运维试验" %}里记了目前做到哪。

## 个人项目

工作之外，我买了台 DGX Spark 跑本地模型，接了 Codex 和 WorkBuddy。家里的知识库有时要和视频任务借同一张显卡，我就把换机器的逻辑移到路由里。这两件事分别写在{% post_link DGX-Spark-vLLM部署与多Agent接入 "DGX Spark" %}和{% post_link 把家里的算力全掏出来WeKnora模型保障实录 "WeKnora" %}里。

我还给飞牛 NAS 写了个{% post_link P100直通给NAS与飞牛超分插帧App "超分和插帧应用" %}，也改过{% post_link Moonlight的macOS增强版为串流开发而重构 "Moonlight Mac 客户端" %}。

早年的笔记也留在这里。{% post_link "PowerStore 3.x的升级手顺" "PowerStore 升级" %}、{% post_link 华为Atlas800服务器安装银河麒麟 "Atlas 800 装机" %}、{% post_link AD搭建 "第一台域控" %}。

想聊 AI Infra 的工作，或者对文里的项目有问题，可以联系我。

[GitHub](https://github.com/opsbsligm) · [博客源码](https://github.com/bsligm/blog) · [联系我](/contact/)
