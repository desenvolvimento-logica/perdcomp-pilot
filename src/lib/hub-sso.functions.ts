import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// SSO com o portal Conecta Tributário: o portal envia o token da sessão dele,
// validamos esse token no backend do portal e devolvemos um token de sessão
// local equivalente. Não existe login próprio neste sistema.
export const sessaoViaHub = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ hubToken: z.string().min(20) }).parse(d))
  .handler(async ({ data }) => {
    const { verificarUsuarioHub, garantirSessaoLocal } = await import("./hub-sso.server");
    const hubUser = await verificarUsuarioHub(data.hubToken);
    return garantirSessaoLocal(hubUser);
  });
