-- As fichas à mostra no mural público de cada um (JSON com a lista dos ids), que o site manda a cada
-- envio do mural (a parte `fichas`). O servidor não abre o mural: é por ela que as reações, os
-- comentários e os avisos de uma ficha que virou privada (ou foi apagada) param de aparecer para os
-- outros. Vazia (NULL): o site da pessoa ainda não mandou a lista, e vale tudo, como antes.
-- Fica em `usuarios`, e não em `murais_publicos`, porque o limite de 2 MB do D1 vale para a linha inteira.
ALTER TABLE usuarios ADD COLUMN fichas_publicas TEXT;
