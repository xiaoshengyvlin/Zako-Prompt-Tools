/**
 * Vercel Serverless — D 站图片代理
 *
 * GET /api/db-proxy?url=https://...donmai.us/...
 *
 * 功能：
 * - 代理 Danbooru 域名下的图片（preview_file_url / file_url）
 * - 绕过无影云等环境的封锁
 * - 24h 浏览器缓存 + CDN 缓存
 * - 8s 超时，避免撞 Vercel 10s 限制
 * - Hobby 计划：响应体上限 4MB，超出返回错误
 */

const ALLOWED_BASE = "donmai.us";
const MAX_BODY = 4 * 1024 * 1024; // 4MB，留余量给 Vercel Hobby 4.5MB 限制

function isAllowed(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname === ALLOWED_BASE || hostname.endsWith("." + ALLOWED_BASE);
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "Missing 'url' query parameter" });
  }

  if (!isAllowed(url)) {
    return res.status(403).json({ error: "URL not allowed, must be donmai.us domain" });
  }

  res.setHeader("Cache-Control", "public, s-maxage=86400, max-age=86400, immutable");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "ZakoPromptTools/1.0" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      return res.status(502).json({ error: "Upstream fetch failed", status: resp.status });
    }

    const contentType = resp.headers.get("content-type") || "image/jpeg";
    const contentLength = resp.headers.get("content-length");

    if (contentLength && parseInt(contentLength) > MAX_BODY) {
      return res.status(413).json({
        error: "Image too large for proxy",
        limit: MAX_BODY,
        size: parseInt(contentLength),
      });
    }

    const buffer = await resp.arrayBuffer();

    if (buffer.byteLength > MAX_BODY) {
      return res.status(413).json({
        error: "Image too large for proxy",
        limit: MAX_BODY,
        size: buffer.byteLength,
      });
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", buffer.byteLength);

    return res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    clearTimeout(timeout);

    if (err.name === "AbortError") {
      return res.status(504).json({ error: "Upstream request timed out (8s)" });
    }

    return res.status(502).json({ error: "Proxy request failed" });
  }
}
