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
description: 把家里的 Windows 域控改造成 Agent 可接管的形态：PowerShell 7 作为执行面，WinRM 作为一等通道，SSH 降级为备选。记录两个版本坑（spnego 无高版本 wheel、WinRM 命令行长度限制）和三台主机统一接入矩阵的完整做法。
cover: /img/cover/windows-agent.jpg
toc: true
copyright: true
---

家里的 Windows 主机（两台域控、一台 Hyper-V 宿主，全部 Windows Server 2025）此前 Agent 只能通过 SSH 接 PowerShell，脚本走 base64 EncodedCommand 绕引号。能跑，但难维护：255 字节的重复上限、UTF-16LE 转码、嵌套引号，每个坑都要在脚本里写注释防止下次再踩。

国庆这轮把接入方式改成了双通道：**PowerShell 7 作为主机上的执行面，WinRM 作为 Agent 的一等通道，SSH 降级为 WinRM 不可用时的备选**。改完之后的直接收益是：Agent 可以按"写一段脚本 → 上传 → 执行 → 读回退出码"的固定节奏操作三台 Windows 主机，不需要再为每次调用转码。

## 通道选型：为什么 WinRM 优先

三个候选通道对比过：

| 通道 | 认证 | 会话 | 脚本执行 | 结论 |
| --- | --- | --- | --- | --- |
| SSH（OpenSSH for Windows） | 密钥/口令 | 无状态 | 需 EncodedCommand 转码 | 备选 |
| SMB + 计划任务 | NTLM | 无 | 要落盘、有权限边界问题 | 不选 |
| WinRM | NTLM/Kerberos | 有，可传回 stdout/退出码 | 原生支持 PS7 引擎 | 主通道 |

WinRM 的 WinRS 协议原生对接 PowerShell，stdout、stderr、退出码都能结构化传回，这对 Agent 判断"这步到底成没成"是刚需。三台主机的 5985 端口在域内防火墙里本就为远程管理开着，没有新增暴露面。

认证统一 NTLM，域账号 `administrator@domain`，口令不入脚本——Agent 侧从一个权限 600 的凭据文件读，写进连接参数时不回显。Kerberos 理论上更干净，但跨主机的 SPN 配置要多维护一层，个人规模下 NTLM 的复杂度/收益比更好。

## PowerShell 7：装在哪、装完改什么

三台主机统装 PowerShell 7（当前 7.6.x），走官方 zip 静默安装到 `C:\Program Files\PowerShell\7`，不走安装器：

- zip 方式免 UAC 交互，适合无 GUI 的域控；
- 与系统自带的 Windows PowerShell 5.1 完全隔离，5.1 的脚本兼容性事故不会传染到 7；
- PATH 只把 `pwsh` 的目录加到系统级，`powershell` 命令仍然指向 5.1，避免旧运维脚本行为漂移。

装完的两个固定动作：

1. **`Set-PSReadLineOption` 关掉预测提示**。无头执行时预测提示偶发吞掉一行输出，日志解析会误判。
2. **`$env:PSModulePath` 收敛**。默认会去查 PowerShell Gallery，域控没有固定出网策略，查询超时把脚本执行拖慢十几秒。内网脚本库放在共享目录，ModulePath 指过去，查不到就查不到，不设回源。

## Agent 侧：pywinrm 而不是 Invoke-Command

Agent 在 Mac 上运行。本地装 PowerShell 7 + `Microsoft.WSMan.Management` 模块理论上可以 `Invoke-Command`，实测该模块在 macOS 上的会话稳定性不够，且每次调用都走本机 PS 引擎，排障要分两头。

最终方案是 Python 的 `pywinrm`，一个独立 venv：

```python
import winrm

session = winrm.Session(
    "http://<dc1>/wsman",
    auth=("administrator@domain", pw),   # pw 从 600 文件读
    transport="ntlm",
    server_cert_verify=False,            # 内网 HTTP 端点，TLS 留给 5986 备用
)
r = session.run_ps(script)
print(r.status_code)
print(r.std_out.decode())
```

这个 venv 有一个必须写下来的坑：`pyspnego`（NTLM 认证依赖）**没有 Python 3.15 的 wheel**。默认用 homebrew 的 Python 3.15 建 venv 会在 `pip install` 阶段失败，而且失败信息不指向版本问题。venv 固定用 Python 3.11 建，路径写进 Agent 全局基线，不许换。

另一个运行期坑：**WinRM 单次命令的命令行有长度上限**。把一整套"暂停服务 → 杀进程 → 验证 → 恢复"的脚本塞进一次 `run_ps`，会在 `command line is too long` 上炸掉，而且错误发生在远端解析阶段，本地看不出任何异常。解法是把长序列拆成多个独立调用，每步之间读回状态再发下一步——拆完脚本反而更像 Agent 该有的执行模型：小步、可验证、可中断。

## SSH 降级为备选：保留什么

SSH 没有拆，保留三样：

- `sshd` 服务本身，端口只放行管理网段；
- 域账号的公钥（与 Agent 的密钥对一致），口令登录关；
- 一个约定：WinRM 探活失败时，Agent 切 SSH 并在报告里标注"降级通道"，避免读者以为一切正常。

降级实际触发过一次：一台域控打补丁后 `WinRM` 服务进入 `Automatic (Delayed Start)`，开机后几分钟窗口内 WinRM 不可用，SSH 顶住了那次巡检。

## 三台主机的接入矩阵

| 主机 | WinRM | SSH | 备注 |
| --- | --- | --- | --- |
| DC1 | 5985 主用 | 备选 | 主域控 |
| DC2 | 5985 主用 | 备选 | 第二域控 |
| Hyper-V 宿主 | 5985 主用 | 备选 | `Get-VM` 走 WinRM |

三台共用同一套凭据文件和同一个 pywinrm venv，主机差异只在连接串。Agent 全局基线里把这条写成硬规则：**Windows 主机任务默认 WinRM 优先；选别的通道要在任务开头写明理由**。这比"每台主机各写一份连接说明"少维护很多，也不会出现文档与现场漂移。

## 这轮改动给后续铺的路

Windows 侧接管跑通之后，家里的接管面就只剩两个缺口：Home Assistant（Linux 内核但系统管理面是 Docker，Agent 进不去系统层）和各种 Web 控制台服务（雷池 WAF、GitLab 这些，API 各自为政）。两篇后面单独写。

**遗留未闭环**：TLS（5986）端点没有启用，三台都走 HTTP 5985 + 网段限定。域内目前可接受，但如果以后有隧道从办公网直连，TLS 端点应该作为前置项补上。
