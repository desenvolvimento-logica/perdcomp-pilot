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
  const { data: atuais } = await supabaseAdmin.from("pc_declaracoes").select("id, gob_id, situacao");
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
          razao_social: str(r["accountName"]) ?? str(r["name"]),
          grupo_tributo: str(r["grupoTributo"]),
          codigo_receita: str(r["codigoReceita"]),
          processo_administrativo: str(r["processoAdministrativo"]),
          processo_judicial: str(r["processoJudicial"]),
          processo_habilitacao: str(r["processoHabilitacao"]),
          credito_atualizado: num(r["creditoAtualizado"]),
          total_debitos: num(r["totalDebitos"]),
          saldo_credito_original: num(r["saldoCreditoOriginal"]),
          arquivo_documento_id: str(r["arquivoDocumentoId"]),
          arquivo_documento_nome: str(r["arquivoDocumentoName"]),
          arquivo_recibo_id: str(r["arquivoReciboId"]),
          arquivo_recibo_nome: str(r["arquivoReciboName"]),
          numero_recibo: str(r["numeroRecibo"]),
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
      .from("pc_declaracoes")
      .upsert(
        payloads.slice(i, i + bloco).map((p) => p.payload),
        { onConflict: "gob_id" },
      );
    if (error) throw new Error(`Falha ao gravar declarações: ${error.message}`);
  }

  const { data: depois } = await supabaseAdmin.from("pc_declaracoes").select("id, gob_id");
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
  for (let i = 0; i < ids.length; i += 500) {
    const fatia = ids.slice(i, i + 500);
    const { data: ach } = await supabaseAdmin
      .from("pc_auditoria_achados")
      .select("declaracao_id, codigo")
      .in("declaracao_id", fatia);
    for (const a of ach ?? []) achadosExistentes.add(`${a.declaracao_id}|${a.codigo}`);
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
      // Único alerta do sistema: mudança de situação no GOB.
      // Pendências e achados ficam apenas na auditoria.
      novosAlertas.push({
        declaracao_id: declaracaoId,
        tipo: "mudanca_status",
        prioridade: "alta",
        mensagem: `Situação alterada de "${anterior.situacao ?? "—"}" para "${situacao}".`,
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
      resultado.achados += 1;
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

// ---------------------------------------------------------------------------
// Documentos (recibo / declaração) e responsável pelo preenchimento
// ---------------------------------------------------------------------------

async function baixarAnexo(attachmentId: string): Promise<{ bytes: Uint8Array; nome: string }> {
  const { url, token } = gobConfig();
  const res = await fetch(`${url}/api/v1/Attachment/file/${attachmentId}`, {
    headers: { "X-Api-Key": token },
  });
  if (!res.ok) throw new Error(`Falha ao baixar o arquivo no GOB [${res.status}].`);
  const disp = res.headers.get("content-disposition") ?? "";
  const m = /filename="?([^";]+)"?/.exec(disp);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { bytes, nome: m?.[1] ?? `${attachmentId}.pdf` };
}

function paraBase64(bytes: Uint8Array): string {
  let bin = "";
  const bloco = 0x8000;
  for (let i = 0; i < bytes.length; i += bloco) {
    bin += String.fromCharCode(...bytes.subarray(i, i + bloco));
  }
  return btoa(bin);
}

export async function baixarDocumentoGob(attachmentId: string) {
  const { bytes, nome } = await baixarAnexo(attachmentId);
  return { nome, base64: paraBase64(bytes), tipo: "application/pdf" };
}

export type Responsavel = {
  nome: string | null;
  cpf: string | null;
  crc: string | null;
  email: string | null;
};

export function extrairResponsavelDoTexto(texto: string): Responsavel {
  const idx = texto.indexOf("Responsável pelo Preenchimento");
  const trecho = idx >= 0 ? texto.slice(idx, idx + 800) : "";
  const nome = /Nome\s+([^\n]+)/.exec(trecho)?.[1]?.trim() ?? null;
  const cpf = /CPF\s+([\d.\-/]{11,20})/.exec(trecho)?.[1]?.trim() ?? null;
  const crc = /CRC\s+([^\n]+)/.exec(trecho)?.[1]?.trim() ?? null;
  const emailBruto = /[\w.+-]+@[\w-]+\.[\w.]+/.exec(trecho)?.[0] ?? null;
  // O texto do PDF costuma colar o rótulo seguinte no e-mail ("...com.brEndereço").
  const email = emailBruto
    ? emailBruto.replace(/Endere[^]*$/i, "").replace(/[^A-Za-z0-9]+$/, "").toLowerCase()
    : null;
  return { nome: nome || null, cpf: cpf || null, crc: crc || null, email };
}

export async function lerResponsavelDoPdf(attachmentId: string): Promise<Responsavel> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const { bytes } = await baixarAnexo(attachmentId);
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return extrairResponsavelDoTexto(typeof text === "string" ? text : String(text));
}

/** Lê o responsável pelo preenchimento de uma declaração e grava no banco. */
export async function sincronizarResponsavel(declaracaoId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: decl } = await supabaseAdmin
    .from("pc_declaracoes")
    .select("id, arquivo_documento_id")
    .eq("id", declaracaoId)
    .maybeSingle();
  if (!decl?.arquivo_documento_id) return null;
  const resp = await lerResponsavelDoPdf(decl.arquivo_documento_id);
  await supabaseAdmin
    .from("pc_declaracoes")
    .update({
      responsavel_nome: resp.nome,
      responsavel_cpf: resp.cpf,
      responsavel_crc: resp.crc,
      responsavel_email: resp.email,
      responsavel_extraido_em: new Date().toISOString(),
    })
    .eq("id", declaracaoId);
  return resp;
}

/** Processa em lote as declarações que ainda não têm responsável extraído. */
export async function extrairResponsaveisPendentes(limite = 100) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: pendentes } = await supabaseAdmin
    .from("pc_declaracoes")
    .select("id, arquivo_documento_id")
    .is("responsavel_extraido_em", null)
    .not("arquivo_documento_id", "is", null)
    .limit(limite);

  const lista = pendentes ?? [];
  let processadas = 0;
  let comResponsavel = 0;
  const paralelo = 8;

  for (let i = 0; i < lista.length; i += paralelo) {
    await Promise.all(
      lista.slice(i, i + paralelo).map(async (d) => {
        try {
          const resp = await lerResponsavelDoPdf(d.arquivo_documento_id as string);
          await supabaseAdmin
            .from("pc_declaracoes")
            .update({
              responsavel_nome: resp.nome,
              responsavel_cpf: resp.cpf,
              responsavel_crc: resp.crc,
              responsavel_email: resp.email,
              responsavel_extraido_em: new Date().toISOString(),
            })
            .eq("id", d.id);
          processadas += 1;
          if (resp.nome) comResponsavel += 1;
        } catch {
          // Mantém pendente para uma próxima tentativa.
        }
      }),
    );
  }

  const { count } = await supabaseAdmin
    .from("pc_declaracoes")
    .select("id", { count: "exact", head: true })
    .is("responsavel_extraido_em", null)
    .not("arquivo_documento_id", "is", null);

  return { processadas, comResponsavel, restantes: count ?? 0 };
}
