import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ProfileStore } from '../core/profile-store';
import { Reaction, ReactionTarget, Reactions } from '../core/reactions';
import { ReactionSheet, ReactionSheetView } from './reactions';

/**
 * A folha de quem reagiu, desenhada de verdade: a foto do perfil de cada pessoa (o emoji na cartolina
 * dela, e não mais o crachá com a inicial) e o caminho da foto e do nome até o perfil.
 */

const ME = 'EEEE-0000';
const ANA = 'AAAA-1111';
const HADES: ReactionTarget = { code: ANA, ref: 'r-hades', titulo: 'Hades', mural: 'jogos' };
const at = '2026-10-07T12:00:00.000Z';

describe('A folha de quem reagiu (ReactionSheetView)', () => {
  let fixture: ComponentFixture<ReactionSheetView>;
  let el: HTMLElement;
  let went: unknown[][];
  let given: ReturnType<typeof signal<Reaction[]>>;

  const rows = () => [...el.querySelectorAll<HTMLElement>('.pessoa')];
  const photo = (row: HTMLElement) => row.querySelector<HTMLElement>('app-person-photo')!;

  beforeEach(async () => {
    went = [];
    given = signal<Reaction[]>([
      { codigo: 'BBBB-2222', nome: 'Bia', foto: { emoji: '🐙', cor: 'rosa' }, reacao: 'fogo', em: at },
      { codigo: 'CCCC-3333', nome: 'Caio', foto: null, reacao: 'amei', em: '2026-10-07T13:00:00.000Z' },
      // a minha veio da nuvem com a foto de antes: vale a do perfil daqui
      { codigo: ME, nome: 'Eu', foto: { emoji: '🐢', cor: 'verde' }, reacao: 'fogo', em: at },
    ]);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: Reactions, useValue: { myCode: () => ME, of: () => given(), canReact: () => false, mineOn: () => null, load: async () => undefined, react: async () => undefined } },
        { provide: ProfileStore, useValue: { profile: signal({ emoji: '🦊', photo: 'azul' }) } },
        { provide: Router, useValue: { navigate: async (to: unknown[]) => (went.push(to), true) } },
      ],
    });
    fixture = TestBed.createComponent(ReactionSheetView);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    TestBed.inject(ReactionSheet).open(HADES);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    el.querySelector('dialog')?.close();
    TestBed.resetTestingModule();
  });

  it('cada pessoa aparece com a foto do perfil: o emoji na cartolina dela; sem foto, a inicial', () => {
    // a minha primeiro, depois as mais novas
    const [mine, caio, bia] = rows();
    expect(el.querySelector('.cracha-mini')).toBeNull();
    expect(photo(bia).textContent?.trim()).toBe('🐙');
    expect(photo(bia).getAttribute('data-cor')).toBe('rosa');
    expect(photo(caio).querySelector('.pf-inicial')?.textContent?.trim()).toBe('C');
    expect(photo(mine).textContent?.trim()).toBe('🦊');
    expect(photo(mine).getAttribute('data-cor')).toBe('azul');
  });

  it('o nome leva ao perfil de quem reagiu, e o "Você" ao seu: a folha fecha', () => {
    const names = rows().map((r) => r.querySelector<HTMLButtonElement>('.nome-link')!);
    expect(names.map((n) => n.textContent?.trim())).toEqual(['Você', 'Caio', 'Bia']);
    expect(names.map((n) => n.getAttribute('aria-label'))).toEqual(['Você: ver o seu perfil', 'Ver o perfil de Caio', 'Ver o perfil de Bia']);
    names[2].click();
    expect(went).toEqual([['/perfil', 'BBBB-2222']]);
    expect(el.querySelector('dialog')?.open).toBeFalse();
    names[0].click();
    expect(went[1]).toEqual(['/perfil', ME]);
  });

  it('a foto leva ao mesmo perfil, só para o mouse (o leitor de tela e o teclado vão pelo nome)', () => {
    const photos = rows().map((r) => r.querySelector<HTMLButtonElement>('.foto-perfil')!);
    expect(photos.map((p) => [p.getAttribute('aria-hidden'), p.tabIndex])).toEqual([['true', -1], ['true', -1], ['true', -1]]);
    photos[1].click();
    expect(went).toEqual([['/perfil', 'CCCC-3333']]);
  });
});
