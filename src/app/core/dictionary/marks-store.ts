import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { localDay, stampAfter } from '../dates';
import { onOtherTab, writeJson } from '../storage';
import { fromOtherTab } from '../tab-join';
import { DictMarksState, MarkedWord, NO_MARKS, WordMark, isLearned, learnedDay, markSays, mergeDictMarks, sanitizeDictMarks, withMark } from './marks';

/** As marcas deste navegador (saem na limpeza do logout pelo prefixo). */
export const DICT_MARKS_KEY = 'meu-mural:dicionario:v1';

function read(): DictMarksState {
  try {
    return sanitizeDictMarks(JSON.parse(localStorage.getItem(DICT_MARKS_KEY) ?? 'null'));
  } catch {
    return NO_MARKS;
  }
}

/**
 * As marcas do dono no Dicionário Japonês (aprendida, favorita; ver core/dictionary/marks.ts): guardadas neste
 * navegador e, com conta, no mural privado da nuvem (`dicionario`, ver core/cloud-sync.ts). Só as marcas: as
 * palavras (o CSV) ficam no pedaço da página, e este serviço não as carrega.
 */
@Injectable({ providedIn: 'root' })
export class DictionaryMarks {
  readonly state = signal<DictMarksState>(read());
  /** As marcas pelo id da palavra. */
  readonly byId = computed(() => new Map(this.state().marks.map((m) => [m.id, m])));
  /** Quantas palavras têm marca de verdade (a que voltou ao CSV não conta). */
  readonly count = computed(() => this.state().marks.filter(markSays).length);

  constructor() {
    effect(() => writeJson(DICT_MARKS_KEY, this.state()));
    // outra aba marcou: esta acompanha, sem gravar a de antes por cima
    inject(DestroyRef).onDestroy(onOtherTab(DICT_MARKS_KEY, (before) => this.state.set(fromOtherTab(DICT_MARKS_KEY, before, this.state(), read, sanitizeDictMarks))));
  }

  get(id: string): WordMark | undefined {
    return this.byId().get(id);
  }

  learned(w: MarkedWord): boolean {
    return isLearned(w, this.get(w.id));
  }

  learnedDay(w: MarkedWord): string | null {
    return learnedDay(w, this.get(w.id));
  }

  favorite(id: string): boolean {
    return !!this.get(id)?.favorite;
  }

  /** Marca (ou desmarca) como aprendida e devolve como desfazer: a marca volta como era, se ninguém mexeu nela no meio. */
  setLearned(w: MarkedWord, learned: boolean): () => void {
    // voltar ao que o CSV diz apaga a escolha (e o CSV volta a dar o dia de antes)
    if (learned === !!w.learnedOn) return this.change(w.id, { learned: undefined, learnedOn: undefined, favorite: this.favorite(w.id) });
    return this.change(w.id, { learned, learnedOn: learned ? localDay(new Date()) : undefined, favorite: this.favorite(w.id) });
  }

  /** Liga ou desliga a favorita e devolve como desfazer. */
  setFavorite(id: string, favorite: boolean): () => void {
    const m = this.get(id);
    return this.change(id, { learned: m?.learned, learnedOn: m?.learnedOn, favorite });
  }

  /** Junta as marcas que vieram da nuvem (cada palavra, a mudada por último). */
  merge(remote: DictMarksState): void {
    const next = mergeDictMarks(this.state(), remote);
    if (JSON.stringify(next) !== JSON.stringify(this.state())) this.state.set(next);
  }

  private change(id: string, patch: Pick<WordMark, 'learned' | 'learnedOn' | 'favorite'>): () => void {
    const before = this.get(id);
    const after = withMark(before, id, patch, stampAfter(before?.at));
    this.put(after);
    return () => {
      // só desfaz se a marca ainda é a que esta mudança pôs
      if (this.get(id)?.at !== after.at) return;
      const now = this.get(id);
      this.put(withMark(now, id, { learned: before?.learned, learnedOn: before?.learnedOn, favorite: before?.favorite }, stampAfter(now?.at)));
    };
  }

  private put(m: WordMark): void {
    this.state.set(mergeDictMarks({ marks: this.state().marks.filter((x) => x.id !== m.id) }, { marks: [m] }));
  }
}
