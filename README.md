# Meridian

<p align="center">
  <img src="src/app/opengraph-image.png" alt="Meridian title" width="100%">
</p>

> 一个旅行记录网站。当前已实现：公开地图浏览、编辑密码登录、新建/编辑/删除地点、R2 图片上传、时间轴累计筛选、亮暗主题切换。  
> 本 README 已按当前代码更新；原 README 中提到但尚未完成的能力，已在对应章节以 **[未完成]** 标注。

## 1. 当前状态概览

- [已实现] 公开主页 `/` 展示地图、地点标记、详情面板
- [已实现] `/login` 编辑密码登录，`/edit` 进行完整编辑
- [已实现] 新建 / 编辑 / 删除地点记录
- [已实现] R2 预签名上传 + 客户端双份图片压缩
- [已实现] 署名下拉候选、Markdown 编辑与渲染、图片全屏预览
- [已实现] 时间轴累计筛选（拖拽 + 桌面滚轮）
- [已实现] 亮色 / 暗色主题切换与持久化
- [部分实现] `is_locked` 已接入公开页脱敏展示
- [未完成] 查看密码 / 解锁 cookie / 分享链接 token / reset token
- [未完成] Mapbox 聚合、i18n、导出备份、锁定记录完整解锁流程

---

## 2. 技术栈

| 层 | 当前选型 | 状态 / 说明 |
|---|---|---|
| 框架 | Next.js 15 (App Router) + React 19 | [已实现] |
| 部署 | Vercel | [规划说明] README 中保留，代码中无平台绑定逻辑 |
| 数据库 | Neon Postgres | [已实现] 使用 `@neondatabase/serverless` |
| 图片存储 | Cloudflare R2 | [已实现] 使用 `@aws-sdk/client-s3` + 预签名上传 |
| 地图 | Mapbox GL JS | [已实现] 手工 Marker 渲染；**[未完成]** cluster |
| 鉴权 | iron-session | [已实现] 仅编辑密码登录 |
| 样式 | Tailwind CSS 4 + 全局 CSS 变量 | [已实现] |
| 动画 | framer-motion | [已实现] 面板 / toast / 时间轴点位动画 |
| Markdown 编辑器 | MDXEditor | [已实现] 编辑器已接入 |
| Markdown 展示 | `react-markdown` + `remark-gfm` | [已实现] 详情面板渲染正文 |
| 客户端图片压缩 | `browser-image-compression` | [已实现] 原图 + 缩略图双份压缩 |
| i18n | `next-intl` | **[未完成]** 依赖已安装，但当前代码未接入 |
| 语言 | TypeScript strict | [已实现] |

本地开发：当前代码要求开发者自行提供 Neon、R2、Mapbox 与 session 凭据，不包含 mock 或本地 fallback。

---

## 3. 数据模型

当前数据模型仍基于 Postgres 单表 `places`：

```sql
CREATE TABLE places (
  id SERIAL PRIMARY KEY,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  images TEXT[] NOT NULL DEFAULT '{}',
  thumbnails TEXT[] NOT NULL DEFAULT '{}',
  author TEXT,
  visited_at DATE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  share_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_places_visited_at ON places(visited_at);
CREATE INDEX idx_places_share_token ON places(share_token) WHERE share_token IS NOT NULL;
```

**当前代码约束：**
- [已实现] `images` 和 `thumbnails` 长度必须一致，接口层用 Zod 校验
- [已实现] `author` 可空
- [已实现] `visited_at` 可空
- [已实现] `is_locked` 会存入数据库
- **[未完成]** `share_token` 虽在模型里保留，但当前创建 / 更新流程不会自动生成，也没有 reset token 流程

---

## 4. 页面结构

```text
/                            公开主页，只读地图；若已登录会重定向到 /edit
/?place=123                  已实现：打开后聚焦并展开该记录
/?place=123&key=xxx          [未完成] 当前不会处理 key，也不会按 token 解锁
/login                       登录页（编辑密码）
/edit                        编辑页（需编辑密码）
```

**当前页面行为：**
- [已实现] 未登录访问 `/`：渲染脱敏后的公开数据
- [已实现] 已登录访问 `/`：服务端直接重定向到 `/edit`
- [已实现] 未登录访问 `/edit`：重定向到 `/login`
- [已实现] 已登录访问 `/login`：重定向到 `/edit`

