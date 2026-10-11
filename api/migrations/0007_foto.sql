-- A "foto" do perfil (o emoji e a cartolina da polaroid), para a lista de amigos no perfil de alguém
-- mostrar a carinha de cada um sem abrir o mural de cada um. JSON {"emoji","cor"}; vem com o envio do
-- mural (a parte `foto`). Vazia: quem ainda não enviou depois disto aparece com a inicial.
ALTER TABLE usuarios ADD COLUMN foto TEXT;
