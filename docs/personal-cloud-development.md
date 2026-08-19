# 个人云空间开发文档

状态：设计基线（实时实现状态见 [文档导航与第一版功能状态](README.md)）

适用版本：桌面端 v0.1.4 之后

最后更新：2026-08-07

## 1. 文档目标

本文档定义标签打印软件从单机模式升级到“账号 + 个人云空间”模式的开发方案。

本阶段只实现个人空间，不实现公司、团队、成员、共享、协作和角色权限。

本阶段产品只包含两个运行端：

- Windows PC 桌面端：现有 Tauri + React 应用。
- 云服务器端：提供账号、标签、配额、资源和官方模板 API。

当前不开发 Android、iOS、微信小程序或其他移动端，也不要求标签编辑器适配移动设备。

已确定的产品规则：

- 用户需要注册、登录后使用个人云空间。
- 标签默认从个人云空间打开并保存到个人云空间。
- 免费用户最多保存 50 个标签。
- 付费用户最多保存 200 个标签。
- 不限制用户云空间总容量，不展示容量用量。
- “标签数量”指保存的标签设计文档数量，不包含打印次数、打印任务和导入数据行数。
- 不开发本地数据自动迁移功能，现有标签由当前用户手动打开并保存到云端。
- 继续保留 `.lpt` 文件的本地导入和导出能力。
- 继续保留本地打印能力，打印不经过云服务器。
- 部分官方模板仅付费用户可以使用。

## 2. 非目标

本阶段明确不实现：

- 公司或团队工作区。
- 用户之间共享标签。
- 多人实时协作。
- 管理员、编辑者、只读成员等角色。
- 标签公开链接。
- 本地 SQLite、localStorage 或磁盘文件的自动扫描和批量迁移。
- 按存储容量计费或限制。
- 云端打印和远程打印机管理。
- Android 和 iOS 客户端。
- 微信小程序和其他移动端应用。
- 移动端标签查看、编辑或打印。
- 浏览器版标签编辑器。

## 3. 当前实现概况

当前项目存在三类本地数据入口：

1. 主保存流程将 `TemplateSnapshot` 打包为 `.lpt` 并写入本地文件。
2. 本地 SQLite 的 `templates` 表保存名称和 JSON 内容。
3. 首页“最近使用”通过 localStorage 保存标签快照。

云端改造后应统一为一套领域接口，避免页面继续直接区分 SQLite、localStorage、本地文件和云 API。

建议新增：

```ts
interface LabelRepository {
  list(input: ListLabelsInput): Promise<LabelListResult>;
  get(id: string): Promise<CloudLabelDocument>;
  create(input: CreateLabelInput): Promise<CloudLabelDocument>;
  update(id: string, input: UpdateLabelInput): Promise<CloudLabelDocument>;
  rename(id: string, name: string): Promise<CloudLabelDocument>;
  moveToTrash(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  permanentlyDelete(id: string): Promise<void>;
}
```

正式运行时使用 `CloudLabelRepository`。本地 SQLite 不再作为标签事实来源，仅作为云标签缓存、离线副本和待同步队列。

## 4. 总体架构

```text
React 编辑器
    │
    ├── LabelRepository
    │      ├── 云 API
    │      └── 本地 SQLite 缓存 / 同步队列
    │
    ├── 本地打印（Tauri / Rust）
    │
    └── .lpt 导入与导出

云 API
    ├── 认证服务
    ├── 标签服务
    ├── 套餐与配额服务
    ├── 官方模板服务
    ├── PC 版本与更新服务
    ├── PostgreSQL
    └── 对象存储（标签图片、模板图片、预览图和 PC 更新包）
```

基本原则：

- PostgreSQL 保存用户、标签元数据和标签 JSON。
- 对象存储保存图片等二进制资源。
- 桌面端保存本地缓存，断网时仍可打开已经缓存的标签并打印。
- 云端是登录用户标签的最终事实来源。
- 服务端根据登录身份确定 `user_id`，客户端不得指定或覆盖数据所属用户。

### 4.1 PC 桌面端职责

PC 端继续使用现有 Tauri + React 技术栈，负责：

- 注册、登录、退出和登录状态维护。
- 个人云标签列表和回收站界面。
- 标签创建、编辑、预览和打印。
- `.lpt`、JSON 和 DDL 等本地文件导入。
- `.lpt` 和 JSON 导出。
- 系统打印机读取、打印任务提交和打印日志。
- 本机打印机选择、校准参数和默认份数。
- 云标签 SQLite 缓存和离线同步队列。
- 图片上传前处理以及云端资源下载缓存。
- 套餐、标签使用数量和付费模板状态展示。

PC 端不得负责：

- 最终判断用户套餐和标签上限。
- 最终判断付费模板权限。
- 生成可信订单或自行修改套餐状态。
- 读取其他用户的标签。

