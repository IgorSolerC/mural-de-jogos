import { ESCONDIDA_MS, type MotivoDeTrancar, PARADO_MS, type Relogio, Trancador } from './trancador';

/** Um relógio que anda à mão e um documento de mentira (só os eventos que o trancador usa). */
function montar(prazoDaqui = 8 * 3_600_000) {
  let agora = 1_000_000;
  let tique: (() => void) | null = null;
  const relogio: Relogio = { agora: () => agora, aCada: (_ms, fazer) => ((tique = fazer), () => (tique = null)) };
  const janela = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState, defaultView: janela }) as unknown as Document & { visibilityState: DocumentVisibilityState };
  const motivos: MotivoDeTrancar[] = [];
  const t = new Trancador(agora + prazoDaqui, (m) => motivos.push(m), doc, relogio);
  t.comecar();
  const andar = (ms: number) => {
    agora += ms;
    tique?.();
  };
  const esconder = (escondida: boolean) => {
    (doc as { visibilityState: DocumentVisibilityState }).visibilityState = escondida ? 'hidden' : 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
  };
  return { t, doc, janela, motivos, andar, esconder, temTique: () => tique !== null };
}

describe('os gatilhos de trancar', () => {
  it('5 minutos sem mexer tranca; mexer recomeça a conta', () => {
    const { doc, motivos, andar } = montar();
    andar(PARADO_MS - 1000);
    doc.dispatchEvent(new Event('keydown'));
    andar(PARADO_MS - 1000);
    expect(motivos).toEqual([]);
    andar(1000);
    expect(motivos).toEqual(['parado']);
  });

  it('a aba escondida por 1 minuto tranca; voltar antes, não', () => {
    const a = montar();
    a.esconder(true);
    a.andar(ESCONDIDA_MS - 1000);
    a.esconder(false);
    a.andar(2000);
    expect(a.motivos).toEqual([]);
    a.esconder(true);
    a.andar(ESCONDIDA_MS);
    expect(a.motivos).toEqual(['escondida']);
  });

  it('fechar a página tranca na hora', () => {
    const { janela, motivos } = montar();
    janela.dispatchEvent(new Event('pagehide'));
    expect(motivos).toEqual(['fechou']);
  });

  it('as 8 horas da sessão trancam, mesmo mexendo', () => {
    const { doc, motivos, andar } = montar(10_000);
    for (let i = 0; i < 9; i++) {
      doc.dispatchEvent(new Event('pointerdown'));
      andar(1000);
    }
    expect(motivos).toEqual([]);
    andar(1000);
    expect(motivos).toEqual(['prazo']);
  });

  it('tranca uma vez só, e para de ouvir', () => {
    const { janela, motivos, andar, temTique } = montar();
    janela.dispatchEvent(new Event('pagehide'));
    janela.dispatchEvent(new Event('pagehide'));
    andar(PARADO_MS * 2);
    expect(motivos).toEqual(['fechou']);
    expect(temTique()).toBe(false);
  });
});
