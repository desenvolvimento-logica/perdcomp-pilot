import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const sincronizar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { sincronizarComGob, gerarAlertasDePrazo } = await import("@/lib/gob.server");
    const resultado = await sincronizarComGob(3000);
    const prazos = await gerarAlertasDePrazo();
    return { ...resultado, alertas: resultado.alertas + prazos };
  });

export const listarDeclaracoes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [decls, acomps, achados, alertas, perfis] = await Promise.all([
      supabase
        .from("declaracoes")
        .select(
          "id, numero_perdcomp, cnpj, nome, razao_social, tipo_documento, tipo_credito, grupo_tributo, codigo_receita, situacao, ajuda_situacao, periodo_apuracao, data_transmissao, ultimo_registro, valor_total_credito, valor_utilizado, saldo_restante, credito_atualizado, total_debitos, processo_administrativo, processo_judicial, ultima_sincronizacao",
        )
        .order("data_transmissao", { ascending: false, nullsFirst: false })
        .limit(3000),
      supabase.from("acompanhamentos").select("*"),
      supabase.from("auditoria_achados").select("declaracao_id, revisado"),
      supabase.from("alertas").select("id, declaracao_id, tipo, prioridade, mensagem, resolvido, criado_em"),
      supabase.from("profiles").select("id, nome, email"),
    ]);

    return {
      declaracoes: decls.data ?? [],
      acompanhamentos: acomps.data ?? [],
      achados: achados.data ?? [],
      alertas: alertas.data ?? [],
      perfis: perfis.data ?? [],
    };
  });

export const obterDeclaracao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [decl, acomp, achados, historico, alertas, log, perfis] = await Promise.all([
      supabase.from("declaracoes").select("*").eq("id", data.id).maybeSingle(),
      supabase.from("acompanhamentos").select("*").eq("declaracao_id", data.id).maybeSingle(),
      supabase.from("auditoria_achados").select("*").eq("declaracao_id", data.id).order("criado_em"),
      supabase
        .from("status_historico")
        .select("*")
        .eq("declaracao_id", data.id)
        .order("registrado_em", { ascending: false }),
      supabase.from("alertas").select("*").eq("declaracao_id", data.id).order("criado_em", { ascending: false }),
      supabase
        .from("log_alteracoes")
        .select("*")
        .eq("declaracao_id", data.id)
        .order("criado_em", { ascending: false })
        .limit(100),
      supabase.from("profiles").select("id, nome, email"),
    ]);

    return {
      declaracao: decl.data,
      acompanhamento: acomp.data,
      achados: achados.data ?? [],
      historico: historico.data ?? [],
      alertas: alertas.data ?? [],
      log: log.data ?? [],
      perfis: perfis.data ?? [],
    };
  });

const acompanhamentoSchema = z.object({
  declaracao_id: z.string().uuid(),
  ordem_servico: z.string().max(60).default(""),
  terceiro: z.boolean().default(false),
  aviso_pagamento: z.boolean(),
  aviso_pagamento_data: z.string().nullable(),
  aviso_pagamento_prazo: z.string().nullable(),
  compensacao_oficio: z.boolean(),
  compensacao_oficio_prazo: z.string().nullable(),
  intimacao: z.boolean(),
  intimacao_prazo: z.string().nullable(),
  encerrado: z.boolean(),
  encerrado_em: z.string().nullable(),
  observacao: z.string().max(5000),
});

