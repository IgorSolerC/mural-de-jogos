import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, OnInit, signal, viewChild } from '@angular/core';
import { ErroApi } from '../../core/api';
import type { CofreAberto } from '../../core/abrir';
import { ErroCofre } from '../../core/crypto';
import { apagarDeVez, type CamposDoItem, ErroConflito, type ItemNaLista, lerItens, limparLapides, paraALixeira, restaurar, salvarItem } from '../../core/itens';
import { SERVICOS } from '../servicos';
import { Gerenciar } from '../gerenciar/gerenciar';
import { ItemDoCofre } from './item';
import { type MotivoDeTrancar, Trancador } from './trancador';

type Vista = 'lista' | 'item' | 'novo' | 'lixeira' | 'gerenciar';
const DIA_MS = 86_400_000;
const AVISO_MS = 12_000;

/** Um texto para comparar sem maiúsculas nem acentos. */
const simples = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** O dia e a hora de um ISO, em palavras curtas ("21/10 às 14:32"). */
function quando(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * O cofre aberto (seções 8.1 a 8.2 e 10): a lista, o item e a lixeira, com os gatilhos de trancar. Os itens
 * são conferidos contra o manifesto ao ler (nada aparece se não baterem); um conflito com outro aparelho
 * relê tudo. Trancar avisa o servidor (`sendBeacon`) e recarrega a página, que joga fora a memória.
 */
@Component({
  selector: 'cofre-aberto',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ItemDoCofre, Gerenciar],
  templateUrl: './aberto.html',
  styleUrl: './aberto.scss',
  host: { '[class.borrado]': 'borrado()' },
})
export class Aberto implements OnInit {
  private readonly servicos = inject(SERVICOS);
  private readonly documento = inject(DOCUMENT);
  private readonly destroy = inject(DestroyRef);
  private trancador: Trancador | null = null;

  readonly cofre = input.required<CofreAberto>();
  /** O código da conta do Murall (para a faixa). */
  readonly conta = input.required<string>();

  protected readonly vista = signal<Vista>('lista');
  protected readonly itens = signal<readonly ItemNaLista[]>([]);
  protected readonly selecionado = signal<ItemNaLista | null>(null);
  protected readonly busca = signal('');
  protected readonly carregando = signal(true);
  protected readonly ocupado = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly bilhete = signal<string | null>(null);
  protected readonly ultimaMudanca = signal<string | null>(null);
  protected readonly borrado = signal(false);
  /** O item da lixeira esperando a confirmação de apagar de vez. */
  protected readonly confirmarApagar = signal<string | null>(null);
  private readonly item = viewChild(ItemDoCofre);

  protected readonly contaFormatada = computed(() => `${this.conta().slice(0, 4)}-${this.conta().slice(4)}`);
  protected readonly noCofre = computed(() => this.itens().filter((i) => !i.naLixeira && i.item));
  protected readonly naLixeira = computed(() => this.itens().filter((i) => i.naLixeira && i.item));
  protected readonly achados = computed(() => {
    const q = simples(this.busca().trim());
    const lista = this.noCofre().filter((i) => !q || [i.item!.titulo, i.item!.usuario, i.item!.url].some((c) => simples(c).includes(q)));
    return [...lista].sort((a, b) => simples(a.item!.titulo || a.item!.url).localeCompare(simples(b.item!.titulo || b.item!.url), 'pt-BR'));
  });

  async ngOnInit(): Promise<void> {
    const cofre = this.cofre();
    const m = cofre.manifesto;
    this.ultimaMudanca.set(`Mudado pela última vez em ${quando(m.mudadoEm)}, no ${m.aparelho || 'aparelho sem nome'}.`);
    setTimeout(() => this.ultimaMudanca.set(null), AVISO_MS);
    this.trancador = new Trancador(Date.parse(cofre.expiraEm) || Date.now() + 8 * 3_600_000, (motivo) => this.trancar(motivo), this.documento);
    this.trancador.comecar();
    const janela = this.documento.defaultView;
    if (janela) {
      // a tela some quando a janela perde o foco (seção 10), para ninguém ler por cima do ombro
      const borrar = () => this.borrado.set(true);
      const voltar = () => this.borrado.set(false);
      janela.addEventListener('blur', borrar);
      janela.addEventListener('focus', voltar);
      this.destroy.onDestroy(() => {
        janela.removeEventListener('blur', borrar);
        janela.removeEventListener('focus', voltar);
      });
    }
    this.destroy.onDestroy(() => this.trancador?.parar());
    await this.recarregar();
  }