---

## 5. API 设计（按当前代码）

### 当前已存在接口

| 方法 | 路径 | 状态 | 当前行为 |
|---|---|---|---|
| GET | `/api/places` | [已实现] | 返回数据库中的所有地点原始数据 |
| POST | `/api/places` | [已实现] | 需编辑登录，新增地点 |
| GET | `/api/places/[id]` | [已实现] | 返回单条原始数据 |
| PATCH | `/api/places/[id]` | [已实现] | 需编辑登录，更新地点 |
| DELETE | `/api/places/[id]` | [已实现] | 需编辑登录，删除地点 |
| POST | `/api/auth` | [已实现] | 编辑密码登录 |
| DELETE | `/api/auth` | [已实现] | 登出 |
| POST | `/api/upload` | [已实现] | 需编辑登录，生成 R2 上传目标 |

### README 原先写到、但当前还不存在的接口

| 方法 | 路径 | 状态 | 说明 |
|---|---|---|---|
| POST | `/api/unlock` | **[未完成]** | 查看密码解锁未实现 |
| POST | `/api/places/[id]/reset-token` | **[未完成]** | 重置分享 token 未实现 |
| GET | `/api/export` | **[未完成]** | 导出备份未实现 |

### 关于加锁记录的当前真实行为

- [已实现] 公开主页 `/` 不直接依赖 `/api/places`，而是在服务端页面渲染时对 `places` 做脱敏
- [已实现] 脱敏逻辑会保留 `id / lat / lng / is_locked / created_at`，并将标题、正文、图片、日期、署名等清空
- **[未完成]** API 层目前还没有实现“对加锁记录按 cookie / token 控制返回内容”
- **[注意]** 如果直接调用当前的 REST API，`GET /api/places` 和 `GET /api/places/[id]` 仍会返回原始完整数据

---

## 6. 视觉与交互总则

项目名 **Meridian**，当前风格仍是极简 + 圆角 + 轻动效。

### 当前已实现

- [已实现] 大量圆角容器与按钮（`rounded-*` 风格）
- [已实现] 亮 / 暗主题配色，并持久化到 `localStorage` + cookie
- [已实现] 顶部标题、站点副标题、登录 / 登出 / 新建 / 主题切换入口
- [已实现] 桌面端右侧滑入面板
- [已实现] 移动端底部滑入面板
- [已实现] `100svh` / `100dvh` 与 `safe-area-inset-*` 适配

### 当前未完成

- **[未完成]** 中英切换按钮
- **[未完成]** 移动端详情面板顶部“把手”与拖拽展开到全屏
- **[未完成]** 统一的锁定记录专用解锁面板视觉

---

## 7. 地图行为

### 底图

- [已实现] 使用 Mapbox GL JS
- [已实现] 浅色主题使用 `mapbox://styles/mapbox/outdoors-v12`
- [已实现] 深色主题使用 `mapbox://styles/mapbox/dark-v11`
- [已实现] 应用 globe 投影与 fog 氛围效果
- **[未完成]** README 原先设想的 `light-v11` 浅色风格与地图地名语言切换

### 标记

当前使用手工 DOM Marker，而不是 GeoJSON layer。

1. **正常标记**
   - [已实现] 优先使用 `thumbnails[0]` 作为圆形背景
   - [已实现] 没有缩略图时显示纯色圆点
   - [已实现] 有标题时显示标题标签

2. **加锁标记（公开页已脱敏状态）**
   - [已实现] 显示中性色圆点 + `🔒`
   - [已实现] 不显示缩略图
   - [已实现] 不显示标题

### 交互

- [已实现] 点击标记会选中地点，并将地图 `easeTo` 到该地点
- [已实现] 地图视口会保存在 `sessionStorage`
- [已实现] 首次进入会自动 fit bounds / 聚焦单点
- **[未完成]** Mapbox cluster 聚合
- **[未完成]** 点击聚合点放大
- **[未完成]** 根据缩放级别控制标题显示与碰撞检测
- **[未完成]** 加锁标记点击后弹出专门的解锁面板

---

