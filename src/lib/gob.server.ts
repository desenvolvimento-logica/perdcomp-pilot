// Server-only: fala com a API do GOB e grava no banco interno.
// O token nunca sai do servidor.

type GobPerdcomp = Record<string, unknown>;

function gobConfig() {
  const url = process.env["GOB_API_URL"];
  const token = process.env["GOB_API_TOKEN"];
  if (!url || !token) throw new Error("Integração GOB não configurada (GOB_API_URL / GOB_API_TOKEN).");
  return { url: url.replace(/\/$/, ""), token };
}

export async function fetchPerdcomps(limite = 3000): Promise<GobPerdcomp[]> {
  const { url, token } = gobConfig();
  const pagina = 200;
  const todos: GobPerdcomp[] = [];

  for (let offset = 0; offset < limite; offset += pagina) {
    const qs = new URLSearchParams({
      maxSize: String(Math.min(pagina, limite - offset)),
      offset: String(offset),
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
    const json = (await res.json()) as { list?: GobPerdcomp[]; total?: number };
    const lista = json.list ?? [];
    todos.push(...lista);
    if (lista.length < pagina) break;
    if (typeof json.total === "number" && todos.length >= json.total) break;
  }

  return todos;
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

export async function sincronizarComGob(limite = 3000): Promise<ResultadoSync> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const registros = await fetchPerdcomps(limite);

  const resultado: ResultadoSync = { total: registros.length, novas: 0, atualizadas: 0, alertas: 0, achados: 0 };
  const agora = new Date().toISOString();

  // Estado atual do banco, em poucas consultas (evita 1 ida ao banco por registro).
  const { data: atuais } = await supabaseAdmin.from("declaracoes").select("id, gob_id, situacao");
  const porGobId = new Map((atuais ?? []).map((d) => [d.gob_id, d]));

  const payloads = registros
    .map((r) => {
      const gobId = str(r["id"]);
      if (!gobId) return null;
      const credito = num(r["valorTotalCredito"]);
      const utilizado = num(r["valorUtilizadoPerdcomp"]);
      return {
        registro: r,
        payload: {
          gob_id: gobId,
          numero_perdcomp: str(r["numeroPerdcomp"]),
          cnpj: str(r["cnpj"]) ?? str(r["detentorCredito"]),
          nome: str(r["name"]),
          tipo_documento: str(r["tipoDocumento"]),
          tipo_credito: str(r["tipoCredito"]),
          situacao: str(r["situacao"]),
          ajuda_situacao: str(r["ajudaSituacao"]),
          periodo_apuracao: str(r["periodoApuracao"]),
          data_transmissao: toIso(r["dataTransmissao"]),
          ultimo_registro: r["ultimoRegistro"] === true,
          valor_total_credito: credito,
          valor_utilizado: utilizado,
          saldo_restante:
            credito !== null && utilizado !== null ? Number((credito - utilizado).toFixed(2)) : null,
          dados: r as never,
          ultima_sincronizacao: agora,
          updated_at: agora,
        },
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Grava tudo em blocos, usando gob_id como chave natural.
  const bloco = 300;
  for (let i = 0; i < payloads.length; i += bloco) {
    const { error } = await supabaseAdmin
      .from("declaracoes")
      .upsert(
        payloads.slice(i, i + bloco).map((p) => p.payload),
        { onConflict: "gob_id" },
      );
    if (error) throw new Error(`Falha ao gravar declarações: ${error.message}`);
  }

  const { data: depois } = await supabaseAdmin.from("declaracoes").select("id, gob_id");
  const idPorGobId = new Map((depois ?? []).map((d) => [d.gob_id, d.id]));

  const novosAcompanhamentos: Array<{ declaracao_id: string }> = [];
  const novoHistorico: Array<{ declaracao_id: string; situacao_anterior: string | null; situacao_nova: string }> = [];
  const novosAlertas: Array<{
    declaracao_id: string;
    tipo: string;
    prioridade: string;
    mensagem: string;
  }> = [];
  const novosAchados: Array<{
    declaracao_id: string;
    codigo: string;
    descricao: string;
    severidade: string;
  }> = [];

  const ids = payloads
    .map((p) => idPorGobId.get(p.payload.gob_id))
    .filter((v): v is string => typeof v === "string");

  const achadosExistentes = new Set<string>();
  const alertasAbertos = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const fatia = ids.slice(i, i + 500);
    const { data: ach } = await supabaseAdmin
      .from("auditoria_achados")
      .select("declaracao_id, codigo")
      .in("declaracao_id", fatia);
    for (const a of ach ?? []) achadosExistentes.add(`${a.declaracao_id}|${a.codigo}`);
    const { data: alt } = await supabaseAdmin
      .from("alertas")
      .select("declaracao_id, tipo")
      .eq("resolvido", false)
      .in("declaracao_id", fatia);
    for (const a of alt ?? []) alertasAbertos.add(`${a.declaracao_id}|${a.tipo}`);
  }

  for (const { registro: r, payload } of payloads) {
    const declaracaoId = idPorGobId.get(payload.gob_id);
    if (!declaracaoId) continue;
    const anterior = porGobId.get(payload.gob_id);
    const situacao = payload.situacao;

    if (!anterior) {
      resultado.novas += 1;
      novosAcompanhamentos.push({ declaracao_id: declaracaoId });
      if (situacao) {
        novoHistorico.push({ declaracao_id: declaracaoId, situacao_anterior: null, situacao_nova: situacao });
      }
    } else if (situacao && situacao !== anterior.situacao) {
      resultado.atualizadas += 1;
      novoHistorico.push({
        declaracao_id: declaracaoId,
        situacao_anterior: anterior.situacao,
        situacao_nova: situacao,
      });
      const s = (anterior.situacao ?? "").toLowerCase();
      if (s.includes("análise") || s.includes("analise")) {
        novosAlertas.push({
          declaracao_id: declaracaoId,
          tipo: "mudanca_status",
          prioridade: "alta",
          mensagem: `Situação alterada de "${anterior.situacao}" para "${situacao}".`,
        });
        resultado.alertas += 1;
      }
    }

    if (ehPendencia(situacao) && !alertasAbertos.has(`${declaracaoId}|pendencia`)) {
      alertasAbertos.add(`${declaracaoId}|pendencia`);
      novosAlertas.push({
        declaracao_id: declaracaoId,
        tipo: "pendencia",
        prioridade: "alta",
        mensagem: `GOB sinalizou "${situacao}" — tratar como pendência de alta prioridade.`,
      });
      resultado.alertas += 1;
    }

    for (const achado of auditar(r)) {
      const chave = `${declaracaoId}|${achado.codigo}`;
      if (achadosExistentes.has(chave)) continue;
      achadosExistentes.add(chave);
      novosAchados.push({
        declaracao_id: declaracaoId,
        codigo: achado.codigo,
        descricao: achado.descricao,
        severidade: achado.severidade,
      });
      novosAlertas.push({
        declaracao_id: declaracaoId,
        tipo: "auditoria",
        prioridade: achado.severidade === "critico" ? "alta" : "normal",
        mensagem: `Novo achado de auditoria: ${achado.descricao}`,
      });
      resultado.achados += 1;
      resultado.alertas += 1;
    }
  }

  async function inserirEmBloco(
    tabela: "acompanhamentos" | "status_historico" | "alertas" | "auditoria_achados",
    linhas: unknown[],
    onConflict?: string,
  ) {
    for (let i = 0; i < linhas.length; i += bloco) {
      const fatia = linhas.slice(i, i + bloco) as never;
      const { error } = onConflict
        ? await supabaseAdmin.from(tabela).upsert(fatia, { onConflict, ignoreDuplicates: true })
        : await supabaseAdmin.from(tabela).insert(fatia);
      if (error) throw new Error(`Falha ao gravar ${tabela}: ${error.message}`);
    }
  }

  // Deduplica dentro do próprio lote antes de gravar (a mesma chave pode repetir).
  const achadosUnicos = Array.from(
    new Map(novosAchados.map((a) => [`${a.declaracao_id}|${a.codigo}`, a])).values(),
  );

  await inserirEmBloco("acompanhamentos", novosAcompanhamentos, "declaracao_id");
  await inserirEmBloco("status_historico", novoHistorico);
  await inserirEmBloco("auditoria_achados", achadosUnicos, "declaracao_id,codigo");
  await inserirEmBloco("alertas", novosAlertas);

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
