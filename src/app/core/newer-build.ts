import { DestroyRef, Injectable, inject } from '@angular/core';
import { Toasts } from '../ui/toast';
import { BUILD } from './build';
import { freezeStorage, readText, writeText } from './storage';

/**
 * A trava do site velho (PLANO-CANVAS.md, 4.1). O saneamento de cada build guarda só os campos que ela conhece: um
 * site aberto antes de um deploy (outra aba, outro aparelho) que regrava o que um site mais novo escreveu joga fora
 * os campos novos. Por isso, o site que vê que uma build mais nova já esteve aqui recarrega antes de gravar:
 *
 * - **neste navegador**: cada site marca a build dele em `BUILD_SEEN_KEY` na subida (`markBuild`, em main.ts).
 *   Abriu uma mais nova (em outra aba, ou esta é uma versão guardada pelo service worker), as outras recarregam;
 * - **na nuvem**: o mural de lá diz a build que o gravou (ver core/cloud-sync.ts): mais nova que esta, esta não
 *   junta nem envia, e recarrega.
 *
 * Uma vez só por aba e por build (`TRIED_KEY`, no sessionStorage): se a página recarregada ainda é a velha (sem
 * rede, o servidor ainda não trocou), ela fica, e o bilhete pede para recarregar depois. Neste navegador, além
 * disso, ela para de gravar (`freezeStorage`): há uma aba mais nova aqui mesmo, que guarda o que vale.
 */

/** A build mais nova que já abriu neste navegador (sai na limpeza do Sair: começa com `meu-mural:`). */
export const BUILD_SEEN_KEY = 'meu-mural:build';
/** Até que build esta aba já recarregou por causa da trava (no sessionStorage: é só desta aba). */
export const TRIED_KEY = 'meu-mural:recarregou-build';

export const NEWER_TEXT = 'Saiu uma versão nova do Murall. Recarregue a página para continuar.';
export const NEWER_FROZEN_TEXT = 'Saiu uma versão nova do Murall, aberta em outra aba. Recarregue esta: o que mudar aqui não fica guardado.';

/** A build mais nova que já abriu neste navegador (0: nenhuma marcada). */
export function seenBuild(): number {
  const n = Number(readText(BUILD_SEEN_KEY));
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * Na subida (main.ts, depois da limpeza): marca esta build como a mais nova que abriu aqui, se for. Devolve a
 * mais nova que já tinha aberto: maior que `BUILD`, esta é a velha.
 */
export function markBuild(build = BUILD): number {
  const seen = seenBuild();
  if (seen < build) writeText(BUILD_SEEN_KEY, String(build));
  return seen;
}

/** Até que build esta aba já recarregou. */
function tried(): number {
  try {
    const n = Number(sessionStorage.getItem(TRIED_KEY));
    return Number.isInteger(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export type NewerOutcome = 'nao' | 'recarregando' | 'ja-tentou';

/**
 * Uma build mais nova que esta foi vista (`build`): recarrega, uma vez por aba e por build. `freeze` para de gravar
 * antes (e depois, se já tentou): é o caso de uma aba mais nova neste navegador. Devolve o que aconteceu.
 */
export function newerBuildSeen(build: number, opts: { freeze: boolean; reload?: () => void; current?: number }): NewerOutcome {
  const current = opts.current ?? BUILD;
  if (!Number.isInteger(build) || build <= current) return 'nao';
  if (opts.freeze) freezeStorage();
  if (tried() >= build) return 'ja-tentou';
  try {
    // direto, e não pelo `writeText`: a trava acabou de congelar o armazenamento, e esta marca é justamente o que
    // impede a página de recarregar sem fim (é só desta aba, começa com meu-mural: e sai na limpeza do Sair)
    sessionStorage.setItem(TRIED_KEY, String(build));
  } catch {
    // sem sessionStorage, não há como saber se já tentou: não recarrega, para não girar sem fim
    return 'ja-tentou';
  }
  (opts.reload ?? (() => location.reload()))();
  return 'recarregando';
}

/**
 * O lado do app da trava: ouve a marca de outra aba e diz, num bilhete, quando a página não pôde recarregar
 * sozinha. A sincronização chama `seen` com a build do mural da nuvem.
 */
@Injectable({ providedIn: 'root' })
export class NewerBuild {
  private readonly toasts = inject(Toasts);
  /** Recarregar a página (trocado nos testes). */
  reload = () => location.reload();
  /** Já mostrou o bilhete (uma vez por página). */
  private warned = false;

  constructor() {
    if (typeof window === 'undefined') return;
    const heard = (ev: StorageEvent) => {
      if (ev.key === BUILD_SEEN_KEY && ev.newValue !== null) this.seen(Number(ev.newValue), true);
    };
    window.addEventListener('storage', heard);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('storage', heard));
    // a subida já viu (main.ts) e não recarregou: ou já tinha tentado, ou está recarregando
    if (seenBuild() > BUILD) this.seen(seenBuild(), true);
  }

  /** Uma build mais nova foi vista (`here`: neste navegador; senão, na nuvem). Devolve se esta é a velha. */
  seen(build: number, here: boolean): boolean {
    const out = newerBuildSeen(build, { freeze: here, reload: () => this.reload() });
    if (out === 'ja-tentou' && !this.warned) {
      this.warned = true;
      this.toasts.show(here ? NEWER_FROZEN_TEXT : NEWER_TEXT, { label: 'Recarregar', run: () => this.reload() }, 30000);
    }
    return out !== 'nao';
  }
}
