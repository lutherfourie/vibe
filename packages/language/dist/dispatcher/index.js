import { detectShape } from "./detect-shape.js";
import { slicePureStructured } from "./slice-pure.js";
import { sliceMarkdown } from "./slice-markdown.js";
import { sliceConversation } from "./slice-conversation.js";
export { detectShape } from "./detect-shape.js";
export function dispatchSource(source) {
    const shape = detectShape(source);
    switch (shape) {
        case "pure-structured":
            return { shape, regions: slicePureStructured(source) };
        case "markdown":
            return { shape, regions: sliceMarkdown(source) };
        case "conversation":
            return { shape, regions: sliceConversation(source) };
    }
}
//# sourceMappingURL=index.js.map