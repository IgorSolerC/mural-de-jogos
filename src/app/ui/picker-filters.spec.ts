import { provideZonelessChangeDetection } from '@angular/core';
import { convertSubjects } from '../core/folders';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NOTES_CONFIG_DEFAULT } from '../core/mural-config';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { nextClose } from '../testing/dialog-close.spec';
import { CardPicker } from './card-picker';
import { ProfilePicker } from './profile-picker';

/** As mexidas: a primeira há um minuto, cada uma um minuto antes da outra (todas de hoje, menos as datadas). */
let clock = Date.now();

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
  clock = Date.now();
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

/** Uma linha do índice como "Nome:N". */
const rowOf = (b: Element) => `${text(b.querySelector('.idx-nome')!)}:${text(b.querySelector('.idx-n')!).replace(/^,\s*/, '')}`;

describe('o seletor de fichas: o índice dos filtros ao lado da lista', () => {
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
  /**
   * Fechar (depois do `open.set(false)`): o "close" do diálogo chega numa tarefa depois, e fecharia a
   * folha aberta de novo logo em seguida; por isso, esperar o próprio evento.
   */
  const closed = async () => {
    const dialog = el.querySelector('dialog')!;
    const event = dialog.open ? nextClose(dialog) : Promise.resolve();
    await stable();
    await event;
    await stable();
  };
  const names = () => Array.from(el.querySelectorAll('.escolha .nome')).map(text);
  const section = (title: string) => Array.from(el.querySelectorAll<HTMLElement>('.indice .secao')).find((s) => text(s.querySelector('.secao-titulo')!) === title) ?? null;
  const rows = (title: string) => Array.from(section(title)?.querySelectorAll<HTMLButtonElement>('button.idx') ?? []);
  const row = (title: string, name: string) => rows(title).find((b) => text(b.querySelector('.idx-nome')!) === name)!;
  const tags = () => Array.from(el.querySelectorAll<HTMLButtonElement>('app-tag-chips .atalho'));
  const tag = (name: string) => tags().find((b) => text(b).startsWith(name))!;
  const tagNames = () => tags().map((b) => text(b).replace(/\s*\d+$/, ''));
  const achados = () => text(el.querySelector('.achados')!);
  const search = () => el.querySelector<HTMLInputElement>('input[type="search"]')!;
  const type = async (q: string) => {
    search().value = q;
    search().dispatchEvent(new Event('input'));
    await stable();
  };

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

  it('a lista e o índice ficam lado a lado, cada um com a sua rolagem: os filtros nunca empurram a lista para fora', async () => {
    await open({ onlyKind: 'anotacoes' });
    const corpo = el.querySelector<HTMLElement>('.corpo')!;
    const indice = el.querySelector<HTMLElement>('.indice')!;
    const body = el.querySelector<HTMLElement>('.lado-lista .body')!;
    expect(getComputedStyle(corpo).display).toBe('grid');
    expect(getComputedStyle(indice).overflowY).toBe('auto');
    expect(getComputedStyle(body).overflowY).toBe('auto');
    // a lista começa na mesma altura do índice, ao lado dele, e não embaixo
    expect(Math.abs(body.getBoundingClientRect().top - indice.getBoundingClientRect().top)).toBeLessThan(80);
    // (a ficha é torta: as caixas medidas saem um pouco inclinadas)
    expect(body.getBoundingClientRect().left).toBeGreaterThan(indice.getBoundingClientRect().right - 8);
    expect(names().length).toBe(7);
  });

  it('"Onde" num mural só: Todas e os grupos na ordem do mural, com quantas; as pastas só com um grupo escolhido', async () => {
    await open({ onlyKind: 'anotacoes' });
    expect(rows('Onde').map(rowOf)).toEqual(['Todas:7', 'Trabalho:4', 'Estudos:2', 'Sem grupo:1']);
    expect(row('Onde', 'Todas').getAttribute('aria-pressed')).toBe('true');
    // os grupos com pasta mostram a setinha de que abrem
    expect(row('Onde', 'Trabalho').querySelector('.idx-mais')).not.toBeNull();
    expect(row('Onde', 'Sem grupo').querySelector('.idx-mais')).toBeNull();
    expect(tagNames()).toEqual(['Bugfix', 'Feature', 'Urgente', 'Prova']);
  });

  it('o grupo e a pasta: escolher o grupo abre as pastas dele; a pasta filtra, tocar nela de novo volta ao grupo, e trocar de grupo a esquece', async () => {
    await open({ onlyKind: 'anotacoes' });
    row('Onde', 'Trabalho').click();
    await stable();
    expect(names()).toEqual(['Revisar o deploy', 'Tela de login', 'Migrar o banco', 'Menu no celular']);
    expect(row('Onde', 'Trabalho').getAttribute('aria-pressed')).toBe('true');
    // as pastas logo embaixo do grupo, um nível para dentro, de A a Z, e "Sem pasta" no fim
    expect(rows('Onde').map(rowOf)).toEqual(['Todas:7', 'Trabalho:4', 'Backend:2', 'Frontend:1', 'Sem pasta:1', 'Estudos:2', 'Sem grupo:1']);
    expect(row('Onde', 'Backend').style.getPropertyValue('--nivel')).toBe('1');
    row('Onde', 'Backend').click();
    await stable();
    expect(names()).toEqual(['Revisar o deploy', 'Migrar o banco']);
    // o grupo da pasta fica no caminho, sem o adesivo
    expect(row('Onde', 'Trabalho').getAttribute('aria-pressed')).toBe('false');
    expect(row('Onde', 'Trabalho').classList).toContain('caminho');
    row('Onde', 'Backend').click();
    await stable();
    expect(names().length).toBe(4);
    expect(row('Onde', 'Trabalho').getAttribute('aria-pressed')).toBe('true');
    row('Onde', 'Frontend').click();
    row('Onde', 'Estudos').click();
    await stable();
    expect(names()).toEqual(['Revolução Francesa', 'Rios do Brasil']);
    expect(rows('Onde').map(rowOf)).toEqual(['Todas:7', 'Trabalho:4', 'Estudos:2', 'Geografia:1', 'História:1', 'Sem grupo:1']);
    row('Onde', 'Todas').click();
    await stable();
    expect(names().length).toBe(7);
  });

  it('filtrando por outra coisa, as pastas que não deixariam nenhuma se recolhem em "+N pastas vazias", que as mostra', async () => {
    await open({ onlyKind: 'anotacoes' });
    row('Onde', 'Trabalho').click();
    tag('Feature').click();
    await stable();
    expect(rows('Onde').map((b) => text(b.querySelector('.idx-nome')!))).toEqual(['Todas', 'Trabalho', 'Backend', 'Frontend', '+1 pasta vazia', 'Estudos', 'Sem grupo']);
    const vazias = row('Onde', '+1 pasta vazia');
    expect(vazias.hasAttribute('aria-pressed')).toBeFalse();
    vazias.click();
    await stable();
    expect(row('Onde', 'Sem pasta').classList).toContain('zero');
    expect(row('Onde', '+1 pasta vazia')).toBeUndefined();
    // noutro grupo, as vazias se recolhem de novo
    row('Onde', 'Estudos').click();
    await stable();
    row('Onde', 'Trabalho').click();
    await stable();
    expect(row('Onde', '+1 pasta vazia')).toBeDefined();
  });

  it('a data de cada linha é a da ordem: mexida, criada, ou a da anotação de A a Z', async () => {
    await open({ onlyKind: 'anotacoes' });
    const meta = () => text(el.querySelector('.escolha .meta')!);
    expect(meta()).toMatch(/ · mexida em \d{2} de /);
    const select = el.querySelector<HTMLSelectElement>('.ordem select')!;
    select.value = 'criadas';
    select.dispatchEvent(new Event('change'));
    await stable();
    expect(meta()).toMatch(/ · criada em \d{2} de /);
    // a pasta também aparece, depois do grupo
    expect(meta()).toContain('Trabalho › Backend');
  });

  it('as pastas de dentro aparecem ao escolher a de cima, e filtrar pela de cima pega as de dentro', async () => {
    const settings = TestBed.inject(Settings);
    settings.setNotesConfig({
      folders: [
        { id: 'pcodigo1', group: 'trabalho', name: 'Código', parent: null },
        { id: 'papi0001', group: 'trabalho', name: 'API', parent: 'pcodigo1' },
        { id: 'pdocs001', group: 'trabalho', name: 'Docs', parent: null },
      ],
    });
    TestBed.inject(ReviewStore).reviews.set([
      card('nota11', 'Rota nova', 'anotacoes', { category: 'Trabalho', folder: 'papi0001' }),
      card('nota12', 'Refatorar', 'anotacoes', { category: 'Trabalho', folder: 'pcodigo1' }),
      card('nota13', 'Manual', 'anotacoes', { category: 'Trabalho', folder: 'pdocs001' }),
    ]);
    await open({ onlyKind: 'anotacoes' });
    row('Onde', 'Trabalho').click();
    await stable();
    expect(rows('Onde').map(rowOf)).toEqual(['Todas:3', 'Trabalho:3', 'Código:2', 'Docs:1']);
    expect(row('Onde', 'Código').querySelector('.idx-mais')).not.toBeNull();
    row('Onde', 'Código').click();
    await stable();
    expect(names()).toEqual(['Rota nova', 'Refatorar']);
    expect(rows('Onde').map(rowOf)).toEqual(['Todas:3', 'Trabalho:3', 'Código:2', 'API:1', 'Docs:1']);
    expect(row('Onde', 'API').style.getPropertyValue('--nivel')).toBe('2');
    row('Onde', 'API').click();
    await stable();
    expect(names()).toEqual(['Rota nova']);
    expect(row('Onde', 'Código').classList).toContain('caminho');
    // o adesivo do celular diz o caminho inteiro
    expect(Array.from(el.querySelectorAll('app-filter-tags .txt')).map(text)).toEqual(['Trabalho › Código › API']);
    // tocar de novo na escolhida sobe para a de cima
    row('Onde', 'API').click();
    await stable();
    expect(row('Onde', 'Código').getAttribute('aria-pressed')).toBe('true');
  });

  it('"Onde" com todos os murais: os murais na raiz; os grupos só dentro de Anotações, e trocar de mural esquece os filtros das anotações', async () => {
    await open();
    expect(rows('Onde').map(rowOf)).toEqual(['Todos os murais:9', 'Anotações:7', 'Jogos:1', 'Livros:1']);
    expect(section('Tags')).toBeNull();
    row('Onde', 'Anotações').click();
    await stable();
    expect(rows('Onde').map(rowOf)).toEqual(['Todos os murais:9', 'Anotações:7', 'Trabalho:4', 'Estudos:2', 'Sem grupo:1', 'Jogos:1', 'Livros:1']);
    expect(names().length).toBe(7);
    row('Onde', 'Trabalho').click();
    tag('Bugfix').click();
    await stable();
    expect(names()).toEqual(['Revisar o deploy', 'Menu no celular']);
    expect(row('Onde', 'Anotações').classList).toContain('caminho');
    row('Onde', 'Jogos').click();
    await stable();
    expect(names()).toEqual(['Hollow Knight']);
    expect(section('Tags')).toBeNull();
    row('Onde', 'Anotações').click();
    await stable();
    // o grupo e a tag ficaram para trás
    expect(names().length).toBe(7);
    expect(tags().every((b) => b.getAttribute('aria-pressed') === 'false')).toBeTrue();
  });

  it('as tags: um toque liga (vale qualquer uma), o clique direito esconde a tag; as contagens seguem o grupo', async () => {
    await open({ onlyKind: 'anotacoes' });
    tag('Urgente').click();
    await stable();
    expect(names()).toEqual(['Revisar o deploy', 'Ideias soltas']);
    tag('Prova').click();
    await stable();
    expect(names()).toEqual(['Revisar o deploy', 'Revolução Francesa', 'Ideias soltas']);
    // com a tag ligada, o grupo conta só as que ela deixa (o que não deixaria nada desbota)
    expect(rows('Onde').map(rowOf)).toEqual(['Todas:3', 'Trabalho:1', 'Estudos:1', 'Sem grupo:1']);
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
    row('Onde', 'Estudos').click();
    await stable();
    expect(tagNames()).toEqual(['Prova']);
    expect(row('Onde', 'Sem grupo').classList).not.toContain('zero');
  });

  it('o estado: abertas ou finalizadas, um toque liga e outro tira; o Kanban abre só com as abertas', async () => {
    await open({ onlyKind: 'anotacoes' });
    expect(rows('Estado').map(rowOf)).toEqual(['Abertas:6', 'Finalizadas:1']);
    expect(rows('Estado').every((b) => b.getAttribute('aria-pressed') === 'false')).toBeTrue();
    row('Estado', 'Finalizadas').click();
    await stable();
    expect(names()).toEqual(['Menu no celular']);
    // o grupo conta com o estado
    expect(rowOf(row('Onde', 'Trabalho'))).toBe('Trabalho:1');
    row('Estado', 'Finalizadas').click();
    await stable();
    expect(names().length).toBe(7);
    fixture.componentInstance.open.set(false);
    await closed();
    fixture.componentRef.setInput('doneOption', true);
    fixture.componentInstance.open.set(true);
    await stable();
    expect(row('Estado', 'Abertas').getAttribute('aria-pressed')).toBe('true');
    expect(names()).not.toContain('Menu no celular');
    expect(achados()).toMatch(/^Mostrando 6 de 7 ?Limpar$/);
  });

  it('só finalizadas no Kanban: a lista vazia oferece mostrar; sem nenhuma finalizada, o estado nem aparece', async () => {
    TestBed.inject(ReviewStore).reviews.set([card('feita1', 'Feita', 'anotacoes', { doneAt: '2026-10-18T10:00:00.000Z' }), card('jogo01', 'Hollow Knight', 'jogos')]);
    await open({ onlyKind: 'anotacoes', doneOption: true });
    expect(names()).toEqual([]);
    expect(text(el.querySelector('.nada')!)).toContain('Aqui só há anotações finalizadas.');
    el.querySelector<HTMLButtonElement>('.nada-link')!.click();
    await stable();
    expect(names()).toEqual(['Feita']);
    TestBed.inject(ReviewStore).reviews.set([card('nota09', 'Aberta', 'anotacoes'), card('nota10', 'Outra', 'anotacoes')]);
    await stable();
    expect(section('Estado')).toBeNull();
  });

  it('"Mostrar só": fixadas, privadas e com tarefa por fazer, cada uma um interruptor com quantas; ligadas, valem juntas', async () => {
    TestBed.inject(ReviewStore).reviews.set([
      card('nota21', 'Fixada com tarefa', 'anotacoes', { noteRank: 'fixada', text: '- [ ] comprar pão\n- [x] lavar' }),
      card('nota22', 'Só fixada', 'anotacoes', { noteRank: 'fixada' }),
      card('nota23', 'Privada', 'anotacoes', { private: true, text: '- [x] feito' }),
      card('nota24', 'Comum', 'anotacoes'),
    ]);
    await open({ onlyKind: 'anotacoes' });
    const chave = (name: string) => Array.from(section('Mostrar só')!.querySelectorAll('.chave')).find((c) => text(c.querySelector('.chave-nome')!) === name)!;
    const sw = (name: string) => chave(name).querySelector<HTMLButtonElement>('[role="switch"]')!;
    expect(Array.from(section('Mostrar só')!.querySelectorAll('.chave-nome')).map(text)).toEqual(['Fixadas no mural', 'Com tarefa por fazer', 'Privadas']);
    expect(text(chave('Com tarefa por fazer').querySelector('.idx-n')!)).toContain('1');
    sw('Fixadas no mural').click();
    await stable();
    expect(names()).toEqual(['Fixada com tarefa', 'Só fixada']);
    expect(sw('Fixadas no mural').getAttribute('aria-checked')).toBe('true');
    // a tarefa conta com a fixada ligada; a privada (que não é fixada) não deixaria nenhuma
    expect(chave('Privadas').classList).toContain('zero');
    // tocar no nome também liga
    chave('Com tarefa por fazer').querySelector<HTMLLabelElement>('.chave-nome')!.click();
    await stable();
    expect(names()).toEqual(['Fixada com tarefa']);
  });

  it('"Mexidas": hoje, nos últimos 7 e 30 dias e há mais tempo; um toque liga, outro tira', async () => {
    const day = 86_400_000;
    const at = (ms: number) => new Date(Date.now() - ms).toISOString();
    TestBed.inject(ReviewStore).reviews.set([
      card('nota31', 'Agora', 'anotacoes', { updatedAt: at(60_000) }),
      card('nota32', 'Semana', 'anotacoes', { updatedAt: at(3 * day) }),
      card('nota33', 'Mês', 'anotacoes', { updatedAt: at(20 * day) }),
      card('nota34', 'Velha', 'anotacoes', { updatedAt: at(90 * day) }),
    ]);
    await open({ onlyKind: 'anotacoes' });
    expect(rows('Mexidas').map(rowOf)).toEqual(['Hoje:1', 'Nos últimos 7 dias:2', 'Nos últimos 30 dias:3', 'Há mais de 30 dias:1']);
    row('Mexidas', 'Nos últimos 7 dias').click();
    await stable();
    expect(names()).toEqual(['Agora', 'Semana']);
    row('Mexidas', 'Há mais de 30 dias').click();
    await stable();
    expect(names()).toEqual(['Velha']);
    row('Mexidas', 'Há mais de 30 dias').click();
    await stable();
    expect(names().length).toBe(4);
  });

  it('a ordem: as mexidas há pouco primeiro, ou as criadas há pouco, ou de A a Z', async () => {
    await open({ onlyKind: 'anotacoes' });
    const select = el.querySelector<HTMLSelectElement>('.ordem select')!;
    expect(text(el.querySelector('.ordem-val')!)).toBe('Mexidas há pouco');
    select.value = 'az';
    select.dispatchEvent(new Event('change'));
    await stable();
    expect(names()).toEqual(['Ideias soltas', 'Menu no celular', 'Migrar o banco', 'Revisar o deploy', 'Revolução Francesa', 'Rios do Brasil', 'Tela de login']);
    expect(text(el.querySelector('.ordem-val')!)).toBe('Nome, de A a Z');
  });

  it('"Mostrando N de M" e Limpar; sem nenhuma, a lista vazia oferece limpar os filtros e a busca fica', async () => {
    await open({ onlyKind: 'anotacoes' });
    expect(achados()).toBe('7 anotações');
    row('Onde', 'Estudos').click();
    await stable();
    expect(achados()).toMatch(/^Mostrando 2 de 7 ?Limpar$/);
    await type('deploy');
    expect(names()).toEqual([]);
    expect(text(el.querySelector('.nada')!)).toContain('Nenhuma anotação com esses filtros e “deploy”.');
    el.querySelector<HTMLButtonElement>('.nada-link')!.click();
    await stable();
    expect(names()).toEqual(['Revisar o deploy']);
    expect(achados()).toBe('1 anotação');
    expect(search().value).toBe('deploy');
  });

  it('no celular, o "Filtros" abre o índice por cima da lista e diz quantos estão ligados; os ligados viram adesivos com X', async () => {
    await open({ onlyKind: 'anotacoes' });
    const abre = el.querySelector<HTMLButtonElement>('.abre-filtros')!;
    expect(abre.getAttribute('aria-expanded')).toBe('false');
    abre.click();
    await stable();
    expect(el.querySelector('.corpo')!.classList).toContain('gaveta');
    // o foco entra no índice, na escolhida
    await new Promise((r) => requestAnimationFrame(r));
    expect(document.activeElement).toBe(row('Onde', 'Todas'));
    row('Onde', 'Trabalho').click();
    tag('Bugfix').click();
    await stable();
    expect(text(abre)).toContain('2');
    expect(text(el.querySelector('.indice-pe')!)).toBe('Ver 2 anotações');
    // o Esc fecha só a gaveta (a folha continua aberta), mesmo com o foco na busca
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    search().dispatchEvent(esc);
    await stable();
    expect(esc.defaultPrevented).toBeTrue();
    expect(el.querySelector('.corpo')!.classList).not.toContain('gaveta');
    expect(abre.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('dialog')!.open).toBeTrue();
    // (os adesivos ficam à vista também no computador, em cima da lista)
    const stickers = Array.from(el.querySelectorAll('app-filter-tags .txt')).map(text);
    expect(stickers).toEqual(['Trabalho', '#Bugfix']);
    el.querySelector<HTMLButtonElement>('app-filter-tags .tirar')!.click();
    await stable();
    expect(names()).toEqual(['Revisar o deploy', 'Menu no celular']);
    expect(Array.from(el.querySelectorAll('app-filter-tags .txt')).map(text)).toEqual(['#Bugfix']);
  });

  it('o "Buscar nota" do quadro de um grupo: "Todas de Trabalho" e as pastas dele direto, sem os outros grupos', async () => {
    await open({ onlyKind: 'anotacoes', onlyCategory: 'trabalho', doneOption: true });
    // (só as abertas, o costume do Kanban: a "Sem pasta", com só a finalizada, se recolhe)
    expect(rows('Onde').map((b) => text(b))).toEqual(['Todas de Trabalho, 3', 'Backend, 2', 'Frontend, 1', '+1 pasta vazia']);
    row('Onde', 'Frontend').click();
    await stable();
    expect(names()).toEqual(['Tela de login']);
  });

  it('os grupos na ordem montada à mão no mural, com o desenho e a cor de cada um', async () => {
    const settings = TestBed.inject(Settings);
    settings.notesConfig.set({ ...NOTES_CONFIG_DEFAULT, orderBy: 'minha', order: ['estudos', 'trabalho'] });
    settings.setCategoryLook('Trabalho', { color: 'azul' });
    await open({ onlyKind: 'anotacoes' });
    expect(rows('Onde').map(rowOf)).toEqual(['Todas:7', 'Estudos:2', 'Trabalho:4', 'Sem grupo:1']);
    const trabalho = row('Onde', 'Trabalho');
    expect(trabalho.style.getPropertyValue('--cat-cor')).toBe('#2d8bd6');
    expect(trabalho.classList).toContain('cor');
    expect(row('Onde', 'Sem grupo').querySelector('lucide-icon')).toBeNull();
  });

  it('ao abrir de novo, os filtros voltam desligados, e a ordem também', async () => {
    await open({ onlyKind: 'anotacoes' });
    row('Onde', 'Estudos').click();
    tag('Prova').click();
    const select = el.querySelector<HTMLSelectElement>('.ordem select')!;
    select.value = 'az';
    select.dispatchEvent(new Event('change'));
    await stable();
    fixture.componentInstance.open.set(false);
    await closed();
    fixture.componentInstance.open.set(true);
    await stable();
    expect(row('Onde', 'Todas').getAttribute('aria-pressed')).toBe('true');
    expect(names().length).toBe(7);
    expect(names()[0]).toBe('Revisar o deploy');
  });
});

