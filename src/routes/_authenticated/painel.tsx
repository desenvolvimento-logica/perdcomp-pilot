import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCw, AlertTriangle, Search, BellRing, CalendarClock, Loader2, Download, FileText, UserSearch } from "lucide-react";

import {
  listarDeclaracoes,
  salvarAcompanhamento,
  sincronizar,
  baixarArquivo,
  extrairResponsaveis,
} from "@/lib/perdcomp.functions";
import { moeda, dataHora, documento, tomSituacao } from "@/lib/formato";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Declarações em acompanhamento · Painel PERDCOMP" },
      {
        name: "description",
        content: "Lista das declarações PER/DCOMP sincronizadas do GOB, com alertas de situação, auditoria e prazos.",
      },
      { property: "og:title", content: "Declarações em acompanhamento · Painel PERDCOMP" },
      {
        property: "og:description",
        content: "Lista das declarações PER/DCOMP sincronizadas do GOB com alertas e controle interno.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Painel,
});

type Acomp = {
  declaracao_id: string;
  ordem_servico: string;
  terceiro: boolean;
  aviso_pagamento: boolean;
  aviso_pagamento_data: string | null;
  aviso_pagamento_prazo: string | null;
  pagamento_confirmado: boolean;
  pagamento_confirmado_em: string | null;
  compensacao_oficio: boolean;
  compensacao_oficio_prazo: string | null;
  compensacao_oficio_opcao: "" | "compensacao" | "recusa";
  intimacao: boolean;
  intimacao_prazo: string | null;
  encerrado: boolean;
  encerrado_em: string | null;
  observacao: string;
};

const ACOMP_VAZIO = (id: string): Acomp => ({
  declaracao_id: id,
  ordem_servico: "",
  terceiro: false,
  aviso_pagamento: false,
  aviso_pagamento_data: null,
  aviso_pagamento_prazo: null,
  pagamento_confirmado: false,
  pagamento_confirmado_em: null,
  compensacao_oficio: false,
  compensacao_oficio_prazo: null,
  compensacao_oficio_opcao: "",
  intimacao: false,
  intimacao_prazo: null,
  encerrado: false,
  encerrado_em: null,
  observacao: "",
});


function dias(prazo: string | null): number | null {
  if (!prazo) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(`${prazo}T00:00:00`).getTime() - hoje.getTime()) / 86400000);
}

function dataBr(v: string | null): string {
  if (!v) return "—";
  const [a, m, d] = v.split("-");
  return `${d}/${m}/${a}`;
}

type Prazo = { rotulo: string; prazo: string; dias: number | null };

function prazosDe(a: Acomp | undefined): Prazo[] {
  if (!a || a.encerrado) return [];
  const itens: Array<[boolean, string | null, string]> = [
    [a.aviso_pagamento, a.aviso_pagamento_prazo, "Aviso de pagamento"],
    [a.compensacao_oficio, a.compensacao_oficio_prazo, "Compensação de ofício"],
    [a.intimacao, a.intimacao_prazo, "Intimação"],
  ];
  return itens
    .filter(([ativo, prazo]) => ativo && prazo)
    .map(([, prazo, rotulo]) => ({ rotulo, prazo: prazo as string, dias: dias(prazo as string) }))
    .sort((x, y) => (x.dias ?? 9999) - (y.dias ?? 9999));
}

