import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NOTES_CONFIG_DEFAULT } from '../core/mural-config';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { CardPicker } from './card-picker';
import { ProfilePicker } from './profile-picker';

let clock = Date.parse('2026-10-20T12:00:00.000Z');

function card(id: string, name: string, kind: string, extra: Record<string, unknown> = {}): Review {
  const at = new Date((clock -= 60_000)).toISOString();
  return sanitizeReview({
    id,
    kind,
    game: { name, coverUrl: null, source: 'manual' },
    scores: { diversao: 9, historia: 8, jogabilidade: 9, visual: 8, envolvimento: 8, personagens: 8, escrita: 8 },
    status: 'finalizado',
    text: '',
    createdAt: at,
    updatedAt: at,
    ...extra,
  })!;
}

/** As anotações e duas fichas: das mexidas por último (a primeira) para as mais antigas. */
function seed(): Review[] {
  return [
    card('nota01', 'Revisar o deploy', 'anotacoes', { category: 'Trabalho', subject: 'Backend', tags: ['Urgente', 'Bugfix'] }),
    card('nota02', 'Tela de login', 'anotacoes', { category: 'Trabalho', subject: 'Frontend', tags: ['Feature'] }),
    card('nota03', 'Migrar o banco', 'anotacoes', { category: 'trabalho', subject: 'backend', tags: ['feature'] }),
    card('nota04', 'Menu no celular', 'anotacoes', { category: 'Trabalho', tags: ['Bugfix'], doneAt: '2026-10-18T10:00:00.000Z' }),
    card('nota05', 'Revolução Francesa', 'anotacoes', { category: 'Estudos', subject: 'História', tags: ['Prova'] }),
    card('nota06', 'Rios do Brasil', 'anotacoes', { category: 'Estudos', subject: 'Geografia' }),
    card('nota07', 'Ideias soltas', 'anotacoes', { tags: ['Urgente'] }),
    card('jogo01', 'Hollow Knight', 'jogos'),
    card('livr01', 'O Hobbit', 'livros'),
  ];
}

const text = (e: Element) => e.textContent!.replace(/\s+/g, ' ').trim();

