---
title: "关于我"
date: 2021-05-06 11:00:00
type: "about"
layout: "about"
---

我是李广明，现在做 AI Infra，主要给具身智能研发团队搭推理环境。下班以后也折腾服务器，只不过是自己的。这个博客两边都写。

## 工作里

给边缘推理做调优时，有一轮改动看着挺合理，一测 P95 还变长了，我就撤了。后来换了 GPU 切分方案，四路共卡的模型调用均值从约 204 ms 降到 115 ms。那轮还动了另一处配置，单项收益目前拆不开。{% post_link PVE双宿主机与GPU切分实录 "这几轮是怎么测的" %}

我也做身份和运维这边的活。有次 JumpServer 能登录，监控也全绿，用户点开资产却报 500。修完我用浏览器连了一次，又回去找那段会话录像。后来试着让 Agent 管资产，先拿测试对象跑了创建、授权、回读和清理。我想继续做的是，真交给 Agent 去办事之后，接手的人还能查到它动过什么、凭什么能动。{% post_link JumpServer企业版部署与健壮性工程 "JumpServer 那次故障和后来的 API 试验" %} · {% post_link AI-Native的五个维度从接管到自运转 "我现在怎么试 Agent 运维" %}

## 家里也会折腾

买了台 DGX Spark，我把手上的 Agent 接到本地模型，又在一份约二十五万 token 的输入里埋了三个标记，模型都找了回来。家里的知识库也要用 GPU，有时我想拿显卡测试串流，就得先把知识库的请求切走。{% post_link DGX-Spark-vLLM部署与多Agent接入 "DGX Spark 的试跑记录" %} · {% post_link 把家里的算力全掏出来WeKnora模型保障实录 "家里的知识库怎么挪算力" %}

还有两个自己想用的东西。我给飞牛 NAS 写了个视频超分和插帧应用，中途停了就先核对已经做好的分片，再接着跑。也改过 Mac 上的 Moonlight，排查切换主机后旧诊断结果为什么还会冒出来。{% post_link P100直通给NAS与飞牛超分插帧App "飞牛视频应用" %} · {% post_link Moonlight的macOS增强版为串流开发而重构 "Moonlight macOS 增强版" %}

博客里还有以前做企业 IT 和系统集成时留下的笔记。{% post_link "PowerStore 3.x的升级手顺" "做存储升级" %}、{% post_link 华为Atlas800服务器安装银河麒麟 "给 Atlas 800 装系统" %}、{% post_link AD搭建 "搭第一台域控" %}都写过。后来再做{% post_link 三台域控部署实录 "跨站点的三台域控" %}，才有机会把复制、DNS 和证书放在一起看。

如果你也在做推理平台，或者在找做 AI Infra 的人，欢迎聊聊。

[GitHub](https://github.com/opsbsligm) · [博客源码](https://github.com/bsligm/blog) · [联系我](/contact/)