## 8. 时间轴（底部）

### 当前已实现

- [已实现] 时间轴固定在底部
- [已实现] 右侧固定 “Now” 指针
- [已实现] 时间筛选逻辑为累计筛选：`visited_at <= cursorTime`
- [已实现] 没有 `visited_at` 的记录按“现在”处理，始终显示
- [已实现] 支持拖拽时间轴平移
- [已实现] 桌面端支持滚轮平移
- [已实现] 轴上显示有记录的时间点；加锁记录也会标点

### 当前未完成

- **[未完成]** README 原先描述的“严格一整年宽”的固定视觉窗口
- **[未完成]** “回到现在”按钮
- **[未完成]** 停止拖动 300ms 后自动 `flyTo` 新冒出标记

---

## 9. 上锁功能

### 当前已实现

- [已实现] 编辑面板里有“上锁”开关，保存时会写入 `is_locked`
- [已实现] 公开主页会在服务端对加锁记录做脱敏
- [已实现] 脱敏后的加锁记录在地图上显示为 `🔒` 标记

### 当前真实限制

- [当前行为] 公开页点击加锁记录时，不会出现专门的解锁流程
- [当前行为] 当前仍会打开同一个详情面板，但面板里拿到的是脱敏后的空标题 / 空正文 / 空图片数据
- [当前行为] `is_locked` 目前更接近“公开页展示约束”，还不是完整的查看权限系统

### 当前未完成

- **[未完成]** `VIEW_PASSWORD`
- **[未完成]** `view-session` / `unlocked` cookie
- **[未完成]** `POST /api/unlock`
- **[未完成]** `GET /api/places` / `GET /api/places/[id]` 的解锁判定
- **[未完成]** `share_token` 生成、校验与重置
- **[未完成]** `/?place=123&key=xxx` 分享链接解锁
- **[未完成]** 编辑者查看分享链接与复制入口

---

## 10. 图片处理

### 当前上传流程

- [已实现] 客户端双份压缩：
  - 原图：JPEG，最长边 1600px，`maxSizeMB: 1.2`，`initialQuality: 0.85`
  - 缩略图：JPEG，最长边 400px，`maxSizeMB: 0.2`，`initialQuality: 0.7`
- [已实现] 分别向 `/api/upload` 请求原图 / 缩略图上传目标
- [已实现] 浏览器直接 `PUT` 到 Cloudflare R2
- [已实现] 保存时将原图 URL 写入 `images`，缩略图 URL 写入 `thumbnails`
- [已实现] 上传失败会显示 toast“上传失败”

### 当前展示方式

- [已实现] 地图标记背景使用 `thumbnails[0]`
- [已实现] 详情面板显示缩略图网格
- [已实现] 点击缩略图可全屏查看原图
- [已实现] 正文使用 `react-markdown` 渲染 Markdown / GFM
- [已实现] 编辑器使用 MDXEditor，带基础工具栏与 `imagePlugin`

### 当前未完成

- **[未完成]** README 原先写的“粘贴 / 拖拽图片即上传”工作流
- **[未完成]** Markdown 编辑器内的自动上传并插入图片 URL
- **[未完成]** 上传图片与 Markdown 正文的更深度联动

> 当前代码里的上传入口实际是“点击文件选择器上传”；界面文案虽然写了“粘贴、拖拽或点击上传图片”，但前两者尚未接入。

---

## 11. 详情面板

### 当前查看模式

- [已实现] 标题、访问日期、署名、关闭按钮
- [已实现] 缩略图网格
- [已实现] Markdown / GFM 正文渲染
- [已实现] 有编辑权限时显示“编辑 / 删除”按钮
- [已实现] 桌面端固定在右侧滑入
- [已实现] 移动端固定在底部滑入

### 当前未完成

- **[未完成]** 分享按钮
- **[未完成]** 加锁记录的专用“解锁面板”
- **[未完成]** 移动端拖拽展开到全屏
- **[未完成]** 点击锁定记录后给出 toast 提示而不是直接展示脱敏详情面板

---

## 12. 新建与编辑流程

### 新建流程

