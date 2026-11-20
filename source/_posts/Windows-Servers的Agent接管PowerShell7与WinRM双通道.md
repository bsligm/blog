---
title: Windows Server 的 Agent 接管：PowerShell 7 与 WinRM 双通道实录
date: 2026-10-01 21:00:00
updated: 2026-11-20 20:30:00
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
description: 三台 Windows Server 2025 域控加 Hyper-V 宿主接入 Agent 的完整记录：PowerShell 7 作执行面、WinRM 作一等通道、SSH 降为备选。逐条给出通道选型的取舍、venv 版本坑、带实测阈值的长命令双路径分流，以及三台共用一套凭据的接入矩阵。
cover: /img/cover/windows-agent.jpg
toc: true
copyright: true
---

把三台 Windows 主机交给 Agent 接管，用一条固定节奏（写脚本 → 上传 → 执行 → 读回退出码）操作它们，不再依赖人工开远程桌面。真正花时间的不是通道本身，而是让这条节奏在三台默认值各不相同的 Server 2025 上都不漂移。

改造前 Agent 只能走 SSH 接 PowerShell，脚本用 base64 的 EncodedCommand 绕引号，每次调用要处理 UTF-16LE 转码、255 字节的重复上限、嵌套引号，维护成本随调用次数线性涨。

## 通道选型：结构化回传，不是协议新

三个候选通道都实测过，判定标准只有一条——**Agent 能不能拿到结构化的 stdout、stderr 和退出码**，这是判断"这步到底成没成"的刚需。

| 通道 | 认证 | 会话 | 回传 | 结论 |
| --- | --- | --- | --- | --- |
| SSH（OpenSSH for Windows） | 密钥/口令 | 无状态 | 需 EncodedCommand 转码，退出码要额外约定 | 备选 |
| SMB + 计划任务 | NTLM | 无 | 要落盘、有权限边界问题 | 否 |
| WinRM | NTLM/Kerberos | 有 | stdout/stderr/退出码原生结构化 | 主通道 |

WinRS 原生对接 PowerShell，退出码不用额外约定就能读回，这是它胜出的唯一理由——不是因为协议更新。三台的 5985 端口本就为远程管理开着。

认证统一 NTLM，域账号 `administrator@domain`，口令不入脚本，从 600 权限凭据文件读。Kerberos 要多维护一层跨主机 SPN，个人规模下复杂度/收益比输给 NTLM。

## 执行面：PowerShell 7 只加不替换

三台统装 PowerShell 7（7.6.x），走官方 zip 静默安装到 `C:\Program Files\PowerShell\7`，不走 MSI。理由有三条：

- **zip 免 UAC 交互**，无 GUI 的域控上 MSI 会卡授权弹窗；
- **与 5.1 完全隔离**，脚本兼容性事故互不传染；
- **`powershell` 仍指向 5.1**，只把 `pwsh` 目录加进 PATH，旧脚本不漂移。

装完两个固定动作，都是为 Agent 无头执行稳定补的，不是"装 PS7"的一部分：`Set-PSReadLineOption -PredictionViewStyle None` 关预测提示（无头执行偶发吞一行输出，日志解析会误判"这条命令没执行"）；`[Environment]::SetEnvironmentVariable('PSModulePath', '\<dc1>\ops$\ps-modules', 'Machine')` 把模块路径收敛到内网共享（默认去查 Gallery，域控没有固定出网策略，超时拖慢十几秒；查不到就查不到，不设回源）。两条都必须开新会话回读验证，改当前会话的进程环境变量不算数。

## Agent 侧：pywinrm，不是 Invoke-Command

Agent 跑在 Mac 上。本地装 PowerShell 7 走 `Invoke-Command`，实测 `Microsoft.WSMan.Management` 在 macOS 上会话稳定性不够，且排障要分两头。选 `pywinrm` 的理由是**排障只在一头**：

