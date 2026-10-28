import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { Cloud } from './cloud-config';
import { CloudAccount, CloudAccountInfo, CloudError } from './cloud-account';
import { COMMENT_MAX, Comment, Comments, commentTree, commentWhen, liveCount, parseComment, parseCounts, parseThread, quoteOf, spokenComments, withQuote, withoutComment } from './comments';
import { FeedItem, Follow, parseFeed } from './follow';
import { parseRich } from './rich-text';
import { Toasts } from '../ui/toast';

/**
 * Os comentários: o que vem da nuvem, a citação de um trecho da ficha e o serviço (a contagem, a
 * conversa, comentar, apagar e reagir, que mudam na hora e voltam se a nuvem recusar).
 */

const ME: CloudAccountInfo = { id: 'u-eu', codigo: 'EEEE-0000', nome: 'Eu' };
const ANA = 'AAAA-1111';
const at = '2026-10-12T12:00:00.000Z';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const raw = (n: number, nome: string, texto: string, extra: Record<string, unknown> = {}) => ({
  id: id(n),
  autor: { codigo: nome === 'Eu' ? ME.codigo : `${nome[0].repeat(4)}-${String(n).repeat(4)}`.toUpperCase(), nome },
  texto,
  em: at,
  reacoes: [],
  ...extra,
});
const flush = () => new Promise((res) => setTimeout(res, 0));

