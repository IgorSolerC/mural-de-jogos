/** O aparelho é da Apple: os atalhos são com o ⌘ (Command), não com o Ctrl. */
export const ON_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** Um atalho com a tecla de comando, como está escrito no teclado de quem usa: "Ctrl+C" ou "⌘C". */
export const modKey = (letter: string): string => (ON_MAC ? `⌘${letter}` : `Ctrl+${letter}`);
