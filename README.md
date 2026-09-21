# PER/DCOMP Watcher

ESPECIFICAÇÃO FUNCIONAL E TÉCNICA

Sistema de Acompanhamento de Declarações PERDCOMP

Integração com o sistema GOB · Painel interno da equipe

31 de julho de 2026

Leia antes de repassar para desenvolvimento

Este documento é a especificação de um sistema com backend próprio (servidor + banco de dados). O token de acesso ao sistema GOB e as senhas de login da equipe precisam ficar armazenados e protegidos no servidor — eles não podem, em hipótese alguma, ficar em código que roda no navegador do usuário (frontend), planilhas compartilhadas ou repositórios sem controle de acesso. Isso é o que garante a segurança de todo o sistema.

1. Objetivo

Construir um painel interno que:

•      Traga automaticamente, via API do sistema GOB, todas as declarações PERDCOMP sinalizadas para acompanhamento;

•      Alerte a equipe sempre que o status de uma declaração mudar de “Em análise” para qualquer outro;

•      Permita registrar e controlar, para cada declaração, o pós-processamento: aviso de pagamento, compensação de ofício, intimações e encerramento;

•      Tenha login individual, com senha, para cada integrante da equipe, com trilha de quem alterou o quê.

2. Origem dos dados: integração com o sistema GOB

O sistema GOB já concentra as consultas ao e-CAC e expõe uma API autenticada por token. A integração deste sistema com o GOB segue este desenho:

•      O token de acesso fica guardado apenas no backend (variável de ambiente / cofre de segredos), nunca no frontend.

•      Uma rotina agendada (job) consulta a API do GOB periodicamente — por exemplo, a cada 1 a 4 horas — e grava as declarações novas ou atualizadas no banco de dados interno.

•      A cada consulta, o sistema compara o status recebido com o último status salvo. Se o status anterior era “Em análise” e o novo é diferente, o sistema dispara o alerta de mudança de status (ver seção 4).

•      Campos exatos disponíveis na API do GOB (número do PERDCOMP, CNPJ, tipo de declaração, valor, órgão responsável etc.) devem ser confirmados na documentação do GOB antes da implementação — a lista da seção 3 assume os campos típicos desse tipo de consulta.

3. Modelo de dados

3.1 Campos confirmados na tela do sistema atual (listagem PER/DCOMP)

Com base nas telas do sistema hoje em uso, a listagem principal já traz estes campos por declaração:

Campo

Tipo

Descrição

Número (Rascunho)

Texto

Identificador do PER/DCOMP no e-CAC

NI

CNPJ/CPF

Inscrição do contribuinte

Nome

Texto

Razão social do contribuinte

Tributo/Competência

Texto

Tributo e período/exercício a que se refere o crédito

Situação

Lista

Ex.: Em análise, Deferido, Indeferido, Em diligência, Pendência

Data da transmissão

Data

Data de envio da declaração

Último pedido?

Sim/Não

Indica se é o último pedido vinculado àquele crédito

Saldo restante para utilização

Moeda

Valor do crédito ainda não utilizado

3.2 Campos confirmados na tela de detalhamento (ao abrir a declaração)

Ao selecionar uma declaração, o sistema atual já detalha:

Campo

Tipo

Descrição

Extrato consolidado — crédito

Moeda

Valor total do crédito reconhecido

Extrato consolidado — utilizado

Moeda

Valor já utilizado em compensações/restituições

Extrato consolidado — saldo

Moeda

Crédito − utilizado

Pedidos vinculados

Tabela

Um ou mais pedidos (restituição/compensação/ressarcimento), cada um com número, data de transmissão, tipo de documento, situação, crédito na data da transmissão e valor utilizado

O painel novo deve herdar esses campos automaticamente (somente leitura) e não recriá-los manualmente — evita divergência com o que a Receita mostra no e-CAC.

3.3 Auditoria automática do arquivo

O sistema atual já roda uma auditoria sobre os dados de cada declaração para identificar possíveis erros (ex.: divergência entre crédito informado e saldo utilizado, inconsistência de competência, dados cadastrais desatualizados). O painel deve:

•      Exibir o resultado dessa auditoria na tela de detalhamento da declaração, como uma lista de achados (ex.: “Saldo restante não confere com o valor utilizado nos pedidos”);

•      Sinalizar visualmente, na listagem, as declarações que têm ao menos um achado de auditoria pendente de revisão pela equipe;

•      Permitir que a equipe marque cada achado como “revisado” (sem apagar o histórico do achado).

3.4 Campos de controle interno (preenchidos pela equipe)

