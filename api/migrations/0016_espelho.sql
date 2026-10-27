-- O espelho (PLANO-API.md, seção 8): uma cópia por item, no formato público v1, que o site manda
-- depois de sincronizar, para a API das AIs ler sem abrir o mural (que não cabe nos 10 ms de CPU do
-- Worker grátis). Só existe para a conta com alguma chave que lê; a limpeza diária tira o resto.
-- Só a chave primária como índice: cada índice conta linha gravada no D1.
CREATE TABLE api_espelho (
  usuario_id TEXT NOT NULL,
  -- nota | contexto (as outras áreas chegam uma por rodada)
  tipo TEXT NOT NULL,
  id TEXT NOT NULL,
  -- a versão do item (o updatedAt da nota)
  versao TEXT,
  -- o SHA-256 curto do JSON v1: o site compara para mandar só o que mudou
  hash TEXT NOT NULL,
  -- o grupo sem acento e em minúsculas (para filtrar e para o limite de grupos da chave)
  grupo TEXT,
  -- a data que ordena (a da nota)
  data TEXT,
  -- título e texto sem acento e em minúsculas, para a busca
  busca TEXT,
  -- o JSON v1
  dados TEXT NOT NULL,
  PRIMARY KEY (usuario_id, tipo, id)
) WITHOUT ROWID;

CREATE TABLE api_espelho_estado (
  usuario_id TEXT PRIMARY KEY,
  -- a rev do mural que o espelho reflete
  rev INTEGER NOT NULL,
  -- o fuso do aparelho que mandou por último (America/Sao_Paulo): "hoje" e "ontem" são dele
  fuso TEXT,
  atualizado_em TEXT NOT NULL,
  -- a cota de linhas do espelho por conta e por dia UTC
  dia TEXT NOT NULL,
  linhas_dia INTEGER NOT NULL
);
