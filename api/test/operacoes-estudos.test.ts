import { describe, expect, it } from 'vitest';
import { diaDeEstudo, filaDeAgora, type FilaDoDiaV1 } from '../../contrato/api-v1/estudos';
import { conferirOp, opMuda } from '../../contrato/api-v1/operacoes';
import { acharBaralho, conferirOpEstudo, moverBaralho } from '../../contrato/api-v1/operacoes-estudos';

/** O contrato das operações dos Estudos (contrato/api-v1/operacoes-estudos.ts) e a fila de agora. */
describe('as operações dos Estudos', () => {
  it('o baralho: nome de 1 a 40 letras, cor, novas por dia, estilo; mudar pede algo', () => {
    expect(conferirOpEstudo('baralho.criar', { nome: '  Japonês  ' })).toEqual({ ok: true, dados: { nome: 'Japonês' } });
    expect(conferirOpEstudo('baralho.criar', { nome: '' }).ok).toBe(false);
    expect(conferirOpEstudo('baralho.criar', { nome: 'x'.repeat(41) }).ok).toBe(false);
    expect(conferirOpEstudo('baralho.criar', { nome: 'x', cor: 'roxo' }).ok).toBe(false);
    expect(conferirOpEstudo('baralho.criar', { nome: 'x', novas_por_dia: 2.5 }).ok).toBe(false);
    expect(conferirOpEstudo('baralho.criar', { nome: 'x', novas_por_dia: 1000 }).ok).toBe(false);
    expect(conferirOpEstudo('baralho.criar', { nome: 'x', estilo: 'neon' }).ok).toBe(false);
    expect(conferirOpEstudo('baralho.editar', {})).toMatchObject({ ok: false, campo: 'campos' });
    expect(conferirOpEstudo('baralho.editar', { posicao: -1 }).ok).toBe(false);
    expect(conferirOpEstudo('baralho.editar', { posicao: 2, no_mural: true })).toEqual({ ok: true, dados: { posicao: 2, no_mural: true } });
  });

  it('a carta: os baralhos sem repetir (sem ligar para acento), a frente numa linha, a imagem só https', () => {
    expect(conferirOpEstudo('carta.por', { baralhos: ['Japonês', 'japones', 'Kanji'], titulo: ' 火 \n ', subtitulo: '' })).toEqual({
      ok: true,
      dados: { baralhos: ['Japonês', 'Kanji'], titulo: '火', subtitulo: null },
    });
    expect(conferirOpEstudo('carta.por', { baralhos: [] }).ok).toBe(false);
    expect(conferirOpEstudo('carta.por', { baralhos: Array.from({ length: 21 }, (_, i) => `b${i}`) }).ok).toBe(false);
    expect(conferirOpEstudo('carta.por', { baralhos: ['a'], titulo: 'x'.repeat(81) }).ok).toBe(false);
    expect(conferirOpEstudo('carta.por', { baralhos: ['a'], imagem: 'data:image/png;base64,AAAA' }).ok).toBe(false);
    expect(conferirOpEstudo('carta.por', { baralhos: ['a'], no_mural: 'sim' }).ok).toBe(false);
    expect(conferirOpEstudo('carta.editar', {})).toMatchObject({ ok: false, campo: 'campos' });
    expect(conferirOpEstudo('carta.editar', { imagem: null, no_mural: null })).toEqual({ ok: true, dados: { imagem: null, no_mural: null } });
    expect(conferirOpEstudo('carta.responder', { acertou: 1 }).ok).toBe(false);
    expect(conferirOpEstudo('carta.responder', { acertou: false, baralho: ' Kanji ' })).toEqual({ ok: true, dados: { acertou: false, baralho: 'Kanji' } });
    expect(conferirOpEstudo('carta.tirar', { qualquer: 1 })).toEqual({ ok: true, dados: {} });
  });

  it('criar_nota com estudos: confere os baralhos e a frente', () => {
    expect(conferirOp('nota.criar', { titulo: 'Rio', estudos: { baralhos: ['Kanji'], titulo: '川' } })).toMatchObject({ ok: true, dados: { estudos: { baralhos: ['Kanji'], titulo: '川' } } });
    expect(conferirOp('nota.criar', { titulo: 'Rio', estudos: { baralhos: [] } })).toMatchObject({ ok: false, campo: 'estudos.baralhos' });
    expect(conferirOp('nota.criar', { titulo: 'Rio', estudos: { baralhos: ['a'], imagem: 'ftp://x' } })).toMatchObject({ ok: false, campo: 'estudos.imagem' });
  });

  it('responder, pôr e criar baralho entram direto com a aprovação "mudancas"; mudar, tirar, apagar e recomeçar esperam', () => {
    expect(['baralho.criar', 'carta.por', 'carta.responder'].map((op) => opMuda(op))).toEqual([false, false, false]);
    expect(['baralho.editar', 'baralho.apagar', 'carta.editar', 'carta.tirar', 'carta.recomecar'].map((op) => opMuda(op))).toEqual([true, true, true, true, true]);
  });

  it('o baralho pelo id ou pelo nome; mover refaz as posições', () => {
    const decks = [
      { id: 'a', nome: 'Japonês', posicao: 0 },
      { id: 'b', nome: 'Kanji', posicao: 1 },
      { id: 'c', nome: 'Grego', posicao: 2 },
    ];
    expect(acharBaralho(decks, 'JAPONES')?.id).toBe('a');
    expect(acharBaralho(decks, 'c')?.nome).toBe('Grego');
    expect(acharBaralho(decks, 'Latim')).toBeNull();
    expect(moverBaralho(decks, 'c', 0).map((d) => `${d.id}${d.posicao}`)).toEqual(['c0', 'a1', 'b2']);
    expect(moverBaralho(decks, 'a', 99).map((d) => `${d.id}${d.posicao}`)).toEqual(['b0', 'c1', 'a2']);
  });
});

