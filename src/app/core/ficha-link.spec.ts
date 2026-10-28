import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { parseBackupSnapshot } from './backup-file';
import { CloudAccount, CloudError } from './cloud-account';
import { FichaLinks, fichaLink, hasLink, isFichaPath, readLinkedMural, startsClosed } from './ficha-link';

/**
 * O link de uma ficha: o endereço, o mural público lido com as anotações só no Kanban (que o mural de
 * quem visita não mostra) e a busca na nuvem, que não guarda nada neste navegador.
 */

const at = '2026-10-20T12:00:00.000Z';
const card = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: 'anotacoes',
  game: { name, coverUrl: null, source: 'manual' },
  scores: {},
  status: 'finalizado',
  difficulty: 'nenhuma',
  verdict: null,
  completedAt: '2026-10-20',
  createdAt: at,
  updatedAt: at,
  ...extra,
});
const mural = {
  app: 'meu-mural',
  version: 2,
  owner: { name: 'Igor' },
  reviews: [{ ...card('rjogo0001', 'Hades'), kind: 'jogos', scores: { historia: 8, diversao: 9, jogabilidade: 9, visual: 9 } }],
  notas: [card('nmur0001', 'Reunião', { publishedAt: at })],
  soKanban: [card('nkan0001', 'Corrigir o login', { publishedAt: at }), card('npriv001', 'Salário', { private: true })],
  perfil: { page: 'lousa' },
};

describe('O link da ficha', () => {
  it('o endereço leva o código e o id, pela rota da ficha', () => {
    expect(fichaLink('ABCD-1234', 'nkan0001', 'https://murall.igorsc.com.br/')).toBe('https://murall.igorsc.com.br/#/ficha/ABCD-1234/nkan0001');
    expect(isFichaPath('/ficha/ABCD-1234/nkan0001')).toBeTrue();
    expect(isFichaPath('/fichas')).toBeFalse();
    expect(isFichaPath('/anotacoes')).toBeFalse();
  });

  it('o link que começa com a ficha fechada leva ?aberta=nao; à mão, também false e 0', () => {
    const base = 'https://murall.igorsc.com.br/';
    expect(fichaLink('ABCD-1234', 'nkan0001', base, true)).toBe('https://murall.igorsc.com.br/#/ficha/ABCD-1234/nkan0001');
    expect(fichaLink('ABCD-1234', 'nkan0001', base, false)).toBe('https://murall.igorsc.com.br/#/ficha/ABCD-1234/nkan0001?aberta=nao');
    for (const v of ['nao', 'não', 'NAO', 'false', '0', ' nao ']) expect(startsClosed(v)).withContext(v).toBeTrue();
    for (const v of [null, '', 'sim', 'true', '1', 'qualquer']) expect(startsClosed(v)).withContext(String(v)).toBeFalse();
  });

  it('toda ficha que não é privada tem link', () => {
    expect(hasLink({})).toBeTrue();
    expect(hasLink({ private: true })).toBeFalse();
  });

  it('lê as anotações só no Kanban junto das outras (sem as privadas); o mural de quem visita não as vê', () => {
    const text = JSON.stringify(mural);
    const linked = readLinkedMural(text);
    expect(linked.cards.map((r) => r.id).sort()).toEqual(['nkan0001', 'nmur0001', 'rjogo0001']);
    expect(linked.ownerName).toBe('Igor');
    expect(linked.profile?.page).toBe('lousa');
    expect(parseBackupSnapshot(text).reviews.map((r) => r.id).sort()).toEqual(['nmur0001', 'rjogo0001']);
  });

  describe('a busca na nuvem', () => {
    let reply: (path: string) => Promise<Response>;
    let links: FichaLinks;
    const gz = async (data: unknown) => new Response(new Blob([JSON.stringify(data)]).stream().pipeThrough(new CompressionStream('gzip'))).blob();

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          { provide: CloudAccount, useValue: { requestRaw: (path: string) => reply(path), signedIn: signal(false), account: signal(null) } },
        ],
      });
      links = TestBed.inject(FichaLinks);
    });

    it('acha a ficha do mural público (até a só no Kanban), com o código do jeito da nuvem', async () => {
      const asked: string[] = [];
      const body = await gz(mural);
      reply = async (path) => {
        asked.push(path);
        return new Response(body);
      };
      const found = await links.fetch('abcd1234', 'nkan0001');
      expect(asked).toEqual(['/v1/murais/ABCD-1234']);
      expect(found.kind).toBe('ok');
      if (found.kind === 'ok') {
        expect(found.card.game.name).toBe('Corrigir o login');
        expect(found.code).toBe('ABCD-1234');
        expect(found.mural.cards.length).toBe(3);
      }
    });

    it('a privada (ou apagada) não está à mostra; um código que não existe não abre nada; a nuvem fora diz por quê', async () => {
      const body = await gz(mural);
      reply = async () => new Response(body);
      expect((await links.fetch('ABCD-1234', 'npriv001')).kind).toBe('sem-ficha');
      expect((await links.fetch('ABCD-1234', 'sumiu0001')).kind).toBe('sem-ficha');
      expect((await links.fetch('não é código', 'nkan0001')).kind).toBe('sem-codigo');
      reply = async () => {
        throw new CloudError('Não achei mural com esse código.', 'mural-nao-encontrado', 404);
      };
      expect((await links.fetch('ABCD-1234', 'nkan0001')).kind).toBe('sem-codigo');
      // a nuvem que só mostra os murais com conta (VER_MURAIS=logados): entrar, não "confira a internet"
      reply = async () => {
        throw new CloudError('Sua sessão acabou. Entre de novo para usar a nuvem.', 'sessao-invalida', 401);
      };
      expect(await links.fetch('ABCD-1234', 'nkan0001')).toEqual({ kind: 'entrar' });
      reply = async () => {
        throw new CloudError('Sem conexão com a nuvem agora.', 'sem-rede', 0);
      };
      expect(await links.fetch('ABCD-1234', 'nkan0001')).toEqual({ kind: 'erro', message: 'Não deu para falar com a nuvem. Confira a internet e toque em Tentar de novo.' });
      reply = async () => new Response('não é um gzip nem JSON');
      expect(await links.fetch('ABCD-1234', 'nkan0001')).toEqual({ kind: 'erro', message: 'O mural de quem escreveu veio estragado da nuvem. Tente de novo daqui a pouco.' });
    });
  });
});
