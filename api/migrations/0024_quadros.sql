-- O Quadro livre (PLANO-QUADRO-LIVRE.md, seção 7): um quadro por linha, compactado em gzip, que o servidor não
-- abre. Fica fora do mural privado para que mexer num quadro envie só ele.
--
-- `rev`: sobe a cada gravação (o site manda a de onde partiu; outra no meio é um 409 e o site junta).
-- `dados` null: apagado (a lápide, para os outros aparelhos saberem; sai na limpeza depois de 30 dias).
-- `gravacao`: a marca do envio que valeu, para as linhas que vão junto no mesmo lote só entrarem com ele.
-- `publico`: 1 quando o dono o mostra na visita (rodada 6).
CREATE TABLE quadros (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  rev INTEGER NOT NULL,
  dados BLOB,
  bytes INTEGER NOT NULL,
  atualizado_em TEXT NOT NULL,
  apagado_em TEXT,
  gravacao TEXT NOT NULL,
  publico INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX quadros_por_usuario ON quadros (usuario_id);

-- As imagens que cada quadro usa (o site manda a lista no envio): a limpeza das soltas não as apaga.
CREATE TABLE quadro_imagens (
  quadro_id TEXT NOT NULL,
  imagem_id TEXT NOT NULL,
  PRIMARY KEY (quadro_id, imagem_id)
);
CREATE INDEX quadro_imagens_por_imagem ON quadro_imagens (imagem_id);

-- O contador que diz ao site, de graça, se algum quadro mudou: vai no cabeçalho `Quadros-Versao` do GET do
-- mural, que o site já faz; só quando ele muda o site pede a lista dos quadros.
ALTER TABLE usuarios ADD COLUMN quadros_versao INTEGER NOT NULL DEFAULT 0;
