import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FbEdge, FbNode, FreeBoard, sanitizeFreeBoard } from '../../core/free-board';
import { Camera } from '../../core/free-board-geometry';
import { FreeBoardView } from './free-board-view';
import { FreeBoardPiece, drawingIn } from './free-board-piece';
import { expectEtiquetaPadrao } from '../../testing/etiqueta-acoes.spec';
import { comMarkdown } from '../../testing/writing-mode.spec';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const frames = async (n = 3) => {
  for (let k = 0; k < n; k++) await new Promise<void>((r) => requestAnimationFrame(() => r()));
};

function board(n: FbNode[], e: FbEdge[] = [], nome = 'Mansão'): FreeBoard {
  return sanitizeFreeBoard({ v: 1, id: 'abcdefghijklmnopqrstuv', nome, grupo: 'Jogos', em: '2026-11-09T00:00:00.000Z', n, e })!;
}

const MANSION = board(
  [
    { i: 'roxo', t: 'm', x: 0, y: 0, w: 780, h: 520, nome: 'Roxo (Quartos)', c: 'lilas' },
    { i: 'senha', t: 'x', x: 52, y: 104, w: 182, h: 104, txt: 'Senha?' },
    { i: 'email', t: 'x', x: 312, y: 104, w: 208, h: 104, txt: 'Ler **email** no escritório' },
    { i: 'conta', t: 'w', x: 52, y: 260, w: 312, h: 156, src: '{{contador: 24/12/2026 | Fim do inverno}}' },
    { i: 'longe', t: 'x', x: 60000, y: 60000, w: 182, h: 104, txt: 'Muito longe' },
  ],
  [{ i: 'e1', a: 'senha', b: 'email', txt: 'Precisa da lupa' }],
);