### 4.2 云服务器端职责

服务器端负责：

- 用户注册、登录、密码重置、Token 签发和撤销。
- 用户资料和套餐状态。
- 个人云标签 CRUD、回收站和永久删除。
- 免费 50 个、付费 200 个标签的强制限制。
- 标签 JSON schema 校验和 revision 并发控制。
- 图片资源上传授权、归属验证和引用管理。
- 官方模板目录、预览和付费权限校验。
- 订单或订阅结果同步。
- PC 版本检查、灰度发布、更新说明和更新包分发。
- 数据库、对象存储、日志、监控和备份。

服务器端不负责：

- 枚举用户电脑上的打印机。
- 保存具体电脑的打印机名称和校准值。
- 生成 Windows 本地打印任务。
- 远程控制用户电脑打印。
- 解析或保存用户导入的批量打印业务数据，除非未来单独立项。

### 4.3 部署拓扑

```text
Windows PC 桌面端
  ├── React 标签编辑器
  ├── Tauri / Rust 本地能力
  ├── SQLite 缓存
  └── HTTPS API Client
            │
            ▼
云服务器
  ├── REST API / Auth
  ├── 标签与套餐业务服务
  ├── PostgreSQL
  └── 对象存储
```

PC 端只通过 HTTPS API 和签名资源地址访问服务器。PostgreSQL、对象存储管理密钥和支付密钥不得进入桌面安装包。

### 4.4 推荐仓库结构

当前仓库可以继续采用 monorepo，并增加服务器应用和共享协议包：

```text
apps/
  desktop/              # 现有 Windows Tauri + React 客户端
  server/               # 新增云 API 服务
packages/
  template-schema/      # 云标签和 .lpt 的 schema、迁移逻辑
  api-contract/         # 请求、响应、错误码等共享 TypeScript 类型
  data-import/          # 现有 PC 端数据导入能力
docs/
  personal-cloud-development.md
```

`api-contract` 只能包含可公开到客户端的协议类型，不得包含数据库连接、服务端密钥或支付密钥。

如果服务器最终不是 TypeScript 实现，也应以 OpenAPI 作为接口契约来源，为 PC 端生成类型，避免手工维护两套不一致的接口定义。

## 5. 云端标签保存格式

### 5.1 结论

云端标签采用“JSON 文档 + 独立资源文件”的形式保存：

- 标签主体：版本化 JSON，保存到 PostgreSQL `JSONB` 字段。
- 图片资源：保存到对象存储。
- 标签元素通过 `asset://<asset-id>` 引用图片。
- `.lpt` 只作为本地导入、导出和人工备份格式，不作为云端主存储格式。

不建议直接把 `.lpt` 二进制整体保存到云端，原因是：

- 无法方便地验证和升级标签结构。
- 每次修改文字都需要重新上传完整文件。
- 图片会被反复上传。
- 服务端无法可靠读取版本、画布尺寸和资源引用。

不建议把图片 Base64 直接写入 JSONB，原因是：

- Base64 会增大数据体积。
- 普通文本修改也会导致整份大 JSON 传输。
- 数据库备份和查询负担更重。

### 5.2 云端文档结构

建议新增独立的云文档协议，不直接保存当前完整 `TemplateSnapshot`：

```ts
export type CloudLabelContentV1 = {
  format: "label-print-cloud-document";
  version: 1;
  unit: "mm";
  canvas: {
    widthMm: number;
    heightMm: number;
  };
  elements: EditorElement[];
};
```

JSON 示例：

```json
{
  "format": "label-print-cloud-document",
  "version": 1,
  "unit": "mm",
  "canvas": {
    "widthMm": 60,
    "heightMm": 40
  },
  "elements": [
    {
      "id": "text-1",
      "type": "text",
      "name": "商品名称",
      "xMm": 3,
      "yMm": 3,
      "widthMm": 30,
      "heightMm": 6,
      "rotation": 0,
      "binding": {
        "mode": "fixed",
        "fixedValue": "示例商品"
      },
      "textStyle": {
        "fontFamily": "微软雅黑",
        "fontSize": 4,
        "fontWeight": 400,
        "italic": false,
        "underline": false,
        "align": "left",
        "color": "#000000",
        "letterSpacing": 0,
        "lineHeight": 1.2
      }
    },
    {
      "id": "image-1",
      "type": "image",
      "name": "商品图片",
      "xMm": 38,
      "yMm": 3,
      "widthMm": 18,
      "heightMm": 18,
      "rotation": 0,
      "binding": {
        "mode": "fixed",
        "fixedValue": "asset://550e8400-e29b-41d4-a716-446655440000"
      },
      "textStyle": {
        "fontFamily": "微软雅黑",
        "fontSize": 4,
        "fontWeight": 400,
        "italic": false,
        "underline": false,
        "align": "left",
        "color": "#000000",
        "letterSpacing": 0,
        "lineHeight": 1.2
      }
    }
  ]
}
```