describe('os filtros do seletor de fichas', () => {
  let fixture: ComponentFixture<CardPicker>;
  let el: HTMLElement;

  async function open(inputs: Record<string, unknown> = {}): Promise<void> {
    fixture = TestBed.createComponent(CardPicker);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    fixture.componentInstance.open.set(true);
    await fixture.whenStable();
  }

  const stable = () => fixture.whenStable();
  /** Fechar: o "close" do diálogo chega numa tarefa depois (e fecharia a folha aberta de novo logo em seguida). */
  const closed = async () => {
    await stable();
    await new Promise((r) => setTimeout(r));
    await stable();
  };
  const names = () => Array.from(el.querySelectorAll('.escolha .nome')).map(text);
  const row = (label: string) => el.querySelector<HTMLElement>(`.fileira[aria-label="${label}"]`);
  const chips = (label: string) => Array.from(row(label)?.querySelectorAll<HTMLButtonElement>('.filtro') ?? []);
  const chip = (label: string, name: string) => chips(label).find((b) => text(b).startsWith(name.toUpperCase()) || text(b).startsWith(name))!;
  const kindChip = (name: string) => Array.from(el.querySelectorAll<HTMLButtonElement>('.murais .filtro')).find((b) => text(b).startsWith(name))!;
  const tags = () => Array.from(el.querySelectorAll<HTMLButtonElement>('app-tag-chips .atalho'));
  const tag = (name: string) => tags().find((b) => text(b).startsWith(name))!;
  const done = () => el.querySelector<HTMLButtonElement>('.finalizadas');

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [CardPicker], providers: [provideZonelessChangeDetection()] });
    TestBed.inject(ReviewStore).reviews.set(seed());
  });

  afterEach(() => {
    el?.remove();
    fixture?.destroy();
    localStorage.clear();
  });

  it('o grupo, o assunto e as tags só aparecem com a lista nas anotações (os outros murais não têm)', async () => {
    await open();
    expect(row('Grupo')).toBeNull();
    expect(el.querySelector('app-tag-chips')).toBeNull();
    kindChip('Jogos').click();
    await stable();
    expect(row('Grupo')).toBeNull();
    kindChip('Anotações').click();
    await stable();
    // os grupos na ordem do mural (dos maiores para os menores), cada um com quantas
    expect(chips('Grupo').map(text)).toEqual(['Trabalho, 4', 'Estudos, 2', 'Sem grupo, 1']);
    expect(tags().length).toBeGreaterThan(0);
    // o assunto só com um grupo escolhido: é de cada grupo
    expect(row('Assunto')).toBeNull();
  });

  it('o grupo é um só: um toque liga, outro desliga; o assunto do grupo aparece e filtra, e trocar de grupo o esquece', async () => {
    await open({ onlyKind: 'anotacoes' });
    // o "Buscar nota" de um mural só: sem as abas de mural, direto nos grupos
    expect(el.querySelector('.murais')).toBeNull();
    chip('Grupo', 'Trabalho').click();
    await stable();
    expect(names()).toEqual(['Revisar o deploy', 'Tela de login', 'Migrar o banco', 'Menu no celular']);
    expect(chip('Grupo', 'Trabalho').getAttribute('aria-pressed')).toBe('true');
    // os assuntos de A a Z, a grafia mais usada, e "Sem assunto" no fim
    expect(chips('Assunto').map(text)).toEqual(['Backend, 2', 'Frontend, 1', 'Sem assunto, 1']);
    chip('Assunto', 'Backend').click();
    await stable();
    expect(names()).toEqual(['Revisar o deploy', 'Migrar o banco']);
    // vários assuntos: vale qualquer um
    chip('Assunto', 'Sem assunto').click();
    await stable();
    expect(names()).toEqual(['Revisar o deploy', 'Migrar o banco', 'Menu no celular']);
    chip('Grupo', 'Estudos').click();
    await stable();
    expect(names()).toEqual(['Revolução Francesa', 'Rios do Brasil']);
    expect(chips('Assunto').every((b) => b.getAttribute('aria-pressed') === 'false')).toBeTrue();
    chip('Grupo', 'Estudos').click();
    await stable();
    expect(names().length).toBe(7);
    expect(row('Assunto')).toBeNull();
  });

  it('as tags: um toque liga (vale qualquer uma), o clique direito esconde a tag; as contagens seguem o grupo', async () => {
    await open({ onlyKind: 'anotacoes' });
    // as mais usadas primeiro, sem ligar para caixa
    expect(tags().map((b) => text(b).replace(/\s*\d+$/, ''))).toEqual(['Bugfix', 'Feature', 'Urgente', 'Prova']);
    tag('Urgente').click();
    await stable();
    expect(names()).toEqual(['Revisar o deploy', 'Ideias soltas']);
    tag('Prova').click();
    await stable();
    expect(names()).toEqual(['Revisar o deploy', 'Revolução Francesa', 'Ideias soltas']);
    // com a tag ligada, o grupo conta só as que ela deixa
    expect(chips('Grupo').map(text)).toEqual(['Trabalho, 1', 'Estudos, 1', 'Sem grupo, 1']);
    tag('Urgente').click();
    tag('Prova').click();
    await stable();
    tag('Bugfix').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await stable();
    expect(names()).not.toContain('Revisar o deploy');
    expect(names()).not.toContain('Menu no celular');
    expect(tag('Bugfix').classList).toContain('fora');
    tag('Bugfix').click();
    await stable();
    expect(names().length).toBe(7);
    // com um grupo, só as tags dele
    chip('Grupo', 'Estudos').click();
    await stable();
    expect(tags().map((b) => text(b).replace(/\s*\d+$/, ''))).toEqual(['Prova']);
  });

  it('"Mostrando N de M" e Limpar; sem nenhuma, a lista vazia oferece limpar os filtros', async () => {
    await open({ onlyKind: 'anotacoes' });
    expect(el.querySelector('.achados')).toBeNull();
    chip('Grupo', 'Estudos').click();
    await stable();
    expect(text(el.querySelector('.achados')!)).toMatch(/^Mostrando 2 de 7 ?Limpar$/);
    const search = el.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = 'deploy';
    search.dispatchEvent(new Event('input'));
    await stable();
    expect(names()).toEqual([]);
    expect(text(el.querySelector('.nada')!)).toContain('Nenhuma anotação com esses filtros e “deploy”.');
    el.querySelector<HTMLButtonElement>('.nada-link')!.click();
    await stable();
    expect(names()).toEqual(['Revisar o deploy']);
    expect(el.querySelector('.achados')).toBeNull();
    expect(search.value).toBe('deploy');
  });

  it('"Esconder finalizadas" ao lado da busca: desligado onde não é o costume, ligado no Kanban', async () => {
    await open({ onlyKind: 'anotacoes' });
    expect(text(done()!)).toBe('Esconder finalizadas 1');
    expect(done()!.getAttribute('aria-pressed')).toBe('false');
    expect(done()!.closest('.linha-busca')!.querySelector('.busca')).not.toBeNull();
    expect(names()).toContain('Menu no celular');
    done()!.click();
    await stable();
    expect(names()).not.toContain('Menu no celular');
    // a contagem do grupo também perde a finalizada
    expect(text(chip('Grupo', 'Trabalho'))).toBe('Trabalho, 3');
    fixture.componentInstance.open.set(false);
    await closed();
    fixture.componentRef.setInput('doneOption', true);
    fixture.componentInstance.open.set(true);
    await stable();
    expect(done()!.getAttribute('aria-pressed')).toBe('true');
    expect(names()).not.toContain('Menu no celular');
  });

  it('sem nenhuma finalizada, não há o que esconder; só finalizadas, a lista vazia oferece mostrar', async () => {
    TestBed.inject(ReviewStore).reviews.set([card('feita1', 'Feita', 'anotacoes', { doneAt: '2026-10-18T10:00:00.000Z' }), card('jogo01', 'Hollow Knight', 'jogos')]);
    await open({ onlyKind: 'anotacoes', doneOption: true });
    expect(names()).toEqual([]);
    expect(text(el.querySelector('.nada')!)).toContain('Aqui só há anotações finalizadas.');
    el.querySelector<HTMLButtonElement>('.nada-link')!.click();
    await stable();
    expect(names()).toEqual(['Feita']);
    TestBed.inject(ReviewStore).reviews.set([card('jogo01', 'Hollow Knight', 'jogos')]);
    fixture.componentInstance.open.set(false);
    await closed();
    fixture.componentRef.setInput('onlyKind', null);
    fixture.componentRef.setInput('doneOption', false);
    fixture.componentInstance.open.set(true);
    await stable();
    expect(done()).toBeNull();
  });

  it('o "Buscar nota" do quadro de um grupo: sem as abas dos grupos, com os assuntos dele direto', async () => {
    await open({ onlyKind: 'anotacoes', onlyCategory: 'trabalho', doneOption: true });
    expect(row('Grupo')).toBeNull();
    expect(chips('Assunto').map(text)).toEqual(['Backend, 2', 'Frontend, 1']);
    chip('Assunto', 'Frontend').click();
    await stable();
    expect(names()).toEqual(['Tela de login']);
  });

  it('os grupos na ordem montada à mão no mural, com o desenho e a cor de cada um', async () => {
    const settings = TestBed.inject(Settings);
    settings.notesConfig.set({ ...NOTES_CONFIG_DEFAULT, orderBy: 'minha', order: ['estudos', 'trabalho'] });
    settings.setCategoryLook('Trabalho', { color: 'azul' });
    await open({ onlyKind: 'anotacoes' });
    expect(chips('Grupo').map(text)).toEqual(['Estudos, 2', 'Trabalho, 4', 'Sem grupo, 1']);
    const trabalho = chip('Grupo', 'Trabalho');
    expect(trabalho.style.getPropertyValue('--cat-cor')).toBe('#2d8bd6');
    expect(trabalho.querySelector('.icone.colorido')).not.toBeNull();
    expect(chip('Grupo', 'Sem grupo').querySelector('.icone')).toBeNull();
  });

  it('ao abrir de novo, os filtros voltam desligados', async () => {
    await open({ onlyKind: 'anotacoes' });
    chip('Grupo', 'Estudos').click();
    tag('Urgente').click();
    await stable();
    fixture.componentInstance.open.set(false);
    await closed();
    fixture.componentInstance.open.set(true);
    await stable();
    expect(chips('Grupo').some((b) => b.getAttribute('aria-pressed') === 'true')).toBeFalse();
    expect(names().length).toBe(7);
  });
});

