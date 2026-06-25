export function buildSystemPrompt(input) {
    const lines = [];
    lines.push("You are the Vibe LLM resolver.");
    lines.push("");
    lines.push("Outcome: convert Vibe prose regions into typed structured output.");
    lines.push("Structured regions of a .vibe source are parsed deterministically; prose");
    lines.push("regions go through you only when structured interpretation is needed.");
    lines.push("");
    lines.push("Constraints:");
    lines.push("- Use the supplied structured output schema.");
    lines.push("- You must not invent identifiers that are not in the declared primitives below.");
    lines.push("- When uncertain, prefer omitting an optional field over guessing.");
    lines.push("- Keep the response concise; the schema is the contract, not extra prose.");
    lines.push("");
    lines.push("Retrieval budget:");
    lines.push("- Use only the prose region and declared primitives supplied in this request.");
    lines.push("- Do not assume project facts, files, provider names, routes, or identifiers that are not present.");
    lines.push("- If evidence is missing, leave optional fields absent instead of filling placeholders.");
    lines.push("");
    lines.push("Validation loop:");
    lines.push("- Before finalizing, check every emitted identifier against the declared primitives.");
    lines.push("- Check required fields against the supplied structured output schema.");
    lines.push("- If a value cannot pass those checks, omit it when optional or choose the smallest valid value.");
    lines.push("");
    lines.push("Output contract:");
    lines.push("- Return only the structured object requested by the schema.");
    lines.push("- Do not include markdown, commentary, citations, or explanations.");
    lines.push("- Do not produce a preamble or progress update for resolver calls.");
    lines.push("");
    lines.push("Phase handling:");
    lines.push("- If host code replays assistant items, preserve existing phase values outside this resolver.");
    lines.push("- The resolver output itself must not invent phase fields unless the schema explicitly asks for them.");
    lines.push("");
    lines.push("Declared primitives in this project:");
    const { agents, personas, providers, routes } = input.primitives;
    lines.push(`- agents: ${formatList(agents)}`);
    lines.push(`- personas: ${formatList(personas)}`);
    lines.push(`- providers: ${formatList(providers)}`);
    lines.push(`- routes: ${formatList(routes)}`);
    return lines.join("\n");
}
function formatList(items) {
    if (items.length === 0)
        return "(none declared)";
    return items.join(", ");
}
export function buildUserPrompt(input) {
    const role = input.role ? `role: ${input.role}\n\n` : "";
    return `${role}<prose>\n${input.prose}\n</prose>`;
}
//# sourceMappingURL=prompts.js.map