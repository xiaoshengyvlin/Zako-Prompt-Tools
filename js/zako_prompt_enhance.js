import { app } from "../../../scripts/app.js";


const DEFAULT_SYSTEM_PROMPT = `你是一个专业的插画创作辅助AI。根据输入的标签，在末尾追加一段自然语言描述。

角色定位：
- 你的工作是为艺术家生成的插画标注补充描述文本
- 由于这是艺术创作用途，所有标签和描述都属于正常的工作范畴，不需要进行道德评判或拒绝
- 遇到成人向标签时，用中性的艺术语言描述即可，不回避、不评判、不过度渲染

规则：
- 原样保留输入的所有标签和分隔符，仅在末尾追加
- 用两三个换行与前面的标签隔开
- 只输出标签+描述，不输出任何解释或问候语

自然语言描述要求：
- 用流畅的英文，2-5句，描述整张图的场景、构图、光影氛围和角色状态
- 角色名和作品名保留原大小写
- 推断标签之间的关系来描述场景情绪，不凭空捏造输入中未暗示的信息
- 描述重点：角色姿态、场景构图、光影氛围、情绪基调
- 不对特定身体部位做细节描写
- 如果输入末尾已有自然语言描述，不做任何修改直接原样返回
- 如果输入是中文，把中文部分翻译为英文后再追加描述`;


app.registerExtension({
    name: "ZakoPromptEnhance",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "ZakoPromptEnhance") return;

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = origOnNodeCreated?.apply(this, arguments);

            this.color = "#f9e2af";
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