Campo

Tipo

Descrição

Responsável

Usuário

Integrante da equipe responsável pelo acompanhamento

Aviso de pagamento

Sim/Não + Data

Sinaliza que o pagamento foi avisado; data usada para dar baixa no acompanhamento pós-recebimento

Compensação de ofício

Sim/Não + Prazo

Sinaliza compensação de ofício e o prazo associado

Intimação — análise preliminar

Sim/Não + Prazo de atendimento

Sinaliza intimação recebida e o prazo para atendimento

Acompanhamento encerrado

Sim/Não + Data de encerramento

Marca a declaração como finalizada; sai da lista de pendências ativas

Observação

Texto livre

Anotações da equipe sobre o caso

3.3 Histórico e auditoria

•      Histórico de status: cada mudança de status recebida do GOB fica registrada com data/hora, para permitir reconstruir a linha do tempo da declaração.

•      Log de alterações dos campos de controle: quem alterou, o quê, quando (ex.: “Maria marcou Aviso de pagamento em 12/08/2026 14:32”).

4. Regras de negócio — motor de alertas

•      Mudança de status: toda vez que a Situação muda de “Em análise” para qualquer outro valor, o sistema gera um alerta visível no painel e, opcionalmente, um e-mail para o responsável pela declaração.

•      Pendência sinalizada pelo GOB: sempre que a Situação recebida do GOB for “Pendência” (ou equivalente), o sistema gera o mesmo tipo de alerta, independentemente do status anterior — pendência é tratada como evento de alta prioridade, não só como mais um valor de status.

•      Novo achado de auditoria: quando a auditoria automática do arquivo identificar um novo possível erro em uma declaração já em acompanhamento, o sistema sinaliza a declaração até que a equipe marque o achado como revisado.

•      Prazos de compensação de ofício e de intimação: o sistema calcula os dias restantes e envia lembretes configuráveis (por exemplo, 5 dias e 1 dia antes do vencimento).

•      Encerramento: ao marcar “Acompanhamento encerrado”, a declaração some da lista de pendências ativas, mas permanece consultável no histórico.

•      Reabertura: perfil Administrador pode reabrir um acompanhamento encerrado, caso necessário.

5. Login individual e controle de acesso

Como a equipe pediu senha real (não apenas seleção de nome), o login precisa de backend próprio:

•      Cada usuário tem login e senha individuais; senhas armazenadas com hash (bcrypt ou argon2), nunca em texto puro.

•      Perfis sugeridos: Administrador (cadastra usuários, configura prazos e integrações) e Operador (acompanha e atualiza os campos de controle das declarações sob sua responsabilidade).

•      Sessão expira após período de inatividade configurável.

•      Recomenda-se autenticação em duas etapas (2FA) para o perfil Administrador, dado o acesso ao token do GOB.

6. Notificações

•      Painel: indicador visual (selo/alerta) nas declarações com mudança de status recente ou prazo próximo do vencimento.

•      E-mail (opcional): resumo diário das pendências e alertas imediatos de mudança de status, configurável por usuário.

7. Arquitetura técnica sugerida

Campo

Tipo

Descrição

Backend

Node.js (Express) ou Python (FastAPI)

Concentra a lógica, o token do GOB e as regras de alerta

Banco de dados

PostgreSQL

Armazena declarações, histórico, usuários e log de auditoria

Agendador

Cron job / worker

Executa a sincronização periódica com a API do GOB

Frontend

Aplicação web (React)

Consome apenas a API do próprio backend — nunca a API do GOB diretamente

Hospedagem

Servidor próprio ou nuvem, com HTTPS

Variáveis de ambiente para segredos (token GOB, chave de sessão)

8. Volumetria

Entre 50 e 200 declarações ativas é um volume compatível com uma aplicação simples de porte pequeno/médio — não exige infraestrutura de alta escala, apenas boas práticas de segurança e organização do banco de dados.

9. Próximos passos

•      Confirmar com o suporte do sistema GOB a documentação da API (endpoints, autenticação, formato de resposta e campos disponíveis).

•      Validar com a equipe a lista definitiva de status possíveis e os prazos padrão de cada tipo de alerta.

•      Desenvolver o backend (login, integração com o GOB, motor de alertas) — recomendo usar o Claude Code para acelerar essa etapa de implementação.

•      Usar o protótipo de interface (em anexo/separado) para validar a experiência de uso com a equipe antes de fechar o desenvolvimento final.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://perdcomp-pilot.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b40e5dfd-fd2d-4124-99f0-3041fb7c16b9).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
