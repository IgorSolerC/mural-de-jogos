-- Quem vê as imagens coladas (PLANO-IMAGENS.md, rodada 4). A conferência é feita na hora de entregar a
-- imagem (routes/images.ts), a partir destas duas listas; sair de uma anotação ou apagá-la já tira o
-- acesso, sem limpeza nenhuma.
--
-- `imagem_publica`: as imagens que cada pessoa mostra no mural público dela (a parte `imagens` do envio
-- do mural; o site lê do próprio mural público). Vale quando quem mostra é o dono da imagem, ou está numa
-- anotação compartilhada que a usa. Uma linha de um id que ainda não subiu espera por ele.
CREATE TABLE imagem_publica (
  imagem_id TEXT NOT NULL,
  usuario_id TEXT NOT NULL,
  PRIMARY KEY (imagem_id, usuario_id)
);
CREATE INDEX imagem_publica_por_usuario ON imagem_publica (usuario_id);

-- `nota_imagens`: as imagens que cada anotação compartilhada usa (o servidor acha no texto dela ao
-- gravar). Quem está na anotação vê as imagens dela, mesmo as privadas de outra pessoa.
CREATE TABLE nota_imagens (
  nota_id TEXT NOT NULL,
  imagem_id TEXT NOT NULL,
  PRIMARY KEY (nota_id, imagem_id)
);
CREATE INDEX nota_imagens_por_imagem ON nota_imagens (imagem_id);

-- `imagens.publica` (0020) fica sem uso: quem decide é `imagem_publica`, conferida na entrega.
