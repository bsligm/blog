---
title: 把 P100 直通给 NAS：顺手做了一个超分插帧的飞牛 App
date: 2026-10-15 21:00:00
updated: 2026-11-23 18:37:00
tags:
  - P100
  - DDA
  - 飞牛
  - 视频增强
  - GPU 推理
categories:
  - 基础设施
  - 系统维护
keywords: P100, DDA, Direct Device Assignment, 飞牛 fnOS, 超分, 插帧, appcenter, GPU 直通, NAS
description: "用 Hyper-V DDA 给飞牛 NAS 直通 Tesla P100，再把超分与插帧接入应用界面。记录目录授权、单 GPU 队列和成品回读怎么落到代码里。"
cover: /img/cover/p100-ffd.jpg
toc: true
copyright: true
---

给 NAS 里的老片做插帧，最烦的是跑完才发现结果写不进去。我原来用脚本处理，后来给飞牛做了应用界面，直接选片源、看成品路径，失败的任务也能回到明确状态。算力来自一张 Tesla P100 16 GB。飞牛本来就跑在 Hyper-V 虚拟机里，我把这张卡直接分配给它。

我把这件事按一个能留在 NAS 上长期用的应用来做。源片由现有共享目录管理，视频任务可长达数小时，机器还承担其他服务。我的工作从 GPU 直通走到应用入口、任务调度、续跑和成品核验。能运行模型只是最前面的一步。真正影响日常体验的是目录权限变化后能及时停下来、服务重启后知道从哪里续，以及最后打开的是一份正常的视频。

## 为什么选 Hyper-V DDA

Discrete Device Assignment（DDA）把整块 PCIe 设备交给指定 Hyper-V 虚拟机。Linux 宿主用 `vfio-pci` 是另一条部署路线。维持现有 Hyper-V 宿主意味着不用为这张卡迁移 NAS，也不用改来宾的启动参数。宿主失去对这张卡的使用权，之后的视频处理和嵌入负载都由来宾侧安排。

