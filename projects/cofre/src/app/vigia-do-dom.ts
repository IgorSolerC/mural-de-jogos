/**
 * A vigia do DOM (seção 10, "Comportamentos de segurança"): avisa quando aparece na página algo que o
 * cofre não pôs, o sinal típico de uma extensão do navegador injetando coisas (que poderia ler o que se
 * digita). Ela não impede nada; a tela mostra o aviso para a pessoa fechar o cofre e usar um perfil sem
 * extensões.
 *
 * O que o cofre põe: tudo dentro do <cofre-root>, e os <style> que o Angular acrescenta no <head> com o
 * nonce da página. Qualquer outra coisa fora do <cofre-root> conta; dentro dele, só o que nunca é do
 * cofre (script, iframe, object, embed), também quando vem dentro de outro elemento.
 *
 * Ao começar, a vigia olha também o que já estava na página: uma extensão que mexe logo no carregamento
 * põe as coisas antes de o cofre subir, e a observação só vê o que muda depois. Do index.html do build,
 * só valem as metas, o título, a base, os links e scripts da própria origem, e o <cofre-root>.
 */
const NUNCA_DO_COFRE = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'FRAME']);
const SELETOR_DO_NUNCA = [...NUNCA_DO_COFRE].map((t) => t.toLowerCase()).join(',');
/** O que o index.html do build tem no <head> sem precisar conferir mais nada. */
const DA_CABECA = new Set(['META', 'TITLE', 'BASE']);

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
      // um <div> com um <iframe> dentro, posto de uma vez, chega como um <div> só
      const nunca = NUNCA_DO_COFRE.has(no.tagName) ? no : no.querySelector(SELETOR_DO_NUNCA);
      return nunca ? `<${nunca.tagName.toLowerCase()}> dentro do cofre` : null;
    }
    if (this.estiloDoAngular(no)) return null;
    return `<${no.tagName.toLowerCase()}> fora do cofre`;
  }

  /** Um <style> no <head> com o nonce da página (sem nonce, no `ng serve`, qualquer um). */
  private estiloDoAngular(no: Element): boolean {
    if (no.tagName !== 'STYLE' || no.parentNode !== this.documento.head) return false;
    const nonce = this.nonce();
    // o navegador esconde o atributo nonce depois de aplicá-lo (fica só na propriedade .nonce)
    return nonce === null || ((no as HTMLElement).nonce || no.getAttribute('nonce')) === nonce;
  }

  /** Um endereço da própria página (os arquivos do build), não de uma extensão ou de outro site. */
  private daOrigem(url: string | null): boolean {
    if (!url) return false;
    try {
      const base = new URL(this.documento.baseURI);
      return new URL(url, base).origin === base.origin;
    } catch {
      return false;
    }
  }

  /** O que já estava na página antes de a vigia começar é o do index.html do build? */
  varrer(): string | null {
    const { head, body, documentElement } = this.documento;
    const raiz = this.documento.querySelector('cofre-root');
    const fora = (e: Element) => `<${e.tagName.toLowerCase()}> fora do cofre`;
    for (const e of Array.from(documentElement.children)) if (e !== head && e !== body) return fora(e);
    for (const e of Array.from(head?.children ?? [])) {
      const doBuild =
        DA_CABECA.has(e.tagName) || this.estiloDoAngular(e) || (e.tagName === 'LINK' && this.daOrigem(e.getAttribute('href'))) || (e.tagName === 'SCRIPT' && this.daOrigem(e.getAttribute('src')));
      if (!doBuild) return fora(e);
    }
    for (const e of Array.from(body?.children ?? [])) {
      if (e === raiz) continue;
      const doBuild = (e.tagName === 'LINK' && this.daOrigem(e.getAttribute('href'))) || (e.tagName === 'SCRIPT' && this.daOrigem(e.getAttribute('src')));
      if (!doBuild) return fora(e);
    }
    const nunca = raiz?.querySelector(SELETOR_DO_NUNCA);
    return nunca ? `<${nunca.tagName.toLowerCase()}> dentro do cofre` : null;
  }

  comecar(): void {
    const jaEstava = this.varrer();
    if (jaEstava) this.aoVer(jaEstava);
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
