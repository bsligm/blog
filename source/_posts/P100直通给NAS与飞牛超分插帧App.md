---
title: 把 P100 直通给 NAS：顺手做了一个超分插帧的飞牛 App
date: 2026-10-15 21:00:00
updated: 2026-11-20 20:30:00
tags:
  - P100
  - DDA
  - 飞牛
  - 视频增强
  - GPU 推理
categories:
  - 基础设施
  - 系统维护
keywords: P100, DDA, Direct Data Access, 飞牛 fnOS, 超分, 插帧, FFP, appcenter, GPU 直通, NAS
description: 飞牛 NAS 里一张无风扇 Tesla P100 16G：直通选 DDA 不选 vfio；顺手做了个一键超分 + 插帧的飞牛 App，把应用账号预检、SQLite 单并发调度、"分片检查点 + 成品解码验收"两层验收的设计记下来，以及 4K 插帧压不满 60fps 的实测边界。
cover: /img/cover/p100-ffd.jpg
toc: true
copyright: true
---

飞牛（fnOS）NAS 里塞了一张无风扇 Tesla P100 16G，直通方式结论先放：**选 DDA，不选 vfio**。这张卡定位是"常驻低负载推理"，判定标准不是"隔离多彻底"，而是"系统升级要动几次启动链"——单消费者场景，DDA 长期成本更低。顺手做了个飞牛 App：视频一键超分 + 插帧。两件事一起记。

## 直通选型：DDA 不是"更简单"，是更便宜

飞牛底层是 Debian，GPU 直通有两条路：

| 方案 | 机制 | 优点 | 代价 |
| --- | --- | --- | --- |
| vfio-pci | 整卡绑定 vfio 驱动 | 隔离彻底 | 要改启动参数、绑 IOMMU 组，NAS 系统升级时容易被打回 |
| DDA | 内核态透传，容器内原生 CUDA | 对系统侵入小，升级友好 | 隔离性弱于 vfio，同机其他进程可见该卡 |

拆开选 DDA 的理由：不是机制更简单，而是 vfio 的代价在这个环境里摊不平——NAS 系统盘数据盘合一，vfio 要动 GRUB 参数和 initramfs，每次系统大升级都是一次"直通还能不能活"的重新验证；这张卡消费者只有一个（自研推理容器），不需要 vfio 级隔离；P100 是 Maxwell 架构，DDA 路径下 CUDA 工具链验证过完整。时间线说明：`nvidia-smi`、容器 CUDA 这条用户态链路是切换后几天补齐的验收，不算在切换当天。

切换动作就是宿主侧三行 Hyper-V 命令 + 来宾侧内核驱动自识别：

```powershell
# 前置：飞牛 VM 关闭；动态内存 True→False（DDA 限制），启动内存固定 8GiB
Disable-PnpDevice -InstanceID 'PCI\VEN_10DE&DEV_15F8&…' -Confirm:$false
Dismount-VMHostAssignableDevice -InstanceID <同上> -Force
Add-VMAssignableDevice -VMName 飞牛NAS -InstanceID <同上>
# 来宾侧验证：lspci 显示 Kernel driver in use: nvidia
```

全程没碰 GRUB 和 initramfs——这就是 vfio 每次大升级要重新验证、而 DDA 不用动启动链的具体证据。

## App 设计：把推理容器包成飞牛应用

推理能力在容器里，NAS 用户要的是"在文件管理器里点一下"，所以做成标准飞牛 App（appcenter 机制）：外壳 Web UI，里子是调用推理容器的 REST 接口。功能范围克制：**超分（低清 → 1080p/4K）+ 插帧（30 → 60fps），二选一或串联**，不做风格化、去噪——99% 的需求就是把老片源提清晰度，做多了维护不起。

## 反直觉的坑：预检全绿，文件还是没写进去

早期版本预检只查"目录存不存在"，结果任务跑完写不进输出目录，白烧了二十分钟显存。反直觉的地方是：**预检阶段一切正常**，代价付完了才看见。

修法是把 `output_writable` 加进 preflight，并把最终保存路径直接显示在前端预检对话框里——**用户提交前就知道文件会落在哪**。可写检查的关键在身份：

```python
def check_output_write(uid, output):
    root = matching_root(output, authorized_roots(uid, True))
    app_acl(uid, output, True)
    fd = open_beneath(root, output, directory=True)
    try:
        # 系统授权不等于 Linux ACL 允许应用账号写入；用与 worker 相同的
        # effective 身份检查，而不是当前服务身份。
        if not os.access('.', os.W_OK | os.X_OK, dir_fd=fd, effective_ids=True):
            raise PermissionError('飞牛已授权，但应用账号无法写入成品目录；'
                                  '请在飞牛文件管理中检查该目录的应用写入权限')
    finally:
        os.close(fd)
```

飞牛里"系统授权"和"应用账号 ACL"是两层，最容易踩的是"预检用服务身份能写、worker 用应用账号写不进"。所以不写临时文件，用**与 worker 相同的应用账号 effective 身份**核 ACL 写权限——判定口径和执行身份一致；报错文案直接指到飞牛 UI 操作。

