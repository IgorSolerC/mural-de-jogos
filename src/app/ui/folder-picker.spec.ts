import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoteFolder, folderTree } from '../core/folders';
import { FolderPicker } from './folder-picker';

/**
 * A escolha da pasta (PLANO-PASTAS.md, 4.8): a árvore do grupo, aberta no caminho da escolhida; a busca acha
 * em qualquer nível e mostra o caminho; o escrito que não existe oferece criar dentro da escolhida.
 */

const f = (id: string, name: string, parent: string | null = null, group = 'estudos'): NoteFolder => ({ id, group, name, parent });
const TREE = folderTree([
  f('pprog000001', 'Programação'),
  f('pfunc000001', 'Funcional', 'pprog000001'),
  f('phask000001', 'Haskell', 'pfunc000001'),
  f('phist000001', 'História'),
  f('preun000001', 'Reuniões', null, 'trabalho'),
]);

@Component({
  imports: [FolderPicker],
  template: `<app-folder-picker [(value)]="value" [tree]="tree" group="estudos" groupName="Estudos" [counts]="counts" [blocked]="blocked()" (create)="made.push($event)" />`,
})
class Host {
  readonly value = signal<string | null>(null);
  readonly tree = TREE;
  readonly counts = new Map([['pprog000001', 3]]);
  readonly blocked = signal<ReadonlySet<string>>(new Set());
  readonly made: { parent: string | null; name: string }[] = [];
}

describe('a escolha da pasta (FolderPicker)', () => {
  let el: HTMLElement;
  let host: Host;
  let fixture: ComponentFixture<Host>;

  const names = () => Array.from(el.querySelectorAll('.ramo .op .nome')).map((n) => n.textContent!.trim());
  const radio = (name: string) => Array.from(el.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find((b) => b.querySelector('.nome')!.textContent!.trim() === name)!;
  const stable = () => fixture.whenStable();
  const type = async (text: string) => {
    const input = el.querySelector<HTMLInputElement>('input')!;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await stable();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  it('as de cima do grupo (A–Z), "Sem pasta" no topo; as de outro grupo não aparecem', () => {
    expect(names()).toEqual(['Sem pasta', 'História', 'Programação']);
    expect(radio('Sem pasta').getAttribute('aria-checked')).toBe('true');
    expect(radio('Programação').textContent).toContain('3');
  });

  it('a seta abre as de dentro; escolher uma abre o caminho até ela', async () => {
    el.querySelector<HTMLButtonElement>('.abre')!.click();
    await stable();
    expect(names()).toEqual(['Sem pasta', 'História', 'Programação', 'Funcional']);
    radio('Funcional').click();
    await stable();
    expect(host.value()).toBe('pfunc000001');
    expect(names()).toEqual(['Sem pasta', 'História', 'Programação', 'Funcional', 'Haskell']);
    expect(radio('Funcional').getAttribute('aria-checked')).toBe('true');
  });

  it('a busca acha em qualquer nível, com o caminho; o Enter escolhe a primeira', async () => {
    await type('has');
    // (e, como o escrito não é uma pasta ali, também oferece criar)
    expect(names()).toEqual(['Programação › Funcional › Haskell', 'Criar “Has” em Estudos']);
    el.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await stable();
    expect(host.value()).toBe('phask000001');
  });

  it('o escrito que não existe cria dentro da escolhida', async () => {
    host.value.set('pprog000001');
    await stable();
    await type('scripts');
    const make = el.querySelector<HTMLButtonElement>('.criar')!;
    expect(make.textContent).toContain('Criar “Scripts” em Programação');
    make.click();
    expect(host.made).toEqual([{ parent: 'pprog000001', name: 'Scripts' }]);
  });

  it('o que não se pode escolher fica apagado', async () => {
    host.blocked.set(new Set(['phist000001']));
    await stable();
    expect(radio('História').disabled).toBeTrue();
  });
});
