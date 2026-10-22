import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { SERVICOS } from './servicos';

/** Quanto tempo até a área de transferência ser limpa. */
export const LIMPAR_COPIA_MS = 30_000;

/**
 * A área de transferência do cofre (seção 10: "Copiar (limpa em 30 s)"), num lugar só para a página
 * inteira, para a limpeza sobreviver a fechar o item. O navegador só deixa escrever na área de
 * transferência com a página em foco, e quem copia uma senha costuma ir colar em outro app: se a limpeza
 * falhar, ela fica pendente e acontece assim que a página voltar ao foco. Ler a área de transferência é
 * proibido (`Permissions-Policy`), então limpar é sobrescrever: se a pessoa copiou outra coisa nesse
 * meio-tempo, isso também some.
 */
@Injectable({ providedIn: 'root' })
export class AreaDeTransferencia {
  private readonly servicos = inject(SERVICOS);
  private readonly janela = inject(DOCUMENT).defaultView;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendente = false;

  constructor() {
    this.janela?.addEventListener('focus', () => void this.limparSePendente());
  }

  /** Copia e marca a limpeza para daqui a 30 segundos. */
  async copiar(texto: string): Promise<void> {
    await this.servicos.pagina.copiar(texto);
    if (this.timer) clearTimeout(this.timer);
    this.pendente = false;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.pendente = true;
      void this.limparSePendente();
    }, LIMPAR_COPIA_MS);
  }

  /** Tenta limpar; sem foco, fica para quando a página voltar. */
  async limparSePendente(): Promise<void> {
    if (!this.pendente) return;
    try {
      await this.servicos.pagina.copiar('');
      this.pendente = false;
    } catch {
      /* sem foco agora: tenta de novo no próximo focus */
    }
  }

  get temLimpezaPendente(): boolean {
    return this.pendente;
  }
}
