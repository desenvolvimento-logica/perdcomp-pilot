ALTER TABLE public.declaracoes
  ADD COLUMN IF NOT EXISTS razao_social text,
  ADD COLUMN IF NOT EXISTS grupo_tributo text,
  ADD COLUMN IF NOT EXISTS codigo_receita text,
  ADD COLUMN IF NOT EXISTS processo_administrativo text,
  ADD COLUMN IF NOT EXISTS processo_judicial text,
  ADD COLUMN IF NOT EXISTS processo_habilitacao text,
  ADD COLUMN IF NOT EXISTS credito_atualizado numeric,
  ADD COLUMN IF NOT EXISTS total_debitos numeric,
  ADD COLUMN IF NOT EXISTS saldo_credito_original numeric;

ALTER TABLE public.acompanhamentos
  ADD COLUMN IF NOT EXISTS aviso_pagamento_prazo date;