```python
def session():
    # 口令从 600 权限凭据文件读，不进命令行参数、不回显
    secret = pathlib.Path.home().joinpath(CRED_FILE).read_text().strip()
    return winrm.Session('http://<dc1>:5985/wsman',
                         auth=('administrator@domain', secret),
                         transport='ntlm', operation_timeout_sec=45, read_timeout_sec=60)

def ps(source, tag):
    # 三件前置：关进度条污染 stdout、首错即停、输出强制 UTF-8
    source = ("$ProgressPreference='SilentlyContinue'; $ErrorActionPreference='Stop'; "
              "[Console]::OutputEncoding=[Text.Encoding]::UTF8; " + source)
    r = session().run_ps(source)
    data = {'status': r.status_code,
            'stdout': r.std_out.decode('utf-8', 'replace'),
            'stderr': r.std_err.decode('utf-8', 'replace')}
    if r.status_code:
        raise RuntimeError(tag + ': ' + data['stderr'][:1500])
    return data
```

所有远端调用都走这层公共代码。一个实测纠正过的误判：`std_out` 是单字节 UTF-8 流，**不是 UTF-16LE**，解码策略因此写死；成功判定永远是 `status_code==0` 加回读值，连接成功不等于执行成功。

venv 版本组合固定为实测可复现的一套：**Python 3.11 + pywinrm 0.5.0 + pyspnego 0.12.4 + requests_ntlm 1.3.0**。版本坑：`pyspnego`（NTLM 认证依赖）没有 Python 3.15 的 wheel，homebrew 默认的 3.15 在 `pip install` 阶段失败且报错不指向版本，固定 3.11 写进基线。

## 反直觉的坑：WinRM 单条命令有长度上限

把一整套"暂停服务 → 杀进程 → 验证 → 恢复"塞进一次 `run_ps`，会炸在 `command line is too long`。反直觉的是：**错误发生在远端解析阶段，本地看不出异常**，`status_code` 甚至不报错。

Agent 侧按脚本体量预先分流：短脚本直发，长脚本先落盘再执行，不能靠"失败了再拆"——失败在远端，无从发现。实测阈值 **1900 字符**：

```python
if len(source) > 1900:
    target = REMOTE + '\\scripts\\' + tag
    encoded = base64.b64encode(source.encode('utf-8')).decode('ascii')
    # 先建目录+清空目标文件，分块追加 base64，每块独立核状态
    setup = s.run_ps("New-Item -ItemType Directory -Force '" + REMOTE + "\\scripts'|Out-Null; "
                     "[IO.File]::WriteAllText('" + target + ".b64','')")
    if setup.status_code:
        raise RuntimeError('Script upload directory failed')
    for offset in range(0, len(encoded), 2200):
        r = s.run_ps("[IO.File]::AppendAllText('" + target + ".b64','"
                     + encoded[offset:offset+2200] + "')")
        if r.status_code:
            raise RuntimeError('Script upload chunk failed')
    # 远端解码落 .ps1 再执行，彻底绕开单次命令长度上限
    source = ("[IO.File]::WriteAllBytes('" + target + ".ps1',"
              "[Convert]::FromBase64String([IO.File]::ReadAllText('" + target + ".b64'))); "
              "& '" + target + ".ps1'")
```

上传路径的价值在"每块独立核 `status_code`"：失败停在可定位的块上；分块大小 2200 是实测取的，留出引号和转义的余量。

还有第二条路径：脚本 gzip 压缩后塞进单次 `run_ps`——实测 5.6KB 脚本压缩编码后只剩 3.3KB，装得下。断言在本地做：**远端真正吃的是 utf-16le 编码后的长度**，实测安全线是 **7800 字符以内**，超限本地就炸：

