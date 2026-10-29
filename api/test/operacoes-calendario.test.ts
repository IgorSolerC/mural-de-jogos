import { describe, expect, it } from 'vitest';
import { regrasDoLembrete, type LembreteV1 } from '../../contrato/api-v1/calendario';
import { camposDoGoogle, conferirOpLembrete, editarLembreteV1, lembreteDoPedido, tirarDiaV1, type CriarLembreteV1 } from '../../contrato/api-v1/operacoes-calendario';
import { ACADEMIA, DENTISTA, FERIAS } from './calendario.suite';

/** As operações no Calendário (contrato/api-v1/operacoes-calendario.ts): a API mostra o lembrete como o site vai deixar. */

const AGORA = '2026-10-29T12:00:00.000Z';

describe('conferir uma operação do Calendário', () => {
  it('criar: o título e o dia são obrigatórios; a repetição ganha o de sempre', () => {
    const r = conferirOpLembrete('lembrete.criar', { titulo: '  Pagar  o aluguel ', dia: '2026-11-05', repete: { cada: 'mes' } });
    expect(r).toEqual({
      ok: true,
      dados: {
        titulo: 'Pagar o aluguel',
        dia: '2026-11-05',
        repete: { cada: 'mes', intervalo: 1, dias_da_semana: [], vez_no_mes: null, so_nos_meses_com_o_dia: false, ate: null, vezes: null },
      },
    });
    const campo = (raw: unknown) => {
      const x = conferirOpLembrete('lembrete.criar', raw);
      return x.ok ? null : x.campo;
    };
    expect(campo({ dia: '2026-11-05' })).toBe('titulo');
    expect(campo({ titulo: 'A', dia: '2026-02-30' })).toBe('dia');
    expect(campo({ titulo: 'A', dia: '2026-11-05', hora: '7:00' })).toBe('hora');
    expect(campo({ titulo: 'A', dia: '2026-11-05', cor: 'preto' })).toBe('cor');
    expect(campo({ titulo: 'A', dia: '2026-11-05', repete: { cada: 'hora' } })).toBe('repete.cada');
    expect(campo({ titulo: 'A', dia: '2026-11-05', repete: { cada: 'semana', dias_da_semana: [7] } })).toBe('repete.dias_da_semana');
    expect(campo({ titulo: 'A', dia: '2026-11-05', repete: { cada: 'mes', ate: '2027-01-01', vezes: 3 } })).toBe('repete.vezes');
    expect(campo({ titulo: 'A', dia: '2026-11-05', notas: Array.from({ length: 13 }, (_, i) => `n${i}`) })).toBe('notas');
  });

  it('editar e apagar pedem a versão; editar pede algo para mudar; apagar aceita o dia', () => {
    expect(conferirOpLembrete('lembrete.editar', { titulo: 'X' }).ok).toBe(false);
    const nada = conferirOpLembrete('lembrete.editar', { versao: AGORA });
    expect(nada.ok === false && nada.campo).toBe('campos');
    expect(conferirOpLembrete('lembrete.editar', { versao: AGORA, hora: null })).toEqual({ ok: true, dados: { versao: AGORA, hora: null } });
    expect(conferirOpLembrete('lembrete.apagar', {}).ok).toBe(false);
    expect(conferirOpLembrete('lembrete.apagar', { versao: AGORA, dia: '2026-10-19' })).toEqual({ ok: true, dados: { versao: AGORA, dia: '2026-10-19' } });
    expect(conferirOpLembrete('lembrete.apagar', { versao: AGORA, dia: 'ontem' }).ok).toBe(false);
  });
});

