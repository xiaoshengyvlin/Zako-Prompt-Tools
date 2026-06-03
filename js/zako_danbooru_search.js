import { app } from "../../../scripts/app.js";


const DANBOORU_API = "https://danbooru.donmai.us/posts.json";
const MAX_RETRIES = 5;
const TIMEOUT_MS = 30000;
const API_LIMIT = 100;

let _lastSearch = null;


function _sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}


async function _fetchPage(tag, apiKey, page) {
    let url = `${DANBOORU_API}?tags=${encodeURIComponent(tag)}&limit=${API_LIMIT}&page=${page}`;
    if (apiKey && apiKey.includes(":")) {
        const [user, key] = apiKey.trim().split(":", 2);
        url += `&login=${encodeURIComponent(user)}&api_key=${encodeURIComponent(key)}`;
    }

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
            const resp = await fetch(url, {
                headers: { "User-Agent": `DanbooruTagExporter/${Math.random().toFixed(2)}` },
                signal: controller.signal,
            });
            clearTimeout(timer);

            if (resp.status === 429) {
                await _sleep(5000);
                continue;
            }

            if (resp.status === 401) {
                throw new Error("API Key 无效，请检查 username:api_key 是否正确");
            }

            if (resp.status === 422) {
                let detail = "";
                try { const err = await resp.json(); detail = err.message || err.error || ""; } catch (_) {}
                if (detail.includes("more than 2 tags") || detail.includes("TagLimit")) {
                    throw new Error("标签限制：非黄金会员仅支持2个标签，请填写 API Key");
                }
                throw new Error("搜索参数错误 (422): " + (detail || "请检查标签格式"));
            }

            let data;
            try { data = await resp.json(); } catch (_) { data = null; }

            if (resp.status >= 500 && Array.isArray(data)) {
                return data.filter((p) => p.tag_string && p.preview_file_url);
            }

            if (!resp.ok) throw new Error("HTTP " + resp.status);

            if (!Array.isArray(data)) throw new Error("返回格式异常");

            return data.filter((p) => p.tag_string && p.preview_file_url);
        } catch (err) {
            clearTimeout(timer);
            if (err.message && err.message.includes("API Key")) {
                throw err;
            }
            if (err.name === "AbortError") {
                if (attempt === MAX_RETRIES - 1) throw new Error("请求超时");
            } else if (attempt === MAX_RETRIES - 1) {
                throw err;
            }
            await _sleep(1000 + attempt * 500);
        }
    }
    return [];
}


