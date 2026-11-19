---
title: macOS 提示"App 已损坏，无法打开"的多种解决方法
date: 2021-04-29 11:00:00
updated: 2026-11-19 11:00:00
tags:
  - macOS
  - Helpdesk
  - 系统维护
categories:
  - 桌面维护
  - 系统运维
keywords: macOS, App损坏, Gatekeeper, spctl, xattr, 隔离属性, 隐私与安全性
description: 处理 macOS 提示"App 已损坏，无法打开，你应该将它移到废纸篓"的多种方法，涵盖 Gatekeeper 全局设置调整、单应用隔离属性移除与不同 macOS 版本的路径差异。
cover: /medias/featureimages/8.jpg
toc: true
copyright: true
---

在 macOS 上安装软件时，可能出现"XXXX 已损坏，无法打开。你应该将它移到废纸篓。"的提示，应用被直接拒绝启动。这是 Gatekeeper 与隔离属性（quarantine）机制的共同结果，本意是阻止未公证来源的可执行文件运行，但也会拦住来源可信的合法软件。

先说明结论：绝大多数此类报错并非文件真的损坏，而是 Gatekeeper 拦截。优先用方法三（只处理单个应用），只在确有需要时临时放开全局设置。

## 问题原因

常见触发条件：

1. 软件来自未在 Apple 注册或未通过公证（Notarization）的开发者
2. 文件经浏览器、邮件或即时通讯工具下载，被写入 `com.apple.quarantine` 隔离属性
3. 软件包在下载或传输过程中确实损坏
4. 系统版本与软件架构不兼容（如新版 macOS 已停止支持 32 位应用）

![MacOS App损坏提示](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081512082.jpeg "App损坏错误提示")

## 解决方案

### 方法一：通过系统设置解决

菜单名称随版本变化，先确认自己的路径：

- macOS 13 Ventura 及更高：苹果菜单 → **系统设置** → **隐私与安全性**
- macOS 12 Monterey 及更早：苹果菜单 → **系统偏好设置** → **安全与隐私**

![系统偏好设置](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081512540.png "安全与隐私设置入口")

旧版系统需在"安全与隐私"左下角点击锁型按钮，输入当前用户密码解锁后再修改，改完重新锁定：

![解锁安全设置](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081512470.png "解锁界面")

在"允许从以下位置下载的应用"中选择**任何来源**，然后重新打开应用：

![允许任何来源](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081513240.png "应用来源设置")

> 自 macOS 10.12 Sierra 起，"任何来源"默认隐藏，界面上看不到该选项属正常行为，需先用方法二的命令显式开启。新版 macOS 中该选项的展示位置与文案可能调整，若按上述路径找不到，以系统设置内搜索"任何来源"的结果为准。

### 方法二：用终端命令显示"任何来源"

在终端（`Command + 空格` 唤起 Spotlight，输入"终端"回车）执行：

```bash
sudo spctl --master-disable
```

输入当前用户密码后执行。用下面命令确认状态，输出 `assessments disabled` 表示 Gatekeeper 评估已关闭：

```bash
spctl --status
```

该命令改变的是整机安全评估策略，作用范围大，安装完成后建议恢复：

```bash
sudo spctl --master-enable
```

### 方法三：只处理单个应用

不想放开全局设置时，仅对目标应用移除隔离属性：

```bash
sudo xattr -rd com.apple.quarantine /Applications/应用名称.app
```

把"应用名称"替换为实际名称（路径含空格需用引号包裹）。若执行后仍提示损坏，说明拦截点不只在顶层包：检查 App 内部可执行文件是否带有独立的隔离属性，并确认代码签名状态：

```bash
codesign --verify --deep --strict --verbose=2 /Applications/应用名称.app
xattr -lr /Applications/应用名称.app
```

也可以不改任何设置，直接在 Finder 中右键应用图标 →"打开"→ 在确认对话框中再次点击"打开"，由用户显式放行这一次。

### 方法四：重新获取安装包

若上述方法均无效，才考虑文件本体损坏：从官方渠道重新下载，确保传输过程完整，并校验官方发布的校验值后再安装。

## 安全建议

1. **最小放开**：仅在确认来源可靠时处理，优先用方法三而不是全局关闭 Gatekeeper
2. **及时恢复**：临时关闭后执行 `sudo spctl --master-enable` 恢复评估
3. **官方渠道**：优先从开发者官网或 Mac App Store 获取
4. **先验签再放行**：对关键软件先做签名与公证校验，再决定是否绕过

## 不同 macOS 版本的差异

> 以下差异基于 macOS 10.15 Catalina 时代的实际行为整理，截至撰写时。Apple 在后续版本中持续收紧 Gatekeeper 并调整设置界面文案，新版上的具体开关位置与生效方式存在变化可能，实操以当前系统的实际界面为准。

- **macOS 10.15 Catalina 及更高**：仅默认放行已签名且已公证的应用；"任何来源"需显式开启；对未公证应用的拦截更严格
- **macOS 10.14 Mojave 及更早**："任何来源"默认可见，安全评估相对宽松

## 故障排除

1. **重启系统**：刷新安全评估与策略缓存
2. **核对系统版本与软件架构**：确认软件仍支持当前 macOS 与硬件架构（Intel / Apple 芯片）
3. **查看系统日志**：用"控制台"应用查看拒绝启动时记录的 Gatekeeper 判定原因
4. **联系开发者**：商业软件优先获取已公证的新版本，而不是长期绕过安全机制

## 总结

"App 已损坏，无法打开"在多数场景下是 Gatekeeper 与隔离属性的拦截提示，而非文件真损坏。按影响面从小到大选择处置方式：

- **只装一次**：右键"打开"显式放行
- **单个应用反复被拦**：`sudo xattr -rd com.apple.quarantine` 移除隔离属性
- **需要频繁安装多来源软件**：临时 `sudo spctl --master-disable`，完成后用 `spctl --status` 复核并恢复

来源不明的软件不要用上述方法强行运行，绕过安全机制的风险由本机承担。
