/**
 * As línguas da voz (core/voz.ts), à parte do serviço: o baralho dos Flashcards guarda a dele (`Deck.voice`, em
 * core/study.ts), e quem só lê os dados não precisa carregar a voz do navegador.
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
