import { FreeBoardNoteAsk } from './free-board-note-ask';

describe('a anotação nova pedida pelo Quadro livre', () => {
  it('a salva vai para quem pediu; sem pedido, ninguém pega; fechar sem salvar responde nada', async () => {
    const ask = new FreeBoardNoteAsk();
    expect(ask.claim('a', 'A')).toBeFalse();
    const first = ask.ask();
    expect(ask.pending).toBeTrue();
    expect(ask.claim('b', 'B')).toBeTrue();
    expect(await first).toEqual({ id: 'b', title: 'B' });
    expect(ask.claim('c', 'C')).toBeFalse();
    const second = ask.ask();
    ask.cancel();
    expect(await second).toBeNull();
    // um pedido novo responde nada ao de antes
    const old = ask.ask();
    const fresh = ask.ask();
    expect(await old).toBeNull();
    ask.claim('d', 'D');
    expect(await fresh).toEqual({ id: 'd', title: 'D' });
  });
});
