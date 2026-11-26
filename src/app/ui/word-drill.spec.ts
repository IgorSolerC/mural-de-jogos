import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Word } from '../core/dictionary/dictionary';
import { DEFAULT_SETUP, DRILL_SETUP_KEY, DrillSetup, readSetup } from '../core/dictionary/drill';
import { DICT_MARKS_KEY, DictionaryMarks } from '../core/dictionary/marks-store';
import { dictionaryWords } from '../core/dictionary/words';
import { SPEECH, UTTERANCE, Voz } from '../core/voz';
import { FakeSpeech, GOOGLE_JA, fakeUtterance } from '../testing/fala-falsa';
import { WordDrill } from './word-drill';
import { DrillStart, WordDrillSetup } from './word-drill-setup';

const word = (text: string): Word => dictionaryWords().words.find((w) => w.text === text)!;
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** O Treino do dicionário (PLANO-TREINO-DICIONARIO.md): a folha de montar e a mesa. */
describe('Treino do dicionário', () => {
  let fake: FakeSpeech;
  let still: HTMLStyleElement;
  let host: HTMLElement | null = null;

  beforeEach(() => {
    localStorage.removeItem(DRILL_SETUP_KEY);
    localStorage.removeItem(DICT_MARKS_KEY);
    fake = new FakeSpeech();
    fake.setVoices([GOOGLE_JA]);
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: SPEECH, useValue: fake }, { provide: UTTERANCE, useValue: fakeUtterance }] });
    still = document.head.appendChild(document.createElement('style'));
    still.textContent = '*, *::backdrop { animation: none !important; transition: none !important; }';
  });
  afterEach(() => {
    still.remove();
    for (const d of host?.querySelectorAll<HTMLDialogElement>('dialog') ?? []) d.close();
    for (const d of document.querySelectorAll<HTMLDialogElement>('app-study-drill-picker dialog')) d.close();
    host?.remove();
    host = null;
    TestBed.inject(Voz).stop();
    localStorage.removeItem(DRILL_SETUP_KEY);
    localStorage.removeItem(DICT_MARKS_KEY);
  });

  async function settle<T>(fixture: ComponentFixture<T>): Promise<void> {
    for (let i = 0; i < 3; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
      await wait();
    }
  }

  describe('Montar o treino', () => {
    let fixture: ComponentFixture<WordDrillSetup>;
    let el: HTMLElement;
    let started: DrillStart | null;

    async function open(ways?: DrillSetup['ways']): Promise<void> {
      fixture = TestBed.createComponent(WordDrillSetup);
      if (ways) fixture.componentRef.setInput('ways', ways);
      started = null;
      fixture.componentInstance.started.subscribe((s) => (started = s));
      el = host = fixture.nativeElement;
      document.body.appendChild(el);
      await settle(fixture);
    }
    const radio = (name: string, i: number) => el.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)[i];
    const line = (title: string) => [...el.querySelectorAll<HTMLElement>('.linha')].find((l) => l.querySelector('.linha-titulo')?.textContent?.trim() === title);
    const conta = () => el.querySelector('.pe .conta')!.textContent!.trim();
    const comecar = () => el.querySelector<HTMLButtonElement>('.comecar')!;

    function learn(...texts: string[]): void {
      const marks = TestBed.inject(DictionaryMarks);
      for (const t of texts) marks.setLearned(word(t), true);
    }

    it('sem nenhuma aprendida, começa no dicionário inteiro, com o Aprendidas apagado e o motivo', async () => {
      await open(['pt-jp', 'jp-pt']);
      expect(radio('dt-fonte', 0).disabled).toBeTrue();
      expect(radio('dt-fonte', 2).checked).toBeTrue();
      expect(el.querySelector('.nota')?.textContent).toContain('覚');
      // o jeito guardado (Escrever) não existe na mesa ainda: o primeiro que existe
      expect(el.querySelectorAll<HTMLInputElement>('.jeito input')[0].checked).toBeTrue();
      expect(comecar().disabled).toBeFalse();
      expect(document.activeElement).toBe(comecar());
    });

    it('as contas dos recortes, os filtros de escrita e o Começar apagado sem jeito', async () => {
      learn('食べる', 'テレビ', '来る');
      await open(['pt-jp', 'jp-pt']);
      expect(radio('dt-fonte', 0).checked).toBeTrue();
      expect(radio('dt-fonte', 0).closest('label')!.textContent).toContain('3');
      expect(conta()).toBe('3 palavras');
      // só katakana: kanji não pode, hiragana não pode
      radio('dt-kanji', 2).click();
      radio('dt-hiragana', 2).click();
      await settle(fixture);
      expect(conta()).toBe('1 palavra');
      expect(radio('dt-katakana', 0).closest('label')!.textContent).toContain('1');
      // sem jeito marcado: não começa, e diz por quê
      for (const i of el.querySelectorAll<HTMLInputElement>('.jeito input')) if (i.checked) i.click();
      await settle(fixture);
      expect(comecar().disabled).toBeTrue();
      expect(conta()).toBe('Marque um jeito de treinar.');
    });

    it('as dicas só aparecem com o Escrever, e o Como mostrar só com o Japonês → português', async () => {
      await open(['escrever', 'pt-jp', 'jp-pt']);
      const jeitos = el.querySelectorAll<HTMLInputElement>('.jeito input');
      expect(jeitos[0].checked).toBeTrue();
      expect(line('Dica para escrever')).toBeTruthy();
      expect(line('Como mostrar o japonês')).toBeFalsy();
      jeitos[0].click();
      jeitos[2].click();
      await settle(fixture);
      expect(line('Dica para escrever')).toBeFalsy();
      expect(line('Como mostrar o japonês')).toBeTruthy();
    });

    it('sem voz japonesa, o Som e o Falado ficam apagados', async () => {
      fake.setVoices([]);
      await open(['escrever', 'pt-jp', 'jp-pt']);
      el.querySelectorAll<HTMLInputElement>('.jeito input')[2].click();
      await settle(fixture);
      const som = [...line('Dica para escrever')!.querySelectorAll<HTMLInputElement>('input')][0];
      expect(som.disabled).toBeTrue();
      expect(som.checked).toBeFalse();
      expect(line('Como mostrar o japonês')!.querySelectorAll<HTMLInputElement>('input')[1].disabled).toBeTrue();
    });

    it('Escolher: a lista das aprendidas, as escolhidas e o Começar com elas; a montagem fica guardada', async () => {
      learn('食べる', 'テレビ', '来る');
      await open(['pt-jp', 'jp-pt']);
      radio('dt-quais', 1).click();
      await settle(fixture);
      const picker = document.querySelector<HTMLElement>('app-study-drill-picker')!;
      expect(picker.querySelector('dialog')!.open).toBeTrue();
      const rows = [...picker.querySelectorAll<HTMLElement>('.item')];
      expect(rows.map((r) => r.querySelector('.glifo')!.textContent!.trim())).toEqual(['来る', '食べる', 'テレビ'].sort((a, b) => word(a).order - word(b).order));
      rows.find((r) => r.textContent!.includes('食べる'))!.querySelector('input')!.click();
      rows.find((r) => r.textContent!.includes('テレビ'))!.querySelector('input')!.click();
      await settle(fixture);
      picker.querySelector<HTMLButtonElement>('.foot .btn-ink')!.click();
      await settle(fixture);
      expect(el.querySelector('.papelzinho')!.textContent).toContain('2 escolhidas');
      expect(conta()).toBe('2 palavras');
      comecar().click();
      await settle(fixture);
      expect(started!.pool.map((w) => w.text).sort()).toEqual(['テレビ', '食べる'].sort());
      expect(readSetup().pick).toBe('escolher');
      expect(readSetup().chosen.length).toBe(2);
    });

    it('cancelar a lista sem nenhuma escolhida volta ao Todas', async () => {
      learn('食べる');
      await open(['pt-jp']);
      radio('dt-quais', 1).click();
      await settle(fixture);
      document.querySelector<HTMLDialogElement>('app-study-drill-picker dialog')!.close();
      await settle(fixture);
      expect(radio('dt-quais', 0).checked).toBeTrue();
    });
  });

  describe('A mesa', () => {
    let fixture: ComponentFixture<WordDrill>;
    let el: HTMLElement;

    async function open(texts: string[], over: Partial<DrillSetup>): Promise<void> {
      fixture = TestBed.createComponent(WordDrill);
      fixture.componentRef.setInput('setup', { ...DEFAULT_SETUP, size: 0, ...over });
      fixture.componentRef.setInput('pool', texts.map(word));
      el = host = fixture.nativeElement;
      document.body.appendChild(el);
      await settle(fixture);
    }
    async function type(text: string): Promise<void> {
      const input = el.querySelector<HTMLInputElement>('.campo input')!;
      input.value = text;
      input.dispatchEvent(new Event('input'));
      el.querySelector<HTMLFormElement>('.responder')!.requestSubmit();
      await settle(fixture);
    }
    async function key(k: string): Promise<void> {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      await settle(fixture);
    }
    const said = () => el.querySelector('.bateu')?.textContent?.trim();

    it('Português → japonês: o romaji bate, o foco vai para o Acertei e o 2 acerta', async () => {
      await open(['食べる'], { ways: ['pt-jp'] });
      expect(el.querySelector('.em-pt')!.textContent).toContain('comer');
      expect(el.querySelector('.baralho')!.textContent).toContain('1 de 1');
      await type('taberu');
      expect(said()).toBe('Bateu com o romaji');
      expect(el.querySelector('.certa-ja')!.textContent).toContain('食べる');
      expect(el.querySelector<HTMLInputElement>('.campo input')!.readOnly).toBeTrue();
      await wait(10);
      expect(document.activeElement).toBe(el.querySelector('.acertei'));
      await key('2');
      expect(el.querySelector('.fim h3')!.textContent).toContain('Treino completo.');
      expect(el.querySelector('.fim-conta')!.textContent).toContain('1');
    });

    it('Japonês → português: o que não bate diz, o 1 erra, e o Desfazer volta com o que se escreveu', async () => {
      await open(['テレビ', '来る'], { ways: ['jp-pt'], show: ['escrito'] });
      const first = el.querySelector('.em-ja')!.textContent!.trim();
      await type('banana');
      expect(said()).toBe('Não bateu');
      await key('1');
      expect(el.querySelector('[data-monte="erros"]')!.textContent).toContain('1');
      expect(el.querySelector('.em-ja')!.textContent!.trim()).not.toBe(first);
      await key('z');
      expect(el.querySelector('.em-ja')!.textContent!.trim()).toBe(first);
      expect(el.querySelector<HTMLInputElement>('.campo input')!.value).toBe('banana');
      expect(el.querySelector('.bateu')).toBeNull();
      expect(el.querySelector('.placar')).toBeNull();
    });

    it('o Enter que confirma a conversão do teclado japonês não confere', async () => {
      await open(['食べる'], { ways: ['pt-jp'] });
      const input = el.querySelector<HTMLInputElement>('.campo input')!;
      const enter = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true });
      input.dispatchEvent(enter);
      expect(enter.defaultPrevented).toBeTrue();
      const plain = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      input.dispatchEvent(plain);
      expect(plain.defaultPrevented).toBeFalse();
    });

    it('o sentido que bate, sem acento e sem artigo', async () => {
      await open(['テレビ'], { ways: ['jp-pt'], show: ['escrito'] });
      await type('a televisao');
      expect(said()).toContain('Bateu com');
    });

    it('falado: a voz diz a palavra ao chegar, sem o texto na tela', async () => {
      await open(['食べる'], { ways: ['jp-pt'], show: ['falado'] });
      fake.begin();
      expect(el.querySelector('.em-ja')).toBeNull();
      expect(el.querySelector('.so-som app-word-voice')).toBeTruthy();
      expect(fake.spoken.at(-1)!.text).toBe('たべる');
      expect(el.textContent).not.toContain('食べる');
    });

    it('Parar depois de uma resposta mostra o fim com o que já foi feito; Outro treino recomeça', async () => {
      await open(['テレビ', '来る', '食べる'], { ways: ['pt-jp'] });
      await type('xx');
      await key('2');
      el.querySelector<HTMLButtonElement>('.parar')!.click();
      await settle(fixture);
      expect(el.querySelector('.fim h3')!.textContent).toContain('Treino parado.');
      expect(el.querySelector('.fim-conta')!.textContent).toContain('1 de 1');
      el.querySelector<HTMLButtonElement>('.fim .btn-ink')!.click();
      await settle(fixture);
      expect(el.querySelector('.baralho')!.textContent).toContain('1 de 3');
      expect(el.querySelector('.placar')).toBeNull();
    });
  });
});
