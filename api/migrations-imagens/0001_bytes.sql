-- O banco mural-imagens (binding IMAGENS): só os bytes de cada imagem, já encolhida pelo site (lado
-- maior até 900 px, até 200 KB). Os dados dela (dono, tamanho, quem vê) ficam em `imagens`, no banco de
-- sempre (migrations/0020_imagens.sql). Um id só existe aqui depois de existir lá, e sai daqui antes de
-- sair de lá: nunca sobram bytes sem dono.
CREATE TABLE bytes (
  id TEXT PRIMARY KEY,
  dados BLOB NOT NULL
);
