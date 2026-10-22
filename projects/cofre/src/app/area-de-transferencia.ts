import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { SERVICOS } from './servicos';

/** Quanto tempo até a área de transferência ser limpa. */
export const LIMPAR_COPIA_MS = 30_000;

/** Onde fica a hora da limpeza, para ela sobreviver a trancar (que recarrega a página). Só a hora, nunca o texto. */
export const CHAVE_DA_LIMPEZA = 'cofre:limpar-copia';

/**
 * A área de transferência do cofre (seção 10: "Copiar (limpa em 30 s)"), num lugar só para a página
 * inteira, para a limpeza sobreviver a fechar o item. O navegador só deixa escrever na área de
 * transferência com a página em foco, e quem copia uma senha costuma ir colar em outro app: lá, a senha
 * continua no Ctrl+V até a página voltar ao foco, e só então a limpeza acontece (conferido no Chrome: fora
 * de foco, a escrita é recusada ou nem termina). Trancar recarrega a página, então a hora da limpeza fica
 * no `sessionStorage` da aba (a segunda exceção da seção 7.4) e a página nova termina o serviço. Ler a
 * área de transferência é proibido (`Permissions-Policy`), então limpar é sobrescrever: se a pessoa copiou
 * outra coisa nesse meio-tempo, isso também some. O histórico do Windows (Win+V) guarda a sua própria
 * cópia, que nenhuma página alcança.
 */
@Injectable({ providedIn: 'root' })
export class AreaDeTransferencia {
  private readonly servicos = inject(SERVICOS);
  private readonly janela = inject(DOCUMENT).defaultView;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendente = false;

  constructor() {
    this.janela?.addEventListener('focus', () => void this.limparSePendente());
    // uma limpeza que a página anterior (antes de trancar) deixou por fazer
    const hora = Number(this.ler());
    if (hora) this.marcar(hora - Date.now());
  }

  /** Copia e marca a limpeza para daqui a 30 segundos. */
  async copiar(texto: string): Promise<void> {
    await this.servicos.pagina.copiar(texto);
    this.gravar(String(Date.now() + LIMPAR_COPIA_MS));
    this.marcar(LIMPAR_COPIA_MS);
  }

  /** Tenta limpar; sem foco, fica para quando a página voltar. */
  async limparSePendente(): Promise<void> {
    if (!this.pendente) return;
    try {
      await this.servicos.pagina.copiar('');
      this.pendente = false;
      this.gravar(null);
    } catch {
      /* sem foco agora: tenta de novo no próximo focus */
    }
  }

  get temLimpezaPendente(): boolean {
    return this.pendente;
  }

  private marcar(ms: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.pendente = false;
    this.timer = setTimeout(
      () => {
        this.timer = null;
        this.pendente = true;
        void this.limparSePendente();
      },
      Math.max(0, ms),
    );
  }

  private ler(): string | null {
    try {
      return this.janela?.sessionStorage.getItem(CHAVE_DA_LIMPEZA) ?? null;
    } catch {
      return null;
    }
  }

  private gravar(hora: string | null): void {
    try {
      if (hora === null) this.janela?.sessionStorage.removeItem(CHAVE_DA_LIMPEZA);
      else this.janela?.sessionStorage.setItem(CHAVE_DA_LIMPEZA, hora);
    } catch {
      /* sem sessionStorage: a limpeza vale só enquanto a página não recarregar */
    }
  }
}

/**
 * O bilhete de quando algo é copiado: diz o que é verdade. A limpeza só acontece com o cofre na frente, e
 * no Windows o Win+V guarda uma cópia que o cofre não apaga.
 */
export function avisoDaCopia(oQue: string, agente: string): string {
  const copiado = /^senha/i.test(oQue) ? 'copiada' : 'copiado';
  const windows = /Windows/.test(agente) ? ' O histórico do Win+V guarda uma cópia.' : '';
  return `${oQue} ${copiado}. Sai do Ctrl+V depois de 30 s, quando o cofre estiver na frente.${windows}`;
}
