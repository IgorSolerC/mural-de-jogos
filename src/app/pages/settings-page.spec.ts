import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { Cloud } from '../core/cloud-config';
import { LocalData } from '../core/local-data';
import { Settings } from '../core/settings';
import { SettingsPage } from './settings-page';

/**
 * Os Ajustes, desenhados de verdade: as cinco partes no índice, o endereço que abre cada uma (com o
 * "perfil" de antes indo para a Conta), os interruptores e o teclado do índice. Sem a nuvem.
 */

class MemoryData {
  private readonly map = new Map<string, string>();
  readonly where = 'local';
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  onExternalChange(): void {
    /* sem outras abas */
  }
  takeForeign(): null {
    return null;
  }
}

describe('Ajustes (SettingsPage)', () => {
  let query: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  async function open(aba: string | null) {
    query = new BehaviorSubject(convertToParamMap(aba ? { aba } : {}));
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: LocalData, useClass: MemoryData },
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: () => null, notice: () => null } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: query.value }, queryParamMap: query } },
      ],
    });
    const fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  const tabs = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const opened = (el: HTMLElement) => el.querySelector('[role="tab"][aria-selected="true"]')?.id;

  it('mostra as cinco partes, cada uma com o que tem dentro, e abre na Conta', async () => {
    const { el } = await open(null);
    expect(tabs(el).map((t) => t.querySelector('.etiqueta-nome')?.textContent?.trim())).toEqual(['Conta', 'Mural', 'Amigos', 'Backup', 'Busca']);
    expect(tabs(el).every((t) => !!t.querySelector('.etiqueta-dica')?.textContent?.trim())).toBeTrue();
    expect(opened(el)).toBe('aba-conta');
    expect(el.querySelector('h2')?.textContent).toContain('Conta');
  });

  it('o endereço antigo (aba=perfil) abre a Conta; aba=backup abre o Backup', async () => {
    expect(opened((await open('perfil')).el)).toBe('aba-conta');
    TestBed.resetTestingModule();
    const { el } = await open('backup');
    expect(opened(el)).toBe('aba-backup');
    expect(el.querySelector('h2')?.textContent).toContain('Backup');
  });

  it('os interruptores do Mural ligam e desligam na hora', async () => {
    const { fixture, el } = await open('mural');
    const settings = TestBed.inject(Settings);
    const labels = el.querySelector<HTMLButtonElement>('[role="switch"][aria-labelledby="t-etiquetas"]')!;
    expect(labels.getAttribute('aria-checked')).toBe('true');
    labels.click();
    fixture.detectChanges();
    expect(settings.groupLabels()).toBeFalse();
    expect(labels.getAttribute('aria-checked')).toBe('false');
    const spoilers = el.querySelector<HTMLButtonElement>('[role="switch"][aria-labelledby="t-spoilers"]')!;
    spoilers.click();
    expect(settings.noSpoilers()).toBeTrue();
  });

  it('a nota se escolhe pelo exemplo', async () => {
    const { el } = await open('mural');
    const settings = TestBed.inject(Settings);
    const options = [...el.querySelectorAll<HTMLLabelElement>('.segmento')];
    expect(options.map((o) => o.querySelector('.seg-num')?.textContent?.trim())).toEqual(['8,4', '8,5', '8']);
    options[2].querySelector('input')!.click();
    expect(settings.scoreDisplay()).toBe('inteiro');
    settings.scoreDisplay.set('livre');
  });

  it('as setas andam pelo índice, de pé ou deitado', async () => {
    const { fixture, el } = await open(null);
    const list = el.querySelector('[role="tablist"]')!;
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    expect(opened(el)).toBe('aba-mural');
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(opened(el)).toBe('aba-amigos');
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    fixture.detectChanges();
    expect(opened(el)).toBe('aba-busca');
  });

  it('sem a nuvem, a Busca diz de onde vem cada mural e deixa as chaves à mão', async () => {
    const { el } = await open('busca');
    const rows = [...el.querySelectorAll('.fontes > div')].map((r) => r.textContent?.replace(/\s+/g, ' ').trim());
    expect(rows[0]).toContain('Wikipedia');
    expect(rows[1]).toContain('Open Library');
    expect(el.querySelector<HTMLDetailsElement>('details.chaves')?.open).toBeTrue();
    expect(el.querySelector('#tmdb-key')).not.toBeNull();
    expect(el.querySelector('#rawg-key')).not.toBeNull();
    // a escolha Wikipedia/RAWG saiu: a busca usa a RAWG sempre que há chave
    expect(el.querySelector('input[name="fonte"]')).toBeNull();
  });
});
