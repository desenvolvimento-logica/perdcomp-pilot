import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, Loader2, LockKeyhole } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { sessaoEmbutida, sessaoViaHub } from "@/lib/hub-sso.functions";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "PERDCOMP · Conecta Tributário" },
      {
        name: "description",
        content:
          "Módulo PERDCOMP do Conecta Tributário: acompanhamento de declarações PER/DCOMP com acesso unificado ao portal.",
      },
      { property: "og:title", content: "PERDCOMP · Conecta Tributário" },
      {
        property: "og:description",
        content: "Acompanhamento de declarações PER/DCOMP dentro do portal Conecta Tributário.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Entrada,
});

function lerTokenDaUrl(): string | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const daQuery = url.searchParams.get("hub_token");
  if (daQuery) return daQuery;
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  return hash.get("hub_token");
}

function Entrada() {
  const navigate = useNavigate();
  const trocarSessao = useServerFn(sessaoViaHub);
  const abrirSessaoEmbutida = useServerFn(sessaoEmbutida);
  const [erro, setErro] = useState<string | null>(null);
  const processando = useRef(false);

  const entrarComToken = useCallback(
    async (hubToken: string) => {
      if (processando.current) return;
      processando.current = true;
      try {
        const { accessToken, refreshToken } = await trocarSessao({ data: { hubToken } });
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) throw new Error(error.message);
        navigate({ to: "/painel", replace: true });
      } catch (e) {
        processando.current = false;
        setErro(e instanceof Error ? e.message : "Não foi possível validar seu acesso.");
      }
    },
    [navigate, trocarSessao],
  );

  const entrarEmbutido = useCallback(async () => {
    if (processando.current) return;
    processando.current = true;
    try {
      const { accessToken, refreshToken } = await abrirSessaoEmbutida();
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) throw new Error(error.message);
      navigate({ to: "/painel", replace: true });
    } catch (e) {
      processando.current = false;
      setErro(e instanceof Error ? e.message : "Não foi possível abrir o sistema.");
    }
  }, [abrirSessaoEmbutida, navigate]);

  useEffect(() => {
    let ativo = true;

    async function iniciar() {
      const { data } = await supabase.auth.getSession();
      if (!ativo) return;
      if (data.session) {
        navigate({ to: "/painel", replace: true });
        return;
      }
      const token = lerTokenDaUrl();
      if (token) {
        void entrarComToken(token);
        return;
      }
      // Sem token: pede a sessão ao aplicativo que embute este módulo e,
      // se não vier resposta, abre a sessão da equipe e mostra o sistema direto.
      window.parent?.postMessage({ type: "conecta-tributario:solicitar-sessao" }, "*");
      window.setTimeout(() => {
        if (ativo && !processando.current) void entrarEmbutido();
      }, 1200);
    }

    function onMensagem(ev: MessageEvent) {
      const payload = ev.data as { type?: string; token?: string } | null;
      if (!payload || payload.type !== "conecta-tributario:sessao" || !payload.token) return;
      void entrarComToken(payload.token);
    }

    window.addEventListener("message", onMensagem);
    void iniciar();
    return () => {
      ativo = false;
      window.removeEventListener("message", onMensagem);
    };
  }, [entrarComToken, entrarEmbutido, navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md space-y-5 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {erro ? <LockKeyhole className="size-6" /> : <ShieldCheck className="size-6" />}
        </div>
        <h1 className="font-display text-2xl font-semibold">PERDCOMP · Conecta Tributário</h1>
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Abrindo o sistema…
        </p>
      </div>
    </main>
  );
}