标签名称不放入 `content`，由数据库独立字段保存。这样重命名不需要改写整个 JSON。

以下数据不得放入云标签内容：

- 本机打印机 ID 或打印机名称。
- 打印机校准偏移。
- 打印机缩放校准。
- 当前打印份数。
- 当前选中的元素。
- 撤销、重做栈。
- 当前打开的编辑器标签页状态。

打印机、校准参数属于设备设置，应继续保存在本机。默认打印份数可保存在本机用户偏好中。

### 5.3 文档版本规则

`format` 用于识别文档类型，`version` 用于结构迁移。

读取流程：

```text
读取 JSON
  → 校验 format
  → 根据 version 执行迁移
  → 运行 schema 校验
  → 转换为编辑器内存模型
```

要求：

- 服务端保存前必须校验文档结构。
- 客户端打开前必须再次校验。
- 新版本客户端必须能够读取已发布的旧版本文档。
- 不允许客户端直接覆盖一个高于自身支持版本的文档。
- `packages/template-schema` 应扩展为云文档 schema 和迁移逻辑的唯一来源。

建议提供：

```ts
parseCloudLabelContent(input: unknown): CloudLabelContent;
migrateCloudLabelContent(input: unknown): CloudLabelContentV1;
toCloudLabelContent(snapshot: TemplateSnapshot): CloudLabelContentV1;
toTemplateSnapshot(content: CloudLabelContentV1, deviceSettings: DeviceSettings): TemplateSnapshot;
```

### 5.4 图片资源格式

当前 `.lpt` 打包逻辑已经使用 `asset://` 引用，并将 Data URL 拆分为资源列表。云端可以沿用相同思想，但资源本体上传到对象存储。

资源记录至少包含：

```ts
type LabelAsset = {
  id: string;
  userId: string;
  mimeType: string;
  kind: "image" | "icon";
  sha256: string;
  byteSize: number;
  state: "initiated" | "completed" | "deleted";
  createdAt: string;
  completedAt: string | null;
  deletedAt: string | null;
};
```

`objectKey` 是对象存储内部实现细节，只保存在服务端数据库中；客户端只接收资源 ID、元数据和短期签名 URL。

上传流程：

1. 客户端计算文件 SHA-256。
2. 请求创建资源或复用当前用户已有的相同资源。
3. 客户端上传到对象存储。
4. 服务端确认上传完成。
5. 标签 JSON 使用服务端返回的资源 ID。

虽然产品不限制用户总空间，仍应配置单文件大小、支持的 MIME 类型和单次请求大小等技术安全限制。这些限制用于防止异常文件和接口滥用，不作为套餐容量限制展示。

## 6. 数据库设计

以下为逻辑模型，具体 SQL 可根据最终后端框架调整。

### 6.1 用户资料

认证账号可由独立认证服务管理，业务库保存必要资料：

```sql
CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY,
  display_name TEXT,
  plan_code TEXT NOT NULL DEFAULT 'free',
  plan_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (plan_code IN ('free', 'pro'))
);
```

最终套餐状态必须由服务端订单或订阅状态决定，客户端提交的 `plan_code` 不可信。

### 6.2 标签文档

```sql
CREATE TABLE label_documents (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  content JSONB NOT NULL,
  revision BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  last_opened_at TIMESTAMPTZ
);

CREATE INDEX label_documents_user_updated_idx
  ON label_documents (user_id, updated_at DESC);

CREATE INDEX label_documents_user_deleted_idx
  ON label_documents (user_id, deleted_at);
```

说明：

- 标签使用 UUID，不使用本地 SQLite 自增 ID。
- 标签名称不要求唯一，以 ID 区分文档。
- `revision` 每次成功保存加一，用于检测多设备冲突。
- `deleted_at` 非空表示标签位于回收站。
- 所有查询都必须同时包含当前认证用户的 `user_id`。

### 6.3 标签资源

```sql
CREATE TABLE label_assets (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  mime_type TEXT NOT NULL,
  kind TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL,
  byte_size BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (kind IN ('image', 'icon'))
);

CREATE INDEX label_assets_user_hash_idx
  ON label_assets (user_id, sha256);
```

还需要维护标签与资源的引用关系，避免删除仍被其他标签使用的图片：

```sql
CREATE TABLE label_document_assets (
  label_id UUID NOT NULL,
  asset_id UUID NOT NULL,
  PRIMARY KEY (label_id, asset_id)
);
```

### 6.4 官方模板

```sql
CREATE TABLE official_templates (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  required_plan TEXT NOT NULL DEFAULT 'free',
  schema_version INTEGER NOT NULL,
  content JSONB NOT NULL,
  preview_object_key TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (required_plan IN ('free', 'pro'))
);
```