describe('os filtros no "Escolher fichas" do perfil', () => {
  it('as mesmas fileiras: mural, grupo, assunto e tags, e a marcada continua marcada', async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ProfilePicker], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(ProfilePicker);
    fixture.componentRef.setInput('cards', seed());
    fixture.componentRef.setInput('chosen', ['nota05']);
    const el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    fixture.componentInstance.open.set(true);
    await fixture.whenStable();
    const names = () => Array.from(el.querySelectorAll('.item .nome')).map(text);
    Array.from(el.querySelectorAll<HTMLButtonElement>('.murais .filtro')).find((b) => text(b).startsWith('Anotações'))!.click();
    await fixture.whenStable();
    Array.from(el.querySelectorAll<HTMLButtonElement>('.fileira[aria-label="Grupo"] .filtro')).find((b) => text(b).startsWith('Estudos'))!.click();
    await fixture.whenStable();
    expect(names()).toEqual(['Revolução Francesa', 'Rios do Brasil']);
    expect(el.querySelector('.item.on .nome')!.textContent).toContain('Revolução Francesa');
    Array.from(el.querySelectorAll<HTMLButtonElement>('.fileira[aria-label="Assunto"] .filtro')).find((b) => text(b).startsWith('Geografia'))!.click();
    await fixture.whenStable();
    expect(names()).toEqual(['Rios do Brasil']);
    el.remove();
    fixture.destroy();
    localStorage.clear();
  });
});
