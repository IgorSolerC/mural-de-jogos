import { provideZonelessChangeDetection, signal } from '@angular/core';
import { SPEECH } from '../core/voz';
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
        // sem voz: a faixa é a de sempre em qualquer máquina (ouvir a nota tem o spec dele, voz-fita.spec)
        { provide: SPEECH, useValue: null },
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

  it('na faixa, antes do X, só o "Ver só a cartolina": a leitura já é a tela cheia (PLANO-LEITURA-UNIFICADA.md, D1)', async () => {
    fixture.componentInstance.open(note('n-1', 'Mercado'));
    await settle();
    const buttons = qa('.faixa-nome button');
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Ver só a cartolina', 'Fechar']);
    expect(band('.ver-cartolina').title).toBe('Ver só a cartolina');
    expect(q('.ler-tela-cheia')).toBeNull();
    // menor que o X: só muda o jeito de ver
    expect(band('.ver-cartolina').querySelector('svg')!.getAttribute('width')).toBe('16');
    expect(band('.fecha').querySelector('svg')!.getAttribute('width')).toBe('22');
    expect(q('.faixa-nome .vistas')?.getAttribute('role')).toBe('group');
  });

  it('a leitura tem a faixa fina, a letra e a pauta da tela cheia de antes, e o pé fino com o trilho', async () => {
    fixture.componentInstance.open(note('n-1', 'Mercado', { category: 'Casa', tags: ['Feira'], doneAt: '2026-01-02T00:00:00.000Z' }));
    await settle();
    expect(dialog().classList.contains('lendo')).toBeTrue();
    expect(q('.foot')).not.toBeNull();
    expect(q('.trilho')).not.toBeNull();
    expect(q('.carimbo app-done-stamp')).not.toBeNull();
    // a letra da anotação é 6% menor: a escala do papel "texto da anotação", --e-texto-nota em styles.scss
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const nota = 0.94;
    expect(innerWidth).toBeGreaterThan(600);
    expect(parseFloat(getComputedStyle(q('.text')!).fontSize)).toBeCloseTo(1.24 * rem * nota, 1);
    expect(parseFloat(getComputedStyle(q('.text')!).lineHeight)).toBeCloseTo(1.95 * rem, 1);
    // a faixa fina, com os botões do mesmo tamanho, inteiros dentro dela
    const faixa = q('.faixa-nome')!.getBoundingClientRect();
    expect(faixa.height).toBeLessThanOrEqual(48);
    for (const b of qa('.faixa-nome .icon-btn')) {
      const r = b.getBoundingClientRect();
      expect(r.height).toBeCloseTo(44, 0);
      expect(r.top).toBeGreaterThanOrEqual(faixa.top);
      expect(r.bottom).toBeLessThanOrEqual(faixa.bottom);
    }
    // o pé fino: os botões de 34px (no mouse), o Editar na tinta de sempre
    expect(q('.foot .btn-ink')!.getBoundingClientRect().height).toBeCloseTo(34, 0);
    // (abaixo de 900px o trilho deita no pé, com as etiquetas de 40px)
    expect(q('.foot')!.getBoundingClientRect().height).toBeLessThanOrEqual(innerWidth >= 900 ? 48 : 56);
  });

  it('a folha é a coluna do texto com 1cm de papel de cada lado (deixando o lugar do trilho), e só da altura dele', async () => {
    const cm = 96 / 2.54;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const wide = document.head.appendChild(document.createElement('style'));
    try {
      fixture.componentInstance.open(note('n-1', 'Mercado'));
      await settle();
      // o celular (até 600px) é a página inteira; aqui, a janela do teste é o computador
      expect(innerWidth).toBeGreaterThan(600);
      const sheet = () => q('.par > .ficha')!.getBoundingClientRect();
      const text = () => q('.body .text')!.getBoundingClientRect();
      // a pauta a 1cm das duas beiradas
      expect(text().left - sheet().left).toBeCloseTo(cm, 0);
      expect(sheet().right - text().right).toBeCloseTo(cm, 0);
      // a folha enche a tela até o teto da coluna mais as margens; de 900px, menos o lugar do trilho dos dois lados
      const room = innerWidth >= 900 ? innerWidth - 244 : innerWidth - 48;
      expect(dialog().getBoundingClientRect().width).toBeCloseTo(Math.min(room, 52 * rem + 2 * cm), 0);
      // o trilho cabe na tela, de pé na beirada direita
      if (innerWidth >= 900) expect(q('.trilho')!.getBoundingClientRect().right).toBeLessThanOrEqual(innerWidth);
      // o nome começa onde começa a letra (a margem e a folga de 8px da pauta)
      expect(parseFloat(getComputedStyle(q('.faixa-nome')!).paddingLeft)).toBeCloseTo(cm + 8, 0);
      // a nota curta: a folha tem a altura do texto (e do pé), longe da tela inteira
      const faixa = q('.faixa-nome')!.getBoundingClientRect().height;
      const pe = q('.foot')!.getBoundingClientRect().height;
      // (de 900px, a folha curta fica alta o bastante para o trilho de pé)
      const natural = faixa + 28 + text().height + 36 + pe;
      expect(sheet().height).toBeCloseTo(innerWidth >= 900 ? Math.max(natural, Math.min(340, innerHeight - 24)) : natural, 0);
      expect(q('.body')!.scrollHeight).toBeLessThanOrEqual(q('.body')!.clientHeight);

      // numa tela larga, a folha não cresce além da coluna: as margens continuam de 1cm
      wide.textContent = 'dialog.reader.lendo { --medida: 20rem !important; }';
      await settle();
      expect(text().left - sheet().left).toBeCloseTo(cm, 0);
      expect(sheet().right - text().right).toBeCloseTo(cm, 0);
      expect(text().width).toBeCloseTo(20 * rem, 0);
    } finally {
      wide.remove();
    }
  });

  it('com a seta de volta de um link, a seta fica na margem e o nome perto da letra do texto', async () => {
    fixture.componentInstance.open(note('n-mercado', 'Mercado'), null, [], false, null, note('n-tudo', 'Lista de tudo'));
    await settle();
    const sheet = q('.par > .ficha')!.getBoundingClientRect();
    const arrow = q('.faixa-nome .voltar-elo')!.getBoundingClientRect();
    const title = q('#leitura-titulo')!.getBoundingClientRect();
    const letter = q('.body .text')!.getBoundingClientRect().left + 8;
    expect(arrow.left - sheet.left).toBeGreaterThanOrEqual(0);
    expect(arrow.left - sheet.left).toBeLessThanOrEqual(8);
    expect(Math.abs(title.left - letter)).toBeLessThanOrEqual(8);
  });

  it('o texto comprido vai até a tela (menos 24px em cima e embaixo) e rola por dentro', async () => {
    fixture.componentInstance.open(note('n-longa', 'Diário', { text: LONG }));
    await settle();
    const sheet = q('.par > .ficha')!.getBoundingClientRect();
    expect(sheet.height).toBeCloseTo(innerHeight - 48, 0);
    expect(q('.body')!.scrollHeight).toBeGreaterThan(q('.body')!.clientHeight);
  });

  it('a análise fica na folha larga com tudo o que ela é: a capa, a nota, o boletim e o texto', async () => {
    fixture.componentInstance.open(review('r-hades', 'Hades'));
    await settle();
    expect(dialog().classList.contains('lendo')).toBeTrue();
    expect(q('app-boletim')).not.toBeNull();
    expect(q('app-judge-label')).not.toBeNull();
    expect(q('.body .text')?.textContent).toContain('Valeu cada hora');
    // a resenha não tem Detalhes (PLANO-LEITURA-UNIFICADA.md, D8)
    expect(q('.etq-trilho[data-trilho="detalhes"]')).toBeNull();
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
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Voltar à leitura', 'Fechar']);
    expect(document.activeElement).toBe(buttons[0]);
    // tocar na ficha volta à leitura, com o foco no botão que a mostra de novo
    card.querySelector<HTMLButtonElement>('.hit')!.click();
    await settle();
    expect(dialog().classList.contains('so-a-cartolina')).toBeFalse();
    expect(q('.na-parede')).toBeNull();
    expect(getComputedStyle(q('.par')!).display).not.toBe('none');
    expect(document.activeElement).toBe(band('.ver-cartolina'));
  });

  it('da cartolina, o voltar e o fechar; e o toque no escuro em volta fecha', async () => {
    fixture.componentInstance.open(note('n-1', 'Mercado'));
    await settle();
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

  it('cada ficha abre na leitura, e o Esc fecha', async () => {
    fixture.componentInstance.open(note('n-1', 'Mercado'));
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
    expect(dialog().classList.contains('lendo')).toBeTrue();
    expect(q('.foot')).not.toBeNull();
    // abrir outra ficha por cima da cartolina também volta à leitura
    band('.ver-cartolina').click();
    await settle();
    fixture.componentInstance.open(note('n-3', 'Outra'));
    await settle();
    expect(dialog().classList.contains('so-a-cartolina')).toBeFalse();
    expect(q('.na-parede')).toBeNull();
  });

  it('sem texto, a cartolina tem o voltar e o fechar; e as setas só viram as vezes na leitura', async () => {
    fixture.componentInstance.open(note('n-1', 'Só o título', { text: '' }));
    await settle();
    expect(q('.faixa-nome .ver-cartolina')).not.toBeNull();
    band('.ver-cartolina').click();
    await settle();
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

  it('pelo link, o minimizar no lugar do "só a cartolina" (a página mostra a ficha no mural); o Esc não fecha', async () => {
    fixture.componentInstance.openLoose(review('r-hades', 'Hades'), 'Ana', [], 'ANA', false);
    await settle();
    expect(q('.faixa-nome .ver-cartolina')).toBeNull();
    expect(qa('.faixa-nome button').map((b) => b.getAttribute('aria-label'))).toEqual(['Minimizar: ver como fica no mural']);
    expect(q('.assinatura')).not.toBeNull();
    const esc = new Event('cancel', { cancelable: true });
    dialog().dispatchEvent(esc);
    await settle();
    expect(esc.defaultPrevented).toBeTrue();
    expect(dialog().open).toBeTrue();
    expect(q('.assinatura')).not.toBeNull();
  });
  /**
   * Onde cada linha cai: as linhas de texto (fora dos cards, que ficam em meia linha de propósito) a partir
   * do alto da pauta, em linhas; e a altura delas, em linhas. Tudo tem de dar número inteiro.
   */
  function ruling(): { line: number; off: { what: string; top: number; height: number }[] } {
    const box = q('.text[data-citavel]')!;
    const s = getComputedStyle(box);
    const line = parseFloat(s.lineHeight);
    const top0 = box.getBoundingClientRect().top + parseFloat(s.paddingTop);
    // a descida da letra (só se vê) fora da conta: a pauta é o lugar das linhas no layout
    box.style.setProperty('--texto-desce', '0px');
    const off = qa('.text[data-citavel] .linha')
      .filter((e) => !e.closest('.cartao, app-note-widget') && !e.matches('.cartao-topo'))
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { what: (e.textContent ?? '').trim().slice(0, 24), top: (r.top - top0) / line, height: r.height / line };
      });
    box.style.removeProperty('--texto-desce');
    return { line, off };
  }

  it('na leitura, nada tira o texto da pauta: o código, o sutil e as marcas na linha, o bloco de código e a tabela', async () => {
    const F = '```';
    const text = [
      '# Apple',
      '1. Inserir no banco de **PROD**',
      '   1.1. Verificar a tabela VersoesApp (==1 = App; 3 = Totem==)',
      '   1.2. Inserir a linha ((mude o 0.0.0 para a versão))',
      '   ' + F + 'sql',
      "   INSERT INTO VersoesApp VALUES ('0.0.0', getdate(), 0, 0, 1, 'uma linha bem comprida que passa da folha de um lado ao outro')",
      '   ' + F,
      '',
      '2. Conectar na VM',
      '   2.1. Aumentar a versão no `pubspec.yaml`',
      '   2.2. Rodar `source ~/.zshrc` na pasta `pontodigital/Front/AppFlutter/app_flutter`',
      '-# Preços de outubro, podem mudar.',
      'Com [[Mercado]], [o site](https://example.com), ||segredo|| e emoji 🎮 e kanji 漢字.',
      '| a | b | c | d | e | f | g | h | i | j | k | l | m | n | o | p | q | r | s |',
      '| - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |',
      '| um | dois | três | quatro | cinco | seis | sete | oito | nove | dez | onze | doze | treze | catorze | quinze | dezesseis | dezessete | dezoito | dezenove |',
      'Depois da tabela.',
      'A última.',
    ].join('\n');
    // a barra de rolar que ocupa lugar (a do Windows), do mesmo tamanho em toda máquina de teste
    const bars = document.head.appendChild(document.createElement('style'));
    bars.textContent = '.codigo, .tabela-rolo { scrollbar-width: auto !important; scrollbar-color: auto !important; } .codigo::-webkit-scrollbar, .tabela-rolo::-webkit-scrollbar { height: 12px; background: #ccc; }';
    try {
      fixture.componentInstance.open(note('n-pauta', 'Publicar versão', { text }));
      await settle();
      for (const view of ['leitura']) {
        await wait(50);
        const { off } = ruling();
        expect(off.length).toBeGreaterThan(10);
        for (const o of off) {
          expect(Math.abs(o.top - Math.round(o.top))).withContext(`${view}: alto de "${o.what}" (${o.top.toFixed(3)} linhas)`).toBeLessThan(0.03);
          expect(Math.abs(o.height - Math.round(o.height))).withContext(`${view}: altura de "${o.what}" (${o.height.toFixed(3)} linhas)`).toBeLessThan(0.03);
        }
        // a barra da tabela fica numa linha só dela, e ocupa lugar (sem ela, a conta acima não provaria nada)
        const tabela = q('.tabela-rolo')!;
        expect(tabela.scrollWidth).withContext(`${view}: a tabela rola de lado`).toBeGreaterThan(tabela.clientWidth);
        expect(tabela.offsetHeight - tabela.clientHeight).withContext(`${view}: a barra da tabela`).toBeGreaterThan(5);
        expect(parseFloat(getComputedStyle(tabela).getPropertyValue('--sobra-barra'))).withContext(`${view}: a sobra da tabela`).toBeGreaterThan(0);
        // a do código é a fina desenhada, por cima do pé da última linha: a de verdade não ocupa nada
        const codigo = q('.codigo')!;
        expect(codigo.scrollWidth).withContext(`${view}: o código rola de lado`).toBeGreaterThan(codigo.clientWidth);
        expect(codigo.offsetHeight - codigo.clientHeight).withContext(`${view}: sem a barra de verdade no código`).toBe(0);
      }
    } finally {
      bars.remove();
    }
  });
});
