/**
 * A vigia do DOM (seção 10, "Comportamentos de segurança"): avisa quando aparece na página algo que o
 * cofre não pôs, o sinal típico de uma extensão do navegador injetando coisas (que poderia ler o que se
 * digita). Ela não impede nada; a tela mostra o aviso para a pessoa fechar o cofre e usar um perfil sem
 * extensões.
 *
 * O que o cofre põe: tudo dentro do <cofre-root>, e os <style> que o Angular acrescenta no <head> com o
 * nonce da página. Qualquer outra coisa fora do <cofre-root> conta; dentro dele, só o que nunca é do
 * cofre (script, iframe, object, embed).
 */
const NUNCA_DO_COFRE = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'FRAME']);

export class VigiaDoDom {
  private observador: MutationObserver | null = null;

  constructor(
    private readonly documento: Document,
    private readonly aoVer: (oQue: string) => void,
  ) {}

  /** O nonce que o Worker pôs no <cofre-root> (no `ng serve` não há). */
  private nonce(): string | null {
    return this.documento.querySelector('cofre-root')?.getAttribute('ngcspnonce') ?? null;
  }

  /** O que foi acrescentado é do cofre? */
  estranho(no: Node): string | null {
    if (!(no instanceof Element)) return null;
    const raiz = this.documento.querySelector('cofre-root');
    if (raiz && (raiz === no || raiz.contains(no))) {
      return NUNCA_DO_COFRE.has(no.tagName) ? `<${no.tagName.toLowerCase()}> dentro do cofre` : null;
    }
    if (no.tagName === 'STYLE' && no.parentNode === this.documento.head) {
      const nonce = this.nonce();
      // o navegador esconde o atributo nonce depois de aplicá-lo (fica só na propriedade .nonce)
      if (nonce === null || ((no as HTMLElement).nonce || no.getAttribute('nonce')) === nonce) return null;
    }
    return `<${no.tagName.toLowerCase()}> fora do cofre`;
  }

  comecar(): void {
    this.observador = new MutationObserver((mudancas) => {
      for (const m of mudancas) {
        for (const no of m.addedNodes) {
          const oQue = this.estranho(no);
          if (oQue) {
            this.aoVer(oQue);
            return;
          }
        }
      }
    });
    this.observador.observe(this.documento.documentElement, { childList: true, subtree: true });
  }

  parar(): void {
    this.observador?.disconnect();
    this.observador = null;
  }
}
