# Vercel 代理部署

为 Zako-Prompt-Tools 提供 D 站 API 和图片代理，解决无影云等环境无法直连 Danbooru 的问题。

## 部署

### 网页部署（推荐）

1. 推送整个仓库到 GitHub
2. 打开 [vercel.com/import](https://vercel.com/import)，选该仓库
3. **Root Directory 设为 `vercel`**
4. 点 Deploy

### CLI 部署

```bash
npm i -g vercel
cd vercel
vercel --prod
```

### 部署前准备

首次部署或更新 `tag.sqlite` 后，运行一次同步脚本：

```bash
python vercel/scripts/predeploy.py
```

这会将根目录的 `mapping/tag.sqlite` 同步到 `vercel/mapping/` 并重新生成 `hot-tags.json`。

## 配置 ComfyUI

部署完成后获取域名（如 `https://zako-xxxxx.vercel.app`），在 ComfyUI 的 **Zako-Danbooru-Search** 节点上填写 `proxy_url` 输入框即可。留空则使用直连模式。

## 路由说明

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/db-search` | GET | D 站 API 搜索转发，api_key 通过 `X-Danbooru-Auth` Header 传递 |
| `/api/tag-translate` | POST | 中英标签翻译，优先查热数据 JSON（7.5 万高频标签），未命中回退 SQLite |
| `/api/db-proxy` | GET | D 站图片代理 |

## 翻译性能

- **热数据**：`hot-tags.json`（4MB，post_count >= 100 的 7.5 万条标签），冷启动 ~100ms
- **回退**：`tag.sqlite`（28.5MB），仅冷门标签触发 sql.js 懒加载
- 绝大多数常用标签查询命中热数据，毫秒级响应

## 测试

```bash
# 搜索测试
curl "https://你的域名.vercel.app/api/db-search?tags=1girl&limit=10"

# 翻译测试
curl -X POST "https://你的域名.vercel.app/api/tag-translate" \
  -H "Content-Type: application/json" \
  -d '{"text":"女仆"}'

# 图片代理测试
curl -o test.jpg "https://你的域名.vercel.app/api/db-proxy?url=https://cdn.donmai.us/preview/xx.jpg"
```

## 限制

- Vercel Hobby: 10s 函数超时，100GB 带宽/月
- 单次搜索最多拉 2 页首屏（200 张），后续逐页翻
- 图片上限 4MB（Vercel Hobby 响应体限制），超限返回 413
