import { Directive, ElementRef, Signal, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { CloudAccount } from '../core/cloud-account';
import { ImageStore } from '../core/image-store';
import { ImageSync } from '../core/image-sync';
import { localImageId } from '../core/images';

/**
 * O endereço que mostra uma imagem guardada pelo Murall (`murall://imagem/ID`, ver core/images.ts): procura neste
 * aparelho; sem ela aqui, desce da nuvem com a sessão e fica guardada; fora da conta (quem visita sem entrar), o
 * endereço público, que a nuvem só entrega se a imagem está à mostra. Procura de novo quando outra imagem é guardada
 * nesta aba, quando a sincronização termina uma rodada e quando a conta entra ou sai.
 *
 * `undefined` enquanto procura (e sem id), o endereço quando acha, null quando ela não está em lugar nenhum. Trocar
 * de id volta a `undefined`: a imagem de antes não aparece no lugar da nova. Chamar no contexto de injeção.
 */
export function storedImageSrc(id: () => string | null): Signal<string | null | undefined> {
  const images = inject(ImageStore);
  const sync = inject(ImageSync);
  const account = inject(CloudAccount);
  const out = signal<string | null | undefined>(undefined);
  let last: string | null = null;
  effect((onCleanup) => {
    const current = id();
    untracked(() => {
      if (current === last) return;
      last = current;
      out.set(undefined);
    });
    // sem id (um link comum), nada mais a ouvir: a capa de link não acorda a cada imagem guardada ou rodada
    if (!current) return;
    images.version();
    sync.round();
    const signedIn = account.signedIn();
    let alive = true;
    onCleanup(() => (alive = false));
    void images
      .url(current)
      .then((url) => url ?? (signedIn ? sync.fetch(current) : sync.publicUrl(current)))
      .catch(() => null)
      .then((url) => alive && out.set(url));
  });
  return out.asReadonly();
}

/**
 * O `src` de um `<img>` que pode ser um link ou uma imagem guardada pelo Murall: a capa das fichas e dos recortes, em
 * todo lugar que a desenha. O link vai como está; a guardada, pelo endereço de `storedImageSrc`. Enquanto a guardada
 * procura, o `<img>` fica sem `src` e com `data-esperando` (o PDF espera, ver ui/pdf-sheet.ts); a que não está em
 * lugar nenhum dispara o `error` do `<img>`, então quem usa cai no "sem capa" que já tem para o link quebrado.
 */
@Directive({
  selector: 'img[muralSrc]',
  host: {
    '[attr.src]': 'src()',
    '[attr.data-esperando]': 'seeking() ? "" : null',
  },
})
export class MuralSrc {
  /** O link, o `murall://imagem/ID`, ou nada. */
  readonly muralSrc = input<string | null | undefined>(null);

  private readonly id = computed(() => localImageId(this.muralSrc() ?? ''));
  private readonly stored = storedImageSrc(this.id);
  protected readonly src = computed(() => (this.id() ? (this.stored() ?? null) : this.muralSrc() || null));
  protected readonly seeking = computed(() => !!this.id() && this.stored() === undefined);

  constructor() {
    const img = inject<ElementRef<HTMLImageElement>>(ElementRef).nativeElement;
    effect(() => {
      if (this.id() && this.stored() === null) untracked(() => img.dispatchEvent(new Event('error')));
    });
  }
}
