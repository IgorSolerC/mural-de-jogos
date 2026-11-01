-- Conferir os vazamentos ao abrir o cofre (PLANO-COFRE.md, 17.24).
--
-- Ligado, a página confere todas as senhas na base pública de vazamentos (só o começo do resumo de cada
-- uma sai, para api.pwnedpasswords.com) uma vez a cada abertura. O cofre não guarda nada no aparelho, e
-- este ajuste não é segredo: fica aqui, ao lado da carência. O que a conferência acha fica dentro de cada
-- item, cifrado; o servidor não sabe que senha vazou.

-- Desligado por padrão (decisão 8 da seção 15).
ALTER TABLE cofre_contas ADD COLUMN vazamentos INTEGER NOT NULL DEFAULT 0;
