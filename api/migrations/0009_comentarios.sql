-- Comentários nas fichas publicadas (resenhas e anotações). Como nas reações, a ficha é o `ref` (o id
-- dela no mural do dono) e o servidor não abre o mural: um comentário numa ficha que saiu do mural
-- fica, sem aparecer. O texto leva as marcas de formatação do site (negrito, lista, citação…), até
-- 500 caracteres; quem desenha é o site, o servidor só guarda.
CREATE TABLE comentarios (
  id TEXT PRIMARY KEY,
  dono_id TEXT NOT NULL,
  ref TEXT NOT NULL,
  autor_id TEXT NOT NULL,
  texto TEXT NOT NULL,
  criado_em TEXT NOT NULL
);
CREATE INDEX comentarios_por_ficha ON comentarios (dono_id, ref, criado_em);
CREATE INDEX comentarios_por_autor ON comentarios (autor_id, criado_em);

-- Reações a um comentário, como as das fichas: uma por pessoa por comentário, que dá para trocar ou tirar.
CREATE TABLE comentario_reacoes (
  comentario_id TEXT NOT NULL,
  autor_id TEXT NOT NULL,
  reacao TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  PRIMARY KEY (comentario_id, autor_id)
);
CREATE INDEX comentario_reacoes_por_autor ON comentario_reacoes (autor_id);

-- Quem pode comentar nas publicações da pessoa: 'todos' (qualquer conta) ou 'seguidos' (só quem ela segue).
ALTER TABLE usuarios ADD COLUMN comentarios_de TEXT NOT NULL DEFAULT 'todos';

-- O aviso para o dono (tipo 'comentou'), uma linha por pessoa e ficha: comentar de novo avisa de novo.
CREATE UNIQUE INDEX atividades_comentou_unica ON atividades (autor_id, alvo_id, ref) WHERE tipo = 'comentou';
