---
title: "关于我"
date: 2021-05-06 11:00:00
type: "about"
layout: "about"
---

我叫李广明。入行时做企业 IT 和系统集成，现在给具身智能团队搭推理环境。这里既有以前装域控的老笔记，也有最近怎么给模型分显卡的记录。

## 工作里

边缘推理有次改完反而变慢，我把那轮撤了。后来换 GPU 切分，四路一起跑，模型调用均值从约 204 ms 到 115 ms。那轮还有别的改动，我把两轮条件都写进了{% post_link PVE双宿主机与GPU切分实录 "这篇 PVE 笔记" %}。

最近在试让 Agent 帮我做些运维。能先查哪台服务出了问题，能不能在拿到许可后改一条授权，做完谁来确认。我在{% post_link JumpServer企业版部署与健壮性工程 "JumpServer 上拿测试资产跑过一遍" %}。家里还有个比较直白的试验，{% post_link AI-Native的五个维度从接管到自运转 "让 Agent 在推理服务掉线时先查一轮" %}，现在还靠人启动调查。

## 家里也会折腾

买了台 DGX Spark，我把手上的 Agent 接到本地模型，又在一份约二十五万 token 的输入里埋了三个标记，模型都找了回来。家里的知识库也要用 GPU，有时我想拿显卡测试串流，就得先把知识库的请求切走。{% post_link DGX-Spark-vLLM部署与多Agent接入 "DGX Spark 的试跑记录" %} · {% post_link 把家里的算力全掏出来WeKnora模型保障实录 "家里的知识库怎么挪算力" %}

我还给飞牛 NAS 写了个{% post_link P100直通给NAS与飞牛超分插帧App "插帧和超分应用" %}。旧片跑到一半停了，能验过已经做完的分片，再接着做。另一个是{% post_link Moonlight的macOS增强版为串流开发而重构 "Mac 上的 Moonlight" %}，为了搞清拔掉的设备怎么又回到列表上，我去跟了一次后台扫描。

博客里还有以前做企业 IT 和系统集成时留下的笔记。{% post_link "PowerStore 3.x的升级手顺" "做存储升级" %}、{% post_link 华为Atlas800服务器安装银河麒麟 "给 Atlas 800 装系统" %}、{% post_link AD搭建 "搭第一台域控" %}都写过。后来再做{% post_link 三台域控部署实录 "跨站点的三台域控" %}，才有机会把复制、DNS 和证书放在一起看。

如果你在做推理平台，或者在找做 AI Infra 的人，可以来聊。

[GitHub](https://github.com/opsbsligm) · [博客源码](https://github.com/bsligm/blog) · [联系我](/contact/)