付费模板的完整 `content` 不得编译进桌面安装包。客户端可以获取目录和预览，获取完整内容时由服务端检查套餐。

## 7. 标签数量规则

### 7.1 套餐限制

```ts
const PLAN_LABEL_LIMITS = {
  free: 50,
  pro: 200,
} as const;
```

计数范围：

- 正常标签计入数量。
- 回收站标签仍计入数量。
- 永久删除后才释放数量。
- 官方模板本身不计入数量。
- 从官方模板创建用户标签后，创建出的标签计入数量。
- 本地 `.lpt` 文件不计入云端数量。
- 打印任务、打印记录和导入数据行不计入数量。

### 7.2 超额行为

用户套餐从付费降为免费且已有标签超过 50 个时：

- 允许登录。
- 允许查看、打开、编辑和保存已有标签。
- 允许打印、导出、删除已有标签。
- 禁止新建、复制和从模板创建新标签。
- 当永久删除至 50 个以下后恢复创建能力。
- 不自动删除任何标签。

只限制“标签数量增长”，不限制已有标签的正常使用。

### 7.3 并发创建

数量检查必须由服务端在事务中完成，防止多个设备同时创建导致超过限制。

伪代码：

```text
BEGIN
  锁定当前用户的配额记录或使用用户级事务锁
  读取套餐上限
  统计未永久删除的标签数量
  如果数量 >= 上限，返回 LABEL_LIMIT_REACHED
  创建标签
COMMIT
```

## 8. API 设计

API 路径统一使用 `/api/v1`。下面只定义业务语义，不限定具体后端语言。

### 8.1 账号与会话

```text
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
POST   /api/v1/auth/password/forgot
POST   /api/v1/auth/password/reset
GET    /api/v1/me
```

`GET /me` 返回：

```json
{
  "id": "用户 UUID",
  "displayName": "用户名称",
  "plan": "free",
  "planExpiresAt": null,
  "labelUsage": {
    "used": 12,
    "limit": 50,
    "canCreate": true
  }
}
```

不返回容量使用情况。

### 8.2 标签

```text
GET    /api/v1/labels
POST   /api/v1/labels
GET    /api/v1/labels/{id}
PUT    /api/v1/labels/{id}
PATCH  /api/v1/labels/{id}/name
POST   /api/v1/labels/{id}/duplicate
DELETE /api/v1/labels/{id}
POST   /api/v1/labels/{id}/restore
DELETE /api/v1/labels/{id}/permanent
```

列表参数建议支持：

```text
?query=食品
&status=active|trash
&sort=updated_desc|updated_asc|name_asc|name_desc
&cursor=...
&limit=50
```

创建请求：

```json
{
  "name": "食品标签",
  "content": {
    "format": "label-print-cloud-document",
    "version": 1,
    "unit": "mm",
    "canvas": {
      "widthMm": 60,
      "heightMm": 40
    },
    "elements": []
  }
}
```

更新请求必须携带客户端打开时获得的修订号：

```json
{
  "expectedRevision": 7,
  "content": {
    "format": "label-print-cloud-document",
    "version": 1,
    "unit": "mm",
    "canvas": {
      "widthMm": 60,
      "heightMm": 40
    },
    "elements": []
  }
}
```

成功后返回新的 `revision`。如果云端修订号已经变化，返回 HTTP 409 和 `REVISION_CONFLICT`，不得静默覆盖。

### 8.3 资源

```text
POST   /api/v1/assets/initiate
POST   /api/v1/assets/{id}/complete
GET    /api/v1/assets/{id}
DELETE /api/v1/assets/{id}
```

下载地址应为短期有效的签名地址，或者由需要鉴权的资源接口转发。不得生成永久公开图片地址。

### 8.4 官方模板

```text
GET /api/v1/official-templates
GET /api/v1/official-templates/{id}
POST /api/v1/official-templates/{id}/create-label
```

列表接口可以向所有登录用户返回名称、分类、所需套餐和预览图。详情或创建接口必须检查付费权限。

## 9. 客户端交互

### 9.1 未登录状态

- 可以打开本地 `.lpt` 文件。
- 可以编辑、打印和导出本地文件。
- 点击“保存到云端”“云空间”或付费模板时进入登录页。
- 不自动上传任何本地数据。

### 9.2 登录后首页

首页主要区域改为“我的标签”：

- 搜索框。
- 新建标签。
- 打开本地文件。
- 标签卡片列表。
- 标签数量 `已使用 12 / 50`。
- 套餐入口。
- 回收站入口。
- 账号菜单和退出登录。

“最近使用”可以作为筛选或排序，不再在 localStorage 中保存完整标签快照。

### 9.3 保存行为

新建标签第一次保存：

1. 校验登录状态。
2. 上传未上传的图片资源。
3. 调用创建标签接口。
4. 获得云标签 ID 和 revision。
5. 更新编辑器文档元数据。
6. 写入本地 SQLite 缓存。