function _showSearchModal(apiKey, tagMode, onSelect) {
    const existing = document.getElementById("zako-dan-modal");
    if (existing) existing.remove();

    let allPosts = [];
    let nextPage = 1;
    let loading = false;
    let exhausted = false;
    let renderedCount = 0;
    let currentApiTag = "";
    let currentDisplayTag = "";
    let prefetchedPosts = null;
    let prefetchPending = false;

    const overlay = document.createElement("div");
    overlay.id = "zako-dan-modal";
    Object.assign(overlay.style, {
        position: "fixed", inset: "0", zIndex: "99999",
        background: "rgba(0,0,0,0.6)", display: "flex",
        alignItems: "center", justifyContent: "center",
    });

    const card = document.createElement("div");
    Object.assign(card.style, {
        background: "#1e1e2e", borderRadius: "12px", padding: "16px",
        width: "860px", maxHeight: "94vh", overflow: "hidden",
        color: "#cdd6f4", fontFamily: "sans-serif", fontSize: "13px",
        display: "flex", flexDirection: "column",
    });

    const topBar = document.createElement("div");
    Object.assign(topBar.style, {
        display: "flex", justifyContent: "flex-end", flexShrink: "0",
    });
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    Object.assign(closeBtn.style, {
        background: "transparent", border: "none", color: "#f38ba8",
        fontSize: "20px", cursor: "pointer", padding: "0 8px",
    });
    closeBtn.onclick = () => { _saveState(); overlay.remove(); };
    topBar.appendChild(closeBtn);

    const searchBar = document.createElement("div");
    Object.assign(searchBar.style, {
        display: "flex", gap: "8px", marginBottom: "12px", flexShrink: "0",
    });
    const input = document.createElement("input");
    Object.assign(input, {
        type: "text", placeholder: "输入标签搜索（支持中文）...",
    });
    Object.assign(input.style, {
        flex: "1", padding: "8px 12px", borderRadius: "8px", border: "1px solid #45475a",
        background: "#313244", color: "#cdd6f4", fontSize: "14px", outline: "none",
    });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") doTranslateAndSearch(); });

    const searchBtn = document.createElement("button");
    searchBtn.textContent = "搜索";
    Object.assign(searchBtn.style, {
        padding: "8px 20px", borderRadius: "8px", border: "none",
        background: "#89b4fa", color: "#1e1e2e", cursor: "pointer",
        fontSize: "13px", fontWeight: "bold",
    });
    searchBtn.onclick = () => doTranslateAndSearch();

    searchBar.appendChild(input);
    searchBar.appendChild(searchBtn);

    const title = document.createElement("div");
    title.style.cssText = "font-weight:bold;margin-bottom:8px;flex-shrink:0;min-height:1.2em;color:#89b4fa;";

    const scroll = document.createElement("div");
    Object.assign(scroll.style, {
        overflowY: "auto", flex: "1", paddingRight: "4px",
    });
    const grid = document.createElement("div");
    Object.assign(grid.style, {
        display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "10px",
    });
    scroll.appendChild(grid);

    const imgObserver = new IntersectionObserver((entries) => {
        for (const e of entries) {
            if (e.isIntersecting) {
                const src = e.target.getAttribute("data-src");
                if (src) e.target.src = src;
            } else {
                e.target.removeAttribute("src");
            }
        }
    }, { root: scroll, rootMargin: "2000px" });

    const footer = document.createElement("div");
    Object.assign(footer.style, {
        flexShrink: "0", marginTop: "10px", textAlign: "center",
    });
    const moreBtn = document.createElement("button");
    moreBtn.style.display = "none";
    Object.assign(moreBtn.style, {
        padding: "8px 32px", borderRadius: "8px", border: "none",
        background: "#89b4fa", color: "#1e1e2e", cursor: "pointer",
        fontSize: "13px", fontWeight: "bold",
    });
    moreBtn.onclick = () => _loadMore();
    footer.appendChild(moreBtn);

    card.appendChild(topBar);
    card.appendChild(searchBar);
    card.appendChild(title);
    card.appendChild(scroll);
    card.appendChild(footer);
    overlay.appendChild(card);
    overlay.onclick = (e) => { if (e.target === overlay) { _saveState(); overlay.remove(); } };
    document.body.appendChild(overlay);

    setTimeout(() => input.focus(), 100);

    function _saveState() {
        if (_lastSearch) {
            _lastSearch.allPosts = allPosts;
            _lastSearch.nextPage = nextPage;
            _lastSearch.exhausted = exhausted;
            _lastSearch.renderedCount = renderedCount;
            _lastSearch.scrollTop = scroll.scrollTop;
        }
    }

    function _restoreCheckmark() {
        if (_lastSearch && _lastSearch.selectedPostId) {
            const el = grid.querySelector(`[data-post-id="${_lastSearch.selectedPostId}"] .zako-check`);
            if (el) el.style.display = "flex";
        }
    }

    if (_lastSearch && _lastSearch.apiKey === apiKey && _lastSearch.tagMode === tagMode) {
        input.value = _lastSearch.displayTag || _lastSearch.apiTag;
        currentApiTag = _lastSearch.apiTag;
        currentDisplayTag = _lastSearch.displayTag;
        if (_lastSearch.allPosts && _lastSearch.allPosts.length > 0) {
            allPosts = _lastSearch.allPosts;
            nextPage = _lastSearch.nextPage;
            exhausted = _lastSearch.exhausted;
            renderedCount = 0;
            grid.innerHTML = "";
            _appendNew();
            _restoreCheckmark();
            requestAnimationFrame(() => { scroll.scrollTop = _lastSearch.scrollTop || 0; });
            if (!exhausted) _triggerPrefetch();
        } else {
            _loadInitial();
        }
    }

    function _notify(msg) {
        title.textContent = msg;
        title.style.color = "#a6e3a1";
        title.style.transition = "none";
        setTimeout(() => {
            title.textContent = currentDisplayTag + "  共" + allPosts.length + "张";
            title.style.color = "#89b4fa";
            title.style.transition = "color 0.3s";
        }, 2000);
    }

    function _filterTags(post) {
        const artist = post.tag_string_artist || "";
        const copyright = post.tag_string_copyright || "";
        const character = post.tag_string_character || "";
        const general = post.tag_string_general || "";

        function _splitJoin(raw) {
            return raw.split(/\s+/).filter((t) => t).join(", ").replace(/_/g, " ");
        }

        const parts = [];
        if (tagMode !== "不含画师" && artist) {
            const artistParts = artist.split(/\s+/).filter((t) => t);
            if (tagMode === "anima画师") {
                parts.push(artistParts.map((t) => (t.startsWith("@") ? t : "@" + t)).join(", ").replace(/_/g, " "));
            } else {
                parts.push(_splitJoin(artist));
            }
        }
        if (copyright) parts.push(_splitJoin(copyright));
        if (character) parts.push(_splitJoin(character));
        if (general) parts.push(_splitJoin(general));
        return parts.join(",\n");
    }

    function _buildItem(post, index) {
        const item = document.createElement("div");
        item.setAttribute("data-post-id", post.id);
        Object.assign(item.style, {
            position: "relative", background: "#313244", borderRadius: "8px", overflow: "hidden",
            cursor: "pointer", textAlign: "center", transition: "transform 0.1s, box-shadow 0.1s",
        });
        item.onmouseenter = () => {
            item.style.transform = "scale(1.03)";
            item.style.boxShadow = "0 0 12px rgba(137,180,250,0.3)";
        };
        item.onmouseleave = () => {
            item.style.transform = "scale(1)";
            item.style.boxShadow = "none";
        };
        item.onclick = () => {
            onSelect(_filterTags(post));
            _notify("✓ 已填入提示词");
            grid.querySelectorAll(".zako-check").forEach((c) => (c.style.display = "none"));
            const check = item.querySelector(".zako-check");
            if (check) check.style.display = "flex";
            if (_lastSearch) _lastSearch.selectedPostId = post.id;
        };

        const checkmark = document.createElement("span");
        checkmark.className = "zako-check";
        checkmark.textContent = "✓";
        checkmark.setAttribute("data-post-id", post.id);
        Object.assign(checkmark.style, {
            position: "absolute", top: "4px", right: "4px", zIndex: "2",
            width: "22px", height: "22px", borderRadius: "50%",
            background: "#a6e3a1", color: "#1e1e2e",
            fontSize: "14px", fontWeight: "bold",
            display: "none", alignItems: "center", justifyContent: "center",
            pointerEvents: "none",
        });

        const img = document.createElement("img");
        let src = post.preview_file_url || "";
        if (src) src = "/zako/proxy_image?url=" + encodeURIComponent(src);
        img.setAttribute("data-src", src);
        img.src = src;
        imgObserver.observe(img);
        img.onerror = function() {
            if (!this.getAttribute("data-src")) return;
            this.style.display = "none";
            const fallback = document.createElement("div");
            fallback.textContent = "🖼";
            fallback.style.cssText = "width:150px;height:150px;display:flex;align-items:center;justify-content:center;color:#6c7086;font-size:32px;";
            this.parentNode.insertBefore(fallback, this);
        };
        Object.assign(img.style, {
            width: "100%", aspectRatio: "1 / 1", objectFit: "cover",
            display: "block",
        });

        const info = document.createElement("div");
        info.style.padding = "4px 6px";
        const favLine = document.createElement("div");
        favLine.textContent = "\u2665" + (post.fav_count || 0) + "  #" + (index + 1);
        favLine.style.cssText = "color:#f9e2af;font-size:11px;";
        const idLine = document.createElement("div");
        idLine.textContent = "ID:" + post.id + "  " + (post.rating || "?").toUpperCase();
        idLine.style.cssText = "color:#6c7086;font-size:10px;";
        info.appendChild(favLine);
        info.appendChild(idLine);
        item.appendChild(checkmark);
        item.appendChild(img);
        item.appendChild(info);
        return item;
    }

    function _appendNew() {
        const newPosts = allPosts.slice(renderedCount);
        for (let i = 0; i < newPosts.length; i++) {
            grid.appendChild(_buildItem(newPosts[i], renderedCount + i));
        }
        renderedCount = allPosts.length;
        _updateFooter();
    }

    function _updateFooter() {
        title.textContent = currentDisplayTag + "  共" + allPosts.length + "张";
        if (allPosts.length === 0 && !loading) {
            moreBtn.style.display = "none";
        } else if (exhausted) {
            moreBtn.style.display = "block";
            moreBtn.textContent = "已加载全部";
            moreBtn.style.background = "#45475a";
            moreBtn.style.color = "#6c7086";
            moreBtn.style.cursor = "default";
        } else {
            moreBtn.style.display = "block";
            moreBtn.textContent = "\u25bc 继续抓取";
            moreBtn.style.background = "#89b4fa";
            moreBtn.style.color = "#1e1e2e";
            moreBtn.style.cursor = "pointer";
        }
    }

    function _resetResults() {
        allPosts = [];
        nextPage = 1;
        exhausted = false;
        renderedCount = 0;
        grid.innerHTML = "";
        title.textContent = currentDisplayTag + "  正在爬取...";
        moreBtn.style.display = "none";
    }

    async function _fetchPages(start, count) {
        const promises = [];
        for (let i = 0; i < count; i++) {
            promises.push(_fetchPage(currentApiTag, apiKey, start + i));
        }
        const pages = await Promise.all(promises);
        const merged = [];
        for (let i = 0; i < pages.length; i++) {
            if (pages[i].length > 0) merged.push(...pages[i]);
        }
        merged.sort((a, b) => (b.fav_count || 0) - (a.fav_count || 0));
        return merged;
    }

    function _triggerPrefetch() {
        if (prefetchPending || exhausted) return;
        prefetchPending = true;
        prefetchedPosts = null;
        const target = nextPage;
        _fetchPage(currentApiTag, apiKey, target).then((posts) => {
            if (posts.length > 0) prefetchedPosts = { page: target, posts: posts };
            prefetchPending = false;
        }).catch(() => {
            prefetchedPosts = null;
            prefetchPending = false;
        });
    }

    async function _loadInitial() {
        if (loading || !currentApiTag) return;
        loading = true;

        try {
            const posts = await _fetchPages(1, 3);
            if (posts.length === 0) {
                exhausted = true;
            } else {
                allPosts.push(...posts);
                nextPage = 4;
            }
        } catch (err) {
            exhausted = true;
            title.textContent = "请求失败: " + (err.message || "网络错误");
            title.style.color = "#f38ba8";
        }

        _appendNew();
        loading = false;
        _triggerPrefetch();
    }

    async function _loadMore() {
        if (loading || exhausted || !currentApiTag) return;
        loading = true;
        moreBtn.textContent = "加载中...";

        try {
            let posts;
            if (prefetchedPosts && prefetchedPosts.page === nextPage) {
                posts = prefetchedPosts.posts;
                prefetchedPosts = null;
            } else {
                posts = await _fetchPage(currentApiTag, apiKey, nextPage);
            }
            if (posts.length === 0) {
                exhausted = true;
            } else {
                posts.sort((a, b) => (b.fav_count || 0) - (a.fav_count || 0));
                allPosts.push(...posts);
                nextPage++;
            }
        } catch (err) {
            exhausted = true;
            title.textContent = "请求失败: " + (err.message || "网络错误");
            title.style.color = "#f38ba8";
        }

        _appendNew();
        loading = false;
        _triggerPrefetch();
    }

    async function doTranslateAndSearch() {
        const raw = input.value.trim();
        if (!raw) return;

        searchBtn.textContent = "搜索中...";
        searchBtn.disabled = true;

        let apiTag = raw;
        let displayTag = raw;

        if (/[\u4e00-\u9fff]/.test(raw)) {
            try {
                const resp = await fetch("/zako/tag_translate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text: raw }),
                });
                const result = await resp.json();

                if (result.found) {
                    apiTag = result.english;
                    displayTag = raw + " → " + result.english;
                    if (result.suggestions && result.suggestions.length > 0) {
                        _showSuggestionsInModal(raw, result.suggestions, (chosen) => {
                            currentApiTag = chosen;
                            currentDisplayTag = raw + " → " + chosen;
                            _resetResults();
                            _loadInitial();
                            _lastSearch = { apiTag: chosen, displayTag: raw + " → " + chosen, apiKey, tagMode };
                        });
                    }
                } else if (result.suggestions && result.suggestions.length > 0) {
                    searchBtn.textContent = "搜索";
                    searchBtn.disabled = false;
                    _showSuggestionsInModal(raw, result.suggestions, (chosen) => {
                        currentApiTag = chosen;
                        currentDisplayTag = raw + " → " + chosen;
                        _resetResults();
                        _loadInitial();
                        _lastSearch = { apiTag: chosen, displayTag: raw + " → " + chosen, apiKey, tagMode };
                    });
                    return;
                }
            } catch (_) {}
        }

        currentApiTag = apiTag;
        currentDisplayTag = displayTag;
        _resetResults();
        _loadInitial();
        searchBtn.textContent = "搜索";
        searchBtn.disabled = false;

        _lastSearch = { apiTag, displayTag, apiKey, tagMode };
    }

    function _showSuggestionsInModal(query, suggestions, onPick) {
        const old = document.getElementById("zako-dan-suggest");
        if (old) old.remove();

        const sugCard = document.createElement("div");
        sugCard.id = "zako-dan-suggest";
        Object.assign(sugCard.style, {
            background: "#313244", borderRadius: "8px", padding: "10px",
            marginBottom: "8px", flexShrink: "0",
        });

        const sugTitle = document.createElement("div");
        sugTitle.textContent = '未精确匹配 "' + query + '"，相似词：';
        sugTitle.style.cssText = "font-size:12px;color:#a6adc8;margin-bottom:6px;";

        const sugList = document.createElement("div");
        Object.assign(sugList.style, {
            display: "flex", flexWrap: "wrap", gap: "6px",
        });

        for (const s of suggestions) {
            const tag = document.createElement("span");
            tag.textContent = s.cn + " → " + s.en;
            Object.assign(tag.style, {
                padding: "3px 10px", borderRadius: "6px",
                background: "#45475a", cursor: "pointer",
                fontSize: "12px", transition: "background 0.1s",
            });
            tag.onmouseenter = () => (tag.style.background = "#585b70");
            tag.onmouseleave = () => (tag.style.background = "#45475a");
            tag.onclick = () => {
                sugCard.remove();
                onPick(s.en);
            };
            sugList.appendChild(tag);
        }

        const rawTag = document.createElement("span");
        rawTag.textContent = "直接用原文";
        Object.assign(rawTag.style, {
            padding: "3px 10px", borderRadius: "6px",
            background: "#585b70", cursor: "pointer",
            fontSize: "12px",
        });
        rawTag.onclick = () => {
            sugCard.remove();
            onPick(query);
        };
        sugList.appendChild(rawTag);

        sugCard.appendChild(sugTitle);
        sugCard.appendChild(sugList);

        card.insertBefore(sugCard, title);
    }
}


