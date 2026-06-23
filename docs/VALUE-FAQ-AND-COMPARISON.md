# Vibe FAQ & Competitor Comparison (Brutal Honesty)

**Q: What does vibe really do that I can't do with Cursor + Claude + some scripts?**
A: It gives **declarative, persistent, coordinated execution** with built-in primitives for long-horizon work. Cursor/Claude excel at writing code. Vibe excels at *running and evolving* multi-step agent systems reliably.

**Key Differentiators**
- **Vs Cursor / pure LLM coding**: Vibe has stateful runtime, lanes with checkpoint/resume, dashboard, and self-plan. Not just generate — orchestrate over sessions.
- **Vs CrewAI/LangGraph**: More infrastructure-focused (IaC style) + language spec + hybrid runtime (Go + TS) + self-host/VSCode emphasis. Less 'framework API' more 'language'.
- **Vs Terraform/Pulumi for agents**: Agents are dynamic/not declarative usually. Vibe makes them so while adding AI-native execution.

**Simple Analogy**
Prompting = writing a recipe on napkin.
Vibe = writing a recipe in a programmable cookbook that can cook, adapt, remember previous meals, and improve the book itself.

**Recommendation to validate**
1. Pick one small but annoying workflow (e.g. 'review feedback and update GDD' from your examples).
2. Implement it in vibe lane.
3. Compare time/effort/maintainability to ad-hoc approach.
4. See if the continuity + self-plan pays off.

This file is in repo for quick reference.
