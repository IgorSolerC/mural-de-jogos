-- A carência do aparelho e o PIN (PLANO-COFRE.md, 17.23).
--
-- Carência: o aparelho que abriu o cofre com o Google e a passkey nas últimas 24 horas abre de novo só
-- com a senha mestra. Ele guarda (no localStorage da origem do cofre) um token e uma chave G; aqui fica
-- só o hash do token e a chave do meio M selada com G. Sem o aparelho, este envelope não abre nada; sem
-- o servidor, o aparelho não tem o envelope. O prazo, os erros e o desligar são conferidos aqui.

-- Ligada por padrão; desligar (nos Ajustes do cofre) apaga todas as carências da conta.
ALTER TABLE cofre_contas ADD COLUMN carencia INTEGER NOT NULL DEFAULT 1;
-- A senha mestra é um PIN (só algarismos): só para a página mostrar o teclado de números.
ALTER TABLE cofre_contas ADD COLUMN pin INTEGER NOT NULL DEFAULT 0;

CREATE TABLE cofre_carencias (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES cofre_contas (usuario_id) ON DELETE CASCADE,
  -- SHA-256 do token que só o aparelho tem (como o das sessões)
  hash TEXT NOT NULL UNIQUE,
  -- o código da conta do Murall, para a sessão de entrada que a carência abre
  codigo TEXT NOT NULL,
  -- M selada com a chave G do aparelho (AES-256-GCM)
  envelope BLOB NOT NULL,
  aparelho TEXT,
  criada_em TEXT NOT NULL,
  -- 24 horas depois do Google e da passkey; abrir pela carência não estende
  expira_em TEXT NOT NULL,
  usada_em TEXT,
  -- tentativas de senha pela carência desde o último acerto; na 3ª, ela para de valer
  erros INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX cofre_carencias_usuario ON cofre_carencias (usuario_id);

-- A sessão de entrada aberta pela carência: o id dela (a marca do segundo fator fica como a da passkey).
ALTER TABLE cofre_sessoes ADD COLUMN carencia TEXT;
