import { Injectable, inject } from '@angular/core';
import { plural } from '../core/text';
import { Confirm } from './confirm';
import { ICON } from './icons';

/** O que a pasta tem logo dentro (o que sobe ao desfazê-la): `NoteFolders.contentsOf`. */
export interface FolderContents {
  notes: number;
  folders: number;
}

/** O que mora nas pastas: as anotações, os recortes da Wishlist (`WISH_UNITS`) ou as pixel arts (`PIXEL_UNITS`). */
export interface FolderUnits {
  one: string;
  many: string;
  /** "o recorte", "os recortes". */
  male: boolean;
  /** O fim da frase: nada se apaga. */
  none: string;
}

export const NOTE_UNITS: FolderUnits = { one: 'anotação', many: 'anotações', male: false, none: 'Nenhuma anotação é apagada.' };
export const WISH_UNITS: FolderUnits = { one: 'recorte', many: 'recortes', male: true, none: 'Nenhum recorte sai da wishlist.' };
export const PIXEL_UNITS: FolderUnits = { one: 'pixel art', many: 'pixel arts', male: false, none: 'Nenhuma pixel art é apagada.' };

/**
 * A pergunta de desfazer a pasta, uma só para a parede (o menu da pasta) e para as configurações do mural
 * (a parte Pastas). Fica fora do `RemoveAsking` porque a parede é a mesma peça da visita e não importa nada
 * que escreve (regra do CLAUDE.md): aqui só se pergunta; quem chama é quem desfaz.
 */
@Injectable({ providedIn: 'root' })
export class FolderAsking {
  private readonly confirm = inject(Confirm);

  /** A frase do que acontece: "As 2 anotações e 1 pasta de dentro vão para Estudos. Nenhuma anotação é apagada." */
  static dissolveText(contents: FolderContents, up: string, units: FolderUnits = NOTE_UNITS): string {
    const { notes, folders } = contents;
    const what = [notes ? plural(notes, units.one, units.many) : '', folders ? plural(folders, 'pasta', 'pastas') : ''].filter(Boolean).join(' e ');
    // o artigo vai pelo primeiro da lista (os recortes são "os"; as anotações e as pastas, "as")
    const many = notes + folders > 1;
    const male = !!notes && units.male;
    const art = many ? (male ? 'Os' : 'As') : male ? 'O' : 'A';
    return `${art} ${what} de dentro ${many ? 'vão' : 'vai'} para ${up}. ${units.none}`;
  }

  /**
   * Pergunta antes de desfazer a pasta `name`, que sobe para `up` (o nome da de cima, ou do grupo). A vazia
   * não pergunta. Devolve se pode desfazer.
   */
  async dissolve(name: string, contents: FolderContents, up: string, units: FolderUnits = NOTE_UNITS): Promise<boolean> {
    if (!contents.notes && !contents.folders) return true;
    return this.confirm.ask({
      title: `Desfazer a pasta ${name}?`,
      text: FolderAsking.dissolveText(contents, up, units),
      confirm: 'Desfazer a pasta',
      cancel: 'Deixar',
      icon: ICON.desfazerPasta,
    });
  }
}
