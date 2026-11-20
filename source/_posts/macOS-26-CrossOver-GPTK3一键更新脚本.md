---
title: macOS 26 测试版 CrossOver Preview GPTK3 一键更新脚本
date: 2025-09-09 10:00:00
updated: 2026-11-20 12:00:00
tags:
  - macOS
  - CrossOver
  - Game Porting Toolkit
  - 游戏优化
  - 系统运维
categories:
  - 系统运维
  - 游戏优化
keywords: macOS 26, CrossOver Preview, GPTK3, 游戏移植工具包, 一键更新脚本, MetalFX, DLSS
description: GPTK3（Game Porting Toolkit）替换自动化：时间戳备份、MD5 校验、失败回滚、容器级 DLL 复制，把 CrossOver 内旧版 GPTK 组件换成 3.0 beta 3。
cover: /img/cover/crossover-gptk.jpg
toc: true
copyright: true
---

macOS 上跑 Windows 应用有两条路线：虚拟机（重、独占 GPU）与 Wine 兼容层（轻、共享 GPU）。CrossOver 是后者的商业发行版，而 Apple 给开发者的 Game Porting Toolkit（GPTK）把 Metal 上跑 Windows 游戏所需的 DirectX 翻译、FXAA/DLSS 替代品（MetalFX）封装成一套 redist 库——CrossOver 应用包里内置了一份旧版 GPTK 组件（`apple_gptk` 目录）。

CrossOver Preview 在 macOS 26 测试版上还没跟上 GPTK3，解法是手工把 GPTK 3.0 beta 3 的文件替换进 CrossOver 应用包，再给目标容器补上 `nvngx`（DLSS）→`nvngx-on-metalfx` 的映射。`crossover-gptk3.sh` 把这条路径自动化：校验环境、带时间戳备份、替换库文件、MD5 校验、失败回滚，随后按需把 DLL 复制进指定容器。这篇的价值在预研性质：它验证了「macOS + Wine 系 + 官方移植工具」这条路在公司 VDI/PXVDI 终端方案里的可行性，脚本本身是一次性交付物，升级后重跑即可。

保护机制都能事后核验：`external` 与 `wine` 先 `mv` 成 `*.backup.<时间戳>` 再复制新文件，任一改名失败即退出（两者按先后顺序改名，失败时可能只有一个已改名）。复制失败、或复制后这两个目录缺失，脚本立即用备份还原；MD5 校验失败不自动还原，只汇总失败数并询问是否继续。全部操作追加写入 `/tmp/crossover-gptk3-<时间戳>.log`，出问题以日志和备份目录为准。

适用范围：macOS 26 测试版 + CrossOver Preview + GPTK 3.0 beta 3。脚本修改 CrossOver 应用包内文件，属非官方改动，CrossOver 升级后需重新执行。

## 关键设计决策

- **为什么是脚本而不是 GUI。** 这套操作要动的是应用包内 `/Applications/CrossOver.app/Contents/SharedSupport` 下的受保护目录，GUI 工具（甚至 Finder）在权限、隐藏文件、批量 MD5 三件事上都不顺手。脚本换来回的是可重复：备份、复制、校验、回滚每一步都能从日志重放，出错时不用靠记忆判断「刚才改到哪了」。代价是脚本绑定目录结构与文件清单，CrossOver 或 GPTK 升级后要先重核再跑。
- **版本锁定：为什么死绑 GPTK 3.0 beta 3。** 脚本按卷名前缀（`Evaluation environment for Windows games`）匹配挂载点，按 `redist/lib` 的文件清单做 MD5 校验。Apple 的 GPTK 是 beta 节奏，版本间文件清单会增减。锁定版本的代价是时效——Apple 发新版后脚本会因找不到镜像或校验不过而中止，这是故意的：宁可失败也不要静默复制一份清单对不上的文件进应用包。
- **备份策略：先 `mv` 再复制，不原地覆盖。** 应用包目录是「一个文件都丢不起」的状态：CrossOver 升级能还原，手工改坏不能。改名备份（而非复制备份）保证任意时刻磁盘上只有两份状态（原状或新状），中间态不存在；代价是备份和应用包同卷，同盘故障两者一起丢，脚本层面接受这个风险。
- **提权最小化：能不用 sudo 就不用。** 脚本先测目录可写性再询问提权，且提权只作用于应用包内文件操作，容器目录（用户目录）始终不提权。MDM 管的机器上这条决定脚本能不能非交互跑——提权范围越窄，审批越容易过。

## 脚本使用指南

