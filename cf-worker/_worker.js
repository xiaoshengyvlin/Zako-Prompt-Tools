/**
 * Cloudflare Worker — D站搜索 + 图片代理
 * 部署到 Cloudflare Workers, 获取 xxx.workers.dev 域名
 */
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Danbooru-Auth",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    // D站搜索转发
    if (url.pathname === "/api/db-search") {
      const tags = url.searchParams.get("tags");
      if (!tags) return new Response(JSON.stringify({ error: "Missing tags" }), { status: 400, headers });

      const params = new URLSearchParams();
      params.set("tags", tags);
      params.set("limit", String(Math.min(parseInt(url.searchParams.get("limit")) || 100, 100)));
      if (url.searchParams.get("page")) params.set("page", url.searchParams.get("page"));

      const authHeader = request.headers.get("X-Danbooru-Auth") || "";
      if (authHeader && authHeader.includes(":")) {
        const [login, api_key] = authHeader.split(":", 2);
        params.set("login", login);
        params.set("api_key", api_key);
      }

      try {
        const resp = await fetch(`https://danbooru.donmai.us/posts.json?${params}`, {
          headers: { "User-Agent": "ZakoPromptTools/1.0", Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        });
        const data = await resp.json();
        const filtered = Array.isArray(data) ? data.filter((p) => p.tag_string && p.preview_file_url) : [];
        return new Response(JSON.stringify(filtered), {
          headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "s-maxage=300" },
        });
      } catch {
        return new Response(JSON.stringify({ error: "Danbooru unreachable" }), { status: 502, headers });
      }
    }

    // 图片代理
    if (url.pathname === "/api/db-proxy") {
      const imageUrl = url.searchParams.get("url");
      if (!imageUrl) return new Response(JSON.stringify({ error: "Missing url" }), { status: 400, headers });
      try {
        const hostname = new URL(imageUrl).hostname;
        if (!hostname.endsWith(".donmai.us") && hostname !== "donmai.us") {
          return new Response(JSON.stringify({ error: "Not allowed" }), { status: 403, headers });
        }
      } catch {
        return new Response(JSON.stringify({ error: "Invalid url" }), { status: 400, headers });
      }

      try {
        const resp = await fetch(imageUrl, {
          headers: { "User-Agent": "ZakoPromptTools/1.0" },
          signal: AbortSignal.timeout(8000),
        });
        if (!resp.ok) return new Response(JSON.stringify({ error: "Upstream failed", status: resp.status }), { status: 502, headers });
        return new Response(resp.body, {
          headers: {
            "Content-Type": resp.headers.get("content-type") || "image/jpeg",
            "Cache-Control": "public, s-maxage=86400, max-age=86400",
            ...headers,
          },
        });
      } catch {
        return new Response(JSON.stringify({ error: "Proxy failed" }), { status: 502, headers });
      }
    }

    return new Response(null, { status: 404, headers });
  },
};
