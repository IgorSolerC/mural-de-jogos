-- Seguindo e Seguidores no perfil de cada um.
-- `cartao`: o que a lista mostra de cada pessoa sem abrir o mural dela (a foto, o fundo do perfil, a
-- linha curta e os números das fichas), em JSON; vem com o envio do mural (a parte `cartao`).
-- `pessoas_visiveis`: 1, qualquer um vê as listas de quem a pessoa segue e de quem a segue; 0, só os
-- números (a própria pessoa sempre vê as dela).
ALTER TABLE usuarios ADD COLUMN cartao TEXT;
ALTER TABLE usuarios ADD COLUMN pessoas_visiveis INTEGER NOT NULL DEFAULT 1;
