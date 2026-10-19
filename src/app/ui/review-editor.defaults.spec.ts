import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Cloud } from '../core/cloud-config';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { CheckedAnswer, CheckedOptions, Confirm } from './confirm';
import { ReviewEditor } from './review-editor';

function note(id: string, name: string, extra: Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id,
    kind: 'anotacoes',
    game: { name, coverUrl: null, source: 'manual' },
    scores: { final: 0 },
    status: 'finalizado',
    stock: 'verde',
    text: '',
    completedAt: '2026-10-01',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...extra,
  })!;
}

/**
 * As configurações do mural de anotações no editor: a anotação nova nasce como o mural (ou a
 * categoria dela) manda, a anotação de um link fica no grupo de onde veio, e a categoria pede ou dispensa a
 * pergunta da tag. O exemplo do pedido: tudo privado, mas "Roadmap site" Disponível e "Viagens!" Publicar.
 */
describe('o editor segue as configurações do mural', () => {
  let fixture: ComponentFixture<ReviewEditor>;
  let el: HTMLElement;
  let store: ReviewStore;
  let settings: Settings;
  let asked: { options: CheckedOptions; answer: (a: CheckedAnswer) => void }[];
  type Inside = {
    noteCategory: { (): string | null; set(v: string | null): void };
    preview(): { noteRank?: string };
    noteTags: { set(v: string[]): void };
    stock(): string;
    save(e: Event | null): void;
  };
  const inside = () => fixture.componentInstance as unknown as Inside;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ReviewEditor], providers: [provideZonelessChangeDetection()] });
    TestBed.inject(Cloud).config.set({ api: 'https://api.teste', googleClientId: 'x.apps.googleusercontent.com' });
    store = TestBed.inject(ReviewStore);
    settings = TestBed.inject(Settings);
    settings.askNoCategory.set(false);
    settings.askNoTag.set(false);
    settings.setCategoryPrefs('Roadmap site', { audience: 'visivel' });
    settings.setCategoryPrefs('Viagens!', { audience: 'publicar' });
    asked = [];
    spyOn(TestBed.inject(Confirm), 'askChecked').and.callFake(
      (options: CheckedOptions) => new Promise<CheckedAnswer>((answer) => asked.push({ options, answer })),
    );
    fixture = TestBed.createComponent(ReviewEditor);
    document.body.appendChild(fixture.nativeElement);
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.nativeElement.remove();
    localStorage.clear();
  });

  const block = () => el.querySelector<HTMLFieldSetElement>('fieldset:has(input[name="editor-quem"])')!;
  const chosen = () => Array.from(block().querySelectorAll<HTMLLabelElement>('label.quem')).find((l) => l.querySelector('input')!.checked)!.textContent!.trim();
  const choose = async (label: string) => {
    Array.from(block().querySelectorAll<HTMLLabelElement>('label.quem'))
      .find((l) => l.textContent!.includes(label))!
      .querySelector('input')!
      .click();
    await fixture.whenStable();
  };
  const hint = () => el.querySelector('#editor-quem-dica')!.textContent!.trim();
  const titled = (name: string) => store.notes().find((n) => n.game.name === name)!;
  const saveAndWait = async () => {
    const dialog = el.querySelector('dialog')!;
    const closeEvent = new Promise((r) => dialog.addEventListener('close', r, { once: true }));
    inside().save(null);
    await closeEvent;
    await fixture.whenStable();
  };
  const typeTitle = async (name: string) => {
    const input = el.querySelector<HTMLInputElement>('#editor-titulo-nota')!;
    input.value = name;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };

  it('sem categoria, nasce como o mural: privada', async () => {
    fixture.componentInstance.open(undefined, undefined, undefined, undefined, 'anotacoes');
    await fixture.whenStable();
    expect(chosen()).toBe('Privado');
  });

  it('numa aba de "Roadmap site", nasce Disponível: pública, fora do Feed, e a setinha publica', async () => {
    fixture.componentInstance.openInCategory('Roadmap site');
    await fixture.whenStable();
    expect(chosen()).toBe('Público');
    expect(hint()).toContain('sem aparecer no Feed');
    await typeTitle('Próximos passos');
    await saveAndWait();
    const saved = titled('Próximos passos');
    expect(saved.private).toBeUndefined();
    expect(saved.quiet).toBeTrue();
  });

  it('"Viagens!" nasce publicada: vai para o Feed', async () => {
    fixture.componentInstance.openInCategory('Viagens!');
    await fixture.whenStable();
    expect(chosen()).toBe('Público');
    expect(hint()).toContain('aparece no Feed');
    await typeTitle('Lisboa');
    await saveAndWait();
    const saved = titled('Lisboa');
    expect(saved.private).toBeUndefined();
    expect(saved.quiet).toBeUndefined();
  });

  it('escolher a categoria no editor muda como ela nasce, até a pessoa escolher à mão', async () => {
    fixture.componentInstance.open(undefined, undefined, undefined, undefined, 'anotacoes');
    await fixture.whenStable();
    inside().noteCategory.set('viagens!');
    await fixture.whenStable();
    expect(chosen()).toBe('Público');
    inside().noteCategory.set('Receitas');
    await fixture.whenStable();
    expect(chosen()).toBe('Privado');
    // escolhida à mão, a categoria não muda mais
    await choose('Público');
    inside().noteCategory.set('Roadmap site');
    await fixture.whenStable();
    inside().noteCategory.set('Receitas');
    await fixture.whenStable();
    expect(chosen()).toBe('Público');
  });

  it('o mural inteiro pode nascer publicado; editar uma anotação não muda nada', async () => {
    settings.setNotesConfig({ audience: 'publicar' });
    fixture.componentInstance.open(undefined, undefined, undefined, undefined, 'anotacoes');
    await fixture.whenStable();
    expect(chosen()).toBe('Público');
    const old = note('nantiga1', 'Antiga', { category: 'Viagens!', private: true });
    store.add(old);
    fixture.componentInstance.open(store.get('nantiga1'));
    await fixture.whenStable();
    expect(chosen()).toBe('Privado');
  });

  it('a anotação criada por um link dentro de outra é comum, no mesmo grupo dela, e nasce como o grupo manda', async () => {
    const mother = note('nmae0001', 'Roteiro', { category: 'Viagens!', stock: 'lilas' });
    store.add(mother);
    settings.setCategoryPrefs('Viagens!', { audience: 'publicar' });
    fixture.componentInstance.openNote('Hotel', store.get('nmae0001'));
    await fixture.whenStable();
    expect(inside().noteCategory()).toBe('Viagens!');
    expect(inside().preview().noteRank).toBeUndefined();
    expect(chosen()).toBe('Público');
    // fechar sem mexer não pergunta se quer descartar
    expect(fixture.componentInstance['serialize']()).toBe(fixture.componentInstance['snapshot']);
  });

  it('a categoria pode dispensar a pergunta da tag, ou pedir mesmo com o mural sem ela', async () => {
    settings.askNoTag.set(true);
    settings.setCategoryPrefs('Viagens!', { askTag: false });
    settings.setCategoryPrefs('Trabalho', { askTag: true });
    fixture.componentInstance.openInCategory('Viagens!');
    await fixture.whenStable();
    await typeTitle('Sem tag 1');
    await saveAndWait();
    expect(asked.length).toBe(0);

    settings.askNoTag.set(false);
    fixture.componentInstance.openInCategory('Trabalho');
    await fixture.whenStable();
    await typeTitle('Sem tag 2');
    inside().save(null);
    await fixture.whenStable();
    expect(asked.length).toBe(1);
    expect(asked[0].options.title).toBe('Sem tag');
    // "Nunca mais me perguntar isso": a categoria deixa de pedir; o mural continua como estava
    asked[0].answer({ ok: true, checked: true });
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    expect(settings.notesConfig().categories['trabalho']).toEqual({ askTag: false });
    expect(settings.askNoTag()).toBeFalse();
  });
});
