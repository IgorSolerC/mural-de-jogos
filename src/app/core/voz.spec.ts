import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SPEECH, UTTERANCE, VOICE_LANGS, VOZ_KEY, Voz, voiceLabel, voicesFor } from './voz';

/** A fala de mentira: um objeto comum (a de verdade recusa uma voz de mentira). */
const fakeUtterance = (text: string) => ({ text, voice: null, lang: '', rate: 1, volume: 1 }) as unknown as SpeechSynthesisUtterance;

/** Uma voz de mentira: só o que o serviço lê. */
function voice(name: string, lang: string, localService = false): SpeechSynthesisVoice {
  return { name, lang, localService, default: false, voiceURI: name } as SpeechSynthesisVoice;
}

const GOOGLE_JA = voice('Google 日本語', 'ja-JP');
const GOOGLE_PT = voice('Google português do Brasil', 'pt-BR');
const GOOGLE_UK_MALE = voice('Google UK English Male', 'en-GB');
const MARIA = voice('Microsoft Maria - Portuguese (Brazil)', 'pt-BR', true);
const DAVID = voice('Microsoft David - English (United States)', 'en-US', true);
const NANAMI = voice('Microsoft Nanami Online (Natural) - Japanese (Japan)', 'ja-JP');
const SONIA = voice('Microsoft Sonia Online (Natural) - English (United Kingdom)', 'en-GB');
const ARIA = voice('Microsoft Aria Online (Natural) - English (United States)', 'en-US');

/** O `speechSynthesis` de mentira: guarda a fila, e o teste diz quando cada fala começa, acaba ou falha. */
class FakeSpeech {
  list: SpeechSynthesisVoice[] = [];
  queue: SpeechSynthesisUtterance[] = [];
  spoken: SpeechSynthesisUtterance[] = [];
  cancels = 0;
  pauses = 0;
  speaking = true;
  private listeners: (() => void)[] = [];
  getVoices = () => this.list;
  addEventListener(_: string, fn: () => void) {
    this.listeners.push(fn);
  }
  speak(u: SpeechSynthesisUtterance) {
    this.queue.push(u);
    this.spoken.push(u);
  }
  cancel() {
    this.cancels++;
    const old = this.queue;
    this.queue = [];
    // como o Chrome: a fila cancelada avisa "interrupted"
    for (const u of old) u.onerror?.({ error: 'interrupted' } as SpeechSynthesisErrorEvent);
  }
  resume() {}
  pause() {
    this.pauses++;
  }
  setVoices(list: SpeechSynthesisVoice[]) {
    this.list = list;
    this.listeners.forEach((fn) => fn());
  }
  /** A primeira da fila começa (e, com `end`, acaba). */
  begin(): SpeechSynthesisUtterance {
    const u = this.queue[0];
    u.onstart?.({} as SpeechSynthesisEvent);
    return u;
  }
  end(): void {
    const u = this.queue.shift()!;
    u.onend?.({} as SpeechSynthesisEvent);
  }
}

