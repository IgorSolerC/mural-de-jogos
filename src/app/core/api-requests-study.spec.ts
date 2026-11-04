import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { applyStudyRequest, deckNames, placeInDecks, studyTitle, studyWords, undoStudy } from './api-requests-study';
import { undoable } from './api-requests';
import { studyDay } from './fsrs';
import { ReviewStore } from './review-store';
import { Review, sanitizeReview } from './review';
import { StudyStore } from './study-store';

/** Uma anotação de verdade, para a carta ter de onde sair. */
function note(id: string, name: string): Review {
  return sanitizeReview({ id, kind: 'anotacoes', category: 'Estudos', game: { name, coverUrl: null, source: 'manual' }, scores: { final: 0 }, status: 'finalizado', difficulty: 'nenhuma', text: '', createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z' })!;
}

describe('os pedidos dos Estudos aplicados pelo site (core/api-requests-study.ts)', () => {
  let study: StudyStore;
  const names: Record<string, string> = { nsol: 'Sol', nlua: 'Lua', nmar: 'Mar' };
  const offWall = new Set<string>();
  const ctx = { ownNote: (id: string) => (names[id] ? { name: names[id]! } : undefined), onWall: (id: string) => !offWall.has(id) };
  const now = () => new Date().toISOString();
  const req = (op: string, alvo: string, dados: unknown = {}, criado_em = now()) => ({ op, alvo, dados, criado_em });
  /** Aplica e devolve o resultado com o que o histórico guardaria (para o Desfazer). */
  const run = (op: string, alvo: string, dados: unknown = {}, criado_em = now()) => {
    const out = applyStudyRequest(study, req(op, alvo, dados, criado_em), ctx);
    // o `antes` vai e volta da nuvem como JSON
    return { ...out, antes: JSON.parse(JSON.stringify(out.antes)) as unknown };
  };

  beforeEach(() => {
    localStorage.clear();
    offWall.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    TestBed.inject(ReviewStore).reviews.set([note('nsol', 'Sol'), note('nlua', 'Lua'), note('nmar', 'Mar')]);
    study = TestBed.inject(StudyStore);
  });

  afterEach(() => localStorage.clear());

  it('criar o baralho com o id do pedido (de novo, o mesmo), com o resto dos campos; o nome repetido não entra; o Desfazer tira', () => {
    const r = run('baralho.criar', 'dgrego', { nome: 'Grego', cor: 'verde', novas_por_dia: 12, no_mural: true, estilo: 'selo' });
    expect(r.estado).toBe('aplicado');
    expect(study.deck('dgrego')).toEqual(jasmine.objectContaining({ name: 'Grego', color: 'verde', newPerDay: 12, wall: true, look: 'selo' }));
    expect(run('baralho.criar', 'dgrego', { nome: 'Grego' }).estado).toBe('aplicado');
    expect(study.decks().length).toBe(1);
    expect(run('baralho.criar', 'doutro', { nome: 'grego' })).toEqual(jasmine.objectContaining({ estado: 'falhou' }));
    expect(undoable({ estado: 'aplicado', op: 'baralho.criar', antes: null })).toBeTrue();
    undoStudy(study, { op: 'baralho.criar', alvo: 'dgrego', antes: null });
    expect(study.deck('dgrego')).toBeUndefined();
  });

  it('mudar e apagar o baralho; o Desfazer devolve o nome, o lugar e as cartas que saíram junto', () => {
    const a = study.addDeck('Kanji', 'amarelo');
    const b = study.addDeck('Grego', 'azul');
    study.addCard('nsol', [a], { title: '日' });
    study.addCard('nlua', [a, b]);
    const edit = run('baralho.editar', a, { nome: 'Kanji N5', posicao: 1 });
    expect(study.decks().map((d) => d.name)).toEqual(['Grego', 'Kanji N5']);
    undoStudy(study, { op: 'baralho.editar', alvo: a, antes: edit.antes });
    expect(study.decks().map((d) => d.name)).toEqual(['Kanji', 'Grego']);
    const del = run('baralho.apagar', a);
    expect(study.deck(a)).toBeUndefined();
    // a do Sol só estava nele e saiu dos Estudos; a da Lua ficou no Grego
    expect(study.cardOf().has('nsol')).toBeFalse();
    expect(study.cardOf().get('nlua')!.decks).toEqual([b]);
    undoStudy(study, { op: 'baralho.apagar', alvo: a, antes: del.antes });
    expect(study.decks().map((d) => d.name)).toEqual(['Kanji', 'Grego']);
    expect(study.cardOf().get('nsol')!.front.title).toBe('日');
    expect(study.cardOf().get('nlua')!.decks).toEqual([a, b]);
    expect(run('baralho.apagar', 'nada').estado).toBe('falhou');
  });

  it('virar carta: a anotação do mural continua lá; a só no Kanban segue os baralhos; a que já é carta soma os baralhos', () => {
    const a = study.addDeck('Kanji', 'amarelo');
    const b = study.addDeck('Grego', 'azul');
    const put = run('carta.por', 'nsol', { baralhos: [a], titulo: '日', subtitulo: 'hi' });
    expect(put.estado).toBe('aplicado');
    expect(study.cardOf().get('nsol')).toEqual(jasmine.objectContaining({ decks: [a], front: { title: '日', subtitle: 'hi' }, wall: true }));
    expect(put.resultado).toEqual({ carta: { nota: 'nsol', titulo: '日', baralhos: [a], nivel: 'desconhecida', volta_em: null } });
    offWall.add('nlua');
    run('carta.por', 'nlua', { baralhos: [a] });
    expect(study.cardOf().get('nlua')!.wall).toBeUndefined();
    const more = run('carta.por', 'nsol', { baralhos: [b, 'dsumiu'] });
    expect(study.cardOf().get('nsol')!.decks).toEqual([a, b]);
    expect((more.resultado as { aviso?: string }).aviso).toContain('não existe mais');
    // o Desfazer: a que já era carta volta como era; a nova sai
    undoStudy(study, { op: 'carta.por', alvo: 'nsol', antes: more.antes });
    expect(study.cardOf().get('nsol')!.decks).toEqual([a]);
    undoStudy(study, { op: 'carta.por', alvo: 'nsol', antes: put.antes });
    expect(study.cardOf().has('nsol')).toBeFalse();
    expect(run('carta.por', 'nsumida', { baralhos: [a] }).estado).toBe('falhou');
    expect(run('carta.por', 'nmar', { baralhos: ['dsumiu'] }).estado).toBe('falhou');
  });

  it('mudar a carta (a frente por cima, os baralhos trocados, o "no mural" de volta aos baralhos), tirar e recomeçar, com Desfazer', () => {
    const a = study.addDeck('Kanji', 'amarelo');
    const b = study.addDeck('Grego', 'azul');
    study.addCard('nsol', [a], { title: '日', subtitle: 'hi' }, true);
    const edit = run('carta.editar', 'nsol', { subtitulo: null, imagem: 'https://exemplo.com/sol.png', baralhos: [b], no_mural: null });
    expect(study.cardOf().get('nsol')).toEqual(jasmine.objectContaining({ decks: [b], front: { title: '日', image: 'https://exemplo.com/sol.png' } }));
    expect(study.cardOf().get('nsol')!.wall).toBeUndefined();
    undoStudy(study, { op: 'carta.editar', alvo: 'nsol', antes: edit.antes });
    expect(study.cardOf().get('nsol')).toEqual(jasmine.objectContaining({ decks: [a], front: { title: '日', subtitle: 'hi' }, wall: true }));
    study.answer('nsol', true, a);
    const reset = run('carta.recomecar', 'nsol');
    expect(study.cardOf().get('nsol')!.stats.seen).toBe(0);
    undoStudy(study, { op: 'carta.recomecar', alvo: 'nsol', antes: reset.antes });
    expect(study.cardOf().get('nsol')!.stats.seen).toBe(1);
    const out = run('carta.tirar', 'nsol');
    expect(study.cardOf().has('nsol')).toBeFalse();
    undoStudy(study, { op: 'carta.tirar', alvo: 'nsol', antes: out.antes });
    expect(study.cardOf().get('nsol')!.stats.seen).toBe(1);
    expect(run('carta.editar', 'nlua', { titulo: 'x' }).estado).toBe('falhou');
  });

  it('responder: o FSRS conta a hora do pedido; o dia anota a nova no baralho; o Desfazer devolve a carta e desconta', () => {
    const a = study.addDeck('Kanji', 'amarelo');
    const b = study.addDeck('Grego', 'azul');
    study.addCard('nsol', [a, b]);
    const when = new Date(Date.now() - 5 * 60_000);
    const r = run('carta.responder', 'nsol', { acertou: true, baralho: b }, when.toISOString());
    expect(r.estado).toBe('aplicado');
    const card = study.cardOf().get('nsol')!;
    expect(card.srs.last).toBe(when.toISOString());
    // gravada com a hora de agora (a junção não perde a resposta)
    expect(card.at > when.toISOString()).toBeTrue();
    expect(study.state().today!.news).toEqual({ [b]: 1 });
    undoStudy(study, { op: 'carta.responder', alvo: 'nsol', antes: r.antes });
    expect(study.cardOf().get('nsol')!.srs.state).toBe('nova');
    expect(study.state().today!.news).toEqual({ [b]: 0 });
  });

  it('o Desfazer não passa por cima do que veio depois: as respostas da sessão ficam', () => {
    const a = study.addDeck('Kanji', 'amarelo');
    study.addCard('nsol', [a], { title: '日' });
    const ans = run('carta.responder', 'nsol', { acertou: true }, new Date(Date.now() - 60_000).toISOString());
    study.answer('nsol', true, a);
    const seen = study.cardOf().get('nsol')!.stats.seen;
    expect(seen).toBe(2);
    undoStudy(study, { op: 'carta.responder', alvo: 'nsol', antes: ans.antes });
    expect(study.cardOf().get('nsol')!.stats.seen).toBe(2);
    // mudar a frente e depois responder: o Desfazer volta a frente e deixa a resposta
    const edit = run('carta.editar', 'nsol', { titulo: 'Sol', no_mural: false });
    study.answer('nsol', false, a);
    undoStudy(study, { op: 'carta.editar', alvo: 'nsol', antes: edit.antes });
    expect(study.cardOf().get('nsol')!.front.title).toBe('日');
    expect(study.cardOf().get('nsol')!.wall).toBeUndefined();
    expect(study.cardOf().get('nsol')!.stats.seen).toBe(3);
    // tirada e posta de volta na tela: o Desfazer do tirar não troca a de agora pela de antes
    const out = run('carta.tirar', 'nsol');
    study.addCard('nsol', [a], { title: 'nova' });
    undoStudy(study, { op: 'carta.tirar', alvo: 'nsol', antes: out.antes });
    expect(study.cardOf().get('nsol')!.front.title).toBe('nova');
  });

  it('virar carta numa anotação que já é carta só soma os baralhos (a frente e o mural ficam)', () => {
    const a = study.addDeck('Kanji', 'amarelo');
    const b = study.addDeck('Grego', 'azul');
    study.addCard('nsol', [a], { title: '日' }, true);
    run('carta.por', 'nsol', { baralhos: [b], titulo: 'outro', no_mural: false });
    expect(study.cardOf().get('nsol')).toEqual(jasmine.objectContaining({ decks: [a, b], front: { title: '日' }, wall: true }));
  });

  it('responder um pedido mais velho que a última resposta é conflito; o de outro dia não mexe nos números de hoje', () => {
    const a = study.addDeck('Kanji', 'amarelo');
    study.addCard('nsol', [a]);
    study.addCard('nlua', [a]);
    const old = new Date(Date.now() - 60_000).toISOString();
    study.answer('nsol', true, a);
    expect(run('carta.responder', 'nsol', { acertou: false }, old).estado).toBe('conflito');
    const today = study.state().today!;
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
    expect(studyDay(twoDaysAgo) < today.day).toBeTrue();
    run('carta.responder', 'nlua', { acertou: true }, twoDaysAgo.toISOString());
    expect(study.cardOf().get('nlua')!.stats.seen).toBe(1);
    expect(study.state().today).toEqual(jasmine.objectContaining({ day: today.day, news: today.news, reviews: today.reviews }));
  });

  it('as frases e os nomes: o baralho pelo nome de agora, a carta pela frente', () => {
    const a = study.addDeck('Kanji', 'amarelo');
    study.addCard('nsol', [a], { title: '日' });
    const n = deckNames(study);
    expect(studyWords('carta.por', { baralhos: [a, 'dsumiu'] }, 'Sol', false, n)).toBe('Pôr “Sol” nos baralhos Kanji e um baralho que não existe mais');
    expect(studyWords('carta.por', { baralhos: [a] }, 'Sol', true, n)).toBe('pôs “Sol” no baralho Kanji');
    expect(studyWords('carta.responder', { acertou: false }, '日', true, n)).toBe('respondeu “日”: errou');
    expect(studyWords('baralho.editar', { nome: 'x', posicao: 0 }, 'Kanji', false, n)).toBe('Mudar o nome e o lugar do baralho “Kanji”');
    expect(studyWords('baralho.editar', { novas_por_dia: 3, no_mural: true }, 'Kanji', true, n)).toBe('mudou as novas por dia e o mural do baralho “Kanji”');
    expect(studyWords('carta.editar', { baralhos: [a], no_mural: true }, '日', false, n)).toBe('Mudar os baralhos e onde ela aparece de “日” nos Estudos');
    expect(studyWords('nota.criar', {}, 'x', false, n)).toBeNull();
    const nameOf = (id: string) => names[id];
    expect(studyTitle(study, nameOf, { op: 'carta.tirar', alvo: 'nsol', dados: {} })).toBe('日');
    expect(studyTitle(study, nameOf, { op: 'carta.por', alvo: 'nlua', dados: {} })).toBe('Lua');
    expect(studyTitle(study, nameOf, { op: 'baralho.editar', alvo: a, dados: { nome: 'Novo' } })).toBe('Kanji');
    expect(studyTitle(study, nameOf, { op: 'baralho.criar', alvo: 'dnovo', dados: { nome: 'Novo' } })).toBe('Novo');
    expect(studyTitle(study, nameOf, { op: 'baralho.apagar', alvo: 'dfoi', dados: {}, antes: { baralho: { name: 'Antigo' } } })).toBe('Antigo');
  });

  it('a nota nova de um pedido já nasce carta e segue os baralhos (fora do mural, se eles não pedem)', () => {
    const a = study.addDeck('Kanji', 'amarelo');
    expect(placeInDecks(study, 'nmar', { baralhos: [a], titulo: '海' })).toBeNull();
    expect(study.cardOf().get('nmar')).toEqual(jasmine.objectContaining({ decks: [a], front: { title: '海' } }));
    expect(study.cardOf().get('nmar')!.wall).toBeUndefined();
    expect(placeInDecks(study, 'nlua', { baralhos: ['dsumiu'] })).toContain('sem carta');
  });
});
