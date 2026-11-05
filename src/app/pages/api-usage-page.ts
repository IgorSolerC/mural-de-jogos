import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MedidoEm, SEM_CONTAGEM } from '../../../contrato/uso-apis/servicos';
import { ApiUsage, CloudflareReport, STATUS_LABEL, ServiceRow, ServiceTotals, ServiceStatus, ago, clock, dayLabel, dayTurn, duration, parseCloudflare, parseUsage, percent, usageView, wholeNumber } from '../core/api-usage';
import { CloudAccount, CloudError } from '../core/cloud-account';
import { ICON, IconModule } from '../ui/icons';
import { Pin } from '../ui/pin';
import { Cota } from './api-usage/cota';

/** Os grupos da tabela: por onde a chamada passa, porque a confiança da conta é diferente em cada um. */
const GROUP_TEXT: Record<MedidoEm, { title: string; note: string }> = {
  worker: { title: 'Pelo Worker', note: 'Passam pela API do Murall: a conta é exata.' },
  navegador: { title: 'Pelo navegador', note: 'Saem direto do aparelho. Conta aproximada, só de quem está logado.' },
  cloudflare: { title: 'Pela Cloudflare', note: 'Os números oficiais de hoje, da conta inteira. Podem atrasar alguns minutos.' },
};

/**
 * Uso das APIs (PLANO-ADMIN-APIS.md, seção 11): só a conta de admin abre. Uma prancheta de conferência
 * pregada na parede: a frase responde se há algo errado, e os papéis embaixo são a prova. Nada daqui fica
 * no navegador; a cada abertura, os números vêm de novo, e nada atualiza sozinho.
 */
@Component({
  selector: 'app-api-usage-page',
  imports: [Cota, IconModule, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './api-usage-page.html',
  styleUrl: './api-usage-page.scss',
})
export class ApiUsagePage {
  private readonly account = inject(CloudAccount);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private gone = false;

  protected readonly loading = signal(true);
  /** A última leitura que deu certo; o erro de atualizar não apaga o que já está na tela. */
  private readonly usage = signal<ApiUsage | null>(null);
  /** A rota da Cloudflare é à parte: se ela demora ou falha, o resto da tela está de pé. */
  protected readonly cloudflare = signal<CloudflareReport | null>(null);
  protected readonly cloudflareLoading = signal(true);
  protected readonly view = computed(() => {
    const usage = this.usage();
    return usage ? usageView(usage, this.cloudflare()) : null;
  });
  protected readonly failed = signal(false);
  protected readonly open = signal<string | null>(null);

  protected readonly groups = computed(() =>
    (this.view()?.groups ?? []).map((g) => {
      const text = GROUP_TEXT[g.id];
      // sem a leitura, a nota não pode prometer "os números oficiais"
      return { ...g, ...text, note: g.id === 'cloudflare' && this.cloudflare()?.estado !== 'ok' ? 'Onde tudo isso roda. A leitura dos números ainda não está ligada.' : text.note };
    }),
  );
  /** As cotas, juntas pelo que importa ao olhar: quando a conta vira. */
  protected readonly shelves = computed(() => {
    const v = this.view();
    if (!v) return [];
    const shelf = (janela: string, title: string) => ({ janela, title, quotas: v.quotas.filter((q) => q.janela === janela) });
    return [shelf('mes', 'Este mês · a conta vira dia 1º'), shelf('dia', `Hoje · a conta vira às ${dayTurn(v.now)}`), shelf('sempre', 'Sem data para virar')].filter((s) => s.quotas.length);
  });

  protected readonly uncounted = SEM_CONTAGEM;
  protected readonly checkedOn = dayLabel;
  protected readonly clock = clock;
  protected readonly RetryIcon = ICON.atualizar;
  protected readonly OpenIcon = ICON.abrir;
  /** As linhas de mentira da cartolina enquanto a primeira leitura não chega. */
  protected readonly placeholders = [0, 1, 2, 3];

  constructor() {
    this.destroyRef.onDestroy(() => (this.gone = true));
    void this.load();
  }

  /** Abrir a página e o Atualizar: a Cloudflare corre em paralelo, sem segurar os outros números. */
  protected load(fresh = false): Promise<unknown> {
    return Promise.all([this.loadUsage(), this.loadCloudflare(fresh)]);
  }

  protected async loadCloudflare(fresh = false): Promise<void> {
    this.cloudflareLoading.set(true);
    try {
      const raw = await this.account.request(`/v1/admin/cloudflare${fresh ? '?novo=1' : ''}`);
      if (!this.gone) this.cloudflare.set(parseCloudflare(raw));
    } catch {
      // o 403 quem trata é a outra rota; aqui, a tela só diz que a Cloudflare não respondeu
      if (!this.gone) this.cloudflare.set(parseCloudflare({ estado: 'fora' }));
    } finally {
      if (!this.gone) this.cloudflareLoading.set(false);
    }
  }

  private async loadUsage(): Promise<void> {
    this.loading.set(true);
    this.failed.set(false);
    try {
      const raw = await this.account.request('/v1/admin/uso');
      if (this.gone) return;
      this.usage.set(parseUsage(raw));
    } catch (e) {
      if (this.gone) return;
      if (e instanceof CloudError && e.status === 403) {
        // a bandeira guardada estava velha: a nuvem disse que não é mais admin
        await this.account.refresh().catch(() => undefined);
        if (!this.gone) void this.router.navigateByUrl('/extras');
        return;
      }
      this.failed.set(true);
    } finally {
      if (!this.gone) this.loading.set(false);
    }
  }

  protected toggle(id: string): void {
    this.open.update((now) => (now === id ? null : id));
  }

  protected statusLabel(status: ServiceStatus): string {
    return STATUS_LABEL[status];
  }

  protected count(status: ServiceStatus, n: number): string {
    return status === 'sem-contagem' ? '—' : wholeNumber(n);
  }

  /** As janelas maiores: quem só sabe de hoje fica em branco, e não com um zero falso. */
  protected span(r: ServiceRow, n: number): string {
    return r.soHoje ? '—' : this.count(r.status, n);
  }

  protected whole(n: number): string {
    return wholeNumber(n);
  }

  protected cpu(ms: number | null): string {
    return ms === null ? '—' : `${String(Math.round(ms * 10) / 10).replace('.', ',')} ms`;
  }

  /** Sem pedido, não há o que dizer: nunca um "0%" que parece bom. */
  protected failureShare(t: ServiceTotals): string {
    return t.falhas === null ? '—' : percent(t.falhas);
  }

  protected time(t: ServiceTotals): string {
    return t.tempoMs === null ? '—' : duration(t.tempoMs);
  }

  protected last(t: ServiceTotals, now: Date): string {
    return t.ultima ? ago(t.ultima, now) : '—';
  }
}
