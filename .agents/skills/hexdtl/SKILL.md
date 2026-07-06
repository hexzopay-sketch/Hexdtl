---
name: hexdtl
description: Excel to Hex conversion utility - reads Excel hex data files and generates binary hex files
---

# HexDTL - Excel to Hex Conversion Utility

## 项目概述

HexDTL 是一个 Excel 到 Hex 的转换工具，用于处理 Xiaomi 设备的 DDR 内存初始化参数文件。

### 项目背景

在嵌入式开发中，DDR 内存初始化需要精确配置大量寄存器参数。项目组使用 Excel 格式存储这些配置数据，Excel 中的表格结构如下：

| Column A | Column B | Column C | Column D |
|----------|----------|----------|----------|
| Name     | BaseAddr | Offest   | RegValue |
| reg_name | 0x1234   | 0x8      | 0xDEADBEEF |

其中：
- **Name**: 寄存器名称
- **BaseAddr**: 基地址
- **Offest**: 偏移量（注意：项目中使用了这个拼写，保持一致）
- **RegValue**: 寄存器值

### 核心功能

1. 从 Excel 文件中读取表数据
2. 解析 RegValue 列中的 hex 数据（支持 `0x` 前缀和不带前缀两种格式）
3. 每个 hex 值占据 4 bytes（32位）
4. 所有 hex 数据连续存储，中间不做任何拼接
5. 生成二进制 hex 文件
6. 支持将多个 Excel 文件的数据合并写入同一个输出文件

### 技术规格

- 输出格式：原始二进制（Raw Binary），而非 HEX 文本格式
- 字节序：大端序（Big-endian）
- 数据宽度：每个值 4 bytes（32-bit）
- 输出文件名：从 Excel 文件名自动生成（将 `.` 替换为 `_`）
- 支持的 Excel 格式：.xlsx, .xls

## 使用方法

### 基本用法

```bash
# 转换单个 Excel 文件
python hexdtl.py ddr_params.xlsx

# 转换多个 Excel 文件（数据会合并到一个输出文件）
python hexdtl.py file1.xlsx file2.xlsx file3.xlsx
```

### 输出文件命名规则

输入文件 `ddr_params.xlsx` → 输出文件 `ddr_params_xls`

### 输出文件格式

输出为原始二进制文件，可使用以下方式查看：
```bash
xxd output.bin | head
```

## 重要注意事项

### 1. Excel 文件格式
- 使用 openpyxl 库读取 .xlsx 文件
- 读取第一个工作表（Worksheets[0]）
- 默认从第 2 行开始读取（第 1 行为表头）

### 2. 数据处理
- RegValue 支持 `0x` 前缀和不带前缀两种格式
- 每个值转换为 4 bytes 大端序
- 所有值连续写入，不做额外拼接
- 跳过 RegValue 为空的行

### 3. 命名约定
- 项目中使用 "Offest" 而非 "Offset"，保持与原始 Excel 一致
- 输出文件名中的 `.` 会被替换为 `_`

### 4. 文件结构
```
Hexdtl/
├── hexdtl.py           # 主程序
├── ddr_param1.xlsx     # 示例输入文件
├── ddr_param2.xlsx     # 示例输入文件
└── README.md           # 项目说明
```

### 5. 依赖
- Python 3
- openpyxl

## 示例

### 输入 Excel 内容
```
| Name | BaseAddr | Offest | RegValue |
|------|----------|--------|----------|
| REG1 | 0x1234   | 0x0    | 0xDEADBEEF |
| REG2 | 0x1234   | 0x4    | 0x12345678 |
```

### 输出二进制内容（十六进制显示）
```
DEADBEEF 12345678
```
（连续 8 bytes）

## 开发说明

### 修改输出格式
如需修改输出格式（如改为 little-endian 或 8-byte 宽度），需修改 `hexdtl.py` 中的：
- `int.to_bytes(length=4, byteorder='big')` - 修改字节序和宽度
- `binary_file.write(hex_bytes)` - 修改写入逻辑

### 添加新的输入格式
如需支持 CSV 或其他格式，需添加相应的解析器。
