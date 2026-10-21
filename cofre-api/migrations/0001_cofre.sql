-- O banco do cofre de senhas (seção 9.1 do PLANO-COFRE.md). Só guarda o que já chega cifrado do
-- navegador, mais o que o servidor precisa para conferir: as provas (como HMAC com a pimenta), as
-- chaves públicas das passkeys e os freios. Nenhuma coluna tem dado que abra o cofre sozinho.
--
-- Até o primeiro deploy (Fase 3), este arquivo ainda pode mudar; depois, só migrações novas.
-- Datas em ISO 8601 UTC (texto), como no banco do Murall.

-- Uma linha por conta do Murall que tem cofre (o id é o mesmo `usuarios.id` do Murall).
CREATE TABLE cofre_contas (
  usuario_id TEXT PRIMARY KEY,
  -- a versão do formato da cripto (ver projects/cofre/src/core/crypto.ts)
  versao_cripto INTEGER NOT NULL,
  -- os parâmetros do Argon2id e o sal da senha mestra
  kdf_m INTEGER NOT NULL,
  kdf_t INTEGER NOT NULL,
  kdf_p INTEGER NOT NULL,
  sal BLOB NOT NULL,
  -- V: a chave do cofre, selada com a senha e a chave do meio
  v BLOB NOT NULL,
  -- HMAC-SHA256(pimenta, kAuth) e a versão da pimenta com que foi feito (16.2)
  auth_hash BLOB NOT NULL,
  auth_pimenta INTEGER NOT NULL,
  -- o manifesto cifrado e o contador dele (o 409 compara este número)
  manifesto BLOB NOT NULL,
  contador INTEGER NOT NULL,
  -- o user.id das passkeys desta conta: 16 bytes sorteados, nunca o e-mail nem o código (16.8)
  usuario_passkey BLOB NOT NULL,
  -- "Congelar o cofre": ninguém abre antes disto (8.6)
  congelado_ate TEXT,
  criado_em TEXT NOT NULL,
  mudado_em TEXT NOT NULL
);

-- As passkeys registradas (só a parte pública).
CREATE TABLE cofre_credenciais (
  -- o id da credencial, em base64url
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES cofre_contas (usuario_id) ON DELETE CASCADE,
  -- a chave pública em COSE, como veio no registro, e o algoritmo (-7 ES256, -257 RS256)
  chave_publica BLOB NOT NULL,
  algoritmo INTEGER NOT NULL,
  -- o contador de assinaturas (as passkeys sincronizadas mandam sempre 0)
  contador_assinatura INTEGER NOT NULL DEFAULT 0,
  -- 1: o aparelho respondeu o PRF no registro; 0: modo servidor
  prf INTEGER NOT NULL,
  -- como a pessoa chamou o aparelho ("Celular", "PC") e os transportes que ele disse ter
  apelido TEXT NOT NULL,
  transportes TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL,
  usado_em TEXT
);
CREATE INDEX cofre_credenciais_usuario ON cofre_credenciais (usuario_id);

-- Os envelopes: a chave do meio (M) guardada para cada aparelho e para o código de recuperação.
CREATE TABLE cofre_envelopes (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES cofre_contas (usuario_id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('prf', 'servidor', 'recuperacao')),
  -- o aparelho do envelope; nulo só no do código
  credencial_id TEXT REFERENCES cofre_credenciais (id) ON DELETE CASCADE,
  envelope BLOB NOT NULL,
  -- modo servidor: o S_i do aparelho, cifrado com o secret COFRE_ENVELOPES, e a versão do secret
  s_cifrado BLOB,
  s_versao INTEGER,
  -- código de recuperação: HMAC-SHA256(pimenta, kRec) e a versão da pimenta
  rec_hash BLOB,
  rec_pimenta INTEGER,
  criado_em TEXT NOT NULL,
  usado_em TEXT,
  CHECK ((tipo = 'recuperacao') = (credencial_id IS NULL)),
  CHECK ((tipo = 'servidor') = (s_cifrado IS NOT NULL)),
  CHECK ((tipo = 'recuperacao') = (rec_hash IS NOT NULL))
);
CREATE INDEX cofre_envelopes_usuario ON cofre_envelopes (usuario_id);
CREATE UNIQUE INDEX cofre_envelopes_credencial ON cofre_envelopes (credencial_id) WHERE credencial_id IS NOT NULL;
CREATE UNIQUE INDEX cofre_envelopes_recuperacao ON cofre_envelopes (usuario_id) WHERE tipo = 'recuperacao';