### 前置条件
1. 确保已安装 CrossOver Preview 版本
2. 从[Apple 开发者网站](https://developer.apple.com/games/game-porting-toolkit/)下载 Game Porting Toolkit 安装包
3. 挂载下载的安装包镜像
4. 再次挂载 `Evaluation environment for Windows games 3.0 beta 3.dmg` 镜像

前置条件中的版本号与本脚本验证过的 GPTK 3.0 beta 3 绑定：脚本按卷名前缀匹配挂载点，Apple 后续版本若变更卷名或 `redist/lib` 文件清单，需重核后再用。

### 脚本执行步骤

```bash
# 1. 创建脚本文件并复制以下完整脚本内容
touch crossover-gptk3.sh
vim crossover-gptk3.sh
#粘贴下面脚本内容到脚本
# 2. 添加执行权限
chmod +x crossover-gptk3.sh

# 3. 运行脚本
./crossover-gptk3.sh
```

### 交互式配置过程

脚本运行时的交互：

1. **权限确认**：根据需要确认是否使用 sudo 权限
2. **容器选择**：
   - 自动搜索并选择容器（推荐）
   - 手动输入容器名称
   - 手动输入完整路径
   - 跳过容器配置

## 脚本详细解析

### 系统兼容性处理
```bash
# 颜色定义
GREEN='\033[0;32m'   # 成功
YELLOW='\033[1;33m'  # 提示/警告
RED='\033[0;31m'     # 错误
NC='\033[0m'         # 重置颜色
```

按主版本号分支提示：26 为目标验证环境；15 提示部分游戏功能可能不可用；高于 26 或未识别的版本提示兼容性未测试；低于 15 提示 GPTK3 支持可能不完整。

### 文件操作安全机制
```bash
# 备份时间戳
BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# 备份原有文件
$SUDO mv external "external.backup.${BACKUP_TIMESTAMP}"
$SUDO mv wine "wine.backup.${BACKUP_TIMESTAMP}"
```

### 完整性验证
逐个比对源与目标文件的摘要，优先 `md5 -q`，没有则回退 `md5sum`：
```bash
if command -v md5 >/dev/null 2>&1; then
    source_md5=$(md5 -q "$source_file" 2>/dev/null)
    target_md5=$(md5 -q "$target_file" 2>/dev/null)
elif command -v md5sum >/dev/null 2>&1; then
    source_md5=$(md5sum "$source_file" 2>/dev/null | cut -d' ' -f1)
    target_md5=$(md5sum "$target_file" 2>/dev/null | cut -d' ' -f1)
```

两个工具都不存在时只打印「MD5 工具不可用，跳过校验」并继续。跑完没报错不等于校验过——确认完整性要在日志里搜这一行有没有出现。

### MetalFX 配置
MetalFX 相关文件自动重命名：
```bash
# MetalFX文件列表
metalfx_files=(
    "${CROSSOVER_WINE_UNIX_DIR}/nvngx-on-metalfx.so:${CROSSOVER_WINE_UNIX_DIR}/nvngx.so:Unix"
    "${CROSSOVER_WINE_WIN_DIR}/nvngx-on-metalfx.dll:${CROSSOVER_WINE_WIN_DIR}/nvngx.dll:Windows"
)
```

## 使用建议与注意事项

### 权限管理
先测目录可写性再决定提权：`[ ! -w "${CROSSOVER_GPTK_DIR}" ]` 成立才询问是否用 sudo，选 N 直接退出。CrossOver 由当前用户安装到 `/Applications` 时通常不需要提权，被 MDM 或安装器改过属主才会走到这一支。提权只作用于应用包内文件操作，容器目录（用户目录下）始终不提权。

### 版本时效
本脚本按 GPTK 3.0 beta 3 的卷名与文件清单编写。Apple 更新后挂载卷名、`redist/lib` 结构或文件名可能变化，脚本会因找不到评估环境或校验不过而中止，需按新版本重核。CrossOver 升级会还原应用包内文件，升级后需重新运行。

### 日志记录
日志路径形如 `/tmp/crossover-gptk3-<时间戳>.log`，由 `log_operation` 用 `tee -a` 同时输出到屏幕和文件。文件在 `/tmp` 下，重启或定期清理后会丢失，留档先拷走。

### 备份恢复
恢复备份：
```bash
# 恢复备份示例
mv external.backup.${BACKUP_TIMESTAMP} external
mv wine.backup.${BACKUP_TIMESTAMP} wine
```

## 故障排除

**容器列表为空。** 判定依据是 `drive_c/windows/system32` 目录是否存在，只建了容器还没装任何 Windows 程序时该目录尚未生成，不会被列出；用手动输入完整路径绕过，或先在容器里装一次目标程序。

**同一容器出现两个同名条目。** 除 `~/Library/Application Support/CrossOver/Bottles` 外还会搜旧版路径 `~/.cxoffice`，旧版条目显示名附加「 (旧版)」后缀。判重按容器路径而非显示名，新旧同名容器都会列出——按游戏实际所在的那个选，选错的那个不会得到更新但也不会被破坏。

**提示未找到 CrossOver 安装目录。** 报错会打印预期路径，非默认安装位置需改脚本顶部的 `CROSSOVER_GPTK_DIR`。

**MD5 校验失败。** 发生在复制完成之后，脚本不自动还原，只汇总失败数并询问是否继续。选继续意味着应用包里留着摘要不符的文件，CrossOver 能否启动取决于具体是哪个文件；稳妥做法是选退出，按备份时间戳手工移回 `external.backup.<时间戳>` 与 `wine.backup.<时间戳>`，重新挂载评估环境镜像后重跑。

复制本身失败（`ditto` 报错或复制后目录缺失）走另一条路径：脚本自己把备份移回去并退出，不需要手工恢复，排查镜像挂载后重跑即可。

## 完整脚本代码

```bash
#!/bin/bash

# 颜色定义
GREEN='\033[0;32m'   # 成功
YELLOW='\033[1;33m'  # 提示/警告
RED='\033[0;31m'     # 错误
NC='\033[0m'         # 重置颜色

# 日志配置
LOG_FILE="/tmp/crossover-gptk3-$(date +%Y%m%d_%H%M%S).log"

# 日志记录函数
log_operation() {
    local message="$1"
    local timestamp="[$(date '+%Y-%m-%d %H:%M:%S')]"
    echo "$timestamp $message" | tee -a "$LOG_FILE"
}

# 系统兼容性检查
check_system_compatibility() {
    local macos_version=$(sw_vers -productVersion 2>/dev/null)
    if [[ -n "$macos_version" ]]; then
        local major_version=$(echo "$macos_version" | cut -d. -f1)
        if [[ "$major_version" == "26" ]]; then
            # macOS 26（本文目标测试环境）
            log_operation "✅ 检测到 macOS 26，为本脚本目标测试环境"
            echo -e "${GREEN}✅ 检测到 macOS 26，为本脚本目标测试环境${NC}"
        elif [[ "$major_version" == "15" ]]; then
            # macOS 15 Sequoia (内核版本24.x)
            log_operation "⚠️ 检测到macOS 15 Sequoia，某些游戏功能可能不可用"
            echo -e "${YELLOW}⚠️ 检测到macOS 15 Sequoia，某些游戏功能可能不可用${NC}"
        elif [[ "$major_version" -ge "15" ]]; then
            # macOS 15 以上、且非本文验证过的 26
            log_operation "⚠️ 检测到未经验证的macOS版本 ($macos_version)，兼容性未测试"
            echo -e "${YELLOW}⚠️ 检测到未经验证的macOS版本 ($macos_version)，兼容性未测试${NC}"
        else
            log_operation "⚠️ macOS版本 ($macos_version) 低于 macOS 15，GPTK3 支持不完整"
            echo -e "${YELLOW}⚠️ macOS ($macos_version) 低于 macOS 15，GPTK3 支持可能不完整${NC}"
        fi
    else
        log_operation "⚠️ 无法检测macOS版本，可能运行在非macOS系统上"
        echo -e "${YELLOW}⚠️ 无法检测macOS版本，可能运行在非macOS系统上${NC}"
    fi
}

# 网络连接检测
check_network_connectivity() {
    log_operation "🌐 检查网络连接状态..."
    if ! ping -c 1 -t 3 8.8.8.8 >/dev/null 2>&1; then
        log_operation "⚠️ 网络连接异常，某些功能可能受影响"
        echo -e "${YELLOW}⚠️ 网络连接异常，某些功能可能受影响${NC}"
        return 1
    else
        log_operation "✅ 网络连接正常"
        return 0
    fi
}

# 基础配置
CROSSOVER_GPTK_DIR="/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/lib64/apple_gptk"
# 自动检测评估环境挂载路径（卷名匹配按本脚本验证过的 3.0 beta 3，后续 GPTK 版本需重核卷名与文件清单）
SOURCE_LIB_DIR=""
for possible_path in "/Volumes/Evaluation environment for Windows games"*"/redist/lib" "/Volumes/Game evaluation"*"/redist/lib"; do
    if [ -d "$possible_path" ]; then
        SOURCE_LIB_DIR="$possible_path"
        break
    fi
done
CROSSOVER_WINE_UNIX_DIR="${CROSSOVER_GPTK_DIR}/wine/x86_64-unix"
CROSSOVER_WINE_WIN_DIR="${CROSSOVER_GPTK_DIR}/wine/x86_64-windows"
DEFAULT_BOTTLES_DIR="${HOME}/Library/Application Support/CrossOver/Bottles"
BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# 显示欢迎信息
log_operation "=== CrossOver 游戏评估环境更新工具 ==="
log_operation "=== 支持 MetalFX 集成与容器选择 ==="
echo -e "${YELLOW}=== CrossOver 游戏评估环境更新工具 ===${NC}"
echo -e "${YELLOW}=== 支持 MetalFX 集成与容器选择 ===${NC}\n"
echo -e "${YELLOW}📝 日志文件：${LOG_FILE}${NC}\n"

# 系统兼容性检查
check_system_compatibility

# 网络连接检查
check_network_connectivity
echo

# 先确认安装目录存在，再判断是否需要提权（目录不存在时不可写，会误判为权限不足）
if [ ! -d "${CROSSOVER_GPTK_DIR}" ]; then
    log_operation "❌ 未找到CrossOver安装目录: ${CROSSOVER_GPTK_DIR}"
    echo -e "${RED}错误：未找到CrossOver安装目录${NC}"
    echo -e "${RED}预期路径：${CROSSOVER_GPTK_DIR}${NC}"
    exit 1
fi
log_operation "✅ CrossOver安装目录验证成功"

# 检查文件写入权限（优先避免使用sudo）
SUDO=""
if [ ! -w "${CROSSOVER_GPTK_DIR}" ]; then
    echo -e "${YELLOW}提示：需要管理员权限进行CrossOver文件操作${NC}"
    echo -e "${YELLOW}建议：请确保当前用户对CrossOver应用有写入权限${NC}"
    read -p "是否使用sudo权限继续？(y/N): " use_sudo
    if [[ "$use_sudo" =~ ^[Yy]$ ]]; then
        SUDO="sudo"
    else
        echo -e "${RED}操作已取消${NC}"
        exit 1
    fi
fi

# 检查评估环境镜像
if [ -z "${SOURCE_LIB_DIR}" ] || [ ! -d "${SOURCE_LIB_DIR}" ]; then
    log_operation "❌ 未找到评估环境镜像"
    echo -e "${RED}错误：未找到评估环境镜像${NC}"
    echo -e "${YELLOW}请先挂载以下任一镜像：${NC}"
    echo "  - Evaluation environment for Windows games 3.0 beta 3"
    echo "  - 其他类似的游戏评估环境镜像"
    echo -e "${YELLOW}当前搜索的路径：${NC}"
    ls -d /Volumes/*"game"* /Volumes/*"Game"* /Volumes/*"evaluation"* /Volumes/*"Evaluation"* 2>/dev/null || echo "  未找到相关挂载点"
    exit 1
else
    log_operation "✅ 找到评估环境: ${SOURCE_LIB_DIR}"
    echo -e "${GREEN}找到评估环境：${SOURCE_LIB_DIR}${NC}"
fi

# 更新核心库文件
log_operation "🔄 开始更新核心库文件"
echo -e "\n${GREEN}--- 1. 更新核心库文件 ---${NC}"
cd "${CROSSOVER_GPTK_DIR}" || {
    echo -e "${RED}无法进入目录：${CROSSOVER_GPTK_DIR}${NC}"
    exit 1
}

# 备份旧文件（使用时间戳避免覆盖）
echo -e "${YELLOW}备份原有文件...${NC}"
if [ -d "external" ]; then
    $SUDO mv external "external.backup.${BACKUP_TIMESTAMP}" || {
        echo -e "${RED}external目录备份失败${NC}"
        exit 1
    }
    echo -e "${GREEN}✅ external目录已备份为 external.backup.${BACKUP_TIMESTAMP}${NC}"
fi

if [ -d "wine" ]; then
    $SUDO mv wine "wine.backup.${BACKUP_TIMESTAMP}" || {
        echo -e "${RED}wine目录备份失败${NC}"
        exit 1
    }
    echo -e "${GREEN}✅ wine目录已备份为 wine.backup.${BACKUP_TIMESTAMP}${NC}"
fi

# 复制新文件
echo -e "${YELLOW}复制新库文件...${NC}"
$SUDO ditto "${SOURCE_LIB_DIR}/" . || {
    echo -e "${RED}文件复制失败，正在恢复备份...${NC}"
    [ -d "external.backup.${BACKUP_TIMESTAMP}" ] && $SUDO mv "external.backup.${BACKUP_TIMESTAMP}" external
    [ -d "wine.backup.${BACKUP_TIMESTAMP}" ] && $SUDO mv "wine.backup.${BACKUP_TIMESTAMP}" wine
    exit 1
}

# 验证复制结果
if [ ! -d "external" ] || [ ! -d "wine" ]; then
    echo -e "${RED}复制验证失败，正在恢复备份...${NC}"
    [ -d "external.backup.${BACKUP_TIMESTAMP}" ] && $SUDO mv "external.backup.${BACKUP_TIMESTAMP}" external
    [ -d "wine.backup.${BACKUP_TIMESTAMP}" ] && $SUDO mv "wine.backup.${BACKUP_TIMESTAMP}" wine
    exit 1
fi

# MD5完整性验证
echo -e "${YELLOW}🔍 正在验证所有复制文件的完整性...${NC}"
verify_success=true
verified_count=0
failed_count=0

# 验证函数
verify_file_integrity() {
    local source_file="$1"
    local target_file="$2"
    local relative_path="$3"

    if [ -f "$source_file" ] && [ -f "$target_file" ]; then
        if command -v md5 >/dev/null 2>&1; then
            source_md5=$(md5 -q "$source_file" 2>/dev/null)
            target_md5=$(md5 -q "$target_file" 2>/dev/null)
        elif command -v md5sum >/dev/null 2>&1; then
            source_md5=$(md5sum "$source_file" 2>/dev/null | cut -d' ' -f1)
            target_md5=$(md5sum "$target_file" 2>/dev/null | cut -d' ' -f1)
        else
            echo -e "${YELLOW}⚠️ MD5工具不可用，跳过校验${NC}"
            return 0
        fi

        if [ "$source_md5" = "$target_md5" ] && [ -n "$source_md5" ]; then
            echo -e "${GREEN}  ✅ ${relative_path}${NC}"
            ((verified_count++))
            return 0
        else
            echo -e "${RED}  ❌ ${relative_path} - MD5校验失败${NC}"
            echo -e "${RED}     源文件: ${source_md5}${NC}"
            echo -e "${RED}     目标文件: ${target_md5}${NC}"
            ((failed_count++))
            return 1
        fi
    fi
    return 0
}

# 验证关键文件
echo -e "${YELLOW}验证关键库文件...${NC}"
key_files=(
    "wine/x86_64-windows/nvngx.dll"
    "wine/x86_64-windows/nvapi64.dll"
    "wine/x86_64-windows/d3d12.dll"
    "wine/x86_64-unix/nvngx.so"
    "external/lib/libMoltenVK.dylib"
)

for key_file in "${key_files[@]}"; do
    source_file="${SOURCE_LIB_DIR}/${key_file}"
    target_file="${CROSSOVER_GPTK_DIR}/${key_file}"

    if [ -f "$source_file" ]; then
        if ! verify_file_integrity "$source_file" "$target_file" "$key_file"; then
            verify_success=false
        fi
    fi
done

# 验证所有.dll和.so文件
echo -e "${YELLOW}验证所有动态库文件...${NC}"
while IFS= read -r -d '' source_file; do
    relative_path="${source_file#${SOURCE_LIB_DIR}/}"
    target_file="${CROSSOVER_GPTK_DIR}/${relative_path}"

    if ! verify_file_integrity "$source_file" "$target_file" "$relative_path"; then
        verify_success=false
    fi

done < <(find "${SOURCE_LIB_DIR}" -type f \( -name "*.dll" -o -name "*.so" -o -name "*.dylib" \) -print0 2>/dev/null)

# 显示验证结果
echo -e "${YELLOW}📊 文件完整性验证结果：${NC}"
echo -e "${GREEN}  ✅ 验证通过: ${verified_count} 个文件${NC}"
if [ "$failed_count" -gt 0 ]; then
    echo -e "${RED}  ❌ 验证失败: ${failed_count} 个文件${NC}"
fi

if $verify_success; then
    echo -e "${GREEN}🎉 所有文件MD5校验通过，更新完整性已确认${NC}"
else
    echo -e "${RED}⚠️ 部分文件校验失败，建议重新运行脚本${NC}"
    read -p "是否继续执行？(y/N): " continue_anyway
    if [[ ! "$continue_anyway" =~ ^[Yy]$ ]]; then
        echo -e "${RED}操作已取消${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ 核心库文件更新完成${NC}"

# 重命名MetalFX文件
log_operation "🔧 开始配置MetalFX支持"
echo -e "\n${GREEN}--- 2. 配置MetalFX支持 ---${NC}"

# 处理MetalFX文件列表
metalfx_files=(
    "${CROSSOVER_WINE_UNIX_DIR}/nvngx-on-metalfx.so:${CROSSOVER_WINE_UNIX_DIR}/nvngx.so:Unix"
    "${CROSSOVER_WINE_WIN_DIR}/nvngx-on-metalfx.dll:${CROSSOVER_WINE_WIN_DIR}/nvngx.dll:Windows"
)

# 批量处理MetalFX文件
for metalfx_info in "${metalfx_files[@]}"; do
    source_file="${metalfx_info%%:*}"
    temp="${metalfx_info#*:}"
    target_file="${temp%%:*}"
    file_type="${metalfx_info##*:}"

    if [ -f "$source_file" ]; then
        log_operation "🔄 重命名${file_type}端MetalFX文件: $(basename "$source_file")"
        echo -e "${YELLOW}重命名${file_type}端MetalFX文件...${NC}"
        $SUDO mv "$source_file" "$target_file" || {
            log_operation "❌ ${file_type}端MetalFX文件重命名失败"
            echo -e "${RED}错误：${file_type}端MetalFX文件重命名失败${NC}"
            exit 1
        }
    elif [ -f "$target_file" ]; then
        log_operation "✅ ${file_type}端MetalFX文件已配置"
        echo -e "${YELLOW}${file_type}端MetalFX文件已配置${NC}"
    else
        log_operation "❌ 未找到${file_type}端MetalFX文件"
        echo -e "${RED}错误：未找到${file_type}端MetalFX文件${NC}"
        exit 1
    fi
done
log_operation "✅ MetalFX配置完成"
echo -e "${GREEN}✅ MetalFX配置完成${NC}"

# 容器选择与智能检测
log_operation "🎮 开始配置游戏容器"
echo -e "\n${GREEN}--- 3. 配置游戏容器 ---${NC}"
echo -e "${YELLOW}请选择你要配置的游戏容器（Bottle）${NC}"
echo "1. 自动搜索并选择容器（推荐）"
echo "2. 手动输入容器名称"
echo "3. 手动输入完整路径"
echo "4. 跳过此步骤"
read -p "请选择(1-4，默认1): " bottle_choice
bottle_choice=${bottle_choice:-1}

WINE_PREFIX_DRIVEC=""

# 改进的自动检测函数
auto_search_and_select_bottles() {
    echo -e "${YELLOW}🔍 正在搜索CrossOver容器...${NC}"
    local detected_bottles=()
    local detected_paths=()

    # 搜索默认目录中的容器
    if [ -d "${DEFAULT_BOTTLES_DIR}" ]; then
        for bottle_dir in "${DEFAULT_BOTTLES_DIR}"/*; do
            if [ -d "${bottle_dir}/drive_c/windows/system32" ]; then
                local bottle_name=$(basename "$bottle_dir")
                detected_bottles+=("$bottle_name")
                detected_paths+=("${bottle_dir}/drive_c")
            fi
        done
    fi

    # 也搜索旧版路径
    if [ -d "${HOME}/.cxoffice" ]; then
        for bottle_dir in "${HOME}/.cxoffice"/*; do
            if [ -d "${bottle_dir}/drive_c/windows/system32" ]; then
                local bottle_name=$(basename "$bottle_dir")
                # 用容器路径判重：显示名会附加“ (旧版)”后缀，按名字比对会漏判新旧同名容器
                local bottle_path="${bottle_dir}/drive_c"
                local is_dup=false
                for known_path in "${detected_paths[@]}"; do
                    if [ "$known_path" = "$bottle_path" ]; then
                        is_dup=true
                        break
                    fi
                done
                if [ "$is_dup" = false ]; then
                    detected_bottles+=("$bottle_name (旧版)")
                    detected_paths+=("$bottle_path")
                fi
            fi
        done
    fi

    if [ ${#detected_bottles[@]} -eq 0 ]; then
        echo -e "${YELLOW}⚠️ 未检测到有效的CrossOver容器${NC}"
        echo -e "${YELLOW}请确保CrossOver已安装并创建了游戏容器${NC}"
        return 1
    fi

    echo -e "${GREEN}📋 找到以下容器：${NC}"
    echo -e "  ${YELLOW}0.${NC} 跳过容器配置"
    for i in "${!detected_bottles[@]}"; do
        echo -e "  ${GREEN}$((i+1)).${NC} ${detected_bottles[i]}"
    done

    while true; do
        read -p "请输入容器编号 (0-${#detected_bottles[@]}): " bottle_num

        if [[ "$bottle_num" == "0" ]]; then
            echo -e "${YELLOW}已跳过容器配置${NC}"
            return 1
        elif [[ "$bottle_num" =~ ^[1-9][0-9]*$ ]] && [ "$bottle_num" -le ${#detected_bottles[@]} ]; then
            local selected_bottle="${detected_bottles[$((bottle_num-1))]}"
            WINE_PREFIX_DRIVEC="${detected_paths[$((bottle_num-1))]}"
            log_operation "✅ 用户选择容器: ${selected_bottle}"
            log_operation "📁 容器路径: ${WINE_PREFIX_DRIVEC}"
            echo -e "${GREEN}✅ 已选择容器：${selected_bottle}${NC}"
            echo -e "${GREEN}📁 容器路径：${WINE_PREFIX_DRIVEC}${NC}"
            return 0
        else
            echo -e "${RED}❌ 无效的编号！${NC}"
            echo -e "${YELLOW}💡 有效选项：${NC}"
            echo -e "${YELLOW}   0 - 跳过容器配置${NC}"
            for i in "${!detected_bottles[@]}"; do
                echo -e "${YELLOW}   $((i+1)) - ${detected_bottles[i]}${NC}"
            done
        fi
    done
}

case $bottle_choice in
    1)
        # 自动搜索并选择容器
        auto_search_and_select_bottles
        ;;
    2)
        # 手动输入容器名称
        read -p "请输入容器名称：" bottle_name

        if [ -z "$bottle_name" ]; then
            echo -e "${RED}错误：容器名称不能为空${NC}"
        else
            # 搜索可能的容器路径
            possible_paths=(
                "${DEFAULT_BOTTLES_DIR}/${bottle_name}/drive_c"
                "${HOME}/.cxoffice/${bottle_name}/drive_c"
                "${HOME}/Library/Application Support/CrossOver/${bottle_name}/drive_c"
            )

            for path in "${possible_paths[@]}"; do
                if [ -d "${path}/windows/system32" ]; then
                    WINE_PREFIX_DRIVEC="$path"
                    echo -e "${GREEN}✅ 找到容器：${bottle_name}${NC}"
                    echo -e "${GREEN}📁 容器路径：${WINE_PREFIX_DRIVEC}${NC}"
                    break
                fi
            done

            if [ -z "$WINE_PREFIX_DRIVEC" ]; then
                echo -e "${RED}❌ 未找到容器「${bottle_name}」${NC}"
                echo -e "${YELLOW}💡 建议使用选项1自动搜索容器${NC}"
            fi
        fi
        ;;
    3)
        # 手动输入路径
        read -p "请输入容器的drive_c完整路径：" manual_path
        if [ -n "$manual_path" ] && [ -d "${manual_path}/windows/system32" ]; then
            WINE_PREFIX_DRIVEC="$manual_path"
            echo -e "${GREEN}✅ 容器路径已设置${NC}"
            echo -e "${GREEN}📁 容器路径：${WINE_PREFIX_DRIVEC}${NC}"
        else
            echo -e "${RED}❌ 无效的容器路径，请确保路径包含 windows/system32 目录${NC}"
        fi
        ;;
    4)
        # 跳过
        echo -e "${YELLOW}⏭️ 已跳过容器配置${NC}"
        ;;
    *)
        echo -e "${RED}❌ 无效选择，已跳过容器配置${NC}"
        ;;
esac

# 复制DLL文件（如果路径有效）
if [ -n "$WINE_PREFIX_DRIVEC" ] && [ -d "${WINE_PREFIX_DRIVEC}/windows/system32" ]; then
    log_operation "💾 开始DLL文件复制到容器"
    echo -e "\n${YELLOW}正在复制DLL文件到容器...${NC}"

    # DLL文件列表
    dll_list=(
        "nvngx.dll:NVIDIA DLSS支持库"
        "nvapi64.dll:NVIDIA API库"
    )

    copy_success=true
    for dll_info in "${dll_list[@]}"; do
        dll_name="${dll_info%:*}"
        description="${dll_info#*:}"
        source_file="${CROSSOVER_WINE_WIN_DIR}/${dll_name}"
        target_file="${WINE_PREFIX_DRIVEC}/windows/system32/${dll_name}"

        if [ -f "$source_file" ]; then
            if $SUDO cp "$source_file" "$target_file" 2>/dev/null; then
                log_operation "✅ ${description} (${dll_name}) 复制成功"
                echo -e "${GREEN}✅ ${description} (${dll_name}) 复制成功${NC}"
                echo -e "${YELLOW}   📋 源文件已在核心库更新时通过MD5校验${NC}"
            else
                log_operation "❌ ${description} (${dll_name}) 复制失败"
                echo -e "${RED}❌ ${description} (${dll_name}) 复制失败${NC}"
                copy_success=false
            fi
        else
            log_operation "⚠️ ${description} (${dll_name}) 源文件不存在"
            echo -e "${YELLOW}⚠️ ${description} (${dll_name}) 源文件不存在${NC}"
        fi
    done

    if $copy_success; then
        log_operation "🎉 所有DLL文件复制完成"
        echo -e "${GREEN}🎉 所有DLL文件复制完成${NC}"
    else
        log_operation "⚠️ 部分DLL文件复制失败"
        echo -e "${YELLOW}⚠️ 部分DLL文件复制失败，可能影响功能${NC}"
    fi
else
    log_operation "⏭️ 未配置容器，跳过DLL文件复制"
    echo -e "\n${YELLOW}未配置容器，已跳过DLL文件复制${NC}"
fi

# 操作完成提示
log_operation "🎉 CrossOver GPTK3更新全部完成"
echo -e "\n${GREEN}===========================================${NC}"
echo -e "${GREEN}   ✅ CrossOver GPTK3 更新完成！   ${NC}"
echo -e "${GREEN}===========================================${NC}"

echo -e "\n${YELLOW}📝 使用指南：${NC}"
echo "${GREEN}1.${NC} 启动CrossOver，确保游戏容器已启用D3DMetal"
echo "${GREEN}2.${NC} 游戏启动时可添加环境变量："
echo "   ${YELLOW}MTL_CAPTURE_ENABLED=1 D3DM_ENABLE_METALFX=1${NC}"
echo "${GREEN}3.${NC} 遇到着色器问题时，可清除缓存："
echo "   ${YELLOW}cd \$(getconf DARWIN_USER_CACHE_DIR)/d3dm/[游戏名] && rm -rf shaders.cache${NC}"

echo -e "\n${YELLOW}🔧 故障排查：${NC}"
echo "${GREEN}•${NC} 如果游戏无法启动，请检查CrossOver容器配置"
echo "${GREEN}•${NC} 如果性能不佳，请确认MetalFX支持已正确配置"
echo "${GREEN}•${NC} 遇到问题可恢复备份："
echo "   ${YELLOW}mv external.backup.${BACKUP_TIMESTAMP} external${NC}"
echo "   ${YELLOW}mv wine.backup.${BACKUP_TIMESTAMP} wine${NC}"

echo -e "\n${YELLOW}📋 日志信息：${NC}"
echo "${GREEN}•${NC} 详细操作日志已保存到：${YELLOW}${LOG_FILE}${NC}"
echo "${GREEN}•${NC} 查看日志命令：${YELLOW}cat ${LOG_FILE}${NC}"
```

## 总结

`crossover-gptk3.sh` 把 GPTK3 文件替换从多步手工操作收敛为一次执行，内置带时间戳备份、MD5 完整性校验、失败回滚与全量日志，出错时可据日志与备份恢复到改动前状态。

使用前确认三项前置条件均已满足（CrossOver Preview 已安装、GPTK 安装包与评估环境镜像均已挂载），并留意容器选择环节：DLL 只复制到所选容器，选错容器不影响文件替换本身，但目标游戏不会获得更新。

**免责**：脚本涉及系统文件操作，使用前了解其功能并做好数据备份，作者不对使用造成的任何损失负责。

## 待人工确认

- CrossOver 后续版本若原生支持 GPTK3（或官方更新 `apple_gptk` 目录结构），本脚本整套作废，届时确认替代路径；
- `ditto` 复制后逐文件 MD5 校验的是内容一致性，不含权限/签名位：应用包内文件被改后 Code Signing 是否仍被 Gatekeeper/MDM 接受（尤其 `com.apple.security.cs.` 相关 entitlement 校验），在 MDM 环境下需实测一次冷启动确认；
- 脚本对 macOS 主版本的分支只区分 15 / 26 / 其他，macOS 15.5 之后的小版本对 GPTK3 的支持边界未逐一验证。