describe('os filtros no "Escolher fichas" do perfil', () => {
  it('a mesma peça: os murais, o grupo e a pasta no "Onde", de A a Z, e a marcada continua marcada', async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ProfilePicker], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(ProfilePicker);
    // as fichas do seu mural já com as pastas que os assuntos viraram
    const converted = convertSubjects(seed(), [], {});
    TestBed.inject(Settings).setNotesConfig({ folders: converted.folders });
    const byId = new Map(converted.notes.map((n) => [n.id, n]));
    fixture.componentRef.setInput('cards', seed().map((c) => byId.get(c.id) ?? c));
    fixture.componentRef.setInput('chosen', ['nota05']);
    const el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    fixture.componentInstance.open.set(true);
    await fixture.whenStable();
    const names = () => Array.from(el.querySelectorAll('.item .nome')).map(text);
    const pick = (name: string) => Array.from(el.querySelectorAll<HTMLButtonElement>('.indice button.idx')).find((b) => text(b.querySelector('.idx-nome')!) === name)!.click();
    // a escolhida primeiro, depois de A a Z
    expect(names().slice(0, 3)).toEqual(['Revolução Francesa', 'Hollow Knight', 'Ideias soltas']);
    pick('Anotações');
    await fixture.whenStable();
    pick('Estudos');
    await fixture.whenStable();
    expect(names()).toEqual(['Revolução Francesa', 'Rios do Brasil']);
    expect(el.querySelector('.item.on .nome')!.textContent).toContain('Revolução Francesa');
    pick('Geografia');
    await fixture.whenStable();
    expect(names()).toEqual(['Rios do Brasil']);
    el.remove();
    fixture.destroy();
    localStorage.clear();
  });

  it('a anotação só no Kanban fica apagada, como a privada: quem visita não a veria', async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ProfilePicker], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(ProfilePicker);
    fixture.componentRef.setInput('cards', seed());
    fixture.componentRef.setInput('chosen', []);
    fixture.componentRef.setInput('boardOnly', new Set(['nota02']));
    const el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    fixture.componentInstance.open.set(true);
    await fixture.whenStable();
    const item = (name: string) => Array.from(el.querySelectorAll('.item')).find((i) => text(i.querySelector('.nome')!) === name)!;
    expect(item('Tela de login').querySelector('input')!.disabled).toBeTrue();
    expect(text(item('Tela de login').querySelector('.meta')!)).toContain('só no Kanban: não aparece');
    expect(item('Revisar o deploy').querySelector('input')!.disabled).toBeFalse();
    el.remove();
    fixture.destroy();
    localStorage.clear();
  });
});
