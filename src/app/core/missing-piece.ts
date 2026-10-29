import { ErrorHandler, Injectable, inject } from '@angular/core';
import { Toasts } from '../ui/toast';

/**
 * Um pedaço do site que não chegou. O que só abre quando alguém toca (as Configurações do mural, o
 * painel de emojis, Compartilhar, as folhas dos widgets: os `@defer`) vem num arquivo à parte, pedido
 * na hora. Cada publicação troca o site inteiro no servidor, e uma página aberta antes dela pedia um
 * arquivo que não existe mais: a folha não abria, sem aviso nenhum, e o botão ficava preso até
 * recarregar. O service worker agora guarda todo o código da versão aberta (ver keepVersion em
 * public/sw.js); quando mesmo assim falta (sem internet na hora de guardar, economia de dados), o
 * bilhete diz o que houve e recarrega numa tecla.
 */

/** As mensagens de cada navegador para um import que falhou, e a do Angular para um `@defer` que não carregou. */
const MISSING = /NG0750|dynamically imported module|Importing a module script failed|Failed to load module script|Loading chunk/i;

/** O erro (ou a causa dele) é um pedaço do site que não chegou? */
export function isMissingPiece(err: unknown): boolean {
  let e = err;
  for (let depth = 0; e && depth < 5; depth++) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
    if (MISSING.test(message)) return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

export const MISSING_ONLINE = 'Saiu uma versão nova do Murall. Recarregue a página para abrir isto.';
export const MISSING_OFFLINE = 'Sem internet, isto ainda não abre: esta parte do Murall não estava guardada neste aparelho.';

/**
 * Há internet de verdade? O `navigator.onLine` diz que sim numa rede sem saída (o Wi-Fi que pede login,
 * o roteador sem linha), e lá recarregar só traria a mesma versão guardada. O HEAD vai à rede (o
 * service worker só atende GET) e sem cache: qualquer resposta é internet.
 */
export async function reachable(): Promise<boolean> {
  if (navigator.onLine === false) return false;
  try {
    await fetch('./', { method: 'HEAD', cache: 'no-store' });
    return true;
  } catch {
    return false;
  }
}

/** O de sempre (o erro no console), e o bilhete quando o erro é um pedaço que não chegou. */
@Injectable()
export class MuralErrorHandler extends ErrorHandler {
  private readonly toasts = inject(Toasts);
  /** Recarregar a página (trocado nos testes). */
  reload = () => location.reload();
  /** Há internet (trocado nos testes). */
  online = reachable;

  override handleError(error: unknown): void {
    super.handleError(error);
    if (!isMissingPiece(error)) return;
    void this.online()
      .catch(() => false)
      .then((online) => {
        if (!online) this.toasts.show(MISSING_OFFLINE, undefined, 9000);
        else this.toasts.show(MISSING_ONLINE, { label: 'Recarregar', run: () => this.reload() }, 20000);
      });
  }
}
