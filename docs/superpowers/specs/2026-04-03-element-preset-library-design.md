# 元素预设库（我的元素）功能设计

## 1. 背景与目标

当前标签编辑器支持基础元素快速新增（文本、条码、图片、二维码、图形、图标），但缺少“元素级复用”能力。用户在食品营养标签、服装标签、仓储标签等高重复场景下，需要频繁重复搭建相似布局，效率低、易出错。

本设计目标是新增“我的元素（Element Preset Library）”能力，提供可保存、可编辑、可复用、可分享的元素模板机制，支持：

- 保存粒度：单元素 + 组合元素（整块）
- 保存入口：画布右键 + 左侧工具区右键
- 使用方式：单击插入 + 拖拽插入
- 列表形态：统一单列表（不强制行业分组）
- 绑定策略：保存时保留原绑定
- 共享能力：本机保存 + 导入导出
- 图片稳定性：支持包含图片的大型食品标签块，导入导出不丢图

## 2. 范围

### 2.1 本期范围（v1）

- 左侧工具区新增“我的元素”面板
- 画布元素右键菜单新增“保存为我的元素”
- 支持保存单元素与多元素组合
- 支持预设项的插入（点击居中、拖拽落点）
- 支持预设基础管理（重命名、删除、复制、编辑描述）
- 支持导入/导出预设包（含图片资源）
- 内置系统预置（食品、服装、仓储）
- 推荐区：最近使用 + 高频使用

### 2.2 非本期范围（后续）

- 云同步与跨设备实时共享
- 团队权限管理
- 复杂协作冲突解决
- AI 自动识别并切分图片为结构化元素

## 3. 用户体验设计

### 3.1 保存流程

1. 用户在画布选中 1 个或多个元素。
2. 右键打开上下文菜单，点击“保存为我的元素”。
3. 弹窗填写：
   - 名称（必填）
   - 描述（可选）
   - 标签（可选）
4. 提交后写入预设库，提示“已保存到我的元素”。

说明：
- 选中 1 个元素保存为 `single`。
- 选中多个元素保存为 `group`，保留相对布局。
- 默认保留绑定规则（字段绑定、表达式绑定不被破坏）。

### 3.2 使用流程

- 在左侧“我的元素”面板中：
  - 单击条目：插入到当前标签中心
  - 拖拽条目到画布：插入到拖放位置
- 插入后：
  - 元素 ID 全部重建，避免冲突
  - 若越界则自动平移回可视区域
  - 右侧属性面板继续可编辑

### 3.3 条目管理

每个条目支持右键菜单：
- 插入
- 重命名
- 编辑描述/标签
- 复制一份
- 导出该项
- 删除

系统预置条目（source=system）限制为：
- 可插入
- 可复制为用户条目
- 不可直接删除系统原件

### 3.4 推荐区规则

推荐区展示统一列表内的高价值条目：
- 最近使用（时间衰减）
- 高频使用（累计次数）
- 置顶条目优先

## 4. 技术架构

### 4.1 前端（React + Zustand）

新增模块：
- `features/editor/element-preset.store.ts`
  - 状态：列表、加载状态、搜索关键字、推荐计算
  - 动作：加载、保存、更新元数据、删除、使用计数、导入导出
- `services/ipc/element-preset.ts`
  - IPC 调用封装
  - 浏览器 fallback（localStorage）
- `features/editor/ElementPresetPanel.tsx`
  - “我的元素”列表 UI
  - 搜索/推荐/条目菜单

改造模块：
- `CanvasStage.tsx`
  - 元素右键菜单
  - 画布落点插入
- `EditorPage.tsx`
  - 注入预设相关回调
- `LeftPalette.tsx`
  - 在基础工具下方接入“我的元素”面板

### 4.2 后端（Tauri + SQLite）

新增迁移与 Repo：
- `migrations/0003_add_element_presets.sql`
- `repo/element_preset_repo.rs`
- `commands/element_preset_commands.rs`

并在 `commands/mod.rs` 与 `lib.rs` 注册命令。

## 5. 数据模型

### 5.1 表结构

#### `element_presets`
- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `name TEXT NOT NULL`
- `description TEXT NOT NULL DEFAULT ''`
- `kind TEXT NOT NULL` (`single` | `group`)
- `source TEXT NOT NULL` (`system` | `user`)
- `content_json TEXT NOT NULL`
- `tags_json TEXT NOT NULL DEFAULT '[]'`
- `use_count INTEGER NOT NULL DEFAULT 0`
- `pinned INTEGER NOT NULL DEFAULT 0`
- `created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`

#### `preset_assets`
- `id TEXT PRIMARY KEY`（sha256）
- `mime_type TEXT NOT NULL`
- `data_blob BLOB NOT NULL`
- `byte_size INTEGER NOT NULL`
- `created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`

