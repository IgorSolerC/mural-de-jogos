import { WritableSignal, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Cloud } from '../core/cloud-config';
import { CloudAccount } from '../core/cloud-account';
import { LocalData } from '../core/local-data';
import { Review, sanitizeReview } from '../core/review';
import { SHARED_AUTO } from '../core/shared-store';
import { SPEECH, UTTERANCE, VOZ_KEY, Voz } from '../core/voz';
import { FakeSpeech, GOOGLE_JA, GOOGLE_PT, fakeUtterance } from '../testing/fala-falsa';
import { ICON } from './icons';
import { ReviewReader } from './review-reader';
import { VOICE_HIGHLIGHT } from './voz-fita';

/**
 * Ouvir a nota (PLANO-VOZ.md) na ficha aberta: o botão na faixa, o menu das três línguas, a fita ao pé da
 * folha, o marca-texto, o tocar numa frase, e a leitura que acaba quando a ficha fecha, outra abre ou a
 * vista vira só a cartolina. Na visita, o mesmo (a ficha aberta é a mesma peça).
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

function note(id: string, name: string, text: string): Review {
  return sanitizeReview({
    id,
    kind: 'anotacoes',
    game: { name, coverUrl: null, source: 'manual' },
    scores: { final: 0 },
    status: 'jogando',
    difficulty: 'nenhuma',
    verdict: null,
    text,
    completedAt: null,
    createdAt: '2026-11-17T00:00:00.000Z',
    updatedAt: '2026-11-17T00:00:00.000Z',
  })!;
}

const NO = ['> [!estudo] USOS', '> 1. 私**==の==**ケーキです。', '>   ((É o meu bolo.))', '> 2. あなた**==の==**コーヒーはどこですか？', '>   ((Cadê o seu café?))'].join('\n');

describe('Ouvir a nota na ficha aberta', () => {
  let fixture: ComponentFixture<ReviewReader>;
  let el: HTMLElement;
  let fake: FakeSpeech;
  let still: HTMLStyleElement;

  beforeEach(() => {
    localStorage.clear();
    still = document.head.appendChild(document.createElement('style'));
    still.textContent = '*, *::backdrop { animation: none !important; transition: none !important; }';
    fake = new FakeSpeech();
    fake.list = [GOOGLE_PT, GOOGLE_JA];
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: LocalData, useClass: MemoryData },
        { provide: SHARED_AUTO, useValue: false },
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: signal({ api: 'https://api.teste', googleClientId: 'x' }) } },
        { provide: CloudAccount, useValue: { account: signal(null), signedIn: signal(false), request: async () => ({}) } },
        { provide: SPEECH, useValue: fake },
        { provide: UTTERANCE, useValue: fakeUtterance },
      ],
    });
    fixture = TestBed.createComponent(ReviewReader);
    el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    fixture.detectChanges();
  });

  afterEach(() => {
    const d = el.querySelector('dialog');
    if (d?.open) fixture.componentInstance.close();
    document.querySelectorAll('.menu-contexto').forEach((m) => (m as HTMLElement).hidePopover?.());
    el.remove();
    still.remove();
    localStorage.removeItem(VOZ_KEY);
    localStorage.clear();
  });

  const q = <T extends HTMLElement>(selector: string) => el.querySelector<T>(selector);
  const wait = (ms = 0) => new Promise((res) => setTimeout(res, ms));
  async function settle(): Promise<void> {
    await wait();
    fixture.detectChanges();
    await fixture.whenStable();
    await wait();
  }
  const texts = () => fake.queue.map((u) => u.text);
  /** Toca no botão de ouvir e escolhe a língua no menu. */
  async function listen(lang: 'pt' | 'en' | 'ja'): Promise<void> {
    q<HTMLButtonElement>('.faixa-nome .ouvir')!.click();
    await settle();
    document.querySelector<HTMLButtonElement>(`.menu-contexto [data-k="${lang}"]`)!.click();
    await settle();
  }

  it('o botão fica na faixa, antes dos jeitos de ver, com o desenho dos fones; sem voz no navegador, não aparece', async () => {
    fixture.componentInstance.open(note('n-1', 'の (De / Posse)', NO));
    await settle();
    const labels = [...el.querySelectorAll<HTMLElement>('.faixa-nome button')].map((b) => b.getAttribute('aria-label'));
    expect(labels).toEqual(['Ouvir a nota', 'Ver só a cartolina', 'Fechar']);
    expect(q('.faixa-nome .ouvir')!.getAttribute('aria-haspopup')).toBe('menu');
    fake.setVoices([]);
    await settle();
    expect(q('.faixa-nome .ouvir')).toBeNull();
  });

  it('sem texto, não há o que ouvir', async () => {
    fixture.componentInstance.open(note('n-1', 'Só o título', ''));
    await settle();
    expect(q('.faixa-nome .ouvir')).toBeNull();
  });

  it('o texto todo num spoiler fechado: as línguas ficam apagadas dizendo por quê (o nome sozinho não conta)', async () => {
    fixture.componentInstance.open(note('n-1', 'Final do livro', '||o vilão era o pai||'));
    await settle();
    q<HTMLButtonElement>('.faixa-nome .ouvir')!.click();
    await settle();
    const items = [...document.querySelectorAll<HTMLButtonElement>('.menu-contexto [data-k]')];
    expect(items.every((b) => b.disabled)).toBeTrue();
    expect(items[0].title).toContain('Não há texto à mostra');
  });

  it('o menu mostra sempre as três línguas; a sem voz neste navegador fica apagada', async () => {
    fixture.componentInstance.open(note('n-1', 'の (De / Posse)', NO));
    await settle();
    q<HTMLButtonElement>('.faixa-nome .ouvir')!.click();
    await settle();
    const items = [...document.querySelectorAll<HTMLButtonElement>('.menu-contexto [data-k]')];
    expect(items.map((b) => [b.dataset['k'], b.textContent!.trim(), b.disabled])).toEqual([
      ['pt', 'Português', false],
      ['en', 'Inglês', true],
      ['ja', 'Japonês', false],
    ]);
  });

  it('escolher o Japonês lê o nome e depois o texto, sem as marcas, e a fita aparece ao pé da folha', async () => {
    fixture.componentInstance.open(note('n-1', 'の (De / Posse)', NO));
    await settle();
    await listen('ja');
    expect(texts()).toEqual(['の (De / Posse)', 'USOS', '私のケーキです。', 'É o meu bolo.', 'あなたのコーヒーはどこですか？', 'Cadê o seu café?']);
    expect(fake.queue[0].voice).toBe(GOOGLE_JA);
    expect(q('.body > app-voz-fita .fita')).not.toBeNull();
    expect(q('.fita .lingua-nome')!.textContent!.trim()).toBe('Japonês');
    expect(q('.fita .contagem')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('1 / 6');
    expect(q('.faixa-nome .ouvir')!.classList).toContain('ligado');
  });

  it('a frase que começa ganha o marca-texto; pausar e continuar pelas teclas', async () => {
    fixture.componentInstance.open(note('n-1', 'の (De / Posse)', NO));
    await settle();
    await listen('ja');
    fake.end();
    fake.end();
    fake.begin();
    await settle();
    expect([...(CSS.highlights.get(VOICE_HIGHLIGHT) as Highlight)].map((r) => r.toString()).join('')).toBe('私のケーキです。');
    expect(q('.fita .contagem')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('3 / 6');
    q<HTMLButtonElement>('.fita .tecla-tocar')!.click();
    await settle();
    expect(fake.queue).toEqual([]);
    expect(q('.fita .tecla-tocar')!.getAttribute('aria-label')).toBe('Ouvir');
    q<HTMLButtonElement>('.fita .tecla-tocar')!.click();
    await settle();
    expect(texts()[0]).toBe('私のケーキです。');
  });

  it('o título de um flashcard que toma a voz (core/voz.ts, sayTitle) leva o marca-texto da nota junto', async () => {
    fixture.componentInstance.open(note('n-1', 'の (De / Posse)', NO));
    await settle();
    await listen('ja');
    fake.begin();
    await settle();
    expect(CSS.highlights.get(VOICE_HIGHLIGHT)).toBeDefined();
    TestBed.inject(Voz).sayTitle('日', 'ja', 'nsol');
    await settle();
    expect(CSS.highlights.get(VOICE_HIGHLIGHT)).toBeUndefined();
    expect(q('.fita')).toBeNull();
  });

  it('a velocidade: as seis à vista num menu, a de agora com o tique', async () => {
    fixture.componentInstance.open(note('n-1', 'の (De / Posse)', NO));
    await settle();
    await listen('ja');
    q<HTMLButtonElement>('.fita .velocidade')!.click();
    await settle();
    const items = [...document.querySelectorAll<HTMLButtonElement>('.menu-contexto [data-k]')];
    expect(items.map((b) => b.querySelector('.nome')!.textContent!.trim())).toEqual(['0,25×', '0,5×', '0,75×', '1×', '1,25×', '1,5×']);
    expect(items.map((b) => b.querySelector('.marcada') !== null)).toEqual([false, false, false, true, false, false]);
    items[2].click();
    await settle();
    expect(q('.fita .velocidade')!.textContent!.trim()).toBe('0,75×');
    expect(fake.queue[0].rate).toBe(0.75);
  });

  it('devagar, as falas ficam mais curtas: a frase de agora se parte e a leitura segue dela', async () => {
    const long = 'Depois vem uma frase mais comprida, que passa das quarenta letras e se parte devagar.';
    fixture.componentInstance.open(note('n-1', 'Devagar', `Uma frase curta. ${long}`));
    await settle();
    await listen('pt');
    expect(texts()).toEqual(['Devagar', 'Uma frase curta.', long]);
    for (let i = 0; i < 2; i++) {
      fake.begin();
      fake.end();
    }
    fake.begin();
    await settle();
    q<HTMLButtonElement>('.fita .velocidade')!.click();
    await settle();
    document.querySelectorAll<HTMLButtonElement>('.menu-contexto [data-k]')[0].click();
    await settle();
    expect(q('.fita .velocidade')!.textContent!.trim()).toBe('0,25×');
    expect(texts().length).toBeGreaterThan(2);
    expect(texts().every((t) => t.length <= 40)).toBeTrue();
    expect(texts().join(' ')).toBe(long);
    expect(fake.queue.every((u) => u.rate === 0.25)).toBeTrue();
    // de volta a 1×, a mesma frase inteira de novo, do pedaço onde estava
    q<HTMLButtonElement>('.fita .velocidade')!.click();
    await settle();
    document.querySelectorAll<HTMLButtonElement>('.menu-contexto [data-k]')[3].click();
    await settle();
    expect(texts()).toEqual([long]);
  });

  // ===== os atalhos (PLANO-VOZ-ESTUDO.md, feature 1) =====
  /** Aperta a tecla em `on` (por padrão, no texto da ficha), como o teclado: desce e sobe. */
  function key(k: string, on: Element = q('.text')!, extra: KeyboardEventInit = {}): KeyboardEvent {
    const down = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra });
    on.dispatchEvent(down);
    on.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true, cancelable: true, ...extra }));
    return down;
  }
  const said = () => q('.fita [aria-live]')!.textContent!.trim();

  it('← e → andam as frases como as teclas da chapa, que afundam um instante; nas pontas, nada', async () => {
    fixture.componentInstance.open(note('n-1', 'の (De / Posse)', NO));
    await settle();
    await listen('ja');
    fake.begin();
    key('ArrowLeft');
    await settle();
    expect(texts()[0]).withContext('na primeira, a anterior não faz nada').toBe('の (De / Posse)');
    expect(fake.queue[0].onstart).toBeDefined();
    expect(q('.fita .tecla[aria-keyshortcuts="ArrowLeft"]')!.classList).not.toContain('baixa');
    expect(key('ArrowRight').defaultPrevented).toBeTrue();
    await settle();
    expect(texts()[0]).toBe('USOS');
    expect(q('.fita .tecla[aria-keyshortcuts="ArrowRight"]')!.classList).toContain('baixa');
    await wait(200);
    await settle();
    expect(q('.fita .tecla[aria-keyshortcuts="ArrowRight"]')!.classList).not.toContain('baixa');
    key('ArrowRight');
    key('ArrowRight');
    key('ArrowLeft');
    await settle();
    expect(texts()[0]).toBe('私のケーキです。');
    expect(q('.fita .contagem')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('3 / 6');
    // pausado, também: a frase fica marcada para continuar dela
    key(' ');
    key('ArrowRight');
    await settle();
    expect(fake.queue).toEqual([]);
    expect(q('.fita .contagem')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('4 / 6');
    for (let i = 0; i < 4; i++) key('ArrowRight');
    await settle();
    expect(q('.fita .contagem')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('6 / 6');
  });

  it('Espaço pausa e continua, mesmo com o foco num botão da fita (que não é apertado junto)', async () => {
    fixture.componentInstance.open(note('n-1', 'の (De / Posse)', NO));
    await settle();
    await listen('ja');
    expect(key(' ').defaultPrevented).toBeTrue();
    await settle();
    expect(fake.queue).toEqual([]);
    expect(q('.fita .tecla-tocar')!.getAttribute('aria-label')).toBe('Ouvir');
    key(' ');
    await settle();
    expect(texts()[0]).toBe('の (De / Posse)');
    // o foco na "próxima" (o mouse clicou nela): o Espaço pausa, não avança de novo
    const next = q<HTMLButtonElement>('.fita .tecla[aria-keyshortcuts="ArrowRight"]')!;
    next.focus();
    const up = new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true });
    next.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    next.dispatchEvent(up);
    expect(up.defaultPrevented).withContext('a subida do Espaço é da fita').toBeTrue();
    await settle();
    expect(fake.queue).toEqual([]);
    expect(q('.fita .contagem')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('1 / 6');
    // segurar o Espaço não fica pausando e continuando
    key(' ', q('.text')!, { repeat: true });
    await settle();
    expect(fake.queue).toEqual([]);
  });

  it('o card que fecha com o foco fica com o Espaço dele (a leitura não pausa)', async () => {
    fixture.componentInstance.open(note('n-1', 'Card', ['Antes.', '', '> [!aviso]- Fechado', '> Dentro.'].join('\n')));
    await settle();
    await listen('pt');
    const summary = q<HTMLElement>('.text summary')!;
    summary.focus();
    expect(key(' ', summary).defaultPrevented).toBeFalse();
    await settle();
    expect(fake.queue.length).toBeGreaterThan(0);
    // o botão da fita com o foco, não: o Espaço pausa
    q<HTMLButtonElement>('.fita .velocidade')!.focus();
    expect(key(' ', q('.fita .velocidade')!).defaultPrevented).toBeTrue();
  });

  it('o botão fora do texto que o teclado trouxe (com o anel) fica com o Espaço; o que o mouse clicou deixa pausar', async () => {
    // o anel do foco (:focus-visible) é do navegador: aqui, o que ele diria vem do teste
    let ring = true;
    const matches = Element.prototype.matches;
    spyOn(Element.prototype, 'matches').and.callFake(function (this: Element, s: string) {
      return s === ':focus-visible' ? ring : matches.call(this, s);
    });
    fixture.componentInstance.open(note('n-1', 'Card', 'Uma frase. Outra frase.'));
    await settle();
    await listen('pt');
    const look = q<HTMLButtonElement>('.faixa-nome button[aria-label="Ver só a cartolina"]')!;
    look.focus();
    expect(key(' ', look).defaultPrevented).withContext('pelo teclado, o Espaço aperta o botão').toBeFalse();
    await settle();
    expect(fake.queue.length).withContext('a leitura segue').toBeGreaterThan(0);
    // o mesmo botão clicado com o mouse (sem anel): o Espaço pausa
    look.blur();
    ring = false;
    look.focus();
    expect(key(' ', look).defaultPrevented).toBeTrue();
    await settle();
    expect(fake.queue).toEqual([]);
    // o Ouvir da faixa é da voz: com o anel, o Espaço continua a leitura (não reabre o menu das línguas)
    const ouvir = q<HTMLButtonElement>('.faixa-nome .ouvir')!;
    ouvir.blur();
    ring = true;
    ouvir.focus();
    expect(key(' ', ouvir).defaultPrevented).toBeTrue();
    await settle();
    expect(fake.queue.length).toBeGreaterThan(0);
  });

  it('o card do texto da outra nota fica com o Espaço mesmo clicado; o link fora do texto, não (o Espaço não o aperta)', async () => {
    spyOn(Element.prototype, 'matches').and.callThrough().withArgs(':focus-visible').and.returnValue(false);
    fixture.componentInstance.open(note('n-1', 'Card', 'Uma frase. Outra frase.'));
    await settle();
    await listen('pt');
    // a outra anotação, lado a lado: o texto dela também é texto de nota
    const other = document.body.appendChild(document.createElement('app-rich-text'));
    other.innerHTML = '<details><summary>Fechado</summary>Dentro.</details><a href="#x">link</a>';
    const link = document.body.appendChild(document.createElement('a'));
    link.href = '#y';
    link.textContent = 'fora';
    try {
      const summary = other.querySelector('summary')!;
      summary.focus();
      expect(key(' ', summary).defaultPrevented).withContext('o card da outra nota').toBeFalse();
      link.focus();
      expect(key(' ', link).defaultPrevented).withContext('o link fora do texto: pausa').toBeTrue();
    } finally {
      other.remove();
      link.remove();
    }
  });

  it('↑ e ↓ trocam a velocidade, um passo por vez, até as pontas; o leitor de tela ouve a nova', async () => {
    fixture.componentInstance.open(note('n-1', 'の (De / Posse)', NO));
    await settle();
    await listen('ja');
    key('ArrowUp');
    await settle();
    expect(q('.fita .velocidade')!.textContent!.trim()).toBe('1,25×');
    expect(q('.fita .velocidade')!.getAnimations().length).withContext('a etiqueta acende').toBe(1);
    expect(said()).toBe('Velocidade 1,25×.');
    expect(fake.queue[0].rate).toBe(1.25);
    key('ArrowUp');
    key('ArrowUp');
    await settle();
    expect(q('.fita .velocidade')!.textContent!.trim()).toBe('1,5×');
    expect(said()).toBe('1,5×: a mais rápida.');
    expect(q('.fita .velocidade')!.getAnimations().length).withContext('na ponta, ela balança').toBeGreaterThan(0);
    for (let i = 0; i < 7; i++) key('ArrowDown');
    await settle();
    expect(q('.fita .velocidade')!.textContent!.trim()).toBe('0,25×');
    expect(said()).toBe('0,25×: a mais devagar.');
    expect(fake.queue.every((u) => u.rate === 0.25)).toBeTrue();
    expect(JSON.parse(localStorage.getItem(VOZ_KEY)!).rate).toBe(0.25);
  });

  it('as teclas não valem digitando, com Ctrl ou Shift, num menu aberto, numa folha por cima, nem sem a fita', async () => {
    fixture.componentInstance.open(note('n-1', 'の (De / Posse)', NO));
    await settle();
    // sem a fita, o Espaço e as setas são da página
    expect(key(' ').defaultPrevented).toBeFalse();
    await listen('ja');
    const dialog = q('dialog')!;
    const field = dialog.appendChild(document.createElement('input'));
    expect(key(' ', field).defaultPrevented).toBeFalse();
    expect(key('ArrowRight', field).defaultPrevented).toBeFalse();
    field.remove();
    const editable = dialog.appendChild(document.createElement('div'));
    editable.contentEditable = 'true';
    expect(key('ArrowLeft', editable).defaultPrevented).toBeFalse();
    editable.remove();
    expect(key('ArrowRight', q('.text')!, { ctrlKey: true }).defaultPrevented).toBeFalse();
    expect(key('ArrowRight', q('.text')!, { shiftKey: true }).defaultPrevented).toBeFalse();
    const sheet = dialog.appendChild(document.createElement('dialog'));
    const inside = sheet.appendChild(document.createElement('button'));
    expect(key(' ', inside).defaultPrevented).withContext('a folha por cima').toBeFalse();
    sheet.remove();
    // o menu da velocidade aberto: as setas andam nele
    q<HTMLButtonElement>('.fita .velocidade')!.click();
    await settle();
    const item = document.querySelector<HTMLButtonElement>('.menu-contexto [data-k]')!;
    key('ArrowDown', item);
    await settle();
    expect(q('.fita .velocidade')!.textContent!.trim()).toBe('1×');
    expect(texts()[0]).toBe('の (De / Posse)');
    // parou: as teclas voltam para a página
    document.querySelectorAll('.menu-contexto').forEach((m) => (m as HTMLElement).hidePopover?.());
    q<HTMLButtonElement>('.fita .parar')!.click();
    await settle();
    expect(key(' ').defaultPrevented).toBeFalse();
  });

  it('com a fita à mostra, as setas são dela, e não viram as vezes de uma obra rejogada', async () => {
    const base = { kind: 'jogos', scores: { historia: 8 }, status: 'finalizado', difficulty: 'nenhuma', verdict: null, text: 'Valeu cada hora.', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
    const original = sanitizeReview({ ...base, id: 'r-hades', game: { name: 'Hades', coverUrl: null, source: 'manual' }, completedAt: '2026-01-01' })!;
    const revisit = sanitizeReview({ ...base, id: 'r-hades-2', game: { name: 'Hades', coverUrl: null, source: 'manual' }, revisitOf: 'r-hades', completedAt: '2026-02-01' })!;
    fixture.componentInstance.open(original, 'Ana', [original, revisit]);
    await settle();
    expect(q('.vez-nome')?.textContent).toBe('Original');
    await listen('pt');
    key('ArrowRight', q('dialog')!);
    await settle();
    expect(q('.vez-nome')?.textContent).toBe('Original');
    expect(texts()[0]).toBe('Valeu cada hora.');
    q<HTMLButtonElement>('.fita .parar')!.click();
    await settle();
    key('ArrowRight', q('dialog')!);
    await settle();
    expect(q('.vez-nome')?.textContent).toBe('Rejogada');
  });

  // ===== o modo estudo (PLANO-VOZ-ESTUDO.md, feature 2) =====
  const hiddenWords = () => [...((CSS.highlights.get('voz-estudo') as Highlight | undefined) ?? [])].map((r) => (r as Range).toString());
  const scribbles = (where: string) => [...el.querySelectorAll<HTMLElement>(`${where} .voz-rabiscos > span`)];

  it('o modo estudo: o nome e o texto lidos viram rabisco, só a pontuação à mostra; tocar numa palavra revela a frase dela e de novo a esconde, sem mudar a frase lida', async () => {
    fixture.componentInstance.open(note('n-1', 'の (De / Posse)', NO));
    await settle();
    await listen('ja');
    const button = q<HTMLButtonElement>('.fita .estudo')!;
    /** O desenho da etiqueta: o olho aberto (o texto à mostra) ou fechado (escondido no rabisco). */
    const eye = () => q('.fita .estudo svg path')!.getAttribute('d');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(eye()).withContext('o olho aberto').toBe(ICON.ver[0][1]['d'] as string);
    expect(hiddenWords()).toEqual([]);
    button.click();
    await settle();
    expect(q('.fita .estudo')!.getAttribute('aria-pressed')).toBe('true');
    expect(eye()).withContext('o olho fechado').toBe(ICON.esconder[0][1]['d'] as string);
    expect(said()).toContain('o texto virou rabisco');
    expect(hiddenWords().slice(0, 9)).toEqual(['の', 'De', 'Posse', 'USOS', '私', 'の', 'ケーキ', 'です', 'É']);
    expect(hiddenWords().some((w) => /[。？()/]/.test(w))).toBeFalse();
    expect(scribbles('.faixa-nome').length).toBe(3);
    expect(scribbles('.text').length).toBeGreaterThan(10);
    expect(JSON.parse(localStorage.getItem(VOZ_KEY)!).estudo).toBeTrue();
    fake.begin();
    // 私 (a terceira frase lida: o nome, USOS, 私のケーキです): revelada inteira, e a leitura continua no nome, onde estava
    const watashi = scribbles('.text').find((b) => b.dataset['p'] === '2')!;
    const shape = q('.text')!.getBoundingClientRect().toJSON();
    watashi.click();
    await settle();
    expect(hiddenWords()).not.toContain('私');
    expect(hiddenWords()).not.toContain('ケーキ');
    expect(hiddenWords()).toContain('É');
    expect(hiddenWords()).toContain('コーヒー');
    expect(texts()[0]).toBe('の (De / Posse)');
    expect(q('.text')!.getBoundingClientRect().toJSON()).withContext('o texto não se mexe').toEqual(shape);
    // tocar de novo esconde outra vez, no mesmo lugar
    scribbles('.text').find((b) => b.dataset['p'] === '2')!.click();
    await settle();
    expect(hiddenWords()).toContain('私');
    expect(hiddenWords()).toContain('ケーキ');
    expect(q('.text')!.getBoundingClientRect().toJSON()).toEqual(shape);
    // tocar entre as palavras também não muda a frase (no modo estudo, o toque é para revelar)
    await wait(420);
    const line = [...el.querySelectorAll<HTMLElement>('.text .sutil, .text .enf')].find((e) => e.textContent!.includes('Cadê'))!;
    const box = line.getBoundingClientRect();
    line.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: box.right - 2, clientY: box.top + box.height / 2, button: 0 }));
    await settle();
    expect(texts()[0]).toBe('の (De / Posse)');
  });

  it('as dicas de primeira vez: os atalhos ao começar a ouvir e o tocar para revelar ao ligar o modo estudo, uma vez cada', async () => {
    fixture.componentInstance.open(note('n-1', 'の (De / Posse)', NO));
    await settle();
    await listen('ja');
    const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
    expect(q('.fita .dica')?.textContent?.replace(/\s+/g, '') ?? null).toBe(fine ? '←→frases·Espaçopausa·↑↓velocidade' : null);
    q<HTMLButtonElement>('.fita .estudo')!.click();
    await settle();
    expect(q('.fita .dica')!.textContent!.trim()).toBe('Toque numa frase para vê-la, e de novo para escondê-la.');
    q<HTMLButtonElement>('.fita .estudo')!.click();
    await settle();
    expect(q('.fita .dica')).toBeNull();
    q<HTMLButtonElement>('.fita .parar')!.click();
    await settle();
    await listen('pt');
    q<HTMLButtonElement>('.fita .estudo')!.click();
    await settle();
    expect(q('.fita .dica')).withContext('cada dica, uma vez por aparelho').toBeNull();
  });

  it('o modo estudo fica guardado: parar devolve o texto, ouvir de novo já vem em rabisco; desligar mostra tudo', async () => {
    fixture.componentInstance.open(note('n-1', 'の (De / Posse)', NO));
    await settle();
    await listen('ja');
    q<HTMLButtonElement>('.fita .estudo')!.click();
    await settle();
    q<HTMLButtonElement>('.fita .parar')!.click();
    await settle();
    expect(hiddenWords()).toEqual([]);
    expect(el.querySelector('.voz-rabiscos')).toBeNull();
    expect(q('.text')!.hasAttribute('data-voz-estudo')).toBeFalse();
    await listen('pt');
    expect(hiddenWords()).toContain('Posse');
    q<HTMLButtonElement>('.fita .estudo')!.click();
    await settle();
    expect(hiddenWords()).toEqual([]);
    expect(said()).toBe('O texto está à mostra de novo.');
    expect(JSON.parse(localStorage.getItem(VOZ_KEY)!).estudo).toBeUndefined();
  });

  it('o card que abre no meio já mostra o texto dele em rabisco, e a leitura segue', async () => {
    fixture.componentInstance.open(note('n-1', 'Card', ['Antes.', '', '> [!aviso]- Fechado', '> Dentro do card.'].join('\n')));
    await settle();
    await listen('pt');
    q<HTMLButtonElement>('.fita .estudo')!.click();
    await settle();
    expect(hiddenWords()).not.toContain('Dentro');
    q<HTMLDetailsElement>('.text details')!.open = true;
    await wait(60);
    await settle();
    expect(hiddenWords()).toContain('Dentro');
    expect(scribbles('.text').some((b) => b.dataset['p'] !== undefined)).toBeTrue();
  });

  it('o spoiler revelado no modo estudo vira rabisco visível, na tinta do texto (e não na transparente do meio da transição)', async () => {
    fixture.componentInstance.open(note('n-1', 'Spoiler', 'Antes. ||O fim chega.|| Depois.'));
    await settle();
    await listen('pt');
    q<HTMLButtonElement>('.fita .estudo')!.click();
    await settle();
    expect(hiddenWords()).not.toContain('fim');
    q<HTMLElement>('.text .spoiler')!.click();
    await wait(400);
    await settle();
    expect(hiddenWords()).toContain('fim');
    const fim = scribbles('.text').find((b) => hiddenWords()[Number(b.dataset['p'])] === 'fim')!;
    expect(fim).toBeDefined();
    expect(fim.style.color).not.toMatch(/rgba\([^)]*,\s*0\)|transparent/);
  });

  it('na visita, o modo estudo é igual (só muda o que se vê neste aparelho)', async () => {
    fixture.componentInstance.open(note('n-1', 'の (De / Posse)', NO), 'Bruna', [], false, 'BRUN-A123');
    await settle();
    await listen('ja');
    q<HTMLButtonElement>('.fita .estudo')!.click();
    await settle();
    expect(hiddenWords()).toContain('ケーキ');
    scribbles('.text')[0].click();
    await settle();
    expect(hiddenWords()).not.toContain('USOS');
  });

  it('tocar numa frase do texto lê dali', async () => {
    fixture.componentInstance.open(note('n-1', 'の (De / Posse)', NO));
    await settle();
    await listen('ja');
    const target = [...el.querySelectorAll<HTMLElement>('.text .sutil, .text .enf')].find((e) => e.textContent!.includes('Cadê'))!;
    const box = target.getBoundingClientRect();
    const tap = () => target.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: box.left + 6, clientY: box.top + box.height / 2, button: 0 }));
    // logo depois de o menu fechar, o clique é o que o fechou: não é escolher a frase
    tap();
    await settle();
    expect(texts()[0]).toBe('の (De / Posse)');
    await wait(420);
    tap();
    await settle();
    expect(texts()).toEqual(['Cadê o seu café?']);
  });

  it('a leitura acaba no X da fita, na ficha que fecha, em outra ficha e em só a cartolina', async () => {
    const r = fixture.componentInstance;
    r.open(note('n-1', 'の (De / Posse)', NO));
    await settle();
    await listen('pt');
    q<HTMLButtonElement>('.fita .parar')!.click();
    await settle();
    expect(fake.queue).toEqual([]);
    expect(q('app-voz-fita .fita')).toBeNull();

    await listen('pt');
    r.open(note('n-2', 'Outra', 'Outro texto.'));
    await settle();
    expect(fake.queue).toEqual([]);
    expect(q('app-voz-fita .fita')).toBeNull();

    await listen('pt');
    q<HTMLButtonElement>('.faixa-nome .ver-cartolina')!.click();
    await settle();
    expect(fake.queue).toEqual([]);

    q<HTMLButtonElement>('.na-parede .ver-cartolina')?.click();
    await settle();
    await listen('pt');
    r.close();
    await settle();
    await wait(50);
    expect(fake.queue).toEqual([]);
  });

  it('a folha que a pessoa rola com a mão não é puxada de volta à frase lida', async () => {
    const longa = Array.from({ length: 60 }, (_, i) => `Frase ${i + 1} de uma nota comprida.`).join(String.fromCharCode(10));
    fixture.componentInstance.open(note('n-1', 'Comprida', longa));
    await settle();
    await listen('pt');
    const body = q<HTMLElement>('.body')!;
    // a fita leva a frase 40 para a vista
    for (let i = 0; i < 40; i++) fake.end(), fake.begin();
    await settle();
    await wait(1000);
    const auto = body.scrollTop;
    expect(auto).toBeGreaterThan(0);
    // a pessoa volta para o alto: a próxima frase não a puxa de volta
    body.scrollTop = 0;
    body.dispatchEvent(new Event('scroll'));
    fake.end();
    fake.begin();
    await settle();
    expect(body.scrollTop).toBe(0);
  });

  it('a nota que muda no meio (outra pessoa escreveu): as frases se refazem e a leitura segue', async () => {
    const r = fixture.componentInstance;
    const antes = note('n-1', 'Mercado', 'Arroz. Feijão.');
    r.open(antes);
    await settle();
    await listen('pt');
    fake.end();
    fake.begin();
    // a versão nova chega como chega da nuvem: a ficha mostrada troca, sem abrir de novo
    (r as unknown as { review: WritableSignal<Review | null> }).review.set({ ...antes, text: 'Arroz. Feijão. Café.' });
    await settle();
    await wait(260);
    // a frase de agora (o nome já foi; "Arroz.") continua; ao fim dela, a leitura segue nas frases novas
    fake.end();
    expect(texts()).toEqual(['Feijão.', 'Café.']);
  });

  it('na visita (a ficha de outra pessoa), ouvir é igual: lê sem gravar nada', async () => {
    fixture.componentInstance.open(note('n-1', 'の (De / Posse)', NO), 'Bruna', [], false, 'BRUN-A123');
    await settle();
    await listen('ja');
    expect(texts()[0]).toBe('の (De / Posse)');
    expect(texts()).toContain('私のケーキです。');
  });
});
