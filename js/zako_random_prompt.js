import { app } from "../../../scripts/app.js";


app.registerExtension({
    name: "ZakoRandomPrompt",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "ZakoRandomPrompt") return;

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = origOnNodeCreated?.apply(this, arguments);

            this.color = "#cba6f7";
            this.bgcolor = "#1e1e2e";

            const enableWidget = this.widgets.find((w) => w.name === "enable_random");
            const self = this;

            if (enableWidget) {
                enableWidget.type = "hidden";
                enableWidget.computeSize = () => [0, -4];
            }

            const getLabel = () => {
                if (!enableWidget) return "🎲 随机模式";
                return enableWidget.value ? "🎲 随机模式" : "📌 固定模式";
            };

            const btn = this.addWidget("button", getLabel(), null, () => {
                if (!enableWidget) return;
                const wasEnabled = enableWidget.value;
                enableWidget.value = !enableWidget.value;
                btn.name = getLabel();
                self.setDirtyCanvas(true, true);
                if (!wasEnabled && enableWidget.value) {
                    self.applyToGraph();
                }
            });
            btn.serialize = false;

            const origOnExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (msg) {
                origOnExecuted?.apply(this, arguments);
                if (btn) {
                    btn.name = getLabel();
                    this.setDirtyCanvas(true);
                }
            };

            return r;
        };
    },
});
