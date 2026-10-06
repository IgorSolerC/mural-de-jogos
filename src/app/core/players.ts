import { Injectable, computed, inject, signal } from '@angular/core';
import { ColleagueStore } from './colleague-store';
import { Mural } from './mural';
import { Review, originalsOf } from './review';

const KEY = 'mural-de-jogos:extras-dono:v1';

/** "Eu" e cada colega carregado em Comparar. */
export const ME = 'eu';

/** Um mural com que dá para jogar os Extras: o seu ou o de um colega, só as fichas do mural aberto. */
export interface Player {
  /** `ME` ou o id do colega no ColleagueStore. */
  id: string;
  /** "Você" ou o nome do colega. */
  name: string;
  mine: boolean;
  /** As fichas originais, uma por obra: é com elas que os jogos jogam. */
  reviews: Review[];
  /** As originais e as rejogadas: o que conta no tempo, nas Estatísticas. */
  sessions: Review[];
}

function readChosen(): string {
  try {
    return localStorage.getItem(KEY) || ME;
  } catch {
    return ME;
  }
}

/**
 * De quem são as fichas dos jogos de Extras. Todo jogo (o mata-mata hoje, os quizzes depois) pergunta
 * por aqui: o seu mural ou o backup de um colega aberto em Comparar, sempre só o mural aberto no
 * cartaz. Nada de um colega entra nas suas resenhas; os jogos só leem.
 */
@Injectable({ providedIn: 'root' })
export class Players {
  private readonly mural = inject(Mural);
  private readonly colleagues = inject(ColleagueStore);

  readonly loading = this.colleagues.loading;

  readonly all = computed<Player[]>(() => {
    const kind = this.mural.kind();
    return [
      { id: ME, name: 'Você', mine: true, reviews: this.mural.reviews(), sessions: this.mural.wall() },
      ...this.colleagues.colleagues().map((c) => {
        const sessions = c.reviews.filter((r) => r.kind === kind);
        return { id: c.id, name: c.name, mine: false, reviews: originalsOf(sessions), sessions };
      }),
    ];
  });

  private readonly chosenId = signal(readChosen());

  /**
   * O escolhido. Se o colega saiu de Comparar, ou não tem nada no mural aberto (resenha jogos, mas
   * nenhum livro), vale o seu. A escolha fica guardada: de volta ao mural em que o colega tem fichas,
   * ele volta a ser o escolhido.
   */
  readonly selected = computed<Player>(() => {
    const list = this.all();
    const chosen = list.find((p) => p.id === this.chosenId());
    return chosen && (chosen.mine || chosen.sessions.length) ? chosen : list[0];
  });

  /** O colega escolhido que ficou de lado porque não tem nada no mural aberto (para avisar). */
  readonly setAside = computed<Player | null>(() => {
    const chosen = this.all().find((p) => p.id === this.chosenId());
    return chosen && !chosen.mine && !chosen.sessions.length ? chosen : null;
  });

  select(id: string): void {
    this.chosenId.set(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* vale até recarregar */
    }
  }

  byId(id: string): Player | undefined {
    return this.all().find((p) => p.id === id);
  }
}
