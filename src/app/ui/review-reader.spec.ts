import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, DeferBlockState, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Cloud } from '../core/cloud-config';
import { CloudSync } from '../core/cloud-sync';
import { FichaLinks } from '../core/ficha-link';
import { CloudAccount } from '../core/cloud-account';
import { Comments } from '../core/comments';
import { FeedItem, Follow, People } from '../core/follow';
import { LocalData } from '../core/local-data';
import { Review, sanitizeReview } from '../core/review';
import { SHARED_AUTO, SharedEntry, SharedStore } from '../core/shared-store';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { nextClose } from '../testing/dialog-close.spec';
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
        { provide: SHARED_AUTO, useValue: false },
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
        { provide: Follow, useValue: { items: signal<FeedItem[]>([]), people, follow: async () => undefined, available: () => true, loadPeople: async () => people() } },
        { provide: CloudSync, useValue: { status: signal('ok'), lastSyncAt: signal(Date.parse('2026-02-01T00:00:00.000Z')) } },
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

  it('na sua ficha: a porta para comentar, mesmo sem comentários; com eles, a contagem; na privada também, dizendo que só você vê', async () => {
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

    reader.open(review('r-comentada', 'Hades'));
    await settle();
    q<HTMLButtonElement>('.comentar')!.click();
    await settle();
    // a ficha à mostra não tem recado de quem vê
    expect(q('app-comments-panel .recado')).toBeNull();
    await closeReader();

    reader.open(review('r-privada', 'Segredo', { private: true }));
    await settle();
    expect(q('.orelha-n')?.textContent).toBe('4');
    expect(q('.comentar')?.textContent?.trim()).toBe('4 comentários');
    q<HTMLButtonElement>('.comentar')!.click();
    await settle();
    expect(q('app-comments-panel .recado')?.textContent?.trim()).toBe('Ficha privada: só você vê os comentários.');
    expect(q('app-comments-panel .abrir')).not.toBeNull();
  });

  it('na anotação privada que a Ana compartilhou com você: os comentários são os da ficha dela, e a folha diz quem vê', async () => {
    counts[ANA] = { 'nota-1': 2 };
    const note = review('nota-1', 'Lista do mercado', { kind: 'anotacoes', private: true });
    const shared: SharedEntry = {
      id: 'nota-1',
      dono: { codigo: ANA, nome: 'Ana', foto: null },
      papel: 'leitor',
      membros: [{ codigo: ME.codigo, nome: ME.nome, foto: null, papel: 'leitor', desde: '' }],
      rev: 1,
      versao: 1,
      base: note,
      local: null,
      outra: null,
      resolver: false,
      conflito: null,
      atualizadoEm: note.updatedAt,
      atualizadoPor: null,
      pessoal: {},
      view: note,
    };
    TestBed.inject(SharedStore).entries.set(new Map([['nota-1', shared]]));
    fixture.componentInstance.open(note);
    await settle();
    expect(q('.orelha-n')?.textContent).toBe('2');
    q<HTMLButtonElement>('.comentar')!.click();
    await settle();
    expect(q('app-comments-panel .recado')?.textContent?.trim()).toBe('Anotação privada: só quem está nela vê os comentários.');
  });

  it('quem só lê a compartilhada muda o grupo, o assunto e as tags pelo "Mais" (só no mural dela); quem escreve, não precisa', async () => {
    const note = review('nota-1', 'Lista do mercado', { kind: 'anotacoes', private: true, category: 'Compartilhadas' });
    const entry = (papel: SharedEntry['papel']): SharedEntry => ({
      id: 'nota-1',
      dono: { codigo: ANA, nome: 'Ana', foto: null },
      papel,
      membros: [{ codigo: ME.codigo, nome: ME.nome, foto: null, papel: 'leitor', desde: '' }],
      rev: 1,
      versao: 1,
      base: { ...note, category: undefined },
      local: null,
      outra: null,
      resolver: false,
      conflito: null,
      atualizadoEm: note.updatedAt,
      atualizadoPor: null,
      pessoal: { category: 'Compartilhadas', org: true },
      view: note,
    });
    const shared = TestBed.inject(SharedStore);
    shared.entries.set(new Map([['nota-1', entry('leitor')]]));
    await settle();
    const store = TestBed.inject(ReviewStore);
    fixture.componentInstance.open(store.get('nota-1')!);
    await settle();
    const items = async () => {
      if (!q('app-more-menu .bilhete')) q<HTMLButtonElement>('app-more-menu .mais')!.click();
      await settle();
      return [...el.querySelectorAll<HTMLButtonElement>('app-more-menu .item')];
    };
    const organize = (await items()).find((b) => b.textContent?.includes('Grupo e tags'))!;
    expect(organize).toBeDefined();
    expect(organize.getAttribute('aria-haspopup')).toBe('dialog');
    organize.click();
    await settle();
    const sheet = q('app-organize-sheet dialog') as HTMLDialogElement;
    expect(sheet.open).toBeTrue();
    expect(sheet.querySelector('h2')?.textContent).toBe('Lista do mercado');
    expect(sheet.querySelector('.sub')?.textContent).toContain('Só no seu mural');
    // um grupo novo, escrito na busca
    const input = sheet.querySelector<HTMLInputElement>('app-group-picker input')!;
    input.value = 'Casa';
    input.dispatchEvent(new Event('input'));
    await settle();
    sheet.querySelector<HTMLButtonElement>('app-group-picker .criar')!.click();
    await settle();
    expect(store.get('nota-1')!.category).toBe('Casa');
    expect(shared.get('nota-1')!.pessoal.category).toBe('Casa');
    // a leitura recebe a versão nova da anotação, e a folha continua aberta
    expect(sheet.isConnected && sheet.open).toBeTrue();
    // nada vai para a nuvem da anotação (a leitora nem escreve nela)
    expect(shared.get('nota-1')!.local).toBeNull();
    expect(TestBed.inject(Settings).categoryLook('Casa').color).toBeDefined();
    // a orelha muda no "close" da folha, que chega numa tarefa depois do Pronto
    const shut = nextClose(sheet);
    sheet.querySelector<HTMLButtonElement>('.foot .btn-ink')!.click();
    await shut;
    await settle();
    expect(q('.orelha-grupo')?.textContent).toContain('Casa');
    // quem escreve tem o Editar: o "Mais" não traz a folha
    await closeReader();
    shared.entries.set(new Map([['nota-1', entry('editor')]]));
    await settle();
    fixture.componentInstance.open(store.get('nota-1')!);
    await settle();
    expect((await items()).some((b) => b.textContent?.includes('Grupo e tags'))).toBeFalse();
    // a folha Compartilhar (Pessoas) não fecha quando chega uma versão nova da anotação pela nuvem
    (await items()).find((b) => b.textContent?.includes('Pessoas'))!.click();
    await settle();
    const people = q('app-share-sheet dialog') as HTMLDialogElement;
    expect(people.open).toBeTrue();
    const next = { ...store.get('nota-1')!, text: 'mudou na nuvem', updatedAt: '2026-10-20T13:00:00.000Z' };
    shared.entries.set(new Map([['nota-1', { ...entry('editor'), base: next, view: next }]]));
    await settle();
    expect(q('[data-citavel]')?.textContent).toContain('mudou na nuvem');
    expect(people.isConnected && people.open).toBeTrue();
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
  describe('o link da ficha', () => {
    const items = async () => {
      if (!q('app-more-menu .bilhete')) q<HTMLButtonElement>('app-more-menu .mais')!.click();
      await settle();
      return [...el.querySelectorAll<HTMLButtonElement>('app-more-menu .item')];
    };
    const sheet = () => q('app-link-sheet dialog') as HTMLDialogElement | null;

    it('o "Mais" da sua ficha tem o link, que abre a folha com o endereço da ficha', async () => {
      fixture.componentInstance.open(review('r-hades', 'Hades'));
      await settle();
      const link = (await items()).find((b) => b.textContent?.includes('Link da ficha'))!;
      expect(link).toBeDefined();
      expect(link.getAttribute('aria-haspopup')).toBe('dialog');
      link.click();
      await settle();
      expect(sheet()?.open).toBeTrue();
      expect(sheet()!.querySelector('h2')?.textContent).toBe('Link da ficha');
      expect(sheet()!.querySelector<HTMLInputElement>('input')!.value).toMatch(/#\/ficha\/EEEE-0000\/r-hades$/);
      // a ficha já está na nuvem: nada de "ainda indo"
      expect(sheet()!.textContent).not.toContain('ainda está indo');
    });

    it('na anotação, o nome é "Link da anotação"; a privada diz por que não tem link', async () => {
      fixture.componentInstance.open(review('nota-1', 'Senhas', { kind: 'anotacoes', private: true }));
      await settle();
      (await items()).find((b) => b.textContent?.includes('Link da anotação'))!.click();
      await settle();
      expect(sheet()!.querySelector('input')).toBeNull();
      expect(sheet()!.textContent).toContain('Esta anotação é privada: só você vê, e ela não tem link');
    });

    it('a ficha mudada depois do último envio avisa que a nuvem ainda tem a de antes', async () => {
      fixture.componentInstance.open(review('r-hades', 'Hades', { updatedAt: '2026-03-01T00:00:00.000Z' }));
      await settle();
      (await items()).find((b) => b.textContent?.includes('Link da ficha'))!.click();
      await settle();
      expect(sheet()!.textContent).toContain('ainda está indo para a nuvem');
    });

    it('sem conta, a folha leva a Ajustes › Conta', async () => {
      signedIn.set(false);
      fixture.componentInstance.open(review('r-hades', 'Hades'));
      await settle();
      (await items()).find((b) => b.textContent?.includes('Link da ficha'))!.click();
      await settle();
      expect(sheet()!.querySelector('input')).toBeNull();
      expect(sheet()!.querySelector('.sem-conta .papel')?.textContent).toContain('Entrar em Ajustes › Conta');
    });

    it('Copiar põe o link na área de transferência e o botão diz "Copiado"', async () => {
      const write = spyOn(navigator.clipboard, 'writeText').and.resolveTo();
      fixture.componentInstance.open(review('r-hades', 'Hades'));
      await settle();
      (await items()).find((b) => b.textContent?.includes('Link da ficha'))!.click();
      await settle();
      sheet()!.querySelector<HTMLButtonElement>('.copiar')!.click();
      await settle();
      expect(write).toHaveBeenCalledWith(sheet()!.querySelector<HTMLInputElement>('input')!.value);
      expect(sheet()!.querySelector('.copiar')?.textContent).toContain('Copiado');
    });

    it('aberta pelo link, sem conta: só a ficha, sem fechar (nem o X, nem o Fechar, nem o Esc), sem reações nem comentários', async () => {
      counts[ANA] = { 'r-hades': 3 };
      signedIn.set(false);
      fixture.componentInstance.openLoose(review('r-hades', 'Hades'), 'Ana', [], ANA, false);
      await settle();
      expect(dialog().open).toBeTrue();
      expect(dialog().classList.contains('solta')).toBeTrue();
      expect(q('.faixa-nome .fecha')?.getAttribute('aria-label')).toBe('Minimizar: ver como fica no mural');
      expect(q('.foot .btn-ink')).toBeNull();
      expect(q('.foot')?.textContent?.trim()).toBe('Resenha de Ana');
      expect(q('.dono-link')).toBeNull();
      expect(q('.reagir-linha')).toBeNull();
      expect(q('.orelha')).toBeNull();
      expect(q('.assinatura')?.textContent).toContain('Murall');
      const esc = new Event('cancel', { cancelable: true });
      dialog().dispatchEvent(esc);
      expect(esc.defaultPrevented).toBeTrue();
      // o Esc logo ao abrir (sem toque antes) e o voltar do Android fecham o diálogo por fora: ele volta
      expect(document.activeElement?.id).toBe('leitura-titulo');
      await new Promise((res) => {
        dialog().addEventListener('close', res, { once: true });
        dialog().close();
      });
      await settle();
      expect(dialog().open).toBeTrue();
      expect(q('#leitura-titulo')?.textContent).toBe('Hades');
      // só o site fecha (ao sair da página)
      await new Promise((res) => {
        dialog().addEventListener('close', res, { once: true });
        fixture.componentInstance.close();
      });
      await settle();
      expect(dialog().open).toBeFalse();
      expect(q('#leitura-titulo')).toBeNull();
    });

    it('aberta pelo link, o minimizar fecha a leitura e pede a ficha do mural', async () => {
      const links = TestBed.inject(FichaLinks);
      fixture.componentInstance.openLoose(review('r-hades', 'Hades'), 'Ana', [], ANA, false);
      await settle();
      await new Promise((res) => {
        dialog().addEventListener('close', res, { once: true });
        q<HTMLButtonElement>('.faixa-nome .fecha')!.click();
      });
      await settle();
      expect(links.minimized()).toBeTrue();
      expect(dialog().open).toBeFalse();
      links.minimized.set(false);
    });

    it('aberta pelo link, com conta: os comentários e o nome que leva ao perfil', async () => {
      counts[ANA] = { 'r-hades': 3 };
      fixture.componentInstance.openLoose(review('r-hades', 'Hades'), 'Ana', [], ANA, true);
      await settle();
      expect(q('.orelha')?.getAttribute('aria-label')).toBe('Comentários: 3');
      expect(q('.dono-link')?.textContent).toBe('Ana');
      expect(q('.faixa-nome .fecha')?.getAttribute('aria-label')).toBe('Minimizar: ver como fica no mural');
      // abrir outra ficha do jeito de sempre volta a ter o fechar
      await closeReader();
      fixture.componentInstance.open(review('r-hades', 'Hades'), 'Ana', [], false, ANA);
      await settle();
      expect(q('.faixa-nome .fecha')?.getAttribute('aria-label')).toBe('Fechar');
      expect(dialog().classList.contains('solta')).toBeFalse();
    });
  });
});
