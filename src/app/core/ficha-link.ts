import { Injectable, inject, signal } from '@angular/core';
import { BackupSnapshot, parseBackupSnapshot, readBackupFile } from './backup-file';
import { CategoryLooks } from './category-looks';
import { CloudAccount, CloudError } from './cloud-account';
import { normalizeCode } from './cloud-murals';
import { PageBackground } from './profile';
import { Review, isPrivate } from './review';

/**
 * O link de uma ficha: quem abre vê só ela, maximizada, sem precisar de conta (ver pages/ficha-page.ts).
 * A ficha sai do mural público do dono na nuvem, o mesmo que se abre pelo código: toda ficha que não é
 * privada tem link, as anotações só no Kanban também (elas vão no público à parte, em `soKanban`, fora
 * do mural de quem visita; ver `CloudSync.push`).
 */
export const FICHA_PATH = '/ficha';

/**
 * Como o link começa: com a ficha aberta (o de sempre) ou fechada, como ela fica pregada no mural
 * (`?aberta=nao`), e um toque a abre.
 */
export const OPEN_PARAM = 'aberta';

/** O link que abre a ficha `id` do mural de quem tem o código `code`; `open` falso: começa fechada. */
export function fichaLink(code: string, id: string, base: string = location.origin + location.pathname, open = true): string {
  return `${base}#${FICHA_PATH}/${code}/${encodeURIComponent(id)}${open ? '' : `?${OPEN_PARAM}=nao`}`;
}

/** O link pede a ficha fechada? `aberta=nao` (e `não`, `false`, `0`, para quem escreve o link à mão). */
export function startsClosed(value: string | null): boolean {
  return value !== null && ['nao', 'não', 'false', '0'].includes(value.trim().toLowerCase());
}

/** A página aberta é a de uma ficha pelo link (o site fica só com a ficha). */
export function isFichaPath(path: string): boolean {
  return path === FICHA_PATH || path.startsWith(FICHA_PATH + '/');
}

/** A ficha tem link: não é privada. */
export function hasLink(r: Pick<Review, 'private'>): boolean {
  return !isPrivate(r);
}

/** O mural público de alguém, como o link lê: as fichas do mural e as anotações só no Kanban. */
export interface LinkedMural {
  /** Todas as fichas que os outros alcançam (o mural e as só no Kanban), sem as privadas. */
  cards: Review[];
  ownerName: string | null;
  profile: BackupSnapshot['profile'];
  /** O ícone e a cor dos grupos de quem escreveu, para a ficha minimizada ficar como no mural dela. */
  categoryLooks: CategoryLooks;
}

/** Lê o mural público (o JSON) com as anotações que estão só no Kanban (`soKanban`) junto das outras. */
export function readLinkedMural(text: string): LinkedMural {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('O mural que veio da nuvem não abriu.');
  }
  const object = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  const notas = Array.isArray(object?.['notas']) ? (object['notas'] as unknown[]) : [];
  const board = Array.isArray(object?.['soKanban']) ? (object['soKanban'] as unknown[]) : [];
  // junta já lido: o mural pode ter megas, e o texto não precisa ir e voltar do JSON outra vez
  const snap = parseBackupSnapshot({ parsed: object && board.length ? { ...object, notas: [...notas, ...board] } : data });
  return { cards: snap.reviews, ownerName: snap.ownerName, profile: snap.profile, categoryLooks: snap.categoryLooks ?? {} };
}

/** O que a página do link encontrou. */
export type LinkedCard =
  | { kind: 'ok'; card: Review; mural: LinkedMural; code: string }
  | { kind: 'sem-ficha' }
  | { kind: 'sem-codigo' }
  /** A nuvem só mostra os murais para quem entrou (`VER_MURAIS=logados`), e quem abriu não entrou. */
  | { kind: 'entrar' }
  | { kind: 'erro'; message: string };

/**
 * Busca a ficha do link na nuvem. Não guarda nada neste navegador (o mural da pessoa não vira colega
 * do Comparar): quem abre um link quer ler aquela ficha, só.
 */
@Injectable({ providedIn: 'root' })
export class FichaLinks {
  private readonly account = inject(CloudAccount);

  /** A parede de quem escreveu a ficha, atrás dela na página do link (null: a de sempre). */
  readonly wall = signal<PageBackground | null>(null);
  /** A ficha minimizada: como ela fica pregada no mural (o "Minimizar" da leitura solta). */
  readonly minimized = signal(false);

  async fetch(rawCode: string, id: string): Promise<LinkedCard> {
    const code = normalizeCode(rawCode);
    if (!code || !id) return { kind: 'sem-codigo' };
    let res: Response;
    try {
      res = await this.account.requestRaw(`/v1/murais/${code}`);
    } catch (err) {
      if (err instanceof CloudError && err.status === 404) return { kind: 'sem-codigo' };
      // a nuvem que só mostra os murais com conta: tentar de novo não adianta, entrar sim
      if (err instanceof CloudError && err.status === 401) return { kind: 'entrar' };
      // a nuvem fora, a cota, a internet: a frase é sempre a mesma, em português
      return { kind: 'erro', message: 'Não deu para falar com a nuvem. Confira a internet e toque em Tentar de novo.' };
    }
    try {
      const mural = readLinkedMural(await readBackupFile(await res.blob()));
      const card = mural.cards.find((r) => r.id === id);
      return card ? { kind: 'ok', card, mural, code } : { kind: 'sem-ficha' };
    } catch {
      return { kind: 'erro', message: 'O mural de quem escreveu veio estragado da nuvem. Tente de novo daqui a pouco.' };
    }
  }
}
