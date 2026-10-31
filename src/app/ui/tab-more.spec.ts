import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ICON } from './icons';
import { TabMore, TabMoreItem } from './tab-more';

@Component({
  imports: [TabMore],
  template: `
    <app-tab-more class="aba mais" [groups]="groups()" [autos]="autos()" [active]="active()" (chosen)="picked.push($event); active.set($event)">
      <span class="nome">Mais</span>
    </app-tab-more>
  `,
})
class Host {
  readonly groups = signal<TabMoreItem[]>([
    { key: 'c:japones', label: 'Japonês', n: 5, look: { color: 'verde' } },
    { key: 'c:pessoal', label: 'Pessoal', n: 2, look: {} },
    { key: 'sem', label: 'Sem grupo', n: 1, look: {}, plain: true },
  ]);
  readonly autos = signal<TabMoreItem[]>([
    { key: '', label: 'Tudo', n: 8, look: {}, glyph: ICON.camadas },
    { key: 'fixadas', label: 'Fixadas', n: 2, look: { color: 'azul' }, glyph: ICON.fixar },
  ]);
  readonly active = signal('c:estudos');
  readonly picked: string[] = [];
}

/**
 * O "Mais" das abas do mural: a orelha abre a lista de feltro com os grupos que não couberam e, depois
 * da costura, as abas que o mural gera; escolhe pelo toque ou pelo teclado, e o foco volta à orelha.
 */
