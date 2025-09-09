---
title: macOS 26测试版CrossOver Preview GPTK3一键更新脚本
date: 2025-09-09 10:00:00
updated: 2025-09-09 10:00:00
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
description: 介绍一款针对macOS 26测试版与CrossOver Preview环境的一键更新脚本，用于替换Game Porting Toolkit 3文件，提升Windows游戏在macOS上的运行效果。
cover: /medias/featureimages/1.jpg
toc: true
copyright: true
---

# macOS 26测试版CrossOver Preview GPTK3一键更新脚本

在最新的macOS 26测试版中，苹果继续优化了对Windows游戏的支持。然而，CrossOver Preview版本可能尚未完全适配这些新特性。为了帮助用户更好地在macOS上运行Windows游戏，我开发了一款一键更新脚本，专门用于替换CrossOver中的Game Porting Toolkit 3 (GPTK3) 文件。

## 脚本概述

这款crossover-gptk3.sh脚本是一个完整的Shell脚本解决方案，旨在简化macOS 26测试版与CrossOver Preview环境中GPTK3文件的更新过程。通过自动化处理原本复杂的文件替换和配置过程，让用户能够轻松享受最新的游戏优化技术。

## 核心功能特性

### 1. 系统环境智能检测
脚本启动时会自动检测当前系统环境：
- macOS版本兼容性检查
- 网络连接状态验证
- CrossOver安装目录验证

### 2. 安全的文件操作机制
- 自动备份原有文件（带时间戳）
- 文件复制完整性验证（MD5校验）
- 异常情况自动回滚机制

### 3. GPTK3文件更新
- 自动检测评估环境镜像挂载路径
- 核心库文件替换
- 关键DLL文件验证

### 4. MetalFX支持配置
- Unix端MetalFX文件配置
- Windows端MetalFX文件配置
- 性能优化支持

### 5. 容器智能管理
- 自动搜索CrossOver容器
- 手动容器路径配置
- DLL文件自动复制到容器

## 脚本使用指南

