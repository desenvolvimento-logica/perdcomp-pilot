CREATE TYPE public.app_role AS ENUM ('admin','operador');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "perfis visiveis para equipe" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "usuario atualiza proprio perfil" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipe le papeis" ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email,'@',1)), COALESCE(NEW.email,''))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN (SELECT count(*) FROM public.user_roles) = 0 THEN 'admin'::public.app_role ELSE 'operador'::public.app_role END)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.declaracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gob_id text NOT NULL UNIQUE,
  numero_perdcomp text,
  cnpj text,
  nome text,
  tipo_documento text,
  tipo_credito text,
  situacao text,
  ajuda_situacao text,
  periodo_apuracao text,
  data_transmissao timestamptz,
  ultimo_registro boolean NOT NULL DEFAULT false,
  valor_total_credito numeric,
  valor_utilizado numeric,
  saldo_restante numeric,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  primeira_sincronizacao timestamptz NOT NULL DEFAULT now(),
  ultima_sincronizacao timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.declaracoes TO authenticated;
GRANT ALL ON public.declaracoes TO service_role;
ALTER TABLE public.declaracoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipe le declaracoes" ON public.declaracoes FOR SELECT TO authenticated USING (true);

CREATE TABLE public.status_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  declaracao_id uuid NOT NULL REFERENCES public.declaracoes(id) ON DELETE CASCADE,
  situacao_anterior text,
  situacao_nova text NOT NULL,
  registrado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.status_historico TO authenticated;
GRANT ALL ON public.status_historico TO service_role;
ALTER TABLE public.status_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipe le historico" ON public.status_historico FOR SELECT TO authenticated USING (true);

CREATE TABLE public.acompanhamentos (
  declaracao_id uuid PRIMARY KEY REFERENCES public.declaracoes(id) ON DELETE CASCADE,
  responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  aviso_pagamento boolean NOT NULL DEFAULT false,
  aviso_pagamento_data date,
  compensacao_oficio boolean NOT NULL DEFAULT false,
  compensacao_oficio_prazo date,
  intimacao boolean NOT NULL DEFAULT false,
  intimacao_prazo date,
  encerrado boolean NOT NULL DEFAULT false,
  encerrado_em date,
  observacao text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.acompanhamentos TO authenticated;
GRANT ALL ON public.acompanhamentos TO service_role;
ALTER TABLE public.acompanhamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipe le acompanhamentos" ON public.acompanhamentos FOR SELECT TO authenticated USING (true);

CREATE TABLE public.auditoria_achados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  declaracao_id uuid NOT NULL REFERENCES public.declaracoes(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  descricao text NOT NULL,
  severidade text NOT NULL DEFAULT 'atencao',
  revisado boolean NOT NULL DEFAULT false,
  revisado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revisado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (declaracao_id, codigo)
);
GRANT SELECT, INSERT, UPDATE ON public.auditoria_achados TO authenticated;
GRANT ALL ON public.auditoria_achados TO service_role;
ALTER TABLE public.auditoria_achados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipe le achados" ON public.auditoria_achados FOR SELECT TO authenticated USING (true);

CREATE TABLE public.alertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  declaracao_id uuid NOT NULL REFERENCES public.declaracoes(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  prioridade text NOT NULL DEFAULT 'normal',
  mensagem text NOT NULL,
  resolvido boolean NOT NULL DEFAULT false,
  resolvido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolvido_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.alertas TO authenticated;
GRANT ALL ON public.alertas TO service_role;
ALTER TABLE public.alertas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipe le alertas" ON public.alertas FOR SELECT TO authenticated USING (true);

CREATE TABLE public.log_alteracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  declaracao_id uuid REFERENCES public.declaracoes(id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  usuario_nome text NOT NULL DEFAULT '',
  campo text NOT NULL,
  valor_anterior text,
  valor_novo text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.log_alteracoes TO authenticated;
GRANT ALL ON public.log_alteracoes TO service_role;
ALTER TABLE public.log_alteracoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipe le log" ON public.log_alteracoes FOR SELECT TO authenticated USING (true);

CREATE INDEX idx_declaracoes_situacao ON public.declaracoes (situacao);
CREATE INDEX idx_declaracoes_data ON public.declaracoes (data_transmissao DESC);
CREATE INDEX idx_alertas_abertos ON public.alertas (resolvido, criado_em DESC);