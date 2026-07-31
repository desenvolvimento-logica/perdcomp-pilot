ALTER TABLE public.acompanhamentos
  ADD COLUMN IF NOT EXISTS ordem_servico text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS terceiro boolean NOT NULL DEFAULT false;