```python
data = base64.b64encode(gzip.compress(code.encode(), mtime=0)).decode()
stub = ("$m=[IO.MemoryStream]::new([Convert]::FromBase64String('" + data + "'),$false);"
        "$z=[IO.Compression.GZipStream]::new($m,[IO.Compression.CompressionMode]::Decompress);"
        "$s=[IO.StreamReader]::new($z);"
        "& ([ScriptBlock]::Create($s.ReadToEnd()))")
# 断言在本地做：utf-16le 编码后的长度才是远端真正吃的长度
assert len(base64.b64encode(stub.encode('utf-16le'))) < 7800, 'Encoded command too long'
```

`mtime=0` 把时间戳归零，同一脚本的 base64 可复现，两次运行之间的 diff 才有意义；两条路径并存也简单——1900 字符以下的脚本占多数，直发免掉上传开销。隐性前提：**WinRM 会话的默认 shell 是内置 PS 5.1，不是装好的 7**，`run_ps` 里不能写 7.x 独有语法（三元 `? :`、`-AsHashtable`、`ForEach-Object -Parallel`），否则脚本不长也会在远端爆。

长序列本身拆成多个独立调用，每步读回状态再发下一步，这条写进基线：**WinRM 单条脚本超过一定体量就强制分阶段**。远端侧形态是状态机：进度文件 temp+Replace 原子写，每步落盘再发下一步，重连都能从进度文件恢复现场；`finally` 保证失败路径上挂载和开机回滚——否则一次失败会留下一台状态未知的机器。

## 备选通道：SSH 保留三样

SSH 通道没拆，保留三样：

- `sshd` 服务本身，端口只放行管理网段；
- 域账号公钥登录（与 Agent 同一密钥对），口令登录关；
- 一条约定：WinRM 探活失败时 Agent 切 SSH，并在报告里标注"降级通道"。

降级是代码判的：探活取最轻量命令（读主机名即可），WinRM 失败再探 SSH，两判定独立；降级不是失败，但必须在报告里显式标注。触发过一次：一台域控打补丁后 `WinRM` 服务被置成 `Automatic (Delayed Start)`，开机后几分钟窗口内不可用，SSH 顶住了那次巡检。**双通道的价值不在日常，在这种窗口期**——单通道时这段时间就是盲区。

## 接入矩阵：三台共用一套凭据

| 主机 | WinRM | SSH | 备注 |
| --- | --- | --- | --- |
| DC1 | 5985 主用 | 备选 | 主域控 |
| DC2 | 5985 主用 | 备选 | 第二域控 |
| Hyper-V 宿主 | 5985 主用 | 备选 | `Get-VM` 走 WinRM |

三台共用同一套凭据文件和同一个 pywinrm venv，差异只在连接串，这条写进 Agent 全局基线当硬规则：**Windows 主机任务默认 WinRM 优先，选别的通道要在任务开头写明理由**。

## 成果：阈值、版本、降级路径全部固化成基线

三台节奏一致，差异只在连接串。这次新固化进基线的硬规则：长脚本 1900 字符以上强制上传分流，gzip 路径本地断言 7800 上限；venv 版本组合写死；WinRM 探活失败自动切 SSH 并标注"降级通道"——补丁窗口期触发过一次并顶住了。排障收敛在一头：执行面全在 Agent 侧 venv，远端只出 stdout/stderr 和退出码。

## 未闭环清单

| 事项 | 状态 |
| --- | --- |
| TLS（5986）端点 | 未启用，三台走 HTTP 5985 + 网段限定；一旦有隧道从办公网直连，TLS 要作为前置项补上 |
| 域内 Kerberos 替代 NTLM | 未做，SPN 维护成本未摊平 |
| 补丁后服务启动类型漂移 | 已知会复发，无自动守护 |

## 小结

Windows 侧接管没有高难动作，装、通、对齐，文档里全有。真正花时间是文档不写的部分：三台默认值不一致的通道漂移、版本坑不指向根因的误导、单条命令上限在远端才爆的静默失败。

只留一条经验：**给 Agent 接 Windows，先给它一个能读回退出码的通道，再谈自动化。**

---

三台主机的具体 IP、域后缀与凭据均已脱敏；版本号与行为取自当时现场记录，未经二次复测，仅作口径参考。