验收按三步走。先确认来宾枚举到设备并绑定 NVIDIA 驱动，再从来宾查驱动与显存，最后进入推理运行环境验证 CUDA 实际可用。后两项是切换后补齐的。部署前的硬件资格、虚拟机配置和设备位置路径以 [Microsoft 的 DDA 文档](https://learn.microsoft.com/windows-server/virtualization/hyper-v/deploy/deploying-graphics-devices-using-dda) 为准。

## App 设计：把推理容器包成飞牛应用

最初只做超分、插帧和串联处理。应用从飞牛获取登录与目录授权，Web 界面负责选片和看进度，后端拆为任务网关、推理 worker 和 GPU 准入策略。公开版后来加了去噪等处理路径。仓库列出的兼容范围是 fnOS x86 + Tesla P100，输入范围为 SDR/CFR。

超分改变画面尺寸，插帧增加时间轴上的画面数。两者都做时，先在源分辨率插帧，再把结果交给超分，避免插帧阶段先处理放大后的像素。SDR 表示标准动态范围，CFR 表示恒定帧率。这个版本的预检会把输入规格和所选模式送进同一份处理计划，界面可以在排队前把不支持的原因告诉用户。实现入口是 [任务预检](https://github.com/opsbsligm/fnos-video-enhance/blob/4d15a89e6c7f/src/server.py#L316)，各模式见 [项目 README](https://github.com/opsbsligm/fnos-video-enhance/blob/4d15a89e6c7f/README.md)。

从用户选片开始，请求先经过任务网关。网关负责授权、预检和记录任务，运行时不直接把整片交给一个常驻请求。调度器等到有资源才开 worker，worker 解码、调用模型、输出分片，再将成品封装和回读。这个拆分的好处在重启时最明显。打开页面可以重新读任务状态，处理进度则从已经验过的分片恢复。即使 UI 刷新丢了进度条，任务和视频工作目录仍有自己的记录。

## 反直觉的坑：预检全绿，文件还是没写进去

早期版本预检只查"目录存不存在"，结果任务跑完写不进输出目录，白烧了二十分钟显存。反直觉的地方是：**预检阶段一切正常**，代价付完了才看见。

修法是把 `output_writable` 加进 preflight，并把最终保存路径直接显示在前端预检对话框里——**用户提交前就知道文件会落在哪**。可写检查的关键在身份：

```python
def check_output_write(uid, output):
    root = matching_root(output, authorized_roots(uid, True))
    app_acl(uid, output, True)
    fd = open_beneath(root, output, directory=True)
    try:
        if not os.access('.', os.W_OK | os.X_OK, dir_fd=fd, effective_ids=True):
            raise PermissionError('飞牛已授权，但应用账号无法写入成品目录；'
                                  '请在飞牛文件管理中检查该目录的应用写入权限')
    finally:
        os.close(fd)
```

飞牛应用授权和 Linux 写权限分别检查。`check_output_write` 先核授权根和应用 ACL，再依当前进程的有效身份检查目录写入和进入权限。部署时要让这项检查与执行任务的账号权限一致。源码和报错见 [server.py](https://github.com/opsbsligm/fnos-video-enhance/blob/4d15a89e6c7f/src/server.py#L126)。

前端提交之前读的是源文件规格、处理计划和成品目录。源文件先通过授权路径打开，再由 ffprobe 检查；成品默认放到原片旁边，回包显式带上 `output_dir` 和 `output_writable`。这样可以让用户在生成任务前修目录权限。进入队列后，调度器还要重新看 GPU 准入和资源余量。这两步分开后，一次短时显存不足也不会被误报成片源本身不受支持。

## 队列与验收：把"完成"的定义写进产品逻辑

应用把视频任务放进 SQLite，一次只启动一个 worker。调度器按任务创建顺序检查候选任务，在启动前用锁重新核对状态。下面是调度过程的节选：

```python
def scheduler():
    global CURRENT
    while not STOP.wait(3):
        with db() as c:
            items = c.execute(
                "SELECT * FROM jobs WHERE state IN ('queued','held') "
                "ORDER BY created").fetchall()
        for row in items:
            with LOCK:
                state = db().execute('SELECT state FROM jobs WHERE id=?',
                                     (row['id'],)).fetchone()['state']
                if state not in ('queued', 'held'):
                    continue
                CURRENT = (row['id'], subprocess.Popen(argv, ...))
                update(row['id'], 'running', '正在执行')
            # ... 等进程结束（每 2 秒复查权限与 guard.require_gpu）...
            break
```

同一张卡还会被嵌入服务使用，应用内单并发只约束视频任务。外部负载交给 GPU 准入规则处理，资源不足时可以保留任务，等下一轮重新检查。任务状态持久化在 `jobs` 表，视频分片能否续跑另由检查点决定。调度器和资源判断分别见 [server.py](https://github.com/opsbsligm/fnos-video-enhance/blob/4d15a89e6c7f/src/server.py#L154) 与 [guard.py](https://github.com/opsbsligm/fnos-video-enhance/blob/4d15a89e6c7f/src/guard.py#L75)。

长片分片编码。每片先用解包计数核对包数，再检查尺寸和帧率，通过后写入 SHA-256。续跑时重新核对已提交的分片。整片封装完成后，再逐帧解码检查成品。这两处检查分别防止复用错误的中间产物，以及把损坏的最终文件标为完成。下面是检查过程的节选：

```python
# 续跑前：逐分片 SHA 重算，任一不符即拒绝续跑
    for i, p in enumerate(data.get('parts', [])):
        if p['name'] != f'part-{i:06d}.mkv' or p['start'] != done:
            raise ValueError('检查点分片顺序非法')
        if store.sha(p['name']) != p['sha256']:
            raise ValueError('已完成分片校验和变化；拒绝续跑')

# 封装后：全量实际解码验收
        final = decoded(finalfd)
        fv = next(x for x in final['streams'] if x['codec_type'] == 'video')
        if abs(float(final['format']['duration']) - expected_duration) > .25:
            raise RuntimeError('最终时长校验失败')
        if int(fv.get('nb_read_frames', 0)) != total or fv['width'] != out_width \
                or fv['height'] != out_height \
                or abs(float(Fraction(fv['avg_frame_rate']) - target)) > .02:
            raise RuntimeError('最终实际解码/帧数/尺寸/帧率验收失败')
```

分片哈希用来判断中间产物能否复用。最后一次解码核对的是成品的时长、帧数、尺寸与实际帧率，音轨及字幕则按任务预期检查。分片检查点和成品检查分别见 [worker.py 的分片校验](https://github.com/opsbsligm/fnos-video-enhance/blob/4d15a89e6c7f/src/worker.py#L335) 与 [成品回读](https://github.com/opsbsligm/fnos-video-enhance/blob/4d15a89e6c7f/src/worker.py#L377)。

**错误路径不吞。** 非 JSON 错误（OOM、网关 HTML 页）归一成一条固定文案：JSON 带 `error` 就用它，不带就兜底；日志留末 1500 字节进任务状态。

## 显存规划：一张卡两个主人

这张 P100 当时也给 [WeKnora 嵌入池](/2026/10/11/%E6%8A%8A%E5%AE%B6%E9%87%8C%E7%9A%84%E7%AE%97%E5%8A%9B%E5%85%A8%E6%8E%8F%E5%87%BA%E6%9D%A5WeKnora%E6%A8%A1%E5%9E%8B%E4%BF%9D%E9%9A%9C%E5%AE%9E%E5%BD%95/) 用。嵌入需要及时响应，视频可以排队，因此视频模型按任务加载，资源冲突时先让嵌入继续跑。视频任务得承担一次重新加载的耗时，共用显卡期间也不承诺两个负载都能满速。

单并发只能防两个视频任务抢同一张卡，保护不了旁边的嵌入服务。因此调度器启动 worker 后还会定期核对目录授权和资源状态。worker 可以在分片边界主动让出 GPU，把已提交的分片保留下来。应用重启时，能识别出兼容流水线版本的活动任务会被记为等待恢复，旧任务如果没有可靠检查点则保留中断状态。这样同一份 SQLite 里的记录可以继续用，检查点仍要按它自己的规则重新核实。 [重启时的任务恢复](https://github.com/opsbsligm/fnos-video-enhance/blob/4d15a89e6c7f/src/server.py#L56) · [运行中的授权与 GPU 检查](https://github.com/opsbsligm/fnos-video-enhance/blob/4d15a89e6c7f/src/server.py#L199)

## 已跑通的部分

在当时的 P100 上，我跑通了从应用选片、检查输出路径、提交任务，到生成和回读成品的流程。4K 样片有过降档处理记录，未形成稳定 60 fps 的结论。目标输出帧率和处理速度是两个指标。要比较硬件或模型，还要在相同片源、模型、编码规格下同时记录两者。

有一轮 4K 长片在应用中心重启后被标为失败，检查点仍在。恢复任务后，计数从 33,936 增到 33,984，说明 worker 又开始处理。那份记录收尾时，整片尚未完成，成品回读和抽帧目检也未完成。我把这次结果记作恢复成功，成品验收留空。

最后的界面提示也区分三种结果。CPU 功能预览会缩小输入以检查流程；GPU 原尺寸样片只处理短片段，拿来确认画面和目标规格；整片任务结束后才展示成品的尺寸、帧率和时长。样片可以帮用户先发现模型风格和设置不合适，长片运行时间、最终封装和音轨都要到整片这条路径再核。读代码可以从预检开始，跟到任务启动、成品回读，最后看这些结果怎样写回任务。 [成品回读](https://github.com/opsbsligm/fnos-video-enhance/blob/4d15a89e6c7f/src/worker.py#L374) · [三种结果的界面口径](https://github.com/opsbsligm/fnos-video-enhance/blob/4d15a89e6c7f/src/server.py#L222)

私人环境里曾遇到整包升级覆盖热修，后来把热修绑定到具体应用版本。本文对应公开源码的版本号是 [0.3.12](https://github.com/opsbsligm/fnos-video-enhance/blob/4d15a89e6c7f/src/version.py#L2)。[项目仓库](https://github.com/opsbsligm/fnos-video-enhance)提供源码、打包和测试脚本，公开仓未附 `.fpk` 安装包、模型权重或运行包。飞牛跨大版本升级后的直通表现仍待复测。
