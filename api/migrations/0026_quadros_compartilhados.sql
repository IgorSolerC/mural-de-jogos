-- Os quadros livres compartilhados (PLANO-COMPARTILHAR.md, rodada 6).
--
-- `quadros.grupo_id`: o grupo compartilhado do quadro (o site do dono diz, no envio, pelo cabeçalho
-- `Quadro-Grupo`; o servidor não abre o quadro). Quem está no grupo lê o quadro e, sendo editor ou gestor,
-- grava nele; o grupo público o mostra a quem visita (resposta P2 do dono: os quadros vão junto com o grupo).
ALTER TABLE quadros ADD COLUMN grupo_id TEXT;
CREATE INDEX quadros_por_grupo ON quadros (grupo_id);

-- As pessoas de um quadro solto (de um grupo só do dono), cada uma com um papel, como as da anotação.
CREATE TABLE quadro_membros (
  quadro_id TEXT NOT NULL,
  usuario_id TEXT NOT NULL,
  papel TEXT NOT NULL,
  convidado_por TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  PRIMARY KEY (quadro_id, usuario_id)
);
CREATE INDEX quadro_membros_por_usuario ON quadro_membros (usuario_id);