#### `preset_asset_refs`
- `preset_id INTEGER NOT NULL`
- `asset_id TEXT NOT NULL`
- `PRIMARY KEY (preset_id, asset_id)`
- 外键指向 `element_presets(id)` 与 `preset_assets(id)`

### 5.2 content_json 结构

```json
{
  "version": 1,
  "elements": [
    {
      "id": "text-...",
      "type": "text",
      "name": "产品名",
      "xMm": 2,
      "yMm": 2,
      "widthMm": 30,
      "heightMm": 6,
      "rotation": 0,
      "binding": { "mode": "column", "column": "name" },
      "textStyle": { "fontFamily": "Microsoft YaHei", "fontSize": 4.5, "fontWeight": 700, "italic": false, "underline": false, "align": "left", "color": "#000000", "letterSpacing": 0, "lineHeight": 1.2 }
    }
  ],
  "anchor": { "xMm": 2, "yMm": 2 },
  "meta": { "widthMm": 36, "heightMm": 20 }
}
```

图片处理策略：
- 入库时：`data:image/...` 转为 `asset://<sha256>`
- 读取时：按 asset 引用还原 data URL 供前端渲染

## 6. 关键算法

### 6.1 组合块锚点

保存组合时计算：
- `anchor.xMm = min(elements[].xMm)`
- `anchor.yMm = min(elements[].yMm)`
- 并将元素坐标存为相对坐标（减少插入误差）

插入时：
- 落点坐标 + 相对偏移 = 新元素坐标
- 最终统一做边界校正

### 6.2 图片去重

- 对图片字节流计算 sha256
- `preset_assets.id = sha256`
- 已存在则仅新增引用，不重复存储

### 6.3 推荐排序

评分函数：
- `score = pinnedBoost + recencyScore + useCountScore`
- `pinnedBoost` 为固定高权重
- `recencyScore` 基于最近使用时间衰减
- `useCountScore` 基于对数增长，防止头部固化

## 7. 导入导出协议

### 7.1 导出格式

文件：`element-preset-bundle.json`

结构：

```json
{
  "format": "label-print-element-presets",
  "version": 1,
  "presets": [
    {
      "name": "食品营养成分表",
      "description": "常用食品标签块",
      "kind": "group",
      "source": "user",
      "tags": ["food"],
      "content": {"version": 1, "elements": [], "anchor": {"xMm": 0, "yMm": 0}, "meta": {"widthMm": 0, "heightMm": 0}}
    }
  ],
  "assets": [
    {
      "id": "sha256...",
      "mimeType": "image/png",
      "dataBase64": "..."
    }
  ]
}
```

### 7.2 导入策略

- 同名同内容：跳过
- 同名不同内容：重命名（追加“(导入)”）
- 数据非法：跳过并上报统计
- 最终返回：成功数 / 跳过数 / 冲突重命名数 / 失败数

## 8. 错误处理

- DB 锁冲突：返回可重试提示
- 资源缺失：条目可见但标记“资源缺失”，禁止插入并可修复导入
- 大图风险：超过阈值提示用户（可选自动压缩）
- 绑定字段不存在：插入不失败，右侧面板提示“列未命中”

## 9. 测试策略

### 9.1 Rust 层

- repo CRUD
- 图片去重与引用关系
- 导入导出协议一致性
- 系统预置 seed 幂等性

### 9.2 前端单测

- 右键保存入口可见性
- 单元素/组合保存正确性
- 列表插入行为（点击/拖拽）
- 推荐排序逻辑
- 导入冲突重命名

### 9.3 E2E

- 保存 -> 列表出现 -> 插入 -> 可编辑 -> 导出 -> 导入 -> 再插入
- 包含图片资源的食品标签块全链路验证

## 10. 迭代计划

### Phase 1（MVP）
- 数据库 + IPC + 基础列表 + 单击插入 + 右键保存

### Phase 2
- 拖拽插入 + 推荐区 + 条目管理菜单

### Phase 3
- 系统预置（食品/服装/仓储）+ 导入导出（含图片）

### Phase 4
- 性能优化（大图、缓存、批量操作）+ 可观测性

## 11. 兼容性与迁移

- 不破坏现有模板文件格式（`.lpt` / `.json`）
- 元素预设是独立能力层，不改变当前模板保存/打开主链路
- 迁移脚本向后兼容，旧数据库可自动升级

## 12. 成功标准

以下指标达到即视为功能达标：

- 用户可在 10 秒内完成“选中 -> 右键保存 -> 左侧插入复用”
- 包含图片的预设导入导出后可完整渲染
- 连续 200 次插入操作无崩溃、无 ID 冲突
- 推荐区命中率在常用场景中显著高于时间倒序列表

---

该设计与用户确认一致：
- 双保存入口
- 双保存粒度
- 双插入方式
- 单列表管理
- 保留绑定
- 本机 + 导入导出
- 可处理食品标签类图片资源
