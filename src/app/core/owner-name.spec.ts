import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { backupFileName } from './backup';
import { ownerNameOf, parseBackupSnapshot, readBackupFile } from './backup-file';
import { nameFromFile } from './comparison-stats';
import { ReviewStore } from './review-store';

describe('o seu nome no backup', () => {
  it('o arquivo leva o nome, sem caracteres que o sistema recusa', () => {
    expect(backupFileName('Igor', '2026-10-05', 'json.gz')).toBe('meu-mural-de-igor-2026-10-05.json.gz');
    expect(backupFileName('  João Pedro ', '2026-10-05', 'json')).toBe('meu-mural-de-joão-pedro-2026-10-05.json');
    expect(backupFileName('a/b:c*?', '2026-10-05', 'json.gz')).toBe('meu-mural-de-a-b-c-2026-10-05.json.gz');
    expect(backupFileName('', '2026-10-05', 'json.gz')).toBe('meu-mural-2026-10-05.json.gz');
  });

  it('o Comparar tira o nome do arquivo, mesmo sem ler o que tem dentro', () => {
    expect(nameFromFile(backupFileName('Igor', '2026-10-05', 'json.gz'))).toBe('Igor');
    expect(nameFromFile(backupFileName('João Pedro', '2026-10-05', 'json.gz'))).toBe('João Pedro');
  });

  it('o nome vai dentro do backup e volta na leitura', async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const store = TestBed.inject(ReviewStore);
    const { blob } = await store.exportBackup('  Marina ');
    const text = await readBackupFile(blob);
    expect(JSON.parse(text).owner).toEqual({ name: 'Marina' });
    expect(parseBackupSnapshot(text).ownerName).toBe('Marina');
    // sem nome, o campo nem aparece; e backups antigos continuam abrindo
    const plain = await readBackupFile((await store.exportBackup('')).blob);
    expect('owner' in JSON.parse(plain)).toBeFalse();
    expect(parseBackupSnapshot(plain).ownerName).toBeNull();
    expect(ownerNameOf({ owner: { name: 42 } })).toBeNull();
    localStorage.clear();
  });
});
