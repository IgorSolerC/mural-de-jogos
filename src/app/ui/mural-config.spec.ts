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
  const rows = () => Array.from(el.querySelectorAll('.cat app-cat-label .nome')).map((n) => n.textContent!.trim());
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
    segment(el, 'Cor da mãe').click();
    await fixture.whenStable();
    expect(settings.notesConfig().audience).toBe('visivel');
    expect(settings.notesConfig().subColor).toBe('mae');
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
    expect(el.querySelector('h3')!.textContent).toBe('Categorias');
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

  it('lista as tags da mais usada para a menos, e a cor muda na hora em toda anotação', async () => {
    await go('tags');
    expect(el.querySelector('h3')!.textContent).toBe('Tags');
    const items = () => Array.from(el.querySelectorAll('.tags > li'));
    expect(items().map((li) => li.querySelector('app-note-tag')!.textContent!.trim())).toEqual(['urgente', 'Ideia', 'bug']);
    expect(items().map((li) => li.querySelector('.cat-n')!.textContent!.trim())).toEqual(['3 anotações', '2 anotações', '1 anotação']);
    const second = items()[1];
    expect(second.querySelector('app-note-tag')!.classList).not.toContain('cor');
    expect(second.querySelector('[role="radiogroup"]')!.getAttribute('aria-label')).toBe('Cor da tag Ideia');
    expect(second.querySelector('[aria-label="Sem cor"]')!.getAttribute('aria-checked')).toBe('true');
    second.querySelector<HTMLButtonElement>('[aria-label="Verde"]')!.click();
    await fixture.whenStable();
    expect(settings.tagColor('ideia')).toBe('verde');
    expect(settings.categoryLooks()['#ideia']).toEqual({ color: 'verde' });
    expect(second.querySelector('app-note-tag')!.classList).toContain('cor');
    expect(second.querySelector('[aria-label="Verde"]')!.getAttribute('aria-checked')).toBe('true');
    // Sem cor volta ao papel pardo de sempre
    second.querySelector<HTMLButtonElement>('[aria-label="Sem cor"]')!.click();
    await fixture.whenStable();
    expect(settings.tagColor('Ideia')).toBeUndefined();
    expect(second.querySelector('app-note-tag')!.classList).not.toContain('cor');
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
      expect(asked[0].title).toBe('Apagar a categoria Roadmap site?');
      expect(asked[0].text).toContain('2 anotações usam esta categoria');
      expect(notes().filter((r) => r.category === 'Roadmap site').length).toBe(2);
      answer = true;
      row.querySelector<HTMLButtonElement>('.apagar')!.click();
      await settle();
      expect(notes().filter((r) => !r.category).length).toBe(3);
      expect(settings.categoryLooks()['roadmap site']).toBeUndefined();
      expect(rows()).toEqual(['Viagens!', 'Receitas']);
      expect(el.querySelector('.aviso')!.textContent).toContain('Roadmap site foi apagada em 2 anotações.');
    });

    it('renomear a tag pelo lápis muda todas as anotações, a cor e as fixas; Esc desiste', async () => {
      settings.setTagColor('urgente', 'vermelho');
      settings.togglePinnedTag('Urgente');
      await go('tags');
      tagRow('urgente').querySelector<HTMLButtonElement>('[aria-label="Renomear a tag urgente"]')!.click();
      await settle();
      let field = el.querySelector<HTMLInputElement>('.tag-nome input')!;
      expect(document.activeElement).toBe(field);
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await settle();
      expect(el.querySelector('.tag-nome')).toBeNull();
      expect(el.querySelector('dialog')!.open).toBeTrue();
      tagRow('urgente').querySelector<HTMLButtonElement>('[aria-label="Renomear a tag urgente"]')!.click();
      await settle();
      field = el.querySelector<HTMLInputElement>('.tag-nome input')!;
      field.value = 'Prioridade';
      submit(el.querySelector<HTMLFormElement>('.tag-nome')!);
      await settle();
      expect(notes().filter((r) => r.tags?.includes('Prioridade')).length).toBe(3);
      expect(notes().some((r) => r.tags?.some((t) => t.toLowerCase() === 'urgente'))).toBeFalse();
      expect(settings.tagColor('Prioridade')).toBe('vermelho');
      expect(settings.tagColor('urgente')).toBeUndefined();
      expect(settings.pinnedTags()).toEqual(['Prioridade']);
      expect(el.querySelector('.aviso')!.textContent).toContain('urgente virou Prioridade em 3 anotações.');
      // o foco volta para o lápis da tag, com o nome novo
      expect(document.activeElement?.getAttribute('aria-label')).toBe('Renomear a tag Prioridade');
    });

    it('a tag com o nome de outra junta as duas, sem repetir na mesma anotação', async () => {
      await go('tags');
      tagRow('bug').querySelector<HTMLButtonElement>('[aria-label="Renomear a tag bug"]')!.click();
      await settle();
      el.querySelector<HTMLInputElement>('.tag-nome input')!.value = 'URGENTE';
      submit(el.querySelector<HTMLFormElement>('.tag-nome')!);
      await settle();
      expect(asked[0].title).toBe('Juntar com urgente?');
      expect(notes().find((r) => r.category === 'Roadmap site' && r.tags?.includes('urgente'))!.tags).toEqual(['urgente']);
    });

    it('apagar a tag pergunta antes e tira a tag de todas as anotações', async () => {
      settings.setTagColor('Ideia', 'verde');
      await go('tags');
      tagRow('Ideia').querySelector<HTMLButtonElement>('[aria-label="Apagar a tag Ideia"]')!.click();
      await settle();
      expect(asked[0].title).toBe('Apagar a tag Ideia?');
      expect(asked[0].text).toContain('2 anotações usam esta tag');
      expect(notes().some((r) => r.tags?.some((t) => t.toLowerCase() === 'ideia'))).toBeFalse();
      expect(notes().filter((r) => r.tags?.length).length).toBe(3);
      expect(settings.tagColor('Ideia')).toBeUndefined();
      expect(Array.from(el.querySelectorAll('.tags > li app-note-tag')).map((t) => t.textContent!.trim())).toEqual(['urgente', 'bug']);
    });
  });

  it('fechar avisa quem abriu', async () => {
    el.querySelector<HTMLButtonElement>('.icon-btn')!.click();
    await fixture.whenStable();
    for (let i = 0; i < 20 && !closed; i++) await new Promise((r) => setTimeout(r, 10));
    expect(closed).toBe(1);
    expect(el.querySelector('dialog')!.open).toBeFalse();
  });
});
