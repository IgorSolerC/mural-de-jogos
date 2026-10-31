import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { Confirm, ConfirmOptions } from './confirm';
import { MuralConfig } from './mural-config';

let seq = 0;
const note = (category: string | null, tags: string[] = []): Review =>
  sanitizeReview({
    id: `ncfg${++seq}`,
    kind: 'anotacoes',
    game: { name: `Nota ${seq}`, coverUrl: null, source: 'manual' },
    scores: { final: 0 },
    status: 'finalizado',
    text: '',
    completedAt: '2026-10-01',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    private: true,
    ...(category ? { category } : {}),
    ...(tags.length ? { tags } : {}),
  })!;

/** A folha da engrenagem do mural de anotações. */
describe('as configurações do mural (a folha)', () => {
  let fixture: ComponentFixture<MuralConfig>;
  let el: HTMLElement;
  let settings: Settings;
  let closed: number;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [MuralConfig], providers: [provideZonelessChangeDetection()] });
    settings = TestBed.inject(Settings);
    // Viagens! (3), Roadmap site (2), Receitas (1) e uma sem categoria; as tags: urgente (3), Ideia (2), bug (1)
    TestBed.inject(ReviewStore).reviews.set([
      note('Viagens!', ['Ideia']),
      note('viagens!', ['urgente']),
      note('Viagens!'),
      note('Roadmap site', ['urgente', 'bug']),
      note('Roadmap site', ['ideia']),
      note('Receitas'),
      note(null, ['Urgente']),
    ]);
    fixture = TestBed.createComponent(MuralConfig);
    document.body.appendChild(fixture.nativeElement);
    el = fixture.nativeElement;
    closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    await fixture.whenStable();
  });

  afterEach(() => {
    el.querySelector('dialog')?.close();
    fixture.nativeElement.remove();
    localStorage.clear();
  });

  const tab = (name: string) => el.querySelector<HTMLButtonElement>(`#config-aba-${name}`)!;
  const segment = (root: ParentNode, text: string) =>
    Array.from(root.querySelectorAll<HTMLLabelElement>('.segmento')).find((s) => s.textContent!.trim().startsWith(text))!.querySelector('input')!;
  const rows = () => Array.from(el.querySelectorAll('.cats:not(.autos) .cat app-cat-label .nome')).map((n) => n.textContent!.trim());
  const go = async (name: string) => {
    tab(name).click();
    await fixture.whenStable();
  };

  it('abre como diálogo, com o índice como lista de abas', async () => {
    expect(el.querySelector('dialog')!.open).toBeTrue();
    await go('padroes');
    expect(tab('padroes').getAttribute('aria-selected')).toBe('true');
    expect(tab('categorias').getAttribute('tabindex')).toBe('-1');
    expect(el.querySelector('h3')!.textContent).toBe('Padrões');
  });

  it('os padrões mudam o mural inteiro na hora', async () => {
    await go('padroes');
    segment(el, 'Disponível').click();
    await fixture.whenStable();
    expect(settings.notesConfig().audience).toBe('visivel');
    expect(el.textContent).not.toContain('Sub-nota');
    const tagSwitch = el.querySelector<HTMLButtonElement>('[aria-labelledby="config-t-tag"]')!;
    tagSwitch.click();
    await fixture.whenStable();
    expect(settings.askNoTag()).toBeFalse();
    expect(tagSwitch.getAttribute('aria-checked')).toBe('false');
  });

  it('as setas do índice trocam de parte, e a folha volta na parte em que ficou', async () => {
    await go('padroes');
    tab('padroes').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await fixture.whenStable();
    expect(tab('categorias').getAttribute('aria-selected')).toBe('true');
    expect(el.querySelector('h3')!.textContent).toBe('Grupos');
    const again = TestBed.createComponent(MuralConfig);
    document.body.appendChild(again.nativeElement);
    await again.whenStable();
    expect(again.nativeElement.querySelector('#config-aba-categorias').getAttribute('aria-selected')).toBe('true');
    again.nativeElement.querySelector('dialog')?.close();
    again.nativeElement.remove();
    again.destroy();
  });

  it('lista as categorias da maior para a menor, cada uma seguindo o mural até mudar', async () => {
    await go('categorias');
    expect(rows()).toEqual(['Viagens!', 'Roadmap site', 'Receitas']);
    expect(el.querySelectorAll('.alca').length).toBe(0);
    const first = el.querySelector('.cat')!;
    expect(first.querySelector('.cat-resumo')!.textContent!.trim()).toBe('Segue o mural');
    first.querySelector<HTMLButtonElement>('.cat-abre')!.click();
    await fixture.whenStable();
    const panel = first.querySelector('.cat-painel')!;
    expect(first.querySelector('.cat-abre')!.getAttribute('aria-expanded')).toBe('true');
    // "Do mural" diz o que o mural manda agora
    expect(segment(panel, 'Do mural').closest('label')!.textContent).toContain('Privada');
    segment(panel, 'Publicar').click();
    await fixture.whenStable();
    expect(settings.notesConfig().categories['viagens!']).toEqual({ audience: 'publicar' });
    expect(first.querySelector('.cat-resumo')!.textContent!.trim()).toBe('Nasce Publicar');
    // voltar a seguir o mural tira tudo o que é dela
    first.querySelector<HTMLButtonElement>('.voltar')!.click();
    await fixture.whenStable();
    expect(settings.notesConfig().categories).toEqual({});
  });

  it('a visualização padrão do grupo: a última usada até escolher uma; o resumo diz qual', async () => {
    await go('categorias');
    const first = el.querySelector('.cat')!;
    first.querySelector<HTMLButtonElement>('.cat-abre')!.click();
    await fixture.whenStable();
    const panel = first.querySelector('.cat-painel')!;
    const vista = panel.querySelector('input[name^="config-vista-"]')!.closest('fieldset')!;
    expect(vista.querySelector('legend')!.textContent).toContain('Visualização padrão');
    expect(Array.from(vista.querySelectorAll('.seg-nome')).map((n) => n.textContent!.trim())).toEqual(['A última usada', 'Comuns', 'Inteiras', 'Simples', 'Capa e nome', 'Lista']);
    expect(segment(vista, 'A última usada').checked).toBeTrue();
    expect(vista.querySelector('.nome-dica')!.textContent).toContain('da última vez');
    segment(vista, 'Lista').click();
    await fixture.whenStable();
    expect(settings.notesConfig().categories['viagens!']).toEqual({ view: 'lista' });
    expect(first.querySelector('.cat-resumo')!.textContent!.trim()).toBe('Abre em lista');
    expect(vista.querySelector('.nome-dica')!.textContent).toContain('sempre abre assim');
    segment(vista, 'A última usada').click();
    await fixture.whenStable();
    expect(settings.notesConfig().categories).toEqual({});
  });

  it('a ordenação padrão do grupo: a última usada até escolher uma; o resumo diz qual', async () => {
    await go('categorias');
    const first = el.querySelector('.cat')!;
    first.querySelector<HTMLButtonElement>('.cat-abre')!.click();
    await fixture.whenStable();
    const ordem = first.querySelector('.cat-painel input[name^="config-ordem-"]')!.closest('fieldset')!;
    expect(ordem.querySelector('legend')!.textContent).toContain('Ordenação padrão');
    expect(Array.from(ordem.querySelectorAll('.seg-nome')).map((n) => n.textContent!.trim())).toEqual([
      'A última usada',
      'Prioridade',
      'Data',
      'Título',
      'Assunto',
      'Tag',
      'Criação',
      'Alteração',
      'Finalização',
      'Tarefas',
      'Cor',
      'Quem vê',
      'Dono',
    ]);
    expect(segment(ordem, 'A última usada').checked).toBeTrue();
    segment(ordem, 'Tag').click();
    await fixture.whenStable();
    expect(settings.notesConfig().categories['viagens!']).toEqual({ sort: 'tag' });
    expect(first.querySelector('.cat-resumo')!.textContent!.trim()).toBe('Por tag');
    expect(ordem.querySelector('.nome-dica')!.textContent).toContain('sempre abre nesta ordem');
    segment(ordem, 'A última usada').click();
    await fixture.whenStable();
    expect(settings.notesConfig().categories).toEqual({});
  });

  it('as abas que o mural gera vêm depois dos grupos, com o olho desligado (no Mais) e só a cor para mudar', async () => {
    await go('categorias');
    expect(el.querySelector('.cats-costura')!.textContent!.trim()).toBe('Gerados automaticamente');
    const autos = Array.from(el.querySelectorAll<HTMLElement>('.cats.autos > .cat'));
    expect(autos.map((r) => r.querySelector('app-cat-label .nome')!.textContent!.trim())).toEqual(['Tudo', 'Fixadas', 'Compartilhadas']);
    // nada de alça, renomear nem apagar; o olho desligado é o padrão
    expect(autos.every((r) => !r.querySelector('.alca'))).toBeTrue();
    const eye = (i: number) => autos[i].querySelector<HTMLButtonElement>('.olho')!;
    expect(eye(0).getAttribute('aria-pressed')).toBe('true');
    expect(autos[1].querySelector('.cat-n')!.textContent).toContain('no Mais');
    eye(1).click();
    await fixture.whenStable();
    expect(settings.notesConfig().showPinned).toBeTrue();
    expect(eye(1).getAttribute('aria-pressed')).toBe('false');
    eye(0).click();
    await fixture.whenStable();
    expect(settings.notesConfig().showAll).toBeTrue();
    // abre: só a cor da etiqueta, sem os ícones nem o apagar
    autos[2].querySelector<HTMLButtonElement>('.cat-abre')!.click();
    await fixture.whenStable();
    const painel = autos[2].querySelector('.cat-painel')!;
    expect(painel.querySelector('.op.icone')).toBeNull();
    expect(painel.querySelector('.apagar')).toBeNull();
    painel.querySelector<HTMLButtonElement>('.op.cor[aria-label="Azul"]')!.click();
    await fixture.whenStable();
    expect(settings.notesConfig().autoColors).toEqual({ compartilhadas: 'azul' });
    expect(autos[2].querySelector('.orelha')!.classList).toContain('orelha-cor');
    painel.querySelector<HTMLButtonElement>('.op.cor.sem-cor')!.click();
    await fixture.whenStable();
    expect(settings.notesConfig().autoColors).toEqual({});
  });

  it('na minha ordem, a alça sobe e desce a categoria pelo teclado, e as abas seguem', async () => {
    await go('categorias');
    segment(el, 'Na minha ordem').click();
    await fixture.whenStable();
    expect(settings.notesConfig().orderBy).toBe('minha');
    expect(settings.notesConfig().order).toEqual(['viagens!', 'roadmap site', 'receitas']);
    const handles = () => Array.from(el.querySelectorAll<HTMLButtonElement>('.alca'));
    expect(handles().length).toBe(3);
    handles()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    await fixture.whenStable();
    expect(rows()).toEqual(['Viagens!', 'Receitas', 'Roadmap site']);
    handles()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    await fixture.whenStable();
    expect(rows()).toEqual(['Receitas', 'Viagens!', 'Roadmap site']);
    expect(el.querySelector('[aria-live="polite"]')!.textContent).toContain('Receitas: 1ª de 3');
    // de volta à quantidade, e de novo à minha: a ordem montada não se perdeu
    segment(el, 'Da maior para a menor').click();
    await fixture.whenStable();
    expect(rows()).toEqual(['Viagens!', 'Roadmap site', 'Receitas']);
    segment(el, 'Na minha ordem').click();
    await fixture.whenStable();
    expect(rows()).toEqual(['Receitas', 'Viagens!', 'Roadmap site']);
  });

  it('o olho esconde a categoria no Mais, e mostra de novo', async () => {
    await go('categorias');
    const second = el.querySelectorAll('.cat')[1];
    const eye = second.querySelector<HTMLButtonElement>('.olho')!;
    expect(eye.getAttribute('aria-pressed')).toBe('false');
    expect(eye.getAttribute('aria-label')).toBe('Esconder Roadmap site no Mais');
    eye.click();
    await fixture.whenStable();
    expect(settings.notesConfig().categories['roadmap site']).toEqual({ hidden: true });
    expect(eye.getAttribute('aria-pressed')).toBe('true');
    expect(second.classList).toContain('escondida');
    expect(second.querySelector('.cat-n')!.textContent).toContain('escondida no Mais');
    // esconder não é um padrão da categoria: ela continua seguindo o mural
    expect(second.querySelector('.cat-resumo')!.textContent!.trim()).toBe('Segue o mural');
    expect(el.querySelector('[aria-live="polite"]')!.textContent).toContain('Roadmap site escondida');
    eye.click();
    await fixture.whenStable();
    expect(settings.notesConfig().categories).toEqual({});
    expect(second.classList).not.toContain('escondida');
  });

  it('as tags vêm separadas por categoria (as sem categoria por último), e a cor muda só na categoria', async () => {
    settings.setCategoryLook('Roadmap site', { color: 'azul' });
    await go('tags');
    expect(el.querySelector('h3')!.textContent).toBe('Tags');
    const groups = () => Array.from(el.querySelectorAll<HTMLElement>('.tags-grupo'));
    // na ordem das categorias; Receitas não tem tag nenhuma
    expect(groups().map((g) => g.querySelector('.tags-cat .orelha')!.textContent!.trim())).toEqual(['Viagens!', 'Roadmap site', 'Sem grupo']);
    expect(groups().map((g) => g.getAttribute('aria-label'))).toEqual(['Tags de Viagens!', 'Tags de Roadmap site', 'Tags das anotações sem grupo']);
    const names = (g: HTMLElement) => Array.from(g.querySelectorAll('.tags > li app-note-tag')).map((t) => t.textContent!.trim());
    expect(groups().map(names)).toEqual([['Ideia', 'urgente'], ['bug', 'ideia', 'urgente'], ['Urgente']]);
    expect(groups()[1].querySelector('.tags-cat .cat-n')!.textContent!.trim()).toBe('3 tags');
    // a orelha com a cor da categoria
    expect(groups()[1].querySelector('.tags-cat .orelha')!.classList).toContain('orelha-cor');
    const ideiaViagens = groups()[0].querySelector('.tags > li')!;
    const ideiaRoadmap = groups()[1].querySelectorAll('.tags > li')[1];
    expect(ideiaViagens.querySelector('[role="radiogroup"]')!.getAttribute('aria-label')).toBe('Cor da tag Ideia');
    expect(ideiaViagens.querySelector('[aria-label="Sem cor"]')!.getAttribute('aria-checked')).toBe('true');
    ideiaViagens.querySelector<HTMLButtonElement>('[aria-label="Verde"]')!.click();
    await fixture.whenStable();
    expect(settings.tagColor('ideia', 'Viagens!')).toBe('verde');
    expect(settings.categoryLooks()['##viagens!#ideia']).toEqual({ color: 'verde' });
    // a mesma tag na outra categoria continua como estava, e pode ter outra cor
    expect(settings.tagColor('ideia', 'Roadmap site')).toBeUndefined();
    expect(ideiaRoadmap.querySelector('app-note-tag')!.classList).not.toContain('cor');
    expect(ideiaViagens.querySelector('app-note-tag')!.classList).toContain('cor');
    ideiaRoadmap.querySelector<HTMLButtonElement>('[aria-label="Rosa"]')!.click();
    await fixture.whenStable();
    expect(settings.tagColor('Ideia', 'Roadmap site')).toBe('rosa');
    expect(settings.tagColor('Ideia', 'Viagens!')).toBe('verde');
    // Sem cor volta ao papel pardo de sempre
    ideiaViagens.querySelector<HTMLButtonElement>('[aria-label="Sem cor"]')!.click();
    await fixture.whenStable();
    expect(settings.tagColor('Ideia', 'Viagens!')).toBeUndefined();
    expect(ideiaViagens.querySelector('app-note-tag')!.classList).not.toContain('cor');
  });

  it('cada tag tem o filtro padrão, Disponível ou Excluído, só na categoria dela; a excluída fica riscada', async () => {
    await go('tags');
    const groups = () => Array.from(el.querySelectorAll<HTMLElement>('.tags-grupo'));
    const ideiaViagens = () => groups()[0].querySelector<HTMLElement>('.tags > li')!;
    const option = (row: HTMLElement, text: string) =>
      Array.from(row.querySelectorAll<HTMLLabelElement>('.filtro-op')).find((l) => l.textContent!.trim() === text)!.querySelector('input')!;
    expect(ideiaViagens().querySelector('.tag-filtro legend')!.textContent!.trim()).toBe('Filtro padrão');
    expect(option(ideiaViagens(), 'Disponível').checked).toBeTrue();
    option(ideiaViagens(), 'Excluído').click();
    await fixture.whenStable();
    expect(settings.notesConfig().hiddenTags).toEqual(['##viagens!#ideia']);
    expect(ideiaViagens().classList).toContain('excluida');
    expect(el.querySelector('.aviso')!.textContent).toContain('Ideia em Viagens! começam escondidas');
    // a mesma tag em outra categoria continua Disponível
    expect(option(groups()[1].querySelectorAll<HTMLElement>('.tags > li')[1], 'Disponível').checked).toBeTrue();
    option(ideiaViagens(), 'Disponível').click();
    await fixture.whenStable();
    expect(settings.notesConfig().hiddenTags).toEqual([]);
    expect(ideiaViagens().classList).not.toContain('excluida');
  });

  it('sem nenhuma tag, a parte das tags diz onde pôr uma', async () => {
    TestBed.inject(ReviewStore).reviews.set([note('Receitas')]);
    await go('tags');
    expect(el.querySelector('.tags')).toBeNull();
    expect(el.querySelector('.vazio')!.textContent).toContain('Ainda não há tags');
  });

  describe('renomear e apagar', () => {
    let asked: ConfirmOptions[];
    let answer: boolean;
    const notes = () => TestBed.inject(ReviewStore).notes();
    const settle = async () => {
      for (let i = 0; i < 3; i++) {
        await new Promise((r) => setTimeout(r));
        await fixture.whenStable();
      }
    };
    const openCat = async (label: string) => {
      const row = Array.from(el.querySelectorAll<HTMLElement>('.cat')).find((li) => li.querySelector('app-cat-label')!.textContent!.trim() === label)!;
      row.querySelector<HTMLButtonElement>('.cat-abre')!.click();
      await fixture.whenStable();
      return row;
    };
    const tagRow = (label: string) => Array.from(el.querySelectorAll<HTMLElement>('.tags > li')).find((li) => li.querySelector('app-note-tag')?.textContent!.trim() === label)!;
    const submit = (form: HTMLFormElement) => form.dispatchEvent(new Event('submit', { cancelable: true }));

    beforeEach(() => {
      asked = [];
      answer = true;
      spyOn(TestBed.inject(Confirm), 'ask').and.callFake(async (o: ConfirmOptions) => {
        asked.push(o);
        return answer;
      });
    });

    it('renomear a categoria muda todas as anotações dela (as duas grafias), a cor e os padrões, sem perguntar', async () => {
      settings.setCategoryLook('Viagens!', { color: 'azul' });
      settings.setCategoryPrefs('Viagens!', { audience: 'publicar' });
      await go('categorias');
      const row = await openCat('Viagens!');
      const field = row.querySelector<HTMLInputElement>('.nome input')!;
      expect(field.value).toBe('Viagens!');
      expect(row.querySelector('.nome-dica')!.textContent).toContain('todas as 3 anotações');
      field.value = 'Férias';
      submit(row.querySelector<HTMLFormElement>('form.nome')!);
      await settle();
      expect(asked).toEqual([]);
      expect(notes().filter((r) => r.category === 'Férias').length).toBe(3);
      expect(notes().some((r) => r.category?.toLowerCase() === 'viagens!')).toBeFalse();
      expect(settings.categoryLook('Férias')).toEqual({ color: 'azul' });
      expect(settings.categoryLooks()['viagens!']).toBeUndefined();
      expect(settings.notesConfig().categories['ferias']).toEqual({ audience: 'publicar' });
      expect(el.querySelector('.aviso')!.textContent).toContain('Viagens! virou Férias em 3 anotações.');
      // o painel continua aberto, já com o nome novo
      expect(el.querySelector<HTMLInputElement>('.cat.aberta .nome input')!.value).toBe('Férias');
    });

    it('o nome de outra categoria junta as duas, depois de perguntar (e Voltar não muda nada)', async () => {
      await go('categorias');
      const row = await openCat('Receitas');
      row.querySelector<HTMLInputElement>('.nome input')!.value = 'roadmap SITE';
      answer = false;
      submit(row.querySelector<HTMLFormElement>('form.nome')!);
      await settle();
      expect(asked[0].title).toBe('Juntar com Roadmap site?');
      expect(notes().filter((r) => r.category === 'Receitas').length).toBe(1);
      expect(row.querySelector<HTMLInputElement>('.nome input')!.value).toBe('Receitas');
      answer = true;
      const open = el.querySelector<HTMLElement>('.cat.aberta')!;
      open.querySelector<HTMLInputElement>('.nome input')!.value = 'roadmap SITE';
      submit(open.querySelector<HTMLFormElement>('form.nome')!);
      await settle();
      // fica a grafia da que já existia
      expect(notes().filter((r) => r.category === 'Roadmap site').length).toBe(3);
      expect(rows()).toEqual(['Roadmap site', 'Viagens!']);
    });

    it('apagar a categoria pergunta antes, avisando quantas a usam; as anotações ficam sem categoria', async () => {
      settings.setCategoryLook('Roadmap site', { color: 'verde' });
      await go('categorias');
      const row = await openCat('Roadmap site');
      answer = false;
      row.querySelector<HTMLButtonElement>('.apagar')!.click();
      await settle();
      expect(asked.length).toBe(1);
      expect(asked[0].title).toBe('Apagar o grupo Roadmap site?');
      expect(asked[0].text).toContain('2 anotações usam este grupo');
      expect(notes().filter((r) => r.category === 'Roadmap site').length).toBe(2);
      answer = true;
      row.querySelector<HTMLButtonElement>('.apagar')!.click();
      await settle();
      expect(notes().filter((r) => !r.category).length).toBe(3);
      expect(settings.categoryLooks()['roadmap site']).toBeUndefined();
      expect(rows()).toEqual(['Viagens!', 'Receitas']);
      expect(el.querySelector('.aviso')!.textContent).toContain('Roadmap site foi apagado em 2 anotações.');
    });

    const group = (label: string) => Array.from(el.querySelectorAll<HTMLElement>('.tags-grupo')).find((g) => g.querySelector('.tags-cat .orelha')!.textContent!.trim() === label)!;
    const tagIn = (cat: string, label: string) => Array.from(group(cat).querySelectorAll<HTMLElement>('.tags > li')).find((li) => li.querySelector('app-note-tag')?.textContent!.trim() === label)!;

    it('renomear a tag pelo lápis muda só as anotações da categoria, com a cor dela ali; Esc desiste', async () => {
      settings.setTagColor('urgente', 'vermelho', 'Roadmap site');
      settings.setTagColor('urgente', 'azul', 'Viagens!');
      settings.togglePinnedTag('Urgente');
      await go('tags');
      const pencil = () => tagIn('Roadmap site', 'urgente').querySelector<HTMLButtonElement>('[aria-label="Renomear a tag urgente em Roadmap site"]')!;
      pencil().click();
      await settle();
      let field = el.querySelector<HTMLInputElement>('.tag-nome input')!;
      expect(document.activeElement).toBe(field);
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await settle();
      expect(el.querySelector('.tag-nome')).toBeNull();
      expect(el.querySelector('dialog')!.open).toBeTrue();
      pencil().click();
      await settle();
      field = el.querySelector<HTMLInputElement>('.tag-nome input')!;
      field.value = 'Prioridade';
      submit(el.querySelector<HTMLFormElement>('.tag-nome')!);
      await settle();
      expect(notes().filter((r) => r.tags?.includes('Prioridade')).map((r) => r.category)).toEqual(['Roadmap site']);
      expect(notes().filter((r) => r.tags?.some((t) => t.toLowerCase() === 'urgente')).length).toBe(2);
      expect(settings.tagColor('Prioridade', 'Roadmap site')).toBe('vermelho');
      expect(settings.tagColor('urgente', 'Roadmap site')).toBeUndefined();
      expect(settings.tagColor('urgente', 'Viagens!')).toBe('azul');
      // a fixa continua: a tag ainda está nas outras categorias
      expect(settings.pinnedTags()).toEqual(['Urgente']);
      expect(el.querySelector('.aviso')!.textContent).toContain('Em Roadmap site, urgente virou Prioridade em 1 anotação.');
      // o foco volta para o lápis da tag, com o nome novo
      expect(document.activeElement?.getAttribute('aria-label')).toBe('Renomear a tag Prioridade em Roadmap site');
    });

    it('a tag com o nome de outra da mesma categoria junta as duas, sem repetir na mesma anotação', async () => {
      await go('tags');
      tagIn('Roadmap site', 'bug').querySelector<HTMLButtonElement>('[aria-label="Renomear a tag bug em Roadmap site"]')!.click();
      await settle();
      el.querySelector<HTMLInputElement>('.tag-nome input')!.value = 'URGENTE';
      submit(el.querySelector<HTMLFormElement>('.tag-nome')!);
      await settle();
      expect(asked[0].title).toBe('Juntar com urgente?');
      expect(asked[0].text).toContain('Roadmap site já tem a tag urgente');
      expect(notes().find((r) => r.category === 'Roadmap site' && r.tags?.includes('urgente'))!.tags).toEqual(['urgente']);
    });

    it('o nome de uma tag de outra categoria não junta nada: é outra tag', async () => {
      await go('tags');
      tagIn('Viagens!', 'Ideia').querySelector<HTMLButtonElement>('[aria-label="Renomear a tag Ideia em Viagens!"]')!.click();
      await settle();
      el.querySelector<HTMLInputElement>('.tag-nome input')!.value = 'bug';
      submit(el.querySelector<HTMLFormElement>('.tag-nome')!);
      await settle();
      expect(asked).toEqual([]);
      expect(notes()[0].tags).toEqual(['bug']);
    });

    it('apagar a tag pergunta antes e tira a tag só das anotações da categoria', async () => {
      settings.setTagColor('Ideia', 'verde', 'Roadmap site');
      await go('tags');
      tagIn('Roadmap site', 'ideia').querySelector<HTMLButtonElement>('[aria-label="Apagar a tag ideia de Roadmap site"]')!.click();
      await settle();
      expect(asked[0].title).toBe('Apagar a tag ideia de Roadmap site?');
      expect(asked[0].text).toContain('1 anotação usa esta tag em Roadmap site');
      expect(notes().filter((r) => r.tags?.some((t) => t.toLowerCase() === 'ideia')).map((r) => r.category)).toEqual(['Viagens!']);
      expect(settings.tagColor('Ideia', 'Roadmap site')).toBeUndefined();
      expect(Array.from(group('Roadmap site').querySelectorAll('.tags > li app-note-tag')).map((t) => t.textContent!.trim())).toEqual(['bug', 'urgente']);
      expect(el.querySelector('.aviso')!.textContent).toContain('Em Roadmap site, ideia foi apagada em 1 anotação.');
    });

    describe('os assuntos', () => {
      const subjectGroup = (label: string) =>
        Array.from(el.querySelectorAll<HTMLElement>('.assuntos-grupo')).find((g) => g.querySelector('.tags-cat .orelha')!.textContent!.trim() === label)!;
      const subjectNames = (label: string) => Array.from(subjectGroup(label).querySelectorAll('.assunto-nome')).map((n) => n.textContent!.trim());
      const subjectRow = (cat: string, label: string) =>
        Array.from(subjectGroup(cat).querySelectorAll<HTMLElement>('li.assunto')).find((li) => li.querySelector('.assunto-nome')?.textContent!.trim() === label)!;

      beforeEach(() => {
        const store = TestBed.inject(ReviewStore);
        const [a, b] = store.notes().filter((r) => r.category === 'Roadmap site');
        store.update({ ...a, subject: 'Kanban' }, a);
        store.update({ ...b, subject: 'kanban' }, b);
      });

      it('cada grupo com os seus (também os sem nenhum); criar um novo deixa ele à mão antes de alguma anotação usar', async () => {
        await go('assuntos');
        expect(el.querySelector('h3')!.textContent).toBe('Assuntos');
        expect(subjectNames('Roadmap site')).toEqual(['Kanban']);
        expect(subjectRow('Roadmap site', 'Kanban').querySelector('.cat-n')!.textContent!.trim()).toBe('2 anotações');
        expect(subjectNames('Receitas')).toEqual([]);
        const form = subjectGroup('Receitas').querySelector<HTMLFormElement>('form.novo-assunto')!;
        form.querySelector('input')!.value = '  doces ';
        submit(form);
        await settle();
        expect(settings.notesConfig().subjects['receitas']).toEqual(['Doces']);
        expect(subjectNames('Receitas')).toEqual(['Doces']);
        expect(subjectRow('Receitas', 'Doces').querySelector('.cat-n')!.textContent!.trim()).toBe('Ainda em nenhuma');
        expect(el.querySelector('.aviso')!.textContent).toContain('Doces entrou nos assuntos de Receitas.');
        // o mesmo nome de novo não repete
        form.querySelector('input')!.value = 'DOCES';
        submit(form);
        await settle();
        expect(settings.notesConfig().subjects['receitas']).toEqual(['Doces']);
        expect(el.querySelector('.aviso')!.textContent).toContain('Receitas já tem o assunto Doces.');
      });

      it('renomear muda as anotações do grupo (as duas grafias); apagar pergunta quando alguma usa', async () => {
        await go('assuntos');
        subjectRow('Roadmap site', 'Kanban').querySelector<HTMLButtonElement>('[data-assunto-lapis]')!.click();
        await settle();
        const field = subjectGroup('Roadmap site').querySelector<HTMLInputElement>('[data-assunto-campo]')!;
        field.value = 'Quadro';
        submit(field.closest('form')!);
        await settle();
        expect(notes().filter((r) => r.subject === 'Quadro').length).toBe(2);
        expect(el.querySelector('.aviso')!.textContent).toContain('Em Roadmap site, Kanban virou Quadro em 2 anotações.');
        answer = false;
        subjectRow('Roadmap site', 'Quadro').querySelector<HTMLButtonElement>('.apagar-tag')!.click();
        await settle();
        expect(asked.at(-1)!.title).toBe('Apagar o assunto Quadro de Roadmap site?');
        expect(notes().filter((r) => r.subject === 'Quadro').length).toBe(2);
        answer = true;
        subjectRow('Roadmap site', 'Quadro').querySelector<HTMLButtonElement>('.apagar-tag')!.click();
        await settle();
        expect(notes().some((r) => !!r.subject)).toBeFalse();
        expect(subjectNames('Roadmap site')).toEqual([]);
      });

      it('no painel do grupo, a lista dos assuntos e o caminho para a parte Assuntos', async () => {
        await go('categorias');
        const row = await openCat('Roadmap site');
        expect(row.querySelector('.assuntos-resumo .nome-dica')!.textContent!.trim()).toBe('Kanban.');
        row.querySelector<HTMLButtonElement>('.assuntos-resumo .link')!.click();
        await settle();
        expect(tab('assuntos').getAttribute('aria-selected')).toBe('true');
        expect(document.activeElement?.getAttribute('data-novo-assunto')).toBe('roadmap site');
      });
    });
  });

  it('na tela, a categoria da anotação se chama grupo, em todas as partes', async () => {
    // o texto e o que o leitor de tela lê (aria-label, placeholder, title)
    const said = () =>
      [el.textContent, ...Array.from(el.querySelectorAll('[aria-label], [placeholder], [title]')).flatMap((n) => ['aria-label', 'placeholder', 'title'].map((a) => n.getAttribute(a) ?? ''))].join(' ');
    for (const part of ['padroes', 'categorias', 'assuntos', 'tags']) {
      await go(part);
      if (part === 'categorias') {
        el.querySelector<HTMLButtonElement>('.cat-abre')!.click();
        await fixture.whenStable();
      }
      expect(said()).not.toMatch(/categori/i);
    }
    await go('categorias');
    expect(el.querySelector('h3')!.textContent).toBe('Grupos');
    expect(tab('categorias').textContent).toContain('Grupos');
  });

  it('fechar avisa quem abriu', async () => {
    el.querySelector<HTMLButtonElement>('.icon-btn')!.click();
    await fixture.whenStable();
    for (let i = 0; i < 20 && !closed; i++) await new Promise((r) => setTimeout(r, 10));
    expect(closed).toBe(1);
    expect(el.querySelector('dialog')!.open).toBeFalse();
  });
});
