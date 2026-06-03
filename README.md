# Zako-Prompt-Tools — ComfyUI 提示词工具组

基于 Danbooru API 和 20 万+内置提示词库的 ComfyUI 自定义节点组，提供随机抽卡、灵感搜索、标签翻译和提示词增强。

## 安装

1. 复制到 ComfyUI `custom_nodes/Zako-Prompt-Tools/`
2. 安装依赖：

```bash
pip install -r requirements.txt
```

## 节点列表

| 节点 | 功能 | API 依赖 |
|------|------|----------|
| **Zako-Random-Prompt** | 从 20 万+本地提示词库随机抽卡，支持 G/S/Q/E 分级过滤和主题筛选 | 无 |
| **Zako-Danbooru-Search** | D 站灵感搜索，支持中文→英文翻译、5列缩略图预览、tag 输出筛选 | D 站 API（可选） |
| **Zako-Tag-Translate** | 通过 OpenAI 兼容 API 翻译提示词标签（中↔英） | 硅基流动 / DeepSeek 等 |
| **Zako-Prompt-Enhance** | 通过 LLM 为标签末尾追加自然语言场景描述，遇到审查自动回退 | 硅基流动 / DeepSeek 等 |

## 数据层

### 提示词库 (20万+条)
- 原始数据：`data/json/{G,S,Q,E}/` 下 76 个主题 JSON 文件
- 首次运行时自动构建 `data/prompts.db`（SQLite, WAL 模式, 毫秒级随机查询）
- 状态追踪：`data/.build_state.json`，源文件变更自动重建

### 中英文映射
- `mapping/tag.sqlite` — 30 万条 Danbooru 标签中英对照
- 搜索节点和翻译节点用于中文→英文翻译

## 搜索节点特性

- 中文标签输入 → 自动翻译为英文搜索 D 站 API
- 5 列缩略图网格，100 张/页，按收藏数排序
- 并行初始加载（3 页 300 张）+ 后台预取
- 分类输出：画师 / 版权 / 角色 / 通用，分行 + 逗号分隔
- API Key 存 localStorage，`serialize=false` 分享工作流不泄露
- 图片代理绕 Electron CSP + 浏览器缓存 24 小时

## 翻译节点特性

- 接入 OpenAI 兼容 API（硅基流动 / DeepSeek / 任意）
- 自动识别中英方向，严格保留输入格式
- 数字、符号、角色名、专有名词保留不译
- 系统提示词框可自定义翻译行为
- API Key 通过 localStorage 保护，`serialize=false`

## 增强节点特性

- 输入标签 → 输出标签 + 自然语言场景描述
- 描述重点：角色姿态、场景构图、光影氛围、情绪基调
- 遇到敏感词 API 拒绝时自动回退返回原始标签，不中断流程
- 系统提示词可定制增强策略（Anima 格式优化、特定风格等）
- 与翻译节点串联使用：翻译 → 增强

## 目录结构

```
Zako-Prompt-Tools/
├── __init__.py                         # ComfyUI 入口
├── server_routes.py                    # API 路由（标签查询、图片代理）
├── requirements.txt                    # 依赖
├── nodes/
│   ├── __init__.py
│   ├── zako_random_prompt.py           # 随机抽卡节点
│   ├── zako_danbooru_search.py         # D 站搜索节点
│   ├── zako_tag_translate.py           # 标签翻译节点
│   └── zako_prompt_enhance.py          # 提示词增强节点
├── js/
│   ├── zako_random_prompt.js
│   ├── zako_danbooru_search.js
│   ├── zako_tag_translate.js
│   └── zako_prompt_enhance.js
├── data/
│   ├── database.py                     # SQLite 自动构建
│   ├── db_builder.py                   # 手动重建 CLI
│   └── json/{G,S,Q,E}/                # 76 个主题 JSON
└── mapping/
    └── tag.sqlite                      # 30 万中英对照
```

## 技术要点

- SQLite WAL 模式 + 文件锁防并发构建
- 实例变量缓存避免多节点互污染
- D 站 API：客户端排序替代服务端排序（避免超时）
- Electron CSP：外部图片走代理路由 + 浏览器 HTTP 缓存
- IntersectionObserver 自动卸载离屏图片，控制内存
- API Key：`serialize=false` + localStorage 持久化，不保存到工作流 JSON
- LLM 安全兜底：检测 API 拒绝话术，自动回退原始输入保证节点不断流