describe('Quadro livre: a tela (o motor de ver)', () => {
  let fixture: ComponentFixture<FreeBoardView>;
  let el: HTMLElement;
  let moved: Camera[];

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });
  afterEach(() => {
    fixture?.destroy();
    el?.remove();
  });

  async function open(b: FreeBoard, camera: Camera | null = { x: -20, y: -20, z: 1 }): Promise<void> {
    fixture = TestBed.createComponent(FreeBoardView);
    fixture.componentRef.setInput('board', b);
    fixture.componentRef.setInput('camera', camera);
    el = fixture.nativeElement as HTMLElement;
    el.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:600px;display:block';
    document.body.appendChild(el);
    moved = [];
    fixture.componentInstance.cameraChange.subscribe((c) => moved.push(c));
    await fixture.whenStable();
    await frames();
    await fixture.whenStable();
  }

  const piece = (id: string) => el.querySelector<HTMLElement>(`app-free-board-piece[data-peca="${id}"]`);
  const zoomText = () => el.querySelector('.zoom')!.textContent!.trim();

  it('é uma região com o nome do quadro, e monta só o que está perto da tela', async () => {
    await open(MANSION);
    const visor = el.querySelector('.visor')!;
    expect(visor.getAttribute('role')).toBe('region');
    expect(visor.getAttribute('aria-label')).toBe('Quadro Mansão');
    expect(piece('roxo')).not.toBeNull();
    expect(piece('senha')).not.toBeNull();
    expect(piece('conta')).not.toBeNull();
    expect(piece('longe')).toBeNull();
    // a moldura fica na camada de trás; as outras peças, na da frente
    const [back, , front] = Array.from(el.querySelectorAll('.mundo'));
    expect(back.contains(piece('roxo'))).toBeTrue();
    expect(front.contains(piece('senha'))).toBeTrue();
  });

  it('o widget enche a caixa: a caixa fica na proporção do desenho medido, e o desenho, do tamanho dela', async () => {
    // a caixa guardada alta demais para o contador (a sobra embaixo era o que se selecionava)
    await open(board([{ i: 'conta', t: 'w', x: 0, y: 0, w: 312, h: 260, src: '{{contador: 24/12/2026 | Fim do inverno}}' }]));
    const host = piece('conta')!;
    let drawing: HTMLElement | null = null;
    for (let k = 0; k < 40 && !drawing; k++) {
      await frames(1);
      await fixture.whenStable();
      drawing = host.querySelector<HTMLElement>('.escala [style*="pointer-events"]');
    }
    await frames(2);
    await fixture.whenStable();
    const shown = fixture.componentInstance.shown().n[0];
    expect(shown.w).toBe(312);
    expect(shown.h).toBeLessThan(200);
    expect(host.style.height).toBe(`${shown.h}px`);
    // o desenho na tela: do tamanho da caixa (um pixel de folga pelo arredondamento)
    const a = host.getBoundingClientRect();
    const b = drawing!.getBoundingClientRect();
    expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(a.height - b.height)).toBeLessThanOrEqual(1.5);
    // a caixa guardada não muda só por ver: só o editar a guarda assim
    expect(fixture.componentInstance.current().n[0].h).toBe(260);
  });

  it('no editar do dono, a caixa acertada pela medida (a imagem trocada) fica guardada sozinha, sem passo no desfazer', async () => {
    await open(board([{ i: 'conta', t: 'w', x: 0, y: 0, w: 312, h: 260, src: '{{contador: 24/12/2026 | Fim do inverno}}' }]));
    const saved: FreeBoard[] = [];
    fixture.componentInstance.changed.subscribe((c) => saved.push(c.board));
    fixture.componentRef.setInput('owner', {});
    fixture.componentRef.setInput('editing', true);
    for (let k = 0; k < 60 && !saved.length; k++) {
      await sleep(50);
      await fixture.whenStable();
    }
    expect(saved.length).toBe(1);
    expect(saved[0].n[0].h).toBeLessThan(200);
    // ninguém mexeu: o quadro não sobe na lista dos mexidos
    expect(saved[0].em).toBe('2026-11-09T00:00:00.000Z');
    expect(fixture.componentInstance.current()).toBe(saved[0]);
    expect(fixture.componentInstance.editor.history.canUndo).toBeFalse();
  });

  it('a tabela enche a caixa, sem papel por baixo, e a caixa nunca fica menor que o conteúdo', async () => {
    const src = '| Cômodo | Chave |\n| --- | --- |\n| Cofre | Senha |\n| Adega | Chave de ferro |\n| Torre | Lupa |';
    await open(board([{ i: 'tb', t: 'w', x: 0, y: 0, w: 416, h: 40, src }]));
    const host = piece('tb')!;
    for (let k = 0; k < 20 && fixture.componentInstance.shown().n[0].h === 40; k++) {
      await frames(1);
      await fixture.whenStable();
    }
    const h = fixture.componentInstance.shown().n[0].h;
    expect(h).toBeGreaterThan(80);
    expect(host.style.height).toBe(`${h}px`);
    const paper = host.querySelector<HTMLElement>('.tabela-papel')!.getBoundingClientRect();
    const box = host.getBoundingClientRect();
    expect(Math.abs(paper.width - box.width)).toBeLessThanOrEqual(1);
    expect(paper.bottom).toBeLessThanOrEqual(box.bottom + 1);
    // a peça não põe outro papel atrás da tabela
    expect(getComputedStyle(host.querySelector('app-rich-text')!).backgroundImage).toBe('none');
    expect(getComputedStyle(host.querySelector('app-rich-text')!).backgroundColor).toBe('rgba(0, 0, 0, 0)');
  });

  it('cada peça tem o nome falado: a moldura com quantas peças tem dentro, o bilhete com o que diz', async () => {
    await open(MANSION);
    expect(piece('roxo')!.getAttribute('aria-label')).toBe('Moldura Roxo (Quartos), 3 peças');
    expect(piece('senha')!.getAttribute('aria-label')).toBe('Texto: Senha?');
    expect(piece('email')!.getAttribute('aria-label')).toBe('Texto: Ler email no escritório');
    expect(piece('conta')!.getAttribute('aria-label')).toContain('Contador');
  });

  it('as peças de verdade de perto: o feltro com o título em Dymo, o texto como card com a formatação, o widget', async () => {
    await open(MANSION);
    expect(piece('roxo')!.querySelector('.feltro')).not.toBeNull();
    expect(piece('roxo')!.querySelector('.dymo')!.textContent!.trim()).toBe('Roxo (Quartos)');
    expect(piece('roxo')!.dataset['cor']).toBe('lilas');
    // o texto de uma linha só é o título do card (sem corpo); o papel é o do jeito (a Nota)
    const card = piece('email')!.querySelector<HTMLElement>('.cartao')!;
    expect(card.dataset['jeito']).toBe('nota');
    expect(card.querySelector('.cartao-titulo')?.textContent).toBe('Ler email no escritório');
    expect(piece('conta')!.querySelector('app-note-widget')).not.toBeNull();
    expect(piece('email')!.dataset['nivel']).toBe('perto');
  });

  it('o rótulo da seta é uma fita no meio da curva, por cima das peças', async () => {
    await open(MANSION);
    const fita = el.querySelector<HTMLElement>('.fita')!;
    expect(fita.textContent!.trim()).toBe('Precisa da lupa');
    const front = el.querySelectorAll('.mundo')[2];
    expect(front.lastElementChild).toBe(fita);
  });

  it('afastando, as peças viram a versão leve, e de longe saem do DOM (vão para o canvas)', async () => {
    await open(MANSION, { x: -20, y: -20, z: 0.4 });
    expect(piece('senha')!.dataset['nivel']).toBe('meio');
    expect(piece('senha')!.querySelector('.cartao.liso .cartao-titulo')!.textContent).toBe('Senha?');
    // de longe, o título da moldura vai para o canvas (o Dymo some) e o bilhete sai do DOM
    expect(el.querySelector('.visor')!.classList).toContain('rotulos-na-tela');
    fixture.destroy();
    el.remove();
    await open(MANSION, { x: -100, y: -100, z: 0.08 });
    expect(piece('senha')).toBeNull();
    expect(piece('roxo')).not.toBeNull();
    const canvas = el.querySelector<HTMLCanvasElement>('canvas.longe')!;
    expect(canvas.width).toBeGreaterThan(1);
  });

  it('sem câmera guardada, abre mostrando tudo (a moldura de 520 px de altura cabe nos 600 px com a margem)', async () => {
    await open(board(MANSION.n.filter((n) => n.i !== 'longe') as FbNode[]), null);
    expect(piece('roxo')).not.toBeNull();
    // (600 − 2 × 48) / 520
    expect(zoomText()).toBe('97%');
  });

  it('os botões do zoom: aproximar, afastar, 100% e Ver tudo; a câmera parada sai para quem guarda', async () => {
    await open(MANSION);
    const [menos, zoom, mais, tudo] = Array.from(el.querySelectorAll<HTMLButtonElement>('.regua button'));
    expect(zoom.getAttribute('aria-label')).toBe('Zoom 100%, voltar a 100%');
    mais.click();
    await sleep(700);
    await fixture.whenStable();
    expect(zoomText()).toBe('125%');
    expect(moved.at(-1)!.z).toBeCloseTo(1.25, 3);
    menos.click();
    await sleep(700);
    await fixture.whenStable();
    expect(zoomText()).toBe('100%');
    tudo.click();
    await sleep(700);
    await fixture.whenStable();
    // o quadro inteiro vai de 0 a 60.182 px: Ver tudo afasta até caber
    expect(moved.at(-1)!.z).toBeLessThan(0.05 + 1e-6);
    zoom.click();
    await sleep(700);
    expect(moved.at(-1)!.z).toBeCloseTo(1, 3);
  });

  it('o teclado: setas andam, + e − dão zoom, Tab passa pelas peças na ordem de leitura e a câmera vai junto', async () => {
    await open(MANSION);
    const visor = el.querySelector<HTMLElement>('.visor')!;
    visor.focus();
    const key = (k: string, extra: KeyboardEventInit = {}) => {
      const target = (document.activeElement as HTMLElement) ?? visor;
      target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
    };
    key('ArrowRight');
    await sleep(400);
    expect(moved.at(-1)!.x).toBeCloseTo(60, 3);
    key('+');
    await sleep(700);
    expect(moved.at(-1)!.z).toBeCloseTo(1.25, 3);
    key('1');
    await sleep(700);
    // Tab: a moldura, depois o que tem dentro dela, por fileiras
    key('Tab');
    await frames();
    await fixture.whenStable();
    await frames();
    expect(document.activeElement).toBe(piece('roxo'));
    key('Tab');
    await frames(4);
    expect(document.activeElement).toBe(piece('senha'));
    key('Tab');
    await frames(4);
    expect(document.activeElement).toBe(piece('email'));
    key('Tab');
    await frames(4);
    expect(document.activeElement).toBe(piece('conta'));
    // a peça muito longe: a câmera pula até ela, que é montada antes do foco
    key('Tab');
    for (let k = 0; k < 10 && document.activeElement !== piece('longe'); k++) {
      await fixture.whenStable();
      await frames();
    }
    expect(document.activeElement).toBe(piece('longe'));
    // depois da última, o foco sai do quadro
    key('Tab');
    expect(document.activeElement!.textContent).toBe('Fim do quadro');
  });

  it('arrastar anda a câmera e, parado, a câmera sai para quem guarda', async () => {
    await open(MANSION);
    const visor = el.querySelector<HTMLElement>('.visor')!;
    const ptr = (type: string, x: number, y: number) =>
      visor.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 7, pointerType: 'mouse', button: 0 }));
    ptr('pointerdown', 400, 300);
    ptr('pointermove', 450, 300);
    ptr('pointermove', 500, 340);
    ptr('pointerup', 500, 340);
    await sleep(500);
    expect(moved.at(-1)).toEqual({ x: -120, y: -60, z: 1 });
    const back = el.querySelector<HTMLElement>('.mundo')!;
    expect(back.style.transform).toBe('translate(120px, 60px) scale(1)');
  });

  it('o quadro vazio diz que está vazio', async () => {
    await open(board([], [], 'Novo'));
    expect(el.querySelector('.vazio')!.textContent).toContain('Este quadro está vazio');
  });

  describe('no editar', () => {
    let changes: FreeBoard[];
    let toggles: boolean[];

    async function edit(b: FreeBoard): Promise<void> {
      await open(b);
      changes = [];
      toggles = [];
      fixture.componentInstance.changed.subscribe((c) => changes.push(c.board));
      fixture.componentInstance.editToggle.subscribe((on) => toggles.push(on));
      fixture.componentRef.setInput('editing', true);
      await fixture.whenStable();
    }
    const visor = () => el.querySelector<HTMLElement>('.visor')!;
    // a câmera em (-20, -20) e zoom 1: o ponto do mundo (x, y) está na tela em (x + 20, y + 20)
    const ptr = (type: string, x: number, y: number, extra: PointerEventInit = {}) =>
      visor().dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x + 20, clientY: y + 20, pointerId: 3, pointerType: 'mouse', button: 0, ...extra }));
    const key = (k: string, extra: KeyboardEventInit = {}) => visor().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
    const settle = async () => {
      await fixture.whenStable();
      await frames(2);
      await fixture.whenStable();
    };

    it('clicar seleciona a peça: o anel amarelo, as alças e a etiqueta da seleção no padrão dos botões do site', async () => {
      await edit(MANSION);
      ptr('pointerdown', 60, 110);
      ptr('pointerup', 60, 110);
      await settle();
      expect(el.querySelectorAll('.anel').length).toBe(1);
      expect(el.querySelectorAll('[data-alca]').length).toBe(8);
      const acoes = el.querySelector<HTMLElement>('.acoes')!;
      expect([...acoes.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual(['Cor', 'Jeito do card: Nota', 'Trazer para frente', 'Mandar para trás', 'Duplicar', 'Apagar']);
      expectEtiquetaPadrao(acoes);
    });

    it('arrastar move nos furos (uma mudança só), Delete apaga e Ctrl+Z desfaz', async () => {
      await edit(MANSION);
      ptr('pointerdown', 60, 110);
      ptr('pointermove', 80, 120);
      ptr('pointermove', 90, 140);
      ptr('pointerup', 90, 140);
      await settle();
      expect(changes.length).toBe(1);
      expect(changes[0].n.find((n) => n.i === 'senha')).toEqual(jasmine.objectContaining({ x: 78, y: 130 }));
      key('Delete');
      await settle();
      expect(changes.at(-1)!.n.some((n) => n.i === 'senha')).toBeFalse();
      expect(changes.at(-1)!.e.length).toBe(0);
      key('z', { ctrlKey: true });
      await settle();
      expect(changes.at(-1)!.n.some((n) => n.i === 'senha')).toBeTrue();
    });

    /** A folha do texto do card (chega por @defer): espera ela aparecer. */
    async function sheet(): Promise<HTMLElement> {
      for (let i = 0; i < 100; i++) {
        await settle();
        const s = el.querySelector<HTMLElement>('app-free-board-text-sheet');
        if (s?.querySelector('app-rich-editor textarea, app-rich-editor .ProseMirror')) return s;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error('a folha do texto não abriu');
    }
    const typeIn = (field: HTMLTextAreaElement, text: string) => {
      field.value = text;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const txtOf = (id: string) => changes.at(-1)!.n.find((n) => n.i === id)?.['txt'];

    describe('o texto do card, na folha ao lado do quadro', () => {
      comMarkdown();

      it('duplo clique no fundo é um card novo, com a folha aberta no título; o card muda a cada letra, e clicar no quadro guarda', async () => {
        await edit(MANSION);
        // embaixo da moldura, na tela (a peça é montada)
        visor().dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 640, clientY: 560 }));
        const s = await sheet();
        // fora do mundo do quadro: não escala com o zoom
        expect(el.querySelector('.mundo app-free-board-text-sheet')).toBeNull();
        const title = s.querySelector<HTMLTextAreaElement>('textarea.titulo')!;
        expect(document.activeElement).toBe(title);
        expect(title.placeholder).toBe('Nota');
        // o antigo campo no lugar do card não existe mais
        expect(el.querySelector('textarea.escrever')).toBeNull();
        typeIn(title, 'Senha nova');
        typeIn(s.querySelector<HTMLTextAreaElement>('app-rich-editor textarea')!, 'No **quarto** 46');
        await settle();
        // ainda não guardou, mas o card no quadro já mostra o que está escrito
        const id = fixture.componentInstance.editor.writing()!.id;
        expect(changes.some((b) => b.n.some((n) => n['txt'] === 'Senha nova\nNo **quarto** 46'))).toBeFalse();
        expect(piece(id)!.querySelector('.cartao-titulo')!.textContent).toBe('Senha nova');
        expect(piece(id)!.querySelector('.cartao-corpo .enf.negrito')!.textContent).toBe('quarto');
        ptr('pointerdown', 840, 560);
        ptr('pointerup', 840, 560);
        await settle();
        expect(txtOf(id)).toBe('Senha nova\nNo **quarto** 46');
        expect(el.querySelector('app-free-board-text-sheet')).toBeNull();
      });

      it('Pronto, Ctrl+Enter e Esc guardam (um passo no desfazer); o título com marcas fica como estava se não mexer nele', async () => {
        await edit(MANSION);
        const ed = fixture.componentInstance.editor;
        ed.writing.set({ kind: 'bilhete', id: 'email' });
        let s = await sheet();
        const title = s.querySelector<HTMLTextAreaElement>('textarea.titulo')!;
        // o título como o card mostra, sem as marcas; aberto num card com texto, o foco vai para o texto
        expect(title.value).toBe('Ler email no escritório');
        const body = s.querySelector<HTMLTextAreaElement>('app-rich-editor textarea')!;
        expect(document.activeElement).toBe(body);
        typeIn(body, '- a senha do cofre');
        s.querySelector<HTMLButtonElement>('.faixa .pronto')!.click();
        await settle();
        expect(txtOf('email')).toBe('Ler **email** no escritório\n- a senha do cofre');
        expect(el.querySelector('app-free-board-text-sheet')).toBeNull();
        // Ctrl+Enter
        ed.writing.set({ kind: 'bilhete', id: 'senha' });
        s = await sheet();
        typeIn(s.querySelector<HTMLTextAreaElement>('textarea.titulo')!, 'Senha do cofre');
        s.querySelector('textarea.titulo')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
        await settle();
        expect(txtOf('senha')).toBe('Senha do cofre');
        // o Esc também guarda (o Ctrl+Z desfaz)
        ed.writing.set({ kind: 'bilhete', id: 'senha' });
        s = await sheet();
        typeIn(s.querySelector<HTMLTextAreaElement>('app-rich-editor textarea')!, '4 dígitos');
        s.querySelector('app-rich-editor textarea')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await settle();
        expect(el.querySelector('app-free-board-text-sheet')).toBeNull();
        expect(txtOf('senha')).toBe('Senha do cofre\n4 dígitos');
        key('z', { ctrlKey: true });
        await settle();
        expect(txtOf('senha')).toBe('Senha do cofre');
      });

      it('o card cresce com o texto enquanto se escreve (medido nele, em furos), e guarda essa altura', async () => {
        await edit(MANSION);
        fixture.componentInstance.editor.writing.set({ kind: 'bilhete', id: 'senha' });
        const s = await sheet();
        typeIn(s.querySelector<HTMLTextAreaElement>('app-rich-editor textarea')!, ['um', 'dois', 'três', 'quatro', 'cinco', 'seis'].map((x) => '- ' + x).join('\n'));
        await settle();
        await settle();
        const grown = piece('senha')!.offsetHeight;
        expect(grown).toBeGreaterThan(104);
        expect(grown % 26).toBe(0);
        // o texto inteiro cabe no card
        const body = piece('senha')!.querySelector<HTMLElement>('.cartao-corpo')!;
        expect(body.scrollHeight).toBeLessThanOrEqual(body.clientHeight + 1);
        s.querySelector<HTMLButtonElement>('.faixa .pronto')!.click();
        await settle();
        expect(changes.at(-1)!.n.find((n) => n.i === 'senha')!.h).toBe(grown);
      });

      it('com a folha aberta, o Delete e o L no quadro não mexem no card nem cobrem a folha; o Esc no quadro guarda', async () => {
        await edit(MANSION);
        fixture.componentInstance.editor.writing.set({ kind: 'bilhete', id: 'senha' });
        const s = await sheet();
        typeIn(s.querySelector<HTMLTextAreaElement>('textarea.titulo')!, 'Senha do cofre');
        visor().focus();
        key('Delete');
        key('l');
        await settle();
        expect(el.querySelector('app-free-board-text-sheet')).not.toBeNull();
        expect(el.querySelector('.lista')).toBeNull();
        expect(changes.length).toBe(0);
        key('Escape');
        await settle();
        expect(el.querySelector('app-free-board-text-sheet')).toBeNull();
        expect(txtOf('senha')).toBe('Senha do cofre');
      });

      it('o Enter que fecha a composição do japonês fica no título; o Enter de fora dela vai para o texto', async () => {
        await edit(MANSION);
        fixture.componentInstance.editor.writing.set({ kind: 'bilhete', id: 'senha' });
        const s = await sheet();
        const title = s.querySelector<HTMLTextAreaElement>('textarea.titulo')!;
        title.focus();
        const composing = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true });
        title.dispatchEvent(composing);
        expect(composing.defaultPrevented).toBeFalse();
        expect(document.activeElement).toBe(title);
        title.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await settle();
        expect(document.activeElement).toBe(s.querySelector('app-rich-editor textarea'));
      });

      it('no computador, a câmera leva o card para o lado da folha, num zoom de ler, e volta ao fechar', async () => {
        // a tela larga (a folha fica ao lado do quadro) e sem o deslize (a câmera pula)
        const real = window.matchMedia.bind(window);
        spyOn(window, 'matchMedia').and.callFake((q: string) =>
          q.includes('max-width: 860px') ? ({ matches: false } as MediaQueryList) : q.includes('reduced-motion') ? ({ matches: true } as MediaQueryList) : real(q),
        );
        await open(MANSION, { x: -20, y: -20, z: 0.5 });
        fixture.componentRef.setInput('editing', true);
        await settle();
        fixture.componentInstance.editor.writing.set({ kind: 'bilhete', id: 'email' });
        const s = await sheet();
        await settle();
        const card = piece('email')!.getBoundingClientRect();
        // o card inteiro à esquerda de onde a folha fica (900 de quadro, 460 de folha, 16 de margem e 24 de folga)
        expect(card.left).toBeGreaterThanOrEqual(24);
        expect(card.right).toBeLessThanOrEqual(900 - 460 - 32 - 24);
        expect(card.width / 208).toBeCloseTo(0.9, 2);
        s.querySelector('textarea.titulo')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await settle();
        await settle();
        expect(piece('email')!.getBoundingClientRect().width / 208).toBeCloseTo(0.5, 2);
      });

      it('sair do editar com a folha aberta guarda o que foi escrito', async () => {
        await edit(MANSION);
        fixture.componentInstance.editor.writing.set({ kind: 'bilhete', id: 'senha' });
        const s = await sheet();
        typeIn(s.querySelector<HTMLTextAreaElement>('textarea.titulo')!, 'Senha?!');
        fixture.componentRef.setInput('editing', false);
        await settle();
        expect(txtOf('senha')).toBe('Senha?!');
        expect(el.querySelector('app-free-board-text-sheet')).toBeNull();
      });
    });

    it('a régua das ferramentas e o zoom são etiquetas de tinta separadas, em grupos tortos; a ligada é a amarela', async () => {
      await edit(MANSION);
      const grupo = (c: string) => el.querySelector<HTMLElement>(`app-free-board-tools .grupo.${c}`)!;
      const nomes = (c: string) => [...grupo(c).querySelectorAll('button')].filter((b) => getComputedStyle(b).display !== 'none').map((b) => b.textContent!.trim() || b.getAttribute('aria-label'));
      expect(nomes('modos')).toEqual(['Selecionar', 'Moldura', 'Texto']);
      expect(nomes('por')).toEqual(['Anotação', 'Imagem', 'Widget']);
      expect(nomes('historia')).toEqual(['Desfazer', 'Refazer', 'Atalhos']);
      const opts = { semMedida: true, ligadaAmarela: true };
      expectEtiquetaPadrao(grupo('modos'), opts);
      expectEtiquetaPadrao(grupo('por'), { ...opts, rotate: '1deg' });
      expectEtiquetaPadrao(grupo('historia'), { ...opts, rotate: '-0.7deg' });
      // o vão entre os grupos é do quadro: a régua não pega o clique, só as etiquetas
      expect(getComputedStyle(el.querySelector('app-free-board-tools .regua')!).pointerEvents).toBe('none');
      const zoom = [...el.querySelectorAll<HTMLElement>('.grupo-zoom')];
      expect(zoom.length).toBe(2);
      expectEtiquetaPadrao(zoom[0], { semMedida: true });
      expectEtiquetaPadrao(zoom[1], { ...opts, rotate: '1deg' });
      expect(getComputedStyle(zoom[0].parentElement!).pointerEvents).toBe('none');
      // trocar a ferramenta passa o amarelo adiante
      key('m');
      await settle();
      expect(getComputedStyle(grupo('modos').querySelectorAll('button')[1]).backgroundColor).toBe('rgb(255, 218, 66)');
      expect(getComputedStyle(grupo('modos').querySelectorAll('button')[0]).backgroundColor).toBe('rgb(21, 21, 21)');
    });

    it('as ferramentas pelo teclado e pela régua; Esc sem nada selecionado pede para sair do editar', async () => {
      await edit(MANSION);
      expect(el.querySelector('app-free-board-tools')).not.toBeNull();
      key('m');
      await settle();
      expect(el.querySelector('.ferramenta[aria-pressed="true"]')!.textContent).toContain('Moldura');
      key('v');
      key('Escape');
      expect(toggles).toEqual([false]);
    });

    it('fora do editar, o E pede para editar e o botão direito abre o menu de ver', async () => {
      await open(MANSION);
      toggles = [];
      fixture.componentInstance.editToggle.subscribe((on) => toggles.push(on));
      fixture.componentRef.setInput('owner', { pickNote: async () => null, findNote: () => null, storeImages: async () => [], editWidget: async () => null, openNote: () => undefined, linkNotes: () => [] });
      await fixture.whenStable();
      key('e');
      expect(toggles).toEqual([true]);
      visor().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 1000, clientY: 400 }));
      await settle();
      const items = [...document.querySelectorAll<HTMLElement>('.menu-contexto [role="menuitem"]')].map((b) => b.textContent!.replace(/\s+/g, ' ').trim());
      expect(items.some((t) => t.startsWith('Ver tudo'))).toBeTrue();
      expect(items.some((t) => t.startsWith('Editar o quadro'))).toBeTrue();
    });
  });

  it('Ver em lista: o L abre o quadro em texto; tocar num item leva até a peça; o Esc fecha só a lista', async () => {
    await open(MANSION);
    const visor = el.querySelector<HTMLElement>('.visor')!;
    visor.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true, cancelable: true }));
    await fixture.whenStable();
    await frames(2);
    const items = [...el.querySelectorAll<HTMLElement>('.lista-pecas li')].map((li) => li.textContent!.replace(/\s+/g, ' ').trim());
    expect(items[0]).toContain('Roxo (Quartos)');
    expect(items).toContain('Bilhete: Senha?');
    expect(el.querySelector('.lista-setas')!.textContent).toContain('Precisa da lupa');
    const outside = jasmine.createSpy('esc fora');
    document.addEventListener('keydown', outside);
    const first = el.querySelector<HTMLButtonElement>('.lista-pecas button')!;
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    document.removeEventListener('keydown', outside);
    await fixture.whenStable();
    expect(el.querySelector('.lista')).toBeNull();
    expect(outside).not.toHaveBeenCalled();
  });

  it('o texto é o card das anotações: o jeito, a cor, o desenho e a primeira linha como título', () => {
    const fixture = TestBed.createComponent(FreeBoardPiece);
    fixture.componentRef.setInput('node', { i: 'tx', t: 'x', x: 0, y: 0, w: 260, h: 156, txt: '# Senha?\nA do cofre', k: 'aviso', kc: 'azul' });
    fixture.componentRef.setInput('info', { kind: 'bilhete', image: null });
    fixture.componentRef.setInput('level', 'perto');
    fixture.detectChanges();
    const card = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.cartao')!;
    expect(card.dataset['jeito']).toBe('info');
    expect(card.querySelector('.cartao-titulo')?.textContent?.trim()).toBe('Senha?');
    expect(card.querySelector('.cartao-icone lucide-icon')).not.toBeNull();
    expect(card.querySelector('.cartao-corpo')?.textContent).toContain('A do cofre');
    // sem cor própria: o papel do jeito; o texto de antes dos cards, com a cartolina dele
    fixture.componentRef.setInput('node', { i: 'tx', t: 'x', x: 0, y: 0, w: 260, h: 156, txt: '- uma lista', c: 'verde' });
    fixture.detectChanges();
    expect(card.dataset['jeito']).toBe('feito');
    expect(card.querySelector('.cartao-titulo')?.textContent?.trim()).toBe('Nota');
  });
});

