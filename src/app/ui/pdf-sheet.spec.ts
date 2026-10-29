import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WIDGETS } from '../core/widgets';
import { PdfDoc, PdfSheet, footerStamp, markLong, pdfFileName, sheetReady } from './pdf-sheet';
import { PDF_BLOCK_SAMPLES, PDF_LOCAL_IMAGE, PDF_SPAN_SAMPLES, PDF_WIDGET_SAMPLES, PdfSample, pdfSampleText } from './pdf-sheet.samples';
import { deleteDatabase } from '../core/erase-save';
import { IMAGES_DB, ImageStore } from '../core/image-store';
import { samplePng } from '../core/images.spec';

/**
 * A regra do PDF: toda marca do texto (bloco, marca na linha, widget) sai na folha, e com a cara do
 * PDF, não a da leitura (a pauta, a letra à mão, o spoiler tapado). Uma marca nova sem amostra não
 * compila (os Records de pdf-sheet.samples.ts) ou falha aqui (o widget); com amostra, o que ela
 * desenha precisa passar no olhar de `LOOKS` abaixo. Depois, `node scripts/pdf-amostra.mjs` para ver
 * o PDF de verdade.
 */
async function sheet(doc: Partial<PdfDoc> & { text: string }): Promise<{ fixture: ComponentFixture<PdfSheet>; el: HTMLElement }> {
  TestBed.configureTestingModule({ imports: [PdfSheet], providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(PdfSheet);
  fixture.componentRef.setInput('doc', { title: 'Viagem a Lisboa', meta: [], ...doc });
  // a folha fica onde fica na exportação: fora da tela, da largura do papel
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  await sheetReady(el, 3000);
  fixture.detectChanges();
  return { fixture, el };
}

const css = (el: Element, pseudo?: string) => getComputedStyle(el, pseudo);
const INTER = /Inter/;
const MONO = /ui-monospace/;
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

/**
 * Como cada coisa desenhada precisa sair no PDF: o seletor (dentro do texto da folha) e o que conferir
 * nele. Cada amostra de pdf-sheet.samples.ts precisa ter o seu (o teste diz qual falta).
 */
const LOOKS: Record<string, (el: HTMLElement) => void> = {
  '.titulo.t1': (el) => {
    expect(css(el).fontFamily).toMatch(INTER);
    expect(css(el).fontWeight).toBe('700');
    expect(css(el).textTransform).toBe('none');
  },
  '.linha.paragrafo': (el) => {
    expect(css(el).fontFamily).toMatch(INTER);
    // sem o recuo de parágrafo da letra à mão
    expect(css(el).textIndent).toBe('0px');
  },
  '.lista:not(.tarefas, .numerada)': (el) => expect(css(el.querySelector('li')!, '::before').content).toBe('"•"'),
  '.lista.numerada': (el) => expect(css(el.querySelector('li')!, '::before').content).toContain('counter(item)'),
  '.lista.tarefas .caixa.marcada': (el) => {
    // reta, de borda fina, e o tique vermelho de caneta dentro
    expect(css(el).rotate).toBe('0deg');
    expect(css(el).borderTopColor).toBe('rgb(196, 48, 43)');
    expect(css(el).backgroundImage).toContain('svg');
  },
  '.citacao': (el) => {
    expect(css(el).fontStyle).toBe('normal');
    // o fio reto (sem o risco ondulado à mão)
    expect(css(el, '::before').maskImage).toBe('none');
    expect(css(el, '::before').width).toBe('2px');
  },
  '.linha.sutil': (el) => expect(css(el).color).toBe('rgb(138, 132, 122)'),
  '.divisoria': (el) => {
    expect(el.getBoundingClientRect().height).toBe(1);
    expect(css(el).maskImage).toBe('none');
  },
  'pre.codigo': (el) => {
    expect(css(el).fontFamily).toMatch(MONO);
    expect(css(el).backgroundColor).toBe('rgb(245, 242, 236)');
  },
  'table.tabela th': (el) => {
    expect(css(el).textTransform).toBe('none');
    expect(css(el).fontFamily).toMatch(INTER);
    expect(css(el).borderTopWidth).toBe('1px');
  },
  'app-note-widget app-countdown': (el) => {
    // o widget com a cara da leitura: a letra à mão e a pauta dela
    const w = el.closest('app-note-widget')!;
    expect(css(w).fontFamily).toMatch(/Kalam/);
    expect(css(w).getPropertyValue('--line').trim()).toBe('1.85rem');
  },
  '.enf.negrito': (el) => expect(css(el).fontWeight).toBe('700'),
  '.enf.italico': (el) => expect(css(el).fontStyle).toBe('italic'),
  '.enf.riscado': (el) => expect(css(el).textDecorationLine).toBe('line-through'),
  '.enf.marca': (el) => expect(css(el).backgroundImage).toContain('gradient'),
  '.spoiler': (el) => {
    // no papel o spoiler aparece, numa caixinha tracejada
    expect(css(el.querySelector('.spoiler-texto')!).color).not.toBe(TRANSPARENT);
    expect(css(el).color).not.toBe(TRANSPARENT);
    expect(css(el).outlineStyle).toBe('dashed');
  },
  '.enf.sutil': (el) => expect(css(el).color).toBe('rgb(138, 132, 122)'),
  'code.cod': (el) => expect(css(el).fontFamily).toMatch(MONO),
  '.elo': (el) => {
    expect(css(el).color).toBe('rgb(29, 53, 119)');
    expect(css(el).textDecorationLine).toBe('underline');
  },
  'a.elo.url': (el) => expect((el as HTMLAnchorElement).href).toBe('https://www.metrolisboa.pt/'),
};

describe('a ficha em PDF (ui/pdf-sheet.ts)', () => {
  afterEach(() => document.querySelectorAll('.pdf-sheet').forEach((n) => n.remove()));

  it('o cabeçalho: o nome, quem fez, as informações, o grupo e as tags com a cor deles, e a capa', async () => {
    const { el } = await sheet({
      title: 'Hades',
      by: 'de Supergiant Games',
      meta: ['Finalizado em 3 de março de 2026', '40 horas'],
      score: { value: '9,5', verdict: 'Masterpiece', marks: [{ label: 'História', value: '9' }, { label: 'Diversão', value: '10' }] },
      group: { label: 'Viagens', color: '#2b8a3e' },
      tags: [{ label: 'roteiro', color: '#c4302b' }, { label: 'sem cor', color: null }],
      cover: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
      text: 'Texto.',
    });
    expect(el.querySelector('h1.pdf-titulo')!.textContent).toBe('Hades');
    expect(css(el.querySelector('h1')!).fontFamily).toMatch(INTER);
    expect(el.querySelector('.pdf-de')!.textContent).toBe('de Supergiant Games');
    const meta = [...el.querySelectorAll('.pdf-meta > span')].map((s) => s.textContent);
    expect(meta).toEqual(['Viagens', 'Finalizado em 3 de março de 2026', '40 horas']);
    // a Média impressa como a etiqueta da ficha: o número itálico e o veredito na faixa preta
    const media = el.querySelector('.pdf-media')!;
    expect(media.getAttribute('aria-label')).toBe('Média 9,5, Masterpiece');
    expect(css(media.querySelector('.pdf-media-nota')!).fontStyle).toBe('italic');
    expect(css(media.querySelector('.pdf-media-veredito')!).backgroundColor).toBe('rgb(27, 25, 22)');
    expect([...el.querySelectorAll('.pdf-boletim dd')].map((d) => d.textContent)).toEqual(['9', '10']);
    expect(css(el.querySelector('.pdf-grupo')!, '::before').backgroundColor).toBe('rgb(43, 138, 62)');
    const tags = el.querySelectorAll<HTMLElement>('.pdf-tags li');
    expect(tags.length).toBe(2);
    expect(css(tags[0], '::before').backgroundColor).toBe('rgb(196, 48, 43)');
    expect(el.querySelector<HTMLImageElement>('img.pdf-capa')!.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('sem texto, só o cabeçalho; a anotação, sem Média nem boletim, e o nome com a largura toda', async () => {
    const { el } = await sheet({ text: '   ' });
    expect(el.querySelector('.pdf-texto')).toBeNull();
    expect(el.querySelector('.pdf-meta')).toBeNull();
    expect(el.querySelector('.pdf-media, .pdf-boletim, .pdf-capa')).toBeNull();
    expect(el.querySelector<HTMLElement>('.pdf-nomes')!.offsetWidth).toBe(el.querySelector<HTMLElement>('.pdf-cabeca')!.clientWidth);
  });

  it('a folha espera fora da tela, da largura do papel A4 menos as margens', async () => {
    const { el } = await sheet({ text: 'Texto.' });
    const box = el.getBoundingClientRect();
    expect(box.right).toBeLessThan(0);
    // 166 mm, a 96 px por polegada
    expect(Math.round(box.width)).toBe(Math.round((166 / 25.4) * 96));
  });

  it('toda amostra tem o olhar dela no PDF', () => {
    const samples: PdfSample[] = [...Object.values(PDF_BLOCK_SAMPLES), ...Object.values(PDF_SPAN_SAMPLES)];
    for (const s of samples) expect(LOOKS[s.shows]).withContext(`falta o olhar de ${s.shows} em pdf-sheet.spec.ts`).toBeDefined();
  });

  it('todo widget tem amostra no PDF', () => {
    for (const w of WIDGETS) expect(PDF_WIDGET_SAMPLES[w.name]?.length).withContext(`falta a amostra do widget ${w.name} em pdf-sheet.samples.ts`).toBeGreaterThan(0);
  });

  for (const [kind, s] of Object.entries(PDF_BLOCK_SAMPLES)) {
    it(`o bloco ${kind} sai com a cara do PDF`, async () => {
      const { el } = await sheet({ text: s.text });
      const got = el.querySelector<HTMLElement>(`.pdf-texto ${s.shows}`);
      expect(got).withContext(s.shows).not.toBeNull();
      LOOKS[s.shows](got!);
    });
  }

  for (const [mark, s] of Object.entries(PDF_SPAN_SAMPLES)) {
    it(`a marca ${mark} sai com a cara do PDF`, async () => {
      const { el } = await sheet({ text: s.text, links: { resolve: (t) => (t === 'Lista de malas' ? ({ id: 'x' } as never) : null) } });
      const got = el.querySelector<HTMLElement>(`.pdf-texto ${s.shows}`);
      expect(got).withContext(s.shows).not.toBeNull();
      LOOKS[s.shows](got!);
    });
  }

  it('cada widget aparece com a peça dele, sem os broches de tocar, e inteiro na página', async () => {
    const { el } = await sheet({ text: Object.values(PDF_WIDGET_SAMPLES).flat().join('\n') });
    for (const sel of ['app-countdown', 'app-glued-media', 'app-audio-track', 'app-linked-card']) expect(el.querySelector(sel)).withContext(sel).not.toBeNull();
    // nenhum widget esperando o pedaço dele
    expect(el.querySelector('.esperando')).toBeNull();
    for (const k of el.querySelectorAll('app-zoom-knob, app-volume-knob')) expect(css(k).display).toBe('none');
    for (const w of el.querySelectorAll('app-note-widget')) expect(css(w).breakInside).toBe('avoid');
    // o que só faz sentido tocando (o relógio da faixa, a barra) não vai para o papel
    for (const x of el.querySelectorAll('app-audio-track :is(.contagem, .trilho)')) expect(css(x).display).toBe('none');
    // o vídeo e o som levam o endereço embaixo, clicável no PDF
    const links = [...el.querySelectorAll<HTMLAnchorElement>('app-note-widget a.fonte')];
    expect(links.length).toBe(PDF_WIDGET_SAMPLES['video'].length + PDF_WIDGET_SAMPLES['audio'].length);
    expect(links[0].textContent).toBe('youtube.com/watch?v=dQw4w9WgXcQ');
    expect(links[0].href).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    for (const a of links) expect(css(a).display).toBe('block');
  });

  it('a tabela branca vira a do PDF; os outros jeitos saem com a cara deles, sem partir uma linha', async () => {
    const { el } = await sheet({ text: [PDF_BLOCK_SAMPLES.table.text, '', ...PDF_WIDGET_SAMPLES['tabela'].flatMap((t) => [t, ''])].join('\n') });
    const rolos = [...el.querySelectorAll<HTMLElement>('.pdf-texto .tabela-rolo')];
    expect(rolos.map((r) => [...r.classList].find((c) => c.startsWith('jeito-')))).toEqual(['jeito-branca', 'jeito-listrada', 'jeito-quadriculada', 'jeito-caneta', 'jeito-recibo']);
    // a branca: sem o papel colado da tela
    expect(css(rolos[0].querySelector('.tabela-papel')!).boxShadow).toBe('none');
    // a listrada continua com a faixa de tinta no cabeçalho, e o recibo com a letra de máquina
    expect(css(rolos[1].querySelector('th')!).backgroundColor).toBe('rgb(34, 32, 29)');
    expect(css(rolos[4].querySelector('td')!).fontFamily).toMatch(MONO);
    for (const tr of el.querySelectorAll('.pdf-texto .tabela tr')) expect(css(tr).breakInside).toBe('avoid');
  });

  it('fora do PDF, o endereço do vídeo nunca aparece', async () => {
    const { el } = await sheet({ text: PDF_WIDGET_SAMPLES['video'][0] });
    const a = el.querySelector('a.fonte')!;
    el.classList.remove('pdf-sheet');
    expect(css(a).display).toBe('none');
  });

  it('só o widget mais alto que uma página quebra de página', async () => {
    const { el } = await sheet({ text: ['{{contador: 19/11/2026 | Embarque}}', '{{contador: 20/11/2026 | Volta}}'].join('\n') });
    const [short, tall] = el.querySelectorAll<HTMLElement>('app-note-widget');
    tall.style.height = '1200px';
    markLong(el);
    expect(short.classList).not.toContain('pdf-longa');
    expect(tall.classList).toContain('pdf-longa');
    expect(css(short).breakInside).toBe('avoid');
    expect(css(tall).breakInside).toBe('auto');
  });

  it('o pé das páginas leva o dia em que o PDF foi feito', () => {
    expect(footerStamp(new Date(2026, 9, 24))).toBe('@page { @bottom-left { content: "MURALL · 24 DE OUT. DE 2026"; } }');
  });

  it('o texto dentro de um widget (a nota de texto inteiro) fica com a cara dele, não a do PDF', async () => {
    const { el } = await sheet({ text: '# Fora\n{{contador: 19/11/2026 | Embarque}}' });
    const outer = el.querySelector<HTMLElement>('.pdf-texto > app-rich-text .titulo')!;
    expect(css(outer).fontFamily).toMatch(INTER);
    // a mesma regra não alcança o que mora dentro de um widget
    const inner = document.createElement('div');
    inner.className = 'linha titulo t1';
    el.querySelector('app-note-widget')!.appendChild(inner);
    expect(css(inner).fontFamily).not.toMatch(INTER);
  });

  it('a foto colada do aparelho: a folha espera ela sair do IndexedDB e imprime a foto', async () => {
    await deleteDatabase(IMAGES_DB);
    try {
      const blob = await samplePng(300, 200);
      // guardada antes de a folha montar (o TestBed ainda não foi configurado: a loja aqui é outra, o banco é o mesmo)
      await new ImageStore().restore([
        { id: PDF_LOCAL_IMAGE.id, blob, tipo: blob.type, largura: 300, altura: 200, bytes: blob.size, hash: 'amostra', criada: new Date().toISOString(), estado: 'local' },
      ]);
      const { el } = await sheet({ text: PDF_LOCAL_IMAGE.text });
      const img = el.querySelector<HTMLImageElement>('app-glued-media img');
      expect(img?.src).toMatch(/^blob:/);
      expect(img?.complete && img.naturalWidth).toBe(300);
      expect(el.querySelector('[data-esperando]')).toBeNull();
    } finally {
      await deleteDatabase(IMAGES_DB);
    }
  });

  it('as tarefas feitas aparecem todas (no papel não há o que tocar para abrir)', async () => {
    const { el } = await sheet({ text: '- [x] Uma\n- [x] Duas\n- [ ] Três' });
    expect(el.querySelectorAll('.tarefas li.feita').length).toBe(2);
    expect(el.querySelector('.resumo')).toBeNull();
  });

  it('a amostra inteira tem cada bloco, cada marca e cada widget', () => {
    const text = pdfSampleText();
    for (const s of [...Object.values(PDF_BLOCK_SAMPLES), ...Object.values(PDF_SPAN_SAMPLES)]) for (const line of s.text.split('\n')) expect(text).toContain(line);
    for (const xs of Object.values(PDF_WIDGET_SAMPLES)) for (const x of xs) expect(text).toContain(x);
    expect(text).toContain(PDF_LOCAL_IMAGE.text);
  });

  it('o nome do arquivo é o título, sem o que o sistema não aceita', () => {
    expect(pdfFileName('Viagem: Lisboa / Porto?')).toBe('Viagem Lisboa Porto');
    expect(pdfFileName('  ')).toBe('Anotação');
  });
});
