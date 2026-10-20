import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RichText } from './rich-text';
import { NoteLinks } from '../core/note-links';
import { Review, sanitizeReview } from '../core/review';

describe('o texto formatado na leitura', () => {
  /** As tarefas marcadas na última renderização (com `checkable`, elas se marcam). */
  let toggled: number[] = [];
  async function render(text: string, links: NoteLinks | null = null, checkable = false): Promise<HTMLElement> {
    TestBed.configureTestingModule({ imports: [RichText], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(RichText);
    fixture.componentRef.setInput('text', text);
    fixture.componentRef.setInput('links', links);
    fixture.componentRef.setInput('checkable', checkable);
    toggled = [];
    fixture.componentInstance.toggled.subscribe((line) => toggled.push(line));
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    return fixture.nativeElement;
  }
  const marker = (li: Element) => getComputedStyle(li, '::before').content;

  afterEach(() => document.querySelectorAll('app-rich-text').forEach((e) => e.remove()));

  it('o spoiler é uma tarja: o texto fica de fora do leitor de tela e do Tab até tocar, e o toque não chega à ficha', async () => {
    const el = await render('O fim: ||ele **volta**|| e pronto.');
    const parts = Array.from(el.querySelectorAll<HTMLElement>('.spoiler'));
    // o negrito no meio é outro pedaço do mesmo spoiler
    expect(parts.length).toBe(2);
    expect(parts[0].getAttribute('role')).toBe('button');
    expect(parts[0].getAttribute('tabindex')).toBe('0');
    expect(parts[0].getAttribute('aria-label')).toBe('Spoiler escondido: revelar');
    expect(parts.every((p) => p.querySelector('.spoiler-texto')!.hasAttribute('inert'))).toBeTrue();
    expect(getComputedStyle(parts[0]).color).toBe('rgba(0, 0, 0, 0)');
    let reached = 0;
    el.addEventListener('click', () => reached++);
    parts[1].click();
    // os dois pedaços revelam juntos, e o clique parou no spoiler
    expect(parts.every((p) => p.classList.contains('revelado'))).toBeTrue();
    expect(parts.every((p) => !p.querySelector('.spoiler-texto')!.hasAttribute('inert') && !p.hasAttribute('role') && p.getAttribute('tabindex') === '-1')).toBeTrue();
    expect(reached).toBe(0);
    // (a tinta volta numa transição curta)
    await new Promise((r) => setTimeout(r, 400));
    expect(getComputedStyle(parts[0]).color).not.toBe('rgba(0, 0, 0, 0)');
    // revelado, o toque segue o caminho de sempre
    parts[0].click();
    expect(reached).toBe(1);
  });

  it('o spoiler revela também com Enter; outro spoiler na linha continua escondido', async () => {
    const el = await render('||um|| e ||dois||');
    const [a, b] = Array.from(el.querySelectorAll<HTMLElement>('.spoiler'));
    a.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(a.classList).toContain('revelado');
    expect(b.classList).not.toContain('revelado');
  });

  it('a lista numerada mostra o número, e a comum, o ponto (não o ponto nas duas)', async () => {
    const el = await render('- leite\n- ovos\n\n3. três\n4. quatro');
    const [bullet] = Array.from(el.querySelectorAll('ul.lista li'));
    const numbered = Array.from(el.querySelectorAll('ol li'));
    expect(marker(bullet)).toBe('"•"');
    expect(marker(numbered[0])).not.toBe('"•"');
    expect(el.querySelector('ol')!.getAttribute('start')).toBe('3');
  });

  it('a lista de dentro com o número do pai escreve "1.1.", "1.2.", com mais lugar para o número', async () => {
    const el = await render('1. teste 1\n  1.1. teste 11\n  1.2. teste 12\n2. teste 2');
    const inner = Array.from(el.querySelectorAll<HTMLElement>('ol ol > li'));
    expect(inner.map((li) => li.getAttribute('data-pre'))).toEqual(['1.', '1.']);
    expect(marker(inner[0])).toContain('1.');
    const outer = el.querySelector<HTMLElement>('ol > li')!;
    expect(outer.hasAttribute('data-pre')).toBeFalse();
    expect(parseFloat(getComputedStyle(inner[0]).paddingLeft)).toBeGreaterThan(parseFloat(getComputedStyle(outer).paddingLeft));
  });

  it('o texto sutil ("-# ") é menor e mais claro, na mesma altura de linha', async () => {
    const el = await render('normal\n-# um **detalhe**');
    const [plain, subtle] = Array.from(el.querySelectorAll<HTMLElement>('.linha'));
    expect(subtle.classList).toContain('sutil');
    expect(subtle.textContent).toBe('um detalhe');
    const small = subtle.querySelector<HTMLElement>('.sutil-texto')!;
    expect(parseFloat(getComputedStyle(small).fontSize)).toBeLessThan(parseFloat(getComputedStyle(plain).fontSize));
    expect(getComputedStyle(subtle).color).not.toBe(getComputedStyle(plain).color);
    expect(subtle.getBoundingClientRect().height).toBe(plain.getBoundingClientRect().height);
  });

  it('o que vem embaixo da tarefa fica no alinhamento do texto dela, com uma linha de respiro; feita, é riscado junto', async () => {
    const el = await render('- [x] **Mandolin**\n      Descrição: adaptável\n      {{imagem: https://ex.com/m.jpg}}\n- [ ] Panelas\n      fundo triplo\n- [ ] Cola', null, true);
    const items = Array.from(el.querySelectorAll<HTMLElement>('.tarefas > li'));
    expect(items.length).toBe(3);
    const [done, open, last] = items;
    const body = done.querySelector<HTMLElement>(':scope > .corpo')!;
    // fora do rótulo: tocar na descrição não marca a tarefa
    expect(body.closest('label')).toBeNull();
    expect(body.querySelector('.linha')!.textContent).toBe('Descrição: adaptável');
    expect(body.querySelector('app-note-widget')).not.toBeNull();
    // no alinhamento do texto da tarefa, sem o recuo de parágrafo
    const left = (n: Element) => n.getBoundingClientRect().left;
    expect(Math.abs(left(body.querySelector('.linha')!) - left(done.querySelector('.tarefa')!))).toBeLessThan(1.5);
    expect(parseFloat(getComputedStyle(body.querySelector('.linha')!).textIndent)).toBe(0);
    // uma linha da pauta inteira entre a tarefa com corpo e a de baixo; a última, sem
    const line = parseFloat(getComputedStyle(done).minHeight);
    expect(parseFloat(getComputedStyle(done).marginBottom)).toBeCloseTo(line, 1);
    expect(parseFloat(getComputedStyle(open).marginBottom)).toBeCloseTo(line, 1);
    expect(parseFloat(getComputedStyle(last).marginBottom)).toBe(0);
    // feita: o texto de baixo riscado e a foto com o risco ligado; a por fazer, não
    expect(getComputedStyle(body.querySelector('.linha')!).textDecorationLine).toBe('line-through');
    expect(getComputedStyle(body.querySelector('app-note-widget')!).getPropertyValue('--riscado').trim()).toBe('1');
    const openBody = open.querySelector(':scope > .corpo .linha')!;
    expect(getComputedStyle(openBody).textDecorationLine).toBe('none');
    body.querySelector<HTMLElement>('.linha')!.click();
    expect(toggled).toEqual([]);
    done.querySelector<HTMLInputElement>('input')!.click();
    expect(toggled).toEqual([0]);
  });

  it('a lista recuada vira a lista de dentro, e a tarefa de dentro marca a linha dela', async () => {
    const el = await render('- [ ] mala\n  - [ ] roupa\n  - [ ] escova', null, true);
    const inner = el.querySelectorAll('.tarefas > li > .corpo .tarefas > li');
    expect(Array.from(inner).map((li) => li.textContent!.trim())).toEqual(['roupa', 'escova']);
    inner[1].querySelector<HTMLInputElement>('input')!.click();
    expect(toggled).toEqual([2]);
  });

  it('texto sem marca nenhuma sai como foi escrito, cada linha um parágrafo com o recuo, sem espaço sobrando', async () => {
    const el = await render('Linha um\n\n  Linha dois: 2 * 3 = 6');
    const lines = Array.from(el.querySelectorAll('.linha'));
    expect(lines.map((l) => l.textContent)).toEqual(['Linha um', '', '  Linha dois: 2 * 3 = 6']);
    expect(lines.every((l) => l.classList.contains('paragrafo'))).toBeTrue();
    expect(parseFloat(getComputedStyle(lines[0]).textIndent)).toBeGreaterThan(0);
  });

  it('cada linha de texto corrido começa um parágrafo com recuo; a lista e o título não', async () => {
    const el = await render('# Título\nPrimeira **linha**\nSegunda linha\n- item');
    const indent = (sel: string) => parseFloat(getComputedStyle(el.querySelector(sel)!).textIndent);
    expect(Array.from(el.querySelectorAll('.paragrafo')).map((l) => l.textContent)).toEqual(['Primeira linha', 'Segunda linha']);
    expect(indent('.paragrafo')).toBeGreaterThan(0);
    expect(indent('.titulo')).toBe(0);
    expect(indent('ul.lista li')).toBe(0);
  });

  it('as feitas de quando a ficha apareceu viram a conta; a marcada agora fica até o texto mudar de verdade', async () => {
    TestBed.configureTestingModule({ imports: [RichText], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(RichText);
    const set = async (text: string) => {
      fixture.componentRef.setInput('text', text);
      await fixture.whenStable();
    };
    const el: HTMLElement = fixture.nativeElement;
    const shown = () => Array.from(el.querySelectorAll('.tarefa')).map((t) => t.textContent);
    const counts = () => Array.from(el.querySelectorAll('.resumo-nome')).map((t) => t.textContent);
    fixture.componentRef.setInput('fold', true);
    document.body.appendChild(el);
    await set('Lista 1\n- [x] um\n- [ ] dois\n- [x] três\nLista 2\n- [x] quatro');
    expect(shown()).toEqual(['dois']);
    expect(counts()).toEqual(['2 tarefas feitas (escondidas): mostrar', '1 tarefa feita (escondida): mostrar']);

    // marcou a "dois" e desmarcou a "três": as duas à vista
    await set('Lista 1\n- [x] um\n- [x] dois\n- [ ] três\nLista 2\n- [x] quatro');
    expect(shown()).toEqual(['dois', 'três']);
    expect(counts()).toEqual(['1 tarefa feita (escondida): mostrar', '1 tarefa feita (escondida): mostrar']);

    // o texto mudou de verdade (uma edição): o retrato é refeito
    await set('Lista 1\n- [x] um\n- [x] dois\n- [ ] três!\nLista 2\n- [x] quatro');
    expect(shown()).toEqual(['três!']);

    // sem a dobra, a anotação como ela é
    fixture.componentRef.setInput('fold', false);
    await fixture.whenStable();
    expect(shown()).toEqual(['um', 'dois', 'três!', 'quatro']);
    expect(counts()).toEqual([]);
  });

  describe('os links para outras anotações', () => {
    const console: Review = { ...sanitizeReview({ kind: 'anotacoes', game: { name: 'Comprar um console' }, createdAt: '2026-01-01T00:00:00.000Z' })!, id: 'n1' };
    const resolve = (t: string) => (t.toLowerCase() === 'comprar um console' ? console : null);

    it('abre a anotação; o que não existe, cria; tocar no link não marca a tarefa', async () => {
      const opened: Review[] = [];
      const created: string[] = [];
      const el = await render('- [ ] [[comprar um console]]\n- [[Vender a TV]]', { resolve, open: (n) => opened.push(n), create: (t) => created.push(t) }, true);
      const [ok, broken] = Array.from(el.querySelectorAll<HTMLElement>('.elo'));
      expect(ok.textContent).toBe('comprar um console');
      expect(ok.getAttribute('role')).toBe('link');
      ok.click();
      expect(opened.map((n) => n.id)).toEqual(['n1']);
      // a tarefa tem caixinha de marcar, e o toque no link não chega nela
      expect(el.querySelector('.tarefas input[type="checkbox"]')).not.toBeNull();
      expect(toggled).toEqual([]);
      expect(broken.classList).toContain('quebrado');
      broken.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(created).toEqual(['Vender a TV']);
    });

    it('sem abrir nem criar (a prévia), o link só aparece; nas resenhas, os colchetes ficam', async () => {
      let el = await render('[[Comprar um console]] e [[Nada]]', { resolve });
      expect(el.querySelectorAll('.elo[tabindex]').length).toBe(0);
      expect(el.querySelectorAll('.elo.quebrado').length).toBe(1);
      document.querySelectorAll('app-rich-text').forEach((e) => e.remove());
      TestBed.resetTestingModule();
      el = await render('veja [[Hades]]');
      expect(el.querySelector('.elo')).toBeNull();
      expect(el.textContent).toContain('veja [[Hades]]');
    });
  });
});

const DONE_TEXT = 'Compras\n- [ ] pão\n- [x] leite\n- [x] café\nResto\n- [x] ovos';

describe('a conta das tarefas feitas', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [RichText], providers: [provideZonelessChangeDetection()] }));

  async function make(key: string | null): Promise<ComponentFixture<RichText>> {
    const f = TestBed.createComponent(RichText);
    f.componentRef.setInput('text', DONE_TEXT);
    f.componentRef.setInput('fold', true);
    f.componentRef.setInput('foldKey', key);
    await f.whenStable();
    return f;
  }
  const tasks = (f: ComponentFixture<RichText>) => [...(f.nativeElement as HTMLElement).querySelectorAll('.tarefas .tarefa')].map((t) => t.textContent!.trim());
  const counts = (f: ComponentFixture<RichText>) => [...(f.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.resumo-btn')];

  it('é um botão que mostra as feitas da sua sequência, sem passar o clique adiante', async () => {
    const f = await make('n1');
    expect(tasks(f)).toEqual(['pão']);
    expect(counts(f).map((b) => b.textContent!.trim())).toEqual(['2 tarefas feitas (escondidas): mostrar', '1 tarefa feita (escondida): mostrar']);
    const outside = jasmine.createSpy('fora');
    (f.nativeElement as HTMLElement).addEventListener('click', outside);
    counts(f)[0].click();
    await f.whenStable();
    expect(tasks(f)).toEqual(['pão', 'leite', 'café']);
    expect(counts(f).length).toBe(1);
    expect(outside).not.toHaveBeenCalled();
  });

  it('a mesma anotação em outro lugar (o mural e a leitura) também abre; outra anotação, não', async () => {
    const wall = await make('n1');
    const reader = await make('n1');
    const other = await make('n2');
    counts(wall)[1].click();
    await reader.whenStable();
    await other.whenStable();
    expect(tasks(reader)).toEqual(['pão', 'ovos']);
    expect(tasks(other)).toEqual(['pão']);
  });

  it('sem chave, abre só ali', async () => {
    const a = await make(null);
    const b = await make(null);
    counts(a)[0].click();
    await a.whenStable();
    await b.whenStable();
    expect(tasks(a)).toEqual(['pão', 'leite', 'café']);
    expect(tasks(b)).toEqual(['pão']);
  });
});