已有云标签保存：

1. 先写入本地缓存并显示“正在同步”。
2. 上传新增资源。
3. 使用 `expectedRevision` 更新云端。
4. 成功后显示“已同步”。
5. 断网时进入同步队列，显示“离线，等待同步”。
6. revision 冲突时保留本地内容，提示用户覆盖云端、放弃本地修改或另存为新标签。

第一版可以保留显式保存按钮和 `Ctrl+S`，不必立即实现高频自动保存。可以在切换标签页、关闭标签页和退出程序前提示未同步状态。

### 9.4 打开行为

```text
用户点击标签
  → 优先请求云端最新 metadata/revision
  → 网络正常：读取云端内容并更新缓存
  → 网络不可用：如果存在本地缓存，则打开缓存并标记离线
  → 没有缓存：提示需要联网后打开
```

下载图片资源后转换为编辑器当前使用的 Data URL，或新增资源 URL 加载层。编辑器保存回云端时再转换为 `asset://<id>`。

### 9.5 手动迁移现有文件

不开发自动迁移界面。人工流程为：

1. 登录账号。
2. 使用“打开本地文件”打开现有 `.lpt`。
3. 点击“保存到云端”。
4. 创建新的云标签。
5. 原 `.lpt` 文件保持不变。

## 10. 本地缓存设计

建议新增本地表：

```sql
CREATE TABLE cloud_label_cache (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  revision INTEGER NOT NULL,
  sync_status TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_synced_at TEXT
);

CREATE TABLE cloud_sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  label_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload TEXT NOT NULL,
  expected_revision INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  created_at TEXT NOT NULL
);
```

`sync_status`：

- `synced`
- `pending`
- `syncing`
- `conflict`
- `failed`

缓存必须按 `user_id` 隔离。退出登录后不得向其他登录用户展示前一个账号的缓存。是否在退出时清理缓存可以作为本机设置，但默认应隐藏并停止同步。

网络或服务暂时不可用时，同步队列应根据 `attempts` 写入指数退避后的 `next_attempt_at`，避免持续重试；桌面端在恢复网络、重新获得窗口焦点和定时检查时尝试到期的操作。revision 冲突不自动重试，必须由用户选择处理方式。

## 11. 认证与安全

最低要求：

- 所有云 API 使用 HTTPS。
- Access Token 短期有效，Refresh Token 支持轮换和撤销。
- 桌面端凭证保存到 Windows 系统凭据存储，不保存到普通 localStorage。
- 服务端从 Token 获取用户身份，不接受请求体中的 `user_id`。
- 每次读取、修改和删除标签都校验标签归属于当前用户。
- 登录、注册、忘记密码和资源上传接口需要限流。
- 密码重置成功后撤销该账号的全部刷新会话，并使其他未使用的重置码失效。
- 标签 JSON 和资源 MIME 类型必须在服务端校验。
- 日志不得记录密码、Token、完整标签内容和用户上传的图片数据。
- 数据库和对象存储需要定期备份，并实际验证恢复流程。
- 已提供账号注销入口：立即冻结账号并撤销会话，数据在 14 天宽限期后由维护任务物理删除。

## 12. 错误码

建议客户端按稳定业务错误码显示中文信息，不直接显示服务端异常文本。

| HTTP | 错误码 | 客户端行为 |
| --- | --- | --- |
| 400 | `INVALID_LABEL_CONTENT` | 提示标签内容异常，不覆盖现有数据 |
| 401 | `AUTH_REQUIRED` | 尝试刷新 Token，失败后进入登录页 |
| 403 | `PLAN_REQUIRED` | 打开套餐说明 |
| 404 | `LABEL_NOT_FOUND` | 从列表移除失效记录 |
| 409 | `REVISION_CONFLICT` | 打开冲突处理界面 |
| 409 | `LABEL_LIMIT_REACHED` | 显示已使用数量和套餐入口 |
| 413 | `ASSET_TOO_LARGE` | 提示压缩或更换图片 |
| 422 | `UNSUPPORTED_DOCUMENT_VERSION` | 提示升级客户端 |
| 429 | `RATE_LIMITED` | 稍后自动重试 |
| 503 | `SERVICE_UNAVAILABLE` | 保存到本地队列，等待同步 |

## 13. 付费模板规则

- `free` 用户只能获取免费模板完整内容。
- `pro` 用户可以获取免费和付费模板。
- 套餐检查由服务端完成。
- 套餐到期后，已经从付费模板创建的个人标签继续允许打开、编辑、打印和保存。
- 套餐到期后不能再次获取新的付费模板或从其创建新标签。
- 模板内容复制到个人标签后，个人标签不再依赖模板在线存在。
- 当前编译在 `industry-templates.ts` 中的付费模板内容需要迁移到服务端；免费模板可继续内置以支持离线试用。

