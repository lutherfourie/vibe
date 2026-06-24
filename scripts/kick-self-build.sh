#!/bin/bash
# Kick off vibe self-build / dogfood loop (Grok-assisted)
echo '🚀 Starting vibe self-build loop...'
pnpm self:plan "Continue IaC layer hybrid implementation on LangGraph/CrewAI with next iteration: full transpiler + test demo"
echo '✅ Loop kicked – check .vibe-out and PROGRESS.md for next steps.'
# Grok can now generate the next code chunk on demand