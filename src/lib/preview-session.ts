import { supabase } from "@/integrations/supabase/app-client";
import { permiteAcessoTemporario } from "./preview-access";
import { abrirSessaoDeAjustes } from "./preview-session.functions";

let pending: Promise<void> | undefined;

export async function garantirSessaoDeAjustes() {
  if (!permiteAcessoTemporario(import.meta.env.DEV)) return;
  if (pending) return pending;
  pending = (async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) return;
    const tokens = await abrirSessaoDeAjustes();
    const { error } = await supabase.auth.setSession(tokens);
    if (error) throw new Error("Não foi possível entrar no sistema para ajustes.");
  })();
  try { await pending; } finally { pending = undefined; }
}