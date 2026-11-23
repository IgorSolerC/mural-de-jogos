import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { routes } from '../app.routes';
import { CALENDAR_PATH, NOTE_SECTIONS, REVIEW_SECTIONS, SPENDING_PATH, areaOf, listOf, muralFree, reviewPath, reviewPlace, sectionOf, wallPath } from './areas';
import { Mural } from './mural';

@Component({ template: '' })
class Blank {}

describe('as três partes do site', () => {
  it('cada caminho mora numa parte (ou em nenhuma)', () => {
    expect(areaOf('/anotacoes')).toBe('anotacoes');
    expect(areaOf('/analises/livros/pra-depois?x=1')).toBe('analises');
    expect(areaOf('/analises')).toBe('analises');
    // Outros (no código, `extras`): os jogos, os números, o Calendário e os Gastos
    for (const p of ['/extras', '/extras/muraldle', '/ranking', '/comparar', '/comparar/mural', '/extras/gastos?mes=2026-09', '/extras/calendario?vista=dia'])
      expect(areaOf(p)).withContext(p).toBe('extras');
    // as Utilidades não existem mais: os endereços de antes só redirecionam
    expect(areaOf('/utilidades/gastos')).toBeNull();
    for (const p of ['/', '/perfil', '/perfil/ABC123', '/amigos', '/ajustes', '/novidades', '/analisesx', '/utilidadesx']) expect(areaOf(p)).withContext(p).toBeNull();
  });

  it('os endereços das Análises e das paredes', () => {
    expect(reviewPath('series')).toBe('/analises/series');
    expect(reviewPath('jogos', 'wishlist')).toBe('/analises/jogos/wishlist');
    expect(wallPath('anotacoes')).toBe('/anotacoes');
    expect(wallPath('musicas')).toBe('/analises/musicas');
    expect(reviewPlace('/analises/livros/pra-depois#x')).toEqual({ kind: 'livros', section: 'pra-depois' });
    expect(reviewPlace('/analises/livros')).toEqual({ kind: 'livros', section: '' });
    expect(reviewPlace('/anotacoes')).toBeNull();
  });

  it('a seção aberta: o lado a lado é uma vista do mural', () => {
    expect(sectionOf('/analises/jogos', REVIEW_SECTIONS)?.label).toBe('Mural');
    expect(sectionOf('/analises/jogos/lado-a-lado', REVIEW_SECTIONS)?.label).toBe('Mural');
    expect(sectionOf('/analises/jogos/pra-depois', REVIEW_SECTIONS)?.label).toBe('Pra depois');
    expect(sectionOf('/analises/filmes/wishlist?ordem=1', REVIEW_SECTIONS)?.label).toBe('Wishlist');
    expect(sectionOf('/anotacoes', NOTE_SECTIONS)?.label).toBe('Mural');
  });

  it('o botão de adicionar e o N sabem quando estão numa lista', () => {
    expect(listOf('/analises/animes/pra-depois')).toBe('fila');
    expect(listOf('/analises/animes/wishlist')).toBe('wishlist');
    expect(listOf('/analises/animes')).toBeNull();
    expect(listOf('/anotacoes')).toBeNull();
    expect(listOf('/extras')).toBeNull();
  });

  describe('o mural aberto sai do endereço', () => {
    let router: Router;
    let mural: Mural;

    beforeEach(() => {
      localStorage.clear();
      // as páginas de verdade não importam aqui: só os caminhos, os redirecionamentos e as guardas
      const blank = (r: (typeof routes)[number]): (typeof routes)[number] => ({
        ...r,
        loadComponent: r.loadComponent ? () => Blank : undefined,
        children: r.children?.map(blank),
      });
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter(routes.map(blank))] });
      router = TestBed.inject(Router);
      mural = TestBed.inject(Mural);
    });

    afterEach(() => localStorage.clear());

    it('as Análises abrem o mural do endereço, e o último de resenhas fica guardado', async () => {
      await router.navigateByUrl('/analises/livros/wishlist');
      expect(mural.kind()).toBe('livros');
      await router.navigateByUrl('/anotacoes');
      expect(mural.kind()).toBe('anotacoes');
      expect(mural.reviewKind()).withContext('as anotações não apagam o último mural de resenhas').toBe('livros');
      await router.navigateByUrl('/analises');
      expect(router.url).toBe('/analises/livros');
      expect(mural.kind()).toBe('livros');
    });

    it('os Gastos também moram em Outros: o endereço de antes leva para lá com o mês, e /utilidades abre Outros', async () => {
      expect(SPENDING_PATH).toBe('/extras/gastos');
      expect(muralFree(SPENDING_PATH)).toBe(true);
      await router.navigateByUrl('/utilidades/gastos?mes=2026-09');
      expect(router.url).toBe('/extras/gastos?mes=2026-09');
      await router.navigateByUrl('/utilidades');
      expect(router.url).toBe('/extras');
      // entrar nos Gastos não troca o mural aberto
      mural.kind.set('anotacoes');
      await router.navigateByUrl(SPENDING_PATH);
      expect(mural.kind()).toBe('anotacoes');
    });

    it('um mural que não existe (ou o de anotações) nas Análises vai para o último de resenhas, na mesma seção', async () => {
      await router.navigateByUrl('/analises/filmes');
      await router.navigateByUrl('/analises/anotacoes/pra-depois');
      expect(router.url).toBe('/analises/filmes/pra-depois');
      await router.navigateByUrl('/analises/qualquer');
      expect(router.url).toBe('/analises/filmes');
    });

    it('um endereço que não existe (ou uma seção que o mural não tem) leva à última parede aberta, não a uma página em branco', async () => {
      await router.navigateByUrl('/analises/livros');
      for (const url of ['/qualquer', '/analises/xyz/lixo', '/analises/jogos/lixo', '/anotacoes/nada/mais']) {
        await router.navigateByUrl(url);
        expect(router.url).withContext(url).toBe('/analises/livros');
      }
      await router.navigateByUrl('/anotacoes');
      await router.navigateByUrl('/qualquer');
      expect(router.url).toBe('/anotacoes');
    });

    it('"Murall" leva à última parede aberta', async () => {
      await router.navigateByUrl('/anotacoes');
      await router.navigateByUrl('/perfil');
      await router.navigateByUrl('/');
      expect(router.url).toBe('/anotacoes');
      await router.navigateByUrl('/analises/series');
      await router.navigateByUrl('/ajustes');
      await router.navigateByUrl('/');
      expect(router.url).toBe('/analises/series');
    });

    it('os endereços antigos chegam na seção certa do último mural', async () => {
      await router.navigateByUrl('/analises/animes');
      await router.navigateByUrl('/fila');
      expect(router.url).toBe('/analises/animes/pra-depois');
      await router.navigateByUrl('/wishlist');
      expect(router.url).toBe('/analises/animes/wishlist');
      await router.navigateByUrl('/lado-a-lado');
      expect(router.url).toBe('/analises/animes/lado-a-lado');
    });

    it('o Calendário mora em Outros, e os dois endereços de antes levam para lá com o dia e o lembrete', async () => {
      expect(CALENDAR_PATH).toBe('/extras/calendario');
      expect(muralFree(CALENDAR_PATH)).toBe(true);
      expect(NOTE_SECTIONS.map((s) => s.label)).toEqual(['Mural', 'Kanban', 'Flashcards', 'Quadro livre']);
      for (const antes of ['/anotacoes/calendario', '/utilidades/calendario']) {
        await router.navigateByUrl(antes + '?vista=dia&dia=2026-11-02&lembrete=rk2x9abc');
        expect(router.url).withContext(antes).toBe('/extras/calendario?vista=dia&dia=2026-11-02&lembrete=rk2x9abc');
        await router.navigateByUrl(antes);
        expect(router.url).withContext(antes).toBe('/extras/calendario');
      }
      // entrar no Calendário não troca o mural aberto (como nos Gastos)
      mural.kind.set('livros');
      await router.navigateByUrl(CALENDAR_PATH);
      expect(mural.kind()).toBe('livros');
    });

    it('Extras, vindo das anotações, abre no último mural de resenhas', async () => {
      await router.navigateByUrl('/analises/musicas');
      await router.navigateByUrl('/anotacoes');
      await router.navigateByUrl('/extras/estatisticas');
      expect(mural.kind()).toBe('musicas');
      // o mural de um colega pode ser o de anotações: lá ninguém troca nada
      mural.kind.set('anotacoes');
      await router.navigateByUrl('/comparar/mural');
      expect(mural.kind()).toBe('anotacoes');
    });

    it('o Perfil, Amigos e os Ajustes não mexem no mural', async () => {
      await router.navigateByUrl('/analises/livros');
      for (const p of ['/perfil', '/amigos', '/ajustes', '/novidades']) {
        await router.navigateByUrl(p);
        expect(mural.kind()).withContext(p).toBe('livros');
      }
    });

    it('o último mural de resenhas volta na próxima visita', () => {
      mural.kind.set('series');
      mural.kind.set('anotacoes');
      TestBed.tick();
      expect(JSON.parse(localStorage.getItem('mural-de-jogos:analises:v1') ?? 'null')).toBe('series');
      expect(JSON.parse(localStorage.getItem('mural-de-jogos:mural:v1') ?? 'null')).toBe('anotacoes');
    });
  });
});

describe('as páginas de Extras sem mural', () => {
  it('o Uso das APIs e o Pomodoro não dependem de mural; as outras de Extras, sim', () => {
    expect(muralFree('/extras/pomodoro')).toBeTrue();
    expect(muralFree('/extras/pomodoro?x=1')).toBeTrue();
    expect(muralFree('/extras/uso-das-apis')).toBeTrue();
    expect(muralFree('/extras')).toBeFalse();
    expect(muralFree('/extras/estatisticas')).toBeFalse();
    expect(muralFree('/ranking')).toBeFalse();
  });
});
