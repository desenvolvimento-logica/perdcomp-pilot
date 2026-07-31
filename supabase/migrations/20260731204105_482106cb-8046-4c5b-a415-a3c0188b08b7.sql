ALTER TABLE public.acompanhamentos
  ADD COLUMN IF NOT EXISTS pagamento_confirmado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pagamento_confirmado_em date,
  ADD COLUMN IF NOT EXISTS compensacao_oficio_opcao text NOT NULL DEFAULT '';