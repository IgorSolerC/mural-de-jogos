import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { Reminder } from '../core/calendar';
import { CalendarStore } from '../core/calendar-store';
import { Desk } from '../core/desk';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Choice, Confirm } from '../ui/confirm';
import { CalendarPage } from './calendar-page';
import { GoogleAgenda } from '../core/google-agenda-sync';

/** A página do Calendário: as três vistas, andar pelos períodos, a folha do lembrete e as anotações anexadas. */

@Component({ selector: 'app-raiz', imports: [RouterOutlet], template: '<router-outlet />' })
class Raiz {}

const T0 = '2026-10-10T10:00:00.000Z';
const HOJE = '2026-10-18'; // um domingo

const note = (id: string, title: string, extra: Record<string, unknown> = {}): Review =>
  ({
    ...sanitizeReview({ kind: 'anotacoes', game: { name: title }, completedAt: '2026-10-01', createdAt: T0, updatedAt: T0, ...extra })!,
    id,
  });

function reminder(id: string, title: string, date: string, extra: Partial<Reminder> = {}): Reminder {
  return { id, title, date, color: 'amarelo', notes: [], skip: [], createdAt: T0, at: T0, ...extra };
}

describe('página do Calendário', () => {
  let host: HTMLElement;
  let calendar: CalendarStore;
  let router: Router;
  let desk: Desk;
  let answer: Choice;

  async function go(url: string): Promise<void> {
    await router.navigateByUrl(url);
    await settle();
  }
  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 0));
      TestBed.tick();
    }
  }
  const $ = <T extends Element = HTMLElement>(sel: string) => host.querySelector<T & HTMLElement>(sel);
  const $$ = (sel: string) => [...host.querySelectorAll<HTMLElement>(sel)];
  const cell = (day: string) => $(`app-calendar-month [data-dia="${day}"]`)!;
  const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const sheet = () => document.querySelector<HTMLDialogElement>('dialog.lembrete');

  beforeEach(async () => {
    localStorage.clear();
    answer = null;
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: 'anotacoes/calendario', component: CalendarPage }]),
        { provide: Confirm, useValue: { ask: async () => true, choose: async () => answer } },
      ],
    });
    TestBed.inject(ReviewStore).reviews.set([
      note('nbolo0001', 'Receita gostosa de bolo', { category: 'Receitas' }),
      note('ncalda001', 'Calda de chocolate', { category: 'Receitas' }),
      note('ngta60001', 'Contador GTA 6', { category: 'Ideias' }),
    ]);
    calendar = TestBed.inject(CalendarStore);
    calendar.today.set(HOJE);
    // meio-dia: o remédio das 8h de hoje já passou; o aniversário (o dia todo) não
    calendar.time.set('12:00');
    calendar.state.set({
      removed: {},
      reminders: [
        reminder('rbolo0001', 'Fazer bolo de aniversário', '2026-10-20', { color: 'rosa', time: '15:00', notes: ['nbolo0001', 'ncalda001'] }),
        reminder('rbruna001', 'Aniversário da Bruna', '2020-10-18', { color: 'lilas', repeat: 'ano' }),
        reminder('rremedio1', 'Tomar o remédio', '2026-10-01', { color: 'azul', repeat: 'dia', time: '08:00' }),
      ],
    });
    desk = TestBed.inject(Desk);
    router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(Raiz);
    host = fixture.nativeElement;
    document.body.appendChild(host);
  });
  afterEach(() => {
    sheet()?.close();
    host.remove();
    localStorage.clear();
  });

  describe('o mês', () => {
    it('abre na folha do mês de hoje, com hoje circulado, os domingos em vermelho e o nome de cada lembrete no dia', async () => {
      await go('/anotacoes/calendario');
      expect(text($('.periodo'))).toBe('Outubro de 2026');
      expect($$('.divisoria')[0].getAttribute('aria-pressed')).toBe('true');
      expect(cell(HOJE).getAttribute('aria-current')).toBe('date');
      expect(cell(HOJE).classList).toContain('hoje');
      expect(cell(HOJE).classList).toContain('domingo');
      // hoje: o aniversário (o dia todo, primeiro) e o remédio, com o horário (já passou: riscado)
      expect([...cell(HOJE).querySelectorAll('.tirinha')].map(text)).toEqual(['Aniversário da Bruna', '8h Tomar o remédio']);
      expect([...cell(HOJE).querySelectorAll('.tirinha.passou')].map(text)).toEqual(['8h Tomar o remédio']);
      // os dias de antes, todos riscados
      expect(cell('2026-10-17').querySelector('.tirinha.passou')).not.toBeNull();
      expect(cell('2026-10-19').querySelector('.tirinha.passou')).toBeNull();
      expect(cell(HOJE).querySelector('.tirinha')!.getAttribute('data-cor')).toBe('lilas');
      // na folha grande, nada de bolinha
      expect(cell(HOJE).querySelector('.ponto')).toBeNull();
      expect(cell(HOJE).getAttribute('aria-label')).toBe('domingo, 18 de outubro, hoje, 2 lembretes: Aniversário da Bruna, Tomar o remédio');
      // antes do primeiro dia do remédio, nada
      expect(cell('2026-09-30').querySelector('.tirinha')).toBeNull();
      expect($('.dica')).toBeNull();
    });

    it('um dia cheio mostra três nomes e quantos mais; o calendário pequeno, bolinhas', async () => {
      calendar.state.update((s) => ({
        ...s,
        reminders: [...s.reminders, ...['a', 'b', 'c'].map((x) => reminder(`rmais000${x}`, `Mais ${x}`, '2026-10-20'))],
      }));
      await go('/anotacoes/calendario');
      expect([...cell('2026-10-20').querySelectorAll('.tirinha')].map(text)).toEqual(['Mais a', 'Mais b', 'Mais c']);
      expect(text(cell('2026-10-20').querySelector('.mais-linha'))).toBe('+2 mais');
      await go('/anotacoes/calendario?vista=dia&dia=2026-10-20');
      const mini = $('app-calendar-month.mini [data-dia="2026-10-20"]')!;
      expect(mini.querySelectorAll('.ponto').length).toBe(2);
      expect(text(mini.querySelector('.mais'))).toBe('+3');
      expect(mini.querySelector('.tirinha')).toBeNull();
    });

    it('as setas andam de mês, o Hoje volta, e tocar num dia abre o dia', async () => {
      await go('/anotacoes/calendario');
      $<HTMLButtonElement>('[aria-label="Próximo mês"]')!.click();
      await settle();
      expect(text($('.periodo'))).toBe('Novembro de 2026');
      expect($('.hoje.tinta')!.getAttribute('aria-current')).toBeNull();
      $<HTMLButtonElement>('.hoje.tinta')!.click();
      await settle();
      expect(text($('.periodo'))).toBe('Outubro de 2026');
      cell('2026-10-20').click();
      await settle();
      expect(router.url).toBe('/anotacoes/calendario?vista=dia&dia=2026-10-20');
      expect(text($('.periodo'))).toBe('Terça-feira, 20 de outubro de 2026');
    });

    it('no teclado, as setas andam pelos dias da folha e passam para o mês do lado', async () => {
      await go('/anotacoes/calendario?vista=mes&dia=2026-10-31');
      cell('2026-10-31').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await settle();
      expect(router.url).toContain('dia=2026-11-01');
      expect(text($('.periodo'))).toBe('Novembro de 2026');
      expect(document.activeElement).toBe(cell('2026-11-01'));
      expect(cell('2026-11-01').getAttribute('tabindex')).toBe('0');
    });

    it('sem nenhum lembrete, a folha diz por onde começar', async () => {
      calendar.state.set({ reminders: [], removed: {} });
      await go('/anotacoes/calendario');
      expect(text($('.dica'))).toContain('Toque num dia');
    });
  });

  describe('a semana', () => {
    it('mostra os sete dias, de domingo a sábado, cada lembrete numa tira com o horário, a repetição e o clipe', async () => {
      await go('/anotacoes/calendario?vista=semana&dia=2026-10-21');
      expect(text($('.periodo'))).toBe('18 a 24 de outubro de 2026');
      const dias = $$('.dia-col');
      expect(dias.length).toBe(7);
      expect(text(dias[0].querySelector('.dsem'))).toBe('dom');
      expect(dias[0].classList).toContain('hoje');
      const terca = dias[2];
      const nomes = [...terca.querySelectorAll('.tira-nome')].map(text);
      expect(nomes).toEqual(['Tomar o remédio', 'Fazer bolo de aniversário']);
      const bolo = [...terca.querySelectorAll<HTMLElement>('.tira')][1];
      expect(text(bolo.querySelector('.tira-hora'))).toBe('15h');
      expect(text(bolo.querySelector('.tira-clipe'))).toBe('2');
      expect(bolo.getAttribute('aria-label')).toBe('Fazer bolo de aniversário, às 15h, 2 anotações anexadas. Editar');
      // o remédio de hoje já passou: riscado
      expect(dias[0].querySelector('.tira.passou .tira-nome')?.textContent).toContain('Tomar o remédio');
    });

    it('tocar numa tira abre a folha do lembrete; o + de um dia abre um lembrete novo naquele dia', async () => {
      await go('/anotacoes/calendario?vista=semana');
      $$('.dia-col')[2].querySelectorAll<HTMLElement>('.tira')[1].click();
      await settle();
      expect(sheet()?.open).toBeTrue();
      expect(text(sheet()!.querySelector('h2'))).toBe('Editar lembrete');
      expect(sheet()!.querySelector<HTMLInputElement>('.nome input')!.value).toBe('Fazer bolo de aniversário');
      sheet()!.close();
      await settle();
      $$('.dia-col')[4].querySelector<HTMLElement>('.dia-mais')!.click();
      await settle();
      expect(text(sheet()!.querySelector('h2'))).toBe('Novo lembrete');
      expect(sheet()!.querySelector<HTMLInputElement>('input[type="date"]')!.value).toBe('2026-10-22');
    });
  });

  describe('o dia', () => {
    it('mostra cada lembrete inteiro, o dia todo primeiro, e as anotações anexadas como fichas que abrem', async () => {
      const read = spyOn(desk, 'openReview');
      await go('/anotacoes/calendario?vista=dia&dia=2026-10-20');
      expect(text($('.dia-semana'))).toContain('Terça-feira');
      expect($$('.lembrete-nome').map(text)).toEqual(['Tomar o remédio', 'Fazer bolo de aniversário']);
      const bolo = $$('.entrada')[1];
      expect(text(bolo.querySelector('.lembrete-meta'))).toBe('15h');
      const fichas = [...bolo.querySelectorAll('.anexada app-review-card')];
      expect(fichas.map((f) => text(f.querySelector('.title')))).toEqual(['Receita gostosa de bolo', 'Calda de chocolate']);
      expect(bolo.querySelectorAll('.clipe').length).toBe(2);
      fichas[1].querySelector<HTMLElement>('.hit')!.click();
      expect(read).toHaveBeenCalledWith('ncalda001');
      // o calendário pequeno marca o dia aberto, e tocar nele troca de dia
      expect($('app-calendar-month.mini [data-dia="2026-10-20"]')!.getAttribute('aria-pressed')).toBe('true');
      // as setas do calendário pequeno passam de mês, no mesmo dia
      $<HTMLButtonElement>('.mini-topo [aria-label="Próximo mês"]')!.click();
      await settle();
      expect(router.url).toContain('dia=2026-11-20');
      $<HTMLButtonElement>('.mini-topo [aria-label="Mês anterior"]')!.click();
      await settle();
      $('app-calendar-month.mini [data-dia="2026-10-21"]')!.click();
      await settle();
      expect($$('.lembrete-nome').map(text)).toEqual(['Tomar o remédio']);
      expect(text($('.dia-semana'))).toContain('Quarta-feira');
      // um dia sem nada
      await go('/anotacoes/calendario?vista=dia&dia=2026-09-01');
      expect(text($('.vazio'))).toContain('Nada marcado');
    });

    it('o que já passou sai riscado sozinho, sem quadradinho para marcar; marcado para trás, já nasce riscado', async () => {
      await go(`/anotacoes/calendario?vista=dia&dia=${HOJE}`);
      expect(host.querySelector('.check, [role="checkbox"]')).toBeNull();
      const [bruna, remedio] = $$('.lembrete');
      expect(bruna.classList).not.toContain('passou');
      expect(remedio.classList).toContain('passou');
      expect(text(remedio.querySelector('.lembrete-nome'))).toBe('Tomar o remédio (já passou)');
      // o relógio anda: virou o dia, o aniversário também passou
      calendar.today.set('2026-10-19');
      calendar.time.set('00:01');
      await settle();
      await go(`/anotacoes/calendario?vista=dia&dia=${HOJE}`);
      expect($$('.lembrete').every((l) => l.classList.contains('passou'))).toBeTrue();
      // um lembrete novo num dia que já foi: riscado desde o começo
      calendar.save(reminder('rontem001', 'Consulta', '2026-10-02'));
      await go('/anotacoes/calendario?vista=dia&dia=2026-10-02');
      expect($$('.lembrete.passou').map((l) => text(l.querySelector('.lembrete-nome')))).toContain('Consulta (já passou)');
    });

    it('uma anotação apagada some do lembrete sem quebrar nada', async () => {
      TestBed.inject(ReviewStore).reviews.update((list) => list.filter((r) => r.id !== 'nbolo0001'));
      await go('/anotacoes/calendario?vista=dia&dia=2026-10-20');
      expect($$('.anexada').length).toBe(1);
    });
  });

  describe('o Google Agenda', () => {
    it('o botão só aparece para quem pode ligar, e abre a folha que explica e liga', async () => {
      await go('/anotacoes/calendario');
      expect($('.tinta.google')).toBeNull();
      const google = TestBed.inject(GoogleAgenda);
      google.status.set('desligada');
      await settle();
      $<HTMLButtonElement>('.tinta.google')!.click();
      await settle();
      const sheet = document.querySelector<HTMLDialogElement>('dialog.google-agenda')!;
      expect(sheet.open).toBeTrue();
      expect(text(sheet.querySelector('.btn-ink'))).toBe('Conectar o Google Agenda');
      expect(text(sheet)).toContain('de 30 dias atrás em diante');
      google.status.set('ligada');
      google.skipped.set({ repeticao: 2, excecao: 0 });
      await settle();
      expect(text(sheet.querySelector('.nota-papel'))).toBe('2 eventos repetem de um jeito que o Murall não sabe mostrar: ficaram só no Google.');
      expect([...sheet.querySelectorAll('.papel')].map(text)).toEqual(['Sincronizar agora', 'Desconectar']);
      sheet.close();
    });

    it('um convite de outra pessoa abre só para ler (as anotações ainda se prendem), com o caminho para o Google', async () => {
      calendar.save(
        reminder('gconvite0001', 'Reunião', '2026-10-21', { google: { id: 'convite0001', lock: 'convite', link: 'https://www.google.com/calendar/event?eid=abc' } }),
      );
      await go('/anotacoes/calendario?vista=dia&dia=2026-10-21');
      const entry = $$('.entrada').find((e) => text(e.querySelector('.lembrete-nome')) === 'Reunião')!;
      entry.querySelector<HTMLElement>('.editar')!.click();
      await settle();
      const s = sheet()!;
      expect(text(s.querySelector('.nota-google'))).toContain('convite de outra pessoa');
      expect(s.querySelector<HTMLAnchorElement>('.nota-google a')!.href).toBe('https://www.google.com/calendar/event?eid=abc');
      expect(s.querySelector<HTMLInputElement>('.nome input')!.readOnly).toBeTrue();
      expect(s.querySelector<HTMLInputElement>('input[type="date"]')!.disabled).toBeTrue();
      expect(s.querySelector('.perigo')).toBeNull();
      expect(text(s.querySelector('.sub'))).toContain('No Google Agenda');
      expect([...s.querySelectorAll<HTMLButtonElement>('.anexar .papel')].every((b) => !b.disabled)).toBeTrue();
    });
  });

  describe('a folha do lembrete', () => {
    async function openNew(day = HOJE): Promise<HTMLDialogElement> {
      await go(`/anotacoes/calendario?vista=dia&dia=${day}`);
      calendar.ask();
      await settle();
      return sheet()!;
    }
    function type(input: HTMLInputElement, value: string): void {
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }

    it('o Novo lembrete do topo abre a folha no dia aberto; sem nome, não salva e diz o que falta', async () => {
      const s = await openNew('2026-10-25');
      expect(s.open).toBeTrue();
      expect(text(s.querySelector('.sub'))).toBe('domingo, 25 de outubro de 2026');
      s.querySelector<HTMLButtonElement>('.btn-ink')!.click();
      await settle();
      expect(text(s.querySelector('.erro-msg'))).toBe('Falta o nome do lembrete.');
      expect(calendar.reminders().length).toBe(3);
    });

    it('salva um lembrete que se repete, com horário, cor e a anotação anexada', async () => {
      const s = await openNew('2026-10-22');
      type(s.querySelector<HTMLInputElement>('.nome input')!, '  Aula de   violão ');
      s.querySelector<HTMLButtonElement>('[role="switch"]')!.click();
      await settle();
      const hora = s.querySelector<HTMLInputElement>('input[type="time"]')!;
      expect(hora.value).toBe('09:00');
      hora.value = '19:30';
      hora.dispatchEvent(new Event('change'));
      const semana = [...s.querySelectorAll<HTMLInputElement>('input[name="lb-repetir"]')][2];
      semana.click();
      await settle();
      expect(text(s.querySelector('.frase'))).toBe('Toda quinta-feira, a partir de 22 de outubro de 2026.');
      s.querySelector<HTMLButtonElement>('.op.cor[aria-label="Verde"]')!.click();
      // anexar: o seletor de anotações, e a escolhida entra na lista
      [...s.querySelectorAll<HTMLButtonElement>('.anexar .papel')][0].click();
      await settle();
      const picker = document.querySelector<HTMLDialogElement>('dialog.escolher')!;
      expect(picker.open).toBeTrue();
      const gta = [...picker.querySelectorAll<HTMLElement>('.escolha')].find((b) => b.textContent!.includes('Contador GTA 6'))!;
      gta.click();
      await settle();
      expect([...s.querySelectorAll('.anexo-nome')].map(text)).toEqual(['Contador GTA 6']);
      s.querySelector<HTMLButtonElement>('.btn-ink')!.click();
      await settle();
      expect(s.open).toBeFalse();
      const nova = calendar.reminders().find((r) => r.title === 'Aula de violão')!;
      expect(nova).toEqual(jasmine.objectContaining({ date: '2026-10-22', time: '19:30', repeat: 'semana', color: 'verde', notes: ['ngta60001'] }));
    });

    it('vários dias: a folha pede até que dia, e a semana mostra a tira em cada dia, picotada onde emenda', async () => {
      const s = await openNew('2026-10-20');
      type(s.querySelector<HTMLInputElement>('.nome input')!, 'Congresso');
      const varios = [...s.querySelectorAll<HTMLButtonElement>('[role="switch"]')][1];
      varios.click();
      await settle();
      expect(varios.getAttribute('aria-checked')).toBe('true');
      const ate = s.querySelector<HTMLInputElement>('.fim input[type="date"]')!;
      expect(ate.value).toBe('2026-10-21');
      ate.value = '2026-10-22';
      ate.dispatchEvent(new Event('change'));
      await settle();
      expect(text(s.querySelector('.sub'))).toBe('De 20 a 22 de outubro');
      expect(text(s.querySelector('.frase'))).toBe('De 20 a 22 de outubro de 2026.');
      s.querySelector<HTMLButtonElement>('.btn-ink')!.click();
      await settle();
      expect(calendar.reminders().find((r) => r.title === 'Congresso')).toEqual(jasmine.objectContaining({ date: '2026-10-20', end: '2026-10-22' }));

      await go('/anotacoes/calendario?vista=semana&dia=2026-10-20');
      const tiras = $$('.tira').filter((t) => t.textContent!.includes('Congresso'));
      expect(tiras.length).toBe(3);
      expect(tiras.map((t) => [t.classList.contains('emenda-antes'), t.classList.contains('emenda-depois')])).toEqual([
        [false, true],
        [true, true],
        [true, false],
      ]);
      expect(text(tiras[1].querySelector('.tira-hora'))).toBe('continua');
      expect(tiras[1].getAttribute('aria-label')).toContain('Dia 2 de 3');
    });

    it('nada muda no calendário até salvar', async () => {
      await go('/anotacoes/calendario?vista=dia&dia=2026-10-20');
      $$('.editar')[1].click();
      await settle();
      const s = sheet()!;
      type(s.querySelector<HTMLInputElement>('.nome input')!, 'Outro nome');
      s.querySelector<HTMLElement>('.anexo .tira')!.click();
      await settle();
      expect([...s.querySelectorAll('.anexo-nome')].map(text)).toEqual(['Calda de chocolate']);
      expect(calendar.get('rbolo0001')!.notes).toEqual(['nbolo0001', 'ncalda001']);
      s.querySelector<HTMLButtonElement>('.btn-quiet')!.click();
      await settle();
      expect(calendar.get('rbolo0001')!.title).toBe('Fazer bolo de aniversário');
    });

    it('"Escrever uma nota nova" abre o editor com o nome do lembrete, e a anotação salva fica presa nele', async () => {
      const newNote = spyOn(desk, 'newNote');
      const s = await openNew();
      type(s.querySelector<HTMLInputElement>('.nome input')!, 'Lançamento GTA 6');
      [...s.querySelectorAll<HTMLButtonElement>('.anexar .papel')][1].click();
      expect(newNote).toHaveBeenCalledWith('Lançamento GTA 6');
      // o editor salvou a anotação nova (ver App.onSaved)
      expect(calendar.claimNote('ngta60001')).toBeTrue();
      await settle();
      expect([...s.querySelectorAll('.anexo-nome')].map(text)).toEqual(['Contador GTA 6']);
      // só uma vez: a próxima anotação salva não é presa em lugar nenhum
      expect(calendar.claimNote('nbolo0001')).toBeFalse();
    });

    it('apagar um lembrete que se repete pergunta: só neste dia, ou todos (com Desfazer)', async () => {
      await go('/anotacoes/calendario?vista=dia&dia=2026-10-20');
      answer = 'secondary';
      $$('.editar')[0].click();
      await settle();
      sheet()!.querySelector<HTMLButtonElement>('.perigo')!.click();
      await settle();
      expect(calendar.get('rremedio1')!.skip).toEqual(['2026-10-20']);
      expect($$('.lembrete-nome').map(text)).toEqual(['Fazer bolo de aniversário']);

      answer = 'confirm';
      $$('.editar')[0].click();
      await settle();
      sheet()!.querySelector<HTMLButtonElement>('.perigo')!.click();
      await settle();
      expect(calendar.get('rbolo0001')).toBeUndefined();
      expect(calendar.state().removed['rbolo0001']).toBeDefined();
    });
  });
});