describe('as regras que juntam os campos', () => {
  const base = { dia: '2026-10-31', hora: null, fim: null, hora_fim: null, repete: null };
  const rep = { cada: 'mes' as const, intervalo: 1, dias_da_semana: [], vez_no_mes: null, so_nos_meses_com_o_dia: false, ate: null, vezes: null };
  it('o fim depois do dia, a hora_fim com hora, o que só vale num jeito de repetir', () => {
    expect(regrasDoLembrete(base)).toBeNull();
    expect(regrasDoLembrete({ ...base, fim: '2026-10-31' })?.campo).toBe('fim');
    expect(regrasDoLembrete({ ...base, fim: '2027-12-31' })?.campo).toBe('fim');
    expect(regrasDoLembrete({ ...base, hora_fim: '10:00' })?.campo).toBe('hora_fim');
    expect(regrasDoLembrete({ ...base, hora: '10:00', hora_fim: '09:00' })?.campo).toBe('hora_fim');
    // com vários dias, a hora do fim é a do último dia: pode ser antes da do começo
    expect(regrasDoLembrete({ ...base, hora: '10:00', fim: '2026-11-01', hora_fim: '09:00' })).toBeNull();
    expect(regrasDoLembrete({ ...base, repete: { ...rep, dias_da_semana: [1] } })?.campo).toBe('repete.dias_da_semana');
    expect(regrasDoLembrete({ ...base, repete: { ...rep, cada: 'dia', vez_no_mes: 2 } })?.campo).toBe('repete.vez_no_mes');
    expect(regrasDoLembrete({ ...base, repete: { ...rep, so_nos_meses_com_o_dia: true } })).toBeNull();
    expect(regrasDoLembrete({ ...base, dia: '2026-10-28', repete: { ...rep, so_nos_meses_com_o_dia: true } })?.campo).toBe('repete.so_nos_meses_com_o_dia');
    expect(regrasDoLembrete({ ...base, repete: { ...rep, ate: '2026-10-01' } })?.campo).toBe('repete.ate');
  });
});

describe('o lembrete como vai ficar', () => {
  it('o de um pedido de criar: sem cor (o Murall sorteia) e sem as palavras da repetição', () => {
    const d = conferirOpLembrete('lembrete.criar', { titulo: 'Dentista', dia: '2026-11-03', hora: '14:30' });
    const l = lembreteDoPedido('lb-novo', (d as { dados: CriarLembreteV1 }).dados, AGORA);
    expect(l).toEqual({
      id: 'lb-novo', titulo: 'Dentista', dia: '2026-11-03', hora: '14:30', fim: null, hora_fim: null, repete: null, em_palavras: null,
      pulados: [], cor: null, silencioso: false, notas: [], google: null, criado_em: AGORA, versao: AGORA,
    } satisfies LembreteV1);
  });

  it('mudar o dia leva o fim junto; tirar a hora tira a hora_fim; tirar a repetição tira os dias pulados', () => {
    const moved = editarLembreteV1(FERIAS, { versao: FERIAS.versao, dia: '2026-12-20' }, AGORA);
    expect(moved).toEqual(expect.objectContaining({ dia: '2026-12-20', fim: '2026-12-25', em_palavras: null, versao: AGORA }));
    expect(editarLembreteV1(DENTISTA, { versao: DENTISTA.versao, hora: null }, AGORA)).toEqual(expect.objectContaining({ hora: null, hora_fim: null }));
    const plain = editarLembreteV1(ACADEMIA, { versao: ACADEMIA.versao, repete: null }, AGORA);
    expect(plain.pulados).toEqual([]);
    // só a cor: as palavras continuam
    expect(editarLembreteV1(ACADEMIA, { versao: ACADEMIA.versao, cor: 'rosa' }, AGORA).em_palavras).toBe(ACADEMIA.em_palavras);
    expect(tirarDiaV1(ACADEMIA, '2026-10-19', AGORA).pulados).toEqual(['2026-10-12', '2026-10-19']);
  });

  it('o lembrete travado pelo Google muda só a cor e as notas', () => {
    expect(camposDoGoogle({ cor: 'azul', notas: [] })).toEqual([]);
    expect(camposDoGoogle({ titulo: 'X', cor: 'azul' })).toEqual(['titulo']);
  });
});