  private falhou(e: unknown): void {
    if (e instanceof ErroConflito) {
      this.erro.set(e.message);
      void this.recarregar();
    } else if (e instanceof ErroApi && e.status === 401) {
      this.trancar('parado');
    } else if (e instanceof ErroCofre) {
      this.erro.set('O que veio do servidor não confere com o cofre. Nada foi mostrado. Tranque e avise quem cuida do cofre.');
      this.itens.set([]);
    } else {
      this.erro.set(e instanceof ErroApi ? e.message : 'Algo deu errado. Tente de novo.');
    }
  }

  protected async recarregar(): Promise<void> {
    const { api } = this.servicos;
    this.carregando.set(true);
    try {
      const lista = await lerItens(api, this.cofre());
      this.itens.set(await limparLapides(api, this.cofre(), lista));
    } catch (e) {
      this.falhou(e);
    } finally {
      this.carregando.set(false);
    }
  }

  protected avisar(texto: string): void {
    this.bilhete.set(texto);
    setTimeout(() => {
      if (this.bilhete() === texto) this.bilhete.set(null);
    }, 6000);
  }

  protected abrirItem(i: ItemNaLista): void {
    this.selecionado.set(i);
    this.erro.set(null);
    this.vista.set('item');
  }

  protected novo(): void {
    this.selecionado.set(null);
    this.erro.set(null);
    this.vista.set('novo');
  }

  protected voltarALista(): void {
    this.selecionado.set(null);
    this.vista.set('lista');
  }

  protected async salvar(campos: CamposDoItem): Promise<void> {
    this.ocupado.set(true);
    this.erro.set(null);
    try {
      const salvo = await salvarItem(this.servicos.api, this.cofre(), campos, this.selecionado());
      this.itens.update((lista) => [...lista.filter((i) => i.id !== salvo.id), salvo]);
      this.selecionado.set(salvo);
      this.vista.set('item');
      this.item()?.terminouDeSalvar();
      this.avisar('Guardado.');
    } catch (e) {
      this.falhou(e);
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async lixeira(alvo: ItemNaLista): Promise<void> {
    await this.mover(async () => {
      const movido = await paraALixeira(this.servicos.api, this.cofre(), alvo);
      this.itens.update((lista) => lista.map((i) => (i.id === alvo.id ? movido : i)));
      this.voltarALista();
      this.avisar('Na lixeira. Fica lá por 30 dias.');
    });
  }

  protected async voltarDaLixeira(alvo: ItemNaLista): Promise<void> {
    await this.mover(async () => {
      const voltou = await restaurar(this.servicos.api, this.cofre(), alvo);
      this.itens.update((lista) => lista.map((i) => (i.id === alvo.id ? voltou : i)));
      this.avisar('De volta ao cofre.');
    });
  }

  protected async apagar(alvo: ItemNaLista): Promise<void> {
    await this.mover(async () => {
      await apagarDeVez(this.servicos.api, this.cofre(), alvo);
      this.confirmarApagar.set(null);
      this.itens.update((lista) => lista.filter((i) => i.id !== alvo.id));
      this.avisar('Apagado de vez.');
    });
  }

  private async mover(fazer: () => Promise<void>): Promise<void> {
    this.ocupado.set(true);
    this.erro.set(null);
    try {
      await fazer();
    } catch (e) {
      this.falhou(e);
    } finally {
      this.ocupado.set(false);
    }
  }

  protected diasNaLixeira(i: ItemNaLista): number {
    const desde = Date.parse(i.naLixeiraDesde ?? '');
    return Number.isNaN(desde) ? 30 : Math.max(0, 30 - Math.floor((Date.now() - desde) / DIA_MS));
  }

  protected trancar(_motivo: MotivoDeTrancar = 'parado'): void {
    this.trancador?.parar();
    // M e V não servem mais (a página recarrega em seguida, mas não custa zerar já)
    const segredos = this.cofre().segredos;
    if (segredos) {
      segredos.m.fill(0);
      segredos.v.fill(0);
    }
    this.servicos.api.trancar();
    this.servicos.terminar();
  }

  protected valor(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }
}
