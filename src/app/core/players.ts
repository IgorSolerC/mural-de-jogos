import { Injectable, computed, inject, signal } from '@angular/core';
import { ColleagueStore } from './colleague-store';
import { Mural } from './mural';
import { Review } from './review';

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
  reviews: Review[];
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
      { id: ME, name: 'Você', mine: true, reviews: this.mural.reviews() },
      ...this.colleagues.colleagues().map((c) => ({
        id: c.id,
        name: c.name,
        mine: false,
        reviews: c.reviews.filter((r) => r.kind === kind),
      })),
    ];
  });

  private readonly chosenId = signal(readChosen());

  /** O escolhido; se o colega saiu de Comparar, volta para o seu. */
  readonly selected = computed<Player>(() => {
    const list = this.all();
    return list.find((p) => p.id === this.chosenId()) ?? list[0];
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