-- Os itens, cifrados. O servidor vê só o id, a versão, o tamanho e as datas.
CREATE TABLE cofre_itens (
  usuario_id TEXT NOT NULL REFERENCES cofre_contas (usuario_id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  versao INTEGER NOT NULL,
  dados BLOB NOT NULL,
  mudado_em TEXT NOT NULL,
  -- na lixeira desde (16.5); a limpeza diária apaga depois de 30 dias
  na_lixeira_desde TEXT,
  PRIMARY KEY (usuario_id, id)
);
CREATE INDEX cofre_itens_lixeira ON cofre_itens (na_lixeira_desde) WHERE na_lixeira_desde IS NOT NULL;

-- As sessões: a de entrada (5 min, depois do Google) e a do cofre aberto (10 min parada, 8 h no
-- máximo). Só o hash do token fica aqui; o token vive na memória da página.
CREATE TABLE cofre_sessoes (
  hash TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'cofre')),
  -- o código da conta do Murall (K7QFM2XA), para o nome das passkeys ("Cofre do Murall (K7QF-M2XA)")
  codigo TEXT NOT NULL,
  criada_em TEXT NOT NULL,
  usada_em TEXT NOT NULL,
  expira_em TEXT NOT NULL,
  aparelho TEXT
);
CREATE INDEX cofre_sessoes_usuario ON cofre_sessoes (usuario_id);
CREATE INDEX cofre_sessoes_expira ON cofre_sessoes (expira_em);

-- Os desafios do WebAuthn: uso único, valem 2 minutos.
CREATE TABLE cofre_desafios (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  -- registrar uma passkey ou assinar com uma
  tipo TEXT NOT NULL CHECK (tipo IN ('registro', 'assinatura')),
  desafio BLOB NOT NULL,
  expira_em TEXT NOT NULL
);
CREATE INDEX cofre_desafios_usuario ON cofre_desafios (usuario_id);

-- O histórico de 90 dias (8.5): aberturas, erros de senha, passkeys usadas, trocas.
CREATE TABLE cofre_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  em TEXT NOT NULL,
  aparelho TEXT,
  pais TEXT
);
CREATE INDEX cofre_eventos_usuario ON cofre_eventos (usuario_id, em);

-- O freio da senha (9.3): erros seguidos, quantas sequências já houve e até quando esperar.
CREATE TABLE cofre_freio_senha (
  usuario_id TEXT PRIMARY KEY,
  erros_seguidos INTEGER NOT NULL DEFAULT 0,
  sequencias INTEGER NOT NULL DEFAULT 0,
  espera_ate TEXT
);

-- Os freios por conta e por IP (o IP só como HMAC com um sal do dia, 16.6): cada vez fica anotada.
CREATE TABLE freios (
  chave TEXT NOT NULL,
  acao TEXT NOT NULL,
  criado_em TEXT NOT NULL
);
CREATE INDEX freios_chave ON freios (chave, acao, criado_em);

-- A cota própria de gravações por dia UTC, como a do Murall.
CREATE TABLE uso_diario (
  dia TEXT PRIMARY KEY,
  linhas_gravadas INTEGER NOT NULL DEFAULT 0,
  gravacoes INTEGER NOT NULL DEFAULT 0
);
