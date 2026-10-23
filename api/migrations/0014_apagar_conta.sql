-- Apagar a conta com cofre de senhas (ver src/routes/account.ts e PLANO-COFRE.md, ameaça 23).
--
-- Quando a conta sai de vez: com cofre, 7 dias depois do pedido (até lá, Cancelar desfaz). Vazio: nada
-- marcado. A limpeza diária apaga as contas cuja hora passou, com o cofre junto.
ALTER TABLE usuarios ADD COLUMN apagar_em TEXT;
CREATE INDEX usuarios_apagar_em ON usuarios (apagar_em) WHERE apagar_em IS NOT NULL;
