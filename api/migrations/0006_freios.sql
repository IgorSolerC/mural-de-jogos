-- O freio de cada conta: uma linha por ação com limite por dia (reagir, entrar), que fica mesmo quando
-- o que ela criou some (tirar a reação, sair da sessão). Contar só o que existe agora deixava trocar ou
-- tirar e fazer de novo sem fim, e cada reação nova avisava o dono outra vez. A limpeza diária tira as
-- linhas de mais de um dia; apagar a conta tira as dela.
CREATE TABLE freios (
  usuario_id TEXT NOT NULL,
  acao TEXT NOT NULL,
  criado_em TEXT NOT NULL
);
CREATE INDEX freios_por_usuario ON freios (usuario_id, acao, criado_em);
