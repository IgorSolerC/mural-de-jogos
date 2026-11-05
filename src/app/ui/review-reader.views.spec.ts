import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Cloud } from '../core/cloud-config';
import { CloudAccount } from '../core/cloud-account';
import { LocalData } from '../core/local-data';
import { Review, sanitizeReview } from '../core/review';
import { SHARED_AUTO } from '../core/shared-store';
import { CARD_ZOOM_MAX, CARD_ZOOM_MIN, ReviewReader, cardZoomFor } from './review-reader';

/**
 * Os jeitos de ver a ficha aberta: a leitura de sempre, a tela cheia (só o nome e o texto, para ler
 * uma anotação comprida) e só a cartolina (a ficha como fica no mural, grande, no meio da tela). Os
 * dois botões ficam na faixa, antes do X.
 */

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

function review(id: string, name: string, extra: Partial<Review> = {}): Review {
  return sanitizeReview({
    id,
    kind: 'jogos',
    game: { name, coverUrl: null, source: 'manual' },
    scores: { historia: 8, diversao: 8, jogabilidade: 8, visual: 8 },
    status: 'finalizado',
    difficulty: 'nenhuma',
    verdict: null,
    text: 'Valeu cada hora, mesmo com o final corrido.',
    completedAt: '2026-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  })!;
}

function note(id: string, name: string, extra: Partial<Review> = {}): Review {
  return review(id, name, { kind: 'anotacoes', scores: { final: 0 }, text: '- [ ] Pão\n- [x] Leite', ...extra });
}

/** Um texto comprido: 40 parágrafos, cada um numa linha da fonte. */
const LONG = Array.from({ length: 40 }, (_, i) => `Parágrafo ${i + 1}. A manhã começou com neblina, e o trem das nove já ia cheio de gente com mochila e câmera.`).join('\n\n');

describe('Os jeitos de ver a ficha aberta (ReviewReader)', () => {
  let fixture: ComponentFixture<ReviewReader>;
  let el: HTMLElement;
  /** Sem as animações de entrada (a folha que sobe, a vista que cresce): as medidas são as de repouso. */
  let still: HTMLStyleElement;

  beforeEach(() => {
    localStorage.clear();
    still = document.head.appendChild(document.createElement('style'));
    still.textContent = '*, *::backdrop { animation: none !important; transition: none !important; }';
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: LocalData, useClass: MemoryData },
        { provide: SHARED_AUTO, useValue: false },
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: signal({ api: 'https://api.teste', googleClientId: 'x' }) } },
        { provide: CloudAccount, useValue: { account: signal(null), signedIn: signal(false), request: async () => ({}) } },
      ],
    });
    fixture = TestBed.createComponent(ReviewReader);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    const d = el.querySelector('dialog');
    if (d?.open) fixture.componentInstance.close();
    still.remove();
    localStorage.clear();
  });

  const q = <T extends HTMLElement>(selector: string) => el.querySelector<T>(selector);
  const qa = (selector: string) => [...el.querySelectorAll<HTMLElement>(selector)];
  const wait = (ms = 0) => new Promise((res) => setTimeout(res, ms));
  const dialog = () => q<HTMLDialogElement>('dialog.reader')!;
  async function settle(): Promise<void> {
    await wait();
    fixture.detectChanges();
    await fixture.whenStable();
    await wait();
  }
  const band = (selector: string) => q<HTMLButtonElement>(`.faixa-nome ${selector}`)!;

  it('os dois botões ficam na faixa, antes do X, na ordem: só a cartolina, tela cheia, fechar', async () => {
    fixture.componentInstance.open(note('n-1', 'Mercado'));
    await settle();
    const buttons = qa('.faixa-nome button');
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Ver só a cartolina', 'Ler em tela cheia', 'Fechar']);
    expect(band('.ver-cartolina').title).toBe('Ver só a cartolina');
    expect(band('.ler-tela-cheia').title).toBe('Ler em tela cheia');
    // menores que o X: só mudam o jeito de ver
    expect(band('.ver-cartolina').querySelector('svg')!.getAttribute('width')).toBe('16');
    expect(band('.fecha').querySelector('svg')!.getAttribute('width')).toBe('22');
    expect(q('.faixa-nome .vistas')?.getAttribute('role')).toBe('group');
  });

  it('a tela cheia deixa só a faixa (o nome e os botões) e o texto; o mesmo botão volta à leitura', async () => {
    fixture.componentInstance.open(note('n-1', 'Mercado', { category: 'Casa', tags: ['Feira'], doneAt: '2026-01-02T00:00:00.000Z' }));
    await settle();
    expect(q('.top')).not.toBeNull();
    expect(q('.foot')).not.toBeNull();
    expect(q('.orelha-grupo')).not.toBeNull();
    expect(q('.carimbo')).not.toBeNull();
    band('.ler-tela-cheia').focus();
    band('.ler-tela-cheia').click();
    await settle();
    expect(dialog().classList.contains('tela-cheia')).toBeTrue();
    expect(dialog().open).toBeTrue();
    for (const gone of ['.top', '.foot', '.orelha-grupo', '.carimbo', '.reagir-linha', '.orelhas .orelha', 'app-more-menu']) {
      expect(q(gone)).withContext(gone).toBeNull();
    }
    expect(q('#leitura-titulo')?.textContent).toBe('Mercado');
    expect(q('.body .text app-rich-text')).not.toBeNull();
    expect(q('.par')?.classList.contains('com-grupo')).toBeFalse();
    expect(q('.faixa-nome')?.classList.contains('feita')).toBeFalse();
    // o botão é o mesmo, com outro nome (e o foco fica nele)
    expect(band('.ler-tela-cheia').getAttribute('aria-label')).toBe('Voltar à leitura');
    expect(document.activeElement).toBe(band('.ler-tela-cheia'));
    expect(band('.ver-cartolina').getAttribute('aria-label')).toBe('Ver só a cartolina');
    // a letra é maior que a da leitura
    expect(parseFloat(getComputedStyle(q('.text')!).fontSize)).toBeGreaterThan(1.3 * parseFloat(getComputedStyle(document.documentElement).fontSize));
    band('.ler-tela-cheia').click();
    await settle();
    expect(dialog().classList.contains('tela-cheia')).toBeFalse();
    expect(q('.top')).not.toBeNull();
    expect(q('.foot')).not.toBeNull();
    expect(band('.ler-tela-cheia').getAttribute('aria-label')).toBe('Ler em tela cheia');
  });

  it('na tela cheia, a folha é a coluna do texto com 1cm de papel de cada lado, e só da altura dele', async () => {
    const cm = 96 / 2.54;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const wide = document.head.appendChild(document.createElement('style'));
    try {
      fixture.componentInstance.open(note('n-1', 'Mercado'));
      await settle();
      band('.ler-tela-cheia').click();
      await settle();
      // o celular (até 600px) é a página inteira; aqui, a janela do teste é o computador
      expect(innerWidth).toBeGreaterThan(600);
      const sheet = () => q('.par > .ficha')!.getBoundingClientRect();
      const text = () => q('.body .text')!.getBoundingClientRect();
      // a pauta a 1cm das duas beiradas, e a folha nunca mais larga que a coluna mais as margens
      expect(text().left - sheet().left).toBeCloseTo(cm, 0);
      expect(sheet().right - text().right).toBeCloseTo(cm, 0);
      expect(dialog().getBoundingClientRect().width).toBeLessThanOrEqual(43 * rem + 2 * cm + 1);
      // o nome começa onde começa a letra (a margem e a folga de 8px da pauta)
      expect(parseFloat(getComputedStyle(q('.faixa-nome')!).paddingLeft)).toBeCloseTo(cm + 8, 0);
      // a nota curta: a folha tem a altura do texto, longe da tela inteira
      const faixa = q('.faixa-nome')!.getBoundingClientRect().height;
      expect(sheet().height).toBeCloseTo(faixa + 28 + text().height + 36, 0);
      expect(sheet().height).toBeLessThan(innerHeight - 48 - 40);
      expect(q('.body')!.scrollHeight).toBeLessThanOrEqual(q('.body')!.clientHeight);

      // numa tela larga, a folha não cresce além da coluna: as margens continuam de 1cm
      wide.textContent = 'dialog.reader.tela-cheia { --medida: 20rem !important; }';
      await settle();
      expect(text().left - sheet().left).toBeCloseTo(cm, 0);
      expect(sheet().right - text().right).toBeCloseTo(cm, 0);
      expect(text().width).toBeCloseTo(20 * rem, 0);
    } finally {
      wide.remove();
    }
  });

  it('na tela cheia, com a seta de volta de um link, a seta fica na margem e o nome perto da letra do texto', async () => {
    fixture.componentInstance.open(note('n-mercado', 'Mercado'), null, [], false, null, note('n-tudo', 'Lista de tudo'));
    await settle();
    band('.ler-tela-cheia').click();
    await settle();
    const sheet = q('.par > .ficha')!.getBoundingClientRect();
    const arrow = q('.faixa-nome .voltar-elo')!.getBoundingClientRect();
    const title = q('#leitura-titulo')!.getBoundingClientRect();
    const letter = q('.body .text')!.getBoundingClientRect().left + 8;
    expect(arrow.left - sheet.left).toBeGreaterThanOrEqual(0);
    expect(arrow.left - sheet.left).toBeLessThanOrEqual(8);
    expect(Math.abs(title.left - letter)).toBeLessThanOrEqual(8);
  });

  it('na tela cheia, o texto comprido vai até a tela (menos 24px em cima e embaixo) e rola por dentro', async () => {
    fixture.componentInstance.open(note('n-longa', 'Diário', { text: LONG }));
    await settle();
    band('.ler-tela-cheia').click();
    await settle();
    const sheet = q('.par > .ficha')!.getBoundingClientRect();
    expect(sheet.height).toBeCloseTo(innerHeight - 48, 0);
    expect(q('.body')!.scrollHeight).toBeGreaterThan(q('.body')!.clientHeight);
  });

  it('na tela cheia, a análise também fica só com o texto (sem o boletim nem a etiqueta)', async () => {
    fixture.componentInstance.open(review('r-hades', 'Hades'));
    await settle();
    expect(q('app-boletim')).not.toBeNull();
    band('.ler-tela-cheia').click();
    await settle();
    expect(q('app-boletim')).toBeNull();
    expect(q('app-judge-label')).toBeNull();
    expect(q('.body .text')?.textContent).toContain('Valeu cada hora');
  });

  it('o trecho que estava no alto da folha continua no alto ao entrar e ao sair da tela cheia', async () => {
    fixture.componentInstance.open(note('n-longa', 'Diário', { text: LONG }));
    await settle();
    const body = () => q('.par > article > .body')!;
    const lines = () => qa('.text .linha');
    // rola até o parágrafo 21 ficar no alto da folha (as linhas em branco também são linhas)
    const target = lines().find((l) => l.textContent?.startsWith('Parágrafo 21.'))!;
    body().scrollTop += target.getBoundingClientRect().top - body().getBoundingClientRect().top;
    await settle();
    const topLine = () => {
      const top = body().getBoundingClientRect().top;
      return lines().find((l) => l.getBoundingClientRect().bottom > top + 1);
    };
    expect(topLine()?.textContent).toContain('Parágrafo 21.');
    band('.ler-tela-cheia').click();
    await settle();
    expect(topLine()?.textContent).toContain('Parágrafo 21.');
    band('.ler-tela-cheia').click();
    await settle();
    expect(topLine()?.textContent).toContain('Parágrafo 21.');
  });

  it('só a cartolina: a ficha do mural no meio da tela, com os mesmos botões; tocar nela volta à leitura', async () => {
    fixture.componentInstance.open(note('n-1', 'Mercado', { stock: 'lilas', category: 'Casa' }));
    await settle();
    band('.ver-cartolina').click();
    await settle();
    await wait(60);
    expect(dialog().classList.contains('so-a-cartolina')).toBeTrue();
    expect(dialog().open).toBeTrue();
    // a leitura fica guardada, escondida
    expect(getComputedStyle(q('.par')!).display).toBe('none');
    const card = q('.na-parede app-review-card')!;
    expect(card).not.toBeNull();
    expect(card.getAttribute('data-cor')).toBe('lilas');
    expect(card.textContent).toContain('Mercado');
    // fora das transições do mural (a ficha de verdade continua lá com o nome dela)
    expect(card.style.viewTransitionName || '').toBe('');
    const buttons = qa('.na-parede .vistas-giz button');
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Voltar à leitura', 'Ler em tela cheia', 'Fechar']);
    expect(document.activeElement).toBe(buttons[0]);
    // tocar na ficha volta à leitura, com o foco no botão que a mostra de novo
    card.querySelector<HTMLButtonElement>('.hit')!.click();
    await settle();
    expect(dialog().classList.contains('so-a-cartolina')).toBeFalse();
    expect(q('.na-parede')).toBeNull();
    expect(getComputedStyle(q('.par')!).display).not.toBe('none');
    expect(document.activeElement).toBe(band('.ver-cartolina'));
  });

  it('da cartolina, a tela cheia e o fechar; e o toque no escuro em volta fecha', async () => {
    fixture.componentInstance.open(note('n-1', 'Mercado'));
    await settle();
    band('.ver-cartolina').click();
    await settle();
    q<HTMLButtonElement>('.na-parede .ler-tela-cheia')!.click();
    await settle();
    expect(dialog().classList.contains('tela-cheia')).toBeTrue();
    expect(document.activeElement).toBe(band('.ler-tela-cheia'));
    band('.ver-cartolina').click();
    await settle();
    q<HTMLButtonElement>('.na-parede .fecha')!.click();
    await settle();
    expect(dialog().open).toBeFalse();
    // o fundo: o toque que começa e acaba nele
    fixture.componentInstance.open(note('n-1', 'Mercado'));
    await settle();
    band('.ver-cartolina').click();
    await settle();
    const wall = q('.na-parede')!;
    wall.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    wall.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(dialog().open).toBeFalse();
  });

  it('a ficha cresce até 1,8 vez a da parede, e encolhe só para caber inteira', async () => {
    expect(cardZoomFor(400, 400, 1300, 900)).toBe(CARD_ZOOM_MAX);
    expect(cardZoomFor(330, 400, 358, 700)).toBe(1.08);
    expect(cardZoomFor(400, 1000, 1300, 700)).toBe(0.7);
    expect(cardZoomFor(400, 4000, 1300, 700)).toBe(CARD_ZOOM_MIN);
    expect(cardZoomFor(0, 0, 1300, 700)).toBe(1);
    // na tela: a medida da ficha cabe na janela
    fixture.componentInstance.open(note('n-1', 'Mercado', { text: LONG }));
    await settle();
    band('.ver-cartolina').click();
    await settle();
    await wait(100);
    fixture.detectChanges();
    await wait(50);
    const box = q('.cartolina-grande')!.getBoundingClientRect();
    expect(box.height).toBeLessThanOrEqual(innerHeight);
    expect(box.width).toBeLessThanOrEqual(document.documentElement.clientWidth);
  });

  it('cada ficha abre na leitura de sempre, e o Esc fecha de qualquer jeito', async () => {
    fixture.componentInstance.open(note('n-1', 'Mercado'));
    await settle();
    band('.ler-tela-cheia').click();
    await settle();
    const esc = new Event('cancel', { cancelable: true });
    dialog().dispatchEvent(esc);
    expect(esc.defaultPrevented).toBeFalse();
    await new Promise((res) => {
      dialog().addEventListener('close', res, { once: true });
      dialog().close();
    });
    await settle();
    fixture.componentInstance.open(note('n-2', 'Feira'));
    await settle();
    expect(dialog().classList.contains('tela-cheia')).toBeFalse();
    expect(q('.top')).not.toBeNull();
    // abrir outra ficha por cima da cartolina também volta à leitura
    band('.ver-cartolina').click();
    await settle();
    fixture.componentInstance.open(note('n-3', 'Outra'));
    await settle();
    expect(dialog().classList.contains('so-a-cartolina')).toBeFalse();
    expect(q('.na-parede')).toBeNull();
  });

  it('sem texto, não há tela cheia (seria só o nome); e as setas só viram as vezes na leitura de sempre', async () => {
    fixture.componentInstance.open(note('n-1', 'Só o título', { text: '' }));
    await settle();
    expect(q('.faixa-nome .ler-tela-cheia')).toBeNull();
    expect(q('.faixa-nome .ver-cartolina')).not.toBeNull();
    band('.ver-cartolina').click();
    await settle();
    expect(q('.na-parede .ler-tela-cheia')).toBeNull();
    expect(qa('.na-parede .vistas-giz button').map((b) => b.getAttribute('aria-label'))).toEqual(['Voltar à leitura', 'Fechar']);
    fixture.componentInstance.close();
    await settle();
    // uma obra jogada duas vezes: na cartolina, a seta não troca a ficha sem dizer
    const original = review('r-hades', 'Hades');
    const revisit = review('r-hades-2', 'Hades', { revisitOf: 'r-hades', completedAt: '2026-02-01' });
    fixture.componentInstance.open(original, 'Ana', [original, revisit]);
    await settle();
    band('.ver-cartolina').click();
    await settle();
    dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await settle();
    expect(q('.na-parede app-review-card')?.getAttribute('data-cor')).toBeTruthy();
    q<HTMLButtonElement>('.na-parede .ver-cartolina')!.click();
    await settle();
    expect(q('.vez-nome')?.textContent).toBe('Original');
    dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await settle();
    expect(q('.vez-nome')?.textContent).toBe('Rejogada');
  });

  it('pelo link, o PDF no lugar do "só a cartolina" (a página tem o minimizar dela); o Esc sai da tela cheia e não fecha', async () => {
    fixture.componentInstance.openLoose(review('r-hades', 'Hades'), 'Ana', [], 'ANA', false);
    await settle();
    expect(q('.faixa-nome .ver-cartolina')).toBeNull();
    expect(qa('.faixa-nome button').map((b) => b.getAttribute('aria-label'))).toEqual(['Salvar como PDF', 'Ler em tela cheia', 'Minimizar: ver como fica no mural']);
    band('.ler-tela-cheia').click();
    await settle();
    expect(dialog().classList.contains('tela-cheia')).toBeTrue();
    expect(q('.assinatura')).toBeNull();
    const esc = new Event('cancel', { cancelable: true });
    dialog().dispatchEvent(esc);
    await settle();
    expect(esc.defaultPrevented).toBeTrue();
    expect(dialog().open).toBeTrue();
    expect(dialog().classList.contains('tela-cheia')).toBeFalse();
    expect(q('.assinatura')).not.toBeNull();
  });
});