describe('comentários', () => {
  describe('o que vem da nuvem', () => {
    it('lê um comentário com o autor, a foto e as reações, uma por pessoa', () => {
      const k = parseComment({
        id: id(1),
        autor: { codigo: 'bbbb2222', nome: '  Bia  ', foto: { emoji: '🐙', cor: 'rosa' } },
        texto: 'Que **final**!',
        em: at,
        reacoes: [
          { codigo: 'CCCC-3333', nome: 'Caio', reacao: 'fogo', em: at },
          { codigo: 'CCCC-3333', nome: 'Caio', reacao: 'amei', em: at },
          { codigo: 'DDDD-4444', nome: 'Dan', reacao: 'raiva', em: at },
          { codigo: 'DDDD-4444', nome: 'Dan', reacao: '🦄', em: at },
        ],
      });
      expect(k).toEqual({
        id: id(1),
        autor: { codigo: 'BBBB-2222', nome: 'Bia', foto: { emoji: '🐙', cor: 'rosa' } },
        texto: 'Que **final**!',
        em: at,
        reacoes: [
          { codigo: 'CCCC-3333', nome: 'Caio', reacao: 'fogo', em: at },
          { codigo: 'DDDD-4444', nome: 'Dan', reacao: '🦄', em: at },
        ],
      });
    });

    it('a foto que não serve vira a inicial; o comentário sem a forma certa fica de fora', () => {
      expect(parseComment(raw(1, 'Bia', 'oi', { autor: { codigo: 'BBBB-2222', nome: 'Bia', foto: { emoji: 'ab', cor: 'rosa' } } }))?.autor.foto).toBeNull();
      expect(parseComment(raw(1, 'Bia', 'oi', { autor: { codigo: 'BBBB-2222', nome: 'Bia', foto: { emoji: '🐙', cor: 'furta-cor' } } }))?.autor.foto).toBeNull();
      for (const bad of [null, 'x', raw(1, 'Bia', '   '), raw(1, 'Bia', 7 as unknown as string), { ...raw(1, 'Bia', 'oi'), id: 'curto' }, { ...raw(1, 'Bia', 'oi'), em: 'ontem' }, { ...raw(1, 'Bia', 'oi'), autor: { codigo: 'x', nome: 'Bia' } }]) {
        expect(parseComment(bad)).withContext(JSON.stringify(bad)).toBeNull();
      }
      // um texto maior que o limite (um servidor estranho) é cortado, nunca desenhado inteiro
      expect(parseComment(raw(1, 'Bia', 'a'.repeat(900)))?.texto.length).toBe(COMMENT_MAX);
    });

    it('a conversa: cada comentário uma vez, na ordem que veio, com a regra de quem comenta', () => {
      const t = parseThread({ comentarios: [raw(1, 'Bia', 'um'), raw(1, 'Bia', 'repetido'), { id: 'x' }, raw(2, 'Caio', 'dois')], maisAntigos: true, quem: 'seguidos', pode: true });
      expect(t.comentarios.map((k) => k.texto)).toEqual(['um', 'dois']);
      expect([t.maisAntigos, t.quem, t.pode]).toEqual([true, 'seguidos', true]);
      // o que não veio vale o mais fechado: ninguém comenta por engano
      expect(parseThread(null)).toEqual({ comentarios: [], maisAntigos: false, quem: 'seguidores', pode: false });
      expect(parseThread({ comentarios: 'x', quem: 'todos', pode: 'sim' })).toEqual({ comentarios: [], maisAntigos: false, quem: 'seguidores', pode: false });
    });

    it('a contagem por ficha: só números inteiros acima de zero, em fichas que existem', () => {
      const c = parseCounts({ contagem: { 'r-hades': 3, 'r-zero': 0, 'r-meio': 1.5, 'r-texto': '2', 'com espaço': 4, 'r-celeste': 1 }, quem: 'seguidos', pode: true });
      expect([...c.contagem]).toEqual([
        ['r-hades', 3],
        ['r-celeste', 1],
      ]);
      expect([c.quem, c.pode]).toEqual(['seguidos', true]);
      expect(parseCounts({ contagem: ['r-hades'] }).contagem.size).toBe(0);
      expect(parseCounts(undefined)).toEqual({ contagem: new Map(), quem: 'seguidores', pode: false });
    });

    it('a resposta leva o id do respondido; o apagado com respostas vem sem autor nem texto', () => {
      expect(parseComment(raw(2, 'Caio', 'Concordo.', { respostaA: id(1) }))?.replyTo).toBe(id(1));
      // um id que não serve (ou o próprio) não vira resposta
      expect(parseComment(raw(2, 'Caio', 'Oi', { respostaA: 'x' }))?.replyTo).toBeUndefined();
      expect(parseComment(raw(2, 'Caio', 'Oi', { respostaA: id(2) }))?.replyTo).toBeUndefined();
      expect(parseComment({ id: id(3), apagado: true, autor: null, texto: '', em: at, reacoes: [], respostaA: id(1) })).toEqual({
        id: id(3),
        autor: { codigo: '', nome: '', foto: null },
        texto: '',
        em: at,
        reacoes: [],
        gone: true,
        replyTo: id(1),
      });
    });

    it('o aviso de resposta no correio: com o dono da ficha e a resposta; sem dono, fica de fora', () => {
      const base = { em: at, pessoa: { codigo: 'BBBB-2222', nome: 'Bia' }, ref: 'r-hades', titulo: 'Hades', mural: 'jogos', silenciado: false };
      const items = parseFeed([
        { tipo: 'respondeu', ...base, dono: 'aaaa1111', comentario: id(4) },
        { tipo: 'respondeu', ...base, dono: '' },
        { tipo: 'respondeu', ...base, dono: ANA, comentario: 'nao' },
      ]);
      expect(items).toEqual([
        { tipo: 'respondeu', ...base, mural: 'jogos', dono: ANA, comentario: id(4) } as FeedItem,
        { tipo: 'respondeu', ...base, mural: 'jogos', dono: ANA, comentario: null } as FeedItem,
      ]);
    });

    it('o aviso de comentário no correio', () => {
      const base = { em: at, pessoa: { codigo: 'BBBB-2222', nome: 'Bia' }, ref: 'r-hades', titulo: 'Hades', mural: 'jogos', silenciado: false };
      const items = parseFeed([{ tipo: 'comentou', ...base }, { tipo: 'comentou', ...base, ref: 'x' }, { tipo: 'comentou', ...base, titulo: '' }]);
      expect(items).toEqual([{ tipo: 'comentou', ...base, mural: 'jogos' } as FeedItem]);
    });
  });

  describe('a árvore da conversa', () => {
    const k = (n: number, replyTo?: number, gone = false): Comment => ({
      id: id(n),
      autor: gone ? { codigo: '', nome: '', foto: null } : { codigo: 'BBBB-2222', nome: 'Bia', foto: null },
      texto: gone ? '' : `c${n}`,
      em: at,
      reacoes: [],
      ...(replyTo ? { replyTo: id(replyTo) } : {}),
      ...(gone ? { gone: true as const } : {}),
    });
    const shape = (nodes: ReturnType<typeof commentTree>): unknown => nodes.map((n) => [n.k.texto || 'x', n.size, ...(n.kids.length ? [shape(n.kids)] : [])]);

    it('cada resposta embaixo do comentário dela, na ordem em que veio, com quantas há embaixo', () => {
      const tree = commentTree([k(1), k(2), k(3, 1), k(4, 3), k(5, 1), k(6, 2)]);
      expect(shape(tree)).toEqual([
        ['c1', 3, [['c3', 1, [['c4', 0]]], ['c5', 0]]],
        ['c2', 1, [['c6', 0]]],
      ]);
    });

    it('a resposta a um comentário que não veio fica na raiz, marcada; uma mais velha que o pai, também', () => {
      const tree = commentTree([k(1), k(2, 9), k(3, 4), k(4)]);
      expect(tree.map((n) => [n.k.texto, n.lost])).toEqual([
        ['c1', false],
        ['c2', true],
        ['c3', true],
        ['c4', false],
      ]);
    });

    it('o apagado não conta: nem na conversa, nem nas respostas embaixo', () => {
      const list = [k(1, undefined, true), k(2, 1), k(3, 2, true), k(4, 3)];
      expect(liveCount(list)).toBe(2);
      expect(commentTree(list)[0].size).toBe(2);
    });

    it('apagar: com respostas fica o lugar; sem, sai e leva o apagado de cima que ficou só por ele', () => {
      const list = [k(1), k(2, 1), k(3, 2), k(4, 1)];
      const a = withoutComment(list, id(2));
      expect(a.map((c) => [c.texto, !!c.gone])).toEqual([
        ['c1', false],
        ['', true],
        ['c3', false],
        ['c4', false],
      ]);
      expect(a[1].replyTo).toBe(id(1));
      const b = withoutComment(withoutComment(a, id(1)), id(3));
      // o 2 (apagado) saiu com a última resposta; o 1 (apagado) fica pela do lado (4)
      expect(b.map((c) => [c.id, !!c.gone])).toEqual([
        [id(1), true],
        [id(4), false],
      ]);
      expect(withoutComment(b, id(4))).toEqual([]);
    });
  });

  describe('o que se diz', () => {
    it('quantos comentários, por extenso', () => {
      expect(spokenComments(1)).toBe('1 comentário');
      expect(spokenComments(12)).toBe('12 comentários');
    });

    it('quando: a hora só aparece hoje e ontem', () => {
      const now = new Date(2026, 9, 12, 18, 0);
      expect(commentWhen(new Date(2026, 9, 12, 10, 23).toISOString(), now)).toBe('hoje às 10:23');
      expect(commentWhen(new Date(2026, 9, 11, 16, 5).toISOString(), now)).toBe('ontem às 16:05');
      expect(commentWhen(new Date(2026, 9, 3, 9, 0).toISOString(), now)).toBe('3 de outubro');
      expect(commentWhen(new Date(2025, 11, 25, 9, 0).toISOString(), now)).toBe('25 de dezembro de 2025');
    });
  });

  describe('citar um trecho da ficha', () => {
    it('cada linha vira uma linha de citação, com os espaços juntos e sem as linhas em branco', () => {
      expect(quoteOf('  Valeu   cada hora.  ')).toBe('> Valeu cada hora.');
      expect(quoteOf('Primeira linha\n\n   \r\n\tSegunda   linha\n')).toBe('> Primeira linha\n> Segunda linha');
      expect(quoteOf('   \n \t ')).toBe('');
    });

    it('o que não cabe é cortado com reticências, e um toco de linha fica de fora', () => {
      const long = 'a'.repeat(600);
      const cut = quoteOf(long, 50);
      expect(cut.length).toBe(50);
      expect(cut).toBe(`> ${'a'.repeat(47)}…`);
      // a segunda linha não cabe inteira: entra o começo dela
      expect(quoteOf('Linha um\nLinha dois que é bem comprida mesmo', 40)).toBe('> Linha um\n> Linha dois que é bem compr…');
      // sobram poucos caracteres depois da primeira: a citação para nela, com as reticências
      expect(quoteOf('Linha um\nLinha dois que é bem comprida', 16)).toBe('> Linha um…');
      // não cabe nem o começo
      expect(quoteOf('Uma frase qualquer', 8)).toBe('');
      expect(quoteOf('Uma frase qualquer', 0)).toBe('');
    });

    it('a citação entra no fim do rascunho, e a resposta começa na linha de baixo, fora dela', () => {
      expect(withQuote('', 'Valeu cada hora.')).toBe('> Valeu cada hora.\n');
      expect(withQuote('Concordo!  \n\n', 'Valeu cada hora.')).toBe('Concordo!\n\n> Valeu cada hora.\n');
      // o que a pessoa escrever depois não faz parte da citação
      const blocks = parseRich(withQuote('', 'Valeu cada hora.') + 'Também achei.');
      expect(blocks.map((b) => b.kind)).toEqual(['quote', 'p']);
    });

    it('nunca passa do limite do comentário; sem lugar (ou sem trecho), não cita', () => {
      const full = withQuote('x'.repeat(300), 'y'.repeat(400));
      expect(full!.length).toBe(COMMENT_MAX);
      expect(full!.endsWith('…\n')).toBeTrue();
      expect(withQuote('x'.repeat(COMMENT_MAX - 5), 'Uma frase qualquer')).toBeNull();
      expect(withQuote('rascunho', '   ')).toBeNull();
    });
  });

  describe('o serviço', () => {
    let calls: { path: string; method: string; body: unknown }[];
    let fail: CloudError | null;
    let cloud: ReturnType<typeof signal<{ api: string } | null>>;
    let signedIn: ReturnType<typeof signal<boolean>>;
    let items: ReturnType<typeof signal<FeedItem[]>>;
    let toasts: string[];
    let thread: unknown[];
    /** Segura a resposta de um pedido (a do GET já pronta, com a conversa de quando foi pedido). */
    let gate: ((path: string, method: string) => Promise<void> | undefined) | null;
    /** A recusa que chega só depois de o pedido ser segurado. */
    let lateFail: ((path: string, method: string) => CloudError | undefined) | null;
    const HADES = { code: ANA, ref: 'r-hades', titulo: 'Hades', mural: 'jogos' as const };

    function make(): Comments {
      TestBed.resetTestingModule();
      calls = [];
      fail = null;
      gate = null;
      lateFail = null;
      toasts = [];
      thread = [raw(1, 'Bia', 'Que final!'), raw(2, 'Caio', 'Concordo.', { reacoes: [{ codigo: 'BBBB-1111', nome: 'Bia', reacao: 'amei', em: at }] })];
      cloud = signal<{ api: string } | null>({ api: 'https://api.teste' });
      signedIn = signal(true);
      items = signal<FeedItem[]>([]);
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          { provide: Cloud, useValue: { config: cloud, ready: Promise.resolve() } },
          {
            provide: CloudAccount,
            useValue: {
              account: signal(ME),
              signedIn,
              request: async (path: string, init: { method?: string; body?: unknown } = {}) => {
                const method = init.method ?? 'GET';
                calls.push({ path, method, body: init.body });
                if (fail) throw fail;
                const answer = (() => {
                  if (method === 'POST') return { comentario: raw(9, 'Eu', String((init.body as { texto: string }).texto).trim()) };
                  if (path === '/v1/eu') return method === 'GET' ? { comentarios: 'seguidos' } : init.body;
                  if (path === `/v1/murais/${ANA}/comentarios`) return { contagem: { 'r-hades': 2, 'r-celeste': 7 }, quem: 'seguidores', pode: true };
                  if (path === `/v1/murais/${ANA}/comentarios/r-hades`) return { comentarios: [...thread], maisAntigos: false, quem: 'seguidores', pode: true };
                  return { contagem: {}, comentarios: [], quem: 'seguidores', pode: false };
                })();
                const held = gate?.(path, method);
                if (held) await held;
                const late = lateFail?.(path, method);
                if (late) throw late;
                return answer;
              },
            },
          },
          { provide: Follow, useValue: { items } },
          { provide: Toasts, useValue: { show: (t: string) => toasts.push(t) } },
        ],
      });
      return TestBed.inject(Comments);
    }

    afterEach(() => TestBed.resetTestingModule());

    it('busca a contagem de um mural e não pede de novo logo em seguida', async () => {
      const s = make();
      expect(s.countOf(ANA, 'r-hades')).toBe(0);
      await s.loadCounts(ANA);
      await s.loadCounts(ANA);
      expect(calls.filter((c) => c.path === `/v1/murais/${ANA}/comentarios`).length).toBe(1);
      expect([s.countOf(ANA, 'r-hades'), s.countOf(ANA, 'r-celeste'), s.countOf(ANA, 'r-outra')]).toEqual([2, 7, 0]);
      await s.loadCounts(ANA, true);
      expect(calls.filter((c) => c.path === `/v1/murais/${ANA}/comentarios`).length).toBe(2);
    });

    it('a conversa de uma ficha chega com quem pode comentar; duas chamadas juntas viram um pedido', async () => {
      const s = make();
      expect(s.thread(ANA, 'r-hades')).toBeUndefined();
      await Promise.all([s.loadThread(HADES), s.loadThread(HADES)]);
      expect(calls.filter((c) => c.path === `/v1/murais/${ANA}/comentarios/r-hades`).length).toBe(1);
      const t = s.thread(ANA, 'r-hades')!;
      expect(t.comentarios.map((k) => k.texto)).toEqual(['Que final!', 'Concordo.']);
      expect(t.pode).toBeTrue();
      expect(s.hasFailed(ANA, 'r-hades')).toBeFalse();
    });

    it('a conversa que veio inteira é a conta da ficha, mesmo com a contagem do mural atrasada', async () => {
      const s = make();
      await s.loadCounts(ANA);
      thread = [raw(1, 'Bia', 'só um')];
      await s.loadThread(HADES);
      expect(s.countOf(ANA, 'r-hades')).toBe(1);
    });

    it('sem rede: a conversa não veio (e diz isso); a de antes, se havia, continua na tela', async () => {
      const s = make();
      fail = new CloudError('Sem conexão com a nuvem agora.', 'sem-rede', 0);
      await s.loadThread(HADES);
      expect(s.hasFailed(ANA, 'r-hades')).toBeTrue();
      fail = null;
      await s.loadThread(HADES, true);
      expect(s.hasFailed(ANA, 'r-hades')).toBeFalse();
      fail = new CloudError('Sem conexão com a nuvem agora.', 'sem-rede', 0);
      await s.loadThread(HADES, true);
      expect(s.hasFailed(ANA, 'r-hades')).toBeFalse();
      expect(s.thread(ANA, 'r-hades')!.comentarios.length).toBe(2);
      expect(toasts).toEqual([]);
    });

    it('com a nuvem desligada, não pede nada', async () => {
      const s = make();
      cloud.set(null);
      await s.loadCounts(ANA);
      await s.loadThread(HADES);
      expect(calls).toEqual([]);
      expect(s.myCode()).toBeNull();
    });

    it('comentar: o comentário entra no fim da conversa quando a nuvem confirma, e a conta sobe', async () => {
      const s = make();
      await s.loadThread(HADES);
      const made = await s.post(HADES, 'Também achei.');
      expect(calls.at(-1)).toEqual({ path: `/v1/murais/${ANA}/comentarios/r-hades`, method: 'POST', body: { texto: 'Também achei.', titulo: 'Hades', mural: 'jogos' } });
      expect(made.autor.codigo).toBe(ME.codigo);
      expect(s.thread(ANA, 'r-hades')!.comentarios.map((k) => k.texto)).toEqual(['Que final!', 'Concordo.', 'Também achei.']);
      expect(s.countOf(ANA, 'r-hades')).toBe(3);
    });

    it('a nuvem recusou o comentário: o erro sobe com a mensagem, e a conversa fica como estava', async () => {
      const s = make();
      await s.loadThread(HADES);
      fail = new CloudError('Siga a pessoa para comentar nas fichas dela.', 'comentar-sem-seguir', 403);
      await expectAsync(s.post(HADES, 'Posso?')).toBeRejectedWith(fail);
      expect(s.thread(ANA, 'r-hades')!.comentarios.length).toBe(2);
    });

    it('responder: a resposta vai com o id do respondido e entra na conversa', async () => {
      const s = make();
      await s.loadThread(HADES);
      await s.post(HADES, 'Né?', id(1));
      expect(calls.at(-1)!.body).toEqual({ texto: 'Né?', titulo: 'Hades', mural: 'jogos', respostaA: id(1) });
      expect(s.countOf(ANA, 'r-hades')).toBe(3);
    });

    it('apagar um comentário com respostas deixa o lugar dele, e a conta desce', async () => {
      const s = make();
      thread = [raw(1, 'Bia', 'Que final!'), raw(2, 'Caio', 'Concordo.', { respostaA: id(1) })];
      await s.loadThread(HADES);
      await s.remove(HADES, id(1));
      expect(s.thread(ANA, 'r-hades')!.comentarios.map((k) => [k.id, !!k.gone])).toEqual([
        [id(1), true],
        [id(2), false],
      ]);
      expect(s.countOf(ANA, 'r-hades')).toBe(1);
    });

    it('o comentário que a conversa deve mostrar ao abrir (o do aviso) vale uma vez, e só para a ficha dele', () => {
      const s = make();
      s.want('r-hades', id(4));
      expect(s.takeFocus('r-celeste')).toBeNull();
      expect(s.takeFocus('r-hades')).toBe(id(4));
      expect(s.takeFocus('r-hades')).toBeNull();
      s.want('r-hades');
      expect(s.takeFocus('r-hades')).toBeNull();
    });

    it('apagar some na hora; se a nuvem recusar, volta e o bilhete diz por quê', async () => {
      const s = make();
      await s.loadThread(HADES);
      expect(await s.remove(HADES, id(1))).toBeTrue();
      expect(calls.at(-1)).toEqual({ path: `/v1/comentarios/${id(1)}`, method: 'DELETE', body: undefined });
      expect(s.thread(ANA, 'r-hades')!.comentarios.map((k) => k.id)).toEqual([id(2)]);

      fail = new CloudError('Só quem escreveu ou o dono da ficha apaga um comentário.', 'comentario-de-outro', 403);
      expect(await s.remove(HADES, id(2))).toBeFalse();
      expect(s.thread(ANA, 'r-hades')!.comentarios.map((k) => k.id)).toEqual([id(2)]);
      expect(toasts).toEqual(['Só quem escreveu ou o dono da ficha apaga um comentário.']);

      // já não existia na nuvem: fica apagado aqui também, sem barulho
      fail = new CloudError('Esse comentário não existe mais.', 'comentario-nao-encontrado', 404);
      expect(await s.remove(HADES, id(2))).toBeTrue();
      expect(s.thread(ANA, 'r-hades')!.comentarios).toEqual([]);
      expect(toasts.length).toBe(1);
    });

    it('reagir a um comentário aparece na hora; trocar substitui; tirar some', async () => {
      const s = make();
      await s.loadThread(HADES);
      const comment = () => s.thread(ANA, 'r-hades')!.comentarios[1];
      expect(s.mineOn(comment())).toBeNull();
      await s.react(HADES, id(2), 'fogo');
      expect(calls.at(-1)).toEqual({ path: `/v1/comentarios/${id(2)}/reacao`, method: 'PUT', body: { reacao: 'fogo' } });
      expect(s.mineOn(comment())).toBe('fogo');
      expect(comment().reacoes.map((r) => r.nome)).toEqual(['Eu', 'Bia']);
      await s.react(HADES, id(2), '🦄');
      expect(comment().reacoes.filter((r) => r.codigo === ME.codigo).map((r) => r.reacao)).toEqual(['🦄']);
      await s.react(HADES, id(2), null);
      expect(calls.at(-1)!.method).toBe('DELETE');
      expect(comment().reacoes.map((r) => r.nome)).toEqual(['Bia']);
    });

    it('a nuvem recusou a reação: volta como era e o bilhete diz por quê; sem conta, nem tenta', async () => {
      const s = make();
      await s.loadThread(HADES);
      fail = new CloudError('Aqui só comenta quem Ana segue.', 'comentar-so-seguidos', 403);
      await s.react(HADES, id(1), 'fogo');
      expect(s.thread(ANA, 'r-hades')!.comentarios[0].reacoes).toEqual([]);
      expect(toasts).toEqual(['Aqui só comenta quem Ana segue.']);
      fail = null;
      signedIn.set(false);
      const before = calls.length;
      await s.react(HADES, id(1), 'fogo');
      expect(calls.length).toBe(before);
    });

    describe('a busca que volta atrasada', () => {
      const GET = `/v1/murais/${ANA}/comentarios/r-hades`;
      const ids = (s: Comments) => s.thread(ANA, 'r-hades')!.comentarios.map((k) => k.id);
      const gets = () => calls.filter((c) => c.path === GET && c.method === 'GET').length;
      /** Segura os pedidos de `method` (em `path`, se vier) até `release`. */
      function holding(method: string, path?: string) {
        let release!: () => void;
        const until = new Promise<void>((res) => (release = res));
        gate = (p, m) => (m === method && (!path || p === path) ? until : undefined);
        return () => release();
      }

      it('não tira da conversa o comentário que entrou enquanto ela vinha: busca de novo', async () => {
        const s = make();
        await s.loadThread(HADES);
        const release = holding('GET');
        const loading = s.loadThread(HADES, true);
        gate = null;
        await s.post(HADES, 'Novo');
        thread = [...thread, raw(9, 'Eu', 'Novo')];
        expect(ids(s)).toEqual([id(1), id(2), id(9)]);
        release();
        await loading;
        expect(ids(s)).toEqual([id(1), id(2), id(9)]);
        expect(gets()).toBe(3);
      });

      it('não traz de volta o comentário apagado enquanto ela vinha', async () => {
        const s = make();
        await s.loadThread(HADES);
        const release = holding('GET');
        const loading = s.loadThread(HADES, true);
        gate = null;
        await s.remove(HADES, id(1));
        thread = thread.slice(1);
        release();
        await loading;
        expect(ids(s)).toEqual([id(2)]);
      });

      it('a que volta com o apagar ainda indo fica de fora, e a conversa é buscada quando ele termina', async () => {
        const s = make();
        await s.loadThread(HADES);
        const release = holding('DELETE');
        const removing = s.remove(HADES, id(1));
        await s.loadThread(HADES, true);
        expect(ids(s)).toEqual([id(2)]);
        thread = thread.slice(1);
        const before = gets();
        release();
        expect(await removing).toBeTrue();
        await s.loadThread(HADES);
        expect(gets()).toBe(before + 1);
        expect(ids(s)).toEqual([id(2)]);
      });

      it('a reação recusada não desfaz o comentário que entrou enquanto ela ia', async () => {
        const s = make();
        await s.loadThread(HADES);
        const release = holding('PUT');
        lateFail = (_, m) => (m === 'PUT' ? new CloudError('Você reagiu a muita coisa hoje. Tente de novo amanhã.', 'reagir-devagar', 429) : undefined);
        const reacting = s.react(HADES, id(1), 'fogo');
        await s.post(HADES, 'Novo');
        thread = [...thread, raw(9, 'Eu', 'Novo')];
        release();
        await reacting;
        await s.loadThread(HADES);
        expect(ids(s)).toEqual([id(1), id(2), id(9)]);
        expect(s.thread(ANA, 'r-hades')!.comentarios[0].reacoes).toEqual([]);
        expect(toasts).toEqual(['Você reagiu a muita coisa hoje. Tente de novo amanhã.']);
      });
    });

    it('os comentários nas minhas fichas chegam ao entrar, e de novo com um aviso no correio', async () => {
      make();
      TestBed.tick();
      await flush();
      const mine = () => calls.filter((c) => c.path === `/v1/murais/${ME.codigo}/comentarios`).length;
      expect(mine()).toBe(1);
      items.set([{ tipo: 'comentou', em: at, pessoa: { codigo: ANA, nome: 'Ana' }, ref: 'r-meu', titulo: 'Hades', mural: 'jogos', silenciado: false }]);
      TestBed.tick();
      await flush();
      expect(mine()).toBe(2);
    });

    it('a ficha que deve abrir com os comentários vale uma vez só', () => {
      const s = make();
      s.want('r-hades');
      expect(s.take('r-celeste')).toBeFalse();
      // pediram uma, abriu outra: o pedido não fica guardado para depois
      expect(s.take('r-hades')).toBeFalse();
      s.want('r-hades');
      expect(s.take('r-hades')).toBeTrue();
      expect(s.take('r-hades')).toBeFalse();
    });

    it('o rascunho fica guardado por ficha, e some quando esvazia', () => {
      const s = make();
      s.setDraft(HADES, 'Começando a escrever');
      expect(s.draftOf(HADES)).toBe('Começando a escrever');
      expect(s.draftOf({ code: ANA, ref: 'r-celeste' })).toBe('');
      s.setDraft(HADES, '   ');
      expect(s.draftOf(HADES)).toBe('');
    });

    it('quem comenta nas suas fichas: vem da nuvem, muda na hora e volta se ela recusar', async () => {
      const s = make();
      expect(s.from()).toBeNull();
      await s.loadFrom();
      expect(s.from()).toBe('seguidos');
      await s.setFrom('seguidores');
      expect(calls.at(-1)).toEqual({ path: '/v1/eu', method: 'PATCH', body: { comentarios: 'seguidores' } });
      expect(s.from()).toBe('seguidores');
      fail = new CloudError('A nuvem está só para leitura agora.', 'nuvem-so-leitura', 503);
      await expectAsync(s.setFrom('seguidos')).toBeRejectedWith(fail);
      expect(s.from()).toBe('seguidores');
    });
  });
});
