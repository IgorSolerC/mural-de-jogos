import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Desk } from '../core/desk';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { SharedEntry, SharedStore } from '../core/shared-store';
import { ReviewEditor } from './review-editor';
import { nextClose } from '../testing/dialog-close.spec';

const T0 = '2026-10-01T10:00:00.000Z';

function item(id: string, kind: 'anotacoes' | 'jogos', extra: Record<string, unknown> = {}): Review {
  const scores = kind === 'jogos' ? { historia: 8, diversao: 8, jogabilidade: 8, visual: 8 } : { final: 0 };
  const raw = { kind, game: { name: `Ficha ${id}`, coverUrl: null, source: 'manual' }, scores, weights: {}, bonuses: [], status: 'finalizado', difficulty: 'nenhuma', verdict: null, text: '', completedAt: '2026-10-01', createdAt: T0, updatedAt: T0, ...extra };
  return { ...sanitizeReview(raw)!, id };
}

/**
 * Apagar a ficha de dentro do editor (pedido do dono: antes, só lendo): no canto esquerdo do pé, sem fundo,
 * com a tinta vermelha e o ícone do "Mais" da leitura, na anotação e na análise. A pergunta e o Desfazer são
 * os da leitura (o `Desk`); o editor só fecha depois de a pessoa confirmar.
 */
describe('o editor: apagar a ficha pelo pé', () => {
  let fixture: ComponentFixture<ReviewEditor>;
  let store: ReviewStore;
  let removed: string[];
  let closed: number;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ReviewEditor], providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(ReviewStore);
    removed = [];
    spyOn(TestBed.inject(Desk), 'removeReview').and.callFake((id: string) => removed.push(id));
    fixture = TestBed.createComponent(ReviewEditor);
    document.body.appendChild(fixture.nativeElement);
    closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.nativeElement.remove();
    localStorage.clear();
  });

  const el = () => fixture.nativeElement as HTMLElement;
  const button = () => el().querySelector<HTMLButtonElement>('.foot .apagar');
  const text = (b: Element | null) => b?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const open = async (r?: Review) => {
    fixture.componentInstance.open(r);
    await fixture.whenStable();
  };

  it('a anotação no mural: "Apagar anotação", o primeiro do pé, à esquerda do pregar, sem fundo e em vermelho', async () => {
    store.add(item('nmercado', 'anotacoes'));
    await open(store.get('nmercado'));
    const b = button()!;
    expect(text(b)).toBe('Apagar anotação');
    expect(b.querySelector('lucide-icon')).not.toBeNull();
    expect(el().querySelector('.foot')!.firstElementChild).toBe(b);
    const pin = el().querySelector<HTMLElement>('.foot .pregar')!;
    expect(b.getBoundingClientRect().right).toBeLessThan(pin.getBoundingClientRect().left);
    const style = getComputedStyle(b);
    expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    const [r, g, bl] = style.color.match(/\d+/g)!.map(Number);
    expect(r).toBeGreaterThan(g + 60);
    expect(r).toBeGreaterThan(bl + 60);
  });

  it('a análise também: "Remover do mural", como no "Mais" da leitura', async () => {
    store.add(item('jzelda', 'jogos'));
    await open(store.get('jzelda'));
    expect(text(button())).toBe('Remover do mural');
  });

  it('a ficha nova (ainda fora do mural) não tem o que apagar', async () => {
    await open();
    expect(button()).toBeNull();
    fixture.componentInstance.openNote('Ainda não pregada');
    await fixture.whenStable();
    expect(button()).toBeNull();
  });

  it('a compartilhada de outra pessoa: "Sair da anotação"; a do dono com gente nela: "Apagar para todos"', async () => {
    store.add(item('ncomp001', 'anotacoes'));
    store.add(item('ncomp002', 'anotacoes'));
    const shared = TestBed.inject(SharedStore);
    // a primeira é de outra pessoa (você edita); a segunda é sua, com duas pessoas nela
    const entries: Record<string, SharedEntry> = {
      ncomp001: { id: 'ncomp001', papel: 'editor', membros: [{}] } as unknown as SharedEntry,
      ncomp002: { id: 'ncomp002', papel: 'dono', membros: [{}, {}] } as unknown as SharedEntry,
    };
    spyOn(shared, 'get').and.callFake((id: string) => entries[id]);
    spyOn(shared, 'role').and.callFake((id: string) => entries[id]?.papel ?? null);
    await open(store.get('ncomp001'));
    expect(text(button())).toBe('Sair da anotação');
    await open(store.get('ncomp002'));
    expect(text(button())).toBe('Apagar para todos');
  });

  it('tocar pede para apagar pelo Desk, que pergunta; o editor só fecha quando a ficha sai (sem perguntar pelo que não foi salvo)', async () => {
    store.add(item('nmercado', 'anotacoes'));
    await open(store.get('nmercado'));
    // algo escrito e não salvo: sem a confirmação, nada fecha
    (fixture.componentInstance as unknown as { text: { set(v: string): void } }).text.set('Algo escrito e não salvo');
    await fixture.whenStable();
    button()!.click();
    await fixture.whenStable();
    expect(removed).toEqual(['nmercado']);
    expect(closed).toBe(0);
    expect(el().querySelector<HTMLDialogElement>('dialog')!.open).toBeTrue();
    // outra ficha saiu: este editor continua
    fixture.componentInstance.forget('outra');
    await fixture.whenStable();
    expect(closed).toBe(0);
    // confirmou: fecha direto, sem a pergunta de descartar
    const shut = nextClose(el().querySelector<HTMLDialogElement>('dialog')!);
    fixture.componentInstance.forget('nmercado');
    await shut;
    await fixture.whenStable();
    expect(closed).toBe(1);
    expect(el().querySelector<HTMLDialogElement>('dialog')!.open).toBeFalse();
  });
});
