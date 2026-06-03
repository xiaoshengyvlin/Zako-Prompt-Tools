import { app } from "../../../scripts/app.js";


const DEFAULT_SYSTEM_PROMPT = "你是一个专业的AI绘画提示词翻译专家。将输入的标签翻译为目标语言，严格保持原格式。\n\n规则：\n- 自动识别输入语言方向（中文→英文 / 英文→中文）\n- 逗号、换行、空格等所有分隔符原样保留\n- 数字、符号、角色名、专有名词不翻译\n- 采用AI绘画/Danbooru社区通用译法\n- 只输出翻译结果，不添加任何解释或问候语";


app.registerExtension({
    name: "ZakoTagTranslate",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "ZakoTagTranslate") return;

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = origOnNodeCreated?.apply(this, arguments);

            this.color = "#a6e3a1";
            this.bgcolor = "#1e1e2e";

            const apiKeyWidget = this.widgets.find((w) => w.name === "api_key");
            if (apiKeyWidget) {
                apiKeyWidget.serialize = false;
                const STORAGE_KEY = "zako_siliconflow_api_key";
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

            const spWidget = this.widgets.find((w) => w.name === "system_prompt");
            if (spWidget) {
                const v = Array.isArray(spWidget.value) ? spWidget.value.join("\n") : (spWidget.value || "");
                if (!v.trim()) {
                    spWidget.value = DEFAULT_SYSTEM_PROMPT;
                }
            }

            return r;
        };
    },
});