完整预检四项：源文件可读（开 fd + ffprobe）、输出目录可写（上面的 effective 身份检查）、GPU 显存余量闸门（只读 `nvidia-smi` 采样）、GPU 准入（策略列表内才放行，不满足置 `held` 排队，模型按任务加载）。预检不过直接告诉用户缺什么，不提交一个必然失败的任务再等二十分钟。

## 队列与验收：把"完成"的定义写进产品逻辑

**任务队列严格单并发。** P100 一张卡，第二个任务排队，不做"小任务插队"——NAS 用户的心智就是"我提交了，它排着，好了通知我"，插队打乱预期。实现全部是 SQLite + 一个 `break`：

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
            break            # 单并发的全部实现
```

队列本体是 `jobs` 表的 `state` 字段，没有队列对象、没有信号量——并发数 1 时，锁 + 状态机比队列对象更不易出 bug。重启后队列还在（表在）；`held`（让步/权限撤销，检查点保留）与 `queued` 恢复条件不同。运行中每 2 秒复查 GPU 余量与目录授权，恶化就 kill 置 `held`——"视频等嵌入"的动态版本就是这段。

**验收标准写进产品逻辑，而且是两层。** 第一层**分片级 SHA256 检查点**：分片编码完先解码回读核帧数/分辨率/帧率，过了才把 SHA 写进检查点；续跑逐分片重算比对，对不上拒绝续跑——NAS 断电/重启后恢复的依据。第二层**成品级全量实际解码**：封装完不是数大小就交差：

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

所以"完成"= 成品真实落盘，且分片 SHA 检查点 + 成品实际解码（帧数/时长/分辨率/帧率/音轨字幕数与源一致）两层都过——不是"任务状态显示成功"，也不是简单"SHA 对得上"（成品层验收的是解码结果，不是整片 SHA）。NAS 环境里"容器说成功"和"文件真的在那"之间有中间层，只看状态位会漏；检查点用 tmp + `os.replace` + fsync 原子提交，不会半写。

**错误路径不吞。** 非 JSON 错误（OOM、网关 HTML 页）归一成一条固定文案：JSON 带 `error` 就用它，不带就兜底；每任务日志留末 1500 字节进任务状态。

## 显存规划：一张卡两个主人

这张 P100 同时也是 [WeKnora 嵌入池](/2026/10/11/%E6%8A%8A%E5%AE%B6%E9%87%8C%E7%9A%84%E7%AE%97%E5%8A%9B%E5%85%A8%E6%8E%8F%E5%87%BA%E6%9D%A5WeKnora%E6%A8%A1%E5%9E%8B%E4%BF%9D%E9%9A%9C%E5%AE%9E%E5%BD%95/) 的主池。同一张卡两个主人，规则写死：嵌入模型常驻优先保；超分/插帧模型按需加载、用完即卸；冲突时视频任务等嵌入——嵌入被 WeKnora 高频调用，卡它等于卡全站知识库。代价是视频任务多等十几秒模型加载，换来两边都不需要"暂停对方"的手动操作。

## 版本节奏：主版本和热修不混

App 走飞牛 appcenter 升级机制，版本从 0.3.x 磨到 0.3.12 收口。踩过坑：官方升级包覆盖自研修改、热修和主版本升级互相打架。收口约定：**主版本走 appcenter 正式包，热修走独立补丁并在包内登记适用版本**，不混。

## 成果：一张卡在 NAS 上同时养两个推理服务，交付口径已定

- P100 以 DDA 常驻 NAS，同一张卡同时供给 WeKnora 嵌入池与超分插帧 App，冲突时视频等嵌入，两边不再需要手动"暂停对方"；
- 飞牛 App 0.3.12 收口在用：主版本走 appcenter 正式包、热修走独立补丁并登记适用版本，官方升级覆盖自研修改的坑有了固定解法；
- "完成"的定义已进产品逻辑：预检四项（源文件可读、输出目录可写、显存余量、GPU 准入）＋分片 SHA256 检查点 + 成品全量实际解码两层验收，替代任务状态位；
- 4K 插帧按"1080p 插帧满帧、4K 插帧降帧可用"的口径在用，4K 满帧率明确要等换卡，交付不再含混。

## 未闭环清单

| 事项 | 状态 |
| --- | --- |
| 4K 插帧 60fps | 未达成（峰值 50 多帧）；交付口径：1080p 插帧满帧、4K 插帧降帧可用 |
| 换卡 | 未定，4K 插帧提到满帧率的唯一路径 |
| vfio 替代方案 | 未做，当前单消费者，隔离需求不成立 |

## 小结

P100 直通和这个 App 都没有高难动作。真正花时间是文档不写的部分：直通方式对系统升级的容忍度差多少、"成功"和"文件落盘"在 NAS 环境是两个状态、官方升级包覆盖自研修改。

只留一条经验：**NAS 上跑推理，先定义"完成"——分片 SHA 检查点 + 成品实际解码两层都过，不是任务状态位。**

---

卡型号、显存数字与 App 版本号取自当时现场记录；DDA 行为未经飞牛大升级后二次复测，仅作口径参考。
