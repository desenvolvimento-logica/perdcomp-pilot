import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { UserPlus, Loader2 } from "lucide-react";

import { listarEquipe, criarUsuario, definirPapel, meuAcesso } from "@/lib/perdcomp.functions";
import { dataCurta } from "@/lib/formato";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/equipe")({
  head: () => ({
    meta: [
      { title: "Equipe e acessos · Painel PERDCOMP" },
      {
        name: "description",
        content: "Cadastro de integrantes da equipe e definição de perfis de acesso (Administrador e Operador).",
      },
      { property: "og:title", content: "Equipe e acessos · Painel PERDCOMP" },
      { property: "og:description", content: "Cadastro de integrantes e perfis de acesso do painel PERDCOMP." },
    ],
  }),
  component: Equipe,
});

function Equipe() {
  const queryClient = useQueryClient();
  const listar = useServerFn(listarEquipe);
  const acessoFn = useServerFn(meuAcesso);
  const criar = useServerFn(criarUsuario);
  const papelFn = useServerFn(definirPapel);

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [papel, setPapel] = useState<"admin" | "operador">("operador");

  const { data } = useQuery({ queryKey: ["equipe"], queryFn: () => listar() });
  const { data: acesso } = useQuery({ queryKey: ["meu-acesso"], queryFn: () => acessoFn() });

  const criarMut = useMutation({
    mutationFn: () => criar({ data: { nome, email, senha, papel } }),
    onSuccess: () => {
      toast.success("Usuário cadastrado.");
      setNome("");
      setEmail("");
      setSenha("");
      queryClient.invalidateQueries({ queryKey: ["equipe"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível cadastrar."),
  });

  const papelMut = useMutation({
    mutationFn: (v: { user_id: string; papel: "admin" | "operador" }) => papelFn({ data: v }),
    onSuccess: () => {
      toast.success("Perfil de acesso atualizado.");
      queryClient.invalidateQueries({ queryKey: ["equipe"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível atualizar."),
  });

  if (acesso && !acesso.admin) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="font-display text-xl font-semibold">Acesso restrito</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Apenas o perfil Administrador pode gerenciar os acessos da equipe.
        </p>
      </main>
    );
  }

  const papelDe = (id: string) => data?.papeis.find((p) => p.user_id === id)?.role ?? "operador";

  return (
    <main className="mx-auto grid max-w-[1100px] gap-6 px-4 py-8 lg:grid-cols-[1fr_360px]">
      <Card className="overflow-hidden p-0 shadow-panel">
        <div className="border-b border-border p-4">
          <h1 className="font-display text-lg font-semibold">Equipe</h1>
          <p className="text-sm text-muted-foreground">Integrantes com acesso ao painel.</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">E-mail</th>
              <th className="px-4 py-3 font-medium">Desde</th>
              <th className="px-4 py-3 font-medium">Perfil</th>
            </tr>
          </thead>
          <tbody>
            {(data?.perfis ?? []).map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{p.nome}</td>
                <td className="px-4 py-3 text-muted-foreground">{p.email}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{dataCurta(p.created_at)}</td>
                <td className="px-4 py-3">
                  <Select
                    value={papelDe(p.id)}
                    onValueChange={(v) => papelMut.mutate({ user_id: p.id, papel: v as "admin" | "operador" })}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="operador">Operador</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="h-fit p-5 shadow-panel">
        <h2 className="font-display text-base font-semibold">Cadastrar integrante</h2>
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            criarMut.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="n">Nome</Label>
            <Input id="n" value={nome} onChange={(e) => setNome(e.target.value)} required minLength={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="e">E-mail</Label>
            <Input id="e" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s">Senha provisória</Label>
            <Input id="s" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={8} />
          </div>
          <div className="space-y-2">
            <Label>Perfil</Label>
            <Select value={papel} onValueChange={(v) => setPapel(v as "admin" | "operador")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="operador">Operador</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full" disabled={criarMut.isPending}>
            {criarMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            Cadastrar
          </Button>
        </form>
      </Card>
    </main>
  );
}