## 14. 开发阶段

### 阶段零：服务器骨架和 PC 自动更新

- 建立 `apps/server`、基础配置和发布环境。
- 建立更新产物对象存储或 CDN。
- 接入 Tauri 2 官方 updater。
- 实现动态版本检查 API、签名发布和更新进度界面。
- 建立 beta、stable 发布通道和停止下发能力。

验收条件：

- 当前 PC 版本可以发现、下载、验签和安装测试版本。
- 服务器可以停止下发有问题的版本。
- 更新过程不丢失未同步标签，也不打断正在执行的打印任务。

### 阶段一：统一领域模型

- 新增 `CloudLabelContentV1` schema。
- 实现 `TemplateSnapshot` 与云文档之间的转换。
- 将打印机和校准参数从云标签内容中分离。
- 新增 `LabelRepository`，页面不再直接调用本地模板 IPC。
- 保持现有 `.lpt` 导入导出兼容。

验收条件：

- 同一标签经过“编辑器 → 云 JSON → 编辑器”转换后，画布和元素内容一致。
- 图片能够转换为资源引用并恢复显示。
- 打印机和校准参数不出现在云 JSON 中。

### 阶段二：账号和云 CRUD

- 注册、登录、刷新 Token、退出登录、重置密码。
- 标签列表、创建、打开、更新、重命名、删除和回收站。
- 首页改为“我的标签”。
- 实现 50/200 数量限制。

验收条件：

- 用户之间无法读取或修改彼此标签。
- 第 50 个免费标签可以创建，第 51 个被服务端拒绝。
- 第 200 个付费标签可以创建，第 201 个被服务端拒绝。
- 永久删除后可以再次创建。

### 阶段三：缓存和同步

- SQLite 云标签缓存。
- 离线保存队列。
- revision 冲突检测。
- 同步状态展示和重试。
- 多账号缓存隔离。

验收条件：

- 已打开过的标签断网后可以打开和打印。
- 断网修改不会丢失，恢复网络后可以同步。
- 两台设备同时修改时不会静默覆盖。

### 阶段四：套餐和官方模板

- 套餐状态接口。
- 付费模板目录、预览和权限检查。
- 订阅成功、续费、到期和退款状态同步。
- 超额降级行为。

验收条件：

- 免费用户无法通过直接调用 API 获取付费模板内容。
- 付费到期不影响已创建标签的编辑和打印。
- 客户端显示的套餐状态与服务端一致。

## 15. 测试范围

### 单元测试

- 云文档 schema 校验和版本迁移。
- `TemplateSnapshot` 双向转换。
- 资源引用提取和恢复。
- 套餐数量判断。
- revision 冲突处理。

### API 集成测试

- 跨用户访问隔离。
- 并发创建数量限制。
- 并发更新冲突。
- 回收站计数和永久删除。
- 付费模板权限。
- Token 过期和刷新。

### 桌面端测试

- 登录与退出。
- 自动更新检查、下载、验签、安装失败恢复和停止下发。
- 云标签完整 CRUD。
- 本地 `.lpt` 手动上传为云标签。
- 断网打开、保存和恢复同步。
- 图片标签上传、下载、导出和打印。
- 不同电脑使用各自打印机和校准参数。

## 16. 上线前检查

- 数据库和对象存储备份已启用。
- 已完成一次从备份恢复的演练。
- API 有版本号并支持旧客户端兼容窗口。
- 客户端能识别最低支持版本并提示升级。
- 服务端配额检查不存在仅依赖客户端的路径。
- 付费模板内容未包含在免费客户端安装包中。
- 日志和监控能发现登录失败率、保存失败率、同步失败率和资源上传失败率。
- 隐私政策、用户协议和账号注销入口已准备。
- 服务异常时，本地编辑和打印仍可使用。

## 17. PC 自动更新服务

### 17.1 实施决策

自动更新需要现在纳入架构，并在个人云空间正式对外使用前完成；但它应作为独立模块开发，不和账号、标签 CRUD 写在同一组业务代码中。

推荐顺序：

1. 建立服务器基础工程和发布文件存储。
2. 先接入 Tauri 官方更新器，让后续 PC 版本能够自动下发。
3. 再逐步上线账号、云标签、套餐和付费模板。
4. 收集真实更新包大小和下载数据后，再决定是否开发差分更新。

如果等所有云功能完成后才增加更新器，首批安装云版本的电脑仍需要人工升级，而且上线后的紧急修复也难以及时分发。

### 17.2 第一版采用 Tauri 官方更新器

PC 端使用 Tauri 2 官方 updater 插件：

