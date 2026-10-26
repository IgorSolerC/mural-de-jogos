import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { COLLAGE_GAP, COLLAGE_ROW, Collage, collageRows } from './collage';

@Component({
  imports: [Collage],
  template: `
    <div appColagem style="display: grid; grid-auto-rows: 4px; width: 300px">
      <div class="a" style="height: 100px"></div>
      <div class="b" style="height: 40px; --colagem-pe: 12px"></div>
      @if (more()) {
        <div class="c" [style.height.px]="tall()"></div>
      }
    </div>
  `,
})
class Host {
  readonly more = signal(false);
  readonly tall = signal(60);
}

/** Espera o ResizeObserver medir (ele avisa no quadro seguinte). */
const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

describe('a colagem (peças em colunas, cada uma da altura dela)', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));

  it('cada peça ocupa as linhas da altura dela mais o vão', () => {
    expect(collageRows(100)).toBe(Math.ceil((100 + COLLAGE_GAP) / COLLAGE_ROW));
    expect(collageRows(40, 12)).toBe(Math.ceil((40 + COLLAGE_GAP + 12) / COLLAGE_ROW));
    expect(collageRows(0)).toBeGreaterThanOrEqual(1);
  });

  it('mede os filhos, os que entram depois e os que mudam de tamanho', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    await frames();
    const root = fixture.nativeElement as HTMLElement;
    const rows = (sel: string) => (root.querySelector(sel) as HTMLElement).style.getPropertyValue('--linhas');
    expect(rows('.a')).toBe(String(collageRows(100)));
    expect(rows('.b')).toBe(String(collageRows(40, 12)));

    fixture.componentInstance.more.set(true);
    fixture.detectChanges();
    await frames();
    expect(rows('.c')).toBe(String(collageRows(60)));

    fixture.componentInstance.tall.set(200);
    fixture.detectChanges();
    await frames();
    expect(rows('.c')).toBe(String(collageRows(200)));
    expect(root.querySelector('[appColagem]')!.classList).toContain('colagem-medida');
  });

  it('a peça segura (a fita filtrada) só cresce; sem a marca, volta à altura dela', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.more.set(true);
    fixture.componentInstance.tall.set(300);
    fixture.detectChanges();
    await frames();
    const c = (fixture.nativeElement as HTMLElement).querySelector('.c') as HTMLElement;
    c.setAttribute('data-colagem-segura', '');
    fixture.componentInstance.tall.set(80);
    fixture.detectChanges();
    await frames();
    expect(c.style.getPropertyValue('--linhas')).toBe(String(collageRows(300)));
    c.removeAttribute('data-colagem-segura');
    await frames();
    expect(c.style.getPropertyValue('--linhas')).toBe(String(collageRows(80)));
  });
});
