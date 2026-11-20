/**
 * O Ctrl+S nos testes (ui/save-key.ts): disparado no elemento, como o do teclado, sobe pelo documento e pode ser
 * cancelado. (O arquivo termina em .spec.ts para ficar fora do build do site, que exclui os specs.)
 */
export function pressSave(at: Element, extra: KeyboardEventInit = {}): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true, bubbles: true, cancelable: true, composed: true, ...extra });
  at.dispatchEvent(e);
  return e;
}
