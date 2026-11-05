-- O uso das APIs externas (PLANO-ADMIN-APIS.md, seção 6). Sem conta, sem IP, sem endereço e sem o que foi
-- buscado: serviço, operação e desfecho são listas fechadas (contrato/uso-apis/contagem.ts).

-- Um contador por dia UTC e combinação. WITHOUT ROWID e sem índice extra: um upsert grava 1 linha.
CREATE TABLE uso_apis (
  dia       TEXT NOT NULL,
  servico   TEXT NOT NULL,
  operacao  TEXT NOT NULL,
  medido_em TEXT NOT NULL,            -- 'worker' | 'navegador': as duas contas nunca se somam
  desfecho  TEXT NOT NULL,
  pedidos   INTEGER NOT NULL DEFAULT 0,
  ms_total  INTEGER NOT NULL DEFAULT 0,
  ms_max    INTEGER NOT NULL DEFAULT 0,
  ultimo_em TEXT NOT NULL,            -- ISO do último deste desfecho
  PRIMARY KEY (dia, servico, operacao, medido_em, desfecho)
) WITHOUT ROWID;

-- As últimas falhas, para ver quando uma queda começou e parou (a limpeza diária deixa 30 dias e até 500).
CREATE TABLE uso_apis_falhas (
  id         INTEGER PRIMARY KEY,
  em         TEXT NOT NULL,
  servico    TEXT NOT NULL,
  operacao   TEXT NOT NULL,
  medido_em  TEXT NOT NULL,
  desfecho   TEXT NOT NULL,
  status     INTEGER,                 -- o HTTP de lá; null = rede ou prazo
  repeticoes INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX uso_apis_falhas_em ON uso_apis_falhas (em);
