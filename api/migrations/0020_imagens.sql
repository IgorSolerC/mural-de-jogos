-- As imagens coladas nas anotações (PLANO-IMAGENS.md). Os bytes ficam num banco à parte, o
-- `mural-imagens` (binding IMAGENS, migrations-imagens/): se ele encher, só as imagens param, e o mural
-- continua gravando. Aqui ficam os dados de cada uma, junto das contas, para a conferência de quem vê e a
-- limpeza andarem num banco só.
--
-- `id`: as 22 letras que o site sorteou (128 bits); nunca muda de conteúdo.
-- `banco`: em qual banco de bytes ela está (1 = mural-imagens), para somar bancos quando um encher.
-- `pronta`: 0 até os bytes chegarem ao outro banco (a limpeza confere as que ficaram no meio).
-- `publica`: 1 quando aparece num mural público (rodada 4); 0, só o dono vê.
-- `solta_desde`: desde quando nenhuma anotação a usa (rodada 5).
-- `gravacao`: a marca do envio que a criou, para os contadores subirem só com ela (como em `murais`).
CREATE TABLE imagens (
  id TEXT PRIMARY KEY,
  dono_id TEXT NOT NULL,
  banco INTEGER NOT NULL DEFAULT 1,
  tipo TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  largura INTEGER NOT NULL,
  altura INTEGER NOT NULL,
  publica INTEGER NOT NULL DEFAULT 0,
  pronta INTEGER NOT NULL DEFAULT 0,
  solta_desde TEXT,
  criada_em TEXT NOT NULL,
  gravacao TEXT NOT NULL
);
CREATE INDEX imagens_por_dono ON imagens (dono_id);
CREATE INDEX imagens_no_meio ON imagens (criada_em) WHERE pronta = 0;

-- Quanto cada conta guarda, e a nuvem inteira (`usuario_id` = '*'): a cota é conferida sem somar a
-- tabela toda a cada envio. Sobe e desce no mesmo lote do envio e do apagar; a limpeza diária reconta
-- tudo a partir de `imagens`, para um erro nunca ficar.
CREATE TABLE imagens_uso (
  usuario_id TEXT PRIMARY KEY,
  imagens INTEGER NOT NULL,
  bytes INTEGER NOT NULL
);
