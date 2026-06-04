# Cloudflare Workers 代理部署

为 Zako-Prompt-Tools 提供 D 站搜索和图片代理。相比 Vercel 版，去掉了标签翻译（翻译走 ComfyUI 本地服务即可），更轻量。

## 部署

1. 打开 [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages
2. Create → Create Worker，起个名字（如 `zako-proxy`）
3. 把 `_worker.js` 的内容粘贴到编辑器
4. Save and Deploy
5. 获得 Worker 域名（如 `zako-proxy.xxxxx.workers.dev`）

## 配置 ComfyUI

在 **Zako-Danbooru-Search** 节点的 `proxy_url` 输入框填入 Worker 域名即可。

## 路由说明

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/db-search` | GET | D 站 API 搜索转发 |
| `/api/db-proxy` | GET | D 站图片代理 |

标签翻译走 ComfyUI 本地 `/zako/tag_translate` 路由，无需代理。
