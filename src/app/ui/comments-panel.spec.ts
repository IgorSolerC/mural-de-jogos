import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CloudError } from '../core/cloud-account';
import { Comment, CommentTarget, Comments, QuoteRequest, Thread } from '../core/comments';
import { Follow } from '../core/follow';
import { Reactions } from '../core/reactions';
import { CommentBubble } from './comment-bubble';
import { CommentsPanel } from './comments-panel';
import { Confirm } from './confirm';
import { Toasts } from './toast';

/**
 * A folha de comentários, desenhada de verdade: a conversa, o campo que só abre quando a pessoa vai
 * escrever, o que aparece no lugar dele para quem não pode comentar, a citação e o apagar. E o remendo
 * da ficha do mural.
 */

const ME = 'EEEE-0000';
const ANA = 'AAAA-1111';
const HADES: CommentTarget = { code: ANA, ref: 'r-hades', titulo: 'Hades', mural: 'jogos' };
const at = new Date().toISOString();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const comment = (n: number, codigo: string, nome: string, texto: string, extra: Partial<Comment> = {}): Comment => ({
  id: id(n),
  autor: { codigo, nome, foto: null },
  texto,
  em: at,
  reacoes: [],
  ...extra,
});
const settle = async (fixture: ComponentFixture<unknown>) => {
  await new Promise((res) => setTimeout(res, 0));
  fixture.detectChanges();
  await fixture.whenStable();
};

/** O serviço de mentira: guarda a conversa num sinal e anota o que foi pedido. */
class FakeComments {
  readonly me = signal<string | null>(ME);
  readonly myCode = this.me.asReadonly();
  readonly threads = signal<Thread | undefined>(undefined);
  readonly failed = signal(false);
  readonly counts = signal(0);
  readonly posted: string[] = [];
  readonly removed: string[] = [];
  readonly reacted: [string, string | null][] = [];
  readonly wanted: string[] = [];
  readonly replies: (string | undefined)[] = [];
  focus: string | null = null;
  loads = 0;
  refuse: CloudError | null = null;
  private draft = '';

  thread = () => this.threads();
  hasFailed = () => this.failed();
  countOf = () => this.counts();
  want = (ref: string) => void this.wanted.push(ref);
  takeFocus = () => {
    const f = this.focus;
    this.focus = null;
    return f;
  };
  draftOf = () => this.draft;
  setDraft = (_: unknown, text: string) => void (this.draft = text.trim() ? text : '');
  loadCounts = async () => undefined;
  loadThread = async () => void this.loads++;
  mineOn = (k: Comment) => k.reacoes.find((r) => r.codigo === this.me())?.reacao ?? null;
  react = async (_: unknown, comment: string, reaction: string | null) => void this.reacted.push([comment, reaction]);
  remove = async (_: unknown, comment: string) => {
    this.removed.push(comment);
    return true;
  };
  post = async (_: unknown, text: string, replyTo?: string) => {
    if (this.refuse) throw this.refuse;
    this.posted.push(text);
    this.replies.push(replyTo);
    const made = comment(90 + this.posted.length, ME, 'Eu', text.trim(), replyTo ? { replyTo } : {});
    this.threads.update((t) => (t ? { ...t, comentarios: [...t.comentarios, made] } : t));
    return made;
  };
}

@Component({
  imports: [CommentsPanel],
  template: `<app-comments-panel [target]="target()" ownerName="Ana" [own]="own()" [quote]="quote()" (leave)="left.push($event)" />`,
})
class Host {
  readonly target = signal(HADES);
  readonly own = signal(false);
  readonly quote = signal<QuoteRequest | null>(null);
  readonly left: string[][] = [];
}

