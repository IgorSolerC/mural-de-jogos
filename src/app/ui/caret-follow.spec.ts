import { anchorFor, caretSpot, caretY, scrollToShow } from './caret-follow';

describe('a prévia acompanha o cursor', () => {
  it('a linha do cursor e quanto dela ficou para trás', () => {
    const text = 'um\ndois três\n\nfim';
    expect(caretSpot(text, 0)).toEqual({ line: 0, frac: 0 });
    expect(caretSpot(text, 2)).toEqual({ line: 0, frac: 1 });
    expect(caretSpot(text, 3)).toEqual({ line: 1, frac: 0 });
    expect(caretSpot(text, 7)).toEqual({ line: 1, frac: 4 / 9 });
    // a linha em branco
    expect(caretSpot(text, 13)).toEqual({ line: 2, frac: 0 });
    expect(caretSpot(text, text.length)).toEqual({ line: 3, frac: 1 });
  });

  it('rola só quando o cursor sai da parte à vista, com folga, e nunca antes do começo', () => {
    // à vista: 0 a 400, folga de 96
    expect(scrollToShow(0, 400, 200, 96)).toBeNull();
    expect(scrollToShow(0, 400, 380, 96)).toBe(76);
    expect(scrollToShow(300, 400, 320, 96)).toBe(224);
    expect(scrollToShow(100, 400, 20, 96)).toBe(0);
    // numa coluna baixa, a folga é no máximo um terço dela
    expect(scrollToShow(0, 90, 80, 96)).toBe(20);
  });

  describe('no desenho', () => {
    let view: HTMLElement;

    beforeEach(() => {
      view = document.createElement('div');
      view.style.cssText = 'position: relative; height: 100px; overflow-y: auto; line-height: 20px; font-size: 14px';
      view.innerHTML = `
        <div style="height: 40px">o alto da ficha</div>
        <div data-l="0">um</div>
        <div data-l="1">dois</div>
        <ul style="margin: 0">
          <li data-l="2">item<div class="corpo"><div data-l="3">descrição</div><div data-l="4">mais</div></div></li>
        </ul>
        <pre data-l="6" style="margin: 0; height: 80px">código</pre>
        <div data-l="10">depois</div>
        <div style="height: 300px"></div>`;
      document.body.appendChild(view);
    });

    afterEach(() => view.remove());

    it('acha o pedaço de cada linha; as que não aparecem caem no de antes', () => {
      expect(anchorFor(view, 1)?.el.textContent).toBe('dois');
      expect(anchorFor(view, 4)).toEqual(jasmine.objectContaining({ first: 4, span: 2 }));
      // a cerca e o meio do bloco de código são do bloco
      expect(anchorFor(view, 8)).toEqual(jasmine.objectContaining({ first: 6, span: 4 }));
      expect(anchorFor(view, 30)?.el.textContent).toBe('depois');
      expect(anchorFor(document.createElement('div'), 0)).toBeNull();
    });

    it('a altura do cursor: o item conta só a linha dele, e o bloco comprido, a parte dele', () => {
      const item = anchorFor(view, 2)!;
      const own = item.el.querySelector<HTMLElement>('.corpo')!.offsetTop - item.el.offsetTop;
      expect(caretY(view, item, 2, 1)).toBeCloseTo(item.el.offsetTop + own, 0);
      const code = anchorFor(view, 8)!;
      // a linha 8 é a metade do bloco (6 a 9)
      expect(caretY(view, code, 8, 0)).toBeCloseTo(code.el.offsetTop + 40, 0);
      // rolar não muda a conta (é a altura no conteúdo)
      view.scrollTop = 50;
      expect(caretY(view, code, 8, 0)).toBeCloseTo(code.el.offsetTop + 40, 0);
    });
  });
});
