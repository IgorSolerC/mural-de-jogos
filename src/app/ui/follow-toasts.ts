import { Injectable, inject } from '@angular/core';
import { Follow } from '../core/follow';
import { Toasts } from './toast';

/** O que o bilhete diz quando a nuvem não respondeu a um pedido, sem dizer por quê. */
export const TRY_AGAIN = 'Não deu certo agora. Tente de novo.';

/** A mensagem de um erro para o bilhete: a da nuvem, ou o "tente de novo". */
export function failedText(err: unknown): string {
  return err instanceof Error ? err.message : TRY_AGAIN;
}

/**
 * Seguir e deixar de seguir com o bilhete, com as mesmas palavras em todo lugar (o mural de um amigo,
 * o perfil, Amigos e a folha de Pessoas). Quem chama cuida do botão esperando e do erro (`failedText`).
 */
@Injectable({ providedIn: 'root' })
export class FollowToasts {
  private readonly follow = inject(Follow);
  private readonly toasts = inject(Toasts);

  /** Segue; com `undo`, o bilhete também tem o Desfazer (a folha de Pessoas). */
  async start(code: string, name: string, undo = false): Promise<void> {
    await this.follow.follow(code);
    this.toasts.show(
      `Agora você segue ${name}. As resenhas novas aparecem em Amigos.`,
      undo ? { label: 'Desfazer', run: () => void this.follow.unfollow(code).catch((err) => this.toasts.show(failedText(err))) } : undefined,
    );
  }

  /** Deixa de seguir, com o Desfazer (seguir de novo não manda outro aviso para a pessoa). */
  async stop(code: string, name: string): Promise<void> {
    await this.follow.unfollow(code);
    // o Desfazer que a nuvem recusa (o limite do dia, sem rede) diz por quê: calado, parecia ter voltado a seguir
    this.toasts.show(`Você deixou de seguir ${name}`, { label: 'Desfazer', run: () => void this.follow.follow(code).catch((err) => this.toasts.show(failedText(err))) });
  }
}
