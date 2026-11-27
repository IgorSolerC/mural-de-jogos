import { ApplicationRef, Component, EnvironmentInjector, provideZonelessChangeDetection, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PieceLift, pieceLift } from './piece-lift';
import { ROOM, Room } from './room';
import { showImage } from './image-viewer';

/**
 * O zoom no lado (PLANO-LADO-A-LADO.md, D9): com duas coisas abertas lado a lado, a peça ampliada e a foto ampliada
 * ficam no lado delas (a sala, ui/room.ts), com o véu só nele; o outro lado continua vivo.
 */

async function landed(lift: PieceLift): Promise<void> {
  for (let i = 0; i < 100 && lift.open(); i++) await new Promise((r) => setTimeout(r, 20));
}
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const inside = (a: DOMRect, b: DOMRect) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;

/** A peça do texto (como um widget): quem a amplia mora dentro do lado. */
@Component({
  selector: 'app-peca-teste',
  template: `<div class="peca" style="width: 160px; height: 90px; background: #fff"><button type="button" class="dentro">Tocar</button></div>`,
})
class PecaTeste {
  readonly lift = pieceLift();
}

/** Um lado: a sala dele é a caixa `.sala`. */
@Component({
  selector: 'app-lado-teste',
  imports: [PecaTeste],
  providers: [{ provide: ROOM, useExisting: LadoTeste }],
  template: `
    <div class="sala" style="position: relative; width: 100%; height: 100%; overflow: hidden">
      <app-peca-teste />
      <button type="button" class="outro-botao">Outro</button>
    </div>
  `,
  host: { style: 'display: block; width: 50%; height: 400px' },
})
class LadoTeste implements Room {
  readonly peca = viewChild.required(PecaTeste);
  get lift(): PieceLift {
    return this.peca().lift;
  }
  sala: HTMLElement | null = null;
  room(): HTMLElement | null {
    return this.sala;
  }
}

@Component({
  imports: [LadoTeste],
  template: `<div style="display: flex; width: 900px"><app-lado-teste class="a" /><app-lado-teste class="b" /></div>`,
})
class Dois {}

