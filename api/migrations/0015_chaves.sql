-- As chaves de API (PLANO-API.md, seção 5): o que deixa uma AI ou um programa ler e mexer no mural de
-- uma conta, com permissões. O segredo aparece uma vez, no site; aqui fica só o SHA-256 dele (como nas
-- sessões). Os conectores do OAuth (rodada 5) vão usar esta mesma tabela, com colunas a mais.
CREATE TABLE api_chaves (
  -- público (ch_ + 16 letras): aparece na lista e, depois, nos pedidos
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  hash TEXT UNIQUE,
  nome TEXT NOT NULL,
  -- manual (criada no site) | oauth (um conector) | cli (o login da CLI)
  origem TEXT NOT NULL,
  -- JSON: a lista de escopos (shared/api-v1/escopos.ts)
  escopos TEXT NOT NULL,
  -- JSON: os grupos das Anotações que ela alcança; NULL = todos
  grupos TEXT,
  -- nunca | mudancas | tudo
  aprovacao TEXT NOT NULL,
  criada_em TEXT NOT NULL,
  expira_em TEXT NOT NULL,
  -- gravado no máximo uma vez por hora
  usada_em TEXT
);
CREATE INDEX api_chaves_por_usuario ON api_chaves (usuario_id);
