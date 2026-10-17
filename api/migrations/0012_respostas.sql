-- Respostas aos comentários: um comentário pode responder a outro da mesma ficha (`resposta_a`, o id
-- dele), e a resposta pode ser respondida também, sem limite de fundura. Quem desenha a árvore é o site.
--
-- Apagar um comentário que tem respostas não leva as respostas: ele fica no lugar, sem texto e sem
-- autor à mostra (`apagado` = 1), como no Reddit, e sai de vez quando a última resposta dele sai.
ALTER TABLE comentarios ADD COLUMN resposta_a TEXT;
ALTER TABLE comentarios ADD COLUMN apagado INTEGER NOT NULL DEFAULT 0;
CREATE INDEX comentarios_respostas ON comentarios (resposta_a);

-- O aviso para quem foi respondido (tipo 'respondeu'), uma linha por pessoa, respondido e ficha: responder
-- de novo avisa de novo. O resumo leva o código do dono da ficha (ela pode ser de outra pessoa) e o id da
-- resposta, para o site abrir a conversa nela.
CREATE UNIQUE INDEX atividades_respondeu_unica ON atividades (autor_id, alvo_id, ref) WHERE tipo = 'respondeu';