describe('o zoom no lado (ui/room.ts, PLANO-LADO-A-LADO.md, D9)', () => {
  function make() {
    TestBed.configureTestingModule({ imports: [Dois], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Dois);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    const sides = fixture.debugElement.children[0].children.map((d) => d.componentInstance as LadoTeste);
    const rooms = [...el.querySelectorAll<HTMLElement>('.sala')];
    sides.forEach((s, i) => (s.sala = rooms[i]));
    return { fixture, el, sides, rooms, pieces: [...el.querySelectorAll<HTMLElement>('.peca')] };
  }

  it('a peça cresce só até o lado dela, com o véu só nele', async () => {
    const { sides, rooms, pieces } = make();
    sides[0].lift.lift(pieces[0]);
    await Promise.all(pieces[0].getAnimations().map((a) => a.finished));
    expect(pieces[0].matches(':popover-open')).toBeTrue();
    expect(pieces[0].classList).toContain('erguida-na-sala');
    expect(inside(pieces[0].getBoundingClientRect(), rooms[0].getBoundingClientRect())).withContext('a peça dentro do lado').toBeTrue();
    // centrada no lado
    const p = pieces[0].getBoundingClientRect();
    const r = rooms[0].getBoundingClientRect();
    expect(Math.abs(p.left + p.width / 2 - (r.left + r.width / 2))).toBeLessThan(3);
    // o véu: do tamanho do lado, e o da tela inteira transparente
    const veil = rooms[0].querySelector<HTMLElement>('.erguida-veu')!;
    expect(veil).not.toBeNull();
    const v = veil.getBoundingClientRect();
    expect(Math.round(v.width)).toBe(Math.round(r.width));
    expect(Math.round(v.left)).toBe(Math.round(r.left));
    expect(getComputedStyle(pieces[0], '::backdrop').backgroundColor).toBe('rgba(0, 0, 0, 0)');
    // o X no canto de cima da peça (medido de novo pelo lado, nunca no meio do voo)
    await wait(30);
    const x = rooms[0].querySelector<HTMLElement>('.erguida-fechar')!.getBoundingClientRect();
    const q = pieces[0].getBoundingClientRect();
    expect(Math.abs(x.top + 13 - q.top)).toBeLessThan(3);
    expect(Math.abs(x.right - 13 - q.right)).toBeLessThan(3);
    sides[0].lift.close(true);
  });

  it('o toque no outro lado não desce a peça (e chega lá); o toque no véu desce', async () => {
    const { sides, rooms, pieces } = make();
    sides[0].lift.lift(pieces[0]);
    let other = 0;
    const btn = rooms[1].querySelector<HTMLButtonElement>('.outro-botao')!;
    btn.addEventListener('click', () => other++);
    btn.click();
    expect(other).toBe(1);
    expect(sides[0].lift.open()).toBeTrue();
    rooms[0].querySelector<HTMLElement>('.erguida-veu')!.click();
    await landed(sides[0].lift);
    expect(sides[0].lift.open()).toBeFalse();
    expect(rooms[0].querySelector('.erguida-veu')).toBeNull();
  });

  it('uma peça em cada lado, ao mesmo tempo; o Esc desce só a do lado onde está o foco, e o Tab não fica preso', async () => {
    const { sides, rooms, pieces } = make();
    sides[0].lift.lift(pieces[0]);
    sides[1].lift.lift(pieces[1]);
    expect(sides[0].lift.open()).toBeTrue();
    expect(sides[1].lift.open()).toBeTrue();
    expect(inside(pieces[1].getBoundingClientRect(), rooms[1].getBoundingClientRect())).toBeTrue();
    // o foco está no X da segunda (a última que subiu)
    expect(rooms[1].contains(document.activeElement)).toBeTrue();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBeFalse();
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await landed(sides[1].lift);
    expect(sides[1].lift.open()).toBeFalse();
    expect(sides[0].lift.open()).toBeTrue();
    // o foco no outro lado: o Esc não é desta peça
    rooms[1].querySelector<HTMLButtonElement>('.outro-botao')!.focus();
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(esc);
    expect(esc.defaultPrevented).toBeFalse();
    expect(sides[0].lift.open()).toBeTrue();
    sides[0].lift.close(true);
  });

  it('a peça que sai do texto com ela no alto desce, sem deixar o véu e o X para trás', async () => {
    const { sides, rooms, pieces } = make();
    sides[0].lift.lift(pieces[0]);
    expect(rooms[0].querySelector('.erguida-veu')).not.toBeNull();
    pieces[0].remove();
    await wait(60);
    expect(sides[0].lift.open()).toBeFalse();
    expect(rooms[0].querySelector('.erguida-veu')).toBeNull();
    expect(rooms[0].querySelector('.erguida-fechar')).toBeNull();
  });

  it('sem sala, a peça vai para o meio da tela, como sempre', async () => {
    const { sides, pieces } = make();
    sides[0].sala = null;
    sides[0].lift.lift(pieces[0]);
    expect(pieces[0].classList).not.toContain('erguida-na-sala');
    expect(document.querySelector('.erguida-veu')).toBeNull();
    sides[0].lift.close(true);
  });

  it('a foto ampliada no lado: do tamanho dele, sem ser modal, e o Esc do outro lado não a fecha', async () => {
    const { rooms } = make();
    const from = document.createElement('span');
    from.style.cssText = 'display: block; width: 120px; height: 90px';
    rooms[0].appendChild(from);
    const env = TestBed.inject(EnvironmentInjector);
    const app = TestBed.inject(ApplicationRef);
    const shut = showImage({ url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', seed: 'x', caption: '', frame: 'foto', ratio: 4 / 3, natural: 0, from, room: rooms[0] }, env, app);
    await wait(30);
    const dialog = rooms[0].querySelector<HTMLDialogElement>('dialog.ampliada')!;
    expect(dialog).withContext('o visor mora no lado').not.toBeNull();
    expect(dialog.matches(':popover-open')).toBeTrue();
    expect(dialog.matches(':modal')).toBeFalse();
    const d = dialog.getBoundingClientRect();
    const r = rooms[0].getBoundingClientRect();
    expect(Math.round(d.width)).toBe(Math.round(r.width));
    expect(Math.round(d.left)).toBe(Math.round(r.left));
    expect(inside(dialog.querySelector('.foto')!.getBoundingClientRect(), r)).toBeTrue();
    rooms[1].querySelector<HTMLButtonElement>('.outro-botao')!.focus();
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await wait(30);
    expect(dialog.matches(':popover-open')).toBeTrue();
    // quem colou a foto saiu de cena: ela sai junto, sem voo
    shut();
    await wait(10);
    expect(rooms[0].querySelector('dialog.ampliada')).toBeNull();
  });
});
