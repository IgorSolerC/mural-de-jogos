-- Os pedidos (PLANO-API.md, seções 7.3 e 9): toda escrita da API das AIs vira um pedido, que o Murall
-- aberto em algum aparelho aplica pelas mesmas funções da tela. A nuvem nunca abre o mural.
CREATE TABLE api_pedidos (
  -- pd_ + 16 letras
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  chave_id TEXT NOT NULL,
  -- o histórico continua legível depois de apagar a chave
  chave_nome TEXT NOT NULL,
  -- nota.criar, nota.editar, ... (contrato/api-v1/operacoes.ts)
  op TEXT NOT NULL,
  -- o id da nota
  alvo TEXT NOT NULL,
  -- JSON, já conferido
  dados TEXT NOT NULL,
  -- aguardando-aprovacao | pendente | aplicado | conflito | recusado | falhou | expirado | desfeito
  estado TEXT NOT NULL,
  -- o Idempotency-Key de quem pediu: repetir devolve o mesmo pedido
  chave_idem TEXT,
  -- o aparelho que pegou o pedido para aplicar, e até quando (2 minutos)
  pego_por TEXT,
  pego_ate TEXT,
  -- JSON: o que aconteceu (a nota como ficou, ou o porquê); e a nota de antes (para o Desfazer)
  resultado TEXT,
  antes TEXT,
  criado_em TEXT NOT NULL,
  expira_em TEXT NOT NULL,
  resolvido_em TEXT
);
CREATE INDEX api_pedidos_por_conta ON api_pedidos (usuario_id, estado, criado_em);
CREATE UNIQUE INDEX api_pedidos_idem ON api_pedidos (chave_id, chave_idem) WHERE chave_idem IS NOT NULL;
