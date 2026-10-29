CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE TABLE public.pc_gob_sync_diaria (dia date PRIMARY KEY, iniciado_em timestamptz NOT NULL DEFAULT now(), concluido_em timestamptz, sucesso boolean, erro text);
GRANT ALL ON public.pc_gob_sync_diaria TO service_role;
ALTER TABLE public.pc_gob_sync_diaria ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.pc_configurar_cron_gob(_segredo text) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE existente bigint; novo bigint;
BEGIN
IF length(_segredo) < 32 THEN RAISE EXCEPTION 'Segredo inválido'; END IF;
FOR existente IN SELECT jobid FROM cron.job WHERE jobname = 'pc-gob-sync-diaria' LOOP PERFORM cron.unschedule(existente); END LOOP;
SELECT cron.schedule('pc-gob-sync-diaria', '0 3 * * *', format('SELECT net.http_post(url := %L, headers := jsonb_build_object(''Content-Type'', ''application/json'', ''Authorization'', %L), body := ''{}''::jsonb, timeout_milliseconds := 600000);', 'https://project--b40e5dfd-fd2d-4124-99f0-3041fb7c16b9.lovable.app/api/public/gob-sync', 'Bearer ' || _segredo)) INTO novo;
RETURN novo;
END $$;
REVOKE ALL ON FUNCTION public.pc_configurar_cron_gob(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pc_configurar_cron_gob(text) TO service_role;