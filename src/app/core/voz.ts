import { Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { readJson, writeJson } from './storage';
import { soundVolume } from './volume';

/**
 * Ouvir a nota em voz alta (PLANO-VOZ.md): a voz do próprio navegador (a Web Speech API), de graça e sem
 * servidor. Quem usa tira as frases da folha (ui/voz-frases.ts) e dá o texto de cada uma; aqui elas são
 * faladas uma a uma, na voz da língua escolhida, e `at` diz qual está sendo dita (para o marca-texto).
 *
 * Todas as frases que faltam vão para a fila do navegador de uma vez: a próxima já começa sem esperar
 * por nós, e a leitura segue mesmo onde a voz não avisa quando cada frase começa (as do Google em alguns
 * Windows). Pausar é calar e lembrar a frase; continuar a diz de novo desde o começo (o `pause()` do
 * Android não volta). Só uma leitura por vez no site inteiro (o serviço é um só).
 *
 * A velocidade e a voz escolhida em cada língua ficam neste aparelho (`VOZ_KEY`, apagada na limpeza do
 * logout pelo prefixo); a língua, não: a pessoa escolhe toda vez. O volume é o do site (core/volume.ts).
 */

export type VoiceLang = 'pt' | 'en' | 'ja';

export interface VoiceLangInfo {
  /** A língua para a voz (BCP 47): onde a frase acaba e a voz de reserva dependem dela. */
  tag: string;
  /** O nome no menu. */
  name: string;
  /** A voz que o dono escolheu num teste no Chrome (17/nov/2026): a primeira, quando existe. */
  preferred: string;
}

export const VOICE_LANGS: Readonly<Record<VoiceLang, VoiceLangInfo>> = {
  pt: { tag: 'pt-BR', name: 'Português', preferred: 'Google português do Brasil' },
  en: { tag: 'en-GB', name: 'Inglês', preferred: 'Google UK English Male' },
  ja: { tag: 'ja-JP', name: 'Japonês', preferred: 'Google 日本語' },
};

/** As línguas na ordem do menu. */
export const VOICE_LANG_ORDER: readonly VoiceLang[] = ['pt', 'en', 'ja'];

/** As velocidades à escolha (1 é a da voz). */
export const VOICE_RATES: readonly number[] = [0.75, 1, 1.25, 1.5];

/** A preferência deste aparelho: a velocidade e a voz escolhida em cada língua (pelo nome). */
export const VOZ_KEY = 'meu-mural:voz';

interface Stored {
  rate?: number;
  voices?: Partial<Record<VoiceLang, string>>;
}

/** A preferência guardada, só se tem a forma certa (um valor estragado vale como nada guardado). */
function readStored(): Stored {
  const raw = readJson<unknown>(VOZ_KEY);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const { rate, voices } = raw as Stored;
  const names: Partial<Record<VoiceLang, string>> = {};
  if (voices && typeof voices === 'object') {
    for (const lang of VOICE_LANG_ORDER) if (typeof voices[lang] === 'string') names[lang] = voices[lang];
  }
  return { ...(typeof rate === 'number' ? { rate } : {}), ...(Object.keys(names).length ? { voices: names } : {}) };
}

/**
 * As vozes do Google no Chrome do computador se calam depois de uns 15 s de fala seguida (o bug 679437 do
 * Chromium): pausar e continuar a cada 10 s as mantém falando. Só nelas: no Android o `pause()` não volta,
 * e as do Edge e as do aparelho não precisam.
 */
const KEEP_ALIVE_MS = 10_000;
function needsKeepAlive(v: SpeechSynthesisVoice | null): boolean {
  return !!v && !v.localService && /^Google/.test(v.name) && !(typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent));
}

/** A voz do navegador (o `speechSynthesis`); null onde não há (o Edge do Android devolve lista vazia). */
export const SPEECH = new InjectionToken<SpeechSynthesis | null>('SPEECH', {
  providedIn: 'root',
  factory: () => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null),
});

