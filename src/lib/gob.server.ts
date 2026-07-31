// Server-only: fala com a API do GOB e grava no banco interno.
// O token nunca sai do servidor.

type GobPerdcomp = Record<string, unknown>;

function gobConfig() {
  const url = process.env["GOB_API_URL"];
  const token = process.env["GOB_API_TOKEN"];
  if (!url || !token) throw new Error("Integração GOB não configurada (GOB_API_URL / GOB_API_TOKEN).");
  return { url: url.replace(/\/$/, ""), token };
}

export async function fetchPerdcomps(maxSize = 200): Promise<GobPerdcomp[]> {
  const { url, token } = gobConfig();
  const qs = new URLSearchParams({
    maxSize: String(maxSize),
    offset: "0",
    orderBy: "modifiedAt",
    order: "desc",
  });
  const res = await fetch(`${url}/api/v1/Perdcomp?${qs.toString()}`, {
    headers: { "X-Api-Key": token, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Falha ao consultar o GOB [${res.status}]: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { list?: GobPerdcomp[] };
  return json.list ?? [];
}

function num(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function toIso(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const iso = s.includes("T") ? s : s.replace(" ", "T") + "Z";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

type Achado = { codigo: string; descricao: string; severidade: "atencao" | "critico" };

export function auditar(r: GobPerdcomp): Achado[] {
  const achados: Achado[] = [];
  const credito = num(r["valorTotalCredito"]) ?? 0;
  const utilizado = num(r["valorUtilizadoPerdcomp"]) ?? 0;
  const difSaldo = num(r["auditoriaDiferencaEntreSaldoProximaDcomp"]);
  const saldoApos = num(r["auditoriaValorTotalCreditoAposUtilizacao"]);

  if (utilizado > credito + 0.01) {
    achados.push({
      codigo: "utilizado_maior_credito",
      descricao: "Valor utilizado é maior que o crédito total reconhecido.",
      severidade: "critico",
    });
  }
  if (difSaldo !== null && Math.abs(difSaldo) > 0.01) {
    achados.push({
      codigo: "divergencia_saldo",
      descricao: `Saldo restante não confere com o valor utilizado nos pedidos (diferença de ${difSaldo.toFixed(2)}).`,
      severidade: "critico",
    });
  }
  if (saldoApos !== null && saldoApos < -0.01) {
    achados.push({
      codigo: "saldo_negativo",
      descricao: "Saldo do crédito ficou negativo após as utilizações informadas.",
      severidade: "critico",
    });
  }
  if (!str(r["periodoApuracao"])) {
    achados.push({
      codigo: "competencia_ausente",
      descricao: "Período de apuração/competência não informado na declaração.",
      severidade: "atencao",
    });
  }
  if (!str(r["cnpj"]) || !str(r["name"])) {
    achados.push({
      codigo: "cadastro_incompleto",
      descricao: "Dados cadastrais do contribuinte incompletos (CNPJ ou razão social).",
      severidade: "atencao",
    });
  }
  if (str(r["retificadoCancelado"])) {
    achados.push({
      codigo: "retificado_cancelado",
      descricao: `Declaração marcada como ${String(r["retificadoCancelado"])} — confirmar impacto no acompanhamento.`,
      severidade: "atencao",
    });
  }
  return achados;
}

function ehPendencia(situacao: string | null): boolean {
  if (!situacao) return false;
  const s = situacao.toLowerCase();
  return s.includes("pendênc") || s.includes("pendenc") || s.includes("diligênc") || s.includes("diligenc");
}

export type ResultadoSync = {
  total: number;
  novas: number;
  atualizadas: number;
  alertas: number;
  achados: number;
};

export async function sincronizarComGob(maxSize = 200): Promise<ResultadoSync> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const registros = await fetchPerdcomps(maxSize);

  const resultado: ResultadoSync = { total: registros.length, novas: 0, atualizadas: 0, alertas: 0, achados: 0 };
  const agora = new Date().toISOString();

  for (const r of registros) {
    const gobId = str(r["id"]);
    if (!gobId) continue;

    const credito = num(r["valorTotalCredito"]);
    const utilizado = num(r["valorUtilizadoPerdcomp"]);
    const situacao = str(r["situacao"]);

    const { data: existente } = await supabaseAdmin
      .from("declaracoes")
      .select("id, situacao")
      .eq("gob_id", gobId)
      .maybeSingle();

    const payload = {
      gob_id: gobId,
      numero_perdcomp: str(r["numeroPerdcomp"]),
      cnpj: str(r["cnpj"]) ?? str(r["detentorCredito"]),
      nome: str(r["name"]),
      tipo_documento: str(r["tipoDocumento"]),
      tipo_credito: str(r["tipoCredito"]),
      situacao,
      ajuda_situacao: str(r["ajudaSituacao"]),
      periodo_apuracao: str(r["periodoApuracao"]),
      data_transmissao: toIso(r["dataTransmissao"]),
      ultimo_registro: r["ultimoRegistro"] === true,
      valor_total_credito: credito,
      valor_utilizado: utilizado,
      saldo_restante: credito !== null && utilizado !== null ? Number((credito - utilizado).toFixed(2)) : null,
      dados: r as never,
      ultima_sincronizacao: agora,
      updated_at: agora,
    };

    let declaracaoId: string;

    if (!existente) {
      const { data: inserida, error } = await supabaseAdmin
        .from("declaracoes")
        .insert(payload)
        .select("id")
        .single();
      if (error || !inserida) continue;
      declaracaoId = inserida.id;
      resultado.novas += 1;
      await supabaseAdmin.from("acompanhamentos").insert({ declaracao_id: declaracaoId });
      if (situacao) {
        await supabaseAdmin
          .from("status_historico")
          .insert({ declaracao_id: declaracaoId, situacao_anterior: null, situacao_nova: situacao });
      }
    } else {
      declaracaoId = existente.id;
      await supabaseAdmin.from("declaracoes").update(payload).eq("id", declaracaoId);
      if (situacao && situacao !== existente.situacao) {
        resultado.atualizadas += 1;
        await supabaseAdmin.from("status_historico").insert({
          declaracao_id: declaracaoId,
          situacao_anterior: existente.situacao,
          situacao_nova: situacao,
        });
        const saiuDeAnalise = (existente.situacao ?? "").toLowerCase().includes("análise") ||
          (existente.situacao ?? "").toLowerCase().includes("analise");
        if (saiuDeAnalise) {
          await supabaseAdmin.from("alertas").insert({
            declaracao_id: declaracaoId,
            tipo: "mudanca_status",
            prioridade: "alta",
            mensagem: `Situação alterada de "${existente.situacao}" para "${situacao}".`,
          });
          resultado.alertas += 1;
        }
      }
    }

    if (ehPendencia(situacao)) {
      const { data: jaTem } = await supabaseAdmin
        .from("alertas")
        .select("id")
        .eq("declaracao_id", declaracaoId)
        .eq("tipo", "pendencia")
        .eq("resolvido", false)
        .maybeSingle();
      if (!jaTem) {
        await supabaseAdmin.from("alertas").insert({
          declaracao_id: declaracaoId,
          tipo: "pendencia",
          prioridade: "alta",
          mensagem: `GOB sinalizou "${situacao}" — tratar como pendência de alta prioridade.`,
        });
        resultado.alertas += 1;
      }
    }

    for (const achado of auditar(r)) {
      const { data: existenteAchado } = await supabaseAdmin
        .from("auditoria_achados")
        .select("id")
        .eq("declaracao_id", declaracaoId)
        .eq("codigo", achado.codigo)
        .maybeSingle();
      if (existenteAchado) continue;
      await supabaseAdmin.from("auditoria_achados").insert({
        declaracao_id: declaracaoId,
        codigo: achado.codigo,
        descricao: achado.descricao,
        severidade: achado.severidade,
      });
      await supabaseAdmin.from("alertas").insert({
        declaracao_id: declaracaoId,
        tipo: "auditoria",
        prioridade: achado.severidade === "critico" ? "alta" : "normal",
        mensagem: `Novo achado de auditoria: ${achado.descricao}`,
      });
      resultado.achados += 1;
      resultado.alertas += 1;
    }
  }

  return resultado;
}

export async function gerarAlertasDePrazo(): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: acomps } = await supabaseAdmin
    .from("acompanhamentos")
    .select("declaracao_id, compensacao_oficio, compensacao_oficio_prazo, intimacao, intimacao_prazo, encerrado")
    .eq("encerrado", false);

  let criados = 0;
  const hoje = new Date();
  for (const a of acomps ?? []) {
    const prazos: Array<[string, string | null, boolean]> = [
      ["compensacao_oficio", a.compensacao_oficio_prazo, a.compensacao_oficio],
      ["intimacao", a.intimacao_prazo, a.intimacao],
    ];
    for (const [tipo, prazo, ativo] of prazos) {
      if (!ativo || !prazo) continue;
      const dias = Math.ceil((new Date(prazo).getTime() - hoje.getTime()) / 86400000);
      if (dias > 5) continue;
      const codigoTipo = `prazo_${tipo}`;
      const { data: jaTem } = await supabaseAdmin
        .from("alertas")
        .select("id")
        .eq("declaracao_id", a.declaracao_id)
        .eq("tipo", codigoTipo)
        .eq("resolvido", false)
        .maybeSingle();
      if (jaTem) continue;
      await supabaseAdmin.from("alertas").insert({
        declaracao_id: a.declaracao_id,
        tipo: codigoTipo,
        prioridade: dias <= 1 ? "alta" : "normal",
        mensagem:
          dias < 0
            ? `Prazo de ${tipo === "intimacao" ? "atendimento da intimação" : "compensação de ofício"} vencido em ${prazo}.`
            : `Faltam ${dias} dia(s) para o prazo de ${tipo === "intimacao" ? "atendimento da intimação" : "compensação de ofício"} (${prazo}).`,
      });
      criados += 1;
    }
  }
  return criados;
}
