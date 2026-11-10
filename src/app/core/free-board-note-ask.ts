import { Injectable } from '@angular/core';

/** A anotação que o quadro recebe: o id e o título. */
export interface AskedNote {
  id: string;
  title: string;
}

/**
 * A anotação nova pedida de dentro do Quadro livre (o "Nova anotação" do seletor): o editor abre no grupo do
 * quadro e, salva, ela vai para o quadro em vez de levar a tela até o mural (`App.landSaved` pergunta aqui, como
 * o lembrete do Calendário). Fechar o editor sem salvar responde null: o quadro não fica esperando.
 */
@Injectable({ providedIn: 'root' })
export class FreeBoardNoteAsk {
  private waiting: ((note: AskedNote | null) => void) | null = null;

  /** Espera a próxima anotação nova salva (a pergunta de antes, se havia, responde null). */
  ask(): Promise<AskedNote | null> {
    this.cancel();
    return new Promise((resolve) => (this.waiting = resolve));
  }

  /** Há um quadro esperando uma anotação nova? */
  get pending(): boolean {
    return !!this.waiting;
  }

  /** A anotação nova foi salva: se o quadro esperava, ela vai para ele (e a tela fica lá). */
  claim(id: string, title: string): boolean {
    const done = this.waiting;
    if (!done) return false;
    this.waiting = null;
    done({ id, title });
    return true;
  }

  /** O editor fechou sem salvar: ninguém mais espera. */
  cancel(): void {
    const done = this.waiting;
    this.waiting = null;
    done?.(null);
  }
}
