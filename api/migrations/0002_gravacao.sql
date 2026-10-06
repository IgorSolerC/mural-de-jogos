-- Cada gravação do mural leva uma marca única. O mural público e as resenhas novas só entram no
-- mesmo lote se a gravação do privado foi a que valeu (ver src/routes/mural.ts).
ALTER TABLE murais ADD COLUMN gravacao TEXT;
