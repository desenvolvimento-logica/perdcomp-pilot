ALTER TABLE public.declaracoes
  ADD COLUMN IF NOT EXISTS arquivo_documento_id text,
  ADD COLUMN IF NOT EXISTS arquivo_documento_nome text,
  ADD COLUMN IF NOT EXISTS arquivo_recibo_id text,
  ADD COLUMN IF NOT EXISTS arquivo_recibo_nome text,
  ADD COLUMN IF NOT EXISTS numero_recibo text,
  ADD COLUMN IF NOT EXISTS responsavel_nome text,
  ADD COLUMN IF NOT EXISTS responsavel_cpf text,
  ADD COLUMN IF NOT EXISTS responsavel_crc text,
  ADD COLUMN IF NOT EXISTS responsavel_email text,
  ADD COLUMN IF NOT EXISTS responsavel_extraido_em timestamptz;

CREATE INDEX IF NOT EXISTS declaracoes_responsavel_nome_idx ON public.declaracoes (responsavel_nome);