/** Faz cada fala (o teste troca por uma de mentira, que aceita uma voz de mentira). */
export const UTTERANCE = new InjectionToken<(text: string) => SpeechSynthesisUtterance>('UTTERANCE', {
  providedIn: 'root',
  factory: () => (text: string) => new SpeechSynthesisUtterance(text),
});

/** "pt_BR", "PT-br" → "pt-br" (o Android escreve com o sublinhado). */
function langOf(v: SpeechSynthesisVoice): string {
  return v.lang.replace(/_/g, '-').toLowerCase();
}

/**
 * Quanto pior, maior: a preferida do dono; depois a neural do Edge ("Natural"/"Online"), a do Google e as
 * outras; dentro de cada uma, a do país da língua (o inglês britânico antes do americano).
 */
function rankOf(v: SpeechSynthesisVoice, info: VoiceLangInfo): number {
  if (v.name === info.preferred) return 0;
  const quality = /natural|online/i.test(v.name) ? 10 : /google/i.test(v.name) ? 20 : 30;
  return quality + (langOf(v) === info.tag.toLowerCase() ? 0 : 5);
}

/** As vozes da língua, a melhor primeiro. */
export function voicesFor(all: readonly SpeechSynthesisVoice[], lang: VoiceLang): SpeechSynthesisVoice[] {
  const info = VOICE_LANGS[lang];
  const base = info.tag.slice(0, 2).toLowerCase();
  return all
    .filter((v) => langOf(v).split('-')[0] === base)
    .map((v, i) => ({ v, r: rankOf(v, info), i }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.v);
}

/** O nome curto da voz no menu: "Google 日本語", "Microsoft Nanami Online (Natural) - Japanese (Japan)" → "Nanami". */
export function voiceLabel(v: SpeechSynthesisVoice): string {
  const ms = /^Microsoft (\S+)/.exec(v.name);
  return ms ? ms[1] : v.name;
}

/** O que deu errado ao falar (o `error` do evento), em palavras. */
function failureOf(error: string): string {
  switch (error) {
    case 'network':
    case 'synthesis-failed':
    case 'synthesis-unavailable':
      return 'A voz não respondeu. Ela pode precisar de internet.';
    case 'language-unavailable':
    case 'voice-unavailable':
      return 'Essa voz não está disponível neste aparelho.';
    case 'not-allowed':
      return 'O navegador não deixou falar. Toque em tocar de novo.';
    default:
      return 'A voz parou sem dizer por quê.';
  }
}

@Injectable({ providedIn: 'root' })
export class Voz {
  private readonly synth = inject(SPEECH);
  private readonly utterance = inject(UTTERANCE);
  private readonly stored = signal<Stored>(readStored());

  /** As vozes do navegador (chegam depois de abrir a página, no `voiceschanged`). */
  readonly voices = signal<readonly SpeechSynthesisVoice[]>([]);
  /** Quem começou a leitura de agora (a fita da ficha aberta): só ela desenha a fita e o marca-texto. */
  readonly owner = signal<object | null>(null);
  /** A língua da leitura de agora; null sem leitura. */
  readonly lang = signal<VoiceLang | null>(null);
  /** A frase sendo dita (ou onde a leitura parou); -1 sem leitura. */
  readonly at = signal(-1);
  /** Quantas frases a leitura tem. */
  readonly total = signal(0);
  readonly playing = signal(false);
  /** A leitura chegou ao fim (tocar de novo começa do começo). */
  readonly ended = signal(false);
  /** A palavra sendo dita na frase de agora (as letras do texto dela), onde a voz avisa; null onde não. */
  readonly word = signal<{ from: number; to: number } | null>(null);
  /** O que deu errado da última vez, em palavras; null se nada. */
  readonly failure = signal<string | null>(null);
  /** A velocidade (1 é a da voz). */
  readonly rate = computed(() => {
    const r = this.stored().rate;
    return typeof r === 'number' && VOICE_RATES.includes(r) ? r : 1;
  });
  /** A voz da leitura de agora. */
  readonly voice = computed(() => {
    const lang = this.lang();
    return lang ? this.voiceOf(lang) : null;
  });

  /** O navegador fala? (Sem `speechSynthesis`, o botão nem aparece.) */
  readonly supported = !!this.synth;
  /** Há alguma voz? (O Edge do Android tem o `speechSynthesis`, mas a lista vazia: o botão não aparece.) */
  readonly speaks = computed(() => this.supported && this.voices().length > 0);

  private texts: readonly string[] = [];
  /** Cada leitura começada ganha um número: os avisos de uma fila velha (cancelada) não valem. */
  private gen = 0;
  /** As falas na fila: guardadas, senão o Chrome as joga fora antes do fim e o `end` não vem. */
  private queue: SpeechSynthesisUtterance[] = [];
  /** A nota mudou durante a frase de agora: ao fim dela, a leitura segue daqui, nas frases novas. */
  private pendingFrom: number | null = null;
  private keepAlive: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const synth = this.synth;
    if (!synth) return;
    const load = () => this.voices.set(synth.getVoices());
    load();
    synth.addEventListener?.('voiceschanged', load);
    // outra aba trocou a voz ou a velocidade: esta acompanha (como o volume, em core/volume.ts; o
    // onOtherTab de core/storage.ts é para quem junta as mudanças das duas, e aqui vale a última)
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === VOZ_KEY || e.key === null) this.stored.set(readStored());
      });
    }
    // a página que sai cala (o Chrome continuaria falando a nota de uma página que já não está lá)
    if (typeof window !== 'undefined') window.addEventListener('pagehide', () => this.stop());
  }

  /** As vozes da língua, a melhor primeiro (vazio: o navegador não fala essa língua). */
  voicesOf(lang: VoiceLang): SpeechSynthesisVoice[] {
    return voicesFor(this.voices(), lang);
  }

  /** A voz da língua: a escolhida neste aparelho, se ainda existe; senão, a melhor. */
  voiceOf(lang: VoiceLang): SpeechSynthesisVoice | null {
    const list = this.voicesOf(lang);
    const name = this.stored().voices?.[lang];
    return list.find((v) => v.name === name) ?? list[0] ?? null;
  }

  /** Começa a ler as frases na língua, a partir de `from` (no toque: o iPhone só fala começando num toque). */
  start(texts: readonly string[], lang: VoiceLang, from = 0, owner: object | null = null): void {
    this.owner.set(owner);
    this.texts = texts;
    this.total.set(texts.length);
    this.lang.set(lang);
    this.play(from);
  }

  /** Pausa ou continua (do fim, começa de novo). */
  toggle(): void {
    if (this.playing()) this.pause();
    else this.play(this.ended() ? 0 : Math.max(0, this.at()));
  }

  /** Cala e lembra a frase: continuar a diz de novo desde o começo. */
  pause(): void {
    this.silence();
    this.playing.set(false);
  }

  /** Vai para a frase `i` (a anterior, a próxima, a tocada): lendo, ela é dita já; pausado, fica marcada. */
  go(i: number): void {
    if (!this.texts.length) return;
    const to = Math.min(Math.max(i, 0), this.texts.length - 1);
    this.ended.set(false);
    if (this.playing()) this.play(to);
    else {
      this.at.set(to);
      this.word.set(null);
    }
  }

  next(): void {
    this.go(this.at() + 1);
  }

  prev(): void {
    this.go(this.at() - 1);
  }

  /** Troca a língua da leitura de agora (a frase de agora recomeça na voz nova). */
  setLang(lang: VoiceLang): void {
    if (lang === this.lang()) return;
    this.lang.set(lang);
    if (this.playing()) this.play(this.at());
  }

  setRate(rate: number): void {
    if (!VOICE_RATES.includes(rate) || rate === this.rate()) return;
    this.save({ ...this.stored(), rate });
    if (this.playing()) this.play(this.at());
  }

  /** Escolhe a voz da língua (pelo nome), para este aparelho. */
  setVoice(lang: VoiceLang, name: string): void {
    if (this.voiceOf(lang)?.name === name) return;
    this.save({ ...this.stored(), voices: { ...this.stored().voices, [lang]: name } });
    if (this.playing() && this.lang() === lang) this.play(this.at());
  }

  /**
   * A nota mudou (outra pessoa escreveu na compartilhada, um spoiler se abriu): as frases novas, e `at`, a
   * frase de agora nelas (ui/voz-frases.ts, `findAgain`). Se a frase de agora continua igual, ela termina
   * de ser dita e a leitura segue nas novas; se mudou, ela é dita de novo como ficou.
   */
  update(texts: readonly string[], at: number): void {
    const same = this.at() >= 0 && at >= 0 && this.texts[this.at()] === texts[at];
    this.texts = texts;
    this.total.set(texts.length);
    if (!texts.length) {
      this.stop();
      return;
    }
    const to = Math.min(Math.max(at, 0), texts.length - 1);
    if (this.playing() && !same) {
      this.play(to);
      return;
    }
    this.at.set(to);
    if (this.playing()) this.pendingFrom = to + 1;
  }

  /** Acaba a leitura: cala e esquece tudo (a ficha fechou, outra abriu, a vista mudou). */
  stop(): void {
    this.silence();
    this.texts = [];
    this.owner.set(null);
    this.lang.set(null);
    this.at.set(-1);
    this.total.set(0);
    this.playing.set(false);
    this.ended.set(false);
    this.failure.set(null);
  }

  private silence(): void {
    this.gen++;
    this.pendingFrom = null;
    this.queue = [];
    this.word.set(null);
    if (this.keepAlive !== null) clearInterval(this.keepAlive);
    this.keepAlive = null;
    this.synth?.cancel();
  }

  /** Põe na fila do navegador as frases de `from` até o fim. */
  private play(from: number): void {
    const synth = this.synth;
    const lang = this.lang();
    this.silence();
    this.ended.set(false);
    this.failure.set(null);
    if (!synth || !lang || from >= this.texts.length) {
      this.playing.set(false);
      return;
    }
    const gen = this.gen;
    const voice = this.voiceOf(lang);
    const texts = this.texts;
    // o Chrome às vezes fica parado depois de a aba ir para o fundo: o resume() acorda (sem efeito se não está)
    synth.resume();
    for (let i = from; i < texts.length; i++) {
      const u = this.utterance(texts[i]);
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? VOICE_LANGS[lang].tag;
      u.rate = this.rate();
      u.volume = soundVolume();
      u.onstart = () => {
        if (gen !== this.gen) return;
        this.at.set(i);
        this.word.set(null);
      };
      u.onboundary = (e) => {
        if (gen !== this.gen || e.name !== 'word') return;
        const rest = texts[i].slice(e.charIndex);
        const len = e.charLength || (/^[\p{L}\p{N}]+/u.exec(rest)?.[0].length ?? 1);
        this.word.set({ from: e.charIndex, to: e.charIndex + len });
      };
      u.onend = () => {
        if (gen !== this.gen) return;
        const pending = this.pendingFrom;
        if (pending !== null) {
          // a nota mudou durante esta frase: segue nas frases novas
          if (pending < this.texts.length) this.play(pending);
          else this.finish();
        } else if (i === texts.length - 1) this.finish();
      };
      u.onerror = (e) => {
        // a fila cancelada (pausar, voltar, trocar a voz) avisa "interrupted" ou "canceled": não é erro
        if (gen !== this.gen || e.error === 'interrupted' || e.error === 'canceled') return;
        this.silence();
        this.playing.set(false);
        this.failure.set(failureOf(e.error));
      };
      this.queue.push(u);
      synth.speak(u);
    }
    this.at.set(from);
    this.playing.set(true);
    if (needsKeepAlive(voice)) {
      this.keepAlive = setInterval(() => {
        if (gen !== this.gen || !synth.speaking) return;
        synth.pause();
        synth.resume();
      }, KEEP_ALIVE_MS);
    }
  }

  /** Acabou: nenhuma frase fica marcada, e tocar de novo começa do começo. */
  private finish(): void {
    this.silence();
    this.playing.set(false);
    this.ended.set(true);
    this.at.set(-1);
  }

  private save(next: Stored): void {
    this.stored.set(next);
    writeJson(VOZ_KEY, next);
  }
}
