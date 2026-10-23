import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PieceLift, pieceLift } from './piece-lift';
import { ZoomKnob } from './zoom-knob';

/** O voo leva até 380 ms: espera a peça descer de vez. */
async function landed(lift: PieceLift): Promise<void> {
  for (let i = 0; i < 100 && lift.open(); i++) await new Promise((r) => setTimeout(r, 20));
}

@Component({
  imports: [ZoomKnob],
  template: `
    <div class="lugar" style="width: 300px">
      <p>Antes</p>
      <div #peca class="peca" [attr.data-papel-proprio]="own ? '' : null" style="width: 200px; height: 100px; padding: 4px; rotate: -2deg">
        <button type="button" class="dentro">Tocar</button>
        <app-zoom-knob (pressed)="lift.toggle(peca)" />
      </div>
      <p>Depois</p>
    </div>
  `,
})
class Host {
  readonly lift = pieceLift();
  own = false;
}

describe('a peça ampliada (ui/piece-lift.ts)', () => {
  function make(own = false) {
    TestBed.configureTestingModule({ imports: [Host], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.own = own;
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, lift: fixture.componentInstance.lift, piece: el.querySelector<HTMLElement>('.peca')!, place: el.querySelector<HTMLElement>('.lugar')! };
  }

  it('o broche sobe a peça para o meio da tela, sem tirá-la do lugar, e o Esc a desce de volta', async () => {
    const { fixture, el, lift, piece, place } = make();
    const height = place.offsetHeight;
    const inner = piece.querySelector('.dentro');
    let bubbled = 0;
    el.addEventListener('click', () => bubbled++);
    el.querySelector<HTMLButtonElement>('app-zoom-knob button')!.click();
    // o toque no broche não sobe (na ficha do mural, abriria a leitura)
    expect(bubbled).toBe(0);
    expect(lift.open()).toBeTrue();
    expect(piece.matches(':popover-open')).toBeTrue();
    expect(piece.classList).toContain('erguida');
    // a mesma peça, no mesmo lugar do DOM (o que tocava continua tocando)
    expect(piece.parentElement).toBe(place);
    expect(piece.querySelector('.dentro')).toBe(inner);
    // o lugar dela no texto fica guardado: o que vem depois não sobe
    expect(place.offsetHeight).toBe(height);
    // reta, no meio da tela, maior (depois do voo)
    await Promise.all(piece.getAnimations().map((a) => a.finished));
    expect(getComputedStyle(piece).rotate).toBe('0deg');
    expect(Number(piece.style.getPropertyValue('--erguida-zoom'))).toBeGreaterThan(1);
    const r = piece.getBoundingClientRect();
    expect(Math.abs(r.left + r.width / 2 - innerWidth / 2)).toBeLessThan(2);
    // o X, ao lado da peça (dentro do que pode ter foco), preso no canto dela, com o foco
    const shut = piece.nextElementSibling as HTMLButtonElement;
    expect(shut.classList).toContain('erguida-fechar');
    expect(shut.matches(':popover-open')).toBeTrue();
    expect(document.activeElement).toBe(shut);
    expect(shut.getAttribute('aria-label')).toBe('Voltar ao tamanho do texto');

    // o toque dentro da peça fica nela
    (inner as HTMLElement).click();
    expect(bubbled).toBe(0);
    expect(lift.open()).toBeTrue();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await landed(lift);
    expect(lift.open()).toBeFalse();
    expect(piece.hasAttribute('popover')).toBeFalse();
    expect(piece.classList).not.toContain('erguida');
    expect(piece.style.width).toBe('200px');
    expect(piece.style.height).toBe('100px');
    expect(piece.style.padding).toBe('4px');
    expect(piece.style.getPropertyValue('--erguida-zoom')).toBe('');
    expect(place.style.minHeight).toBe('');
    expect(el.querySelector('.erguida-fechar')).toBeNull();
    fixture.destroy();
  });

  it('a peça sem papel próprio ganha a folha creme em volta; a que é papel por inteiro, não', async () => {
    let t = make();
    t.lift.lift(t.piece);
    expect(t.piece.classList).toContain('erguida-papel');
    // a margem da folha: o que ela tinha de padding, mais 12
    expect(t.piece.style.padding).toBe('16px');
    expect(t.piece.style.width).toBe('224px');
    t.lift.close(true);
    expect(t.piece.style.padding).toBe('4px');
    t.fixture.destroy();
    TestBed.resetTestingModule();

    t = make(true);
    t.lift.lift(t.piece);
    expect(t.piece.classList).not.toContain('erguida-papel');
    expect(t.piece.style.width).toBe('200px');
    t.lift.close(true);
    t.fixture.destroy();
  });

  it('desce tocando fora dela ou no X, e o toque fora não chega no que está por baixo', async () => {
    const { fixture, el, lift, piece } = make();
    const below = el.querySelector('p')!;
    let hit = 0;
    below.addEventListener('click', () => hit++);
    lift.lift(piece);
    below.click();
    expect(hit).toBe(0);
    await landed(lift);
    expect(lift.open()).toBeFalse();

    lift.lift(piece);
    (piece.nextElementSibling as HTMLElement).click();
    await landed(lift);
    expect(lift.open()).toBeFalse();
    // de volta, o foco volta para quem a subiu (aqui, ninguém: fica onde estava)
    expect(el.querySelector('.erguida-fechar')).toBeNull();
    fixture.destroy();
  });

  it('o widget que sai da tela com a peça no alto a desce na hora', () => {
    const { fixture, lift, piece } = make();
    lift.lift(piece);
    fixture.destroy();
    expect(lift.open()).toBeFalse();
    expect(piece.matches(':popover-open')).toBeFalse();
  });

  it('o Tab dá a volta entre o X e o que se toca na peça, sem ir para o que está atrás do véu', () => {
    const { fixture, lift, piece } = make();
    lift.lift(piece);
    const shut = piece.nextElementSibling as HTMLElement;
    const inner = piece.querySelector<HTMLElement>('.dentro')!;
    const tab = (shiftKey = false) => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(shut);
    tab();
    expect(document.activeElement).toBe(inner);
    // o broche de ampliar, escondido no alto, fica fora da volta
    tab();
    expect(document.activeElement).toBe(shut);
    tab(true);
    expect(document.activeElement).toBe(inner);
    lift.close(true);
    fixture.destroy();
  });

  it('a peça pode pedir um zoom menor (data-zoom-max)', () => {
    const { fixture, lift, piece } = make();
    piece.setAttribute('data-zoom-max', '1.2');
    lift.lift(piece);
    expect(Number(piece.style.getPropertyValue('--erguida-zoom'))).toBeLessThanOrEqual(1.2);
    lift.close(true);
    fixture.destroy();
  });
});

@Component({
  imports: [ZoomKnob],
  template: `
    <div class="amplia nota" style="padding: 40px">
      <app-zoom-knob class="da-nota" />
      <div class="amplia foto" style="width: 100px; height: 60px"><app-zoom-knob class="da-foto" /></div>
    </div>
  `,
})
class Nested {}

describe('o broche de ampliar (ui/zoom-knob.ts)', () => {
  it('acende só com o mouse na peça dele: a foto dentro da nota não acende o da nota de fora, e sim', async () => {
    TestBed.configureTestingModule({ imports: [Nested], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Nested);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const note = el.querySelector<HTMLElement>('.nota')!;
    const photo = el.querySelector<HTMLElement>('.foto')!;
    const ofNote = el.querySelector('.da-nota')!;
    const ofPhoto = el.querySelector('.da-foto')!;
    note.dispatchEvent(new PointerEvent('pointerenter'));
    fixture.detectChanges();
    expect(ofNote.classList).toContain('perto');
    expect(ofPhoto.classList).not.toContain('perto');
    photo.dispatchEvent(new PointerEvent('pointerenter'));
    fixture.detectChanges();
    expect(ofPhoto.classList).toContain('perto');
    photo.dispatchEvent(new PointerEvent('pointerleave'));
    note.dispatchEvent(new PointerEvent('pointerleave'));
    fixture.detectChanges();
    expect(ofNote.classList).not.toContain('perto');
    expect(ofPhoto.classList).not.toContain('perto');
    fixture.destroy();
  });
});
