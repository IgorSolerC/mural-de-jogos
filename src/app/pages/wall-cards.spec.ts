import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Cloud } from '../core/cloud-config';
import { LocalData } from '../core/local-data';
import { Review, sanitizeReview } from '../core/review';
import { WallCardPool, WallCardProps, forgetHeights, keptTilt } from './wall-cards';

describe('a inclinação na colagem das fichas inteiras', () => {
  it('a ficha curta fica torta como sempre; a muito comprida, reta', () => {
    expect(keptTilt(260, 3.4, 17)).toBe(1);
    expect(keptTilt(380, 2, 17)).toBe(1);
    expect(keptTilt(960, 3.4, 25)).toBe(0);
    expect(keptTilt(2400, 0.8, 25)).toBe(0);
  });

  it('quanto mais comprida, menos torta', () => {
    let last = 1;
    for (let h = 200; h <= 1000; h += 20) {
      const k = keptTilt(h, 3.4, 20);
      expect(k).withContext(`${h}px`).toBeLessThanOrEqual(last);
      last = k;
    }
  });

  it('o pé da ficha nunca passa do meio do vão, nem com a inclinação maior', () => {
    for (let h = 60; h <= 3000; h += 7) {
      for (const tilt of [0.8, 1.5, 2.6, 3.4]) {
        for (const room of [17, 20, 25]) {
          const deg = tilt * keptTilt(h, tilt, room);
          const reach = (h - 12) * Math.sin((deg * Math.PI) / 180);
          expect(reach).withContext(`${h}px, ${tilt}°, ${room}px`).toBeLessThanOrEqual(room - 1);
        }
      }
    }
  });
});

/**
 * O mural só monta as fichas perto da tela: as outras são vagas da altura da ficha, cada uma na sua
 * caixa, e viram ficha quando chegam perto (ou quando a ficha acabou de ser pregada).
 */
