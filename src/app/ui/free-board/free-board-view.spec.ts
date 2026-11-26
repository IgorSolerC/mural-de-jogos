import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FbEdge, FbNode, FreeBoard, sanitizeFreeBoard } from '../../core/free-board';
import { Camera } from '../../core/free-board-geometry';
import { FreeBoardView } from './free-board-view';
import { FreeBoardPiece, cardNeed, drawingIn } from './free-board-piece';
import { CARD_FONT, cardTextNearPx } from './card-sketch';
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
    // o card do texto fica de perto enquanto a letra dele se lê (PLANO-CAIXAS-DE-TEXTO.md, D5); o widget já é o leve
    await open(MANSION, { x: -20, y: -20, z: 0.3 });
    expect(piece('senha')!.dataset['nivel']).toBe('perto');
    expect(piece('conta')!.dataset['nivel']).toBe('meio');
    fixture.destroy();
    el.remove();
    // com a letra pequena demais, o card no meio é o desenho dele em proporção: o papel, a faixa e a folha clara
    const z = (cardTextNearPx() / CARD_FONT) * 0.8;
    await open(MANSION, { x: -20, y: -20, z });
    expect(piece('senha')!.dataset['nivel']).toBe('meio');
    expect(piece('senha')!.querySelector('.cartao')).toBeNull();
    expect(piece('senha')!.querySelectorAll('svg.de-longe g rect').length).toBeGreaterThan(1);
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

  it('o quadro vazio diz que está vazio; ao dono, como pôr a primeira peça (a tecla E com o mouse, o botão Editar no toque)', async () => {
    await open(board([], [], 'Novo'));
    expect(el.querySelector('.vazio')!.textContent).toContain('Este quadro está vazio');
    // (quem visita não edita: a dica é só do dono)
    expect(el.querySelector('.vazio .dica-tecla')).toBeNull();
    fixture.componentRef.setInput('owner', {});
    await fixture.whenStable();
    const tecla = el.querySelector<HTMLElement>('.vazio .dica-tecla')!;
    const toque = el.querySelector<HTMLElement>('.vazio .dica-toque')!;
    expect(tecla.textContent).toContain('Editar (E)');
    expect(toque.textContent).toContain('Toque em Editar');
    // (só uma das duas aparece: a do jeito de apontar deste aparelho)
    const shown = [tecla, toque].filter((e) => getComputedStyle(e).display !== 'none');
    expect(shown.length).toBe(1);
    expect(shown[0]).toBe(matchMedia('(pointer: coarse)').matches ? toque : tecla);
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
      expect([...acoes.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual(['Escrever', 'Cor', 'Jeito do card: Nota', 'Tamanho da letra', 'Trazer para frente', 'Mandar para trás', 'Duplicar', 'Apagar']);
      expectEtiquetaPadrao(acoes);
      // o Jeito é o desenho do card (o lápis da Nota parecia "escrever"), e o Escrever abre a folha do card
      expect(acoes.querySelector('.jeito lucide-icon')!.innerHTML).not.toBe(acoes.querySelector('.escrita lucide-icon')!.innerHTML);
      acoes.querySelector<HTMLButtonElement>('.escrita')!.click();
      await settle();
      expect(fixture.componentInstance.editor.writing()).toEqual({ kind: 'bilhete', id: 'senha' });
    });

    it('a etiqueta fica dentro do quadro: perto da borda da direita ela entra, e sem lugar em cima (o topo do quadro) vai para baixo da seleção', async () => {
      await edit(board([{ i: 'canto', t: 'x', x: 720, y: 0, w: 208, h: 104, txt: 'No canto' }]));
      ptr('pointerdown', 740, 30);
      ptr('pointerup', 740, 30);
      await settle();
      await settle();
      const tag = el.querySelector<HTMLElement>('.acoes')!.getBoundingClientRect();
      const visorBox = visor().getBoundingClientRect();
      const card = piece('canto')!.getBoundingClientRect();
      expect(tag.right).toBeLessThanOrEqual(visorBox.right);
      expect(tag.left).toBeGreaterThanOrEqual(visorBox.left);
      expect(tag.top).toBeGreaterThan(card.bottom);
    });

    it('a seleção mais alta que a tela: a etiqueta fica em cima, à vista sob o topo do quadro', async () => {
      await edit(board([{ i: 'alto', t: 'x', x: 0, y: 0, w: 208, h: 1300, txt: 'Comprido' }]));
      ptr('pointerdown', 60, 30);
      ptr('pointerup', 60, 30);
      await settle();
      await settle();
      const tag = el.querySelector<HTMLElement>('.acoes')!.getBoundingClientRect();
      const visorBox = visor().getBoundingClientRect();
      expect(tag.top).toBeGreaterThanOrEqual(visorBox.top);
      expect(tag.bottom).toBeLessThanOrEqual(visorBox.bottom);
    });

    it('o tamanho da letra: a etiqueta abre os degraus; a letra muda no card, que cresce até caber; Ctrl+Shift+. e , dão um passo', async () => {
      await edit(MANSION);
      ptr('pointerdown', 60, 110);
      ptr('pointerup', 60, 110);
      await settle();
      const font = () => parseFloat(getComputedStyle(piece('senha')!.querySelector('.cartao')!).fontSize);
      const base = font();
      el.querySelector<HTMLButtonElement>('.acoes .letra')!.click();
      await settle();
      const items = [...el.querySelectorAll<HTMLElement>('app-context-menu [role="menuitem"]')];
      expect(items.map((b) => b.querySelector('.nome')!.textContent!.trim())).toEqual(['Pequena', 'Média (a de sempre)', 'Grande', 'Bem grande', 'Enorme']);
      expect(items.map((b) => !!b.querySelector('.marcada'))).toEqual([false, true, false, false, false]);
      items[4].click();
      await settle();
      const saved = changes.at(-1)!.n.find((n) => n.i === 'senha')!;
      expect(saved['fs']).toBe(3);
      expect(font()).toBeCloseTo(base * 3, 0);
      // o card cresceu (em furos) até o título caber, e a faixa enche o que ele pede
      expect(saved.h).toBeGreaterThan(104);
      expect(saved.h % 26).toBe(0);
      key('.', { ctrlKey: true, shiftKey: true, code: 'Period' } as KeyboardEventInit);
      await settle();
      expect(changes.at(-1)!.n.find((n) => n.i === 'senha')!['fs']).toBe(3);
      key(',', { ctrlKey: true, shiftKey: true, code: 'Comma' } as KeyboardEventInit);
      key(',', { ctrlKey: true, shiftKey: true, code: 'Comma' } as KeyboardEventInit);
      await settle();
      expect(changes.at(-1)!.n.find((n) => n.i === 'senha')!['fs']).toBe(1.4);
      // a letra menor não encolhe o card: só quem escolhe o tamanho dele
      expect(changes.at(-1)!.n.find((n) => n.i === 'senha')!.h).toBe(saved.h);
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
        const body = piece('senha')!.querySelector<HTMLElement>('.cartao-texto')!;
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

      const LISBOA = 'O elétrico 28 lota às 10h; ir cedo, antes das 8h, e descer no Largo das Portas do Sol para ver o rio. Depois seguir a pé até a Sé e almoçar por ali.';
      const dblAt = (x: number, y: number) => visor().dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
      const nodeOf = (id: string) => changes.at(-1)!.n.find((n) => n.i === id)!;

      it('o card novo nasce sem desenho; com um parágrafo, ele alarga até 312 antes de crescer para baixo, e mostra tudo', async () => {
        await edit(MANSION);
        dblAt(640, 560);
        const s = await sheet();
        const id = fixture.componentInstance.editor.writing()!.id;
        expect(piece(id)!.querySelector('.cartao-icone')).toBeNull();
        expect(s.querySelector('.icone-botao')!.classList).toContain('sem');
        // o card escrito fica por cima dos vizinhos enquanto cresce (só na tela)
        expect(piece(id)!.classList).toContain('escrevendo');
        expect(getComputedStyle(piece(id)!).zIndex).toBe('1');
        // (a fita do rótulo da seta continua por cima dele)
        expect(Number(getComputedStyle(el.querySelector('.fita')!).zIndex)).toBeGreaterThan(1);
        typeIn(s.querySelector<HTMLTextAreaElement>('textarea.titulo')!, 'Lisboa');
        typeIn(s.querySelector<HTMLTextAreaElement>('app-rich-editor textarea')!, LISBOA);
        await settle();
        s.querySelector<HTMLButtonElement>('.faixa .pronto')!.click();
        await settle();
        await settle();
        const n = nodeOf(id);
        expect(n['ic']).toBe('');
        expect(n.w).toBe(312);
        expect(n.h % 26).toBe(0);
        expect(piece(id)!.classList).not.toContain('escrevendo');
        expect(piece(id)!.querySelector('.cartao.cortado')).toBeNull();
      });

      it('o card novo que ganha um desenho e fica vazio some inteiro: o desfazer não traz de volta um card vazio', async () => {
        await edit(MANSION);
        dblAt(640, 560);
        const s = await sheet();
        const id = fixture.componentInstance.editor.writing()!.id;
        s.querySelector<HTMLButtonElement>('.icone-botao')!.click();
        await settle();
        s.querySelector<HTMLButtonElement>('dialog.cartela-de-icones .op[aria-label="Estrela"]')!.click();
        await settle();
        expect(piece(id)!.querySelector('.cartao-icone')).not.toBeNull();
        s.querySelector<HTMLButtonElement>('.faixa .pronto')!.click();
        await settle();
        expect(changes.at(-1)!.n.some((n) => n.i === id)).toBeFalse();
        key('z', { ctrlKey: true });
        await settle();
        expect(changes.at(-1)!.n.some((n) => n.i === id)).toBeFalse();
      });

      it('o card novo só com o título fica da altura da faixa (sem a metade de papel vazio); os de antes não mudam sozinhos', async () => {
        await edit(MANSION);
        dblAt(640, 560);
        const s = await sheet();
        const id = fixture.componentInstance.editor.writing()!.id;
        typeIn(s.querySelector<HTMLTextAreaElement>('textarea.titulo')!, 'Só o título');
        s.querySelector<HTMLButtonElement>('.faixa .pronto')!.click();
        await settle();
        const n = nodeOf(id);
        expect(n.h).toBeLessThan(104);
        expect(n.h % 26).toBe(0);
        expect(n.w).toBe(208);
        // o de antes, escrito de novo, fica do tamanho que tinha
        fixture.componentInstance.editor.writing.set({ kind: 'bilhete', id: 'senha' });
        const again = await sheet();
        typeIn(again.querySelector<HTMLTextAreaElement>('textarea.titulo')!, 'Senha!');
        again.querySelector<HTMLButtonElement>('.faixa .pronto')!.click();
        await settle();
        expect(nodeOf('senha')).toEqual(jasmine.objectContaining({ w: 182, h: 104 }));
      });

      it('aberto num card com texto, o cursor vai para o fim do texto', async () => {
        await edit(board([{ i: 'mala', t: 'x', x: 0, y: 0, w: 208, h: 156, txt: 'Mala\n- passaporte\n- casaco' }]));
        fixture.componentInstance.editor.writing.set({ kind: 'bilhete', id: 'mala' });
        await sheet();
        await settle();
        const body = document.activeElement as HTMLTextAreaElement;
        expect(body.matches('app-rich-editor textarea')).toBeTrue();
        expect(body.value).toBe('- passaporte\n- casaco');
        expect(body.selectionStart).toBe(body.value.length);
      });

      it('o desenho da faixa: na folha ele abre a cartela; o escolhido vai para o card (um passo no desfazer) e "Sem ícone" tira', async () => {
        await edit(MANSION);
        const ed = fixture.componentInstance.editor;
        // o card de antes (sem o campo) mostra o desenho do jeito, e a cartela marca o mesmo (o lápis da Nota)
        ed.writing.set({ kind: 'bilhete', id: 'senha' });
        const s = await sheet();
        const btn = () => s.querySelector<HTMLButtonElement>('.icone-botao')!;
        const chart = () => s.querySelector<HTMLDialogElement>('dialog.cartela-de-icones');
        expect(btn().classList).not.toContain('sem');
        expect(btn().getAttribute('aria-label')).toBe('Trocar o ícone do card');
        expect(piece('senha')!.querySelector('.cartao-icone')).not.toBeNull();
        btn().click();
        await settle();
        expect(chart()!.open).toBeTrue();
        expect(chart()!.querySelector('[aria-checked="true"]')!.getAttribute('aria-label')).toBe('Lápis');
        chart()!.querySelector<HTMLButtonElement>('.foot .sem')!.click();
        await settle();
        expect(nodeOf('senha')['ic']).toBe('');
        expect(piece('senha')!.querySelector('.cartao-icone')).toBeNull();
        // sem desenho: o recorte vazio com o "+", e o foco volta para ele
        expect(btn().classList).toContain('sem');
        expect(btn().getAttribute('aria-label')).toBe('Pôr um ícone no card');
        expect(document.activeElement).toBe(btn());
        btn().click();
        await settle();
        chart()!.querySelector<HTMLButtonElement>('.op[aria-label="Estrela"]')!.click();
        await settle();
        expect(nodeOf('senha')['ic']).toBe('estrela');
        expect(piece('senha')!.querySelector('.cartao-icone')).not.toBeNull();
        expect(chart()).toBeNull();
        // a folha continua aberta: o escrito vai junto no Pronto
        typeIn(s.querySelector<HTMLTextAreaElement>('textarea.titulo')!, 'Senha do cofre');
        s.querySelector<HTMLButtonElement>('.faixa .pronto')!.click();
        await settle();
        expect(nodeOf('senha')).toEqual(jasmine.objectContaining({ txt: 'Senha do cofre', ic: 'estrela' }));
        key('z', { ctrlKey: true });
        await settle();
        expect(nodeOf('senha')).toEqual(jasmine.objectContaining({ txt: 'Senha?', ic: 'estrela' }));
        key('z', { ctrlKey: true });
        await settle();
        expect(nodeOf('senha')['ic']).toBe('');
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

    it('"Ajustar ao texto" no botão direito do card: a altura que o texto pede, em furos, maior ou menor', async () => {
      await edit(
        board([
          { i: 'alto', t: 'x', x: 0, y: 0, w: 208, h: 312, txt: 'Só o título' },
          { i: 'baixo', t: 'x', x: 260, y: 0, w: 208, h: 52, txt: 'Lista\n- um\n- dois\n- três\n- quatro' },
        ]),
      );
      visor().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 40 }));
      await settle();
      const item = [...document.querySelectorAll<HTMLElement>('.menu-contexto [role="menuitem"]')].find((i) => i.textContent!.includes('Ajustar ao texto'));
      expect(item).withContext('o item no menu').toBeDefined();
      item!.click();
      await settle();
      const alto = changes.at(-1)!.n.find((n) => n.i === 'alto')!;
      expect(alto.h).toBeLessThan(104);
      expect(alto.h % 26).toBe(0);
      fixture.componentInstance.editor.fitToText('baixo');
      await settle();
      const baixo = changes.at(-1)!.n.find((n) => n.i === 'baixo')!;
      expect(baixo.h).toBeGreaterThan(52);
      expect(baixo.h % 26).toBe(0);
      expect(piece('baixo')!.querySelector('.cartao.cortado')).toBeNull();
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

  it('no ver, o card com "…" abre inteiro para ler (o clique ou o Enter); o Fechar e o Esc fecham; o que mostra tudo não abre', async () => {
    const long = 'O elétrico 28 lota às 10h; ir cedo, antes das 8h, e descer no Largo das Portas do Sol para ver o rio. Depois seguir a pé até a Sé.';
    await open(
      board([
        { i: 'longo', t: 'x', x: 0, y: 0, w: 208, h: 104, txt: `Lisboa\n${long}` },
        { i: 'curto', t: 'x', x: 260, y: 0, w: 208, h: 104, txt: 'Curto' },
        { i: 'titulo', t: 'x', x: 520, y: 0, w: 130, h: 156, txt: 'Um título bem comprido que não cabe em três linhas desta caixa estreita de jeito nenhum\ncorpo' },
      ]),
    );
    const visor = el.querySelector<HTMLElement>('.visor')!;
    const tapAt = async (x: number, y: number) => {
      for (const type of ['pointerdown', 'pointerup']) visor.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x + 20, clientY: y + 20, pointerId: 4, pointerType: 'mouse', button: 0 }));
      visor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x + 20, clientY: y + 20 }));
      await fixture.whenStable();
    };
    const reader = async () => {
      for (let i = 0; i < 100; i++) {
        await fixture.whenStable();
        const s = el.querySelector<HTMLElement>('app-free-board-text-sheet');
        if (s?.querySelector('.titulo.lido')) return s;
        await sleep(10);
      }
      return null;
    };
    expect(piece('longo')!.querySelector('.cartao.cortado')).not.toBeNull();
    // a lupa diz que ele abre; o que mostra tudo fica com a mão de arrastar
    expect(getComputedStyle(piece('longo')!).cursor).toBe('zoom-in');
    expect(getComputedStyle(piece('curto')!).cursor).not.toBe('zoom-in');
    expect(getComputedStyle(piece('titulo')!).cursor).toBe('zoom-in');
    await tapAt(360, 50);
    await sleep(50);
    expect(el.querySelector('app-free-board-text-sheet')).toBeNull();
    await tapAt(100, 50);
    let s = (await reader())!;
    expect(s).not.toBeNull();
    // só para ler: o título, o texto inteiro (o que o card escondia), o Fechar no lugar do Pronto, sem campos
    expect(s.querySelector('.titulo.lido')!.textContent!.trim()).toBe('Lisboa');
    expect(s.querySelector('.texto-lido')!.textContent).toContain('até a Sé.');
    expect(s.querySelector('textarea, app-rich-editor')).toBeNull();
    expect(document.activeElement).toBe(s.querySelector('.pronto'));
    s.querySelector<HTMLButtonElement>('.pronto')!.click();
    await frames();
    await fixture.whenStable();
    expect(el.querySelector('app-free-board-text-sheet')).toBeNull();
    expect(document.activeElement).toBe(piece('longo'));
    // o Enter na peça com o foco abre; o Esc fecha
    piece('longo')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    s = (await reader())!;
    expect(s).not.toBeNull();
    s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(el.querySelector('app-free-board-text-sheet')).toBeNull();
    // o título cortado pela linha presa (o corpo cabe) também esconde texto: abre
    await tapAt(580, 20);
    s = (await reader())!;
    expect(s).not.toBeNull();
    expect(s.querySelector('.titulo.lido')!.textContent).toContain('de jeito nenhum');
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

describe('Quadro livre: o que não cabe no card do texto vira "…" (fitCard)', () => {
  let host: HTMLElement | null = null;
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));
  afterEach(() => host?.remove());

  const LONG = 'O elétrico 28 lota às 10h; ir cedo, antes das 8h, e descer no Largo das Portas do Sol para ver o rio. Depois seguir a pé até a Sé e almoçar na Baixa, perto da Rua Augusta.';

  async function card(txt: string, w: number, h: number): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(FreeBoardPiece);
    fixture.componentRef.setInput('node', { i: 'tx', t: 'x', x: 0, y: 0, w, h, txt });
    fixture.componentRef.setInput('info', { kind: 'bilhete', image: null });
    fixture.componentRef.setInput('level', 'perto');
    host = fixture.nativeElement as HTMLElement;
    host.style.position = 'absolute';
    document.body.appendChild(host);
    await document.fonts.ready;
    fixture.detectChanges();
    await fixture.whenStable();
    await frames(2);
    return host.querySelector<HTMLElement>('.cartao')!;
  }

  /** Nenhuma linha do texto passa do corte pela metade: ou aparece inteira, ou fica toda escondida. */
  function noHalfLines(text: HTMLElement): void {
    const box = text.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(text).lineHeight);
    const range = document.createRange();
    const walk = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        if (!r.height) continue;
        // a linha (a caixa da letra do Kalam passa da linha: o meio dela, com a altura da linha)
        const mid = (r.top + r.bottom) / 2;
        const cut = mid - lh / 2 < box.bottom - 1 && mid + lh / 2 > box.bottom + lh * 0.3;
        expect(cut).withContext(`a linha em ${mid - box.top} passa do corte em ${box.height}`).toBeFalse();
      }
    }
  }

  it('o corpo comprido mostra as linhas inteiras que cabem e o "…" no fim da última; o curto não ganha "…"', async () => {
    const c = await card(`Cuidado com o elétrico\n${LONG}`, 300, 182);
    expect(c.classList).toContain('cortado');
    const text = c.querySelector<HTMLElement>('.cartao-texto')!;
    const dots = c.querySelector<HTMLElement>('.reticencias')!;
    expect(getComputedStyle(dots).display).not.toBe('none');
    noHalfLines(text);
    // o "…" fica dentro da folha clara, na altura da última linha que aparece
    const sheet = c.querySelector<HTMLElement>('.cartao-corpo')!.getBoundingClientRect();
    const d = dots.getBoundingClientRect();
    expect(d.right).toBeLessThanOrEqual(sheet.right + 0.5);
    expect(d.bottom).toBeLessThanOrEqual(text.getBoundingClientRect().bottom + 1);
    host!.remove();
    const short = await card('Dia 1\nMetrô vermelho até a Alameda.', 300, 182);
    expect(short.classList).not.toContain('cortado');
    expect(getComputedStyle(short.querySelector('.reticencias')!).display).toBe('none');
  });

  it('sem lugar para uma linha do corpo, a folha clara sai e o título termina em "…"; o título encolhe antes disso', async () => {
    const tiny = await card(`Título\n${LONG}`, 208, 78);
    expect(tiny.classList).toContain('sem-corpo');
    expect(getComputedStyle(tiny.querySelector('.cartao-corpo')!).display).toBe('none');
    const title = tiny.querySelector<HTMLElement>('.cartao-titulo')!;
    expect(title.classList).toContain('com-mais');
    expect(getComputedStyle(title, '::after').content).toContain('…');
    host!.remove();
    // estreito: o título comprido fica com menos linhas para o corpo ter a dele
    const narrow = await card('Título bem comprido que não cabe numa linha só\ncorpo', 150, 130);
    expect(narrow.classList).not.toContain('sem-corpo');
    const t = narrow.querySelector<HTMLElement>('.cartao-titulo')!;
    const lh = parseFloat(getComputedStyle(t).lineHeight);
    expect(Math.round(t.offsetHeight / lh)).toBeLessThan(3);
    const sheet = narrow.querySelector<HTMLElement>('.cartao-corpo')!;
    expect(sheet.offsetHeight).toBeGreaterThanOrEqual(lh * 0.9);
    // a palavra não se parte no meio (só a maior que a linha)
    expect(getComputedStyle(t).overflowWrap).toBe('break-word');
  });

  it('a medida do que o texto pede (cardNeed) não conta o corte: o card cresce até mostrar tudo', async () => {
    const c = await card(`Cuidado\n${LONG}`, 300, 130);
    expect(c.classList).toContain('cortado');
    const need = cardNeed(host!)!;
    expect(need).toBeGreaterThan(130 + 26);
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
