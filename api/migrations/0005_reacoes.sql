-- Reações às resenhas dos outros (amei, fogo, rindo…), como as do WhatsApp: uma por pessoa por
-- resenha, que dá para trocar ou tirar. Quem vê o mural da pessoa vê as reações de cada ficha.
-- Só reage quem segue o dono da resenha. A resenha é o `ref` (o id dela no mural do dono): o
-- servidor não abre o mural, então uma reação a uma resenha que saiu do mural fica, sem aparecer.
CREATE TABLE reacoes (
  dono_id TEXT NOT NULL,
  ref TEXT NOT NULL,
  autor_id TEXT NOT NULL,
  reacao TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  PRIMARY KEY (dono_id, ref, autor_id)
);
CREATE INDEX reacoes_por_autor ON reacoes (autor_id, criado_em);
-- O aviso para o dono (tipo 'reagiu'), uma linha por pessoa e resenha: trocar de reação avisa de novo.
CREATE UNIQUE INDEX atividades_reagiu_unica ON atividades (autor_id, alvo_id, ref) WHERE tipo = 'reagiu';
