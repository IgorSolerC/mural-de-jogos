import { Injectable, inject } from '@angular/core';
import { plural } from '../core/text';
import { Confirm } from './confirm';
import { ICON } from './icons';

/** O que a pasta tem logo dentro (o que sobe ao desfazê-la): `NoteFolders.contentsOf`. */
export interface FolderContents {
  notes: number;
  folders: number;
}

/**
 * A pergunta de desfazer a pasta, uma só para a parede (o menu da pasta) e para as configurações do mural
 * (a parte Pastas). Fica fora do `RemoveAsking` porque a parede é a mesma peça da visita e não importa nada
 * que escreve (regra do CLAUDE.md): aqui só se pergunta; quem chama é quem desfaz.
 */
@Injectable({ providedIn: 'root' })
export class FolderAsking {
  private readonly confirm = inject(Confirm);

  /** A frase do que acontece: "As 2 anotações e 1 pasta de dentro vão para Estudos. Nenhuma anotação é apagada." */
  static dissolveText(contents: FolderContents, up: string): string {
    const { notes, folders } = contents;
    const what = [notes ? plural(notes, 'anotação', 'anotações') : '', folders ? plural(folders, 'pasta', 'pastas') : ''].filter(Boolean).join(' e ');
    const many = notes + folders > 1;
    return `${many ? 'As' : 'A'} ${what} de dentro ${many ? 'vão' : 'vai'} para ${up}. Nenhuma anotação é apagada.`;
  }

  /**
   * Pergunta antes de desfazer a pasta `name`, que sobe para `up` (o nome da de cima, ou do grupo). A vazia
   * não pergunta. Devolve se pode desfazer.
   */
  async dissolve(name: string, contents: FolderContents, up: string): Promise<boolean> {
    if (!contents.notes && !contents.folders) return true;
    return this.confirm.ask({
      title: `Desfazer a pasta ${name}?`,
      text: FolderAsking.dissolveText(contents, up),
      confirm: 'Desfazer a pasta',
      cancel: 'Deixar',
      icon: ICON.desfazerPasta,
    });
  }
}
