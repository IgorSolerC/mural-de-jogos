-- Comentários editados: quem escreveu troca o texto do próprio comentário (`PATCH /v1/comentarios/:id`),
-- e a conversa diz que ele foi editado. `editado_em`: quando foi a última troca (null: nunca editado).
ALTER TABLE comentarios ADD COLUMN editado_em TEXT;
