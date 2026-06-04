/**
 * Vercel Serverless — D 站 API 搜索转发
 *
 * GET /api/db-search?tags=xxx&limit=100&page=1
 *
 * 功能：
 * - 透传 Danbooru posts.json 查询
 * - 支持 api_key 认证透传（?login=xxx&api_key=xxx 或 Authorization header）
 * - 设置 8s 超时，避免撞 Vercel 10s 限制
 * - 缓存搜索结果 5 分钟
 */

const DANBOORU_API = "https://danbooru.donmai.us/posts.json";

export default async function handler(req, res) {
  // 只允许 GET
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { tags, limit, page } = req.query;
  const authHeader = req.headers["x-danbooru-auth"] || "";

  if (!tags) {
    return res.status(400).json({ error: "Missing 'tags' query parameter" });
  }

  const params = new URLSearchParams();
  params.set("tags", tags);
  params.set("limit", String(Math.min(parseInt(limit) || 100, 100)));
  if (page) params.set("page", String(page));

  if (authHeader && authHeader.includes(":")) {
    const [login, api_key] = authHeader.split(":", 2);
    params.set("login", login);
    params.set("api_key", api_key);
  }

  const targetUrl = `${DANBOORU_API}?${params.toString()}`;

  // 5 分钟缓存
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");

  // 8s 超时 — 留 2s 给 Vercel cold start 和序列化
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const resp = await fetch(targetUrl, {
      headers: {
        "User-Agent": `ZakoPromptTools/1.0`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // 透传 D 站 HTTP 状态码
    if (resp.status !== 200) {
      let detail = "";
      try {
        // 尝试读取错误详情，但超时不阻塞
        const text = await resp.text();
        detail = text.slice(0, 500);
      } catch (_) {}

      if (resp.status === 429) {
        return res.status(429).json({
          error: "D站限流，请稍后重试",
          retry_after: resp.headers.get("retry-after") || "5",
        });
      }

      if (resp.status === 401) {
        return res.status(401).json({
          error: "API Key 无效，请检查 username:api_key 是否正确",
        });
      }

      if (resp.status === 422) {
        return res.status(422).json({
          error: "标签限制或参数错误（非黄金会员仅支持 2 个标签）",
          detail,
        });
      }

      return res.status(resp.status).json({
        error: `D站返回 ${resp.status}`,
        detail,
      });
    }

    const data = await resp.json();

    // 过滤：确保有 tag_string 和预览图
    const filtered = Array.isArray(data)
      ? data.filter((p) => p.tag_string && p.preview_file_url)
      : [];

    return res.status(200).json(filtered);
  } catch (err) {
    clearTimeout(timeout);

    if (err.name === "AbortError") {
      return res.status(504).json({
        error: "D站请求超时（8s），请稍后重试",
      });
    }

    return res.status(502).json({
      error: "D站请求失败",
      message: err.message,
    });
  }
}
