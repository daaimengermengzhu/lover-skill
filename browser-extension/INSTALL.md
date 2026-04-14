# Chrome Extension 安装指南

## 安装步骤

### 1. 打开 Chrome 扩展页面

访问: `chrome://extensions/`

或者: 设置 → 更多工具 → 扩展程序

### 2. 开启开发者模式

右上角开启 **开发者模式**

### 3. 加载已解压的扩展程序

1. 点击 **加载已解压的扩展程序**
2. 选择 `~/.claude/skills/lover-skill/browser-extension/` 文件夹

### 4. 固定扩展图标（可选）

点击 Chrome 工具栏的拼图图标 → 点击 Lover Skill 旁边的图钉图标

## 验证安装

1. 点击扩展图标，查看状态
2. 访问几个网页，检查浏览记录数是否增加

## 数据存储位置

扩展收集的数据会自动同步到：
- `~/Downloads/lover-data/browsing.json`

每隔 15 分钟自动同步一次，也可以点击扩展 popup 中的"同步数据"按钮手动同步。

## 卸载

1. 打开 `chrome://extensions/`
2. 找到 Lover Skill
3. 点击 **移除**

## Edge 浏览器

1. 访问 `edge://extensions/`
2. 开启 **开发者模式**
3. 点击 **加载解包的扩展**
4. 选择同一目录

## 注意事项

- 扩展仅记录 URL、标题、时间和域名
- 不记录密码、Cookie 或表单内容
- 数据完全本地存储，不上传
