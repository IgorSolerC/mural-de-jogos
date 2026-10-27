-- O OAuth 2.1 dos conectores (PLANO-API.md, seção 11): o claude.ai, o Claude Code e o ChatGPT ganham
-- acesso sem copiar chave. Cada autorização vira uma linha em api_chaves com origem = 'oauth'.

-- Os clientes: registrados (RFC 7591, id oc_ + 16 letras) ou por documento (CIMD, o id é o endereço).
CREATE TABLE oauth_clientes (
  id TEXT PRIMARY KEY,
  -- o nome que o cliente diz ter (não é confiável)
  nome TEXT NOT NULL,
  -- JSON: os endereços de volta aceitos
  retornos TEXT NOT NULL,
  -- dcr | cimd
  tipo TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  -- a última autorização; sem nenhuma em 24 h, a limpeza tira
  usado_em TEXT
);
CREATE INDEX oauth_clientes_por_data ON oauth_clientes (criado_em);

-- O pedido de autorização, enquanto a pessoa decide na página Autorizar (10 minutos).
CREATE TABLE oauth_pedidos (
  -- público (op_ + 16 letras): vai no endereço da página
  id TEXT PRIMARY KEY,
  cliente_id TEXT NOT NULL,
  retorno TEXT NOT NULL,
  -- o code_challenge do PKCE (S256)
  desafio TEXT NOT NULL,
  -- o state do cliente, devolvido igual
  estado_cliente TEXT,
  -- o resource (RFC 8707)
  recurso TEXT,
  -- JSON: os escopos que o cliente pediu
  escopos_pedidos TEXT NOT NULL,
  expira_em TEXT NOT NULL
);

-- O código que volta ao cliente (5 minutos, uma vez); só o SHA-256 dele.
CREATE TABLE oauth_codigos (
  hash TEXT PRIMARY KEY,
  chave_id TEXT NOT NULL,
  cliente_id TEXT NOT NULL,
  retorno TEXT NOT NULL,
  desafio TEXT NOT NULL,
  recurso TEXT,
  expira_em TEXT NOT NULL
);

-- A chave de um conector: o cliente, o prazo do token de acesso (que mora em `hash`, no formato das
-- chaves; nulo nas chaves manuais, que valem até `expira_em`), a renovação de agora e a de antes (que,
-- se voltar, corta a chave: sinal de roubo) e a hora da última renovação.
ALTER TABLE api_chaves ADD COLUMN cliente_id TEXT;
ALTER TABLE api_chaves ADD COLUMN hash_expira_em TEXT;
ALTER TABLE api_chaves ADD COLUMN renovacao_hash TEXT;
ALTER TABLE api_chaves ADD COLUMN renovacao_velha_hash TEXT;
ALTER TABLE api_chaves ADD COLUMN renovada_em TEXT;
CREATE UNIQUE INDEX api_chaves_por_renovacao ON api_chaves (renovacao_hash);
CREATE INDEX api_chaves_por_renovacao_velha ON api_chaves (renovacao_velha_hash);