- Rust：`tauri-plugin-updater`
- 前端：`@tauri-apps/plugin-updater`
- 配置：`bundle.createUpdaterArtifacts = true`
- 更新源：自建动态更新 API
- 更新文件：对象存储或 CDN
- 安装模式：Windows `passive`
- 更新包必须使用 Tauri 更新签名密钥签名

官方更新器的标准协议按完整更新产物下载。当前官方协议只返回一个更新包 URL 和对应签名，没有提供内置的 Windows 二进制差分包协议。因此第一版不开发自定义差分更新器。

当前项目生成的 MSI 大约 206 MB，而主程序可执行文件大约 15 MB。主要体积来自 `tauri.conf.json` 中的 `offlineInstaller`：它把 WebView2 离线安装程序放入安装包。Tauri 的 updater 产物使用 `downloadBootstrapper` 方式处理 WebView2，不需要在每次应用更新中重复携带完整的离线 WebView2 安装程序。

第一版落地后必须实际记录以下指标，不能仅根据 MSI 大小判断：

- updater 产物的最终字节数。
- 平均下载耗时。
- 下载成功率和安装成功率。
- 每月更新流量。
- 用户取消或失败的主要原因。

如果 updater 产物已经足够小，就没有必要承担自定义差分更新的安全和维护成本。

### 17.3 初始安装包与更新包分开

建议保留两个用途：

- 默认公开安装包和在线更新包：使用 `downloadBootstrapper`，不再内置 WebView2 离线安装程序。电脑已有 WebView2 时不会重复下载；缺少时由安装程序联网获取运行时。
- 如未来确有完全断网的部署需求，再单独构建并标注为“离线专用”的安装包；它不作为默认发布包。

公开下载页也可以另外提供较小的在线安装包。在线安装包使用 `downloadBootstrapper`，只在电脑缺少 WebView2 时下载运行时。

不建议把 `webviewInstallMode` 直接设置为 `skip`，因为缺少 WebView2 的电脑会无法启动应用。

### 17.4 更新检查 API

建议提供一个公开但限流的动态更新接口：

```text
GET /api/v1/desktop-updates/{target}/{arch}/{currentVersion}
```

示例：

```text
GET /api/v1/desktop-updates/windows/x86_64/0.1.3
```

没有可用更新时返回：

```text
HTTP 204 No Content
```

存在更新时返回 Tauri updater 兼容响应：

```json
{
  "version": "0.2.0",
  "pub_date": "2026-08-04T10:00:00Z",
  "url": "https://download.example.com/desktop/stable/0.2.0/windows-x86_64/update.exe",
  "signature": "Tauri 生成的更新签名内容",
  "notes": "新增个人云空间和自动更新功能"
}
```

更新检查接口不应返回对象存储管理密钥。更新 URL 可以是 CDN 地址或短期签名地址。

### 17.5 发布记录

建议新增服务器表：

```sql
CREATE TABLE desktop_releases (
  id UUID PRIMARY KEY,
  version TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'stable',
  target TEXT NOT NULL,
  arch TEXT NOT NULL,
  artifact_url TEXT NOT NULL,
  artifact_signature TEXT NOT NULL,
  artifact_sha256 TEXT NOT NULL,
  artifact_size BIGINT NOT NULL,
  release_notes TEXT NOT NULL DEFAULT '',
  minimum_supported_version TEXT,
  mandatory BOOLEAN NOT NULL DEFAULT FALSE,
  rollout_percent INTEGER NOT NULL DEFAULT 100,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (version, channel, target, arch),
  CHECK (channel IN ('stable', 'beta')),
  CHECK (rollout_percent BETWEEN 0 AND 100)
);
```

版本号必须遵循 SemVer，例如 `0.2.0`、`0.2.1`，不能继续发布同一个版本号但替换文件。

### 17.6 PC 端更新体验

建议检查时机：

- 程序启动完成后延迟检查，不阻塞首页打开。
- 程序持续运行时定期检查。
- “设置 / 关于”提供手动检查入口。
- 一次启动期间避免重复弹窗。

普通更新流程：

```text
发现新版本
  → 展示版本号、更新说明和下载大小
  → 用户确认下载
  → 展示下载进度
  → 验证签名
  → 等待当前打印任务结束
  → 检查所有标签已保存到本地缓存
  → 提示立即安装并重启或稍后处理
```

不得在以下情况直接关闭程序安装：

- 正在打印。
- 标签存在尚未写入本地缓存的修改。
- 正在导入或导出文件。
- 正在上传标签资源。

强制更新只用于严重安全问题或旧客户端已经不兼容云 API 的情况。即使云功能因版本过旧被限制，也应尽量保留本地文件打开、导出和打印能力。

### 17.7 签名和密钥

自动更新至少涉及两类签名：

1. Tauri updater 签名：更新器强制验证，用于确认更新包未被篡改。
2. Windows 代码签名：用于提升安装包发布者可信度并减少 SmartScreen 警告。

要求：

