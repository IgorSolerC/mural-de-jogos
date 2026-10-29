/**
 * Os gatilhos de trancar o cofre aberto (seção 8.2 do PLANO-COFRE.md): 5 minutos sem mexer, a aba
 * escondida por 1 minuto, a página fechando (`pagehide`) e as 8 horas da sessão. Quem decide o que é
 * trancar é quem cria (avisar o servidor e jogar fora a memória da página).
 */
export type MotivoDeTrancar = 'parado' | 'escondida' | 'fechou' | 'prazo';

export const PARADO_MS = 5 * 60_000;
export const ESCONDIDA_MS = 60_000;

export interface Relogio {
  agora(): number;
  aCada(ms: number, fazer: () => void): () => void;
}

export const relogioDoNavegador: Relogio = {
  agora: () => Date.now(),
  aCada: (ms, fazer) => {
    const id = setInterval(fazer, ms);
    return () => clearInterval(id);
  },
};

/** O que mexer conta como "a pessoa está usando". */
const MEXER = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

export class Trancador {
  private ultimoMovimento: number;
  private escondidaDesde: number | null = null;
  private trancou = false;
  private readonly desfazer: (() => void)[] = [];

  constructor(
    private readonly prazo: number,
    private readonly trancar: (motivo: MotivoDeTrancar) => void,
    private readonly documento: Document = document,
    private readonly relogio: Relogio = relogioDoNavegador,
  ) {
    this.ultimoMovimento = relogio.agora();
  }

  comecar(): void {
    const janela = this.documento.defaultView;
    const mexeu = () => this.mexeu();
    for (const evento of MEXER) {
      this.documento.addEventListener(evento, mexeu, { capture: true, passive: true });
      this.desfazer.push(() => this.documento.removeEventListener(evento, mexeu, { capture: true }));
    }
    const visibilidade = () => {
      if (this.documento.visibilityState === 'hidden') {
        this.escondidaDesde ??= this.relogio.agora();
        return;
      }
      // confere antes de esquecer quando escondeu: com a aba escondida, o celular e o notebook dormindo
      // param o relógio de 1 s, e a volta é a única chance de ver que passou do minuto
      this.conferir();
      this.escondidaDesde = null;
    };
    this.documento.addEventListener('visibilitychange', visibilidade);
    this.desfazer.push(() => this.documento.removeEventListener('visibilitychange', visibilidade));
    if (janela) {
      const fechou = () => this.disparar('fechou');
      janela.addEventListener('pagehide', fechou);
      this.desfazer.push(() => janela.removeEventListener('pagehide', fechou));
    }
    this.desfazer.push(this.relogio.aCada(1000, () => this.conferir()));
  }

  mexeu(): void {
    this.ultimoMovimento = this.relogio.agora();
  }

  /** Confere os prazos (também a cada segundo). */
  conferir(): void {
    const agora = this.relogio.agora();
    if (agora >= this.prazo) this.disparar('prazo');
    else if (this.escondidaDesde !== null && agora - this.escondidaDesde >= ESCONDIDA_MS) this.disparar('escondida');
    else if (agora - this.ultimoMovimento >= PARADO_MS) this.disparar('parado');
  }

  parar(): void {
    for (const f of this.desfazer.splice(0)) f();
  }

  private disparar(motivo: MotivoDeTrancar): void {
    if (this.trancou) return;
    this.trancou = true;
    this.parar();
    this.trancar(motivo);
  }
}
