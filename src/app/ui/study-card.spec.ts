import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CARD_LOOKS, CardFace, CardLook } from '../core/study';
import { Stock } from '../core/review';
import { FitTitle } from './fit-title';
import { CardDeck, StudyCard } from './study-card';

/** A frente da carta nos dez desenhos: o que cada um mostra do baralho e do progresso, com e sem ele. */

@Component({
  selector: 'app-host',
  imports: [StudyCard],
  template: `<app-study-card style="width: 200px" [title]="title()" [subtitle]="subtitle()" [stock]="stock()" [deck]="deck()" [look]="look()" [face]="face()" [costas]="costas()" />`,
})
class Host {
  readonly title = signal('日');
  readonly subtitle = signal<string | undefined>('O que é, e em quais cenários se usa a leitura especial de palavras compostas');
  readonly stock = signal<Stock>('laranja');
  readonly deck = signal<CardDeck | null>({ name: 'Kanjis', color: 'vermelho', icon: 'livro' });
  readonly look = signal<CardLook | undefined>(undefined);
  readonly face = signal<CardFace | null>(null);
  readonly costas = signal(false);
}

const LEARNING: CardFace = { level: 'aprendendo', when: 'em 3 dias', stamp: '06 NOV', seen: 5, marks: '1101', number: 7 };
const DUE: CardFace = { level: 'aprendendo', when: 'hoje', stamp: '03 NOV', seen: 2, marks: '10' };
const NEVER: CardFace = { level: 'desconhecida', when: 'agora', stamp: '03 NOV', seen: 0, marks: '' };

