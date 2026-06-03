-- Fix: add updated_at to agent_commands so the set_updated_at trigger works (was missing in initial remote control migration, causing PATCH 400 on updates).
ALTER TABLE public.agent_commands ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();

-- Ensure the trigger exists (re-create idempotently)
DROP TRIGGER IF EXISTS set_agent_commands_updated_at ON public.agent_commands;
CREATE TRIGGER set_agent_commands_updated_at
BEFORE UPDATE ON public.agent_commands
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add index for updated_at like other tables
CREATE INDEX IF NOT EXISTS idx_agent_commands_updated ON public.agent_commands (updated_at desc);