describe('o Mais das abas (TabMore)', () => {
  let fixture: ComponentFixture<Host>;
  let el: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [Host], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
    el.remove();
  });

  const trigger = () => el.querySelector<HTMLButtonElement>('.gatilho')!;
  const panel = () => el.querySelector<HTMLElement>('.cardapio')!;
  const options = () => Array.from(el.querySelectorAll<HTMLButtonElement>('[role=option]'));
  const key = (k: string, target: Element = document.activeElement!) => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  };
  /** Abre e espera a lista estar aberta de verdade (ela abre depois de desenhada). */
  async function open(): Promise<void> {
    trigger().click();
    await fixture.whenStable();
    for (let i = 0; i < 20 && !panel().matches(':popover-open'); i++) {
      await fixture.whenStable();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
  }

  it('fechado, é só a orelha: um botão que diz que abre uma lista (escondida)', () => {
    expect(trigger().getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(trigger().textContent!.trim()).toBe('Mais');
    expect(panel().matches(':popover-open')).toBeFalse();
    expect(panel().checkVisibility()).toBeFalse();
  });

  it('aberto: os grupos, a costura e as abas geradas, com o desenho na cor e o número; o foco na primeira', async () => {
    await open();
    expect(panel().matches(':popover-open')).toBeTrue();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(panel().getAttribute('role')).toBe('listbox');
    const said = (o: HTMLElement) => `${o.querySelector('.nome, .nome-lapis')!.textContent!.trim()} ${o.querySelector('.n')!.textContent!.trim()}`;
    expect(options().map(said)).toEqual(['Japonês 5', 'Pessoal 2', 'Sem grupo 1', 'Tudo 8', 'Fixadas 2']);
    const seam = panel().querySelector('.costura')!;
    expect(seam.textContent!.trim()).toBe('Gerados automaticamente');
    // duas levas: os grupos, e as geradas com o nome da costura (o leitor de tela ouve)
    const levas = Array.from(panel().querySelectorAll('[role=group]'));
    expect(levas.length).toBe(2);
    expect(levas[0].getAttribute('aria-label')).toBe('Grupos');
    expect(levas[1].getAttribute('aria-labelledby')).toBe(seam.id);
    expect(levas[1].contains(seam)).toBeTrue();
    // cada opção diz o nome e quantas anotações, por extenso
    expect(options()[1].getAttribute('aria-label')).toBe('Pessoal, 2 anotações');
    expect(options()[2].getAttribute('aria-label')).toBe('Sem grupo, 1 anotação');
    // o desenho do grupo com cor vem na cor dele; o "Sem grupo" é a lápis, sem desenho
    expect(options()[0].style.getPropertyValue('--cat-cor')).not.toBe('');
    expect(options()[0].querySelector('app-cat-label')!.classList).toContain('tingido');
    expect(options()[2].querySelector('app-cat-label')).toBeNull();
    expect(document.activeElement).toBe(options()[0]);
    expect(options().filter((o) => o.tabIndex === 0).length).toBe(1);
  });

  it('as setas andam (sem passar das pontas), Home e End vão às pontas, uma letra pula; Enter escolhe e o foco volta', async () => {
    await open();
    key('ArrowUp');
    expect(document.activeElement).toBe(options()[0]);
    key('ArrowDown');
    key('ArrowDown');
    await fixture.whenStable();
    expect(document.activeElement).toBe(options()[2]);
    key('End');
    await fixture.whenStable();
    expect(document.activeElement).toBe(options()[4]);
    key('Home');
    await fixture.whenStable();
    expect(document.activeElement).toBe(options()[0]);
    key('t');
    await fixture.whenStable();
    expect(document.activeElement!.textContent).toContain('Tudo');
    // o atalho com Ctrl não é letra da busca
    const ctrl = new KeyboardEvent('keydown', { key: 'j', ctrlKey: true, bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(ctrl);
    expect(ctrl.defaultPrevented).toBeFalse();
    expect(document.activeElement!.textContent).toContain('Tudo');
    // sem acento: o "j" acha o Japonês, e o "s" o Sem grupo
    key('j');
    expect(document.activeElement!.textContent).toContain('Japonês');
    key('t');
    (document.activeElement as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(fixture.componentInstance.picked).toEqual(['']);
    expect(panel().matches(':popover-open')).toBeFalse();
    expect(document.activeElement).toBe(trigger());
  });

  it('a aberta vem marcada, e o foco começa nela; escolhê-la de novo só fecha', async () => {
    fixture.componentInstance.active.set('fixadas');
    await fixture.whenStable();
    expect(trigger().getAttribute('aria-label')).toBe('Mais abas: Fixadas');
    await open();
    const on = options().find((o) => o.getAttribute('aria-selected') === 'true')!;
    expect(on.textContent).toContain('Fixadas');
    expect(on.classList).toContain('ligada');
    expect(document.activeElement).toBe(on);
    on.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.picked).toEqual([]);
  });

  it('a seta para baixo na orelha abre; o Tab fecha e o foco volta para a orelha', async () => {
    trigger().focus();
    key('ArrowDown', trigger());
    await fixture.whenStable();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(panel().matches(':popover-open')).toBeTrue();
    key('Tab');
    await fixture.whenStable();
    expect(panel().matches(':popover-open')).toBeFalse();
    expect(document.activeElement).toBe(trigger());
  });

  it('o Esc fecha com o foco de volta na orelha; tocar na orelha aberta fecha, sem abrir de novo', async () => {
    await open();
    key('ArrowDown');
    key('Escape');
    await fixture.whenStable();
    expect(panel().matches(':popover-open')).toBeFalse();
    expect(document.activeElement).toBe(trigger());
    await open();
    trigger().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    trigger().click();
    await fixture.whenStable();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(panel().matches(':popover-open')).toBeFalse();
    expect(trigger().getAttribute('aria-controls')).toBeNull();
    // cada "Mais" tem a sua lista
    await open();
    expect(trigger().getAttribute('aria-controls')).toBe(panel().id);
    expect(panel().id).toMatch(/^mais-lista-\d+$/);
  });

  it('sem nenhum grupo, só as geradas: a costura vira o título da lista', async () => {
    fixture.componentInstance.groups.set([]);
    await open();
    expect(panel().querySelector('.costura')!.classList).toContain('so');
    expect(options().length).toBe(2);
  });
});
