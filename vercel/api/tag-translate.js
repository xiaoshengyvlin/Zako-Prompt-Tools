/**
 * Vercel Serverless — 标签中文→英文翻译
 *
 * POST /api/tag-translate
 * Body: { "text": "女仆" }
 *
 * 功能：
 * - 优先查询热数据 JSON（post_count >= 100，~7.5 万条，4MB）
 * - 命中则毫秒级返回，不走 SQLite
 * - 冷门标签回退到 tag.sqlite（28.5MB，sql.js 懒加载）
 */

import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const BASE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "mapping");
const HOT_PATH = resolve(BASE, "hot-tags.json");
const DB_PATH = resolve(BASE, "tag.sqlite");

let hotMap = null;   // Map<cn_name, {en, c}>
let hotList = null;  // [{en, cn, c}, ...] sorted by c DESC
let db = null;

function loadHot() {
  const raw = readFileSync(HOT_PATH, "utf-8");
  const data = JSON.parse(raw);
  hotList = data.list;
  hotMap = new Map();
  for (const item of hotList) {
    if (!hotMap.has(item.cn)) {
      hotMap.set(item.cn, item);
    }
  }
  return data.count;
}

async function getDb() {
  if (db) return db;
  const initSqlJs = (await import("sql.js")).default;
  const buffer = readFileSync(DB_PATH);
  db = new initSqlJs.Database(buffer);
  return db;
}

function hotSearch(query) {
  const exact = hotMap.get(query);

  const suggestions = [];
  for (const item of hotList) {
    if (item.cn.includes(query) && item.cn !== query) {
      suggestions.push({ cn: item.cn, en: item.en, post_count: item.c });
      if (suggestions.length >= 8) break;
    }
  }

  if (exact) {
    return { found: true, english: exact.en, post_count: exact.c, suggestions };
  }
  if (suggestions.length > 0) {
    return { found: false, suggestions };
  }
  return null;
}

async function dbSearch(db, query) {
  const exactStmt = db.prepare(
    "SELECT name, cn_name, post_count FROM tags WHERE cn_name = ? LIMIT 1"
  );
  exactStmt.bind([query]);
  const exact = exactStmt.step() ? exactStmt.getAsObject() : null;
  exactStmt.free();

  if (exact) {
    const sugStmt = db.prepare(
      "SELECT cn_name, name, post_count FROM tags WHERE cn_name LIKE ? AND cn_name != ? ORDER BY post_count DESC LIMIT 8"
    );
    sugStmt.bind([`%${query}%`, query]);
    const suggestions = [];
    while (sugStmt.step()) {
      const row = sugStmt.getAsObject();
      suggestions.push({ cn: row.cn_name, en: row.name, post_count: row.post_count });
    }
    sugStmt.free();
    return { found: true, english: exact.name, post_count: exact.post_count, suggestions };
  }

  const sugStmt2 = db.prepare(
    "SELECT cn_name, name, post_count FROM tags WHERE cn_name LIKE ? ORDER BY post_count DESC LIMIT 8"
  );
  sugStmt2.bind([`%${query}%`]);
  const suggestions = [];
  while (sugStmt2.step()) {
    const row = sugStmt2.getAsObject();
    suggestions.push({ cn: row.cn_name, en: row.name, post_count: row.post_count });
  }
  sugStmt2.free();
  return { found: false, suggestions };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text } = req.body || {};
  const query = (text || "").trim();
  if (!query) {
    return res.status(400).json({ found: false, error: "Missing 'text'" });
  }

  try {
    if (!hotMap) loadHot();

    const hotResult = hotSearch(query);
    if (hotResult) {
      return res.status(200).json(hotResult);
    }

    const database = await getDb();
    const result = await dbSearch(database, query);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      found: false,
      error: "Internal server error",
    });
  }
}