describe('a voz que lê a nota', () => {
  let fake: FakeSpeech;
  let voz: Voz;

  function make(): Voz {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: SPEECH, useValue: fake }, { provide: UTTERANCE, useValue: fakeUtterance }] });
    return TestBed.inject(Voz);
  }

  beforeEach(() => {
    localStorage.removeItem(VOZ_KEY);
    fake = new FakeSpeech();
    fake.list = [MARIA, DAVID, GOOGLE_PT, GOOGLE_JA, GOOGLE_UK_MALE];
    voz = make();
  });
  afterEach(() => {
    voz.stop();
    localStorage.removeItem(VOZ_KEY);
  });

  describe('as vozes', () => {
    it('a preferida do dono primeiro (as do Google do teste dele); a do Windows por último', () => {
      expect(voicesFor(fake.list, 'pt').map((v) => v.name)).toEqual([GOOGLE_PT.name, MARIA.name]);
      expect(voicesFor(fake.list, 'en').map((v) => v.name)).toEqual([GOOGLE_UK_MALE.name, DAVID.name]);
      expect(voicesFor(fake.list, 'ja').map((v) => v.name)).toEqual([GOOGLE_JA.name]);
    });

    it('sem as do Google (o Edge): a neural, a britânica antes da americana', () => {
      expect(voicesFor([DAVID, ARIA, SONIA], 'en').map(voiceLabel)).toEqual(['Sonia', 'Aria', 'David']);
      expect(voicesFor([NANAMI], 'ja').map(voiceLabel)).toEqual(['Nanami']);
    });

    it('o sublinhado do Android ("pt_BR") vale; outra língua, não', () => {
      const android = voice('pt-br-x-afs-local', 'pt_BR', true);
      expect(voicesFor([android, DAVID], 'pt')).toEqual([android]);
      expect(voicesFor([DAVID], 'ja')).toEqual([]);
    });

    it('as vozes que chegam depois de abrir a página (o voiceschanged) entram', () => {
      fake.list = [];
      voz = make();
      expect(voz.voicesOf('ja')).toEqual([]);
      fake.setVoices([GOOGLE_JA]);
      expect(voz.voiceOf('ja')).toBe(GOOGLE_JA);
    });

    it('a voz escolhida fica neste aparelho; a que sumiu volta para a melhor', () => {
      voz.setVoice('pt', MARIA.name);
      expect(voz.voiceOf('pt')).toBe(MARIA);
      expect(JSON.parse(localStorage.getItem(VOZ_KEY)!)).toEqual({ voices: { pt: MARIA.name } });
      fake.list = [GOOGLE_PT];
      expect(make().voiceOf('pt')).toBe(GOOGLE_PT);
    });
  });

  describe('ler', () => {
    it('as frases vão para a fila de uma vez, na voz, na língua, na velocidade e no volume do site', () => {
      voz.start(['私のケーキです。', 'É o meu bolo.'], 'ja');
      expect(fake.queue.map((u) => u.text)).toEqual(['私のケーキです。', 'É o meu bolo.']);
      expect(fake.queue.every((u) => u.voice === GOOGLE_JA && u.lang === 'ja-JP' && u.rate === 1)).toBeTrue();
      expect(voz.playing()).toBeTrue();
      expect(voz.at()).toBe(0);
      expect(voz.total()).toBe(2);
    });

    it('sem voz da língua, fala com a língua e a voz que o navegador achar', () => {
      fake.list = [MARIA];
      voz = make();
      voz.start(['hello'], 'en');
      expect(fake.queue[0].voice).toBeNull();
      expect(fake.queue[0].lang).toBe(VOICE_LANGS.en.tag);
    });

    it('a frase que começa vira a de agora; a última que acaba encerra a leitura', () => {
      voz.start(['Um.', 'Dois.'], 'pt');
      fake.begin();
      fake.end();
      fake.begin();
      expect(voz.at()).toBe(1);
      fake.end();
      expect(voz.playing()).toBeFalse();
      expect(voz.ended()).toBeTrue();
      // nenhuma frase fica marcada no fim
      expect(voz.at()).toBe(-1);
      // tocar de novo começa do começo
      voz.toggle();
      expect(fake.queue.map((u) => u.text)).toEqual(['Um.', 'Dois.']);
      expect(voz.at()).toBe(0);
    });

    it('pausar cala e lembra a frase; continuar a diz de novo desde o começo', () => {
      voz.start(['Um.', 'Dois.', 'Três.'], 'pt');
      fake.begin();
      fake.end();
      fake.begin();
      voz.toggle();
      expect(voz.playing()).toBeFalse();
      expect(fake.queue).toEqual([]);
      expect(voz.failure()).toBeNull();
      voz.toggle();
      expect(fake.queue.map((u) => u.text)).toEqual(['Dois.', 'Três.']);
      expect(voz.at()).toBe(1);
    });

    it('a anterior e a próxima: lendo, já falam; pausado, só marcam; sem passar das pontas', () => {
      voz.start(['Um.', 'Dois.', 'Três.'], 'pt');
      voz.next();
      expect(fake.queue.map((u) => u.text)).toEqual(['Dois.', 'Três.']);
      voz.prev();
      voz.prev();
      expect(voz.at()).toBe(0);
      voz.pause();
      voz.go(9);
      expect(voz.at()).toBe(2);
      expect(fake.queue).toEqual([]);
    });

    it('a velocidade e a voz trocadas no meio: a frase de agora recomeça; a velocidade fica no aparelho', () => {
      voz.start(['Um.', 'Dois.'], 'pt');
      fake.begin();
      fake.end();
      fake.begin();
      voz.setRate(1.5);
      expect(fake.queue.map((u) => [u.text, u.rate])).toEqual([['Dois.', 1.5]]);
      voz.setRate(3);
      expect(voz.rate()).toBe(1.5);
      voz.setVoice('pt', MARIA.name);
      expect(fake.queue[0].voice).toBe(MARIA);
      expect(make().rate()).toBe(1.5);
    });

    it('trocar a língua no meio: a frase de agora recomeça na voz nova', () => {
      voz.start(['ケーキ'], 'pt');
      voz.setLang('ja');
      expect(fake.queue.map((u) => u.voice)).toEqual([GOOGLE_JA]);
    });

    it('a palavra que a voz avisa vira a de agora (sem o tamanho, até o fim da palavra)', () => {
      voz.start(['Bom dia, tudo bem?'], 'pt');
      const u = fake.begin();
      u.onboundary?.({ name: 'word', charIndex: 4, charLength: 3 } as SpeechSynthesisEvent);
      expect(voz.word()).toEqual({ from: 4, to: 7 });
      u.onboundary?.({ name: 'word', charIndex: 9, charLength: 0 } as SpeechSynthesisEvent);
      expect(voz.word()).toEqual({ from: 9, to: 13 });
      u.onboundary?.({ name: 'sentence', charIndex: 0, charLength: 0 } as SpeechSynthesisEvent);
      expect(voz.word()).toEqual({ from: 9, to: 13 });
    });

    it('a voz que falha para a leitura e diz por quê; a fila cancelada não é falha', () => {
      voz.start(['Um.', 'Dois.'], 'ja');
      voz.next();
      expect(voz.failure()).toBeNull();
      fake.queue[0].onerror?.({ error: 'network' } as SpeechSynthesisErrorEvent);
      expect(voz.playing()).toBeFalse();
      expect(voz.failure()).toContain('internet');
    });

    it('os avisos de uma fila velha não mexem na leitura nova', () => {
      voz.start(['Um.', 'Dois.', 'Três.'], 'pt');
      const old = fake.queue[2];
      voz.go(0);
      old.onstart?.({} as SpeechSynthesisEvent);
      old.onend?.({} as SpeechSynthesisEvent);
      expect(voz.at()).toBe(0);
      expect(voz.playing()).toBeTrue();
    });

    it('parar esquece tudo e cala', () => {
      voz.start(['Um.'], 'pt');
      voz.stop();
      expect(voz.lang()).toBeNull();
      expect(voz.at()).toBe(-1);
      expect(voz.playing()).toBeFalse();
      expect(fake.queue).toEqual([]);
    });
  });

  describe('o aparelho', () => {
    it('a preferência estragada vale como nada guardado (e não vira lixo ao gravar)', () => {
      localStorage.setItem(VOZ_KEY, '"x"');
      voz = make();
      expect(voz.rate()).toBe(1);
      voz.setRate(1.25);
      expect(JSON.parse(localStorage.getItem(VOZ_KEY)!)).toEqual({ rate: 1.25 });
      localStorage.setItem(VOZ_KEY, JSON.stringify({ rate: 'rápido', voices: { pt: 3, ja: 'Google 日本語' } }));
      voz = make();
      voz.setRate(0.75);
      expect(JSON.parse(localStorage.getItem(VOZ_KEY)!)).toEqual({ rate: 0.75, voices: { ja: 'Google 日本語' } });
    });

    it('outra aba trocou a velocidade: esta acompanha', () => {
      localStorage.setItem(VOZ_KEY, JSON.stringify({ rate: 1.5 }));
      window.dispatchEvent(new StorageEvent('storage', { key: VOZ_KEY, storageArea: localStorage }));
      expect(voz.rate()).toBe(1.5);
    });

    it('sem nenhuma voz (o Edge do Android), não fala; com uma, fala', () => {
      fake.list = [];
      voz = make();
      expect(voz.supported).toBeTrue();
      expect(voz.speaks()).toBeFalse();
      fake.setVoices([MARIA]);
      expect(voz.speaks()).toBeTrue();
    });

    describe('as vozes do Google no Chrome, que se calam depois de uns 15 s', () => {
      beforeEach(() => jasmine.clock().install());
      afterEach(() => jasmine.clock().uninstall());

      it('pausam e continuam a cada 10 s enquanto falam; param de fazer isso ao pausar', () => {
        voz.start(['Uma frase longa.'], 'pt');
        jasmine.clock().tick(10_000);
        expect(fake.pauses).toBe(1);
        jasmine.clock().tick(10_000);
        expect(fake.pauses).toBe(2);
        voz.pause();
        jasmine.clock().tick(30_000);
        expect(fake.pauses).toBe(2);
      });

      it('as do aparelho não precisam', () => {
        voz.setVoice('pt', MARIA.name);
        voz.start(['Uma frase longa.'], 'pt');
        jasmine.clock().tick(30_000);
        expect(fake.pauses).toBe(0);
      });
    });
  });

  describe('a nota que muda no meio da leitura', () => {
    it('a frase de agora igual: ela termina, e a leitura segue nas frases novas', () => {
      voz.start(['Um.', 'Dois.', 'Três.'], 'pt');
      fake.begin();
      fake.end();
      fake.begin();
      voz.update(['Zero.', 'Um.', 'Dois.', 'Dois e meio.', 'Três.'], 2);
      expect(voz.at()).toBe(2);
      // nada recomeçou: a frase de agora segue
      expect(fake.queue[0].text).toBe('Dois.');
      fake.end();
      expect(fake.queue.map((u) => u.text)).toEqual(['Dois e meio.', 'Três.']);
    });

    it('a frase de agora mudou: ela é dita de novo como ficou', () => {
      voz.start(['Um.', 'Dois.'], 'pt');
      fake.begin();
      voz.update(['Um, dois.', 'Dois.'], 0);
      expect(fake.queue.map((u) => u.text)).toEqual(['Um, dois.', 'Dois.']);
    });

    it('pausado, só troca as frases e a de agora', () => {
      voz.start(['Um.', 'Dois.'], 'pt');
      voz.pause();
      voz.update(['Zero.', 'Um.', 'Dois.'], 1);
      expect(fake.queue).toEqual([]);
      expect(voz.at()).toBe(1);
      expect(voz.total()).toBe(3);
    });

    it('a nota ficou sem texto: a leitura acaba', () => {
      voz.start(['Um.'], 'pt');
      voz.update([], -1);
      expect(voz.lang()).toBeNull();
    });
  });

  it('sem a voz do navegador: não lê e não quebra', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: SPEECH, useValue: null }] });
    const none = TestBed.inject(Voz);
    expect(none.supported).toBeFalse();
    none.start(['Um.'], 'pt');
    expect(none.playing()).toBeFalse();
    none.stop();
  });
});
