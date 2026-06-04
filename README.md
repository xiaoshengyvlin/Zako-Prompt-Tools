[![Deploy to Vercel](https://vercel.com/button)](https://vercel.com/new?repository-url=https://github.com/xiaoshengyvlin/Zako-Prompt-Tools)
&nbsp; &nbsp; `cf-worker/` → Cloudflare Workers 部署

---

# Zako-Prompt-Tools

ComfyUI 提示词工具组 — 随机抽卡 · 灵感搜索 · 标签翻译 · 提示词增强

---

## 安装

```bash
# 复制到 ComfyUI custom_nodes 目录
git clone https://github.com/xiaoshengyvlin/Zako-Prompt-Tools.git
```

依赖：`requests>=2.28.0`

---

## 四个节点

| 节点 | 用途 | 需要 API？ |
|------|------|:---:|
| 🎲 **Random-Prompt** | 20 万+提示词库随机抽卡，G/S/Q/E 分级 + 主题筛选 | 否 |
| 🔍 **Danbooru-Search** | D 站搜图，中文翻译 → 5 列预览 → 点击填入标签 | 可选 |
| 🌐 **Tag-Translate** | LLM 中英互译提示词标签，保持原格式 | 是 |
| ✨ **Prompt-Enhance** | LLM 为标签追加场景/光影/氛围描述 | 是 |

> Random-Prompt 完全离线，其余三个可串联：`Random → Translate → Enhance → CLIP`

---

## 代理模式（仅 Danbooru-Search 节点）

当服务器无法直连 Danbooru，在节点的 **`proxy_url`** 输入框填入代理域名即可。

| | Vercel | Cloudflare Workers |
|---|:---:|:---:|
| 部署 | 点上方按钮一键部署 | `cf-worker/_worker.js` 粘贴到 CF 面板 |
| 代理内容 | D 站搜索 + 图片 | D 站搜索 + 图片 |
| 国内连通 | ⚠️ 可能被墙 | ✅ 通常正常 |

> 标签翻译固定走 ComfyUI 本地，不经过代理。

---

## 搜索窗口速览

```
┌──────────────── 搜索弹窗 ────────────────┐
│  [输入标签搜索...]  [搜索]               │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ │
│  │ 🖼  │ │ 🖼  │ │ 🖼  │ │ 🖼  │ │ 🖼  │ │  ← 5 列缩略图
│  │♥102 │ │♥89  │ │♥76  │ │♥54  │ │♥31  │ │     点赞排序
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ │
│  [▼ 继续抓取]                            │
└──────────────────────────────────────────┘
```

- 输入中文标签 → 自动翻译为英文搜索
- 点击图片 → 标签填入节点，分类输出：画师 / 版权 / 角色 / 通用
- 首屏 200~300 张并行加载，后台预取，IntersectionObserver 懒加载
- `api_key` 和 `proxy_url` 存 localStorage，不写入工作流 JSON

---

## 目录

```
Zako-Prompt-Tools/
├── nodes/            # Python 节点后端
├── js/               # 前端 UI
├── data/             # 20 万+提示词 JSON + 自动构建 SQLite
├── mapping/          # 30 万中英标签 tag.sqlite
├── vercel/           # Vercel 代理层（搜索 + 图片转发）
│   ├── api/db-search.js
│   └── api/db-proxy.js
└── cf-worker/        # Cloudflare Workers 代理层
    └── _worker.js
```

---

## 技术要点

- **安全**：API Key 不保存到工作流 JSON，代理模式下走 Header 传输不落日志
- **性能**：SQLite WAL 模式毫秒级随机查询，图片 24h 缓存，离屏自动卸载
- **容错**：LLM 检测拒绝话术自动回退，代理冷启动自动重试
