-- Deixar de seguir guarda o seguir de antes por uns minutos: seguir de volta logo depois (o "Desfazer"
-- do site) devolve o silenciado e a data de antes, e as resenhas que já tinham chegado continuam no
-- correio. A limpeza diária apaga o que passou do prazo (ver src/domain/cleanup.ts).
CREATE TABLE seguindo_desfeito (
  seguidor_id TEXT NOT NULL,
  seguido_id TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  silenciado INTEGER NOT NULL DEFAULT 0,
  desfeito_em TEXT NOT NULL,
  PRIMARY KEY (seguidor_id, seguido_id)
);
