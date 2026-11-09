import {
  MAX_FOLDER_DEPTH,
  NoteFolder,
  TOMBSTONE_DAYS,
  folderTree,
  foldersOfGroupMoved,
  isFolderId,
  newFolderId,
  prunedFolders,
  publicFolders,
  sanitizeFolders,
  subjectFolderId,
  uniqueFolderName,
  withCategory,
  withDissolvedFolder,
  withFolder,
  withJoinedFolder,
  withLiveFolder,
  withMovedFolder,
  withNewFolder,
  withRenamedFolder,
} from './folders';

const AT = '2026-11-09T12:00:00.000Z';
const f = (id: string, name: string, parent: string | null = null, group = 'estudos', extra: Partial<NoteFolder> = {}): NoteFolder => ({ id, group, name, parent, ...extra });

// Estudos › Programação › Funcional, Estudos › Programação › Scripts, Estudos › História; Trabalho › Reuniões
const BASE: NoteFolder[] = [
  f('pprog000001', 'Programação'),
  f('pfunc000001', 'Funcional', 'pprog000001'),
  f('pscri000001', 'Scripts', 'pprog000001'),
  f('phist000001', 'História'),
  f('preun000001', 'Reuniões', null, 'trabalho'),
];

describe('as pastas das anotações (core/folders.ts)', () => {
  describe('o id', () => {
    it('o de um assunto é o mesmo em todo aparelho (sem caixa nem acento); o novo é aleatório', () => {
      expect(subjectFolderId('Estudos', 'História')).toBe(subjectFolderId(' estudos ', 'historia'));
      expect(subjectFolderId('Estudos', 'História')).not.toBe(subjectFolderId('Trabalho', 'História'));
      expect(isFolderId(subjectFolderId('Estudos', 'História'))).toBeTrue();
      const a = newFolderId();
      expect(isFolderId(a)).toBeTrue();
      expect(a).not.toBe(newFolderId());
      expect(isFolderId('n1')).toBeFalse();
      expect(isFolderId(42)).toBeFalse();
    });
  });

  describe('o guardado', () => {
    it('só ids válidos e únicos, nomes limpos, o grupo como chave', () => {
      const out = sanitizeFolders([
        { id: 'pabc000001', group: ' Estudos ', name: '  java   script ' },
        { id: 'pabc000001', group: 'estudos', name: 'repetida' },
        { id: 'x', group: 'estudos', name: 'id ruim' },
        { id: 'pabc000002', group: 'estudos', name: '   ' },
        'lixo',
        { id: 'pabc000003', name: 'sem grupo', gone: 'não é data' },
      ]);
      // o nome ganha a maiúscula, como o grupo e o assunto
      expect(out).toEqual([f('pabc000001', 'Java script'), f('pabc000003', 'Sem grupo', null, '')]);
      expect(sanitizeFolders(null)).toEqual([]);
    });

    it('o pai precisa existir, ser do mesmo grupo e não fazer ciclo', () => {
      const out = sanitizeFolders([
        f('pa00000001', 'A', 'pb00000001'),
        f('pb00000001', 'B', 'pa00000001'),
        f('pc00000001', 'C', 'pzz0000001'),
        f('pd00000001', 'D', 'preun000001'),
        f('preun000001', 'Reuniões', null, 'trabalho'),
        f('pe00000001', 'E', 'pe00000001'),
      ]);
      // o pai que não existe vira a raiz
      expect(out.map((x) => x.parent)).toEqual([null, null, null, null, null, null]);
    });

    it('não passa do teto de níveis', () => {
      const chain = Array.from({ length: MAX_FOLDER_DEPTH + 3 }, (_, i) => f(`pn${String(i).padStart(8, '0')}`, `N${i}`, i ? `pn${String(i - 1).padStart(8, '0')}` : null));
      const out = sanitizeFolders(chain);
      expect(out.filter((x) => x.parent === null).length).toBeGreaterThan(1);
      expect(Math.max(...out.map((x) => folderTree(out).path(x.id).length))).toBeLessThanOrEqual(MAX_FOLDER_DEPTH);
    });
  });

  describe('a árvore', () => {
    const tree = folderTree(BASE);

    it('as de dentro de A a Z, o caminho e as de baixo', () => {
      expect(tree.kids('estudos', null).map((x) => x.name)).toEqual(['História', 'Programação']);
      expect(tree.kids('estudos', 'pprog000001').map((x) => x.name)).toEqual(['Funcional', 'Scripts']);
      expect(tree.path('pfunc000001').map((x) => x.name)).toEqual(['Programação', 'Funcional']);
      expect([...tree.below('pprog000001')].sort()).toEqual(['pfunc000001', 'pprog000001', 'pscri000001']);
      expect(tree.kids('trabalho', null).map((x) => x.name)).toEqual(['Reuniões']);
    });

    it('a pasta da anotação vale só no grupo dela; sem pasta viva, solta na raiz', () => {
      expect(tree.of({ category: 'Estudos', folder: 'pfunc000001' })).toBe('pfunc000001');
      expect(tree.of({ category: 'Trabalho', folder: 'pfunc000001' })).toBeNull();
      expect(tree.of({ category: 'Estudos', folder: 'pnaoexiste1' })).toBeNull();
      expect(tree.of({ category: 'Estudos' })).toBeNull();
    });
  });

  describe('mudar o grupo', () => {
    it('mudando de grupo, a anotação sai da pasta; só a caixa ou o acento, fica', () => {
      const n: { category?: string; folder?: string; text: string } = { category: 'Estudos', folder: 'pfunc000001', text: 'x' };
      expect(withCategory(n, 'Trabalho')).toEqual({ category: 'Trabalho', text: 'x' });
      expect(withCategory(n, null)).toEqual({ text: 'x' });
      expect(withCategory(n, 'estudos')).toEqual({ category: 'estudos', folder: 'pfunc000001', text: 'x' });
      expect(withFolder(n, null)).toEqual({ category: 'Estudos', text: 'x' });
    });
  });

  describe('as mudanças', () => {
    it('criar: o nome sem repetir as irmãs ("Nova pasta 2"), dentro do pai do mesmo grupo', () => {
      const tree = folderTree(BASE);
      expect(uniqueFolderName(tree, 'estudos', 'pprog000001', 'scripts')).toBe('Scripts 2');
      expect(uniqueFolderName(tree, 'estudos', null, 'Scripts')).toBe('Scripts');
      const { folders, folder } = withNewFolder(BASE, 'Estudos', 'pprog000001', '', 'pnova000001');
      expect(folder).toEqual(f('pnova000001', 'Nova pasta', 'pprog000001'));
      const again = withNewFolder(folders, 'Estudos', 'pprog000001', '', 'pnova000002');
      expect(again.folder!.name).toBe('Nova pasta 2');
      // o pai de outro grupo não vale: vai para a raiz
      expect(withNewFolder(BASE, 'Estudos', 'preun000001', 'X', 'px00000001').folder!.parent).toBeNull();
    });

    it('a lápide com o mesmo id volta à vida', () => {
      const dead = withDissolvedFolder(BASE, 'phist000001', AT);
      const { folders } = withNewFolder(dead, 'Estudos', null, 'História', 'phist000001');
      expect(folders.find((x) => x.id === 'phist000001')).toEqual(f('phist000001', 'História'));
    });

    it('renomear não junta nem aceita nome vazio', () => {
      expect(withRenamedFolder(BASE, 'phist000001', '  História Geral ')[3].name).toBe('História Geral');
      expect(withRenamedFolder(BASE, 'phist000001', '  ')[3].name).toBe('História');
    });

    it('mover: nunca para dentro dela mesma, de uma de dentro ou de outro grupo', () => {
      expect(withMovedFolder(BASE, 'phist000001', 'pfunc000001').find((x) => x.id === 'phist000001')!.parent).toBe('pfunc000001');
      expect(withMovedFolder(BASE, 'pprog000001', 'pfunc000001')).toEqual(BASE);
      expect(withMovedFolder(BASE, 'pprog000001', 'pprog000001')).toEqual(BASE);
      expect(withMovedFolder(BASE, 'phist000001', 'preun000001')).toEqual(BASE);
      expect(withMovedFolder(BASE, 'pfunc000001', null).find((x) => x.id === 'pfunc000001')!.parent).toBeNull();
    });

    it('desfazer: vira lápide, as de dentro sobem e as anotações sobem pela leitura', () => {
      const out = withDissolvedFolder(BASE, 'pprog000001', AT);
      const tree = folderTree(out);
      expect(out.find((x) => x.id === 'pprog000001')!.gone).toBe(AT);
      expect(tree.kids('estudos', null).map((x) => x.name)).toEqual(['Funcional', 'História', 'Scripts']);
      expect(tree.of({ category: 'Estudos', folder: 'pprog000001' })).toBeNull();
      // a de dentro desfeita leva as anotações para a de cima
      const inner = folderTree(withDissolvedFolder(BASE, 'pfunc000001', AT));
      expect(inner.of({ category: 'Estudos', folder: 'pfunc000001' })).toBe('pprog000001');
    });

    it('juntar: as de dentro e as anotações vão para a outra', () => {
      const out = withJoinedFolder(BASE, 'pscri000001', 'phist000001', AT);
      const tree = folderTree(out);
      expect(tree.of({ category: 'Estudos', folder: 'pscri000001' })).toBe('phist000001');
      expect(tree.kids('estudos', 'pprog000001').map((x) => x.name)).toEqual(['Funcional']);
      // nunca para dentro de uma de dentro, nem entre grupos
      expect(withJoinedFolder(BASE, 'pprog000001', 'pfunc000001', AT)).toEqual(BASE);
      expect(withJoinedFolder(BASE, 'phist000001', 'preun000001', AT)).toEqual(BASE);
    });

    it('o grupo renomeado leva as pastas; juntado, as de cima de mesmo nome viram uma', () => {
      const renamed = foldersOfGroupMoved(BASE, 'Trabalho', 'Empresa', AT);
      expect(folderTree(renamed).kids('empresa', null).map((x) => x.name)).toEqual(['Reuniões']);
      const both = [...BASE, f('phist000002', 'historia', null, 'trabalho')];
      const joined = folderTree(foldersOfGroupMoved(both, 'Trabalho', 'Estudos', AT));
      expect(joined.kids('estudos', null).map((x) => x.name)).toEqual(['História', 'Programação', 'Reuniões']);
      expect(joined.of({ category: 'Estudos', folder: 'phist000002' })).toBe('phist000001');
      // apagado: para o Sem grupo
      expect(folderTree(foldersOfGroupMoved(BASE, 'Trabalho', null, AT)).kids('', null).map((x) => x.name)).toEqual(['Reuniões']);
    });

    it('a lápide velha sai quando ninguém aponta mais para ela', () => {
      const dead = withDissolvedFolder(BASE, 'phist000001', '2026-01-01T00:00:00.000Z');
      const now = Date.parse('2026-01-01T00:00:00.000Z') + (TOMBSTONE_DAYS + 1) * 86_400_000;
      expect(prunedFolders(dead, [], now).some((x) => x.id === 'phist000001')).toBeFalse();
      expect(prunedFolders(dead, [{ folder: 'phist000001' }], now).some((x) => x.id === 'phist000001')).toBeTrue();
      expect(prunedFolders(dead, [], now - 2 * 86_400_000).some((x) => x.id === 'phist000001')).toBeTrue();
    });
  });

  describe('o mural público', () => {
    it('só as pastas com alguma anotação à mostra (e as de cima dela), com a lápide resolvida', () => {
      const dead = withDissolvedFolder(BASE, 'pscri000001', AT);
      const tree = folderTree(dead);
      const shown: { category?: string; folder?: string }[] = [
        { category: 'Estudos', folder: 'pfunc000001' },
        { category: 'Estudos', folder: 'pscri000001' },
      ];
      expect(publicFolders(tree, shown).map((x) => x.name).sort()).toEqual(['Funcional', 'Programação']);
      expect(withLiveFolder(tree, shown[1])).toEqual({ category: 'Estudos', folder: 'pprog000001' });
      expect(withLiveFolder(tree, { category: 'Trabalho', folder: 'pfunc000001' } as { category?: string; folder?: string })).toEqual({ category: 'Trabalho' });
    });
  });
});
