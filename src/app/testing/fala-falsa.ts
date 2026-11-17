/**
 * A voz do navegador de mentira, para os testes de ouvir a nota (PLANO-VOZ.md): as vozes do teste do dono e a
 * fila que o teste faz andar (começar, acabar, falhar). A fala de verdade recusa uma voz de mentira: daí a
 * fala de mentira também (o UTTERANCE de core/voz.ts).
 */
/** A fala de mentira: um objeto comum (a de verdade recusa uma voz de mentira). */
export const fakeUtterance = (text: string) => ({ text, voice: null, lang: '', rate: 1, volume: 1 }) as unknown as SpeechSynthesisUtterance;

/** Uma voz de mentira: só o que o serviço lê. */
export function voice(name: string, lang: string, localService = false): SpeechSynthesisVoice {
  return { name, lang, localService, default: false, voiceURI: name } as SpeechSynthesisVoice;
}

export const GOOGLE_JA = voice('Google 日本語', 'ja-JP');
export const GOOGLE_PT = voice('Google português do Brasil', 'pt-BR');
export const GOOGLE_UK_MALE = voice('Google UK English Male', 'en-GB');
export const MARIA = voice('Microsoft Maria - Portuguese (Brazil)', 'pt-BR', true);
export const DAVID = voice('Microsoft David - English (United States)', 'en-US', true);
export const NANAMI = voice('Microsoft Nanami Online (Natural) - Japanese (Japan)', 'ja-JP');
export const SONIA = voice('Microsoft Sonia Online (Natural) - English (United Kingdom)', 'en-GB');
export const ARIA = voice('Microsoft Aria Online (Natural) - English (United States)', 'en-US');

/** O `speechSynthesis` de mentira: guarda a fila, e o teste diz quando cada fala começa, acaba ou falha. */
export class FakeSpeech {
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