- [已实现] 仅登录后显示“新建”按钮
- [已实现] 点击“新建”后，地图中心出现固定大头针
- [已实现] 拖地图选择位置
- [已实现] 底部确认条展示当前经纬度 + 取消 / 确认
- [已实现] 确认后打开编辑面板

### 编辑面板字段

- [已实现] 标题
- [已实现] 访问日期
- [已实现] 署名输入 + 历史署名候选（客户端去重）
- [已实现] 上锁开关
- [已实现] Markdown 编辑器
- [已实现] 图片上传与删除
- [已实现] 保存 / 取消

### 编辑已有记录

- [已实现] 查看面板点“编辑”进入同一套编辑 UI
- [已实现] 编辑已有记录时位置固定，不可更改
- [已实现] 删除使用浏览器原生 `confirm`

### 当前未完成

- **[未完成]** 加锁记录显示当前分享链接
- **[未完成]** “重置分享链接 / Reset share link”按钮
- **[未完成]** 自定义圆角确认弹窗与删除退场动效

---

## 13. 鉴权

### 编辑密码（当前已实现）

- [已实现] 使用 `AUTH_PASSWORD`
- [已实现] `POST /api/auth` 登录
- [已实现] `DELETE /api/auth` 登出
- [已实现] `session` cookie，`httpOnly`、`sameSite: 'lax'`、30 天
- [已实现] `/edit` 需要编辑登录
- [已实现] 所有写接口都要求编辑登录
- [已实现] 已登录访问 `/` 时会直接重定向到 `/edit`

### 查看密码（当前未完成）

- **[未完成]** `VIEW_PASSWORD`
- **[未完成]** 独立的查看 session cookie
- **[未完成]** 全局解锁已上锁记录
- **[未完成]** “编辑者自动视为已解锁”的便利逻辑

---

## 14. 国际化（i18n）

### 当前状态

- **[未完成]** `next-intl` 依赖已安装，但当前代码没有接入
- **[未完成]** 当前没有 `src/i18n` 文案文件
- [当前行为] UI 文案基本为中文硬编码
- **[未完成]** 中英切换按钮
- **[未完成]** Mapbox 地名随语言切换

---

## 15. 备份功能

- **[未完成]** `GET /api/export`
- **[未完成]** 编辑页导出备份按钮
- [规划说明] 若后续实现，图片仍应继续由 R2 独立管理，不与 JSON 一起打包

---

## 16. 数据库连接

当前代码使用 Neon Serverless 驱动：

```ts
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL!);
const rows = await sql.query('SELECT * FROM places');
```

- [已实现] 使用 `@neondatabase/serverless`
- [已实现] 查询封装在 `src/lib/db.ts`
- [说明] 免费版冷启动仍可能带来首次请求变慢
- [说明] 当前前端对地图组件本身有动态加载占位，但没有专门的数据库冷启动提示文案

---

## 17. 环境变量

```bash
# Neon
DATABASE_URL=postgresql://...

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=https://pub-xxx.r2.dev

# Mapbox
NEXT_PUBLIC_MAPBOX_TOKEN=pk.xxx

# UI
MERIDIAN_SITE_DESCRIPTION=一个双人使用的私密旅行记录网站

# Auth
AUTH_PASSWORD=
VIEW_PASSWORD=

# Session
SESSION_SECRET=
```

**说明：**
- [已实现] `MERIDIAN_SITE_DESCRIPTION` 已接入首页 / 编辑页头部副标题
- [已实现] `AUTH_PASSWORD` 已接入
- [已实现] `SESSION_SECRET` 已接入，长度要求至少 32
- **[未完成]** `VIEW_PASSWORD` 目前仍保留在示例环境变量里，但服务端代码尚未真正读取 / 使用

---

## 18. 组件架构（当前代码）

当前真实结构更接近下面这样：

```text
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── login/page.tsx
│   ├── edit/page.tsx
│   ├── globals.css
│   └── api/
│       ├── auth/route.ts
│       ├── places/route.ts
│       ├── places/[id]/route.ts
│       └── upload/route.ts
├── components/
│   ├── LoginForm.tsx
│   ├── MapView.tsx
│   ├── MarkdownEditor.tsx
│   ├── MeridianApp.tsx
│   ├── ThemeProvider.tsx
│   ├── ThemeToggleButton.tsx
│   └── TimelineSlider.tsx
└── lib/
    ├── cn.ts
    ├── compress.ts
    ├── db.ts
    ├── env.ts
    ├── r2.ts
    ├── sanitize.ts
    ├── session.ts
    ├── types.ts
    └── validation.ts
```

