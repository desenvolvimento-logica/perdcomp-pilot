import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCw, AlertTriangle, Search, BellRing, CheckCircle2, Loader2 } from "lucide-react";

import { listarDeclaracoes, sincronizar } from "@/lib/perdcomp.functions";
import { moeda, dataHora, documento, tomSituacao } from "@/lib/formato";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
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
    ],
  }),
  component: Painel,
});

function Painel() {
  const queryClient = useQueryClient();
  const listar = useServerFn(listarDeclaracoes);
  const sincronizarFn = useServerFn(sincronizar);
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState("todas");
  const [aba, setAba] = useState<"ativas" | "encerradas" | "alertas">("ativas");

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

  const linhas = useMemo(() => {
    if (!data) return [];
    const acompPorId = new Map(data.acompanhamentos.map((a) => [a.declaracao_id, a]));
    const achadosPend = new Map<string, number>();
    for (const a of data.achados) {
      if (!a.revisado) achadosPend.set(a.declaracao_id, (achadosPend.get(a.declaracao_id) ?? 0) + 1);
    }
    const alertasAbertos = new Map<string, number>();
    for (const a of data.alertas) {
      if (!a.resolvido) alertasAbertos.set(a.declaracao_id, (alertasAbertos.get(a.declaracao_id) ?? 0) + 1);
    }
    const perfilPorId = new Map(data.perfis.map((p) => [p.id, p.nome]));

    return data.declaracoes.map((d) => {
      const acomp = acompPorId.get(d.id);
      return {
        ...d,
        encerrado: acomp?.encerrado ?? false,
        responsavel: acomp?.responsavel_id ? (perfilPorId.get(acomp.responsavel_id) ?? "—") : "—",
        achados: achadosPend.get(d.id) ?? 0,
        alertas: alertasAbertos.get(d.id) ?? 0,
      };
    });
  }, [data]);

  const situacoes = useMemo(
    () => Array.from(new Set(linhas.map((l) => l.situacao).filter(Boolean))) as string[],
    [linhas],
  );

  const filtradas = linhas.filter((l) => {
    if (aba === "ativas" && l.encerrado) return false;
    if (aba === "encerradas" && !l.encerrado) return false;
    if (aba === "alertas" && l.alertas === 0) return false;
    if (situacao !== "todas" && l.situacao !== situacao) return false;
    if (busca) {
      const t = busca.toLowerCase();
      const alvo = `${l.numero_perdcomp ?? ""} ${l.cnpj ?? ""} ${l.nome ?? ""}`.toLowerCase();
      if (!alvo.includes(t)) return false;
    }
    return true;
  });

  const totalAlertas = linhas.reduce((s, l) => s + l.alertas, 0);
  const totalAchados = linhas.reduce((s, l) => s + l.achados, 0);
  const ativas = linhas.filter((l) => !l.encerrado).length;

  return (
    <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Declarações PER/DCOMP</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Dados somente leitura vindos do GOB · última sincronização{" "}
            {dataHora(linhas[0]?.ultima_sincronizacao ?? null)}
          </p>
        </div>
        <Button onClick={() => sync.mutate()} disabled={sync.isPending}>
          {sync.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Sincronizar com o GOB
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador rotulo="Em acompanhamento ativo" valor={ativas} />
        <Indicador rotulo="Alertas em aberto" valor={totalAlertas} tom="warning" />
        <Indicador rotulo="Achados de auditoria pendentes" valor={totalAchados} tom="destructive" />
        <Indicador rotulo="Encerradas" valor={linhas.length - ativas} />
      </div>

      <Card className="overflow-hidden p-0 shadow-panel">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="flex overflow-hidden rounded-md border border-border">
            {(["ativas", "alertas", "encerradas"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setAba(k)}
                className={`px-3 py-1.5 text-sm capitalize transition-colors ${
                  aba === k ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                {k === "alertas" ? "Com alerta" : k}
              </button>
            ))}
          </div>
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por número, CNPJ ou contribuinte"
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
                <th className="px-4 py-3 font-medium">Número</th>
                <th className="px-4 py-3 font-medium">Contribuinte</th>
                <th className="px-4 py-3 font-medium">Tributo / competência</th>
                <th className="px-4 py-3 font-medium">Situação</th>
                <th className="px-4 py-3 font-medium">Transmissão</th>
                <th className="px-4 py-3 text-right font-medium">Saldo restante</th>
                <th className="px-4 py-3 font-medium">Responsável</th>
                <th className="px-4 py-3 font-medium">Sinais</th>
              </tr>
            </thead>
            <tbody>
              {isPending && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    Carregando declarações…
                  </td>
                </tr>
              )}
              {!isPending && filtradas.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    Nenhuma declaração aqui. Use “Sincronizar com o GOB” para trazer os dados.
                  </td>
                </tr>
              )}
              {filtradas.map((l) => (
                <tr key={l.id} className="border-t border-border hover:bg-surface/70">
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
                  <td className="max-w-64 px-4 py-3">
                    <p className="truncate font-medium">{l.nome ?? "—"}</p>
                    <p className="numero text-xs text-muted-foreground">{documento(l.cnpj)}</p>
                  </td>
                  <td className="max-w-56 px-4 py-3">
                    <p className="truncate">{l.tipo_credito ?? "—"}</p>
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
                  <td className="px-4 py-3 text-xs">{l.responsavel}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {l.alertas > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning-foreground">
                          <BellRing className="size-3" />
                          {l.alertas}
                        </span>
                      )}
                      {l.achados > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                          <AlertTriangle className="size-3" />
                          {l.achados}
                        </span>
                      )}
                      {l.encerrado && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-xs font-medium text-success">
                          <CheckCircle2 className="size-3" />
                          encerrada
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}

function Indicador({
  rotulo,
  valor,
  tom = "primary",
}: {
  rotulo: string;
  valor: number;
  tom?: "primary" | "warning" | "destructive";
}) {
  const cor =
    tom === "warning" ? "text-warning-foreground" : tom === "destructive" ? "text-destructive" : "text-primary";
  return (
    <Card className="gap-1 p-4 shadow-panel">
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{rotulo}</p>
      <p className={`font-display text-3xl font-semibold ${cor}`}>{valor}</p>
    </Card>
  );
}
