import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { defaultProfile } from '../core/profile';
import { MiniPolaroid } from './mini-polaroid';
import { ProfileHero } from './profile-hero';

/**
 * O quadro de cima do perfil sem os pedaços de fita que só fingiam segurar a polaroid, a folha e as
 * fichinhas (pedido do dono, 25/nov/2026): o que fica colado no quadro se segura sozinho. As fitas
 * Dymo (os assuntos, o código, quando o mural mudou) têm texto e ficam.
 */
describe('ProfileHero: sem fita-crepe', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  it('a polaroid, a folha "Sobre mim" e as fichinhas dos números sem pedaço de fita', async () => {
    const f = TestBed.createComponent(ProfileHero);
    f.componentRef.setInput('profile', { ...defaultProfile(), topics: ['Jogos'] });
    f.componentRef.setInput('name', 'Ana');
    f.componentRef.setInput('code', 'ABCD-1234');
    f.componentRef.setInput('stats', { cards: 3, walls: 1, masterpieces: 0, since: 'nov. de 2026' });
    f.componentRef.setInput('updated', 'mudou hoje');
    f.detectChanges();
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('.polaroid')).not.toBeNull();
    expect(el.querySelector('.folha')).not.toBeNull();
    expect(el.querySelectorAll('.numero').length).toBe(4);
    expect(el.querySelector('.fita')).toBeNull();
    for (const n of Array.from(el.querySelectorAll('.numero'))) expect(getComputedStyle(n, '::before').content).toBe('none');
    // as fitas Dymo, que dizem alguma coisa, continuam
    expect(el.querySelectorAll('.dymo').length).toBe(3);
  });

  it('a polaroid pequena (seções em Polaroid, Seguindo e Seguidores) também sem fita', async () => {
    const f = TestBed.createComponent(MiniPolaroid);
    f.componentRef.setInput('caption', 'Hades');
    f.detectChanges();
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('.mp-foto')).not.toBeNull();
    expect(el.querySelector('.mp-fita')).toBeNull();
  });
});
