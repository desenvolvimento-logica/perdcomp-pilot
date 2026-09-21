// Server-only: valida a sessão do portal Conecta Tributário e espelha o usuário aqui.
const HUB_URL = "https://gthudhbrtgsfjlxlkgkm.supabase.co";
const HUB_PUBLISHABLE_KEY = "sb_publishable_hqc5xkmb09FYjD66YY5pgw_tfgNH-5T";

export type HubUser = { id: string; email: string; nome: string };

export async function verificarUsuarioHub(hubToken: string): Promise<HubUser> {
  const res = await fetch(`${HUB_URL}/auth/v1/user`, {
    headers: { apikey: HUB_PUBLISHABLE_KEY, Authorization: `Bearer ${hubToken}` },
  });
  if (!res.ok) throw new Error("Sessão do Conecta Tributário inválida ou expirada.");
  const u = (await res.json()) as {
    id?: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  };
  if (!u?.id || !u.email) throw new Error("Sessão do Conecta Tributário inválida.");
  const meta = u.user_metadata ?? {};
  const nome =
    (typeof meta['nome'] === "string" && meta['nome']) ||
    (typeof meta['full_name'] === "string" && meta['full_name']) ||
    (typeof meta['name'] === "string" && meta['name']) ||
    u.email.split("@")[0]!;
  return { id: u.id, email: u.email.toLowerCase(), nome: String(nome) };
}

export async function garantirSessaoLocal(hubUser: HubUser) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Localiza (ou cria) o usuário equivalente neste sistema, pelo e-mail do portal.
  const { data: perfil } = await supabaseAdmin
    .from("pc_profiles")
    .select("id")
    .eq("email", hubUser.email)
    .maybeSingle();

  let userId = perfil?.id ?? null;

  if (!userId) {
    const { data: criado, error } = await supabaseAdmin.auth.admin.createUser({
      email: hubUser.email,
      email_confirm: true,
      password: crypto.randomUUID() + crypto.randomUUID(),
      user_metadata: { nome: hubUser.nome, origem: "conecta-tributario" },
    });
    if (error || !criado.user) throw new Error(error?.message ?? "Não foi possível liberar o acesso.");
    userId = criado.user.id;
    await supabaseAdmin
      .from("pc_profiles")
      .upsert({ id: userId, nome: hubUser.nome, email: hubUser.email });
    const { count } = await supabaseAdmin
      .from("pc_user_roles")
      .select("user_id", { count: "exact", head: true });
    if ((count ?? 0) === 0) {
      await supabaseAdmin.from("pc_user_roles").insert({ user_id: userId, role: "admin" });
    }
  }

  // Emite um token de sessão local para o mesmo usuário (sem senha, sem login próprio).
  const { data: link, error: linkErro } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: hubUser.email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkErro || !tokenHash) {
    throw new Error(linkErro?.message ?? "Não foi possível abrir a sessão do PERDCOMP.");
  }

  // Troca o token pela sessão já no servidor e devolve os tokens prontos.
  const url = process.env['SUPABASE_URL']!;
  const apikey = process.env['SUPABASE_PUBLISHABLE_KEY']!;
  const res = await fetch(`${url}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
  });
  const sessao = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    error_description?: string;
    message?: string;
  };
  if (!res.ok || !sessao.access_token || !sessao.refresh_token) {
    throw new Error(sessao.error_description ?? sessao.message ?? "Não foi possível abrir a sessão.");
  }

  return {
    accessToken: sessao.access_token,
    refreshToken: sessao.refresh_token,
    email: hubUser.email,
  };
}

