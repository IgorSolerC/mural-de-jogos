/** As regras de estilo carregadas na página, abrindo as de @media; `hover` pega só as de um mouse de verdade. */
function hoverRules(): CSSStyleRule[] {
  const rules: CSSStyleRule[] = [];
  for (const sheet of [...document.styleSheets]) {
    let list: CSSRule[];
    try {
      list = [...sheet.cssRules];
    } catch {
      continue;
    }
    for (const rule of list) {
      if (!(rule instanceof CSSMediaRule) || !rule.conditionText.includes('hover: hover')) continue;
      for (const inner of [...rule.cssRules]) {
        if (inner instanceof CSSStyleRule && inner.selectorText.includes(':hover')) rules.push(inner);
      }
    }
  }
  return rules;
}

/** O botão casa com a regra, se a mão estivesse em cima dele? */
function appliesOnHover(button: HTMLElement, rule: CSSStyleRule): boolean {
  try {
    return button.matches(rule.selectorText.replace(/:hover/g, ''));
  } catch {
    return false;
  }
}

/**
 * Prende o padrão dos botões de hover dos cards (ver ui/_etiqueta-acoes.scss e o CLAUDE.md): cada botão
 * é uma etiqueta de tinta separada, com fundo e sombra próprios, e reage à mão crescendo e pondo o
 * desenho numa cor. Todo card novo com botões assim chama este teste.
 */
export function expectEtiquetaPadrao(group: HTMLElement, opts: { rotate?: string; semCorNaMao?: string[]; comNome?: string[] } = {}): void {
  const css = getComputedStyle(group);
  const touch = matchMedia('(hover: none)').matches;
  expect(css.display).withContext('a fileira').toBe('flex');
  expect(css.columnGap).withContext('o vão entre os botões').toBe(touch ? '6px' : '4px');
  expect(css.backgroundColor).withContext('sem fundo que junte os botões').toBe('rgba(0, 0, 0, 0)');
  expect(css.boxShadow).withContext('sem sombra que junte os botões').toBe('none');
  expect(css.rotate).withContext('o giro').toBe(opts.rotate ?? '-1.5deg');
  expect(css.pointerEvents).withContext('escondida, não pega o clique').toBe('none');

  const buttons = [...group.querySelectorAll<HTMLElement>('button')];
  expect(buttons.length).withContext('os botões').toBeGreaterThan(0);
  const rules = hoverRules();
  for (const button of buttons) {
    const label = button.getAttribute('aria-label') ?? button.className;
    const b = getComputedStyle(button);
    const named = opts.comNome?.some((c) => button.classList.contains(c));
    expect(b.backgroundColor).withContext(`${label}: a tinta`).toBe('rgb(21, 21, 21)');
    expect(b.color).withContext(`${label}: o desenho`).toBe('rgb(241, 241, 236)');
    expect(b.borderRadius).withContext(`${label}: os cantos`).toBe('3px');
    expect(b.boxShadow).withContext(`${label}: a sombra própria`).toContain('rgba(0, 0, 0, 0.4)');
    expect(b.height).withContext(`${label}: a altura`).toBe(touch ? '34px' : '30px');
    if (!named) expect(b.width).withContext(`${label}: a largura`).toBe(touch ? '34px' : '30px');
    expect(b.transitionProperty).withContext(`${label}: cresce sem pular`).toContain('scale');
    expect(rules.some((r) => r.style.scale === '1.06' && appliesOnHover(button, r)))
      .withContext(`${label}: cresce com a mão em cima`)
      .toBeTrue();
    if (opts.semCorNaMao?.some((c) => button.classList.contains(c))) continue;
    expect(rules.some((r) => r.style.color.includes('--etiqueta-') && appliesOnHover(button, r)))
      .withContext(`${label}: o desenho ganha cor com a mão em cima`)
      .toBeTrue();
  }
}
