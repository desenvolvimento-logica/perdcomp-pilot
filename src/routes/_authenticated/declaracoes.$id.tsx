import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, AlertTriangle, BellRing, Check, Loader2, History } from "lucide-react";

import {
  obterDeclaracao,
  salvarAcompanhamento,
  revisarAchado,
  resolverAlerta,
} from "@/lib/perdcomp.functions";
import { moeda, dataHora, dataCurta, documento, tomSituacao, diasRestantes } from "@/lib/formato";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/declaracoes/$id")({
  head: () => ({
    meta: [
      { title: "Detalhe da declaração · Painel PERDCOMP" },
      {
        name: "description",
        content:
          "Extrato consolidado, achados de auditoria, histórico de situação e controle interno de uma declaração PER/DCOMP.",
      },
      { property: "og:title", content: "Detalhe da declaração · Painel PERDCOMP" },
      {
        property: "og:description",
        content: "Extrato consolidado, auditoria, histórico e controle interno da declaração PER/DCOMP.",
      },
    ],
  }),
  component: Detalhe,
});

type Controle = {
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

const vazio: Controle = {
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
};


function Detalhe() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const obter = useServerFn(obterDeclaracao);
  const salvar = useServerFn(salvarAcompanhamento);
  const revisar = useServerFn(revisarAchado);
  const resolver = useServerFn(resolverAlerta);

  const { data, isPending } = useQuery({
    queryKey: ["declaracao", id],
    queryFn: () => obter({ data: { id } }),
  });

  const [form, setForm] = useState<Controle>(vazio);

  useEffect(() => {
    if (data?.acompanhamento) {
      const a = data.acompanhamento;
      setForm({
        ordem_servico: a.ordem_servico ?? "",
        terceiro: a.terceiro ?? false,
        aviso_pagamento: a.aviso_pagamento,
        aviso_pagamento_data: a.aviso_pagamento_data,
        aviso_pagamento_prazo: a.aviso_pagamento_prazo,
        pagamento_confirmado: a.pagamento_confirmado ?? false,
        pagamento_confirmado_em: a.pagamento_confirmado_em ?? null,
        compensacao_oficio: a.compensacao_oficio,
        compensacao_oficio_prazo: a.compensacao_oficio_prazo,
        compensacao_oficio_opcao: (a.compensacao_oficio_opcao ?? "") as Controle["compensacao_oficio_opcao"],
        intimacao: a.intimacao,
        intimacao_prazo: a.intimacao_prazo,

        encerrado: a.encerrado,
        encerrado_em: a.encerrado_em,
        observacao: a.observacao,
      });
    }
  }, [data]);

  const salvarMut = useMutation({
    mutationFn: () => salvar({ data: { declaracao_id: id, ...form } }),
    onSuccess: (r) => {
      toast.success(r.alteracoes > 0 ? `${r.alteracoes} alteração(ões) registrada(s).` : "Acompanhamento salvo.");
      queryClient.invalidateQueries({ queryKey: ["declaracao", id] });
      queryClient.invalidateQueries({ queryKey: ["declaracoes"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  const revisarMut = useMutation({
    mutationFn: (achadoId: string) => revisar({ data: { id: achadoId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["declaracao", id] }),
  });

  const resolverMut = useMutation({
    mutationFn: (alertaId: string) => resolver({ data: { id: alertaId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["declaracao", id] });
      queryClient.invalidateQueries({ queryKey: ["declaracoes"] });
    },
  });

  if (isPending) {
    return <main className="mx-auto max-w-[1200px] px-4 py-16 text-muted-foreground">Carregando…</main>;
  }
  const d = data?.declaracao;
  if (!d) {
    return <main className="mx-auto max-w-[1200px] px-4 py-16">Declaração não encontrada.</main>;
  }

  const bruto = (d.dados ?? {}) as Record<string, unknown>;
  const credito = d.valor_total_credito;
  const utilizado = d.valor_utilizado;

  return (
    <main className="mx-auto max-w-[1200px] space-y-6 px-4 py-8">
      <Link to="/painel" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="size-4" /> Voltar às declarações
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="numero text-sm text-muted-foreground">{d.numero_perdcomp}</p>
          <h1 className="font-display text-2xl font-semibold">{d.nome ?? "—"}</h1>
          <p className="numero mt-1 text-sm text-muted-foreground">{documento(d.cnpj)}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-sm font-medium ${tomSituacao(d.situacao)}`}>
          {d.situacao ?? "—"}
        </span>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <Card className="p-5 shadow-panel">
            <h2 className="font-display text-base font-semibold">Extrato consolidado</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Valor rotulo="Crédito" valor={credito} />
              <Valor rotulo="Utilizado" valor={utilizado} />
              <Valor rotulo="Saldo" valor={d.saldo_restante} destaque />
            </div>
            <dl className="mt-6 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Campo rotulo="Tipo de documento" valor={d.tipo_documento} />
              <Campo rotulo="Tipo de crédito" valor={d.tipo_credito} />
              <Campo rotulo="Tributo / competência" valor={d.periodo_apuracao} />
              <Campo rotulo="Data da transmissão" valor={dataHora(d.data_transmissao)} />
              <Campo rotulo="Último pedido?" valor={d.ultimo_registro ? "Sim" : "Não"} />
              <Campo rotulo="Detalhe da situação" valor={d.ajuda_situacao} />
              <Campo rotulo="Crédito na data da transmissão" valor={moeda(asNum(bruto["valorCreditoDataTransmissao"]))} />
              <Campo rotulo="Pedido de restituição" valor={moeda(asNum(bruto["valorPedidoRestituicao"]))} />
              <Campo rotulo="Processo administrativo" valor={asStr(bruto["processoAdministrativo"])} />
              <Campo rotulo="Processo judicial" valor={asStr(bruto["processoJudicial"])} />
              <Campo rotulo="Retificado / cancelado" valor={asStr(bruto["retificadoCancelado"])} />
              <Campo rotulo="Consulta no e-CAC" valor={dataHora(asStr(bruto["dataConsulta"]))} />
            </dl>
          </Card>

          <Card className="p-5 shadow-panel">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <AlertTriangle className="size-4 text-destructive" /> Auditoria do arquivo
            </h2>
            {data.achados.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Nenhum achado identificado nesta declaração.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {data.achados.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-start justify-between gap-4 rounded-md border border-border p-3"
                  >
                    <div>
                      <p className={`text-sm ${a.revisado ? "text-muted-foreground line-through" : ""}`}>
                        {a.descricao}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {a.severidade === "critico" ? "Crítico" : "Atenção"} · identificado em{" "}
                        {dataCurta(a.criado_em)}
                        {a.revisado && ` · revisado em ${dataCurta(a.revisado_em)}`}
                      </p>
                    </div>
                    {!a.revisado && (
                      <Button size="sm" variant="outline" onClick={() => revisarMut.mutate(a.id)}>
                        <Check className="size-4" /> Revisado
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5 shadow-panel">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <BellRing className="size-4 text-warning-foreground" /> Alertas
            </h2>
            {data.alertas.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Sem alertas para esta declaração.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {data.alertas.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
                    <div>
                      <p className={`text-sm ${a.resolvido ? "text-muted-foreground line-through" : ""}`}>
                        {a.mensagem}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {a.prioridade === "alta" ? "Alta prioridade" : "Normal"} · {dataHora(a.criado_em)}
                      </p>
                    </div>
                    {!a.resolvido && (
                      <Button size="sm" variant="outline" onClick={() => resolverMut.mutate(a.id)}>
                        Dar ciência
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5 shadow-panel">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <History className="size-4" /> Histórico de situação
            </h2>
            <ol className="mt-4 space-y-3 border-l border-border pl-4">
              {data.historico.map((h) => (
                <li key={h.id} className="relative text-sm">
                  <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-primary" />
                  <p>
                    {h.situacao_anterior ? `${h.situacao_anterior} → ` : "Registro inicial: "}
                    <strong>{h.situacao_nova}</strong>
                  </p>
                  <p className="text-xs text-muted-foreground">{dataHora(h.registrado_em)}</p>
                </li>
              ))}
              {data.historico.length === 0 && <li className="text-sm text-muted-foreground">Sem registros.</li>}
            </ol>
          </Card>

          <Card className="p-5 shadow-panel">
            <h2 className="font-display text-base font-semibold">Log de alterações da equipe</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Registra apenas os campos que a equipe realmente alterou.
            </p>
            {data.log.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">Sem alterações registradas.</p>
            ) : (
              <div className="mt-4 divide-y divide-border overflow-hidden rounded-md border border-border">
                {data.log.map((l) => (
                  <div key={l.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
                    <div className="min-w-[55%]">
                      <p className="text-sm font-medium">{l.campo}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="rounded bg-surface px-1.5 py-0.5 text-muted-foreground line-through">
                          {l.valor_anterior || "—"}
                        </span>
                        <ArrowRight className="size-3 text-muted-foreground" />
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                          {l.valor_novo || "—"}
                        </span>
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p className="font-medium text-foreground">{l.usuario_nome || "Usuário"}</p>
                      <p>{dataHora(l.criado_em)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

        </div>

        <Card className="h-fit space-y-5 p-5 shadow-panel lg:sticky lg:top-20">
          <div>
            <h2 className="font-display text-base font-semibold">Controle interno</h2>
            <p className="text-xs text-muted-foreground">Preenchido pela equipe. Toda alteração fica registrada.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="os">Ordem de serviço</Label>
            <Input
              id="os"
              value={form.ordem_servico}
              onChange={(e) => setForm({ ...form, ordem_servico: e.target.value })}
              placeholder="Ex.: OS-2026-0147"
            />
            {form.ordem_servico.trim() === "" && !form.terceiro && (
              <p className="text-xs text-destructive">Declaração sem O.S. vinculada — inclua o número.</p>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
            <div>
              <span className="text-sm font-medium">PERDCOMP de terceiro</span>
              <p className="text-xs text-muted-foreground">
                Não acompanhamos; sai do total em acompanhamento.
              </p>
            </div>
            <Switch checked={form.terceiro} onCheckedChange={(v) => setForm({ ...form, terceiro: v })} />
          </div>


          <BlocoControle
            titulo="Aviso de pagamento"
            ativo={form.aviso_pagamento}
            onAtivo={(v) => setForm({ ...form, aviso_pagamento: v })}
            rotuloData="Data do aviso"
            data={form.aviso_pagamento_data}
            onData={(v) => setForm({ ...form, aviso_pagamento_data: v })}
            rotuloPrazo="Prazo para atender"
            prazo={form.aviso_pagamento_prazo}
            onPrazo={(v) => setForm({ ...form, aviso_pagamento_prazo: v })}
          />
          <BlocoControle
            titulo="Compensação de ofício"
            ativo={form.compensacao_oficio}
            onAtivo={(v) => setForm({ ...form, compensacao_oficio: v })}
            rotuloData="Prazo"
            data={form.compensacao_oficio_prazo}
            onData={(v) => setForm({ ...form, compensacao_oficio_prazo: v })}
          />
          <BlocoControle
            titulo="Intimação — análise preliminar"
            ativo={form.intimacao}
            onAtivo={(v) => setForm({ ...form, intimacao: v })}
            rotuloData="Prazo de atendimento"
            data={form.intimacao_prazo}
            onData={(v) => setForm({ ...form, intimacao_prazo: v })}
          />
          <BlocoControle
            titulo="Acompanhamento encerrado"
            ativo={form.encerrado}
            onAtivo={(v) => setForm({ ...form, encerrado: v })}
            rotuloData="Data de encerramento"
            data={form.encerrado_em}
            onData={(v) => setForm({ ...form, encerrado_em: v })}
          />

          <div className="space-y-2">
            <Label htmlFor="obs">Observação</Label>
            <Textarea
              id="obs"
              rows={4}
              value={form.observacao}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            />
          </div>

          <Button className="w-full" onClick={() => salvarMut.mutate()} disabled={salvarMut.isPending}>
            {salvarMut.isPending && <Loader2 className="size-4 animate-spin" />}
            Salvar acompanhamento
          </Button>
        </Card>
      </div>
    </main>
  );
}

function BlocoControle({
  titulo,
  ativo,
  onAtivo,
  rotuloData,
  data,
  onData,
  rotuloPrazo,
  prazo,
  onPrazo,
}: {
  titulo: string;
  ativo: boolean;
  onAtivo: (v: boolean) => void;
  rotuloData: string;
  data: string | null;
  onData: (v: string | null) => void;
  rotuloPrazo?: string;
  prazo?: string | null;
  onPrazo?: (v: string | null) => void;
}) {
  const dias = ativo ? diasRestantes(onPrazo ? (prazo ?? null) : data) : null;
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{titulo}</span>
        <Switch checked={ativo} onCheckedChange={onAtivo} />
      </div>
      {ativo && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{rotuloData}</Label>
          <Input type="date" value={data ?? ""} onChange={(e) => onData(e.target.value || null)} />
          {onPrazo && (
            <>
              <Label className="text-xs text-muted-foreground">{rotuloPrazo}</Label>
              <Input type="date" value={prazo ?? ""} onChange={(e) => onPrazo(e.target.value || null)} />
            </>
          )}
          {dias !== null && (
            <p className={`text-xs ${dias <= 1 ? "text-destructive" : "text-muted-foreground"}`}>
              {dias < 0 ? `Vencido há ${Math.abs(dias)} dia(s)` : `Faltam ${dias} dia(s)`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Valor({ rotulo, valor, destaque }: { rotulo: string; valor: number | null; destaque?: boolean }) {
  return (
    <div className="rounded-md bg-surface p-3">
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{rotulo}</p>
      <p className={`numero mt-1 text-lg font-semibold ${destaque ? "text-primary" : ""}`}>{moeda(valor)}</p>
    </div>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-muted-foreground uppercase">{rotulo}</dt>
      <dd className="mt-0.5">{valor ?? "—"}</dd>
    </div>
  );
}

function asNum(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}
function asStr(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