export const salvarAcompanhamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => acompanhamentoSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;

    const { data: perfil } = await supabaseAdmin.from("profiles").select("nome").eq("id", userId).maybeSingle();
    const { data: anterior } = await supabaseAdmin
      .from("acompanhamentos")
      .select("*")
      .eq("declaracao_id", data.declaracao_id)
      .maybeSingle();

    if (anterior?.encerrado && !data.encerrado) {
      const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
      if (!isAdmin) throw new Error("Somente o Administrador pode reabrir um acompanhamento encerrado.");
    }

    const registro = { ...data, updated_at: new Date().toISOString() };
    const { error } = await supabaseAdmin
      .from("acompanhamentos")
      .upsert(registro, { onConflict: "declaracao_id" });
    if (error) throw new Error(error.message);

    const campos: Array<[string, string]> = [
      ["responsavel_id", "Responsável"],
      ["aviso_pagamento", "Aviso de pagamento"],
      ["aviso_pagamento_data", "Data do aviso de pagamento"],
    ["aviso_pagamento_prazo", "Prazo de atendimento do aviso de pagamento"],
      ["compensacao_oficio", "Compensação de ofício"],
      ["compensacao_oficio_prazo", "Prazo da compensação de ofício"],
      ["intimacao", "Intimação — análise preliminar"],
      ["intimacao_prazo", "Prazo de atendimento da intimação"],
      ["encerrado", "Acompanhamento encerrado"],
      ["encerrado_em", "Data de encerramento"],
      ["observacao", "Observação"],
    ];
    const linhas = campos
      .filter(([campo]) => {
        const antes = (anterior as Record<string, unknown> | null)?.[campo] ?? null;
        const depois = (data as Record<string, unknown>)[campo] ?? null;
        return String(antes ?? "") !== String(depois ?? "");
      })
      .map(([campo, rotulo]) => ({
        declaracao_id: data.declaracao_id,
        usuario_id: userId,
        usuario_nome: perfil?.nome ?? "",
        campo: rotulo,
        valor_anterior: String((anterior as Record<string, unknown> | null)?.[campo] ?? ""),
        valor_novo: String((data as Record<string, unknown>)[campo] ?? ""),
      }));
    if (linhas.length > 0) await supabaseAdmin.from("log_alteracoes").insert(linhas);

    return { ok: true, alteracoes: linhas.length };
  });

export const revisarAchado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("auditoria_achados")
      .update({ revisado: true, revisado_por: context.userId, revisado_em: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resolverAlerta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("alertas")
      .update({ resolvido: true, resolvido_por: context.userId, resolvido_em: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const meuAcesso = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [perfil, papeis] = await Promise.all([
      context.supabase.from("profiles").select("id, nome, email").eq("id", context.userId).maybeSingle(),
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
    ]);
    return {
      perfil: perfil.data,
      papeis: (papeis.data ?? []).map((p) => p.role),
      admin: (papeis.data ?? []).some((p) => p.role === "admin"),
    };
  });

export const listarEquipe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [perfis, papeis] = await Promise.all([
      context.supabase.from("profiles").select("id, nome, email, created_at").order("created_at"),
      context.supabase.from("user_roles").select("user_id, role"),
    ]);
    return { perfis: perfis.data ?? [], papeis: papeis.data ?? [] };
  });

export const criarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        nome: z.string().min(2).max(120),
        email: z.string().email(),
        senha: z.string().min(8).max(120),
        papel: z.enum(["admin", "operador"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Apenas Administradores podem cadastrar usuários.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: criado, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.senha,
      email_confirm: true,
      user_metadata: { nome: data.nome },
    });
    if (error || !criado.user) throw new Error(error?.message ?? "Não foi possível criar o usuário.");

    await supabaseAdmin.from("profiles").upsert({ id: criado.user.id, nome: data.nome, email: data.email });
    await supabaseAdmin.from("user_roles").delete().eq("user_id", criado.user.id);
    await supabaseAdmin.from("user_roles").insert({ user_id: criado.user.id, role: data.papel });
    return { ok: true };
  });

export const definirPapel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ user_id: z.string().uuid(), papel: z.enum(["admin", "operador"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Apenas Administradores podem alterar perfis de acesso.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("user_roles").insert({ user_id: data.user_id, role: data.papel });
    return { ok: true };
  });

export const precisaBootstrap = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin.from("profiles").select("id", { count: "exact", head: true });
  return { vazio: (count ?? 0) === 0 };
});

export const criarPrimeiroAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        nome: z.string().min(2).max(120),
        email: z.string().email(),
        senha: z.string().min(8).max(120),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin.from("profiles").select("id", { count: "exact", head: true });
    if ((count ?? 0) > 0) throw new Error("Já existe um administrador cadastrado. Peça acesso a ele.");

    const { data: criado, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.senha,
      email_confirm: true,
      user_metadata: { nome: data.nome },
    });
    if (error || !criado.user) throw new Error(error?.message ?? "Não foi possível criar o administrador.");
    await supabaseAdmin.from("profiles").upsert({ id: criado.user.id, nome: data.nome, email: data.email });
    await supabaseAdmin.from("user_roles").delete().eq("user_id", criado.user.id);
    await supabaseAdmin.from("user_roles").insert({ user_id: criado.user.id, role: "admin" });
    return { ok: true };
  });
