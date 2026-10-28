-- O mural público sem as anotações compartilhadas que a pessoa não pode mais mostrar. A cópia de uma
-- compartilhada pública vai no mural público de cada pessoa que está nela, e só o site dela a atualiza;
-- quem foi tirado (ou saiu), a anotação que virou privada e a apagada continuavam à vista de quem
-- visita até a pessoa abrir o Murall de novo. Agora a nuvem confere o mural ao entregá-lo, mas só
-- quando algo assim aconteceu (ver domain/shared-public.ts): a visita comum não abre nada.
--
-- `versao`: o que quem visita guarda para perguntar "mudou?" (`?rev=`). Sobe a cada envio e a cada
-- vez que a conferência tira alguma anotação. Começa na `rev` de hoje, que é o que os sites guardaram.
ALTER TABLE murais_publicos ADD COLUMN versao INTEGER NOT NULL DEFAULT 0;
UPDATE murais_publicos SET versao = rev;

-- `publico_conferir`: 1 = a próxima entrega do mural público confere as compartilhadas.
-- `publico_conferir_ate`: até quando um envio novo volta a pedir a conferência (o site que ainda não
-- soube da mudança pode mandar a cópia velha de novo). Ficam em `usuarios`, que é pequena: marcar não
-- regrava a linha do mural (até 1,9 MB).
ALTER TABLE usuarios ADD COLUMN publico_conferir INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN publico_conferir_ate TEXT;

-- O que já ficou para trás antes desta migração: todo mural público é conferido uma vez.
UPDATE usuarios SET publico_conferir = 1 WHERE id IN (SELECT usuario_id FROM murais_publicos);
