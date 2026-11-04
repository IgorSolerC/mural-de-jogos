import { ChangeDetectionStrategy, Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Settings } from '../core/settings';
import { HeightMemo } from './height-memo';
import { NEAR_TUNING, NearPool, NearScreen } from './near-screen';
import { resetPace } from './pace';

/** Uma parede de teste: uma caixa que rola por conta própria, com a ficha só quando está perto. */
@Component({
  imports: [NearScreen],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="caixa" style="height: 200px; overflow-y: auto">
      @for (id of ids(); track id) {
        <div class="lugar" [attr.data-id]="id" appPerto=".caixa" #perto="perto" appPertoMede="teste" [appPertoId]="id">
          @if (perto.near()) {
            <button type="button" class="ficha" style="display: block; height: 100px; width: 100%">{{ id }}</button>
          } @else {
            <div class="vaga" data-vaga style="height: 100px"></div>
          }
        </div>
      }
    </div>
  `,
})
class Parede {
  readonly ids = signal(Array.from({ length: 600 }, (_, i) => `f${i}`));
}

describe('o que está perto da tela (NearScreen)', () => {
  const tuning = { ...NEAR_TUNING };
  let host: HTMLElement;
  let page: Parede;
  let box: HTMLElement;

  const frames = async (n = 3) => {
    for (let i = 0; i < n; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => setTimeout(r));
      TestBed.tick();
    }
  };
  /** Espera até valer (o observador e a fila respondem em quadros que o Karma, em segundo plano, atrasa). */
  const until = async (done: () => boolean, what: string) => {
    for (let i = 0; i < 400 && !done(); i++) await frames(1);
    expect(done()).withContext(what).toBeTrue();
  };
  const mounted = (id: string) => !!host.querySelector(`[data-id="${id}"] .ficha`);
  const count = (sel: string) => host.querySelectorAll(sel).length;

  function mount(): void {
    const fixture = TestBed.createComponent(Parede);
    host = fixture.nativeElement;
    page = fixture.componentInstance;
    // no alto da tela, longe do que outros testes deixaram na página
    Object.assign(host.style, { position: 'fixed', inset: '0 auto auto 0', width: '300px', zIndex: '9999' });
    document.body.append(host);
    fixture.detectChanges();
    TestBed.tick();
    box = host.querySelector<HTMLElement>('.caixa')!;
  }

  beforeEach(() => {
    localStorage.clear();
    resetPace();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    TestBed.inject(NearPool).forgetHeights();
    Object.assign(NEAR_TUNING, { leaveAfter: 40, sweepEvery: 10 });
  });

  afterEach(() => {
    Object.assign(NEAR_TUNING, tuning);
    host?.remove();
  });

  it('o que está na tela monta antes da pintura, sem esperar o observador; o que está longe fica vaga', () => {
    mount();
    expect(mounted('f0')).withContext('na caixa, no alto').toBeTrue();
    // a caixa corta o que passa dela, e a conta de antes da pintura olha só a tela
    expect(mounted('f59')).withContext('bem longe').toBeFalse();
    expect(count('.vaga')).toBeGreaterThan(0);
  });

  it('a folga é da caixa que rola, e não só da tela: a ficha logo abaixo do corte da coluna monta', async () => {
    mount();
    // 200px de caixa e 100% de folga: até uns 400px abaixo (f3 começa em 300px)
    await until(() => mounted('f3'), 'dentro da folga');
    await frames(5);
    expect(mounted('f30')).withContext('fora da folga').toBeFalse();
  });

  it('rolando até lá, a vaga vira ficha; e o que ficou longe volta a ser vaga, da altura que tinha', async () => {
    mount();
    await until(() => mounted('f3'), 'a primeira leva');
    const height = box.scrollHeight;
    box.scrollTop = 3000;
    await until(() => mounted('f30'), 'perto do lugar novo');
    await until(() => !mounted('f0'), 'a do alto saiu');
    expect(box.scrollHeight).withContext('a coluna não muda de tamanho').toBe(height);
  });

  it('a ficha com o foco não sai, mesmo longe', async () => {
    mount();
    const first = host.querySelector<HTMLElement>('[data-id="f0"] .ficha')!;
    spyOn(HTMLElement.prototype, 'matches').and.callFake(function (this: HTMLElement, sel: string) {
      // (o foco de verdade não vale com a janela dos testes sem foco do sistema)
      return sel === ':focus-within' && this.getAttribute('data-id') === 'f0';
    });
    box.scrollTop = 3000;
    await until(() => !mounted('f1'), 'a vizinha saiu');
    expect(mounted('f0')).toBeTrue();
    expect(first.isConnected).toBeTrue();
  });

  it('outra ordem: settle monta na hora o que chegou à tela', async () => {
    mount();
    await until(() => mounted('f3'), 'a primeira leva');
    page.ids.update((ids) => [...ids].reverse());
    TestBed.tick();
    // (a âncora da rolagem seguiria a ficha de antes até o pé)
    box.scrollTop = 0;
    TestBed.inject(NearPool).settle();
    TestBed.tick();
    expect(mounted('f599')).withContext('agora no alto').toBeTrue();
  });

  it('rolando rápido demais para ler, as vagas passam; quando a rolagem acalma, a ficha de onde ela parou monta', async () => {
    mount();
    await until(() => mounted('f3'), 'a primeira leva');
    const before = count('.ficha');
    // 2.000px por quadro: montando uma por quadro que fosse, seriam 20 a mais
    for (let i = 0; i < 20; i++) {
      box.scrollTop += 2000;
      await new Promise((r) => requestAnimationFrame(r));
    }
    TestBed.tick();
    expect(count('.ficha') - before).toBeLessThanOrEqual(8);
    const id = `f${Math.floor(box.scrollTop / 100)}`;
    await until(() => mounted(id), 'depois da calma');
  });

  it('a vaga pergunta a altura: a medida da ficha, a média das do tipo ou o palpite', async () => {
    mount();
    const pool = TestBed.inject(NearPool);
    expect(pool.height('nunca-medido', 'x', 77)).toBe(77);
    await until(() => pool.height('teste', 'f0', 77) === 100, 'a medida da própria ficha');
    expect(pool.height('teste', 'f59', 77)).withContext('a média').toBe(100);
  });

  it('o que a caixa corta não está na tela: não monta antes da pintura, mesmo dentro da janela', () => {
    mount();
    // 200px de caixa: a f2 começa exatamente no corte, e a f4 está bem abaixo dele, ainda na janela
    expect(host.querySelector('[data-id="f4"]')!.getBoundingClientRect().top).toBeLessThan(innerHeight);
    expect(mounted('f1')).toBeTrue();
    expect(mounted('f4')).toBeFalse();
  });

  it('"Menos fichas prontas" troca o observador pelo de folga menor, e continua olhando todas', async () => {
    const created: IntersectionObserverInit[] = [];
    const Real = IntersectionObserver;
    spyOn(window, 'IntersectionObserver').and.callFake(function (cb: IntersectionObserverCallback, init?: IntersectionObserverInit) {
      created.push(init ?? {});
      return new Real(cb, init);
    } as never);
    mount();
    await until(() => created.length > 0, 'o primeiro observador');
    expect(created[0].rootMargin).toBe('100% 0px');
    expect(created[0].root).toBe(box);
    TestBed.inject(Settings).fewCards.set(true);
    TestBed.tick();
    expect(created.at(-1)!.rootMargin).toBe('50% 0px');
    expect(created.at(-1)!.root).toBe(box);
    // o novo observador ainda funciona: rolando até lá, a ficha monta (a folga menor: até 300px)
    box.scrollTop = 3000;
    await until(() => mounted('f30'), 'perto do lugar novo');
  });

  it('o observador sai junto com a última ficha da caixa', () => {
    const disconnect = spyOn(IntersectionObserver.prototype, 'disconnect').and.callThrough();
    mount();
    page.ids.set([]);
    TestBed.tick();
    expect(disconnect).toHaveBeenCalled();
  });
});

describe('as alturas medidas (HeightMemo)', () => {
  it('a média é por tipo, e medir de novo a mesma ficha não a conta duas vezes', () => {
    const memo = new HeightMemo<'a' | 'b'>();
    memo.remember('a', '1', 100);
    memo.remember('a', '2', 200);
    memo.remember('a', '2', 300);
    expect(memo.height('a', '9', 50)).toBe(200);
    expect(memo.height('b', '9', 50)).toBe(50);
    expect(memo.knows('a', '2')).toBeTrue();
    expect(memo.measured('b')).toBeFalse();
    memo.forget();
    expect(memo.height('a', '1', 50)).toBe(50);
  });

  it('altura zero (fora da página) não conta', () => {
    const memo = new HeightMemo();
    memo.remember('a', '1', 0);
    expect(memo.measured('a')).toBeFalse();
  });
});
