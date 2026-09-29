import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { hash } from '../core/paper';
import { PaperDefs } from './paper-layer';

/**
 * Os filtros de papel que os desenhos aprovados usam: nenhum deles muda por tabela. Um filtro novo
 * entra com um id novo; mudar um destes de propósito é mudar todos os desenhos que o usam.
 */
const FROZEN_FILTERS: Record<string, string> = {
  'papel-lapis': '10esj0q.628',
  'papel-fibra': '1juguik.303',
  'papel-mancha': '1pfmatb.302',
  'papel-agua': 'i2jm2l.782',
  'papel-borra': 'y0w0i6.131',
  'papel-tostado': '1a6ouk.814',
  'papel-tostado-pequeno': 'c3pp2i.418',
  'papel-fuligem-larga': '1swqqwu.141',
  'papel-fuligem-estreita': '1ybj87c.144',
  'papel-fuligem-larga-pequena': '1yinbcn.149',
  'papel-fuligem-estreita-pequena': 'ppshyt.152',
  'papel-borda-queimada': '14t19ti.140',
  'papel-relevo': '1wpkq8r.421',
  // 2026-09-29, segunda leva de estragos
  'papel-fio': '1ooehc.128',
  'papel-poeira': '12bc1uz.722',
  'papel-lama': '4n2khj.626',
  'papel-mofo': 'motce7.405',
};

describe('os filtros do papel', () => {
  it('os filtros dos desenhos aprovados continuam os mesmos', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(PaperDefs);
    fixture.detectChanges();
    const now: Record<string, string> = {};
    fixture.nativeElement.querySelectorAll('filter').forEach((f: Element) => {
      const s = f.outerHTML.replace(/\s_ng(content|host)-[\w-]+=""/g, '').replace(/\s+/g, ' ');
      now[f.id] = `${hash(s).toString(36)}.${s.length}`;
    });
    for (const [id, p] of Object.entries(FROZEN_FILTERS)) expect(now[id]).withContext(id).toBe(p);
    // um filtro novo também entra aqui, congelado, assim que o desenho que o usa for aprovado
    expect(Object.keys(now).filter((id) => !(id in FROZEN_FILTERS))).withContext('filtros sem digital').toEqual([]);
  });
});
