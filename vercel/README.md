# Vercel 代理部署

为 Zako-Prompt-Tools 提供 D 站搜索和图片代理。标签翻译走 ComfyUI 本地路由，无需代理。

## 部署

### 一键部署

点击项目根目录 README 的 Deploy to Vercel 按钮。

### 手动部署

1. 推送仓库到 GitHub
2. [vercel.com/import](https://vercel.com/import) → 选仓库 → Root Directory 设为 `vercel` → Deploy
3. 将域名填入 ComfyUI 节点的 `proxy_url` 输入框

## 路由

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/db-search` | GET | D 站 API 搜索转发 |
| `/api/db-proxy` | GET | D 站图片代理 |

## 测试

```bash
curl "https://你的域名.vercel.app/api/db-search?tags=1girl&limit=3"
curl "https://你的域名.vercel.app/api/db-proxy?url=https://cdn.donmai.us/180x180/xx.jpg"
```

## 限制

- Vercel Hobby: 10s 函数超时，100GB 带宽/月
- 图片上限 4MB（Hobby 响应体限制）
