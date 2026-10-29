import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { diaSincronizacao } from "@/lib/gob-schedule";

export const Route = createFileRoute("/api/public/gob-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["PC_GOB_CRON_SECRET"];
        const bearer = request.headers.get("authorization") ?? "";
        if (!secret) return new Response("Agendamento não configurado", { status: 503 });
        const expected = new TextEncoder().encode(`Bearer ${secret}`);
        const actual = new TextEncoder().encode(bearer);
        if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
          return new Response("Não autorizado", { status: 401 });
        }
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length > 0) {
          return new Response("Corpo inválido", { status: 400 });
        }
        const url = process.env["SUPABASE_URL"];
        const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
        if (!url || !key) return new Response("Agendamento indisponível", { status: 503 });
        const cloud = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
        const dia = diaSincronizacao(Date.now());
        // Atomic claim: replays and concurrent callbacks never call GOB twice on the same day.
        const { error } = await cloud.from("pc_gob_sync_diaria").insert({ dia });
        if (error?.code === "23505") return Response.json({ ignorada: true });
        if (error) return new Response("Falha ao registrar execução", { status: 503 });
        try {
          const { sincronizarComGob } = await import("@/lib/gob.server");
          await sincronizarComGob(3000);
          await cloud.from("pc_gob_sync_diaria").update({ sucesso: true, concluido_em: new Date().toISOString() }).eq("dia", dia);
          return Response.json({ sucesso: true });
        } catch {
          await cloud.from("pc_gob_sync_diaria").update({ sucesso: false, erro: "Falha na sincronização GOB", concluido_em: new Date().toISOString() }).eq("dia", dia);
          return new Response("Falha na sincronização", { status: 500 });
        }
      },
    },
  },
});