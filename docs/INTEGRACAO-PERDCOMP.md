# PERDCOMP — Documentação completa para integração em outro sistema Lovable

Sistema: Acompanhamento de Declarações PERDCOMP
URL publicada: https://perdcomp-pilot.lovable.app
Stack: TanStack Start (React 19 + Vite) + Lovable Cloud (Postgres/Auth) + integração API GOB.

---

## 1. Visão geral do fluxo

```
GOB (integracao.gob.com.br)
   │  X-Api-Key (token só no servidor)
   ▼
sincronizarComGob()  ──► declaracoes, status_historico, alertas, auditoria_achados
   ▼
Server functions (RPC autenticado)  ──► Painel / Detalhe / Equipe
   ▲
Conecta Tributário (portal)  ── SSO via postMessage/hub_token ──► sessão local
```

Não existe login próprio: a sessão vem do portal Conecta Tributário (SSO).

---

## 2. Variáveis de ambiente

| Nome | Escopo | Uso |
|---|---|---|
| `GOB_API_URL` | servidor | Host da API GOB (`https://integracao.gob.com.br`) |
| `GOB_API_TOKEN` | servidor | Chave `X-Api-Key` do GOB |
| `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` | servidor | Cliente autenticado nas server functions |
| `SUPABASE_SERVICE_ROLE_KEY` | servidor | Escritas privilegiadas (`supabaseAdmin`) |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PROJECT_ID` | navegador | Cliente do front |

Nunca ler `process.env` fora do `.handler()`.

---

## 3. Banco de dados (schema public)

### 3.1 `declaracoes` — espelho do GOB (chave natural `gob_id`)
Identificação: `id`, `gob_id`, `numero_perdcomp`, `numero_recibo`, `cnpj`, `nome`, `razao_social`.
Classificação: `tipo_documento`, `tipo_credito`, `grupo_tributo`, `codigo_receita`, `periodo_apuracao`.
Situação: `situacao`, `ajuda_situacao`, `ultimo_registro`, `data_transmissao`.
Valores: `valor_total_credito`, `valor_utilizado`, `saldo_restante`, `credito_atualizado`, `total_debitos`, `saldo_credito_original`.
Processos: `processo_administrativo`, `processo_judicial`, `processo_habilitacao`.
Documentos: `arquivo_documento_id/_nome`, `arquivo_recibo_id/_nome`.
Responsável extraído do PDF: `responsavel_nome`, `responsavel_cpf`, `responsavel_crc`, `responsavel_email`, `responsavel_extraido_em`.
Controle: `dados` (jsonb bruto do GOB), `primeira_sincronizacao`, `ultima_sincronizacao`, `updated_at`.

### 3.2 `acompanhamentos` — controle interno (1:1 com declaração, PK `declaracao_id`)
`ordem_servico` (O.S.), `terceiro` (exclui dos totais), `aviso_pagamento` + `_data` + `_prazo`,
`pagamento_confirmado` + `_em`, `compensacao_oficio` + `_prazo` + `_opcao` (`""|compensacao|recusa`),
`intimacao` + `_prazo`, `encerrado` + `encerrado_em`, `observacao`, `updated_at`.
Regra: reabrir acompanhamento encerrado exige papel `admin`.

### 3.3 `auditoria_achados`
`declaracao_id`, `codigo`, `descricao`, `severidade` (`atencao|critico`), `revisado`, `revisado_por`, `revisado_em`.
Único por (`declaracao_id`, `codigo`) → inserção idempotente com `upsert ignoreDuplicates`.

### 3.4 `alertas`
Somente mudança de situação vinda do GOB: `tipo`, `prioridade`, `mensagem`, `resolvido`, `resolvido_por/_em`.

### 3.5 `status_historico`
`situacao_anterior`, `situacao_nova`, `registrado_em` — gravado a cada mudança detectada.

### 3.6 `log_alteracoes`
Auditoria das edições da equipe: `campo` (rótulo humano), `valor_anterior`, `valor_novo`, `usuario_id`, `usuario_nome`, `criado_em`.
Só grava campos realmente alterados (nulo/vazio/`false` são equivalentes a "não preenchido").

### 3.7 `profiles` e `user_roles`
`profiles(id, nome, email)` criado por trigger `handle_new_user()`.
`user_roles(user_id, role app_role)` com enum `admin | operador`; verificação por `has_role(_user_id, _role)` (security definer). Papéis NUNCA no profile.

RLS: leitura liberada para `authenticated` em todas as tabelas; escritas apenas via server functions com service role.

---

## 4. Server functions (RPC) — `src/lib/perdcomp.functions.ts`

Chamar no front com `useServerFn(fn)` e argumentos em `{ data: {...} }`. Todas (exceto onde indicado) usam `.middleware([requireSupabaseAuth])`.

| Função | Método | Entrada | Retorno / efeito |
|---|---|---|---|
| `sincronizar` | POST | — | Roda `sincronizarComGob(3000)`; `{ total, novas, atualizadas, alertas, achados }` |
| `listarDeclaracoes` | GET | — | `{ declaracoes, acompanhamentos, achados, alertas, perfis }` (até 3000, ordem por transmissão desc) |
| `obterDeclaracao` | GET | `{ id: uuid }` | `{ declaracao, acompanhamento, achados, historico, alertas, log, perfis }` |
| `salvarAcompanhamento` | POST | objeto completo do acompanhamento | Upsert por `declaracao_id` + grava `log_alteracoes`; bloqueia reabertura por não-admin; `{ ok, alteracoes }` |
| `revisarAchado` | POST | `{ id }` | Marca achado como revisado |
| `resolverAlerta` | POST | `{ id }` | Marca alerta como resolvido |
| `meuAcesso` | GET | — | `{ perfil, papeis[], admin }` |
| `listarEquipe` | GET | — | `{ perfis, papeis }` |
| `criarUsuario` | POST | `{ nome, email, senha, papel }` | Só admin; cria usuário + profile + papel |
| `definirPapel` | POST | `{ user_id, papel }` | Só admin; substitui o papel |
| `precisaBootstrap` | GET (público) | — | `{ vazio }` — indica base sem usuários |
| `criarPrimeiroAdmin` | POST (público) | `{ nome, email, senha }` | Só funciona com base vazia |
| `baixarArquivo` | POST | `{ declaracaoId, tipo: "recibo"\|"documento" }` | `{ base64, nome, mime }` do anexo GOB |
| `buscarResponsavel` | POST | `{ id }` | Lê PDF da declaração e grava responsável |
| `extrairResponsaveis` | POST | `{ limite<=400 }` | Lote de extração de responsáveis pendentes |

Validação de entrada sempre com Zod no `.inputValidator()`.

### SSO — `src/lib/hub-sso.functions.ts`
| `sessaoViaHub` | POST (público) | `{ hubToken }` | Valida o token no portal e devolve `{ tokenHash, email }` para `supabase.auth.verifyOtp({ type: "magiclink" })` |

---

## 5. Camada GOB — `src/lib/gob.server.ts` (server-only)

- `fetchPerdcomps(limite=3000)` — GET `/api/v1/Perdcomp` paginado (`maxSize`, `offset`, `orderBy=modifiedAt`, `order=desc`), header `X-Api-Key`.
- `auditar(registro)` — regras de auditoria automática:
  - `utilizado_maior_credito` (crítico)
  - `divergencia_saldo` (crítico)
  - `saldo_negativo` (crítico)
  - `competencia_ausente` (atenção)
  - `cadastro_incompleto` (atenção)
  - `retificado_cancelado` (atenção)
- `sincronizarComGob(limite)` — upsert em lote por `gob_id`, detecta mudança de situação (grava `status_historico` + `alertas`), regrava achados de auditoria de forma idempotente.
- `baixarDocumentoGob(attachmentId)` — proxy seguro do anexo (base64).
- `lerResponsavelDoPdf` / `extrairResponsavelDoTexto` — leitura do PDF via `unpdf`, extrai Nome, CPF, CRC e e-mail.
- `sincronizarResponsavel(declaracaoId)` e `extrairResponsaveisPendentes(limite)`.

---

## 6. Rotas do front

| Arquivo | URL | Conteúdo |
|---|---|---|
| `src/routes/index.tsx` | `/` | Entrada SSO (sem login): lê `hub_token` da query/hash ou pede a sessão ao portal via `postMessage`, troca por sessão local e redireciona para `/painel` |
| `src/routes/_authenticated/route.tsx` | layout | Gate de autenticação (`ssr:false`) + cabeçalho "Conecta Tributário · PERDCOMP" |
| `src/routes/_authenticated/painel.tsx` | `/painel` | Painel: KPIs, abas, filtros, tabela paginada (20/pág.), badges de prazo/O.S./auditoria, edição rápida, exportação CSV, botões "Sincronizar" e "Ler responsáveis" |
| `src/routes/_authenticated/declaracoes.$id.tsx` | `/declaracoes/$id` | Extrato completo, pós-processamento, histórico de situação, achados, alertas, timeline de log, download de recibo/declaração |
| `src/routes/_authenticated/equipe.tsx` | `/equipe` | Usuários e papéis (admin) |

Utilitários `src/lib/formato.ts`: `moeda`, `dataHora`, `dataCurta`, `documento`, `emAnalise`, `tomSituacao`, `diasRestantes`, `abrirPdf`.

---

## 7. Regras de negócio

1. Declaração marcada como **terceiro** sai de todos os totais em acompanhamento.
2. Declaração sem **ordem de serviço** é sinalizada no painel para inclusão.
3. Prazos (aviso de pagamento, compensação de ofício, intimação) aparecem no painel com destaque por proximidade de vencimento (`diasRestantes`).
4. Alertas = apenas mudança de situação; pendências ficam na auditoria.
5. Log da equipe registra somente alterações efetivas, com rótulos em português e datas em dd/mm/aaaa.
6. Reabertura de acompanhamento encerrado: exclusiva de admin.
7. Auditoria é recalculada a cada sincronização e é idempotente.

---

## 8. Como integrar em outro projeto Lovable

### 8.1 Consumindo o PERDCOMP a partir de um portal (modelo atual)
No portal, embutir por iframe e responder ao pedido de sessão:

```ts
window.addEventListener("message", async (ev) => {
  if (ev.data?.type !== "conecta-tributario:solicitar-sessao") return;
  const { data } = await supabase.auth.getSession();
  ev.source?.postMessage(
    { type: "conecta-tributario:sessao", token: data.session?.access_token },
    "https://perdcomp-pilot.lovable.app",
  );
});
```
Alternativa sem iframe: abrir `https://perdcomp-pilot.lovable.app/?hub_token=<access_token>`.

No PERDCOMP, o portal é validado em `src/lib/hub-sso.server.ts` (`HUB_URL` + `HUB_PUBLISHABLE_KEY`, endpoint `/auth/v1/user`). Para trocar de portal, basta ajustar essas duas constantes.

### 8.2 Portando o módulo para outro projeto
1. Rodar as migrações das 8 tabelas + enum `app_role` + funções `has_role` e `handle_new_user`, com `GRANT` e RLS.
2. Copiar `src/lib/gob.server.ts`, `src/lib/perdcomp.functions.ts`, `src/lib/formato.ts`, `src/lib/hub-sso.*`.
3. Copiar as rotas `_authenticated/painel.tsx`, `_authenticated/declaracoes.$id.tsx`, `_authenticated/equipe.tsx`.
4. Instalar dependências: `@tanstack/react-start`, `@tanstack/react-router`, `@tanstack/react-query`, `zod`, `unpdf`, `sonner`, `lucide-react`.
5. Cadastrar os segredos `GOB_API_URL` e `GOB_API_TOKEN`.
6. Garantir `functionMiddleware` com o anexador de bearer em `src/start.ts`.
7. Publicar e rodar `sincronizar` uma vez para popular a base.
