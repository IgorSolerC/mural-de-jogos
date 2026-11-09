import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { Reminder } from '../core/calendar';
import { ICON_CHOICES } from '../core/icon-choices';
import { CalendarStore } from '../core/calendar-store';
import { Desk } from '../core/desk';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Choice, Confirm } from '../ui/confirm';
import { CalendarPage } from './calendar-page';
import { GoogleAgenda } from '../core/google-agenda-sync';
import { closeDialog, nextClose } from '../testing/dialog-close.spec';

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
        provideRouter([{ path: 'utilidades/calendario', component: CalendarPage }]),
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
      await go('/utilidades/calendario');
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
      await go('/utilidades/calendario');
      expect([...cell('2026-10-20').querySelectorAll('.tirinha')].map(text)).toEqual(['Mais a', 'Mais b', 'Mais c']);
      expect(text(cell('2026-10-20').querySelector('.mais-linha'))).toBe('+2 mais');
      await go('/utilidades/calendario?vista=dia&dia=2026-10-20');
      const mini = $('app-calendar-month.mini [data-dia="2026-10-20"]')!;
      expect(mini.querySelectorAll('.ponto').length).toBe(2);
      expect(text(mini.querySelector('.mais'))).toBe('+3');
      expect(mini.querySelector('.tirinha')).toBeNull();
    });

    it('as setas andam de mês, o Hoje volta, e tocar num dia abre o dia', async () => {
      await go('/utilidades/calendario');
      $<HTMLButtonElement>('[aria-label="Próximo mês"]')!.click();
      await settle();
      expect(text($('.periodo'))).toBe('Novembro de 2026');
      expect($('.hoje.tinta')!.getAttribute('aria-current')).toBeNull();
      $<HTMLButtonElement>('.hoje.tinta')!.click();
      await settle();
      expect(text($('.periodo'))).toBe('Outubro de 2026');
      cell('2026-10-20').click();
      await settle();
      expect(router.url).toBe('/utilidades/calendario?vista=dia&dia=2026-10-20');
      expect(text($('.periodo'))).toBe('Terça-feira, 20 de outubro de 2026');
    });

    it('no teclado, as setas andam pelos dias da folha e passam para o mês do lado', async () => {
      await go('/utilidades/calendario?vista=mes&dia=2026-10-31');
      cell('2026-10-31').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await settle();
      expect(router.url).toContain('dia=2026-11-01');
      expect(text($('.periodo'))).toBe('Novembro de 2026');
      expect(document.activeElement).toBe(cell('2026-11-01'));
      expect(cell('2026-11-01').getAttribute('tabindex')).toBe('0');
    });

    it('sem nenhum lembrete, a folha diz por onde começar', async () => {
      calendar.state.set({ reminders: [], removed: {} });
      await go('/utilidades/calendario');
      expect(text($('.dica'))).toContain('Toque num dia');
    });
  });

  describe('a semana', () => {
    it('mostra os sete dias, de domingo a sábado, cada lembrete numa tira com o horário, a repetição e o clipe', async () => {
      await go('/utilidades/calendario?vista=semana&dia=2026-10-21');
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
      await go('/utilidades/calendario?vista=semana');
      $$('.dia-col')[2].querySelectorAll<HTMLElement>('.tira')[1].click();
      await settle();
      expect(sheet()?.open).toBeTrue();
      expect(text(sheet()!.querySelector('h2'))).toBe('Editar lembrete');
      expect(sheet()!.querySelector<HTMLInputElement>('.nome input')!.value).toBe('Fazer bolo de aniversário');
      await closeDialog(sheet()!);
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
      await go('/utilidades/calendario?vista=dia&dia=2026-10-20');
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
      await go('/utilidades/calendario?vista=dia&dia=2026-09-01');
      expect(text($('.vazio'))).toContain('Nada marcado');
    });

    it('o que já passou sai riscado sozinho, sem quadradinho para marcar; marcado para trás, já nasce riscado', async () => {
      await go(`/utilidades/calendario?vista=dia&dia=${HOJE}`);
      expect(host.querySelector('.check, [role="checkbox"]')).toBeNull();
      const [bruna, remedio] = $$('.lembrete');
      expect(bruna.classList).not.toContain('passou');
      expect(remedio.classList).toContain('passou');
      expect(text(remedio.querySelector('.lembrete-nome'))).toBe('Tomar o remédio (já passou)');
      // o relógio anda: virou o dia, o aniversário também passou
      calendar.today.set('2026-10-19');
      calendar.time.set('00:01');
      await settle();
      await go(`/utilidades/calendario?vista=dia&dia=${HOJE}`);
      expect($$('.lembrete').every((l) => l.classList.contains('passou'))).toBeTrue();
      // um lembrete novo num dia que já foi: riscado desde o começo
      calendar.save(reminder('rontem001', 'Consulta', '2026-10-02'));
      await go('/utilidades/calendario?vista=dia&dia=2026-10-02');
      expect($$('.lembrete.passou').map((l) => text(l.querySelector('.lembrete-nome')))).toContain('Consulta (já passou)');
    });

    it('uma anotação apagada some do lembrete sem quebrar nada', async () => {
      TestBed.inject(ReviewStore).reviews.update((list) => list.filter((r) => r.id !== 'nbolo0001'));
      await go('/utilidades/calendario?vista=dia&dia=2026-10-20');
      expect($$('.anexada').length).toBe(1);
    });

    it('aberto por um link de lembrete (?lembrete=ID): ele circulado com a caneta e o foco no Editar dele; outro dia tira o destaque', async () => {
      await go('/utilidades/calendario?vista=dia&dia=2026-10-20&lembrete=rbolo0001');
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const spot = $$('.lembrete.destaque');
      expect(spot.length).toBe(1);
      expect(text(spot[0].querySelector('.lembrete-nome'))).toBe('Fazer bolo de aniversário');
      expect(getComputedStyle(spot[0].querySelector('.lembrete-nome')!, '::after').backgroundImage).toContain('svg');
      expect(document.activeElement).toBe(spot[0].querySelector('.editar'));
      await go('/utilidades/calendario?vista=dia&dia=2026-10-21');
      expect($$('.lembrete.destaque').length).toBe(0);
      // no mês, nada fica circulado (o destaque é do Dia)
      await go('/utilidades/calendario?vista=mes&dia=2026-10-20&lembrete=rbolo0001');
      expect($$('.lembrete.destaque').length).toBe(0);
    });
  });

  describe('o Google Agenda', () => {
    it('o botão só aparece para quem pode ligar, e abre a folha que explica e liga', async () => {
      await go('/utilidades/calendario');
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
      await go('/utilidades/calendario?vista=dia&dia=2026-10-21');
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

  describe('o ícone do lembrete', () => {
    const withIcon = () => calendar.state.update((st) => ({ ...st, reminders: st.reminders.map((r) => (r.id === 'rbolo0001' ? { ...r, icon: 'bolo' as const } : r)) }));

    it('aparece antes do nome no mês, na semana e no dia; sem ícone, só o nome', async () => {
      withIcon();
      await go('/utilidades/calendario');
      const tira = [...cell('2026-10-20').querySelectorAll('.tirinha')].find((t) => t.textContent!.includes('Fazer bolo'))!;
      expect([...cell('2026-10-20').querySelectorAll('lucide-icon.tirinha-icone')].length).toBe(1);
      expect(tira.querySelector('.tirinha-icone svg')).not.toBeNull();
      // o ícone colado ao nome, sem o espaço que separa o horário
      expect(text(tira)).toBe('15hFazer bolo de aniversário');
      expect(cell(HOJE).querySelector('.tirinha-icone')).toBeNull();
      await go('/utilidades/calendario?vista=semana&dia=2026-10-20');
      const tiras = $$('.tira').filter((t) => t.textContent!.includes('Fazer bolo'));
      expect(tiras[0].querySelector('.tira-nome .nome-icone')).not.toBeNull();
      expect($$('.tira').filter((t) => t.querySelector('.nome-icone')).length).toBe(1);
      await go('/utilidades/calendario?vista=dia&dia=2026-10-20');
      expect($$('.lembrete-nome').map(text)).toEqual(['Tomar o remédio', 'Fazer bolo de aniversário']);
      expect($$('.lembrete-nome')[1].querySelector('.nome-icone')).not.toBeNull();
      expect($$('.lembrete-nome')[0].querySelector('.nome-icone')).toBeNull();
    });

    it('a folha escolhe na cartela das colunas (fechada até pedir), salva com o lembrete e tira com o Sem ícone', async () => {
      await go('/utilidades/calendario?vista=dia&dia=2026-10-20');
      $$('.entrada')[1].querySelector<HTMLButtonElement>('.editar')!.click();
      await settle();
      const s = sheet()!;
      const btn = s.querySelector<HTMLButtonElement>('.icones-btn')!;
      expect(text(s.querySelector('#lb-icone'))).toBe('Sem ícone');
      expect(s.querySelector('.icone-previa')!.classList).toContain('vazio');
      expect(s.querySelector('#lb-icones')).toBeNull();
      expect(btn.getAttribute('aria-expanded')).toBe('false');
      btn.click();
      await settle();
      const ops = [...s.querySelectorAll<HTMLButtonElement>('#lb-icones .op')];
      expect(ops.length).toBe(1 + ICON_CHOICES.length);
      expect(ops[0].getAttribute('aria-label')).toBe('Sem ícone');
      expect(ops[0].getAttribute('aria-checked')).toBe('true');
      s.querySelector<HTMLButtonElement>('#lb-icones .op[aria-label="Aniversário"]')!.click();
      await settle();
      expect(text(s.querySelector('#lb-icone'))).toBe('Aniversário');
      expect(s.querySelector('.icone-previa svg')).not.toBeNull();
      expect(s.querySelector('#lb-icones .op[aria-label="Aniversário"]')!.getAttribute('aria-checked')).toBe('true');
      // nada muda no calendário até salvar
      expect(calendar.reminders().find((r) => r.id === 'rbolo0001')!.icon).toBeUndefined();
      s.querySelector<HTMLButtonElement>('.btn-ink')!.click();
      await settle();
      expect(calendar.reminders().find((r) => r.id === 'rbolo0001')!.icon).toBe('bolo');
      // de novo: o Sem ícone tira
      $$('.entrada')[1].querySelector<HTMLButtonElement>('.editar')!.click();
      await settle();
      const s2 = sheet()!;
      expect(text(s2.querySelector('.icones-btn'))).toBe('Trocar');
      s2.querySelector<HTMLButtonElement>('.icones-btn')!.click();
      await settle();
      s2.querySelector<HTMLButtonElement>('#lb-icones .sem-icone')!.click();
      await settle();
      s2.querySelector<HTMLButtonElement>('.btn-ink')!.click();
      await settle();
      expect('icon' in calendar.reminders().find((r) => r.id === 'rbolo0001')!).toBeFalse();
    });
  });

  describe('a folha do lembrete', () => {
    async function openNew(day = HOJE): Promise<HTMLDialogElement> {
      await go(`/utilidades/calendario?vista=dia&dia=${day}`);
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

      await go('/utilidades/calendario?vista=semana&dia=2026-10-20');
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

    it('personalizar a repetição como no Google, e marcar sem aviso', async () => {
      const s = await openNew('2026-10-20'); // a terceira terça
      type(s.querySelector<HTMLInputElement>('.nome input')!, 'Reunião do condomínio');
      // o tipo: uma marcação, que não avisa
      [...s.querySelectorAll<HTMLInputElement>('input[name="lb-tipo"]')][1].click();
      await settle();
      expect(text(s.querySelector('#lb-tipo-d'))).toBe('Fica marcado no calendário, sem aviso no celular.');
      [...s.querySelectorAll<HTMLInputElement>('input[name="lb-repetir"]')][3].click(); // todo mês
      await settle();
      const abrir = s.querySelector<HTMLButtonElement>('.personalizar-btn')!;
      expect(abrir.getAttribute('aria-expanded')).toBe('false');
      abrir.click();
      await settle();
      const modos = [...s.querySelectorAll<HTMLElement>('input[name="lb-mes"]')].map((i) => text(i.parentElement));
      expect(modos).toEqual(['No dia 20', 'Na terceira terça']);
      s.querySelectorAll<HTMLInputElement>('input[name="lb-mes"]')[1].click();
      await settle();
      const cada = s.querySelector<HTMLInputElement>('.personalizar .intervalo input')!;
      cada.value = '2';
      cada.dispatchEvent(new Event('change'));
      await settle();
      expect(text(s.querySelector('.personalizar .unidade'))).toBe('meses');
      s.querySelectorAll<HTMLInputElement>('input[name="lb-termina"]')[2].click(); // depois de
      await settle();
      const vezes = s.querySelector<HTMLInputElement>('.termina input')!;
      vezes.value = '6';
      vezes.dispatchEvent(new Event('change'));
      await settle();
      expect(text(s.querySelector('.frase'))).toBe('A cada 2 meses, na terceira terça-feira, 6 vezes.');
      s.querySelector<HTMLButtonElement>('.btn-ink')!.click();
      await settle();
      const r = calendar.reminders().find((x) => x.title === 'Reunião do condomínio')!;
      expect(r).toEqual(jasmine.objectContaining({ repeat: 'mes', every: 2, nth: 3, count: 6, until: '2027-08-17', quiet: true }));

      // a semana: os dias, e o personalizar já aberto num que repete personalizado
      await go('/utilidades/calendario?vista=dia&dia=2026-12-15');
      $$('.editar')[0].click();
      await settle();
      const s2 = sheet()!;
      expect(s2.querySelector('.personalizar')).not.toBeNull();
      expect(text($('.lembrete-meta'))).toContain('Marcação, sem aviso');
      [...s2.querySelectorAll<HTMLInputElement>('input[name="lb-repetir"]')][2].click(); // toda semana
      await settle();
      const dias = [...s2.querySelectorAll<HTMLInputElement>('.dias-semana input')];
      expect(dias.map((d) => d.checked)).toEqual([false, false, true, false, false, false, false]);
      dias[4].click();
      await settle();
      expect(text(s2.querySelector('.frase'))).toContain('Toda semana, na terça e quinta');
    });

    it('nada muda no calendário até salvar', async () => {
      await go('/utilidades/calendario?vista=dia&dia=2026-10-20');
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
      await go('/utilidades/calendario?vista=dia&dia=2026-10-20');
      answer = 'secondary';
      $$('.editar')[0].click();
      await settle();
      // a folha fecha ao apagar: o `close` atrasado fecharia a que abre em seguida (ver dialog-close.spec)
      const closed = nextClose(sheet()!);
      sheet()!.querySelector<HTMLButtonElement>('.perigo')!.click();
      await closed;
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
  describe('revisão', () => {
    function type(input: HTMLInputElement, value: string): void {
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }

    it('Home no domingo escolhido fica nele; a seta do mês depois não puxa o foco para a folha', async () => {
      await go('/utilidades/calendario');
      cell(HOJE).focus();
      cell(HOJE).dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      await settle();
      expect(document.activeElement).toBe(cell(HOJE));
      const next = $<HTMLButtonElement>('[aria-label="Próximo mês"]')!;
      next.focus();
      next.click();
      await settle();
      expect(text($('.periodo'))).toBe('Novembro de 2026');
      expect(document.activeElement).toBe(next);
    });

    it('a folha de um lembrete novo não perde o que foi escrito quando os lembretes mudam (a nuvem, o Google, outra aba)', async () => {
      await go('/utilidades/calendario?vista=dia&dia=2026-10-22');
      calendar.ask();
      await settle();
      const s = sheet()!;
      type(s.querySelector<HTMLInputElement>('.nome input')!, 'Pagar a conta');
      await settle();
      calendar.merge({ removed: {}, reminders: [reminder('routro001', 'Outro', '2026-10-30', { createdAt: '2026-10-11T00:00:00.000Z', at: '2026-10-11T00:00:00.000Z' })] });
      await settle();
      expect(calendar.get('routro001')).toBeDefined();
      expect(s.querySelector<HTMLInputElement>('.nome input')!.value).toBe('Pagar a conta');
      s.querySelector<HTMLButtonElement>('.btn-ink')!.click();
      await settle();
      expect(calendar.reminders().find((r) => r.title === 'Pagar a conta')?.date).toBe('2026-10-22');
    });

    it('salvar a folha não desfaz o dia tirado nem a ligação com o Google que mudaram com ela aberta', async () => {
      calendar.state.update((st) => ({ ...st, reminders: st.reminders.map((r) => (r.id === 'rremedio1' ? { ...r, google: { id: 'evremedio1', etag: 'v1', at: T0 } } : r)) }));
      await go('/utilidades/calendario?vista=dia&dia=2026-10-20');
      $$('.editar')[0].click();
      await settle();
      const s = sheet()!;
      expect(s.querySelector<HTMLInputElement>('.nome input')!.value).toBe('Tomar o remédio');
      // com a folha aberta: um pedido da API tira o dia 25, e o Google devolve o evento com a versão nova
      calendar.skipDay('rremedio1', '2026-10-25');
      calendar.linkGoogle('rremedio1', { id: 'evremedio1', etag: 'v2' }, calendar.get('rremedio1')!.at);
      await settle();
      type(s.querySelector<HTMLInputElement>('.nome input')!, 'Tomar o remédio da pressão');
      s.querySelector<HTMLButtonElement>('.btn-ink')!.click();
      await settle();
      const r = calendar.get('rremedio1')!;
      expect(r.title).toBe('Tomar o remédio da pressão');
      expect(r.skip).toEqual(['2026-10-25']);
      expect(r.google?.etag).toBe('v2');
      expect(r.google?.at).not.toBe(r.at);
    });
  });

  describe('menu do botão direito', () => {
    const panel = () => $('app-context-menu .menu-contexto')!;
    const labels = () => [...panel().querySelectorAll('.escolha .nome')].map(text);
    const option = (label: string) => [...panel().querySelectorAll<HTMLButtonElement>('.escolha')].find((b) => text(b) === label)!;
    async function rightClick(target: Element): Promise<MouseEvent> {
      const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 30, clientY: 30 });
      target.dispatchEvent(e);
      await settle();
      return e;
    }

    it('a tira de um lembrete na semana: editar, abrir o dia, ler as anotações anexadas e apagar', async () => {
      await go('/utilidades/calendario?vista=semana&dia=2026-10-21');
      const tira = $('.tira[data-lembrete="rbolo0001"]')!;
      expect((await rightClick(tira)).defaultPrevented).toBeTrue();
      expect(panel().matches(':popover-open')).toBeTrue();
      expect(text(panel().querySelector('.legenda'))).toContain('Fazer bolo de aniversário');
      expect(labels()).toEqual(['Editar', 'Abrir o dia', 'Ler “Receita gostosa de bolo”', 'Ler “Calda de chocolate”', 'Apagar o lembrete']);
      const read = spyOn(desk, 'openReview');
      option('Ler “Calda de chocolate”').click();
      expect(read).toHaveBeenCalledWith('ncalda001');
      await rightClick(tira);
      option('Editar').click();
      await settle();
      expect(sheet()?.open).toBeTrue();
    });

    it('apagar pelo menu faz a pergunta da folha: no que se repete, só aquele dia', async () => {
      await go('/utilidades/calendario?vista=dia&dia=2026-10-20');
      answer = 'secondary';
      await rightClick($('.lembrete[data-lembrete="rremedio1"] .lembrete-nome')!);
      // na página do dia, sem o "Abrir o dia"
      expect(labels()).toEqual(['Editar', 'Apagar o lembrete']);
      option('Apagar o lembrete').click();
      for (let i = 0; i < 10 && !calendar.get('rremedio1')!.skip.length; i++) await settle();
      expect(calendar.get('rremedio1')!.skip).toEqual(['2026-10-20']);
    });

    it('um dia do mês: abrir o dia e marcar um lembrete nele; a tirinha de um lembrete, o menu dele', async () => {
      await go('/utilidades/calendario');
      await rightClick(cell('2026-10-22'));
      expect(text(panel().querySelector('.legenda'))).toContain('Quinta-feira, 22 de outubro');
      expect(labels()).toEqual(['Abrir o dia', 'Novo lembrete']);
      option('Novo lembrete').click();
      await settle();
      expect(sheet()?.open).toBeTrue();
      sheet()!.close();
      await settle();
      const chip = cell('2026-10-20').querySelector('[data-lembrete="rbolo0001"]');
      if (chip) {
        await rightClick(chip);
        expect(labels()[0]).toBe('Editar');
      }
      await rightClick(cell('2026-10-22'));
      option('Abrir o dia').click();
      await settle();
      expect(router.url).toBe('/utilidades/calendario?vista=dia&dia=2026-10-22');
    });
  });
});