describe('a frente da carta (ui/study-card.ts)', () => {
  let host: Host;
  let el: HTMLElement;
  let fixture: ComponentFixture<Host>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    el = fixture.nativeElement;
    document.body.appendChild(el);
    TestBed.tick();
  });
  afterEach(() => el.remove());

  const $ = (sel: string) => el.querySelector<HTMLElement>(sel);
  const text = (sel: string) => $(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  function show(look: CardLook | undefined, face: CardFace | null): void {
    host.look.set(look);
    host.face.set(face);
    TestBed.tick();
  }

  it('sem escolha, a do baralho; sem ela, a Clássica, com o nome do baralho e sem nada nos cantos', () => {
    expect($('.carta')!.classList).toContain('look-classica');
    expect(text('.carta > .nome')).toBe('Kanjis');
    expect($('.canto')).toBeNull();
    host.deck.set({ name: 'Kanjis', color: 'vermelho', icon: 'livro', look: 'polaroid' });
    TestBed.tick();
    expect($('.carta')!.classList).toContain('look-polaroid');
  });

  it('os dez desenhos mostram o título e o subtítulo inteiro (até quatro linhas), com e sem o progresso', () => {
    for (const look of CARD_LOOKS) {
      for (const face of [null, NEVER, LEARNING, DUE]) {
        show(look, face);
        expect($('.carta')!.classList).withContext(look).toContain('look-' + look);
        expect(text('.titulo')).withContext(look).toBe('日');
        expect(text('.subtitulo')).withContext(look).toContain('palavras compostas');
        expect(getComputedStyle($('.subtitulo')!).webkitLineClamp).withContext(look).toBe('4');
        // sem o progresso, nenhum desenho mostra o pé
        if (!face && look !== 'ingresso' && look !== 'biblioteca') expect($('.pe')).withContext(look).toBeNull();
      }
    }
  });

  it('Clássica: o selo do nível e quando volta; a nunca estudada, só o selo tracejado', () => {
    show('classica', LEARNING);
    expect(text('.pe .selo-nivel')).toBe('Aprendendo');
    expect(text('.pe .volta')).toBe('volta em 3 dias');
    show('classica', NEVER);
    expect(text('.pe')).toBe('Desconhecido');
    expect($('.carta')!.getAttribute('data-nivel')).toBe('desconhecida');
  });

  it('Faixa de cor e Ingresso: o número da carta no baralho; o canhoto diz o nível e o dia, e hoje em vermelho', () => {
    show('faixa', LEARNING);
    expect(text('.faixa .num')).toBe('Nº 07');
    expect(text('.pe .nivel-tinta')).toBe('Aprendendo');
    show('ingresso', LEARNING);
    expect(text('.num')).toBe('Nº 07');
    const fields = () => [...el.querySelectorAll('.canhoto .campo')].map((c) => [...c.children].map((x) => x.textContent!.trim()).join(' '));
    expect(fields()).toEqual(['Nível Aprendendo', 'Volta 06 NOV em 3 dias']);
    show('ingresso', DUE);
    expect($('.num')).toBeNull();
    expect(text('.canhoto b.hoje')).toBe('Hoje');
    show('ingresso', null);
    expect(fields()).toEqual(['Baralho Kanjis']);
  });

  it('Selo: o carimbo só com o dia e o mês, depois de estudar, vermelho quando é hoje', () => {
    show('selo', NEVER);
    expect($('.carimbo')).toBeNull();
    show('selo', LEARNING);
    expect($('.carimbo')!.getAttribute('aria-label')).toBe('volta em 3 dias');
    // sem o texto em volta do círculo (pedido do dono: era grande e difícil de ler)
    expect($('.carimbo textPath')).toBeNull();
    expect([...el.querySelectorAll('.carimbo text')].map((t) => t.textContent)).toEqual(['06', 'NOV']);
    expect($('.carimbo')!.classList).not.toContain('hoje');
    show('selo', DUE);
    expect($('.carimbo')!.classList).toContain('hoje');
  });

  it('Ficha da biblioteca: uma linha só, a próxima revisão carimbada em vermelho e o total de vezes vista', () => {
    const cells = () => [...el.querySelectorAll('.datas .tr > span')].map((c) => c.textContent!.trim());
    show('biblioteca', LEARNING);
    expect([...el.querySelectorAll('.datas .th span')].map((s) => s.textContent!.trim())).toEqual(['Próxima revisão', 'Total']);
    expect(el.querySelectorAll('.datas .tr').length).toBe(1);
    expect(cells()).toEqual(['06 NOV', '5']);
    expect($('.datas .volta')!.textContent!.trim()).toBe('06 NOV');
    expect($('.datas .total')!.getAttribute('aria-label')).toBe('revisado 5 vezes');
    // pedido do usuário: "a tabela ocupa um espaço imenso"; o cabeçalho e uma linha, menos de um quinto da largura
    expect($('.datas')!.getBoundingClientRect().height).toBeLessThan($('.carta')!.getBoundingClientRect().width * 0.2);
    show('biblioteca', DUE);
    expect(cells()).toEqual(['HOJE', '2']);
    show('biblioteca', { ...DUE, seen: 1, when: 'agora' });
    expect(cells()).toEqual(['AGORA', '1']);
    expect($('.datas .total')!.getAttribute('aria-label')).toBe('revisado 1 vez');
    show('biblioteca', NEVER);
    expect(cells()).toEqual(['ainda não estudado', '—']);
    expect($('.datas .data')).toBeNull();
    show('biblioteca', null);
    expect(el.querySelectorAll('.datas .tr').length).toBe(1);
    expect(cells()).toEqual(['', '']);
  });

  it('Ficha da biblioteca: o kanji sozinho do tamanho de antes da tabela de uma linha; a frase comprida inteira', () => {
    const fit = () => fixture.debugElement.query(By.directive(FitTitle)).injector.get(FitTitle);
    host.subtitle.set(undefined);
    show('biblioteca', LEARNING);
    fit().fit();
    const area = $('.titulo-area')!;
    const px = parseFloat($('.titulo')!.style.fontSize);
    // com movimento reduzido, o site dá 1 ms de transição a tudo, e a letra medida seria a de antes
    expect($('.titulo')!.style.transitionProperty).toBe('none');
    // pedido do usuário: "O kanji está muito grande agora. Diminua para que fique do tamanho que ficava antes";
    // antes (com a tabela de quatro linhas), 54 a 55cqi no computador e no celular; com o teto de 0,92 seria ~75cqi
    expect(fit().appFitTitleMax()).toBe(0.595);
    expect(px).toBeLessThanOrEqual(Math.floor(area.clientHeight * 0.595) + 0.01);
    const cqi = (px / $('.carta')!.offsetWidth) * 100;
    expect(cqi).toBeGreaterThan(50);
    expect(cqi).toBeLessThan(57);
    // o título comprido continua inteiro, sem reticências, no espaço novo do meio
    host.title.set('Explique a diferença entre mitose e meiose em todas as fases, com exemplos de cada uma delas, e diga em quais células do corpo humano cada uma acontece e por quê');
    TestBed.tick();
    fit().fit();
    expect($('.titulo')!.scrollHeight).toBeLessThanOrEqual(area.clientHeight + 0.5);
    expect($('.titulo')!.style.getPropertyValue('-webkit-line-clamp')).toBe('');
    // os outros nove estilos ficam com o teto de sempre
    for (const look of CARD_LOOKS.filter((l) => l !== 'biblioteca')) {
      show(look, LEARNING);
      expect(fit().appFitTitleMax()).withContext(look).toBe(0.92);
    }
  });

  it('as costas (as cartas de baixo da pilha): o papel e a beirada de cada desenho, na cartolina, sem nada escrito', () => {
    host.costas.set(true);
    const paper: Record<CardLook, string> = {
      classica: '.face + .moldura',
      faixa: '.face > .faixa',
      cartolina: '.face',
      orelha: '.face + .dobra',
      antigo: '.face + .moldura',
      argola: '.papel > .pauta',
      selo: '.selo > .campo',
      polaroid: '.pola > .foto-pola',
      ingresso: '.bilhete > .principal',
      biblioteca: '.ficha > .faixa',
    };
    for (const look of CARD_LOOKS) {
      show(look, LEARNING);
      const card = $('.carta')!;
      expect(card.classList).withContext(look).toContain('look-' + look);
      expect(card.classList).withContext(look).toContain('costas');
      expect($(paper[look])).withContext(look).not.toBeNull();
      expect(card.textContent!.trim()).withContext(look).toBe('');
      for (const sel of ['.titulo', '.subtitulo', '.pe', '.canto', '.nome', 'img', 'lucide-icon', '.anel', '.carimbo', '.fita-washi', '.dymo']) {
        expect($(sel)).withContext(look + ' ' + sel).toBeNull();
      }
      expect(card.getAttribute('data-nivel')).withContext(look).toBeNull();
      expect(card.style.getPropertyValue('--c')).withContext(look).toBe('var(--stock-laranja)');
    }
  });

  it('nenhum desenho repete o primeiro caractere do título nos cantos (pedido do dono: só o Baralho antigo tem cantos, com o ícone)', () => {
    for (const look of CARD_LOOKS) {
      for (const face of [null, LEARNING]) {
        show(look, face);
        if (look === 'antigo') continue;
        expect($('.canto')).withContext(look).toBeNull();
      }
    }
  });

  it('Baralho antigo: o ícone do baralho nos dois cantos, o de baixo de cabeça para baixo, dentro do quarto de círculo; sem ícone, cantos vazios', () => {
    show('antigo', LEARNING);
    const corners = [...el.querySelectorAll<HTMLElement>('.canto')];
    expect(corners.length).toBe(2);
    expect(corners.every((c) => c.querySelector('lucide-icon svg'))).toBeTrue();
    expect(corners.every((c) => !c.textContent!.trim())).toBeTrue();
    expect(getComputedStyle(corners[1]).rotate).toBe('180deg');
    // o ícone cabe no quarto de círculo: a ponta mais longe dele fica dentro do raio (15,5% da largura da moldura)
    const frame = $('.moldura')!.getBoundingClientRect();
    const icon = corners[0].getBoundingClientRect();
    const reach = Math.hypot(icon.right - frame.left, icon.bottom - frame.top);
    expect(reach).toBeLessThanOrEqual(frame.width * 0.155 * (100 / 90) + 0.5);
    host.deck.set({ name: 'Kanjis', color: 'vermelho', icon: null });
    TestBed.tick();
    expect($('.canto')).toBeNull();
  });

  it('Ficha de argola: o reflexo do metal fica parado (não é a .brilho das pontas que piscam e giram)', () => {
    show('argola', LEARNING);
    const shine = $('.anel.frente path:last-child')!;
    expect(shine.classList).toContain('reflexo');
    expect($('.anel .brilho')).toBeNull();
    expect(getComputedStyle(shine).animationName).toBe('none');
    expect(getComputedStyle(shine).position).toBe('static');
  });

  it('Polaroid e Ficha de argola: o baralho na fita e na argola; a lápis, o nível e quando volta', () => {
    show('polaroid', LEARNING);
    expect(text('.fita-washi')).toBe('Kanjis');
    expect(text('.pe')).toBe('aprendendo · volta em 3 dias');
    show('argola', LEARNING);
    expect(text('.cab .nome')).toBe('Kanjis');
    expect(text('.cab .pe')).toBe('aprendendo · volta em 3 dias');
    expect($('.bolinha')).not.toBeNull();
    show('argola', NEVER);
    expect(text('.cab .pe')).toBe('ainda não estudado');
    show('argola', null);
    expect($('.bolinha')).toBeNull();
  });

  it('a cartolina escura: a tinta clara onde o desenho imprime na cor dela', () => {
    host.stock.set('verde-escuro');
    show('cartolina', LEARNING);
    expect($('.carta')!.classList).toContain('escura');
    const ink = getComputedStyle($('.titulo')!).color;
    show('classica', LEARNING);
    expect(getComputedStyle($('.titulo')!).color).not.toBe(ink);
  });
});
