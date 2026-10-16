-- Anotações compartilhadas: uma anotação que o dono divide com outras pessoas, cada uma com um papel
-- (gestor, editor ou leitor). Ao contrário do mural, o servidor guarda a anotação aberta (JSON), porque
-- várias contas mexem nela: é a cópia que junta todo mundo. Quem junta as edições é o site (como o git:
-- o que só um mexeu entra, o que os dois mexeram diferente vira conflito); o servidor só confere a vez
-- (`rev`) e o papel de quem grava.
--
-- `rev`: a versão do conteúdo (sobe a cada gravação de `dados`). `versao`: sobe a cada mudança qualquer
-- (o conteúdo, as pessoas, o conflito), para o site saber o que baixar de novo.
-- `conflito`: JSON com as duas versões que brigaram ({a, b, autorA, autorB, em}) até alguém escolher.
-- O id é o da anotação no mural do dono (único entre todas as contas).
CREATE TABLE notas (
  id TEXT PRIMARY KEY,
  dono_id TEXT NOT NULL,
  rev INTEGER NOT NULL,
  versao INTEGER NOT NULL,
  dados TEXT NOT NULL,
  conflito TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  atualizado_por TEXT NOT NULL
);
CREATE INDEX notas_por_dono ON notas (dono_id);

-- Quem mais está na anotação, e com qual papel ('gestor', 'editor', 'leitor'). O dono não entra aqui:
-- ele é o `dono_id` da anotação, e ninguém tira isso dele.
CREATE TABLE nota_membros (
  nota_id TEXT NOT NULL,
  usuario_id TEXT NOT NULL,
  papel TEXT NOT NULL,
  convidado_por TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  PRIMARY KEY (nota_id, usuario_id)
);
CREATE INDEX nota_membros_por_usuario ON nota_membros (usuario_id);

-- O aviso "Fulano compartilhou uma nota com você" (tipo 'compartilhou'): um por pessoa e anotação.
-- Sai junto quando a pessoa deixa a anotação (ou é tirada dela).
CREATE UNIQUE INDEX atividades_compartilhou_unica ON atividades (alvo_id, ref) WHERE tipo = 'compartilhou';
