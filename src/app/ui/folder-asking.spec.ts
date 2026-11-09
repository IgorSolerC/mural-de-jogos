import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Confirm } from './confirm';
import { FolderAsking } from './folder-asking';

/**
 * A pergunta de desfazer a pasta (ui/folder-asking.ts): uma só, para a parede e para as configurações do
 * mural, que antes escreviam cada uma a sua.
 */
describe('a pergunta de desfazer a pasta (FolderAsking)', () => {
  let asked: { title: string; text: string; confirm: string; cancel?: string }[];
  let answer: boolean;

  beforeEach(() => {
    asked = [];
    answer = true;
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: Confirm,
          useValue: {
            ask: (o: { title: string; text: string; confirm: string; cancel?: string }) => {
              asked.push(o);
              return Promise.resolve(answer);
            },
          },
        },
      ],
    });
  });

  it('diz o que sobe e para onde, no número certo; a vazia não pergunta', async () => {
    const asking = TestBed.inject(FolderAsking);
    expect(await asking.dissolve('Funcional', { notes: 2, folders: 1 }, 'Estudos')).toBeTrue();
    expect(asked[0]).toEqual(
      jasmine.objectContaining({
        title: 'Desfazer a pasta Funcional?',
        text: 'As 2 anotações e 1 pasta de dentro vão para Estudos. Nenhuma anotação é apagada.',
        confirm: 'Desfazer a pasta',
        cancel: 'Deixar',
      }),
    );
    expect(FolderAsking.dissolveText({ notes: 0, folders: 1 }, 'Programação')).toBe('A 1 pasta de dentro vai para Programação. Nenhuma anotação é apagada.');
    // a vazia some sem perguntar
    expect(await asking.dissolve('Vazia', { notes: 0, folders: 0 }, 'Estudos')).toBeTrue();
    expect(asked.length).toBe(1);
    // o "Deixar" não desfaz
    answer = false;
    expect(await asking.dissolve('Funcional', { notes: 1, folders: 0 }, 'Estudos')).toBeFalse();
  });
});
