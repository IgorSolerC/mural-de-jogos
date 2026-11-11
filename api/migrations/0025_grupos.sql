-- Os grupos compartilhados (PLANO-COMPARTILHAR.md): um grupo das anotações (o mural do grupo, o Kanban
-- dele e as pastas e as tags) dividido com outras pessoas, cada uma com um papel ('gestor', 'editor',
-- 'leitor'), e que pode ser público (qualquer pessoa lê, pelo mural do dono e pelo link).
--
-- `dados`: o documento do grupo, aberto (JSON), como o site grava: o nome, o desenho e a cor, as pastas,
-- as cores das tags e o quadro do Kanban. Juntar duas edições é com o site; o servidor só confere a vez
-- (`rev`, como a anotação compartilhada) e o papel de quem grava.
-- `rev`: sobe a cada gravação de `dados`. `versao`: sobe a cada mudança qualquer (os dados, as pessoas,
-- o público), para o site saber o que baixar de novo.
CREATE TABLE grupos (
  id TEXT PRIMARY KEY,
  dono_id TEXT NOT NULL,
  rev INTEGER NOT NULL,
  versao INTEGER NOT NULL,
  dados TEXT NOT NULL,
  publico INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  atualizado_por TEXT NOT NULL
);
CREATE INDEX grupos_por_dono ON grupos (dono_id);

-- Quem mais está no grupo, e com qual papel. O dono não entra aqui: é o `dono_id` do grupo.
CREATE TABLE grupo_membros (
  grupo_id TEXT NOT NULL,
  usuario_id TEXT NOT NULL,
  papel TEXT NOT NULL,
  convidado_por TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  PRIMARY KEY (grupo_id, usuario_id)
);
CREATE INDEX grupo_membros_por_usuario ON grupo_membros (usuario_id);

-- As anotações de um grupo compartilhado moram em `notas`, como as compartilhadas soltas, com o grupo
-- (`grupo_id`). O que se escreve num grupo é do grupo (resposta P4 do dono): o `dono_id` dela é o dono do
-- grupo, e `criado_por` guarda quem a escreveu (o Editor apaga só as que criou, resposta P3).
ALTER TABLE notas ADD COLUMN grupo_id TEXT;
ALTER TABLE notas ADD COLUMN criado_por TEXT;
CREATE INDEX notas_por_grupo ON notas (grupo_id);

-- O aviso "Fulano compartilhou o grupo Trabalho com você" (tipo 'compartilhou-grupo'): um por pessoa e grupo.
CREATE UNIQUE INDEX atividades_compartilhou_grupo_unica ON atividades (alvo_id, ref) WHERE tipo = 'compartilhou-grupo';
