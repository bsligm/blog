---
title: Windows Server 的 Agent 接管：PowerShell 7 与 WinRM 双通道实录
date: 2026-10-01 21:00:00
updated: 2026-11-20 19:00:00
tags:
  - Windows Server
  - PowerShell
  - WinRM
  - AI Agent
  - 系统运维
categories:
  - 系统运维
  - 系统维护
keywords: PowerShell 7, WinRM, pywinrm, NTLM, EncodedCommand, 域控, Agent 接管, SSH 备选, Windows 远程管理
description: 三台 Windows Server 2025 域控加 Hyper-V 宿主接入 Agent 的完整记录：PowerShell 7 作执行面、WinRM 作一等通道、SSH 降为备选。逐条给出通道选型的取舍、两个必须写下来的版本坑、长命令的拆分模型，以及三台共用一套凭据的接入矩阵。
cover: /img/cover/windows-agent.jpg
toc: true
copyright: true
---

把三台 Windows 主机交给 Agent 接管，目标很直接：让 Agent 用一条固定节奏（写脚本 → 上传 → 执行 → 读回退出码）操作它们，长上下文和会话数据都不再依赖人工开远程桌面。真正花时间的不是通道本身，而是让这条节奏在三台行为不一致的机器上都不漂移——每台 Server 2025 的默认值都不一样，通道选型必须能吸收这种差异。

改造前的状态是 Agent 只能走 SSH 接 PowerShell，脚本用 base64 的 EncodedCommand 绕引号。能跑，但每次调用都要重新处理三件事：UTF-16LE 转码、255 字节的重复上限、嵌套引号。这些坑都得在脚本里写注释防下次再踩，维护成本随调用次数线性涨。

## 通道选型：结构化回传，不是协议新

三个候选通道都实测过，判定标准只有一条——**Agent 能不能拿到结构化的 stdout、stderr 和退出码**。这是判断"这步到底成没成"的刚需，其他都是次要。

| 通道 | 认证 | 会话 | 回传 | 结论 |
| --- | --- | --- | --- | --- |
| SSH（OpenSSH for Windows） | 密钥/口令 | 无状态 | 需 EncodedCommand 转码，退出码要额外约定 | 备选 |
| SMB + 计划任务 | NTLM | 无 | 要落盘、有权限边界问题 | 否 |
| WinRM | NTLM/Kerberos | 有 | stdout/stderr/退出码原生结构化 | 主通道 |

WinRM 的 WinRS 协议原生对接 PowerShell，退出码不用额外约定就能读回，这是它胜出的唯一理由——不是因为协议更新。三台的 5985 端口在域内防火墙里本就为远程管理开着，走 WinRM 没有新增暴露面。

认证统一 NTLM，域账号 `administrator@domain`，口令不入脚本，Agent 侧从一个权限 600 的凭据文件读。Kerberos 理论上更干净，但跨主机的 SPN 要多维护一层，个人规模下 NTLM 的复杂度/收益比更好——这是明确取舍，不是没得选。

## 执行面：PowerShell 7 只加不替换

三台统装 PowerShell 7（7.6.x），走官方 zip 静默安装到 `C:\Program Files\PowerShell\7`，不走 MSI 安装器。拆开理由有三条：

- **zip 免 UAC 交互**，无 GUI 的域控上 MSI 会卡授权弹窗；
- **与 5.1 完全隔离**，5.1 的脚本兼容性事故不会传染到 7，反之亦然；
- **`powershell` 仍指向 5.1**，只把 `pwsh` 目录加进系统级 PATH，旧运维脚本行为不漂移。

装完两个固定动作，都是踩出来的：

1. **`Set-PSReadLineOption` 关预测提示。** 无头执行时预测提示偶发吞一行输出，日志解析会误判成"这条命令没执行"。
2. **`$env:PSModulePath` 收敛到内网共享目录。** 默认会去查 PowerShell Gallery，域控没有固定出网策略，查询超时把脚本拖慢十几秒。查不到就查不到，不设回源。

## Agent 侧：pywinrm，不是 Invoke-Command

