import type { Block, Span } from '../core/rich-text';

/**
 * A amostra de tudo o que se escreve numa anotação, para conferir o PDF (ui/pdf-sheet.ts): cada
 * bloco, cada marca dentro da linha e cada widget. Os tipos obrigam: um bloco novo em core/rich-text.ts
 * (ou uma marca nova no Span) não compila até ganhar a amostra dele aqui, e o pdf-sheet.spec.ts
 * falha com um widget novo sem amostra. Com a amostra, o spec confere que ele sai na folha com a cara
 * do PDF, e `node scripts/pdf-amostra.mjs` imprime a folha inteira para olhar (ver DESIGN.md, "Salvar
 * como PDF").
 */

/** Um bloco: o texto que o escreve e o que ele desenha na folha. */
export interface PdfSample {
  text: string;
  /** Um seletor do que aparece na folha com ele. */
  shows: string;
}

/** Os blocos (core/rich-text.ts, `Block`). */
export const PDF_BLOCK_SAMPLES: Record<Block['kind'], PdfSample> = {
  h: { text: '# Dia 1\n## Antes de ir\n### Comandos do trem', shows: '.titulo.t1' },
  p: { text: 'Um roteiro de cinco dias, sem pressa.\nCada linha é uma linha, como na leitura.', shows: '.linha.paragrafo' },
  ul: { text: '- Levar o carregador\n- Guarda-chuva pequeno\n  - o de bolsa', shows: '.lista:not(.tarefas, .numerada)' },
  ol: { text: '1. Belém e os pastéis\n2. Sintra\n   2.1. Palácio da Pena\n   2.2. Quinta da Regaleira\n3. Alfama ao entardecer', shows: '.lista.numerada' },
  check: {
    text: '- [x] Comprar as passagens\n- [x] Reservar o apartamento em Alfama\n- [ ] Trocar euros\n  Pelo menos 200 em notas pequenas.\n- [ ] Baixar os mapas offline',
    shows: '.lista.tarefas .caixa.marcada',
  },
  quote: { text: '> A cidade é feita de escadas e de luz.\n> Vá com tempo.', shows: '.citacao' },
  subtle: { text: '-# Preços de outubro de 2026, podem mudar.', shows: '.linha.sutil' },
  hr: { text: '---', shows: '.divisoria' },
  code: { text: '```\nCP Sintra: Rossio → Sintra, 40 min\nIda e volta: 4,60 €\n```', shows: 'pre.codigo' },
  table: { text: '| Dia | Lugar | Custo |\n| --- | :---: | ---: |\n| Seg | Belém | 18 € |\n| Ter | Sintra | 42 € |', shows: 'table.tabela th' },
  widget: { text: '{{contador: 19/11/2026 08:30 | Embarque}}', shows: 'app-note-widget app-countdown' },
};

/** As marcas dentro da linha (core/rich-text.ts, `Span`; `ref` é o título do link, não uma marca). */
export const PDF_SPAN_SAMPLES: Record<Exclude<keyof Span, 'text' | 'ref'>, PdfSample> = {
  bold: { text: 'um roteiro **curto**', shows: '.enf.negrito' },
  italic: { text: 'com *calma*', shows: '.enf.italico' },
  strike: { text: 'e ~~pressa~~ nenhuma', shows: '.enf.riscado' },
  mark: { text: 'o ==essencial== está aqui', shows: '.enf.marca' },
  spoiler: { text: 'no fim, ||o barco afunda||', shows: '.spoiler' },
  subtle: { text: 'o resto ((se der tempo))', shows: '.enf.sutil' },
  code: { text: 'a senha `tejo-2026`', shows: 'code.cod' },
  link: { text: 'ver [[Lista de malas]] e [[Restaurantes|os restaurantes]]', shows: '.elo' },
  href: { text: 'o site do [metrô](https://www.metrolisboa.pt)', shows: 'a.elo.url' },
};

/** Os widgets (core/widgets.ts, `WIDGETS`), pelo nome: cada jeito que muda a cara dele. */
export const PDF_WIDGET_SAMPLES: Record<string, readonly string[]> = {
  contador: ['{{contador: 19/11/2026 08:30 | Embarque}}', '{{contador: 25/12/2026 | neon | Natal | pequeno}}', '{{contador: 31/12/2026 | placar | Ano novo | pequeno}}', '{{contador: 01/03/2027 | riscado | Volta às aulas | pequeno}}'],
  imagem: [
    '{{imagem: https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/header.jpg | polaroid | A primeira fuga}}',
    '{{imagem: https://cdn.cloudflare.steamstatic.com/steam/apps/367520/header.jpg | recorte | Recortada da revista | pequeno}}',
    '{{imagem: https://cdn.cloudflare.steamstatic.com/steam/apps/504230/library_600x900.jpg | foto | Capa | pequeno}}',
  ],
  video: ['{{video: https://www.youtube.com/watch?v=dQw4w9WgXcQ | O clipe}}'],
  audio: ['{{audio: https://www.youtube.com/watch?v=dQw4w9WgXcQ | Fado}}', '{{audio: https://www.youtube.com/watch?v=dQw4w9WgXcQ | vinil | Fado | pequeno}}', '{{audio: https://www.youtube.com/watch?v=dQw4w9WgXcQ | simples | Fado | mini}}'],
  nota: ['{{nota: #amostra-malas | Lista de malas}}', '{{nota: #amostra-malas | Lista de malas | capa | pequeno}}', '{{nota: #amostra-malas | Lista de malas | inteira}}'],
};

/** A anotação colada pela amostra do widget Nota (o script da amostra a põe no mural). */
export const PDF_SAMPLE_CARD = {
  id: 'amostra-malas',
  title: 'Lista de malas',
  text: '- [x] Passaporte\n- [ ] Adaptador de tomada\n- [ ] Casaco leve',
};

/** Uma anotação com tudo, na ordem de quem escreve: o texto que o script imprime para olhar. */
export function pdfSampleText(): string {
  const b = PDF_BLOCK_SAMPLES;
  const s = PDF_SPAN_SAMPLES;
  const line = (...keys: (keyof typeof s)[]) => keys.map((k) => s[k].text).join(', ') + '.';
  return [
    b.p.text,
    '',
    `Num dia só: ${line('bold', 'italic', 'strike')} Depois: ${line('mark', 'subtle')}`,
    `${line('code', 'spoiler')} E ${line('link', 'href')}`,
    '',
    ...b.h.text.split('\n').slice(0, 2),
    b.check.text,
    '',
    '## Roteiro',
    b.ol.text,
    '',
    b.ul.text,
    '',
    b.quote.text,
    '',
    b.subtle.text,
    '',
    b.table.text,
    '',
    b.hr.text,
    '',
    b.h.text.split('\n')[2],
    b.code.text,
    '',
    '## Os widgets',
    ...Object.values(PDF_WIDGET_SAMPLES).flatMap((xs) => [...xs, '']),
  ].join('\n');
}