/** Abre no navegador um PDF devolvido em base64 pelo servidor. */
export function abrirPdf(base64: string, nome: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome.toLowerCase().endsWith(".pdf") ? nome : `${nome}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function Painel() {
  const queryClient = useQueryClient();
  const listar = useServerFn(listarDeclaracoes);
  const sincronizarFn = useServerFn(sincronizar);
  const salvarFn = useServerFn(salvarAcompanhamento);
  const baixarFn = useServerFn(baixarArquivo);
  const extrairFn = useServerFn(extrairResponsaveis);
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState("todas");
  const [responsavel, setResponsavel] = useState("todos");
  const [aba, setAba] = useState<"ativas" | "prazos" | "semos" | "auditoria" | "alertas" | "encerradas" | "terceiros">("ativas");
  const [editando, setEditando] = useState<{ id: string; titulo: string; form: Acomp } | null>(null);
  const [pagina, setPagina] = useState(1);
  const porPagina = 20;

  const { data, isPending } = useQuery({ queryKey: ["declaracoes"], queryFn: () => listar() });

  const sync = useMutation({
    mutationFn: () => sincronizarFn(),
    onSuccess: (r) => {
      toast.success(
        `Sincronizado: ${r.total} declarações lidas · ${r.novas} novas · ${r.atualizadas} com nova situação · ${r.alertas} alertas`,
      );
      queryClient.invalidateQueries({ queryKey: ["declaracoes"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha na sincronização com o GOB."),
  });

  const salvarPrazos = useMutation({
    mutationFn: (form: Acomp) => salvarFn({ data: form }),
    onSuccess: () => {
      toast.success("Prazos atualizados.");
      setEditando(null);
      queryClient.invalidateQueries({ queryKey: ["declaracoes"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar os prazos."),
  });

  const buscarResp = useMutation({
    mutationFn: () => extrairFn({ data: { limite: 150 } }),
    onSuccess: (r) => {
      toast.success(
        `Responsáveis lidos: ${r.processadas} declarações processadas · ${r.comResponsavel} com responsável · ${r.restantes} ainda pendentes`,
      );
      queryClient.invalidateQueries({ queryKey: ["declaracoes"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível ler os responsáveis."),
  });

  const baixar = useMutation({
    mutationFn: (v: { declaracaoId: string; tipo: "recibo" | "documento" }) => baixarFn({ data: v }),
    onSuccess: (r) => abrirPdf(r.base64, r.nome),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível baixar o documento."),
  });

  const linhas = useMemo(() => {
    if (!data) return [];
    const acompPorId = new Map(data.acompanhamentos.map((a) => [a.declaracao_id, a as unknown as Acomp]));
    const achadosPend = new Map<string, number>();
    for (const a of data.achados) {
      if (!a.revisado) achadosPend.set(a.declaracao_id, (achadosPend.get(a.declaracao_id) ?? 0) + 1);
    }
    const alertasAbertos = new Map<string, number>();
    for (const a of data.alertas) {
      if (!a.resolvido) alertasAbertos.set(a.declaracao_id, (alertasAbertos.get(a.declaracao_id) ?? 0) + 1);
    }

    return data.declaracoes.map((d) => {
      const acomp = acompPorId.get(d.id);
      return {
        ...d,
        acomp,
        encerrado: acomp?.encerrado ?? false,
        terceiro: acomp?.terceiro ?? false,
        ordemServico: acomp?.ordem_servico ?? "",
        achados: achadosPend.get(d.id) ?? 0,
        alertas: alertasAbertos.get(d.id) ?? 0,
        prazos: prazosDe(acomp),
      };
    });
  }, [data]);

  useEffect(() => {
    setPagina(1);
  }, [aba, busca, situacao, responsavel]);

  const situacoes = useMemo(
    () => Array.from(new Set(linhas.map((l) => l.situacao).filter(Boolean))) as string[],
    [linhas],
  );

  const responsaveis = useMemo(
    () =>
      Array.from(new Set(linhas.map((l) => l.responsavel_nome).filter(Boolean) as string[])).sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [linhas],
  );

  const filtradas = linhas.filter((l) => {
    if (aba !== "terceiros" && l.terceiro) return false;
    if (aba === "ativas" && l.encerrado) return false;
    if (aba === "encerradas" && !l.encerrado) return false;
    if (aba === "alertas" && l.alertas === 0) return false;
    if (aba === "auditoria" && l.achados === 0) return false;
    if (aba === "prazos" && l.prazos.length === 0) return false;
    if (aba === "semos" && (l.ordemServico.trim() !== "" || l.encerrado)) return false;
    if (aba === "terceiros" && !l.terceiro) return false;
    if (situacao !== "todas" && l.situacao !== situacao) return false;
    if (responsavel === "sem" && l.responsavel_nome) return false;
    if (responsavel !== "todos" && responsavel !== "sem" && l.responsavel_nome !== responsavel) return false;
    if (busca) {
      const t = busca.toLowerCase();
      const alvo =
        `${l.numero_perdcomp ?? ""} ${l.cnpj ?? ""} ${l.razao_social ?? ""} ${l.nome ?? ""} ${l.ordemServico} ${l.responsavel_nome ?? ""}`.toLowerCase();
      if (!alvo.includes(t)) return false;
    }
    return true;
  });

  const ordenadas =
    aba === "prazos"
      ? [...filtradas].sort((a, b) => (a.prazos[0]?.dias ?? 9999) - (b.prazos[0]?.dias ?? 9999))
      : filtradas;

  const totalPaginas = Math.max(1, Math.ceil(ordenadas.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const pagina_inicio = (paginaAtual - 1) * porPagina;
  const visiveis = ordenadas.slice(pagina_inicio, pagina_inicio + porPagina);

  const proprias = linhas.filter((l) => !l.terceiro);
  const totalAlertas = proprias.reduce((s, l) => s + l.alertas, 0);
  const totalAchados = proprias.reduce((s, l) => s + l.achados, 0);
  const ativas = proprias.filter((l) => !l.encerrado).length;
  const semOs = proprias.filter((l) => !l.encerrado && l.ordemServico.trim() === "").length;
  const prazosCriticos = proprias.filter((l) => l.prazos.some((p) => (p.dias ?? 99) <= 5)).length;
  const comAuditoria = proprias.filter((l) => l.achados > 0).length;

  function exportarCsv() {
    if (ordenadas.length === 0) {
      toast.error("Nenhuma declaração na visão atual para exportar.");
      return;
    }
    const cab = [
      "Número da declaração",
      "CNPJ",
      "Razão social",
      "Tributo/Competência",
      "Situação",
      "Data de transmissão",
      "Crédito total",
      "Valor utilizado",
      "Saldo restante",
      "Responsável pelo preenchimento",
      "CPF do responsável",
      "Ordem de serviço",
      "Terceiro",
      "Aviso de pagamento (prazo)",
      "Compensação de ofício (prazo)",
      "Intimação (prazo)",
      "Próximo prazo (dias)",
      "Achados pendentes",
      "Alertas em aberto",
      "Situação interna",
    ];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const linhasCsv = ordenadas.map((l) =>
      [
        l.numero_perdcomp ?? "",
        l.cnpj ?? "",
        l.razao_social ?? l.nome ?? "",
        [l.grupo_tributo, l.periodo_apuracao].filter(Boolean).join(" / "),
        l.situacao ?? "",
        dataHora(l.data_transmissao ?? null),
        l.valor_total_credito ?? "",
        l.valor_utilizado ?? "",
        l.saldo_restante ?? "",
        l.responsavel_nome ?? "",
        l.responsavel_cpf ?? "",
        l.ordemServico,
        l.terceiro ? "Sim" : "Não",
        dataBr(l.acomp?.aviso_pagamento_prazo ?? null),
        dataBr(l.acomp?.compensacao_oficio_prazo ?? null),
        dataBr(l.acomp?.intimacao_prazo ?? null),
        l.prazos[0]?.dias ?? "",
        l.achados,
        l.alertas,
        l.encerrado ? "Encerrada" : l.terceiro ? "Terceiro" : "Em acompanhamento",
      ]
        .map(esc)
        .join(";"),
    );
    const csv = `\uFEFF${cab.map(esc).join(";")}\n${linhasCsv.join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `perdcomp-${aba}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${ordenadas.length} declarações exportadas.`);
  }

  return (
    <main className="mx-auto max-w-[1500px] space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Declarações PER/DCOMP</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Dados do GOB · última sincronização {dataHora(linhas[0]?.ultima_sincronizacao ?? null)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportarCsv}>
            <Download className="size-4" />
            Exportar ({ordenadas.length})
          </Button>
          <Button variant="outline" onClick={() => buscarResp.mutate()} disabled={buscarResp.isPending}>
            {buscarResp.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <UserSearch className="size-4" />
            )}
            Ler responsáveis
          </Button>
          <Button onClick={() => sync.mutate()} disabled={sync.isPending}>
            {sync.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Sincronizar com o GOB
          </Button>
        </div>
      </div>


      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Indicador rotulo="Em acompanhamento ativo (exclui terceiros)" valor={ativas} />
        <Indicador
          rotulo={`Pendência na auditoria (${totalAchados} achados)`}
          valor={comAuditoria}
          tom="destructive"
        />
        <Indicador rotulo="Sem O.S. vinculada" valor={semOs} tom="warning" />
        <Indicador rotulo="Prazos vencendo (até 5 dias)" valor={prazosCriticos} tom="destructive" />
        <Indicador rotulo="Alertas em aberto" valor={totalAlertas} tom="warning" />
      </div>

      <Card className="overflow-hidden p-0 shadow-panel">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="flex overflow-hidden rounded-md border border-border">
            {(["ativas", "prazos", "semos", "auditoria", "alertas", "encerradas", "terceiros"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setAba(k)}
                className={`px-3 py-1.5 text-sm capitalize transition-colors ${
                  aba === k ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                {k === "alertas"
                  ? "Com alerta"
                  : k === "auditoria"
                    ? "Pendência auditoria"
                  : k === "prazos"
                    ? "Com prazo"
                    : k === "semos"
                      ? "Sem O.S."
                      : k}

              </button>
            ))}
          </div>
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por número, CNPJ, razão social ou responsável"
              className="pl-9"
            />
          </div>
          <Select value={situacao} onValueChange={setSituacao}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Situação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as situações</SelectItem>
              {situacoes.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={responsavel} onValueChange={setResponsavel}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Responsável pelo preenchimento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os responsáveis</SelectItem>
              <SelectItem value="sem">Sem responsável identificado</SelectItem>
              {responsaveis.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Nº da declaração</th>
                <th className="px-4 py-3 font-medium">O.S.</th>
                <th className="px-4 py-3 font-medium">CNPJ</th>
                <th className="px-4 py-3 font-medium">Razão social</th>
                <th className="px-4 py-3 font-medium">Tributo / competência</th>
                <th className="px-4 py-3 font-medium">Responsável preench.</th>
                <th className="px-4 py-3 font-medium">Situação</th>
                <th className="px-4 py-3 font-medium">Transmissão</th>
                <th className="px-4 py-3 text-right font-medium">Saldo restante</th>
                <th className="px-4 py-3 font-medium">Prazos</th>
                <th className="px-4 py-3 font-medium">Apontamentos</th>
                <th className="px-4 py-3 font-medium">Documentos</th>
                <th className="px-4 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isPending && (
                <tr>
                  <td colSpan={13} className="px-4 py-12 text-center text-muted-foreground">
                    Carregando declarações…
                  </td>
                </tr>
              )}
              {!isPending && visiveis.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-4 py-12 text-center text-muted-foreground">
                    Nenhuma declaração aqui. Use “Sincronizar com o GOB” para trazer os dados.
                  </td>
                </tr>
              )}
              {visiveis.map((l) => (
                <tr
                  key={l.id}
                  className={`border-t border-border align-top hover:bg-surface/70 ${
                    l.achados > 0 && !l.terceiro
                      ? "border-l-4 border-l-destructive bg-destructive/[0.04]"
                      : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <Link
                      to="/declaracoes/$id"
                      params={{ id: l.id }}
                      className="numero text-xs font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {l.numero_perdcomp ?? "—"}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">{l.tipo_documento ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3">
                    {l.ordemServico.trim() ? (
                      <span className="numero text-xs font-medium">{l.ordemServico}</span>
                    ) : l.terceiro ? (
                      <span className="text-xs text-muted-foreground">Terceiro</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs text-warning-foreground">
                        <AlertTriangle className="size-3" /> Sem O.S.
                      </span>
                    )}
                  </td>
                  <td className="numero px-4 py-3 text-xs">{documento(l.cnpj)}</td>
                  <td className="max-w-64 px-4 py-3">
                    <p className="truncate font-medium">{l.razao_social ?? l.nome ?? "—"}</p>
                    {l.achados > 0 && !l.terceiro && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                        <AlertTriangle className="size-3" /> Pendência na auditoria ({l.achados})
                      </span>
                    )}
                    {l.terceiro && (
                      <p className="truncate text-xs text-muted-foreground">
                        PERDCOMP de terceiro — fora do acompanhamento
                      </p>
                    )}
                  </td>
                  <td className="max-w-56 px-4 py-3">
                    <p className="truncate">
                      {l.grupo_tributo ?? l.tipo_credito ?? "—"}
                      {l.codigo_receita ? ` · ${l.codigo_receita}` : ""}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{l.periodo_apuracao ?? "—"}</p>
                  </td>
                  <td className="max-w-44 px-4 py-3">
                    {l.responsavel_nome ? (
                      <>
                        <p className="truncate text-xs font-medium">{l.responsavel_nome}</p>
                        <p className="numero truncate text-xs text-muted-foreground">{l.responsavel_cpf ?? ""}</p>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${tomSituacao(l.situacao)}`}
                    >
                      {l.situacao ?? "—"}
                    </span>
                  </td>
                  <td className="numero px-4 py-3 text-xs">{dataHora(l.data_transmissao)}</td>
                  <td className="numero px-4 py-3 text-right">{moeda(l.saldo_restante)}</td>
                  <td className="px-4 py-3">
                    {l.prazos.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <div className="space-y-1">
                        {l.prazos.map((p) => (
                          <div key={p.rotulo} className="flex items-center gap-1.5 text-xs">
                            <CalendarClock
                              className={`size-3.5 ${(p.dias ?? 99) <= 5 ? "text-destructive" : "text-muted-foreground"}`}
                            />
                            <span className="text-muted-foreground">{p.rotulo}:</span>
                            <span
                              className={`numero font-medium ${(p.dias ?? 99) <= 5 ? "text-destructive" : ""}`}
                            >
                              {dataBr(p.prazo)}
                            </span>
                            <span className={(p.dias ?? 99) <= 5 ? "text-destructive" : "text-muted-foreground"}>
                              {p.dias === null
                                ? ""
                                : p.dias < 0
                                  ? `(vencido há ${Math.abs(p.dias)}d)`
                                  : `(${p.dias}d)`}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {l.achados > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                          <AlertTriangle className="size-3" /> {l.achados} auditoria
                        </span>
                      )}
                      {l.alertas > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs text-warning-foreground">
                          <BellRing className="size-3" /> {l.alertas} alerta(s)
                        </span>
                      )}
                      {l.achados === 0 && l.alertas === 0 && (
                        <span className="text-xs text-muted-foreground">Sem apontamentos</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 justify-start px-2 text-xs"
                        disabled={!l.arquivo_documento_id || baixar.isPending}
                        onClick={() => baixar.mutate({ declaracaoId: l.id, tipo: "documento" })}
                      >
                        <FileText className="size-3.5" /> Declaração
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 justify-start px-2 text-xs"
                        disabled={!l.arquivo_recibo_id || baixar.isPending}
                        onClick={() => baixar.mutate({ declaracaoId: l.id, tipo: "recibo" })}
                      >
                        <FileText className="size-3.5" /> Recibo
                      </Button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setEditando({
                            id: l.id,
                            titulo: `${l.numero_perdcomp ?? "Declaração"} · ${l.razao_social ?? ""}`,
                            form: l.acomp ? { ...l.acomp } : ACOMP_VAZIO(l.id),
                          })
                        }
                      >
                        O.S. / prazos
                      </Button>
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/declaracoes/$id" params={{ id: l.id }}>
                          Abrir
                        </Link>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 text-sm">
          <span className="text-muted-foreground">
            {ordenadas.length === 0
              ? "Nenhuma declaração"
              : `Mostrando ${pagina_inicio + 1}–${Math.min(pagina_inicio + porPagina, ordenadas.length)} de ${ordenadas.length}`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={paginaAtual <= 1}
            >
              Anterior
            </Button>
            <span className="numero text-xs text-muted-foreground">
              Página {paginaAtual} de {totalPaginas}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              disabled={paginaAtual >= totalPaginas}
            >
              Próxima
            </Button>
          </div>
        </div>
      </Card>

      <DialogPrazos
        estado={editando}
        onFechar={() => setEditando(null)}
        onSalvar={(form) => salvarPrazos.mutate(form)}
        salvando={salvarPrazos.isPending}
      />
    </main>
  );
}

function DialogPrazos({
  estado,
  onFechar,
  onSalvar,
  salvando,
}: {
  estado: { id: string; titulo: string; form: Acomp } | null;
  onFechar: () => void;
  onSalvar: (form: Acomp) => void;
  salvando: boolean;
}) {
  const [form, setForm] = useState<Acomp | null>(estado?.form ?? null);
  useEffect(() => setForm(estado?.form ?? null), [estado]);

  return (
    <Dialog open={estado !== null} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>O.S. e prazos de atendimento</DialogTitle>
          <DialogDescription className="truncate">{estado?.titulo}</DialogDescription>
        </DialogHeader>
        {form && (
          <div className="space-y-3">
            <div className="space-y-1.5 rounded-md border border-border p-3">
              <Label className="text-xs text-muted-foreground">Número da ordem de serviço</Label>
              <Input
                value={form.ordem_servico}
                onChange={(e) => setForm({ ...form, ordem_servico: e.target.value })}
                placeholder="Ex.: OS-2026-0147"
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
              <div>
                <span className="text-sm font-medium">PERDCOMP de terceiro</span>
                <p className="text-xs text-muted-foreground">
                  Não é nossa responsabilidade; sai do total em acompanhamento.
                </p>
              </div>
              <Switch
                checked={form.terceiro}
                onCheckedChange={(v) => setForm({ ...form, terceiro: v })}
              />
            </div>
            <LinhaPrazo
              titulo="Aviso de pagamento"
              ativo={form.aviso_pagamento}
              onAtivo={(v) => setForm({ ...form, aviso_pagamento: v })}
              prazo={form.aviso_pagamento_prazo}
              onPrazo={(v) => setForm({ ...form, aviso_pagamento_prazo: v })}
            >
              <div className="mt-2 rounded-md bg-surface p-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium">Cliente confirmou pagamento em conta</span>
                  <Switch
                    checked={form.pagamento_confirmado}
                    onCheckedChange={(v) =>
                      setForm({
                        ...form,
                        pagamento_confirmado: v,
                        pagamento_confirmado_em: v ? form.pagamento_confirmado_em : null,
                      })
                    }
                  />
                </div>
                {form.pagamento_confirmado && (
                  <div className="mt-2 space-y-1">
                    <Label className="text-xs text-muted-foreground">Data da confirmação</Label>
                    <Input
                      type="date"
                      value={form.pagamento_confirmado_em ?? ""}
                      onChange={(e) => setForm({ ...form, pagamento_confirmado_em: e.target.value || null })}
                    />
                  </div>
                )}
              </div>
            </LinhaPrazo>
            <LinhaPrazo
              titulo="Compensação de ofício"
              ativo={form.compensacao_oficio}
              onAtivo={(v) => setForm({ ...form, compensacao_oficio: v })}
              prazo={form.compensacao_oficio_prazo}
              onPrazo={(v) => setForm({ ...form, compensacao_oficio_prazo: v })}
            >
              <div className="mt-2 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Opção informada</Label>
                <div className="flex gap-2">
                  {([
                    ["compensacao", "Compensação"],
                    ["recusa", "Recusa"],
                  ] as const).map(([valor, rotulo]) => (
                    <Button
                      key={valor}
                      type="button"
                      size="sm"
                      variant={form.compensacao_oficio_opcao === valor ? "default" : "outline"}
                      className="flex-1"
                      onClick={() =>
                        setForm({
                          ...form,
                          compensacao_oficio_opcao: form.compensacao_oficio_opcao === valor ? "" : valor,
                        })
                      }
                    >
                      {rotulo}
                    </Button>
                  ))}
                </div>
              </div>
            </LinhaPrazo>

            <LinhaPrazo
              titulo="Intimação"
              ativo={form.intimacao}
              onAtivo={(v) => setForm({ ...form, intimacao: v })}
              prazo={form.intimacao_prazo}
              onPrazo={(v) => setForm({ ...form, intimacao_prazo: v })}
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={() => form && onSalvar(form)} disabled={salvando || !form}>
            {salvando && <Loader2 className="size-4 animate-spin" />}
            Salvar prazos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinhaPrazo({
  titulo,
  ativo,
  onAtivo,
  prazo,
  onPrazo,
  children,
}: {
  titulo: string;
  ativo: boolean;
  onAtivo: (v: boolean) => void;
  prazo: string | null;
  onPrazo: (v: string | null) => void;
  children?: ReactNode;
}) {
  const d = ativo ? dias(prazo) : null;
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{titulo}</span>
        <Switch checked={ativo} onCheckedChange={onAtivo} />
      </div>
      {ativo && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Prazo para atender</Label>
          <Input type="date" value={prazo ?? ""} onChange={(e) => onPrazo(e.target.value || null)} />
          {d !== null && (
            <p className={`text-xs ${d <= 5 ? "text-destructive" : "text-muted-foreground"}`}>
              {d < 0 ? `Vencido há ${Math.abs(d)} dia(s)` : `Faltam ${d} dia(s)`}
            </p>
          )}
          {children}
        </div>
      )}

    </div>
  );
}

function Indicador({
  rotulo,
  valor,
  tom,
}: {
  rotulo: string;
  valor: number;
  tom?: "warning" | "destructive";
}) {
  const cor = tom === "warning" ? "text-warning-foreground" : tom === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <Card className="p-4 shadow-panel">
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{rotulo}</p>
      <p className={`numero mt-1 text-2xl font-semibold ${cor}`}>{valor}</p>
    </Card>
  );
}
