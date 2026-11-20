---
title: macOS 提示"App 已损坏，无法打开"的多种解决方法
date: 2021-04-29 11:00:00
updated: 2026-11-20 12:00:00
tags:
  - macOS
  - Helpdesk
  - 系统维护
categories:
  - 桌面维护
  - 系统运维
keywords: macOS, App损坏, Gatekeeper, spctl, xattr, 隔离属性, 隐私与安全性
description: macOS 提示「App 已损坏，无法打开，你应该将它移到废纸篓」的处置：多数是 Gatekeeper 拦截而非真损坏，先移除单应用隔离属性或右键放行，必要时临时 spctl 关闭全局评估，放行前先用 spctl -a 确认拦截原因。
cover: /medias/featureimages/8.jpg
toc: true
copyright: true
---

在 macOS 上安装或打开应用时，可能出现「XXXX 已损坏，无法打开。你应该将它移到废纸篓。」的提示，应用被直接拒绝启动。这是 Gatekeeper 与隔离属性（quarantine）机制的共同结果：本意是阻止未公证来源的可执行文件运行，也会拦住来源可信的合法软件。

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

旧版系统需在「安全与隐私」左下角点击锁型按钮，输入当前用户密码解锁后再修改，改完重新锁定：

![解锁安全设置](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081512470.png "解锁界面")

在「允许从以下位置下载的应用」中选择**任何来源**，然后重新打开应用：

![允许任何来源](https://picturebed99.oss-cn-shanghai.aliyuncs.com/img/202509081513240.png "应用来源设置")

> 自 macOS 10.12 Sierra 起，「任何来源」默认隐藏，界面上看不到该选项属正常行为，需先用方法二的命令显式开启。新版 macOS 中该选项的展示位置与文案可能调整，若按上述路径找不到，以系统设置内搜索「任何来源」的结果为准。

### 方法二：用终端命令显示「任何来源」

在终端执行：

```bash
sudo spctl --master-disable
```

用下面命令确认状态，输出 `assessments disabled` 表示 Gatekeeper 评估已关闭：

```bash
spctl --status
```

改变的是整机安全评估策略，作用范围大，安装完成后恢复：

```bash
sudo spctl --master-enable
```

### 方法三：只处理单个应用

仅对目标应用移除隔离属性：

```bash
sudo xattr -rd com.apple.quarantine /Applications/应用名称.app
```

把「应用名称」替换为实际名称（路径含空格需引号包裹）。执行后仍提示损坏，说明拦截点不止顶层包：检查内部可执行文件是否带有独立隔离属性，并确认代码签名状态：

```bash
codesign --verify --deep --strict --verbose=2 /Applications/应用名称.app
xattr -lr /Applications/应用名称.app
```

也可以不改任何设置：Finder 中右键应用 →「打开」→ 确认对话框中再点「打开」，由用户显式放行这一次。

### 方法四：重新获取安装包

上述方法均无效时，才考虑文件本体损坏：从官方渠道重新下载，校验官方发布的校验值后再安装。

## 不同 macOS 版本的差异

> 以下差异基于 macOS 10.15 Catalina 时代的实际行为整理。Apple 在后续版本中持续收紧 Gatekeeper 并调整设置界面文案，实操以当前系统的实际界面为准。

- **macOS 10.15 Catalina 及更高**：仅默认放行已签名且已公证的应用；「任何来源」需显式开启；对未公证应用的拦截更严格
- **macOS 10.14 Mojave 及更早**：「任何来源」默认可见，安全评估相对宽松

## 放行之前先确认拦截原因

上面几种方法都在绕过判定，动手前先花一分钟看清 Gatekeeper 到底拒了什么，不同原因的处理方式完全不同：

```bash
spctl -a -vvv -t execute /Applications/应用名称.app
codesign -dv --verbose=4 /Applications/应用名称.app 2>&1 | head -20
```

`spctl -a` 返回 `rejected` 时看后面的原因：涉及 `signature` 的拒绝说明包本身没有可用签名，走公证流程无望，只能显式放行或换版本；涉及公证（notarization）的拒绝说明签名有效但 Apple 没为这个版本做过公证，通常是开发者发布时漏了提交。

`codesign` 判断绕过是否安全：签名有效且 TeamIdentifier 是开发者官方团队 ID 时，移除隔离属性风险可控；签名无效、`code object is not signed at all` 或只有 ad-hoc 签名，这条报错就不是误拦，不该放行。

系统侧的判定记录在 `syspolicyd` 的 `gk` 类别下：

```bash
log show --last 10m --style compact \
  --predicate 'process == "syspolicyd" AND category == "gk"'
```

被拦时会看到 `rejecting due to lack of matching active rule` 这类行，放行则是 `rule N applies - allow=1`。比在「控制台」里翻筛更快，也留下可复制的证据。

Intel 与 Apple 芯片的架构不匹配同样表现为启动失败，但报错文案不同（通常提示应用需要更新而非「已损坏」），不要混为一谈后再去动 Gatekeeper 设置。

## 总结

「App 已损坏，无法打开」在多数场景下是 Gatekeeper 与隔离属性的拦截提示，而非文件真损坏。按影响面从小到大选择处置方式：

- **只装一次**：右键「打开」显式放行
- **单个应用反复被拦**：`sudo xattr -rd com.apple.quarantine` 移除隔离属性
- **需要频繁安装多来源软件**：临时 `sudo spctl --master-disable`，完成后用 `spctl --status` 复核并恢复

来源不明的软件不要用上述方法强行运行，绕过安全机制的风险由本机承担。