describe('A folha de comentários (CommentsPanel)', () => {
  let fake: FakeComments;
  let followed: string[];
  let asked: { title?: string; text: string }[];
  let answer: boolean;
  let toasts: string[];

  const THREAD: Thread = {
    comentarios: [
      comment(1, 'BBBB-2222', 'Bia', 'Que **final**!', { reacoes: [{ codigo: 'CCCC-3333', nome: 'Caio', reacao: 'fogo', em: at }, { codigo: ME, nome: 'Eu', reacao: 'fogo', em: at }] }),
      comment(2, ME, 'Eu', '> Valeu cada hora.\nTambém achei.'),
    ],
    maisAntigos: false,
    quem: 'seguidores',
    pode: true,
  };

  /** `thread` null: a conversa ainda não chegou. */
  async function open(thread: Thread | null = THREAD, focus: string | null = null) {
    fake = new FakeComments();
    fake.threads.set(thread ?? undefined);
    fake.focus = focus;
    followed = [];
    asked = [];
    answer = true;
    toasts = [];
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: Comments, useValue: fake },
        { provide: Follow, useValue: { follow: async (code: string) => void followed.push(code) } },
        // o seletor de reações também serve às fichas: aqui ele não fala com o serviço delas
        { provide: Reactions, useValue: { mineOn: () => null, react: async () => undefined } },
        { provide: Confirm, useValue: { ask: async (q: { title?: string; text: string }) => (asked.push(q), answer) } },
        { provide: Toasts, useValue: { show: (t: string) => toasts.push(t) } },
      ],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await settle(fixture);
    return { fixture, host: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => TestBed.resetTestingModule());

  const texts = (el: HTMLElement) => [...el.querySelectorAll('.comentario .texto')].map((t) => t.textContent?.replace(/\s+/g, ' ').trim());

  it('mostra a conversa na ordem, com o nome de quem escreveu e o texto formatado', async () => {
    const { el } = await open();
    expect(fake.loads).toBe(1);
    expect(el.querySelector('h2')?.textContent).toContain('Comentários');
    expect([...el.querySelectorAll('.comentario .nome')].map((n) => n.textContent?.trim())).toEqual(['Bia', 'Você']);
    expect(texts(el)[0]).toBe('Que final!');
    expect(texts(el)[1]).toMatch(/^Valeu cada hora\.\s*Também achei\.$/);
    // as marcas viram formatação (nunca aparecem cruas), e a citação é uma citação
    expect(el.querySelector('.comentario .negrito')?.textContent).toBe('final');
    expect(el.querySelector('.comentario blockquote')?.textContent).toContain('Valeu cada hora.');
    // sem foto, a inicial de quem escreveu
    expect(el.querySelector('.foto-inicial')?.textContent?.trim()).toBe('B');
  });

  it('o nome de quem escreveu leva ao perfil dela; o "Você", ao seu', async () => {
    const { el, host } = await open();
    const links = el.querySelectorAll<HTMLButtonElement>('.nome-link');
    expect([...links].map((l) => l.getAttribute('aria-label'))).toEqual(['Ver o perfil de Bia', 'Você: ver o seu perfil']);
    links[0].click();
    links[1].click();
    expect(host.left).toEqual([['/perfil', 'BBBB-2222'], ['/perfil', ME]]);
  });

  it('a foto de quem escreveu leva ao mesmo perfil, só para o mouse (o leitor de tela e o teclado vão pelo nome)', async () => {
    const { el, host } = await open();
    const photos = el.querySelectorAll<HTMLButtonElement>('.comentario > .fala > .foto-perfil');
    expect(photos.length).toBe(2);
    expect([photos[0].getAttribute('aria-hidden'), photos[0].tabIndex]).toEqual(['true', -1]);
    photos[0].click();
    photos[1].click();
    expect(host.left).toEqual([['/perfil', 'BBBB-2222'], ['/perfil', ME]]);
  });

  it('as reações de um comentário ficam num remendo, que abre quem reagiu', async () => {
    const { fixture, el } = await open();
    const patches = el.querySelectorAll<HTMLButtonElement>('.remendo');
    expect(patches.length).toBe(1);
    expect(patches[0].getAttribute('aria-label')).toBe('Reações: 2 Fogo. Ver quem reagiu');
    expect(el.querySelector('.quem-reagiu')).toBeNull();
    patches[0].click();
    fixture.detectChanges();
    expect(el.querySelector('.quem-reagiu')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('🔥 Caio e Você');
    expect(patches[0].getAttribute('aria-expanded')).toBe('true');
  });

  it('cada nome em quem reagiu leva ao perfil da pessoa', async () => {
    const { fixture, el, host } = await open({
      ...THREAD,
      comentarios: [
        comment(1, 'BBBB-2222', 'Bia', 'Oi', {
          reacoes: [
            { codigo: 'CCCC-3333', nome: 'Caio', reacao: 'fogo', em: at },
            { codigo: 'DDDD-4444', nome: 'Dani', reacao: 'fogo', em: at },
            { codigo: ME, nome: 'Eu', reacao: 'fogo', em: at },
          ],
        }),
      ],
    });
    el.querySelector<HTMLButtonElement>('.remendo')!.click();
    fixture.detectChanges();
    expect(el.querySelector('.quem-reagiu')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('🔥 Caio, Dani e Você');
    const names = el.querySelectorAll<HTMLButtonElement>('.quem-link');
    expect([...names].map((n) => n.getAttribute('aria-label'))).toEqual(['Ver o perfil de Caio', 'Ver o perfil de Dani', 'Você: ver o seu perfil']);
    names[1].click();
    expect(host.left).toEqual([['/perfil', 'DDDD-4444']]);
  });

  it('reagir a um comentário: a fileira sai do botão quieto, e a escolhida de novo tira', async () => {
    const { fixture, el } = await open();
    const triggers = el.querySelectorAll<HTMLButtonElement>('app-reaction-picker .reagir');
    expect(triggers.length).toBe(2);
    expect(triggers[0].getAttribute('aria-label')).toBe('Sua reação: Fogo. Trocar');
    triggers[1].click();
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.opcao[aria-label="Amei"]')!.click();
    expect(fake.reacted).toEqual([[id(2), 'amei']]);
    triggers[0].click();
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.opcao[aria-label="Fogo"]')!.click();
    expect(fake.reacted.at(-1)).toEqual([id(1), null]);
  });

  it('apaga o seu comentário depois de perguntar; na ficha de outra pessoa, só o seu', async () => {
    const { el } = await open();
    const erase = el.querySelectorAll<HTMLButtonElement>('.apagar');
    expect(erase.length).toBe(1);
    expect(erase[0].getAttribute('aria-label')).toBe('Apagar o seu comentário');
    answer = false;
    erase[0].click();
    await new Promise((res) => setTimeout(res, 0));
    expect(asked[0].title).toBe('Apagar o comentário?');
    expect(fake.removed).toEqual([]);
    answer = true;
    erase[0].click();
    await new Promise((res) => setTimeout(res, 0));
    expect(fake.removed).toEqual([id(2)]);
  });

  it('na sua ficha, você apaga o comentário de qualquer um', async () => {
    const { fixture, el, host } = await open();
    host.own.set(true);
    fixture.detectChanges();
    const erase = el.querySelectorAll<HTMLButtonElement>('.apagar');
    expect([...erase].map((b) => b.getAttribute('aria-label'))).toEqual(['Apagar o comentário de Bia', 'Apagar o seu comentário']);
    erase[0].click();
    await new Promise((res) => setTimeout(res, 0));
    expect(asked[0].text).toContain('Bia');
    expect(fake.removed).toEqual([id(1)]);
  });

  it('o campo é uma linha só até a pessoa tocar; aí vira a folha, com o limite de 500', async () => {
    const { fixture, el } = await open();
    expect(el.querySelector('textarea')).toBeNull();
    const closed = el.querySelector<HTMLButtonElement>('.abrir')!;
    expect(closed.textContent?.trim()).toBe('Escreva um comentário…');
    closed.click();
    await settle(fixture);
    const area = el.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(area.getAttribute('maxlength')).toBe('500');
    expect(el.querySelector('.contagem')?.textContent).toContain('0 / 500');
    const send = el.querySelector<HTMLButtonElement>('.acoes .tinta')!;
    expect(send.disabled).toBeTrue();

    area.value = '  Também achei o final corrido.  ';
    area.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(send.disabled).toBeFalse();
    send.click();
    await settle(fixture);
    expect(fake.posted).toEqual(['  Também achei o final corrido.  ']);
    // entrou na conversa, o campo fechou e o rascunho foi embora
    expect(texts(el).at(-1)).toBe('Também achei o final corrido.');
    expect(el.querySelector('textarea')).toBeNull();
    expect(el.querySelector('.abrir')?.textContent?.trim()).toBe('Escreva um comentário…');
  });

  it('Ctrl+Enter envia; fechar o campo guarda o que foi escrito', async () => {
    const { fixture, el } = await open();
    el.querySelector<HTMLButtonElement>('.abrir')!.click();
    await settle(fixture);
    const area = el.querySelector<HTMLTextAreaElement>('textarea')!;
    area.value = 'Um rascunho';
    area.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.acoes .acao-caneta')!.click();
    fixture.detectChanges();
    expect(el.querySelector('textarea')).toBeNull();
    expect(el.querySelector('.abrir')?.textContent?.trim()).toBe('Continuar o comentário…');
    expect(fake.draftOf()).toBe('Um rascunho');

    el.querySelector<HTMLButtonElement>('.abrir')!.click();
    await settle(fixture);
    const again = el.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(again.value).toBe('Um rascunho');
    again.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    await settle(fixture);
    expect(fake.posted).toEqual(['Um rascunho']);
  });

  it('a nuvem recusou: o erro aparece embaixo do campo e o texto continua lá', async () => {
    const { fixture, el } = await open();
    el.querySelector<HTMLButtonElement>('.abrir')!.click();
    await settle(fixture);
    const area = el.querySelector<HTMLTextAreaElement>('textarea')!;
    area.value = 'Posso?';
    area.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    fake.refuse = new CloudError('Você comentou bastante hoje. Tente de novo amanhã.', 'comentar-devagar', 429);
    el.querySelector<HTMLButtonElement>('.acoes .tinta')!.click();
    await settle(fixture);
    expect(el.querySelector('[role="alert"]')?.textContent?.trim()).toBe('Você comentou bastante hoje. Tente de novo amanhã.');
    expect(el.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('Posso?');
    expect(fake.posted).toEqual([]);
  });

  it('citar: o trecho entra como citação no fim do rascunho e o campo abre para responder', async () => {
    const { fixture, el, host } = await open();
    host.quote.set({ text: 'Valeu cada hora,\nmesmo com o final corrido.', n: 1 });
    await settle(fixture);
    const area = el.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(area.value).toBe('> Valeu cada hora,\n> mesmo com o final corrido.\n');
    // o mesmo trecho de novo (outro pedido) entra de novo, embaixo do que já estava
    host.quote.set({ text: 'Valeu cada hora,', n: 2 });
    await settle(fixture);
    expect(el.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('> Valeu cada hora,\n> mesmo com o final corrido.\n\n> Valeu cada hora,\n');
  });

  it('a citação que não cabe no limite avisa e não mexe no rascunho', async () => {
    const { fixture, el, host } = await open();
    el.querySelector<HTMLButtonElement>('.abrir')!.click();
    await settle(fixture);
    const area = el.querySelector<HTMLTextAreaElement>('textarea')!;
    area.value = 'x'.repeat(496);
    area.dispatchEvent(new Event('input'));
    host.quote.set({ text: 'Um trecho qualquer', n: 1 });
    await settle(fixture);
    expect(toasts).toEqual(['A citação não cabe: o comentário já está no limite.']);
    expect(el.querySelector<HTMLTextAreaElement>('textarea')!.value.length).toBe(496);
  });

  it('quem não segue o dono vê os comentários e, no lugar do campo, o Seguir', async () => {
    const { fixture, el } = await open({ ...THREAD, pode: false });
    expect(el.querySelectorAll('.comentario').length).toBe(2);
    expect(el.querySelector('.abrir')).toBeNull();
    // sem poder comentar, também não reage (o seu comentário continua apagável)
    expect(el.querySelector('app-reaction-picker')).toBeNull();
    expect(el.querySelectorAll('.apagar').length).toBe(1);
    expect(el.querySelector('.porta')?.textContent).toContain('Para comentar, siga Ana.');
    fake.threads.set(THREAD);
    el.querySelector<HTMLButtonElement>('.porta .tinta')!.click();
    await settle(fixture);
    expect(followed).toEqual([ANA]);
    // seguiu: a conversa é pedida de novo, e o campo aparece
    expect(fake.loads).toBe(2);
    expect(el.querySelector('.abrir')).not.toBeNull();
  });

  it('só quem o dono segue: a folha diz isso, sem botão', async () => {
    const { el } = await open({ ...THREAD, quem: 'seguidos', pode: false });
    expect(el.querySelector('.porta')?.textContent?.trim()).toBe('Aqui só comenta quem Ana segue.');
    expect(el.querySelector('.porta .tinta')).toBeNull();
    expect(el.querySelector('.abrir')).toBeNull();
  });

  it('sem conta: o convite para entrar, que leva a Ajustes', async () => {
    const { fixture, el, host } = await open();
    fake.me.set(null);
    fixture.detectChanges();
    expect(el.querySelector('.abrir')).toBeNull();
    expect(el.querySelector('.apagar')).toBeNull();
    el.querySelector<HTMLButtonElement>('.porta-link')!.click();
    expect(host.left).toEqual([['/ajustes']]);
  });

  it('sem comentário nenhum, esperando e sem rede: cada estado diz o que é', async () => {
    const empty = await open({ ...THREAD, comentarios: [] });
    expect(empty.el.querySelector('.vazio')?.textContent?.trim()).toBe('Ninguém comentou ainda. Para citar um trecho, selecione o texto da ficha.');
    expect(empty.el.querySelector('.abrir')).not.toBeNull();
    TestBed.resetTestingModule();

    const waiting = await open(null);
    expect(waiting.el.querySelector('[role="status"]')?.textContent).toContain('Buscando os comentários');
    fake.failed.set(true);
    waiting.fixture.detectChanges();
    expect(waiting.el.querySelector('.vazio')?.textContent).toContain('Não consegui buscar os comentários agora.');
    waiting.el.querySelector<HTMLButtonElement>('.vazio .acao-caneta')!.click();
    expect(fake.loads).toBe(2);
  });

  it('a nuvem devolveu só os mais novos: a folha avisa', async () => {
    const { el } = await open({ ...THREAD, maisAntigos: true });
    expect(el.querySelector('.recado')?.textContent).toContain('só os comentários mais novos');
  });

  describe('respostas', () => {
    /** Bia comenta; Caio responde a ela; Bia responde ao Caio; Dan comenta solto. */
    const TREE: Thread = {
      comentarios: [
        comment(1, 'BBBB-2222', 'Bia', 'Que final!'),
        comment(2, 'CCCC-3333', 'Caio', 'Concordo.', { replyTo: id(1) }),
        comment(3, 'BBBB-2222', 'Bia', 'Né?', { replyTo: id(2) }),
        comment(4, 'DDDD-4444', 'Dan', 'Outro assunto.'),
      ],
      maisAntigos: false,
      quem: 'seguidores',
      pode: true,
    };
    const ids = (el: Element, sel: string) => [...el.querySelectorAll(sel)].map((li) => li.getAttribute('data-comentario'));

    it('cada resposta fica embaixo da fala respondida, num ramo com o fio', async () => {
      const { el } = await open(TREE);
      expect(ids(el, '.lista > .comentario')).toEqual([id(1), id(4)]);
      const bia = el.querySelector(`[data-comentario="${id(1)}"]`)!;
      expect(ids(bia, ':scope > .ramo > .respostas > .comentario')).toEqual([id(2)]);
      expect(ids(bia, '.comentario.resposta')).toEqual([id(2), id(3)]);
      expect(bia.querySelector(':scope > .fio')!.getAttribute('aria-label')).toBe('Recolher as 2 respostas a Bia');
      expect(bia.querySelector('.respostas')!.getAttribute('aria-label')).toBe('Respostas a Bia');
      // só a raiz se separa com o tracejado: as respostas ficam juntas
      expect(el.querySelector(`[data-comentario="${id(4)}"] .fio`)).toBeNull();
    });

    it('o fio recolhe a conversa dali para baixo, e "Ver N respostas" abre de novo', async () => {
      const { fixture, el } = await open(TREE);
      el.querySelector<HTMLButtonElement>(`[data-comentario="${id(1)}"] > .fio`)!.click();
      await settle(fixture);
      expect(el.querySelectorAll('.comentario.resposta').length).toBe(0);
      const more = el.querySelector<HTMLButtonElement>(`[data-comentario="${id(1)}"] > .mostrar`)!;
      expect(more.textContent?.trim()).toBe('Ver 2 respostas');
      expect(more.getAttribute('aria-expanded')).toBe('false');
      more.click();
      await settle(fixture);
      expect(el.querySelectorAll('.comentario.resposta').length).toBe(2);
    });

    it('Responder abre o campo dizendo a quem; enviar manda o id do respondido', async () => {
      const { fixture, el } = await open(TREE);
      const reply = el.querySelector<HTMLButtonElement>(`[data-comentario="${id(2)}"] .responder`)!;
      expect(reply.getAttribute('aria-label')).toBe('Responder a Caio');
      reply.click();
      await settle(fixture);
      expect(el.querySelector('.respondendo-a')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Respondendo a Caio');
      // a fala respondida fica marcada
      expect(el.querySelector(`[data-comentario="${id(2)}"]`)!.classList).toContain('respondendo');
      const area = el.querySelector<HTMLTextAreaElement>('textarea')!;
      expect(area.getAttribute('placeholder')).toBe('Responda a Caio…');
      area.value = 'Também!';
      area.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const send = el.querySelector<HTMLButtonElement>('.acoes .tinta')!;
      expect(send.textContent?.trim()).toBe('Responder');
      send.click();
      await settle(fixture);
      expect(fake.replies).toEqual([id(2)]);
      // entrou embaixo do Caio, e o campo voltou a comentar na ficha
      const caio = el.querySelector(`[data-comentario="${id(2)}"]`)!;
      expect(ids(caio, ':scope > .ramo > .respostas > .comentario')).toEqual([id(3), id(91)]);
      expect(el.querySelector('.respondendo-a')).toBeNull();
      expect(el.querySelector('.respondendo')).toBeNull();
    });

    it('o X do "Respondendo a…" volta a comentar na ficha, sem perder o texto', async () => {
      const { fixture, el } = await open(TREE);
      el.querySelector<HTMLButtonElement>(`[data-comentario="${id(1)}"] .responder`)!.click();
      await settle(fixture);
      const area = el.querySelector<HTMLTextAreaElement>('textarea')!;
      area.value = 'Rascunho';
      area.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      el.querySelector<HTMLButtonElement>('.respondendo-tirar')!.click();
      await settle(fixture);
      expect(el.querySelector('.respondendo-a')).toBeNull();
      expect(el.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('Rascunho');
      el.querySelector<HTMLButtonElement>('.acoes .tinta')!.click();
      await settle(fixture);
      expect(fake.replies).toEqual([undefined]);
    });

    it('quem não pode comentar não vê Responder', async () => {
      const { el } = await open({ ...TREE, pode: false });
      expect(el.querySelectorAll('.responder').length).toBe(0);
    });

    it('o apagado com respostas fica no lugar, sem nome, texto ou botões', async () => {
      const gone = comment(1, '', '', '', { gone: true, autor: { codigo: '', nome: '', foto: null } });
      const { el } = await open({ ...TREE, comentarios: [gone, ...TREE.comentarios.slice(1)] });
      const li = el.querySelector(`[data-comentario="${id(1)}"]`)!;
      expect(li.classList).toContain('apagado');
      expect(li.querySelector(':scope > .fala')!.textContent?.trim()).toBe('Comentário apagado');
      expect(li.querySelector(':scope > .fala .responder, :scope > .fala .apagar, :scope > .fala .nome')).toBeNull();
      expect(li.querySelector(':scope > .fio')!.getAttribute('aria-label')).toBe('Recolher as 2 respostas a um comentário apagado');
      // a conta da folha não conta o apagado
      expect(el.querySelector('.lista')!.getAttribute('aria-label')).toBe('3 comentários');
    });

    it('apagar um comentário com respostas avisa que elas continuam', async () => {
      const { el } = await open({ ...TREE, comentarios: [comment(1, ME, 'Eu', 'Meu'), comment(2, 'CCCC-3333', 'Caio', 'Oi', { replyTo: id(1) })] });
      el.querySelector<HTMLButtonElement>(`[data-comentario="${id(1)}"] > .fala .apagar`)!.click();
      await new Promise((res) => setTimeout(res, 0));
      expect(asked[0].text).toContain('As respostas a ele continuam');
      expect(fake.removed).toEqual([id(1)]);
    });

    it('fundo demais: a folha para de recuar e a resposta diz a quem responde', async () => {
      const deep = Array.from({ length: 7 }, (_, i) => comment(i + 1, 'BBBB-2222', `P${i + 1}`, `n${i + 1}`, i ? { replyTo: id(i) } : {}));
      const { el } = await open({ ...TREE, comentarios: deep });
      // raiz + 4 funduras recuadas; da 5ª em diante, rente e com "Respondendo a"
      expect(el.querySelectorAll('.ramo.rente').length).toBe(2);
      const p6 = el.querySelector(`[data-comentario="${id(6)}"]`)!;
      expect(p6.querySelector(':scope > .fala .a-quem')?.textContent?.trim()).toBe('Respondendo a P5');
      expect(el.querySelector(`[data-comentario="${id(5)}"] > .fala .a-quem`)).toBeNull();
    });

    it('aberta por um aviso: a conversa vai até a resposta, abre as recolhidas e passa o marca-texto nela', async () => {
      const { fixture, el } = await open(TREE, id(3));
      await new Promise((res) => setTimeout(res, 20));
      fixture.detectChanges();
      expect(el.querySelector(`[data-comentario="${id(3)}"] > .fala`)!.classList).toContain('chegou');
    });
  });
});

describe('O remendo dos comentários na ficha (CommentBubble)', () => {
  @Component({
    imports: [CommentBubble],
    template: `<app-comment-bubble [target]="target" (opened)="opened = opened + 1" />`,
  })
  class BubbleHost {
    readonly target = HADES;
    opened = 0;
  }

  it('sem comentários não aparece; com eles, mostra quantos e pede a ficha aberta nos comentários', async () => {
    const fake = new FakeComments();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: Comments, useValue: fake }] });
    const fixture = TestBed.createComponent(BubbleHost);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.balao')).toBeNull();

    fake.counts.set(3);
    fixture.detectChanges();
    const patch = el.querySelector<HTMLButtonElement>('.balao')!;
    expect(patch.querySelector('.n')?.textContent).toBe('3');
    expect(patch.getAttribute('aria-label')).toBe('3 comentários. Ver os comentários');
    patch.click();
    expect(fake.wanted).toEqual(['r-hades']);
    expect(fixture.componentInstance.opened).toBe(1);
    TestBed.resetTestingModule();
  });

});
