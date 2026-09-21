import { createFileRoute, redirect, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, LogOut, LayoutList, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/app-client";
import { meuAcesso } from "@/lib/perdcomp.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("pc_profiles").upsert({
          id: user.id,
          nome:
            user.user_metadata?.nome ??
            user.user_metadata?.full_name ??
            user.email?.split("@")[0] ??
            "",
          email: user.email ?? "",
        });
      }
    }
    if (!data.session) throw redirect({ to: "/" });
  },
  component: Layout,
});


function Layout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const acessoFn = useServerFn(meuAcesso);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { data: acesso } = useQuery({ queryKey: ["meu-acesso"], queryFn: () => acessoFn() });

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  const itens = [
    { to: "/painel", rotulo: "Declarações", icone: LayoutList },
    ...(acesso?.admin ? [{ to: "/equipe", rotulo: "Equipe", icone: Users }] : []),
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-6 px-4">
          <Link to="/painel" className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-sidebar-primary" />
            <span className="font-display text-sm font-semibold">Conecta Tributário · PERDCOMP</span>
          </Link>
          <nav className="flex items-center gap-1">
            {itens.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  pathname.startsWith(item.to)
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60"
                }`}
              >
                <item.icone className="size-4" />
                {item.rotulo}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-medium">{acesso?.perfil?.nome ?? "—"}</p>
              <p className="text-[11px] text-sidebar-foreground/60">
                {acesso?.admin ? "Administrador" : "Operador"}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={sair} className="text-sidebar-foreground/80">
              <LogOut className="size-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
