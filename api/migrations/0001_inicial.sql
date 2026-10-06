-- Meu Mural na nuvem: o esquema inicial.
-- SQL comum do SQLite (roda igual no D1 e no node:sqlite). Datas em texto ISO 8601 (UTC).
-- Sem ON DELETE CASCADE: apagar uma conta é um lote explícito de DELETEs, igual em qualquer banco.

-- A conta. Sem e-mail: só o id do Google (`sub`), o código público e o nome escolhido.
CREATE TABLE usuarios (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  notificacoes_vistas_em TEXT,
  ultima_gravacao_em TEXT
);

-- Um login por aparelho. Guarda só o hash SHA-256 do token.
CREATE TABLE sessoes (
  hash TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  criada_em TEXT NOT NULL,
  usada_em TEXT NOT NULL,
  expira_em TEXT NOT NULL,
  aparelho TEXT
);
CREATE INDEX sessoes_por_usuario ON sessoes (usuario_id);
CREATE INDEX sessoes_por_validade ON sessoes (expira_em);

-- O mural completo e privado (o backup v2 compactado em gzip). O servidor não abre.
CREATE TABLE murais (
  usuario_id TEXT PRIMARY KEY,
  rev INTEGER NOT NULL,
  dados BLOB NOT NULL,
  bytes INTEGER NOT NULL,
  atualizado_em TEXT NOT NULL
);

-- O que os outros veem: só as resenhas e o nome (também um backup v2 em gzip).
-- Tabela separada porque o limite de 2 MB do D1 vale para a linha inteira.
CREATE TABLE murais_publicos (
  usuario_id TEXT PRIMARY KEY,
  rev INTEGER NOT NULL,
  dados BLOB NOT NULL,
  bytes INTEGER NOT NULL,
  atualizado_em TEXT NOT NULL
);

-- Quem segue quem. De mão única, sem aprovação.
CREATE TABLE seguindo (
  seguidor_id TEXT NOT NULL,
  seguido_id TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  PRIMARY KEY (seguidor_id, seguido_id)
);
CREATE INDEX seguindo_por_seguido ON seguindo (seguido_id);

-- A fonte das notificações: uma linha por acontecimento, não uma por seguidor.
-- tipo 'seguiu': autor passou a seguir alvo. tipo 'resenha': autor publicou a resenha `ref`.
CREATE TABLE atividades (
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL,
  autor_id TEXT NOT NULL,
  alvo_id TEXT,
  ref TEXT,
  resumo TEXT,
  criado_em TEXT NOT NULL
);
CREATE INDEX atividades_por_alvo ON atividades (alvo_id, criado_em);
CREATE INDEX atividades_por_autor ON atividades (autor_id, criado_em);
CREATE INDEX atividades_por_data ON atividades (criado_em);
-- Seguir de novo não notifica de novo; a mesma resenha não notifica duas vezes.
CREATE UNIQUE INDEX atividades_seguiu_unica ON atividades (tipo, autor_id, alvo_id) WHERE tipo = 'seguiu';
CREATE UNIQUE INDEX atividades_resenha_unica ON atividades (autor_id, ref) WHERE tipo = 'resenha';

-- A cota própria de gravações (ver src/domain/quota.ts). Um registro por dia UTC.
CREATE TABLE uso_diario (
  dia TEXT PRIMARY KEY,
  linhas_gravadas INTEGER NOT NULL DEFAULT 0,
  gravacoes INTEGER NOT NULL DEFAULT 0
);