### 当前架构特点

- [已实现] `MeridianApp.tsx` 内聚了 Header / CreatePinOverlay / DetailPanel / EditPanel / AuthorCombobox 等 UI
- [已实现] 地图、主题、时间轴、登录表单是独立组件
- [已实现] 数据访问、session、上传、校验、脱敏分别放在 `lib/`

### README 原先规划、但尚未拆分 / 新增的部分

- **[未完成]** `PlaceMarker.tsx`
- **[未完成]** `DetailPanel.tsx`
- **[未完成]** `LockedPanel.tsx`
- **[未完成]** `EditPanel.tsx`
- **[未完成]** `CreatePinOverlay.tsx`
- **[未完成]** `Header.tsx`
- **[未完成]** `AuthorCombobox.tsx`
- **[未完成]** `hooks/useUnlockStatus.ts`
- **[未完成]** `hooks/usePlaces.ts`
- **[未完成]** `app/api/unlock/route.ts`
- **[未完成]** `app/api/places/[id]/reset-token/route.ts`
- **[未完成]** `app/api/export/route.ts`
- **[未完成]** `src/i18n/*`

---

## 19. 边界与非目标

当前仍然**不做**：

- 多用户系统
- 评论、点赞
- 地点分类、标签、搜索
- 孤儿图片清理
- SEO
- PWA / 离线
- 路线连线

当前仍接受的妥协：

- Neon 冷启动可能带来首屏延迟
- 国内访问 Mapbox 瓦片可能慢
- 孤儿图片暂留 R2
- 加锁记录的位置会暴露

---

## 20. 功能状态清单

### 基础

- [x] 未登录访问 `/` 可看到地图和标记
- [x] 未登录访问 `/edit` 自动跳 `/login`
- [x] 登录后 `/edit` 显示新建 / 登出按钮
- [x] 点“新建”出现选点大头针，确认后打开编辑面板
- [x] 点击上传图片可实际存入 R2，并生成原图 / 缩略图两份
- [x] 保存后新标记出现在地图上
- [x] 刷新后数据仍从数据库恢复

### 署名

- [x] 新建时署名有下拉候选，能选历史值，也能新增
- [x] 详情面板显示 `— by X`

### 上锁

- [x] 编辑时可以打开“上锁”，并保存 `is_locked`
- [x] 公开主页中的已脱敏加锁记录显示为 `🔒`
- [ ] 点 `🔒` 弹出专门的解锁面板
- [ ] 输入查看密码后写入 7 天解锁 cookie
- [ ] 编辑加锁记录时看到分享链接并复制
- [ ] reset share token

### 分享链接

- [x] `/?place=123` 会聚焦并展开该记录
- [ ] 加锁且未解锁时给出 toast，而不是直接展示脱敏详情
- [ ] `/?place=123&key=xxx` 带 token 直接查看
- [ ] 错误 token 按未解锁处理

### 时间轴

- [x] 默认指针在 “Now”
- [x] 标记按时间累计筛选
- [x] 桌面端滚轮可平移
- [ ] 停止拖动 300ms 后飞到最近冒出的标记
- [ ] “回到现在”按钮

### 其他

- [x] 亮 / 暗主题切换与持久化
- [x] 桌面端右侧滑入面板
- [x] 移动端底部滑入面板
- [x] 上传失败 toast 提示
- [x] 缩略图点击后全屏查看原图
- [ ] 移动端上拖展开到全屏
- [ ] UI 文案与 Mapbox 地名的中英切换
- [ ] 导出完整 JSON 备份

---

## 21. 后续优先级建议

如果后续继续按原 README 的产品方向推进，建议优先级如下：

1. **先补齐安全边界**：锁定记录 API 脱敏、查看密码、解锁 cookie、share token
2. **再补齐用户体验缺口**：锁定记录解锁面板、分享按钮、reset token、toast 行为
3. **最后补增强项**：Mapbox cluster、i18n、导出备份、移动端拖拽全屏
