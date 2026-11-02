import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { darkGlitter, glitterShift, hash, textureOf } from '../core/paper';
import { paperVars } from '../core/paper-art';
import { Stock, isDarkStock } from '../core/review';
import { PaperArtLayer, PaperDefs } from './paper-layer';

/**
 * Os filtros de papel que os desenhos aprovados usam: nenhum deles muda por tabela. Um filtro novo
 * entra com um id novo; mudar um destes de propósito é mudar todos os desenhos que o usam.
 */
const FROZEN_FILTERS: Record<string, string> = {
  'papel-lapis': '10esj0q.628',
  'papel-mancha': '1pfmatb.302',
  'papel-agua': 'i2jm2l.782',
  'papel-borra': 'y0w0i6.131',
  'papel-tostado': '1a6ouk.814',
  'papel-tostado-pequeno': 'c3pp2i.418',
  'papel-fuligem-larga': '1swqqwu.141',
  'papel-fuligem-estreita': '1ybj87c.144',
  'papel-fuligem-larga-pequena': '1yinbcn.149',
  'papel-fuligem-estreita-pequena': 'ppshyt.152',
  'papel-borda-queimada': '14t19ti.140',
  'papel-relevo': '1wpkq8r.421',
  // 2026-09-29, segunda leva de estragos
  'papel-fio': '1ooehc.128',
  'papel-poeira': '12bc1uz.722',
  'papel-lama': '4n2khj.626',
  'papel-mofo': 'motce7.405',
  // 2026-09-30, a teia do cybertribal (funde os traços que se cruzam)
  'papel-teia': 'hvbzy5.300',
};

describe('os filtros do papel', () => {
  it('os filtros dos desenhos aprovados continuam os mesmos', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(PaperDefs);
    fixture.detectChanges();
    const now: Record<string, string> = {};
    fixture.nativeElement.querySelectorAll('filter').forEach((f: Element) => {
      const s = f.outerHTML.replace(/\s_ng(content|host)-[\w-]+=""/g, '').replace(/\s+/g, ' ');
      now[f.id] = `${hash(s).toString(36)}.${s.length}`;
    });
    for (const [id, p] of Object.entries(FROZEN_FILTERS)) expect(now[id]).withContext(id).toBe(p);
    // um filtro novo também entra aqui, congelado, assim que o desenho que o usa for aprovado
    expect(Object.keys(now).filter((id) => !(id in FROZEN_FILTERS))).withContext('filtros sem digital').toEqual([]);
  });
});

describe('o glitter na cartolina escura', () => {
  /** A camada do papel numa ficha de glitter da cor dada, com a luz acesa (a ficha levantada). */
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));
  async function layers(cor: string, id?: string) {
    const fixture = TestBed.createComponent(PaperArtLayer);
    fixture.componentRef.setInput('id', 'g1');
    fixture.componentRef.setInput('glitter', true);
    fixture.componentRef.setInput('dark', isDarkStock(cor as Stock));
    const card = document.createElement('div');
    card.className = 'cartolina';
    card.setAttribute('data-cor', cor);
    card.style.position = 'relative';
    card.style.width = '340px';
    card.style.height = '150px';
    card.style.setProperty('--luz', '1');
    for (const [k, v] of Object.entries(paperVars('glitter', undefined, undefined, null, isDarkStock(cor as Stock), id))) if (v) card.style.setProperty(k, v);
    card.appendChild(fixture.nativeElement);
    document.body.appendChild(card);
    fixture.detectChanges();
    await fixture.whenStable();
    const css = (sel: string) => getComputedStyle(card.querySelector(sel)!);
    return { papel: css('.papel'), faisca: css('.faisca'), done: () => (fixture.destroy(), card.remove()) };
  }
  const tile = (img: string) => decodeURIComponent(img);
  const dark = tile(darkGlitter().img.slice(4, -1).replace(/^"|"$/g, ''));
  const light = tile(textureOf('glitter')!.img.slice(4, -1).replace(/^"|"$/g, ''));
  const { w, h, size } = darkGlitter();

  it('no preto e nas escuras, a purpurina espalhada no lugar do chuvisco (o papel e a luz)', async () => {
    for (const cor of ['preto', 'azul-escuro', 'vermelho-escuro']) {
      const { papel, faisca, done } = await layers(cor);
      expect(tile(papel.backgroundImage)).withContext(cor).toContain(dark);
      expect(tile(papel.backgroundImage)).withContext(cor).not.toContain(light);
      expect(papel.backgroundSize.split(',')[0].trim()).withContext(cor).toBe(size);
      // a outra camada (o reforço das escuras) fica vazia: o glitter não vira o cinza em hard-light
      expect(papel.backgroundImage.split(', ')[1]).withContext(cor).toBe('none');
      // a ficha levantada acende a mesma purpurina, não o chuvisco de antes
      expect(tile(faisca.backgroundImage)).withContext(cor).toContain(dark);
      expect(faisca.backgroundSize).withContext(cor).toBe(size);
      // sem ficha (a amostra), um montinho no canto; a luz acende outros grãos (meio ladrilho adiante),
      // mais de leve que a das claras
      const [x, y] = glitterShift();
      expect(papel.backgroundPosition.split(',')[0].trim()).withContext(cor).toBe(`${x}px ${y}px`);
      expect(faisca.backgroundPosition).withContext(cor).toBe(`${x + w / 2}px ${y + h / 2}px`);
      expect(+faisca.opacity).withContext(cor).toBeCloseTo(0.6, 2);
      done();
    }
  });

  it('cada ficha começa a purpurina num lugar dela (duas pretas lado a lado não são cópias)', async () => {
    for (const id of ['r1', 'r2']) {
      const { papel, faisca, done } = await layers('preto', id);
      const [x, y] = glitterShift(id);
      expect(papel.backgroundPosition.split(',')[0].trim()).withContext(id).toBe(`${x}px ${y}px`);
      expect(faisca.backgroundPosition).withContext(id).toBe(`${x + w / 2}px ${y + h / 2}px`);
      done();
    }
  });

  it('nas claras, o glitter de sempre, no tamanho de sempre', async () => {
    for (const cor of ['amarelo', 'branco', 'vermelho']) {
      const { papel, faisca, done } = await layers(cor, 'r1');
      expect(tile(papel.backgroundImage)).withContext(cor).toContain(light);
      expect(tile(papel.backgroundImage)).withContext(cor).not.toContain(dark);
      expect(papel.backgroundSize.split(',')[0].trim()).withContext(cor).toBe('140px 140px');
      expect(tile(faisca.backgroundImage)).withContext(cor).toContain(light);
      expect(faisca.backgroundSize).withContext(cor).toBe('140px 140px');
      expect(papel.backgroundPosition.split(',')[0].trim()).withContext(cor).toBe('0px 0px');
      expect(faisca.backgroundPosition).withContext(cor).toBe('0px 0px');
      expect(+faisca.opacity).withContext(cor).toBeCloseTo(0.9, 2);
      done();
    }
  });
});
