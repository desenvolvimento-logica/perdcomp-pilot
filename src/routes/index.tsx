import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck, LockKeyhole, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { precisaBootstrap, criarPrimeiroAdmin } from "@/lib/perdcomp.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Entrar · Painel PERDCOMP" },
      {
        name: "description",
        content: "Acesso restrito da equipe ao painel de acompanhamento de declarações PER/DCOMP integrado ao GOB.",
      },
      { property: "og:title", content: "Entrar · Painel PERDCOMP" },
      {
        property: "og:description",
        content: "Acesso restrito da equipe ao painel de acompanhamento de declarações PER/DCOMP.",
      },
    ],
  }),
  component: Entrar,
});

function Entrar() {
  const navigate = useNavigate();
  const bootstrapFn = useServerFn(precisaBootstrap);
  const criarAdmin = useServerFn(criarPrimeiroAdmin);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [carregando, setCarregando] = useState(false);

  const { data: bootstrap, refetch } = useQuery({
    queryKey: ["bootstrap"],
    queryFn: () => bootstrapFn(),
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/painel", replace: true });
    });
  }, [navigate]);

  const primeiroAcesso = bootstrap?.vazio === true;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    try {
      if (primeiroAcesso) {
        await criarAdmin({ data: { nome, email, senha } });
        toast.success("Administrador criado. Entrando…");
        await refetch();
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) throw new Error("E-mail ou senha inválidos.");
      navigate({ to: "/painel", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          <ShieldCheck className="size-6 text-sidebar-primary" />
          <span className="font-display text-lg font-semibold">Painel PERDCOMP</span>
        </div>
        <div className="max-w-md space-y-5">
          <h1 className="font-display text-4xl leading-tight font-semibold">
            Acompanhamento de declarações PER/DCOMP
          </h1>
          <p className="text-sm leading-relaxed text-sidebar-foreground/75">
            Sincronização automática com o sistema GOB, alerta imediato quando a situação sai de “Em análise”,
            auditoria do arquivo e controle interno de avisos, intimações e prazos.
          </p>
          <ul className="space-y-2 text-sm text-sidebar-foreground/70">
            <li>· Token do GOB protegido no servidor</li>
            <li>· Login individual com trilha de auditoria</li>
            <li>· Histórico completo de situação por declaração</li>
          </ul>
        </div>
        <p className="text-xs text-sidebar-foreground/50">Uso interno · dados fiscais sigilosos</p>
      </section>

      <section className="flex items-center justify-center px-6 py-16">
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-6">
          <div className="space-y-2">
            <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <LockKeyhole className="size-5" />
            </div>
            <h2 className="font-display text-2xl font-semibold">
              {primeiroAcesso ? "Criar acesso de administrador" : "Entrar no painel"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {primeiroAcesso
                ? "Nenhum usuário cadastrado ainda. Crie a primeira conta de Administrador."
                : "Acesso restrito à equipe. Novas contas são criadas pelo Administrador."}
            </p>
          </div>

          {primeiroAcesso && (
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required minLength={2} />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="senha">Senha</Label>
            <Input
              id="senha"
              type="password"
              autoComplete={primeiroAcesso ? "new-password" : "current-password"}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
              minLength={8}
            />
          </div>

          <Button type="submit" className="w-full" disabled={carregando}>
            {carregando && <Loader2 className="size-4 animate-spin" />}
            {primeiroAcesso ? "Criar e entrar" : "Entrar"}
          </Button>
        </form>
      </section>
    </main>
  );
}
