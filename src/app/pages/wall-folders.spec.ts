import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { Router, provideRouter } from '@angular/router';
import { Colleague, ColleagueStore } from '../core/colleague-store';
import { NoteFolder } from '../core/folders';
import { Mural } from '../core/mural';
import { Review, sanitizeReview } from '../core/review';
import { ViewTransitions } from '../core/view-transitions';
import { VisitView } from '../core/visit-view';
import { WallState } from '../core/wall-view';
import { WallToolbar } from '../ui/wall-toolbar';
import { WallAccess, WallBoard } from './wall-board';

/**
 * As pastas na parede e o caminho na barra (PLANO-PASTAS.md, rodada 2), montados como na visita: a mesma
 * régua e a mesma parede do seu Murall sobre a vista de quem você visita (a regra "Visita: as mesmas peças
 * do dono", no CLAUDE.md). Quem visita navega nas pastas igual ao dono.
 */

const ACCESS: WallAccess = { landingId: null, picking: false, picked: new Map(), masked: false, secret: new Set(), reactCode: null, checkable: true, looks: {} };

const note = (id: string, title: string, folder?: string): Review =>
  sanitizeReview({
    id,
    kind: 'anotacoes',
    game: { name: title, coverUrl: null, source: 'manual' },
    text: `Texto de ${title}`,
    category: 'Estudos',
    stock: 'azul',
    completedAt: '2026-10-01',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...(folder ? { folder } : {}),
  })!;

const f = (id: string, name: string, parent: string | null = null): NoteFolder => ({ id, group: 'estudos', name, parent });

const MARINA = {
  id: 'Marina',
  name: 'Marina',
  fileName: '',
  loadedAt: '2026-10-01T00:00:00Z',
  // (dois grupos: com um só, o mural não tem abas)
  reviews: [note('nf000001', 'Recursão', 'pfunc000001'), note('nf000002', 'Bash', 'pscri000001'), note('nf000003', 'Solta'), { ...note('nf000004', 'Daily'), category: 'Trabalho' }],
  folders: [f('pprog000001', 'Programação'), f('pfunc000001', 'Funcional', 'pprog000001'), f('pscri000001', 'Scripts', 'pprog000001'), f('pvazi000001', 'Vazia')],
  exportedAt: null,
  skipped: 0,
  ownerName: null,
} as unknown as Colleague;

@Component({
  imports: [WallToolbar, WallBoard],
  providers: [VisitView, { provide: WallState, useExisting: VisitView }],
  template: `<app-wall-toolbar /><app-wall-board [access]="access" />`,
})
class VisitHost {
  readonly access = ACCESS;
}

describe('as pastas na parede de quem você visita', () => {
  let el: HTMLElement;
  let visit: VisitView;

  const settle = async () => {
    for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r));
  };
  const folderNames = () => Array.from(el.querySelectorAll('app-folder-card .nome')).map((n) => n.textContent!.trim());
  const crumbs = () => Array.from(el.querySelectorAll('app-folder-path .migalha')).map((n) => n.textContent!.trim());
  const folderButton = (name: string) =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('app-folder-card button')).find((b) => b.querySelector('.nome')?.textContent?.trim() === name)!;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        // o endereço de mentira: o histórico da página dos testes fica como está
        provideLocationMocks(),
        { provide: ViewTransitions, useValue: { run: (change: () => void) => change() } },
        { provide: ColleagueStore, useValue: { selected: signal<Colleague | null>(MARINA) } },
      ],
    });
    TestBed.inject(Mural).kind.set('anotacoes');
    const fixture = TestBed.createComponent(VisitHost);
    el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    visit = fixture.debugElement.injector.get(VisitView);
    await fixture.whenStable();
    visit.setNoteTab('c:estudos');
    await settle();
  });

  afterEach(() => {
    el.remove();
    localStorage.clear();
  });

  it('a raiz do grupo: as pastas antes das fichas, com o número, e sem o caminho', () => {
    expect(folderNames()).toEqual(['Programação', 'Vazia']);
    expect(folderButton('Programação').getAttribute('aria-label')).toBe('Pasta Programação, 2 notas e 2 pastas');
    expect(folderButton('Vazia').textContent).toContain('Vazia');
    expect(el.querySelector('app-folder-path')).toBeNull();
  });

  it('tocar numa pasta entra: o caminho aparece, o foco vai para ele, e o endereço ganha a pasta', async () => {
    folderButton('Programação').click();
    await settle();
    expect(crumbs()).toEqual(['Estudos', 'Programação']);
    expect(el.querySelector('app-folder-path .aqui')!.getAttribute('aria-current')).toBe('location');
    expect(document.activeElement).toBe(el.querySelector('app-folder-path .aqui'));
    expect(folderNames()).toEqual(['Funcional', 'Scripts']);
    expect(el.querySelector('.sr-only[aria-live]')!.textContent).toContain('Pasta Programação, 2 pastas');
    expect(TestBed.inject(Router).url).toContain('pasta=pprog000001');

    folderButton('Funcional').click();
    await settle();
    expect(crumbs()).toEqual(['Estudos', 'Programação', 'Funcional']);
    expect(folderNames()).toEqual([]);
    expect(TestBed.inject(Router).url).toContain('pasta=pfunc000001');
  });

  it('o caminho sobe: o pedaço volta até ele, e o foco fica na pasta de onde se saiu', async () => {
    folderButton('Programação').click();
    await settle();
    folderButton('Funcional').click();
    await settle();
    // a seta sobe uma
    el.querySelector<HTMLButtonElement>('app-folder-path .subir')!.click();
    await settle();
    expect(crumbs()).toEqual(['Estudos', 'Programação']);
    expect(document.activeElement).toBe(folderButton('Funcional'));
    // o grupo volta à raiz
    el.querySelector<HTMLButtonElement>('app-folder-path .migalha')!.click();
    await settle();
    expect(el.querySelector('app-folder-path')).toBeNull();
    expect(document.activeElement).toBe(folderButton('Programação'));
  });

  it('a pasta vazia diz que está vazia; na visita, sem o botão de escrever', async () => {
    folderButton('Vazia').click();
    await settle();
    expect(el.querySelector('.pasta-vazia h2')!.textContent).toContain('Vazia está vazia');
    expect(el.querySelector('.pasta-vazia .btn-ink')).toBeNull();
  });

  it('procurando dentro da pasta: a barra diz onde, e "Procurar em todo o grupo" volta à raiz', async () => {
    folderButton('Programação').click();
    await settle();
    visit.query.set('Bash');
    await settle();
    expect(folderNames()).toEqual([]);
    const found = el.querySelector('.achados')!;
    expect(found.textContent).toContain('em Programação e nas pastas de dentro');
    Array.from(found.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.includes('todo o grupo'))!.click();
    await settle();
    expect(visit.openFolder()).toBeNull();
    expect(visit.query()).toBe('Bash');
  });

  it('o Voltar do navegador sobe uma pasta', async () => {
    // (o roteador só ouve o Voltar depois da primeira navegação, que o app faz ao subir)
    TestBed.inject(Router).initialNavigation();
    await settle();
    folderButton('Programação').click();
    await settle();
    folderButton('Funcional').click();
    await settle();
    TestBed.inject(Location).back();
    for (let i = 0; i < 20 && visit.openFolder() !== 'pprog000001'; i++) await new Promise((r) => setTimeout(r, 20));
    expect(visit.openFolder()).toBe('pprog000001');
  });
});
