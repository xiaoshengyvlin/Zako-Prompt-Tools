"""ComfyUI API routes for Zako-Prompt-Tools nodes."""

import sqlite3
from pathlib import Path
from urllib.parse import urlparse


def setup_routes():
    try:
        from server import PromptServer
        from aiohttp import web, ClientSession, ClientTimeout
    except ImportError:
        return

    db_path = Path(__file__).resolve().parent / "mapping" / "tag.sqlite"

    def _is_donmai_url(url: str) -> bool:
        try:
            hostname = urlparse(url).hostname or ""
            return hostname.endswith(".donmai.us") or hostname == "donmai.us"
        except Exception:
            return False

    @PromptServer.instance.routes.get("/zako/proxy_image")
    async def proxy_image(request):
        url = request.query.get("url", "")
        if not _is_donmai_url(url):
            return web.Response(status=400)
        try:
            timeout = ClientTimeout(total=10)
            async with ClientSession() as session:
                async with session.get(
                    url,
                    headers={"User-Agent": "DanbooruTagExporter/0.50"},
                    timeout=timeout,
                ) as resp:
                    data = await resp.read()
                    return web.Response(
                        body=data, content_type="image/jpeg",
                        headers={"Cache-Control": "public, max-age=86400"},
                    )
        except Exception:
            return web.Response(status=502)

    @PromptServer.instance.routes.post("/zako/tag_translate")
    async def tag_translate(request):
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "Invalid JSON"}, status=400)

        text = (data.get("text", "") or "").strip()
        if not text:
            return web.json_response({"found": False})

        conn = sqlite3.connect(str(db_path))
        try:
            cursor = conn.cursor()

            cursor.execute(
                "SELECT name, cn_name, post_count FROM tags WHERE cn_name = ? LIMIT 1",
                (text,),
            )
            row = cursor.fetchone()

            if row:
                cursor.execute(
                    "SELECT cn_name, name, post_count FROM tags WHERE cn_name LIKE ? "
                    "AND cn_name != ? ORDER BY post_count DESC LIMIT 8",
                    (f"%{text}%", text),
                )
                suggestions = [
                    {"cn": r[0], "en": r[1], "post_count": r[2]}
                    for r in cursor.fetchall()
                ]
                return web.json_response({
                    "found": True,
                    "english": row[0],
                    "cn_name": row[1],
                    "post_count": row[2],
                    "suggestions": suggestions,
                })

            cursor.execute(
                "SELECT cn_name, name, post_count FROM tags WHERE cn_name LIKE ? "
                "ORDER BY post_count DESC LIMIT 8",
                (f"%{text}%",),
            )
            suggestions = [
                {"cn": r[0], "en": r[1], "post_count": r[2]}
                for r in cursor.fetchall()
            ]
            return web.json_response({"found": False, "suggestions": suggestions})
        except Exception:
            return web.json_response({"error": "Internal server error"}, status=500)
        finally:
            conn.close()
