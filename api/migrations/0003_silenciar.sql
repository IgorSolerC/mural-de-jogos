-- Silenciar alguém: continua seguindo e vendo as resenhas no correio, mas elas não contam no número
-- do envelope. Fica na nuvem para valer em todos os aparelhos.
ALTER TABLE seguindo ADD COLUMN silenciado INTEGER NOT NULL DEFAULT 0;