app.registerExtension({
    name: "ZakoDanbooruSearch",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "ZakoDanbooruSearch") return;

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;

        nodeType.prototype.onNodeCreated = function () {
            const r = origOnNodeCreated?.apply(this, arguments);

            this.color = "#89b4fa";
            this.bgcolor = "#1e1e2e";

            const selectedWidget = this.widgets.find((w) => w.name === "selected_tags");
            if (selectedWidget) {
                selectedWidget.computeSize = function (width) {
                    return [width, 120];
                };
            }

            const apiKeyWidget = this.widgets.find((w) => w.name === "api_key");
            if (apiKeyWidget) {
                apiKeyWidget.serialize = false;
                const STORAGE_KEY = "zako_danbooru_api_key";
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved && !apiKeyWidget.value) {
                    apiKeyWidget.value = saved;
                }
                const origCallback = apiKeyWidget.callback;
                apiKeyWidget.callback = function (value) {
                    localStorage.setItem(STORAGE_KEY, value || "");
                    return origCallback?.call(this, value);
                };
            }

            const tagModeWidget = this.widgets.find((w) => w.name === "tag_mode");
            const self = this;

            const btn = this.addWidget("button", "🔍 搜索", null, () => {
                const apiKey = apiKeyWidget?.value?.trim() || "";
                const tagMode = tagModeWidget?.value || "不含画师";

                _showSearchModal(apiKey, tagMode, (tags) => {
                    if (selectedWidget) selectedWidget.value = tags;
                    self.setDirtyCanvas(true, true);
                });
            });
            btn.serialize = false;

            return r;
        };
    },
});