Agent 跑在 Mac 上。本地装 PowerShell 7 + `Microsoft.WSMan.Management` 理论上能 `Invoke-Command`，实测该模块在 macOS 上会话稳定性不够，且每次调用走本机 PS 引擎，排障要分两头。选 `pywinrm` 的拆分理由是**排障只在一头**：

```python
import winrm

session = winrm.Session(
    "http://<dc1>/wsman",
    auth=("administrator@domain", pw),   # pw 从 600 文件读，不回显
    transport="ntlm",
    server_cert_verify=False,            # 内网 HTTP，TLS 留给 5986 备用
)
r = session.run_ps(script)
print(r.status_code)
print(r.std_out.decode())
```

这个 venv 有一个必须写下来的版本坑：`pyspnego`（NTLM 认证依赖）**没有 Python 3.15 的 wheel**。用 homebrew 默认的 3.15 建 venv 会在 `pip install` 阶段失败，而失败信息不指向版本，容易误判成网络或包本身问题。venv 固定用 Python 3.11，路径写进 Agent 全局基线，不许换。

## 反直觉的坑：WinRM 单条命令有长度上限

把一整套"暂停服务 → 杀进程 → 验证 → 恢复"塞进一次 `run_ps`，会炸在 `command line is too long`。这个坑反直觉的地方是：**错误发生在远端解析阶段，本地看不出任何异常**，`status_code` 甚至不报错。

解法是把长序列拆成多个独立调用，每步之间读回状态再发下一步。拆完之后脚本反而更像 Agent 该有的执行模型——小步、可验证、可中断，而不是"一把梭然后祈祷"。这条后来写进了基线：**WinRM 单条脚本超过一定体量就强制分阶段**。

## 备选通道：SSH 保留三样

SSH 没拆，保留三样，降级路径写明：

- `sshd` 服务本身，端口只放行管理网段；
- 域账号公钥登录（与 Agent 同一密钥对），口令登录关；
- 一条约定：WinRM 探活失败时 Agent 切 SSH，并在报告里标注"降级通道"，避免读者以为一切正常。

降级实际触发过一次：一台域控打补丁后 `WinRM` 服务被置成 `Automatic (Delayed Start)`，开机后几分钟窗口内不可用，SSH 顶住了那次巡检。**双通道的价值不在日常，在这种窗口期**——单通道时这段时间就是盲区。

## 接入矩阵：三台共用一套凭据

| 主机 | WinRM | SSH | 备注 |
| --- | --- | --- | --- |
| DC1 | 5985 主用 | 备选 | 主域控 |
| DC2 | 5985 主用 | 备选 | 第二域控 |
| Hyper-V 宿主 | 5985 主用 | 备选 | `Get-VM` 走 WinRM |

三台共用同一套凭据文件和同一个 pywinrm venv，差异只在连接串。这条写进 Agent 全局基线当硬规则：**Windows 主机任务默认 WinRM 优先，选别的通道要在任务开头写明理由**。比"每台一份连接说明"少维护很多，也不会文档与现场漂移。

## 未闭环清单

| 事项 | 状态 |
| --- | --- |
| TLS（5986）端点 | 未启用，三台走 HTTP 5985 + 网段限定 |
| 域内 Kerberos 替代 NTLM | 未做，SPN 维护成本未摊平 |
| 补丁后服务启动类型漂移 | 已知会复发，无自动守护 |

域内当前 HTTP 可接受；一旦有隧道从办公网直连，TLS 端点要作为前置项补上。

## 小结

Windows 侧接管没有高难动作，装、通、对齐，微软文档里全有。真正花时间的仍是文档不写的部分：三台默认值不一致带来的通道漂移、版本坑不指向根因的误导、单条命令上限在远端才爆的静默失败。

只留一条经验：**给 Agent 接 Windows，先给它一个能读回退出码的通道，再谈自动化。**

---

三台主机的具体 IP、域后缀与凭据均已脱敏；版本号与行为取自当时现场记录，未经二次复测，仅作口径参考。
