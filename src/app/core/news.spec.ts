import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { Cloud, CloudNotice } from './cloud-config';
import { NEWS, News, NewsEntry, VERSION, firstSeen, isSeen, nextVersion, noticeOf, readSeen, today } from './news';
import { ReviewStore } from './review-store';

const entry = (id: string, date: string, extra: Partial<NewsEntry> = {}): NewsEntry => ({ id, version: '1.0.0', kind: 'update', date, title: id, items: ['x'], ...extra });

describe('novidades', () => {
  it('a lista vem da mais nova para a mais velha, com ids únicos e datas válidas', () => {
    const ids = NEWS.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const n of NEWS) {
      expect(n.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(n.items.length).toBeGreaterThan(0);
      if (n.until) expect(n.until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const dates = NEWS.map((n) => n.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('as versões: a primeira é a 1.0.0; um update sobe o do meio, um bugfix sobe o último', () => {
    const oldest = [...NEWS].reverse();
    expect(oldest[0].version).toBe('1.0.0');
    expect(oldest[0].kind).toBe('update');
    for (let i = 1; i < oldest.length; i++) {
      expect(oldest[i].version).withContext(oldest[i].id).toBe(nextVersion(oldest[i - 1].version, oldest[i].kind));
    }
    expect(VERSION).toBe(NEWS[0].version);
    expect(nextVersion('1.9.3', 'update')).toBe('1.10.0');
    expect(nextVersion('1.9.3', 'bugfix')).toBe('1.9.4');
  });

  it('a entrada separada de uma antiga já conta como vista para quem viu a antiga', () => {
    const ids = new Set(NEWS.map((n) => n.id));
    for (const n of NEWS) if (n.was) expect(ids.has(n.was)).withContext(n.id).toBeTrue();
    const split = entry('b-correcoes', '2026-10-02', { kind: 'bugfix', was: 'b' });
    expect(isSeen(split, new Set(['b']))).toBeTrue();
    expect(isSeen(split, new Set(['a']))).toBeFalse();
    expect(isSeen(split, new Set(['b-correcoes']))).toBeTrue();
  });

  it('hoje no fuso de quem usa', () => {
    expect(today(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('quem chega agora não recebe notícia velha; quem já tinha mural vê só a mais nova', () => {
    const news = [entry('c', '2026-10-03'), entry('b', '2026-10-02'), entry('a', '2026-10-01')];
    expect(firstSeen(news, false)).toEqual(['c', 'b', 'a']);
    expect(firstSeen(news, true)).toEqual(['b', 'a']);
  });

  describe('a faixa do topo', () => {
    const news = [entry('c', '2026-10-03', { notice: 'Saiu a C' }), entry('b', '2026-10-02', { notice: 'Saiu a B' })];

    it('mostra a novidade mais nova com aviso, até ser vista', () => {
      expect(noticeOf(news, null, new Set(), '2026-10-05')).toEqual({ key: 'c', text: 'Saiu a C', news: true });
      expect(noticeOf(news, null, new Set(['c']), '2026-10-05')).toBeNull();
    });

    it('fechar a mais nova nunca traz uma mais velha no lugar', () => {
      expect(noticeOf(news, null, new Set(['c']), '2026-10-05')).toBeNull();
    });

    it('uma atualização sem aviso não esconde a faixa da anterior', () => {
      expect(noticeOf([entry('d', '2026-10-04'), ...news], null, new Set(), '2026-10-05')?.key).toBe('c');
      expect(noticeOf([entry('d', '2026-10-04'), ...news], null, new Set(['c']), '2026-10-05')).toBeNull();
    });

    it('respeita o prazo, inclusive o próprio dia', () => {
      const until = [entry('c', '2026-10-03', { notice: 'C', until: '2026-10-10' })];
      expect(noticeOf(until, null, new Set(), '2026-10-10')).not.toBeNull();
      expect(noticeOf(until, null, new Set(), '2026-10-11')).toBeNull();
    });

    it('o aviso da nuvem vem antes, sem link, e é visto à parte', () => {
      const cloud: CloudNotice = { id: 'manutencao', text: 'Manutenção hoje' };
      expect(noticeOf(news, cloud, new Set(), '2026-10-05')).toEqual({ key: 'nuvem:manutencao', text: 'Manutenção hoje', news: false });
      expect(noticeOf(news, cloud, new Set(['nuvem:manutencao']), '2026-10-05')?.key).toBe('c');
      expect(noticeOf(news, { ...cloud, until: '2026-10-04' }, new Set(), '2026-10-05')?.key).toBe('c');
    });
  });

  it('lê o que ficou guardado e ignora o que não serve', () => {
    expect(readSeen(null)).toBeNull();
    expect(readSeen('{quebrado')).toBeNull();
    expect(readSeen('{"vistas": "a"}')).toBeNull();
    expect(readSeen('{"vistas": ["a", 2, "b"]}')).toEqual(['a', 'b']);
  });

  describe('no navegador', () => {
    const KEY = 'meu-mural:novidades';
    let saved: string | null;

    beforeEach(() => {
      saved = localStorage.getItem(KEY);
      localStorage.removeItem(KEY);
    });

    afterEach(() => {
      if (saved === null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, saved);
    });

    function make(hasContent: boolean, notice: CloudNotice | null = null): News {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          { provide: Cloud, useValue: { notice: signal(notice), config: signal(null), ready: Promise.resolve() } },
          { provide: ReviewStore, useValue: { hasContent: () => hasContent } },
        ],
      });
      return TestBed.inject(News);
    }

    it('primeira visita sem mural: nada novo, nenhuma faixa', () => {
      const news = make(false);
      expect(news.unseen()).toBe(0);
      expect(news.notice()).toBeNull();
      expect(readSeen(localStorage.getItem(KEY))?.length).toBe(NEWS.length);
    });

    it('quem já tinha mural vê a mais nova; abrir a página conta tudo como visto', () => {
      const news = make(true);
      expect(news.unseen()).toBe(1);
      expect([...news.unseenIds()]).toEqual([NEWS[0].id]);
      // a mais nova pode não ter aviso; a faixa é a da mais nova que tem, se ainda não foi vista
      const withNotice = NEWS.find((n) => n.notice);
      expect(news.notice()?.key).toBe(withNotice && withNotice.id === NEWS[0].id ? withNotice.id : undefined);
      news.seeAll();
      expect(news.unseen()).toBe(0);
      expect(news.notice()).toBeNull();
      // e continua assim na próxima abertura
      expect(make(true).unseen()).toBe(0);
    });

    it('fechar o aviso da nuvem guarda só ele', () => {
      const news = make(false, { id: 'manutencao', text: 'Manutenção' });
      expect(news.notice()?.key).toBe('nuvem:manutencao');
      news.dismiss('nuvem:manutencao');
      expect(news.notice()).toBeNull();
      expect(make(false, { id: 'manutencao', text: 'Manutenção' }).notice()).toBeNull();
      expect(make(false, { id: 'manutencao-2', text: 'De novo' }).notice()?.key).toBe('nuvem:manutencao-2');
    });
  });
});
