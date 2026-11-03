import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CARD_LOOKS, CardFace, CardLook } from '../core/study';
import { Stock } from '../core/review';
import { CardDeck, StudyCard } from './study-card';

/** A frente da carta nos dez desenhos: o que cada um mostra do baralho e do progresso, com e sem ele. */

@Component({
  selector: 'app-host',
  imports: [StudyCard],
  template: `<app-study-card style="width: 200px" [title]="title()" [subtitle]="subtitle()" [stock]="stock()" [deck]="deck()" [look]="look()" [face]="face()" />`,
})
class Host {
  readonly title = signal('日');
  readonly subtitle = signal<string | undefined>('O que é, e em quais cenários se usa a leitura especial de palavras compostas');
  readonly stock = signal<Stock>('laranja');
  readonly deck = signal<CardDeck | null>({ name: 'Kanjis', color: 'vermelho', icon: 'livro' });
  readonly look = signal<CardLook | undefined>(undefined);
  readonly face = signal<CardFace | null>(null);
}

const LEARNING: CardFace = { level: 'aprendendo', when: 'em 3 dias', stamp: '06 NOV', seen: 5, marks: '1101', number: 7 };
const DUE: CardFace = { level: 'aprendendo', when: 'hoje', stamp: '03 NOV', seen: 2, marks: '10' };
const NEVER: CardFace = { level: 'desconhecida', when: 'agora', stamp: '03 NOV', seen: 0, marks: '' };

describe('a frente da carta (ui/study-card.ts)', () => {
  let host: Host;
  let el: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Host);
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

  it('sem escolha, a do baralho; sem ela, a Clássica, com o nome do baralho e sem o ícone nos cantos', () => {
    expect($('.carta')!.classList).toContain('look-classica');
    expect(text('.carta > .nome')).toBe('Kanjis');
    expect(el.querySelectorAll('.canto').length).toBe(2);
    expect($('.canto lucide-icon')).toBeNull();
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
        expect(getComputedStyle($('.subtitulo')!).webkitLineClamp).withContext(look).toBe(look === 'biblioteca' ? '3' : '4');
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
    expect(text('.pe')).toBe('Desconhecida');
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

  it('Selo: o carimbo com o baralho e a data só depois de estudar, vermelho quando é hoje', () => {
    show('selo', NEVER);
    expect($('.carimbo')).toBeNull();
    show('selo', LEARNING);
    expect($('.carimbo')!.getAttribute('aria-label')).toBe('volta em 3 dias');
    expect(text('.carimbo textPath')).toBe('KANJIS · VOLTA EM 3 DIAS ·');
    expect([...el.querySelectorAll('.carimbo g > text')].slice(1).map((t) => t.textContent)).toEqual(['06', 'NOV']);
    expect($('.carimbo')!.classList).not.toContain('hoje');
    show('selo', DUE);
    expect($('.carimbo')!.classList).toContain('hoje');
  });

  it('Ficha da biblioteca: as três últimas respostas carimbadas com a vez, e a data da volta por último', () => {
    show('biblioteca', LEARNING);
    const rows = [...el.querySelectorAll('.datas .tr')];
    expect(rows.length).toBe(4);
    expect(rows.map((r) => r.querySelector('.data')?.textContent?.trim() ?? '')).toEqual(['3ª', '4ª', '5ª', '06 NOV']);
    expect(rows.slice(0, 3).map((r) => r.querySelector('.marca')!.getAttribute('aria-label'))).toEqual(['acertou', 'errou', 'acertou']);
    expect(rows[3].querySelector('.data')!.classList).toContain('volta');
    show('biblioteca', NEVER);
    expect(text('.datas .nunca')).toBe('ainda não estudada');
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
    expect(text('.cab .pe')).toBe('ainda não estudada');
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