describe('Quadro livre: o desenho do widget (drawingIn)', () => {
  let root: HTMLElement;
  afterEach(() => root?.remove());

  function mount(html: string): HTMLElement {
    root = document.createElement('div');
    root.style.cssText = 'position:absolute;left:0;top:0;width:480px';
    root.innerHTML = html;
    document.body.appendChild(root);
    return root;
  }

  it('desce pelos embrulhos da largura toda e para no desenho, do tamanho dele', () => {
    // o som: o host com respiro, o embrulho (.peca) da largura toda e a faixa do tamanho dela
    mount('<div style="padding:7px 0 10px"><div class="peca"><div id="d" style="width:300px;height:120px"></div></div></div>');
    expect(drawingIn(root)?.id).toBe('d');
  });

  it('o que está fora do fluxo (o broche, o player escondido) não conta', () => {
    mount('<div><div id="d" style="width:200px;height:80px"></div><span style="position:absolute;top:0">x</span><audio></audio></div>');
    expect(drawingIn(root)?.id).toBe('d');
  });

  it('a foto estreita é o desenho; dentro dela, a imagem num embrulho sem caixa conta junto com o broche', () => {
    mount('<figure style="margin:0;width:fit-content"><span id="d" style="display:grid"><span style="display:contents"><i style="display:block;width:200px;height:150px"></i></span><b style="position:relative;width:30px">+</b></span></figure>');
    expect(drawingIn(root)?.id).toBe('d');
  });

  it('com dois filhos (a foto e a legenda), o desenho é o que tem os dois', () => {
    mount('<figure id="d" style="margin:0;width:fit-content"><div style="width:240px;height:160px"></div><figcaption>Legenda</figcaption></figure>');
    expect(drawingIn(root)?.id).toBe('d');
  });

  it('o que enche a linha (o texto inteiro de uma nota) é o desenho, na largura de base', () => {
    mount('<div id="d"><p>Um</p><p>Dois</p></div>');
    expect(drawingIn(root)?.id).toBe('d');
  });

  it('sem nada dentro, nada', () => {
    mount('');
    expect(drawingIn(root)).toBeNull();
  });
});
