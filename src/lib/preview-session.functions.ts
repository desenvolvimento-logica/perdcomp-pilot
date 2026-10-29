import { createServerFn } from "@tanstack/react-start";
import { permiteAcessoTemporario } from "./preview-access";

export const abrirSessaoDeAjustes = createServerFn({ method: "POST" }).handler(async () => {
  if (!permiteAcessoTemporario(import.meta.env.DEV)) {
    throw new Error("Acesso temporário desabilitado fora da prévia.");
  }

  // Development only: use the existing app administrator, never create users or roles.
  const { appAdminClient, APP_SUPABASE_URL } = await import("@/integrations/supabase/app-admin.server");
  const { createClient } = await import("@supabase/supabase-js");
  const { APP_SUPABASE_PUBLISHABLE_KEY } = await import("@/integrations/supabase/app-client");
  const { data, error } = await appAdminClient().auth.admin.generateLink({
    type: "magiclink",
    email: "admin@painelperdcomp.com.br",
  });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) throw new Error("Não foi possível abrir o acesso de ajustes.");

  const client = createClient(APP_SUPABASE_URL, APP_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  const { data: verified, error: verificationError } = await client.auth.verifyOtp({
    type: "magiclink", token_hash: tokenHash,
  });
  if (verificationError || !verified.session) {
    throw new Error("Não foi possível validar a sessão de ajustes.");
  }
  return { access_token: verified.session.access_token, refresh_token: verified.session.refresh_token };
});