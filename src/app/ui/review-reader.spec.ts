import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, DeferBlockState, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Cloud } from '../core/cloud-config';
import { CloudAccount } from '../core/cloud-account';
import { Comments } from '../core/comments';
import { FeedItem, Follow, People } from '../core/follow';
import { LocalData } from '../core/local-data';
import { Review, sanitizeReview } from '../core/review';
import { ReviewReader } from './review-reader';

/**
 * A leitura da ficha e a porta dos comentários: quando a orelha e o "Comentar" aparecem, a folha que
 * abre ao lado (e fecha), a ficha que já abre nos comentários, o "Citar" de um trecho selecionado e o
 * aviso antes dos comentários de uma ficha em segredo. A nuvem é de mentira; o serviço é o de verdade.
 */

class MemoryData {
  private readonly map = new Map<string, string>();
  readonly where = 'local';
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  onExternalChange(): void {
    /* sem outras abas */
  }
  takeForeign(): null {
    return null;
  }
}

const ME = { id: 'u-eu', codigo: 'EEEE-0000', nome: 'Eu' };
const ANA = 'AAAA-1111';

function review(id: string, name: string, extra: Partial<Review> = {}): Review {
  return sanitizeReview({
    id,
    kind: 'jogos',
    game: { name, coverUrl: null, source: 'manual' },
    scores: { historia: 8, diversao: 8, jogabilidade: 8, visual: 8 },
    status: 'finalizado',
    difficulty: 'nenhuma',
    verdict: null,
    text: 'Valeu cada hora, mesmo com o final corrido.',
    completedAt: '2026-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  })!;
}

describe('A leitura e os comentários (ReviewReader)', () => {
  /** Quantos comentários a nuvem diz que cada ficha tem, por dono. */
  let counts: Record<string, Record<string, number>>;
  let signedIn: ReturnType<typeof signal<boolean>>;
  let fixture: ComponentFixture<ReviewReader>;
  let el: HTMLElement;

  const wait = (ms = 0) => new Promise((res) => setTimeout(res, ms));
  /** Espera a nuvem de mentira responder e a tela se acertar (e o pedaço dos comentários chegar). */
  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await wait();
      fixture.detectChanges();
      for (const block of await fixture.getDeferBlocks()) await block.render(DeferBlockState.Complete).catch(() => undefined);
      await fixture.whenStable();
    }
  }

  beforeEach(() => {
    localStorage.clear();
    counts = { [ANA]: {}, [ME.codigo]: {} };
    signedIn = signal(true);
    const people = signal<People | null>({ seguindo: [{ codigo: ANA, nome: 'Ana', desde: '2026-01-01T00:00:00.000Z', silenciado: false, rev: 1, meSegue: true }], seguidores: [] });
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: LocalData, useClass: MemoryData },
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: signal({ api: 'https://api.teste', googleClientId: 'x' }) } },
        {
          provide: CloudAccount,
          useValue: {
            account: signal(ME),
            signedIn,
            request: async (path: string) => {
              const wall = /^\/v1\/murais\/([\w-]+)\/comentarios$/.exec(path);
              if (wall) return { contagem: counts[wall[1]] ?? {}, quem: 'seguidores', pode: true };
              if (/\/comentarios\/[\w-]+$/.test(path)) return { comentarios: [], maisAntigos: false, quem: 'seguidores', pode: true };
              return { reacoes: {} };
            },
          },
        },
        { provide: Follow, useValue: { items: signal<FeedItem[]>([]), people, follow: async () => undefined } },
      ],
    });
    fixture = TestBed.createComponent(ReviewReader);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    el.querySelector('dialog')?.close();
    getSelection()?.removeAllRanges();
    localStorage.clear();
  });

  const q = <T extends HTMLElement>(selector: string) => el.querySelector<T>(selector);
  const side = () => q('#leitura-comentarios');
  const dialog = () => el.querySelector('dialog')!;
  /** Fecha a leitura e espera o `close` do diálogo (ele chega depois, e esvazia a leitura). */
  const closeReader = async () => {
    const closed = new Promise((res) => dialog().addEventListener('close', res, { once: true }));
    dialog().close();
    await closed;
  };

  it('na ficha de outra pessoa, com a conta aberta: a orelha e o "Comentar"; a folha abre ao lado e fecha', async () => {
    fixture.componentInstance.open(review('r-hades', 'Hades'), 'Ana', [], false, ANA);
    await settle();
    expect(q('.orelha')?.getAttribute('aria-label')).toBe('Comentários');
    expect(q('.comentar')?.textContent?.trim()).toBe('Comentar');
    expect(side()).toBeNull();
    expect(dialog().classList.contains('com-lado')).toBeFalse();

    q<HTMLButtonElement>('.comentar')!.click();
    await settle();
    expect(side()).not.toBeNull();
    expect(dialog().classList.contains('com-lado')).toBeTrue();
    expect(q('.orelha')!.getAttribute('aria-expanded')).toBe('true');
    // a folha em si: o título, a conversa (vazia) e o campo de uma linha
    expect(q('app-comments-panel h2')?.textContent).toContain('Comentários');
    expect(q('app-comments-panel .vazio')?.textContent?.trim()).toContain('Ninguém comentou ainda.');
    expect(q('app-comments-panel .abrir')).not.toBeNull();

    q<HTMLButtonElement>('.fecha-lado')!.click();
    await settle();
    expect(side()).toBeNull();
    expect(q('.orelha')!.getAttribute('aria-expanded')).toBe('false');
    // a orelha abre de novo
    q<HTMLButtonElement>('.orelha')!.click();
    await settle();
    expect(side()).not.toBeNull();
  });

  describe('fechar a folha não rola a ficha', () => {
    /** Uma ficha comprida, que rola: o "Comentar" fica lá no fim do texto, fora de vista. */
    const long = () => review('r-longa', 'Hades', { text: Array.from({ length: 60 }, (_, i) => `Linha ${i + 1} de uma resenha comprida.`).join('\n') });
    const body = () => q('.par > article .body')!;

    async function openSheetAtTop(door: '.orelha' | '.comentar'): Promise<void> {
      fixture.componentInstance.open(long(), 'Ana', [], false, ANA);
      await settle();
      expect(body().scrollHeight).toBeGreaterThan(body().clientHeight + 200);
      q<HTMLButtonElement>(door)!.click();
      await settle();
      expect(side()).not.toBeNull();
      body().scrollTop = 0;
    }

    it('pela orelha (o bug: a ficha descia até o fim)', async () => {
      await openSheetAtTop('.orelha');
      q<HTMLButtonElement>('.orelha')!.click();
      await settle();
      expect(side()).toBeNull();
      expect(body().scrollTop).toBe(0);
    });

    it('pelo X da folha, e pelo "Voltar para a ficha"', async () => {
      await openSheetAtTop('.orelha');
      q<HTMLButtonElement>('.fecha-lado')!.click();
      await settle();
      expect(body().scrollTop).toBe(0);

      q<HTMLButtonElement>('.orelha')!.click();
      await settle();
      body().scrollTop = 120;
      q<HTMLButtonElement>('.volta-ficha')!.click();
      await settle();
      expect(side()).toBeNull();
      expect(body().scrollTop).toBe(120);
    });

    it('o foco volta para quem abriu a folha, sem rolar; quem fechou pela própria porta fica com ele', async () => {
      // abriu pelo "Comentar" (com a ficha rolada até ele) e fechou pelo X: o foco volta para o "Comentar"
      fixture.componentInstance.open(long(), 'Ana', [], false, ANA);
      await settle();
      const comentar = q<HTMLButtonElement>('.comentar')!;
      comentar.scrollIntoView({ block: 'center' });
      const at = body().scrollTop;
      comentar.focus();
      comentar.click();
      await settle();
      const close = q<HTMLButtonElement>('.fecha-lado')!;
      close.focus();
      close.click();
      await settle();
      expect(document.activeElement).toBe(comentar);
      expect(body().scrollTop).toBe(at);

      // abriu e fechou pela mesma porta: o foco não sai dela
      comentar.click();
      await settle();
      comentar.focus();
      comentar.click();
      await settle();
      expect(side()).toBeNull();
      expect(document.activeElement).toBe(comentar);
    });
  });

  it('a orelha e o botão dizem quantos comentários a ficha tem', async () => {
    counts[ANA] = { 'r-hades': 3 };
    fixture.componentInstance.open(review('r-hades', 'Hades'), 'Ana', [], false, ANA);
    await settle();
    expect(q('.orelha-n')?.textContent).toBe('3');
    expect(q('.orelha')!.getAttribute('aria-label')).toBe('Comentários: 3');
    expect(q('.comentar')?.textContent?.trim()).toBe('3 comentários');
  });

  it('sem conta: a porta só existe se há o que ler', async () => {
    signedIn.set(false);
    fixture.componentInstance.open(review('r-hades', 'Hades'), 'Ana', [], false, ANA);
    await settle();
    expect(q('.orelha')).toBeNull();
    expect(q('.comentar')).toBeNull();
    await closeReader();

    counts[ANA] = { 'r-celeste': 1 };
    await TestBed.inject(Comments).loadCounts(ANA, true);
    fixture.componentInstance.open(review('r-celeste', 'Celeste'), 'Ana', [], false, ANA);
    await settle();
    expect(q('.orelha-n')?.textContent).toBe('1');
  });

  it('na sua ficha: a porta para comentar, mesmo sem comentários; com eles, a contagem; a privada nunca tem', async () => {
    counts[ME.codigo] = { 'r-comentada': 2, 'r-privada': 4 };
    // o pedido de quando a conta entrou (ainda sem comentários) termina primeiro; aí, o de agora
    await settle();
    await TestBed.inject(Comments).loadCounts(ME.codigo, true);
    const reader = fixture.componentInstance;
    reader.open(review('r-quieta', 'Celeste'));
    await settle();
    expect(q('.orelha')?.getAttribute('aria-label')).toBe('Comentários');
    expect(q('.comentar')?.textContent?.trim()).toBe('Comentar');
    q<HTMLButtonElement>('.comentar')!.click();
    await settle();
    expect(side()).not.toBeNull();
    // o dono escreve o primeiro: o campo está lá, e a folha ensina a citar
    expect(q('app-comments-panel .abrir')).not.toBeNull();
    expect(q('app-comments-panel .vazio')?.textContent).toContain('selecione o texto da ficha');
    await closeReader();

    reader.open(review('r-comentada', 'Hades'));
    await settle();
    expect(q('.orelha-n')?.textContent).toBe('2');
    expect(q('.comentar')?.textContent?.trim()).toBe('2 comentários');
    await closeReader();

    reader.open(review('r-privada', 'Segredo', { private: true }));
    await settle();
    expect(q('.orelha')).toBeNull();
    expect(q('.comentar')).toBeNull();
  });

  it('uma ficha sem código (um backup aberto em Comparar) não tem comentários', async () => {
    fixture.componentInstance.open(review('r-hades', 'Hades'), 'Ana');
    await settle();
    expect(q('.orelha')).toBeNull();
    expect(q('.comentar')).toBeNull();
  });

  it('pediram a ficha já com os comentários (o remendo da ficha): ela abre com a folha, e só dessa vez', async () => {
    const reader = fixture.componentInstance;
    TestBed.inject(Comments).want('r-hades');
    reader.open(review('r-hades', 'Hades'), 'Ana', [], false, ANA);
    await settle();
    expect(side()).not.toBeNull();
    await closeReader();
    reader.open(review('r-hades', 'Hades'), 'Ana', [], false, ANA);
    await settle();
    expect(side()).toBeNull();
  });

  it('selecionar um trecho do texto mostra o "Citar"; tocar abre a folha com a citação no campo', async () => {
    fixture.componentInstance.open(review('r-hades', 'Hades'), 'Ana', [], false, ANA);
    await settle();
    expect(q('.citar')).toBeNull();
    const zone = q('[data-citavel]')!;
    zone.scrollIntoView({ block: 'center' });
    const walker = document.createTreeWalker(zone, NodeFilter.SHOW_TEXT);
    let node: Node | null = null;
    while (walker.nextNode()) if (walker.currentNode.textContent?.includes('Valeu cada hora')) node = walker.currentNode;
    const start = node!.textContent!.indexOf('Valeu cada hora');
    const range = document.createRange();
    range.setStart(node!, start);
    range.setEnd(node!, start + 'Valeu cada hora'.length);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    await wait(260);
    fixture.detectChanges();
    const cite = q<HTMLButtonElement>('.citar')!;
    expect(cite.textContent?.trim()).toBe('Citar');

    cite.click();
    await settle();
    await wait(20);
    fixture.detectChanges();
    expect(q('.citar')).toBeNull();
    expect(side()).not.toBeNull();
    expect(q<HTMLTextAreaElement>('app-comments-panel textarea')?.value).toBe('> Valeu cada hora\n');
    expect(getSelection()!.isCollapsed).toBeTrue();
  });

  it('uma seleção fora do texto da ficha (o título) não oferece o "Citar"', async () => {
    fixture.componentInstance.open(review('r-hades', 'Hades'), 'Ana', [], false, ANA);
    await settle();
    const range = document.createRange();
    range.selectNodeContents(q('#leitura-titulo')!);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    await wait(260);
    fixture.detectChanges();
    expect(q('.citar')).toBeNull();
  });

  it('a ficha em segredo avisa antes de mostrar os comentários, e não oferece o "Citar"', async () => {
    counts[ANA] = { 'r-hades': 2 };
    fixture.componentInstance.open(review('r-hades', 'Hades'), 'Ana', [], true, ANA);
    await settle();
    expect(q('[data-citavel]')).toBeNull();
    q<HTMLButtonElement>('.orelha')!.click();
    await settle();
    expect(q('.guarda')?.textContent).toContain('Os comentários podem contar');
    expect(q('app-comments-panel')).toBeNull();
    q<HTMLButtonElement>('.guarda .btn-ink')!.click();
    await settle();
    expect(q('.guarda')).toBeNull();
    expect(q('app-comments-panel')).not.toBeNull();
  });
});
