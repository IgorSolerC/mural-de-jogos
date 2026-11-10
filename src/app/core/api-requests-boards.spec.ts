import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { addToBoard, applyBoardRequest, boardWords, undoBoard } from './api-requests-boards';
import { quadroLivreV1 } from './api-mirror';
import { deleteDatabase } from './erase-save';
import { FbNode, FreeBoard, sanitizeFreeBoard } from './free-board';
import { intersects } from './free-board-geometry';
import { BOARDS_DB, FreeBoardStore } from './free-board-store';
import { boardAsText, boardOutline } from './free-board-text';

const note = (i: string, x: number, y: number, txt = i): FbNode => ({ i, t: 'x', x, y, w: 208, h: 104, txt });
const board = (n: FbNode[], e: { i: string; a: string; b: string; txt?: string }[] = []): FreeBoard =>
  sanitizeFreeBoard({ v: 1, id: 'abcdefghijklmnopqrstuv', nome: 'Mansão', grupo: 'Jogos', em: '2026-11-09T00:00:00.000Z', n, e })!;
const ctx = { noteTitle: (id: string) => (id === 'n1' ? 'Diário | da mansão' : undefined) };
const AT = '2026-11-10T00:00:00.000Z';
const intersectsNone = (a: readonly FbNode[], b: readonly FbNode[]) => a.every((x) => b.every((y) => !intersects(x, y)));

describe('Quadro livre: o texto (Ver em lista e a API)', () => {
  it('as molduras como títulos, as peças dentro na ordem de leitura com o id, e as setas', () => {
    const b = board(
      [
        { i: 'm', t: 'm', x: 0, y: 0, w: 780, h: 520, nome: 'Roxo (Quartos)' },
        note('senha', 52, 104, 'Senha?'),
        note('email', 312, 104, 'Ler **email**'),
        note('solto', 1000, 0, 'Fora'),
        { i: 'nt', t: 'w', x: 52, y: 260, w: 300, h: 150, src: '{{nota: #n1 | Diário}}' },
      ],
      [{ i: 'e1', a: 'senha', b: 'email', txt: 'Precisa da lupa' }],
    );
    const o = boardOutline(b);
    expect(o.items.map((i) => [i.id, i.depth])).toEqual([
      ['m', 0],
      ['senha', 1],
      ['email', 1],
      ['nt', 1],
      ['solto', 0],
    ]);
    expect(o.items.find((i) => i.id === 'nt')).toEqual(jasmine.objectContaining({ kind: 'Anotação', label: 'Diário', note: 'n1' }));
    expect(o.arrows).toEqual([{ id: 'e1', from: 'Senha?', to: 'Ler email', label: 'Precisa da lupa' }]);
    const text = boardAsText(b);
    expect(text).toContain('## Roxo (Quartos) [m]');
    expect(text).toContain('- Bilhete: Senha? [senha]');
    expect(text).toContain('- Anotação: Diário (nota n1) [nt]');
    expect(text).toContain('- Senha? → Ler email (Precisa da lupa)');
    const v1 = quadroLivreV1(b);
    expect([v1.pecas, v1.setas, v1.publico]).toEqual([5, 1, false]);
  });
});

describe('Quadro livre: os pedidos da API das AIs', () => {
  it('acrescenta bilhetes e notas ao lado da peça pedida (sem cobrir nada), setas por novaN e a moldura em volta', () => {
    const b = board([note('a', 0, 0), note('b', 260, 0)]);
    const out = addToBoard(
      b,
      { pecas: [{ bilhete: 'Senha?', perto: 'a' }, { nota: 'n1' }], setas: [{ de: 'nova1', para: 'b', rotulo: 'lupa' }], moldura: { titulo: 'Roxo', pecas: ['a', 'nova1'] } },
      ctx,
      AT,
    );
    if ('erro' in out) fail(out.erro);
    else {
      const novas = out.board.n.filter((n) => n.i === out.novas['nova1'] || n.i === out.novas['nova2']) as FbNode[];
      expect(novas.length).toBe(2);
      expect(intersectsNone(novas, [note('a', 0, 0), note('b', 260, 0)])).toBeTrue();
      expect((novas.find((n) => n.t === 'w') as FbNode & { src: string }).src).toBe('{{nota: #n1 | Diário da mansão}}');
      expect(out.board.e).toEqual([jasmine.objectContaining({ a: out.novas['nova1'], b: 'b', txt: 'lupa' })]);
      expect(out.board.n[0]).toEqual(jasmine.objectContaining({ t: 'm', nome: 'Roxo' }));
    }
    expect(addToBoard(b, { pecas: [{ nota: 'nao-existe' }] }, ctx, AT)).toEqual({ erro: jasmine.stringContaining('nao-existe') } as never);
    expect(addToBoard(b, { setas: [{ de: 'a', para: 'zz' }] }, ctx, AT)).toEqual({ erro: jasmine.stringContaining('zz') } as never);
    expect(boardWords('quadro-livre.acrescentar', { pecas: [{ bilhete: 'x' }], setas: [{ de: 'a', para: 'b' }] }, 'Mansão', false)).toBe('Acrescentar 1 peça e 1 seta no quadro “Mansão”');
  });

  describe('na loja', () => {
    beforeEach(async () => {
      await deleteDatabase(BOARDS_DB);
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    });
    afterEach(async () => {
      TestBed.resetTestingModule();
      await deleteDatabase(BOARDS_DB);
    });

    it('criar com o id do pedido (repetir não cria outro), acrescentar e desfazer', async () => {
      const store = TestBed.inject(FreeBoardStore);
      const id = 'pedidoQuadroLivre00001';
      const made = await applyBoardRequest(store, { op: 'quadro-livre.criar', alvo: id, dados: { nome: 'Blue Prince', grupo: 'Jogos' } }, ctx);
      expect(made.estado).toBe('aplicado');
      expect(store.get(id)?.nome).toBe('Blue Prince');
      expect((await applyBoardRequest(store, { op: 'quadro-livre.criar', alvo: id, dados: { nome: 'Blue Prince', grupo: 'Jogos' } }, ctx)).estado).toBe('aplicado');
      expect(store.count()).toBe(1);
      const added = await applyBoardRequest(store, { op: 'quadro-livre.acrescentar', alvo: id, dados: { pecas: [{ bilhete: 'Senha?' }, { bilhete: 'Email' }], setas: [{ de: 'nova1', para: 'nova2' }] } }, ctx);
      expect(added.estado).toBe('aplicado');
      expect(store.get(id)!.n.length).toBe(2);
      expect(store.get(id)!.e.length).toBe(1);
      await undoBoard(store, { op: 'quadro-livre.acrescentar', alvo: id, resultado: added.resultado });
      expect(store.get(id)!.n.length).toBe(0);
      const gone = await applyBoardRequest(store, { op: 'quadro-livre.acrescentar', alvo: 'naoExisteQuadroLivre01', dados: { pecas: [{ bilhete: 'x' }] } }, ctx);
      expect(gone.estado).toBe('falhou');
      await undoBoard(store, { op: 'quadro-livre.criar', alvo: id });
      expect(store.get(id)).toBeNull();
    });
  });
});
