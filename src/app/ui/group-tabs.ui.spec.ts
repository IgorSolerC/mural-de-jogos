import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { boardIdFor } from '../core/kanban';
import { Mural } from '../core/mural';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { KanbanPage } from '../pages/kanban-page';
import { NoteTabsBar } from './note-tabs-bar';

/**
 * As orelhas dos grupos: as abas do mural das anotações e as dos quadros do Kanban são a mesma
 * (o mesmo tamanho, a mesma letra, a mesma tinta), as duas do kit de _divisorias.scss.
 */

@Component({ selector: 'app-raiz', imports: [RouterOutlet], template: '<router-outlet />' })
class Raiz {}

const T0 = '2026-10-20T10:00:00.000Z';

const note = (id: string, category: string): Review => ({
  ...sanitizeReview({ kind: 'anotacoes', game: { name: `Nota ${id}`, coverUrl: null, source: 'manual' }, category, completedAt: '2026-10-01', createdAt: T0, updatedAt: T0 })!,
  id,
});

/** O que faz a orelha parecer o que é: a aba, o nome do grupo e a conta. */
function looks(tab: HTMLElement) {
  const a = getComputedStyle(tab);
  const name = getComputedStyle(tab.querySelector('app-cat-label')!);
  const count = getComputedStyle(tab.querySelector('.n, .aba-n')!);
  return {
    padding: a.padding,
    minHeight: a.minHeight,
    radius: a.borderRadius,
    background: a.backgroundColor,
    nameFont: name.fontFamily,
    nameSize: name.fontSize,
    nameLine: name.lineHeight,
    nameMax: name.maxWidth,
    nameInk: name.opacity,
    countFont: count.fontFamily,
    countSize: count.fontSize,
    countWeight: count.fontWeight,
    countInk: count.opacity,
  };
}

describe('as orelhas dos grupos: iguais no mural e no Kanban', () => {
  const hosts: HTMLElement[] = [];

  beforeEach(() => {
    localStorage.clear();
    // a cor da aba muda devagar: aqui, na hora
    const still = document.createElement('style');
    still.textContent = '.aba { transition: none !important; }';
    document.head.appendChild(still);
    hosts.push(still);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: 'anotacoes/kanban/:quadro', component: KanbanPage }]),
      ],
    });
    TestBed.inject(Mural).kind.set('anotacoes');
    TestBed.inject(Settings).setCategoryLook('Trabalho', { color: 'azul' });
    // os dois quadros estão vazios: com os vazios escondidos, o dos Estudos iria para o "Mais"
    TestBed.inject(Settings).setNotesConfig({ hideEmpty: false });
    TestBed.inject(ReviewStore).reviews.set([note('ntrab001', 'Trabalho'), note('nestu001', 'Estudos')]);
  });

  afterEach(() => {
    hosts.splice(0).forEach((h) => h.remove());
    localStorage.clear();
  });

  it('a aba aberta e a de trás têm a mesma medida, a mesma letra e a mesma tinta', async () => {
    // os dois criados antes de ir para a página (criar um tira o outro de lá)
    const bar = TestBed.createComponent(NoteTabsBar);
    const raiz = TestBed.createComponent(Raiz);
    for (const f of [bar, raiz]) {
      document.body.appendChild(f.nativeElement);
      hosts.push(f.nativeElement);
    }
    await bar.whenStable();
    await TestBed.inject(Router).navigateByUrl(`/anotacoes/kanban/${boardIdFor('trabalho')}`);
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 0));
      TestBed.tick();
    }

    const tab = (root: HTMLElement, label: string) =>
      [...root.querySelectorAll<HTMLElement>('.aba:not(.medida .aba)')].find((a) => a.querySelector('app-cat-label')?.textContent?.trim() === label)!;
    const muralTabs = bar.nativeElement as HTMLElement;
    const kanbanTabs = raiz.nativeElement.querySelector('.abas-quadros') as HTMLElement;

    // os dois abertos no Trabalho (com cor); o Estudos atrás
    tab(muralTabs, 'Trabalho').click();
    await bar.whenStable();
    expect(tab(muralTabs, 'Trabalho').classList).toContain('on');
    expect(tab(kanbanTabs, 'Trabalho').classList).toContain('on');

    for (const label of ['Trabalho', 'Estudos']) {
      const mural = looks(tab(muralTabs, label));
      const kanban = looks(tab(kanbanTabs, label));
      expect(kanban).withContext(label).toEqual(mural);
    }
    // a letra do nome é a do mural, 1,08rem
    expect(getComputedStyle(tab(kanbanTabs, 'Estudos').querySelector('app-cat-label')!).fontSize).toBe(`${1.08 * parseFloat(getComputedStyle(document.documentElement).fontSize)}px`);
  });
});

describe('os grupos vazios no mural (Esconder os grupos vazios)', () => {
  let host: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
    TestBed.inject(Mural).kind.set('anotacoes');
    // os Estudos só com uma finalizada (escondida): nada à mostra no mural
    TestBed.inject(ReviewStore).reviews.set([note('ntrab001', 'Trabalho'), note('ntrab002', 'Trabalho'), { ...note('nestu001', 'Estudos'), doneAt: T0 }, note('ncasa001', 'Casa')]);
  });

  afterEach(() => {
    host?.remove();
    localStorage.clear();
  });

  it('o vazio vai para o "Mais", com o 0, e escolhido ali fica em pé até sair dele', async () => {
    const bar = TestBed.createComponent(NoteTabsBar);
    host = bar.nativeElement;
    document.body.appendChild(host);
    await bar.whenStable();
    const standing = () => [...host.querySelectorAll<HTMLElement>('.abas:not(.medida) > button.aba')].map((a) => a.querySelector('app-cat-label')?.textContent?.trim());
    expect(standing()).toEqual(['Trabalho', 'Casa']);
    const more = host.querySelector<HTMLElement>('app-tab-more')!;
    more.querySelector<HTMLButtonElement>('.gatilho')!.click();
    await bar.whenStable();
    const option = [...more.querySelectorAll<HTMLButtonElement>('[role=option]')].find((o) => o.getAttribute('aria-label')!.startsWith('Estudos'))!;
    expect(option.getAttribute('aria-label')).toBe('Estudos, 0 anotações');
    option.click();
    await bar.whenStable();
    expect(standing()).toEqual(['Trabalho', 'Casa', 'Estudos']);
    // saindo dele, volta para o "Mais"
    host.querySelector<HTMLButtonElement>('.abas:not(.medida) > button.aba')!.click();
    await bar.whenStable();
    expect(standing()).toEqual(['Trabalho', 'Casa']);
    // desligado, em pé
    TestBed.inject(Settings).setNotesConfig({ hideEmpty: false });
    await bar.whenStable();
    expect(standing()).toEqual(['Trabalho', 'Casa', 'Estudos']);
  });
});
