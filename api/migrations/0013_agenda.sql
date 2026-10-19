-- O Google Agenda ligado ao Calendário do Murall (ver src/routes/agenda.ts).
--
-- A permissão do Google de cada conta: o refresh token, cifrado com a chave do Worker (AES-GCM, o
-- secret AGENDA_CHAVE), nunca vai para o navegador. Uma linha por conta; desligar apaga.
CREATE TABLE agenda_google (
  usuario_id TEXT PRIMARY KEY,
  refresh TEXT NOT NULL,
  conectada_em TEXT NOT NULL
);

-- Os pedidos de ligar em andamento: o `state` do OAuth (o hash dele), de quem é e quando foi pedido.
-- Vale por 15 minutos e é usado uma vez só.
CREATE TABLE agenda_pedidos (
  estado TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  retorno TEXT NOT NULL,
  criado_em TEXT NOT NULL
);
CREATE INDEX agenda_pedidos_usuario ON agenda_pedidos (usuario_id);
