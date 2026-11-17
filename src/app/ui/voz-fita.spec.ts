import { WritableSignal, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Cloud } from '../core/cloud-config';
import { CloudAccount } from '../core/cloud-account';
import { LocalData } from '../core/local-data';
import { Review, sanitizeReview } from '../core/review';
import { SHARED_AUTO } from '../core/shared-store';
import { SPEECH, UTTERANCE, VOZ_KEY } from '../core/voz';
import { FakeSpeech, GOOGLE_JA, GOOGLE_PT, fakeUtterance } from '../testing/fala-falsa';
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
    expect(labels).toEqual(['Ouvir a nota', 'Ver só a cartolina', 'Ler em tela cheia', 'Fechar']);
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

  it('a velocidade: as quatro à vista num menu, a de agora com o tique', async () => {
    fixture.componentInstance.open(note('n-1', 'の (De / Posse)', NO));
    await settle();
    await listen('ja');
    q<HTMLButtonElement>('.fita .velocidade')!.click();
    await settle();
    const items = [...document.querySelectorAll<HTMLButtonElement>('.menu-contexto [data-k]')];
    expect(items.map((b) => b.querySelector('.nome')!.textContent!.trim())).toEqual(['0,75×', '1×', '1,25×', '1,5×']);
    expect(items.map((b) => b.querySelector('.marcada') !== null)).toEqual([false, true, false, false]);
    items[0].click();
    await settle();
    expect(q('.fita .velocidade')!.textContent!.trim()).toBe('0,75×');
    expect(fake.queue[0].rate).toBe(0.75);
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

    q<HTMLButtonElement>('.ler-tela-cheia')?.click();
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

  it('a tela cheia continua lendo, com a fita ao pé', async () => {
    fixture.componentInstance.open(note('n-1', 'の (De / Posse)', NO));
    await settle();
    await listen('ja');
    q<HTMLButtonElement>('.faixa-nome .ler-tela-cheia')!.click();
    await settle();
    expect(q('dialog.reader.tela-cheia .body > app-voz-fita .fita')).not.toBeNull();
    expect(texts().length).toBe(6);
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