- Tauri 更新私钥只存放在 CI/CD 密钥系统和离线备份中。
- 私钥不得提交到 Git、写入桌面安装包或放在普通服务器配置文件中。
- Tauri 公钥编译到桌面端配置。
- 私钥丢失会导致已安装客户端无法验证以后发布的更新，因此必须安全备份。
- 发布流水线必须在上传前完成构建、测试、签名和 SHA-256 计算。
- 更新服务只发布已经签名的产物。
- Windows 代码签名证书和 Tauri updater 密钥应分别管理。

### 17.8 灰度发布和回退

建议发布过程：

1. 先发布到 `beta` 通道供内部电脑验证。
2. `stable` 通道按小比例灰度。
3. 观察启动、下载、安装、云同步和打印错误。
4. 逐步扩大到全部用户。

发现严重问题时：

- 立即将有问题版本的 `rollout_percent` 调为 0。
- 不再向新设备返回该版本。
- 修复代码后发布更高的补丁版本，例如从 `0.2.0` 发布 `0.2.1`。
- 默认不通过降级版本号完成回退，避免数据结构向后不兼容。

### 17.9 增量更新的后续方案

只有在正式数据证明完整 updater 产物仍然过大时，才单独立项开发增量更新。

增量更新不能简单地只替换前端 JS 文件。PC 应用还包含 Rust 可执行文件、资源、安装信息和可能的数据迁移，直接覆盖容易造成程序无法启动或版本不一致。

自定义增量更新至少需要：

- 对每个受支持旧版本生成到新版本的差分包。
- 差分清单包含源版本、目标版本、补丁哈希和重建后完整文件哈希。
- 差分包自身签名。
- 在独立 updater helper 进程中停止主程序并原子替换文件。
- 更新失败自动恢复旧版本。
- 差分失败后自动回退到官方完整更新包。
- 处理杀毒软件占用、磁盘空间不足、断电和文件损坏。
- 保留若干旧版本产物用于生成差分包。

建议的差分响应扩展：

```json
{
  "fromVersion": "0.2.0",
  "toVersion": "0.2.1",
  "patchUrl": "https://download.example.com/patches/0.2.0-0.2.1.patch",
  "patchSha256": "...",
  "resultSha256": "...",
  "signature": "...",
  "fullFallbackUrl": "https://download.example.com/desktop/0.2.1/update.exe"
}
```

这属于自定义安装基础设施，不是普通业务功能。第一版优先通过以下方式减小下载量：

- updater 包不携带 WebView2 离线安装程序。
- 对更新产物启用合理压缩。
- 不把可在线获取的大型可选资源重复打进主程序。
- 图片、官方模板预览和其他业务资源使用版本化 CDN 文件独立更新。

### 17.10 自动更新验收标准

- 无更新时接口返回 204，客户端无打扰。
- 有更新时能显示版本、说明、文件大小和进度。
- 篡改更新包后客户端拒绝安装。
- 下载中断后可以重试，不破坏现有安装。
- 安装失败后旧版本仍可启动。
- 更新前未同步标签不会丢失。
- 打印过程中不会自动退出安装。
- 灰度比例为 0 时不再向新设备下发问题版本。
- 旧客户端超出最低支持版本时仍可打开本地标签并打印。
- 自动更新日志不包含登录 Token 或用户标签内容。

官方参考：

- [Tauri Updater](https://v2.tauri.app/plugin/updater/)
- [Tauri Windows Installer](https://v2.tauri.app/distribute/windows-installer/)
- [Tauri Windows Code Signing](https://v2.tauri.app/distribute/sign/windows/)

## 18. 最终决策摘要

| 项目 | 决策 |
| --- | --- |
| 云端标签格式 | PostgreSQL JSONB |
| 图片保存 | 对象存储，JSON 使用 `asset://UUID` 引用 |
| 本地文件格式 | 继续使用 `.lpt` |
| 标签身份 | UUID |
| 并发控制 | `revision` 乐观锁 |
| 本地缓存 | SQLite |
| 免费标签上限 | 50 |
| 付费标签上限 | 200 |
| 容量限制 | 不限制、不展示 |
| 回收站是否计数 | 计数，永久删除后释放 |
| 降级超额 | 可使用已有标签，禁止增加标签数量 |
| 本地数据迁移 | 不自动迁移，用户手动打开并保存到云端 |
| 打印机与校准 | 仅保存在本机，不进入云标签 |
| 付费模板 | 完整内容保存在服务端，服务端鉴权 |
| PC 自动更新 | Tauri 2 官方 updater + 自建动态更新 API |
| 第一版更新方式 | 签名的完整 updater 产物，不做自定义差分 |
| WebView2 | 默认使用在线引导方式，不在公开安装包或 updater 包中内置离线运行时 |
| 增量更新 | 根据实际更新包大小和流量数据后续单独立项 |
