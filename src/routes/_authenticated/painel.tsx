import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCw, AlertTriangle, Search, BellRing, CalendarClock, Loader2 } from "lucide-react";

import { listarDeclaracoes, salvarAcompanhamento, sincronizar } from "@/lib/perdcomp.functions";
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
  compensacao_oficio: boolean;
  compensacao_oficio_prazo: string | null;
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
  compensacao_oficio: false,
  compensacao_oficio_prazo: null,
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

function Painel() {
  const queryClient = useQueryClient();
  const listar = useServerFn(listarDeclaracoes);
  const sincronizarFn = useServerFn(sincronizar);
  const salvarFn = useServerFn(salvarAcompanhamento);
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState("todas");
  const [aba, setAba] = useState<"ativas" | "prazos" | "semos" | "alertas" | "encerradas" | "terceiros">("ativas");
  const [editando, setEditando] = useState<{ id: string; titulo: string; form: Acomp } | null>(null);

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

  const situacoes = useMemo(
    () => Array.from(new Set(linhas.map((l) => l.situacao).filter(Boolean))) as string[],
    [linhas],
  );

  const filtradas = linhas.filter((l) => {
    if (aba !== "terceiros" && l.terceiro) return false;
    if (aba === "ativas" && l.encerrado) return false;
    if (aba === "encerradas" && !l.encerrado) return false;
    if (aba === "alertas" && l.alertas === 0) return false;
    if (aba === "prazos" && l.prazos.length === 0) return false;
    if (aba === "semos" && (l.ordemServico.trim() !== "" || l.encerrado)) return false;
    if (aba === "terceiros" && !l.terceiro) return false;
    if (situacao !== "todas" && l.situacao !== situacao) return false;
    if (busca) {
      const t = busca.toLowerCase();
      const alvo =
        `${l.numero_perdcomp ?? ""} ${l.cnpj ?? ""} ${l.razao_social ?? ""} ${l.nome ?? ""} ${l.ordemServico}`.toLowerCase();
      if (!alvo.includes(t)) return false;
    }
    return true;
  });

  const ordenadas =
    aba === "prazos"
      ? [...filtradas].sort((a, b) => (a.prazos[0]?.dias ?? 9999) - (b.prazos[0]?.dias ?? 9999))
      : filtradas;

  const proprias = linhas.filter((l) => !l.terceiro);
  const totalAlertas = proprias.reduce((s, l) => s + l.alertas, 0);
  const totalAchados = proprias.reduce((s, l) => s + l.achados, 0);
  const ativas = proprias.filter((l) => !l.encerrado).length;
  const semOs = proprias.filter((l) => !l.encerrado && l.ordemServico.trim() === "").length;
  const prazosCriticos = proprias.filter((l) => l.prazos.some((p) => (p.dias ?? 99) <= 5)).length;


  return (
    <main className="mx-auto max-w-[1500px] space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Declarações PER/DCOMP</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Dados do GOB · última sincronização {dataHora(linhas[0]?.ultima_sincronizacao ?? null)}
          </p>
        </div>
        <Button onClick={() => sync.mutate()} disabled={sync.isPending}>
          {sync.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Sincronizar com o GOB
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador rotulo="Em acompanhamento ativo (exclui terceiros)" valor={ativas} />
        <Indicador rotulo="Sem O.S. vinculada" valor={semOs} tom="warning" />
        <Indicador rotulo="Prazos vencendo (até 5 dias)" valor={prazosCriticos} tom="destructive" />
        <Indicador rotulo="Alertas em aberto" valor={totalAlertas} tom="warning" />
      </div>

      <Card className="overflow-hidden p-0 shadow-panel">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="flex overflow-hidden rounded-md border border-border">
            {(["ativas", "prazos", "semos", "alertas", "encerradas", "terceiros"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setAba(k)}
                className={`px-3 py-1.5 text-sm capitalize transition-colors ${
                  aba === k ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                {k === "alertas"
                  ? "Com alerta"
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
              placeholder="Buscar por número, CNPJ ou razão social"
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
                <th className="px-4 py-3 font-medium">Situação</th>
                <th className="px-4 py-3 font-medium">Transmissão</th>
                <th className="px-4 py-3 text-right font-medium">Saldo restante</th>
                <th className="px-4 py-3 font-medium">Prazos</th>
                <th className="px-4 py-3 font-medium">Apontamentos</th>
                <th className="px-4 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isPending && (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-muted-foreground">
                    Carregando declarações…
                  </td>
                </tr>
              )}
              {!isPending && ordenadas.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-muted-foreground">
                    Nenhuma declaração aqui. Use “Sincronizar com o GOB” para trazer os dados.
                  </td>
                </tr>
              )}
              {ordenadas.map((l) => (
                <tr key={l.id} className="border-t border-border align-top hover:bg-surface/70">
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
                        Prazos
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
          <DialogTitle>Prazos de atendimento</DialogTitle>
          <DialogDescription className="truncate">{estado?.titulo}</DialogDescription>
        </DialogHeader>
        {form && (
          <div className="space-y-3">
            <LinhaPrazo
              titulo="Aviso de pagamento"
              ativo={form.aviso_pagamento}
              onAtivo={(v) => setForm({ ...form, aviso_pagamento: v })}
              prazo={form.aviso_pagamento_prazo}
              onPrazo={(v) => setForm({ ...form, aviso_pagamento_prazo: v })}
            />
            <LinhaPrazo
              titulo="Compensação de ofício"
              ativo={form.compensacao_oficio}
              onAtivo={(v) => setForm({ ...form, compensacao_oficio: v })}
              prazo={form.compensacao_oficio_prazo}
              onPrazo={(v) => setForm({ ...form, compensacao_oficio_prazo: v })}
            />
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
}: {
  titulo: string;
  ativo: boolean;
  onAtivo: (v: boolean) => void;
  prazo: string | null;
  onPrazo: (v: string | null) => void;
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
