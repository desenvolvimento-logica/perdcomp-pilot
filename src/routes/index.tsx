import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/app-client";

const HUB_URL = "https://hub-ivory-eta.vercel.app";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "PERDCOMP · Conecta Tributário" },
      {
        name: "description",
        content:
          "Acompanhamento de declarações PER/DCOMP com acesso unificado pelo portal Luz.IA.",
      },
      { property: "og:title", content: "PERDCOMP · Conecta Tributário" },
      {
        property: "og:description",
        content: "Acompanhamento de declarações PER/DCOMP pelo portal Luz.IA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Entrada,
});

function Entrada() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        session &&
        (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")
      ) {
        navigate({ to: "/painel", replace: true });
      }
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelado) return;
      if (data.session) {
        navigate({ to: "/painel", replace: true });
        return;
      }
      setTimeout(() => {
        if (!cancelado) setChecking(false);
      }, 2500);
    })();
    return () => {
      cancelado = true;
    };
  }, [navigate]);

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-md space-y-4 text-center">
          <Loader2 className="mx-auto size-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Abrindo o sistema…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md space-y-5 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <ShieldAlert className="size-6" />
        </div>
        <h1 className="font-display text-2xl font-semibold">Acesso não autorizado</h1>
        <p className="text-sm text-muted-foreground">
          O acesso a este aplicativo é feito exclusivamente pelo Luz.IA. Abra o PERDCOMP a partir do
          portal.
        </p>
        <Button asChild>
          <a href={HUB_URL}>Ir para o Luz.IA</a>
        </Button>
      </div>
    </main>
  );
}