### 前置条件
1. 确保已安装CrossOver Preview版本
2. 从[Apple开发者网站](https://developer.apple.com/games/game-porting-toolkit/)下载Game Porting Toolkit安装包
3. 挂载下载的安装包镜像
4. 再次挂载"**Evaluation environment for Windows games 3.0 beta 3.dmg**"镜像

### 脚本执行步骤

```bash
# 1. 创建脚本文件并复制以下完整脚本内容
# 2. 添加执行权限
chmod +x crossover-gptk3.sh

# 3. 运行脚本
./crossover-gptk3.sh
```

### 交互式配置过程

脚本运行时会引导用户完成以下配置：

1. **权限确认**：根据需要确认是否使用sudo权限
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

脚本会检查macOS版本，对不同版本给出相应的提示信息，特别是对macOS 15及更高版本的兼容性提醒。

### 文件操作安全机制
```bash
# 备份时间戳
BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# 备份原有文件
$SUDO mv external "external.backup.${BACKUP_TIMESTAMP}"
$SUDO mv wine "wine.backup.${BACKUP_TIMESTAMP}"
```

### 完整性验证
脚本使用MD5校验确保所有复制文件的完整性：
```bash
# MD5校验示例
source_md5=$(md5 -q "$source_file" 2>/dev/null)
target_md5=$(md5 -q "$target_file" 2>/dev/null)
```

### MetalFX配置
自动处理MetalFX相关文件的重命名：
```bash
# MetalFX文件列表
metalfx_files=(
    "${CROSSOVER_WINE_UNIX_DIR}/nvngx-on-metalfx.so:${CROSSOVER_WINE_UNIX_DIR}/nvngx.so:Unix"
    "${CROSSOVER_WINE_WIN_DIR}/nvngx-on-metalfx.dll:${CROSSOVER_WINE_WIN_DIR}/nvngx.dll:Windows"
)
```

## 使用建议与注意事项

### 权限管理
脚本会优先避免使用sudo权限，仅在必要时提示用户授权，确保系统安全。

### 日志记录
所有操作都会记录在日志文件中，便于后续查看和故障排查：
```bash
# 日志文件路径示例
LOG_FILE="/tmp/crossover-gptk3-$(date +%Y%m%d_%H%M%S).log"
```

### 备份恢复
如遇到问题，可通过以下命令恢复备份文件：
```bash
# 恢复备份示例
mv external.backup.${BACKUP_TIMESTAMP} external
mv wine.backup.${BACKUP_TIMESTAMP} wine
```

## 故障排除指南

### 常见问题及解决方案

1. **脚本权限问题**
   - 确保脚本具有执行权限：`chmod +x crossover-gptk3.sh`
   - 如提示权限不足，根据需要输入管理员密码

2. **容器检测失败**
   - 确认CrossOver已正确安装
   - 检查是否存在有效的游戏容器
   - 可选择手动输入容器路径

3. **文件校验失败**
   - 重新挂载评估环境镜像
   - 确认镜像文件完整性
   - 重新运行脚本

4. **MetalFX配置问题**
   - 检查相关文件是否存在
   - 确认CrossOver容器已启用D3DMetal

## 完整脚本代码

以下是完整的crossover-gptk3.sh脚本代码：

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
        if [[ "$major_version" == "15" ]]; then
            # macOS 15 Sequoia (内核版本24.x)
            log_operation "⚠️ 检测到macOS 15 Sequoia，某些游戏功能可能不可用"
            echo -e "${YELLOW}⚠️ 检测到macOS 15 Sequoia，某些游戏功能可能不可用${NC}"
        elif [[ "$major_version" -ge "15" ]]; then
            # 更新的macOS版本
            log_operation "⚠️ 检测到较新的macOS版本 ($macos_version)，兼容性未完全测试"
            echo -e "${YELLOW}⚠️ 检测到较新的macOS版本 ($macos_version)，兼容性未完全测试${NC}"
        else
            log_operation "✅ macOS版本 ($macos_version) 兼容性良好"
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
# 自动检测评估环境挂载路径
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

# 检查CrossOver安装
if [ ! -d "${CROSSOVER_GPTK_DIR}" ]; then
    log_operation "❌ 未找到CrossOver安装目录: ${CROSSOVER_GPTK_DIR}"
    echo -e "${RED}错误：未找到CrossOver安装目录${NC}"
    echo -e "${RED}预期路径：${CROSSOVER_GPTK_DIR}${NC}"
    exit 1
fi
log_operation "✅ CrossOver安装目录验证成功"

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
        verify_file_integrity "$source_file" "$target_file" "$key_file"
        [ $? -ne 0 ] && verify_success=false
    fi
done

# 验证所有.dll和.so文件
echo -e "${YELLOW}验证所有动态库文件...${NC}"
while IFS= read -r -d '' source_file; do
    relative_path="${source_file#${SOURCE_LIB_DIR}/}"
    target_file="${CROSSOVER_GPTK_DIR}/${relative_path}"
    
    verify_file_integrity "$source_file" "$target_file" "$relative_path"
    [ $? -ne 0 ] && verify_success=false
    
done < <(find "${SOURCE_LIB_DIR}" -type f \( -name "*.dll" -o -name "*.so" -o -name "*.dylib" \) -print0 2>/dev/null)

# 显示验证结果
echo -e "${YELLOW}📊 文件完整性验证结果：${NC}"
echo -e "${GREEN}  ✅ 验证通过: ${verified_count} 个文件${NC}"
if [ $failed_count -gt 0 ]; then
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
                # 避免重复添加
                if [[ ! " ${detected_bottles[@]} " =~ " ${bottle_name} " ]]; then
                    detected_bottles+=("$bottle_name (旧版)")
                    detected_paths+=("${bottle_dir}/drive_c")
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

这款crossover-gptk3.sh脚本通过自动化处理macOS 26测试版与CrossOver Preview环境中GPTK3文件的更新过程，大大简化了原本复杂的操作步骤。脚本内置了完善的安全机制、错误处理和日志记录功能，确保用户能够安全、可靠地完成文件更新。

通过使用此脚本，用户可以：
- 轻松享受最新的游戏优化技术
- 提升Windows游戏在macOS上的运行效果
- 简化复杂的文件操作过程
- 获得详细的日志记录和故障排查支持

无论是新手还是经验丰富的用户，都可以通过这个脚本快速完成GPTK3文件的更新，享受更好的游戏体验。

---

**重要提醒**：此脚本涉及系统文件操作，请在使用前确保了解其功能并做好数据备份。作者不对因使用此脚本造成的任何损失负责。