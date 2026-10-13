import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { Cloud } from '../core/cloud-config';
import { LocalData } from '../core/local-data';
import { Settings } from '../core/settings';
import { Confirm } from '../ui/confirm';
import { SettingsPage } from './settings-page';

/**
 * Os Ajustes, desenhados de verdade: as seis partes no índice, o endereço que abre cada uma (com o
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

  it('mostra as seis partes, cada uma com o que tem dentro, e abre na Conta', async () => {
    const { el } = await open(null);
    expect(tabs(el).map((t) => t.querySelector('.etiqueta-nome')?.textContent?.trim())).toEqual(['Conta', 'Mural', 'Amigos', 'Backup', 'Busca', 'Desempenho']);
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

  it('Desempenho: abre no Equilíbrio; cada predefinição liga e desliga as escolhas e marca a página', async () => {
    const { fixture, el } = await open('desempenho');
    const settings = TestBed.inject(Settings);
    const root = document.documentElement.classList;
    const preset = (id: string) => el.querySelector<HTMLInputElement>(`input[name="qualidade"][value="${id}"]`)!;
    const toggle = (id: string) => el.querySelector<HTMLButtonElement>(`[role="switch"][aria-labelledby="t-${id}"]`)!;
    const on = () => ['camadas', 'sombra', 'lapis', 'paradas', 'poucas'].filter((id) => toggle(id).getAttribute('aria-checked') === 'true');
    const pick = async (id: string) => {
      preset(id).checked = true;
      preset(id).dispatchEvent(new Event('change'));
      fixture.detectChanges();
      await fixture.whenStable();
    };

    expect(el.querySelector('h2')?.textContent).toContain('Desempenho');
    expect(preset('equilibrio').checked).toBeTrue();
    expect(on()).toEqual(['camadas']);
    expect(root.contains('camadas')).toBeTrue();

    await pick('desempenho');
    expect(settings.performancePreset()).toBe('desempenho');
    expect(on()).toEqual(['camadas', 'sombra', 'lapis', 'paradas', 'poucas']);
    expect(['camadas', 'sombra-reta', 'lapis-liso', 'fichas-paradas'].every((c) => root.contains(c))).toBeTrue();
    expect(JSON.parse(localStorage.getItem('mural-de-jogos:config:v1')!)).toEqual(
      jasmine.objectContaining({ cardLayers: true, straightShadows: true, plainPencil: true, stillCards: true, fewCards: true }),
    );
    expect(settings.atDefaults()).toBeFalse();

    await pick('qualidade');
    expect(on()).toEqual([]);
    expect(['camadas', 'sombra-reta', 'lapis-liso', 'fichas-paradas'].some((c) => root.contains(c))).toBeFalse();

    // uma escolha mexida à mão: nenhuma das três fica marcada, e a página diz que é uma mistura
    toggle('lapis').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(settings.plainPencil()).toBeTrue();
    expect(settings.performancePreset()).toBeNull();
    expect(['desempenho', 'equilibrio', 'qualidade'].some((id) => preset(id).checked)).toBeFalse();
    expect(el.querySelector('#d-qualidade')?.textContent).toContain('Do seu jeito');
    expect(root.contains('lapis-liso')).toBeTrue();

    settings.resetPreferences();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(settings.performancePreset()).toBe('equilibrio');
    expect(preset('equilibrio').checked).toBeTrue();
    expect(root.contains('lapis-liso')).toBeFalse();
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
    expect(opened(el)).toBe('aba-desempenho');
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

describe('Ajustes: prévias e Voltar ao padrão', () => {
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

  it('passar o mouse num ajuste mostra o que ele muda, ao vivo', async () => {
    const { fixture, el } = await open('mural');
    const side = () => el.querySelector('.previa-lado');
    expect(side()?.textContent).toContain('Passe o mouse');
    const row = el.querySelector('[role="switch"][aria-labelledby="t-etiquetas"]')!.closest('.linha')!;
    row.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(side()?.querySelectorAll('.p-fita').length).toBe(2);
    (row.querySelector('[role="switch"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(side()?.querySelectorAll('.p-fita').length).toBe(0);
    expect(side()?.textContent).toContain('As fichas correm juntas');
  });

  it('a prévia das notas mostra o 8,4 como ele aparece', async () => {
    const { fixture, el } = await open('mural');
    const settings = TestBed.inject(Settings);
    el.querySelector('fieldset.linha')!.dispatchEvent(new FocusEvent('focusin'));
    fixture.detectChanges();
    expect(el.querySelector('.previa-lado strong')?.textContent).toBe('8,4');
    settings.scoreDisplay.set('metade');
    fixture.detectChanges();
    expect(el.querySelector('.previa-lado strong')?.textContent).toBe('8,5');
    settings.scoreDisplay.set('livre');
  });

  it('Voltar ao padrão: pergunta, volta as escolhas de Mural e Amigos e deixa o nome e as chaves', async () => {
    const { fixture, el } = await open('mural');
    const settings = TestBed.inject(Settings);
    const confirm = TestBed.inject(Confirm);
    const button = () => el.querySelector<HTMLButtonElement>('.padrao')!;
    expect(button().disabled).toBeTrue();
    settings.groupLabels.set(false);
    settings.noSpoilers.set(true);
    settings.friendKinds.set('separado');
    settings.mailCount.set(false);
    settings.scoreDisplay.set('inteiro');
    settings.ownerName.set('Igor');
    settings.setKey('rawg', 'minha');
    fixture.detectChanges();
    expect(button().disabled).toBeFalse();

    const ask = spyOn(confirm, 'ask').and.resolveTo(false);
    button().click();
    await fixture.whenStable();
    expect(settings.groupLabels()).toBeFalse();

    ask.and.resolveTo(true);
    button().click();
    await fixture.whenStable();
    expect(ask.calls.mostRecent().args[0].text).toContain('não mudam');
    expect(settings.atDefaults()).toBeTrue();
    expect(settings.groupLabels()).toBeTrue();
    expect(settings.noSpoilers()).toBeFalse();
    expect(settings.friendKinds()).toBe('misturado');
    expect(settings.mailCount()).toBeTrue();
    expect(settings.scoreDisplay()).toBe('livre');
    expect(settings.ownerName()).toBe('Igor');
    expect(settings.rawgKey()).toBe('minha');
    fixture.detectChanges();
    expect(button().disabled).toBeTrue();
  });
});
