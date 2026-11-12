import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SectionHead } from './section-head';

/** A cabeça de uma seção numa coluna da largura que a parede der (PLANO-ETIQUETAS.md). */
@Component({
  imports: [SectionHead],
  template: `
    <div [style.width.px]="width()">
      <app-section-head
        [label]="label()"
        [count]="count()"
        [detail]="detail()"
        summary="3 jogos · média 9,1"
        [foldable]="foldable()"
        [open]="open()"
        [link]="link()"
        headingId="cabeca-teste"
        controls="fichas-teste"
        (toggle)="toggled.push($event.altKey)"
      />
    </div>
  `,
})
class Host {
  readonly width = signal(400);
  readonly label = signal('Outubro de 2026');
  readonly count = signal(3);
  readonly detail = signal('média 9,1');
  readonly foldable = signal(true);
  readonly open = signal(true);
  readonly link = signal<string | null>(null);
  readonly toggled: boolean[] = [];
}

describe('SectionHead', () => {
  const mounted: HTMLElement[] = [];

  async function head(set: (h: Host) => void = () => undefined) {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
    const fixture = TestBed.createComponent(Host);
    set(fixture.componentInstance);
    document.body.appendChild(fixture.nativeElement);
    mounted.push(fixture.nativeElement);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, host: fixture.componentInstance, line: el.querySelector<HTMLElement>('.cabeca-secao')! };
  }

  afterEach(() => mounted.splice(0).forEach((e) => e.remove()));

  it('o nome, o número e o detalhe numa linha só, de 30px', async () => {
    const { el, line } = await head();
    expect(el.querySelector('h3')!.id).toBe('cabeca-teste');
    expect(el.querySelector('.nome')!.textContent).toBe('Outubro de 2026');
    expect(el.querySelector('.n')!.textContent!.trim()).toBe('3');
    expect(el.querySelector('.detalhe')!.textContent).toBe('média 9,1');
    expect(line.getBoundingClientRect().height).toBe(30);
    // o leitor de tela ouve o resumo inteiro, não "3" e "média 9,1" soltos
    expect(el.querySelector('.n')!.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.sr-only')!.textContent).toContain('3 jogos · média 9,1');
  });

  it('o nome comprido numa seção estreita não quebra a linha nem alarga a seção: ganha reticências', async () => {
    const { el, line } = await head((h) => {
      h.width.set(150);
      h.label.set('Com tarefas por fazer na semana que vem');
    });
    const nome = el.querySelector<HTMLElement>('.nome')!;
    expect(line.getBoundingClientRect().height).toBe(30);
    expect(el.querySelector('app-section-head')!.getBoundingClientRect().width).toBe(150);
    expect(nome.scrollWidth).toBeGreaterThan(nome.clientWidth);
    expect(getComputedStyle(nome).textOverflow).toBe('ellipsis');
    // estreita, o detalhe sai inteiro (em vez de virar "M…")
    expect(getComputedStyle(el.querySelector('.detalhe')!).display).toBe('none');
    // o nome inteiro na dica
    expect(line.title).toContain('Com tarefas por fazer na semana que vem');
  });

  it('dobrável, é um botão que diz se está aberta; o clique leva o Alt', async () => {
    const { fixture, el, host, line } = await head();
    expect(line.tagName).toBe('BUTTON');
    expect(line.getAttribute('aria-expanded')).toBe('true');
    expect(line.getAttribute('aria-controls')).toBe('fichas-teste');
    line.dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true }));
    line.click();
    expect(host.toggled).toEqual([true, false]);

    host.open.set(false);
    await fixture.whenStable();
    expect(line.getAttribute('aria-expanded')).toBe('false');
    // fechada, nada para controlar (as fichas saíram da página), e o fio tracejado
    expect(line.getAttribute('aria-controls')).toBeNull();
    expect(el.querySelector('app-section-head')!.classList).toContain('fechada');
    expect(getComputedStyle(el.querySelector('.fio')!).borderTopStyle).toBe('dashed');
  });

  it('sem dobrar é só texto, sem seta; com link, o nome leva ao lugar', async () => {
    const plain = await head((h) => h.foldable.set(false));
    expect(plain.line.tagName).toBe('SPAN');
    expect(plain.el.querySelector('.seta')).toBeNull();
    expect(plain.el.querySelector('app-section-head')!.classList).not.toContain('fechada');
    TestBed.resetTestingModule();

    const linked = await head((h) => {
      h.foldable.set(false);
      h.link.set('/anotacoes/estudos/japones');
    });
    expect(linked.line.tagName).toBe('A');
    expect(linked.line.getAttribute('href')).toBe('/anotacoes/estudos/japones');
  });
});
