const ROLE_TAG = /^###\s+(user|assistant|system)\b/m;
const MD_HEADING = /^#\s+\S/m;
const FENCED_VIBE = /^```vibe(\s|$)/m;
export function detectShape(source) {
    // Conversation wins: a role tag is unambiguous.
    if (ROLE_TAG.test(source))
        return "conversation";
    // Markdown wins next: leading H1 heading + at least one fenced vibe block.
    if (MD_HEADING.test(source) && FENCED_VIBE.test(source))
        return "markdown";
    // Default: parse it as pure structured.
    return "pure-structured";
}
//# sourceMappingURL=detect-shape.js.map