describe('as fichas do mural, só as de perto montadas (WallCardPool)', () => {
  class MemoryData {
    private readonly map = new Map<string, string>();
    readonly where = 'local';
    getItem(key: string): string | null {
      return this.map.get(key) ?? null;
    }
    setItem(key: string, value: string): void {
      this.map.set(key, value);
    }
    onExternalChange(): void {
      /* sem outras abas */
    }
    takeForeign(): null {
      return null;
    }
  }

  const PROPS: WallCardProps = {
    landingId: null,
    highlight: null,
    compact: false,
    capas: false,
    full: false,
    dayOnly: false,
    picking: false,
    picked: new Map(),
    masked: false,
    secret: new Set(),
    times: new Map(),
    reactCode: null,
    checkable: true,
    looks: {},
  };

  const notes = (n: number): Review[] =>
    Array.from({ length: n }, (_, i) =>
      sanitizeReview({
        id: `nota-${i}`,
        kind: 'anotacoes',
        game: { name: `Anotação ${i + 1}`, coverUrl: null, source: 'manual' },
        text: 'Comprar café e filtro.\nLigar para o encanador.',
        completedAt: '2026-10-01',
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-01T10:00:00.000Z',
      })!,
    );

  let host: HTMLElement;
  let sheet: HTMLStyleElement;
  let pool: WallCardPool;

  beforeEach(() => {
    localStorage.clear();
    forgetHeights();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        WallCardPool,
        { provide: LocalData, useClass: MemoryData },
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: () => null, notice: () => null } },
      ],
    });
    pool = TestBed.inject(WallCardPool);
    pool.props = () => PROPS;
    // a parede de teste: três caixas por fileira, no alto da página (o estilo de verdade é o do mural)
    sheet = document.createElement('style');
    sheet.textContent = '.parede-teste{position:absolute;top:0;left:0;display:flex;flex-wrap:wrap;width:900px} .parede-teste .lugar{flex:none;width:280px}';
    document.head.append(sheet);
    host = document.createElement('div');
    host.className = 'parede-teste';
    document.body.append(host);
    window.scrollTo(0, 0);
  });

  afterEach(() => {
    host.remove();
    sheet.remove();
    localStorage.clear();
  });

  it('cada ficha tem a sua caixa, na ordem; as da tela são montadas e as de longe ficam como vaga', () => {
    const list = notes(40);
    pool.place(host, list, PROPS);
    pool.settle();
    const boxes = [...host.children] as HTMLElement[];
    expect(boxes.length).toBe(40);
    expect(boxes.every((b) => b.classList.contains('lugar'))).toBeTrue();
    expect(boxes.map((b) => b.getAttribute('data-lugar'))).toEqual(list.map((r) => r.id));
    expect(boxes.every((b) => b.querySelectorAll(':scope > [data-ficha]').length === 1)).withContext('uma ficha ou uma vaga em cada caixa').toBeTrue();
    const { live, slots } = pool.counts;
    expect(slots).toBe(40);
    expect(live).withContext('as da tela').toBeGreaterThan(0);
    expect(live).withContext('as de longe continuam vagas').toBeLessThan(40);
    expect(host.querySelectorAll('.vaga').length).toBe(40 - live);
    // a primeira está na tela: é ficha, nasce com o véu e a caixa dela vira camada
    expect(boxes[0].querySelector('app-review-card')?.hasAttribute('data-veu')).toBeTrue();
    expect(boxes[0].hasAttribute('data-viva')).toBeTrue();
    // a última está longe: vaga da altura estimada, sem nada dentro
    const last = boxes[39].querySelector<HTMLElement>('.vaga')!;
    expect(last).toBeTruthy();
    expect(parseFloat(last.style.height)).toBeGreaterThan(100);
    expect(last.childElementCount).toBe(0);
    expect(boxes[39].hasAttribute('data-viva')).toBeFalse();
  });

  it('a ficha que acabou de ser pregada é montada na hora, mesmo longe da tela', () => {
    const list = notes(40);
    pool.place(host, list, { ...PROPS, landingId: 'nota-39' });
    expect(host.lastElementChild!.querySelector('app-review-card[data-ficha="nota-39"]')).toBeTruthy();
  });

  it('trocar a ordem só muda as caixas de lugar: nenhuma ficha é montada de novo', () => {
    const list = notes(12);
    pool.place(host, list, PROPS);
    pool.settle();
    const first = host.firstElementChild!.querySelector('app-review-card');
    expect(first).toBeTruthy();
    pool.place(host, [...list].reverse(), PROPS);
    expect(host.lastElementChild!.querySelector('app-review-card')).withContext('o mesmo elemento, em outro lugar').toBe(first);
    expect(host.children.length).toBe(12);
  });

  it('a ficha que saiu do mural leva a caixa junto', async () => {
    const list = notes(10);
    pool.place(host, list, PROPS);
    pool.settle();
    pool.keepOnly(list.slice(0, 4));
    pool.place(host, list.slice(0, 4), PROPS);
    await new Promise((r) => setTimeout(r, 30));
    expect(host.children.length).toBe(4);
    expect(pool.counts.slots).toBe(4);
  });

  it('trocar o tipo de ficha troca a altura das vagas', () => {
    const list = notes(40);
    pool.place(host, list, PROPS);
    const vaga = () => host.lastElementChild!.querySelector<HTMLElement>('.vaga')!;
    const tall = parseFloat(vaga().style.height);
    pool.place(host, list, { ...PROPS, compact: true });
    expect(parseFloat(vaga().style.height)).toBeLessThan(tall);
  });

  it('um diálogo abrindo põe para dormir as fichas montadas fora da tela, e a da tela fica', () => {
    const list = notes(40);
    pool.place(host, list, { ...PROPS, landingId: 'nota-39' });
    pool.settle();
    const far = host.lastElementChild!.querySelector<HTMLElement>('app-review-card')!;
    // (a que acabou de cair na parede não dorme: tira a marca de chegada, como o mural faz depois)
    far.classList.remove('is-landing');
    pool.nap();
    expect(far.hasAttribute('data-dorme')).toBeTrue();
    expect(far.style.getPropertyValue('--dorme-h')).toMatch(/px$/);
    expect(host.lastElementChild!.hasAttribute('data-viva')).withContext('dormindo, devolve a camada').toBeFalse();
    expect(host.firstElementChild!.querySelector('app-review-card')?.hasAttribute('data-dorme')).toBeFalse();
    expect(pool.counts.awake).toBeLessThan(pool.counts.live);
  });
  it('rolando, as fichas ficam quietas (a que dorme também: acorda já debaixo do mouse); parou, voltam a levantar', async () => {
    const list = notes(40);
    pool.place(host, list, { ...PROPS, landingId: 'nota-39' });
    pool.settle();
    const first = host.firstElementChild!.querySelector<HTMLElement>('app-review-card')!;
    const far = host.lastElementChild!.querySelector<HTMLElement>('app-review-card')!;
    far.classList.remove('is-landing');
    pool.nap();
    expect(far.hasAttribute('data-dorme')).toBeTrue();
    expect(first.hasAttribute('data-quieta')).toBeFalse();

    window.dispatchEvent(new Event('scroll'));
    expect(first.hasAttribute('data-quieta')).toBeTrue();
    expect(far.hasAttribute('data-quieta')).withContext('a que dorme').toBeTrue();

    // ainda rolando: um instante só não basta para soltar
    await new Promise((r) => setTimeout(r, 60));
    window.dispatchEvent(new Event('scroll'));
    await new Promise((r) => setTimeout(r, 60));
    expect(first.hasAttribute('data-quieta')).withContext('a rolagem não parou').toBeTrue();

    // parou de vez: alguns quadros e um instante sem rolar
    await new Promise((r) => setTimeout(r, 700));
    expect(first.hasAttribute('data-quieta')).toBeFalse();
    expect(far.hasAttribute('data-quieta')).toBeFalse();
  });

  it('com o mouse em cima, a ficha recortada não ganha a sombra reta do empurrãozinho', () => {
    pool.place(host, notes(1), PROPS);
    pool.settle();
    const card = host.querySelector<HTMLElement>('app-review-card')!;
    card.classList.add('recortada');
    card.removeAttribute('data-quieta');
    // O teste não põe o mouse em lugar nenhum, então a conta da cascata é feita aqui: das regras que
    // valeriam para a ficha com o mouse em cima e mexem na sombra de caixa, ganha a de mais peso (no
    // empate, a que vem depois). Tem que ser a das recortadas, que tira a caixa: a sombra delas é o
    // filtro, que segue o recorte.
    const weight = (selector: string) => (selector.match(/\.[\w-]+|\[[^\]]+\]|:(?!host|not|is|where|has)[\w-]+/g) ?? []).length;
    let best: { weight: number; shadow: string } | null = null;
    for (const sheet of Array.from(document.styleSheets)) {
      for (const rule of Array.from(sheet.cssRules)) {
        if (!(rule instanceof CSSStyleRule) || !rule.style.boxShadow) continue;
        for (const selector of rule.selectorText.split(/,(?![^(]*\))/)) {
          if (!selector.includes(':hover') || /[\s>+~]/.test(selector.trim())) continue;
          if (!card.matches(selector.replace(/:hover/g, ''))) continue;
          const w = weight(selector);
          if (!best || w >= best.weight) best = { weight: w, shadow: rule.style.boxShadow };
        }
      }
    }
    expect(best).withContext('as regras de hover da ficha').not.toBeNull();
    expect(best!.shadow).toBe('none');
  });
});
