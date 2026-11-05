-- As fichas com os comentários fechados pelo dono (o "Aceitar comentários" desligado nas Configurações
-- da ficha). Fechada, ninguém comenta, responde nem reage aos comentários dela, nem o dono; os que já
-- estavam ficam guardados, só o dono os vê (e apaga), e voltam a aparecer quando ele abre de novo.
-- Como nos comentários, a ficha é o `ref` no mural do dono; uma linha por ficha fechada.
CREATE TABLE comentarios_fechados (
  dono_id TEXT NOT NULL,
  ref TEXT NOT NULL,
  fechado_em TEXT NOT NULL,
  PRIMARY KEY (dono_id, ref)
) WITHOUT ROWID;
