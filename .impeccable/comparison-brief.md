# Comparar backups de colegas

Mode: Operate. O dono compara avaliações de obras em comum com um backup recebido de um colega. Arquivos JSON e gzip, sem conta ou envio de arquivos a um servidor. Todas as obras resenhadas entram; pendentes e wishlist não são avaliações. Os dados pessoais permanecem separados.

## Direction contract

THESIS: Duas fichas da mesma obra pregadas em paralelo, minhas à esquerda e do colega à direita. O arquivo recebido abre uma coleção de consulta, nunca uma restauração sobre o meu mural.

OWN-WORLD: Herda o Mural de Papelaria: eucatex, cartolina, tachinhas, etiquetas Dymo e tiras de papel. Reutiliza ReviewCard, boletim e leitor. Sem nova paleta, fontes, desenhos ou rasters.

STORY: Carregar backup, nomear colega, encontrar obras em comum e ler as opiniões. Alternar colegas e filtrar por mural, título ou diferença de nota. Erros de arquivo têm recuperação no próprio formulário.

FIRST VIEWPORT: Cabeçalho compartilhado e aba Comparar. Uma folha azul estreita contém colega e arquivo; abaixo, a tira de busca e filtros. Etiquetas Minhas / Colega ficam sobre cada par; a primeira obra e as duas notas aparecem juntas. No celular os cards simples continuam em duas colunas; leitura completa abre ao tocar.

FORM: Extensão direta da composição Lado a lado, com o par e a orientação definidos pelo usuário; não há decisão aberta de identidade ou torneio de conceitos. Autoridade herdada: Mural de Papelaria, seed f447d5fe. Transição principal: um backup revela pares de fichas; reduzir movimento respeita os estilos existentes.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Estados: primeiro uso, carregando, arquivo inválido, sem resenhas, nenhum encontro, filtro vazio, comparação, erro ao guardar. Comparação identifica catálogo dentro de um mural; equivalência por nome é conservadora com anos e autoria, sem cruzar remakes ou adaptações.

Validação: limite manual 11 com cálculo até 10, ano sem perda no backup e em todas as leituras/agrupamentos, importação JSON/gzip, dados próprios intactos, pares determinísticos, teclado, desktop e 360px.

## Implementação concluída — 2026-09-30

- A nota final manual aceita 0–11 com uma casa decimal; categorias, média ponderada e bônus permanecem limitados a 0–10. O editor permite voltar à média.
- Conclusão aceita data exata, apenas `YYYY` ou data não definida. O ano é armazenado e exibido com essa precisão, sem fabricar dia/mês, incluindo backup e agrupamento por data.
- A aba Comparar lê backups JSON/gzip e considera resenhas dos cinco murais. Colegas nomeados persistem no IndexedDB `meu-mural:colegas`, separado das resenhas próprias em localStorage. O backup próprio não inclui colegas; pendentes e wishlist não entram na comparação.
- A correspondência prioriza catálogo dentro do mesmo mural; título com autoria/ano conhecidos funciona como alternativa conservadora. Ambiguidades são ignoradas. Uma obra repetida usa sua avaliação mais recente. Todos os pares ficam disponíveis por busca, mural, ordem e “Mostrar mais obras”.
- Minhas fichas ficam à esquerda, as do colega à direita. ReviewCard conserva a apresentação completa no desktop e recebe a variante compacta pareada no celular; o leitor identifica o dono e é somente leitura nesta página. “Nota a nota” compara final, categorias e pesos.
- O cabeçalho compartilhado tem seis abas em uma segunda faixa, com duas linhas de três no celular. Na página carregada, o seletor de colega fica exposto e Gerenciar recolhe ações, metadados e formulários. Filtros no celular recolhe busca, ordem e murais, informa ajustes ativos e abre com `/`.

## Review e evidências de conclusão

O review completo inicial apontou uma correção material: os controles empurravam as notas abaixo da primeira dobra. Após o lote de compactação e recolhimento, o mesmo reviewer registrou `disposition: ship`, `material_fixes: clear` e fidelidade de FIRST VIEWPORT/hierarquia resolvida. A aprovação é limitada à correção pontuada; não constitui um novo review geral do sistema.

Recapturas consideradas pelo reviewer: `.impeccable/review/desktop.png` (1440×900), `mobile.png` (390×844), `mobile-360.png` (360×800) e `user-1265.png` (1280×720). As duas notas cabem na primeira dobra nos quatro viewports. O handoff registra build bem-sucedido, 161 testes aprovados e verificação de teclado, JSON/gzip, persistência e restauração de dados do serviço/UI. A QA usa registros sintéticos marcados “exemplo” em origem localhost isolada, sem dados padrão de produção.

O relatório existente `.impeccable/review/detector.json` contém 21 advisories: 12 de cor, 8 de tamanho tipográfico e 1 de raio. Foi preservado, sem nova execução. Esses avisos e o drift anterior do incumbent não foram promovidos a tokens ou regras para legitimar divergências.

## Documentação e finish

Documentação concluída por leitura do contrato, PRODUCT.md, DESIGN.md, referência `document.md`, tokens globais, estilos/markup da comparação e amostras de cabeçalho, ReviewCard, editor, leitor, matching, parser de backup e ColleagueStore. PRODUCT.md foi atualizado somente com as três funcionalidades, seis abas e armazenamento separado. Este brief e seu surface brief registram implementação e conclusão.

DESIGN.md e `.impeccable/design.json` foram preservados byte a byte, incluindo a alteração local anterior sobre livros brasileiros. Esta é uma extensão comum do Mural de Papelaria, seed herdado `f447d5fe`: nenhuma nova composição de mundo, paleta, fonte, QUALITY BAR ou imagem de produto. Capturas de QA são evidências, não novos rasters de produto.

Limitações: esta etapa documental não repetiu build, testes, navegador, detector ou análise visual; o resultado de validação e o verdict acima vêm do handoff da implementação e do mesmo reviewer. Gzip requer `DecompressionStream` no navegador; o parser limita arquivo e conteúdo descompactado a 32 MB. Uma correspondência ambígua é intencionalmente omitida.

Finish: implementação registrada, correção material revista com `ship`, documentação concluída e sistema vigente preservado. Nenhuma correção material permanece aberta no escopo aprovado.
