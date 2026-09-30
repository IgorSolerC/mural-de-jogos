---
version: 1
slug: "src-app-pages-comparison-page-ts"
primary_target: "src/app/pages/comparison-page.ts"
related_targets: ["src/app/pages/comparison-page.html","src/app/pages/comparison-page.scss"]
---

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

## Estado de implementação — 2026-09-30

Implementado em `comparison-page.ts/html/scss`, com parsing JSON/gzip, múltiplos colegas persistidos em IndexedDB separado e todas as obras resenhadas em comum nos cinco murais. Matching por catálogo tem prioridade; título com autoria/ano conhecidos é a alternativa, com ambiguidades omitidas. Pendentes e wishlist não são avaliações. O backup próprio não inclui colegas e carregar um colega não modifica o ReviewStore próprio.

A orientação Minhas/esquerda e Colega/direita permanece em duas colunas no celular, com ReviewCard compacto pareado; desktop reutiliza a ficha completa. O leitor identifica o dono e abre em modo somente leitura. “Nota a nota” compara nota final, categorias e pesos. Todos os resultados são acessíveis, com carregamento adicional de pares.

O seletor de colega fica imediato; Gerenciar recolhe ações, metadados e formulários. Filtros no celular recolhe busca, ordem e murais, mostra ajustes ativos e abre a busca com `/`. As seis abas compartilhadas ocupam a segunda faixa do cabeçalho e se distribuem em duas linhas de três no celular. As extensões do editor aceitam 11 somente no override manual e preservam conclusão apenas por ano como `YYYY`.

## Review e finish

O mesmo reviewer aprovou a correção material que levava controles a empurrar as notas abaixo da primeira dobra: `disposition: ship`, `material_fixes: clear`, FIRST VIEWPORT e hierarquia resolvidos. As duas notas aparecem juntas na primeira dobra das recapturas desktop 1440×900, celular 390×844 e 360×800, e contexto do usuário 1280×720 (`.impeccable/review/desktop.png`, `mobile.png`, `mobile-360.png`, `user-1265.png`). Aprovação limitada ao fix pontuado após o review completo inicial.

O handoff registra build bem-sucedido, 161 testes aprovados e teclado, JSON/gzip, persistência/restauração verificados. Dados de QA são sintéticos, marcados “exemplo”, apenas em origem localhost isolada. O único detector existente foi preservado: 21 advisories do incumbent (12 cor, 8 tamanho tipográfico, 1 raio), sem nova execução ou canonização.

Documentação concluída: PRODUCT.md recebeu somente as verdades dos três recursos, seis abas e IndexedDB separado; o brief da comparação e este surface brief registram o estado final. DESIGN.md e `.impeccable/design.json` ficam byte a byte preservados, incluindo a alteração anterior de livros brasileiros. Nenhum novo asset de produto ou regra global foi gerado.

Limite da etapa documental: evidência de fonte conferida; build, testes e review são resultados recebidos do handoff, sem repetição de navegador, detector ou varredura visual. Finish concluído para a extensão aprovada do Mural de Papelaria (`f447d5fe`), sem correções materiais abertas no escopo do verdict.