describe('a fila de agora', () => {
  const t0 = Date.parse('2026-10-06T15:00:00Z');
  const at = (min: number) => new Date(t0 + min * 60_000).toISOString();
  const fila: FilaDoDiaV1 = {
    dia: '2026-10-06',
    cortada: false,
    itens: [
      { nota: 'b', baralho: 'x', tipo: 'aprender', volta_em: at(5) },
      { nota: 'a', baralho: 'x', tipo: 'aprender', volta_em: at(-3) },
      { nota: 'c', baralho: 'x', tipo: 'aprender', volta_em: at(90) },
      { nota: 'r', baralho: 'x', tipo: 'revisao', volta_em: null },
      { nota: 'n', baralho: 'x', tipo: 'nova', volta_em: null },
    ],
  };

  it('como a sessão do app: a que já voltou, revisões e novas, a dos próximos 20 minutos; o resto mais tarde', () => {
    const q = filaDeAgora(fila, new Date(t0));
    expect(q.agora.map((i) => i.nota)).toEqual(['a', 'r', 'n', 'b']);
    expect(q.mais_tarde.map((i) => i.nota)).toEqual(['c']);
    expect(q.contagem).toEqual({ novas: 1, aprender: 2, revisar: 1 });
    expect(filaDeAgora(fila, new Date(t0 + 91 * 60_000)).agora.map((i) => i.nota)).toEqual(['a', 'b', 'c', 'r', 'n']);
    expect(filaDeAgora(fila, new Date(t0), new Set(['a', 'n'])).agora.map((i) => i.nota)).toEqual(['r', 'b']);
  });

  it('o dia de estudo vira às 4h no fuso dado', () => {
    const sp = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    expect(diaDeEstudo(new Date('2026-10-07T06:59:00Z'), sp)).toBe('2026-10-06');
    expect(diaDeEstudo(new Date('2026-10-07T07:00:00Z'), sp)).toBe('2026-10-07');
  });
});
