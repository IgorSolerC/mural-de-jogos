import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { gzip } from './backup-file';
import { CloudAccount } from './cloud-account';
import { FreeBoard, sanitizeFreeBoard } from './free-board';
import { VisitBoards } from './visit-boards';

const board = (id: string, nome: string): FreeBoard =>
  sanitizeFreeBoard({ v: 1, id, nome, grupo: 'Jogos', em: '2026-11-09T00:00:00.000Z', publico: true, n: [], e: [] })!;

describe('a visita no Quadro livre: os quadros públicos de quem você visita', () => {
  let list: { id: string; rev: number }[];
  let stored: Map<string, FreeBoard>;
  let calls: string[];

  beforeEach(() => {
    calls = [];
    stored = new Map([['visitaQuadroLivre00001', board('visitaQuadroLivre00001', 'Mansão')]]);
    list = [{ id: 'visitaQuadroLivre00001', rev: 1 }];
    const requestRaw = async (path: string) => {
      calls.push(path);
      if (path.endsWith('/quadros')) return new Response(JSON.stringify({ quadros: list }));
      const id = path.split('/').at(-1)!;
      return new Response(await gzip(JSON.stringify(stored.get(id))));
    };
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: CloudAccount, useValue: { requestRaw } }] });
  });

  it('conferir de novo traz o quadro que virou público, e só baixa os novos ou mudados', async () => {
    const v = TestBed.inject(VisitBoards);
    await v.load('ANA00001');
    expect(v.boards().map((b) => b.nome)).toEqual(['Mansão']);
    // a pessoa tornou outro quadro público enquanto o amigo visitava
    stored.set('visitaQuadroLivre00002', board('visitaQuadroLivre00002', 'Verbos'));
    list = [...list, { id: 'visitaQuadroLivre00002', rev: 1 }];
    calls = [];
    await v.load('ANA00001');
    expect(calls).withContext('dentro dos minutos, nem a lista').toEqual([]);
    await v.load('ANA00001', true);
    expect(calls).toEqual(['/v1/murais/ANA00001/quadros', '/v1/murais/ANA00001/quadros/visitaQuadroLivre00002']);
    expect(v.boards().map((b) => b.nome).sort()).toEqual(['Mansão', 'Verbos']);
  });
});
