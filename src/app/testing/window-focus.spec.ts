/**
 * O foco nos testes do site, com a janela do navegador sem o foco do sistema.
 *
 * O Chrome só manda os eventos do foco (`blur`, `focusout`, `focus`, `focusin`) e só casa o `:focus` e
 * o `:focus-within` com a janela dele no foco do sistema. Com outra janela na frente (a suíte inteira
 * demora, e quem roda vai fazer outra coisa), o `focus()` e o `blur()` mudam o `document.activeElement`,
 * mas os eventos só chegam quando a janela voltar: o editor não sabe que se escreve nele, a régua não
 * prende, o campo não grava ao sair. O headless finge o foco sempre, e por isso lá passa.
 *
 * Aqui, sem o foco da janela, o `focus()` e o `blur()` de qualquer elemento (dos testes e dos
 * componentes) mandam os eventos à mão, na ordem do navegador. Entra nos `polyfills` do teste
 * (angular.json), antes de qualquer spec; o que só o CSS mostra fica com `needsWindowFocus`.
 *
 * (O arquivo termina em .spec.ts para ficar fora do build do site, que exclui os specs.)
 */

/** Já instalado (o arquivo também entra como spec, numa segunda cópia). */
const INSTALLED = Symbol.for('meu-mural:testes:foco-da-janela');

type Focusable = HTMLElement | SVGElement;

/** De onde o foco saiu, como o navegador diz no `relatedTarget` (o corpo da página não conta). */
function origin(el: Element | null): Element | null {
  return el && el !== document.body && el !== document.documentElement ? el : null;
}

function leave(from: Element, to: Element | null): void {
  from.dispatchEvent(new FocusEvent('blur', { composed: true, relatedTarget: to }));
  from.dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true, relatedTarget: to }));
}

function install(): void {
  const w = window as unknown as Record<symbol, boolean>;
  if (w[INSTALLED]) return;
  w[INSTALLED] = true;
  for (const proto of [HTMLElement.prototype, SVGElement.prototype]) {
    const focus = proto.focus;
    const blur = proto.blur;
    proto.focus = function (this: Focusable, options?: FocusOptions): void {
      const from = origin(document.activeElement);
      focus.call(this, options);
      if (document.hasFocus() || from === this || document.activeElement !== this) return;
      if (from) leave(from, this);
      this.dispatchEvent(new FocusEvent('focus', { composed: true, relatedTarget: from }));
      this.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true, relatedTarget: from }));
    };
    proto.blur = function (this: Focusable): void {
      const had = document.activeElement === this;
      blur.call(this);
      if (document.hasFocus() || !had || document.activeElement === this) return;
      leave(this, null);
    };
  }
}

install();

/**
 * O que só o CSS mostra com o foco (`:focus`, `:focus-within`) não casa sem o foco da janela, e não há
 * como fingir: o teste fica pendente, com o porquê (no headless e com a janela na frente, ele roda).
 */
export function needsWindowFocus(): void {
  if (!document.hasFocus()) pending('a janela do navegador está sem o foco do sistema: o :focus-within não casa');
}
