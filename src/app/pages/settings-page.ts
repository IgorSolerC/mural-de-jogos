import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { PeoplePrivacy, ProfilePeople } from '../core/profile-people';
import { Comments, CommentsFrom } from '../core/comments';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  BookOpen,
  Cloud as CloudIcon,
  Copy,
  Link as LinkIconData,
  Megaphone,
  CircleCheck,
  Disc3,
  Download,
  Eye,
  EyeOff,
  Film,
  Gamepad2,
  HardDriveDownload,
  Gauge,
  Gem,
  LayoutGrid,
  LogOut,
  LucideIconData,
  Pencil,
  Search,
  UserRound,
  UsersRound,
  LucideAngularModule,
  RefreshCw,
  RotateCcw,
  Scale,
  CloudOff,
  Origami,
  ShieldAlert,
  Trash2,
  TriangleAlert,
  Tv,
  Upload,
  X,
  Zap,
} from 'lucide-angular';
import { BACKUP_EVERY_DAYS, Backup, backupFileName } from '../core/backup';
import { backupLists, ownerNameOf, readBackupFile } from '../core/backup-file';
import { eraseSave, takeErased } from '../core/erase-save';
import { ReviewStore } from '../core/review-store';
import { KEEP_VERSION_DAYS, KeptReason, KeptVersion, sameContent, versionKey } from '../core/kept-versions';
import { OWNER_NAME_MAX, ScoreDisplay, Settings, PerformanceKey, PerformancePreset } from '../core/settings';
import { Confirm } from '../ui/confirm';
import { Toasts } from '../ui/toast';
import { Pin } from '../ui/pin';
import { Bonus, fold, formatScore } from '../core/review';
import { scramble } from '../core/spoiler';
import { KINDS, Kind, cap, profileOf } from '../core/kinds';
import { Mural } from '../core/mural';
import { JudgeLabel } from '../ui/judge-label';
import { BonusSticker } from '../ui/bonus';
import { Rabisco } from '../ui/rabisco';
import { KIND_ICON } from '../ui/kind-switcher';
import { Busy } from '../ui/busy';
import { Cloud } from '../core/cloud-config';
import { CloudAccount, CloudError } from '../core/cloud-account';
import { CloudSync } from '../core/cloud-sync';
import { BeforeCloudCopy, KEEP_DAYS, readBeforeCloud } from '../core/cloud-before';
import { GoogleButton } from '../ui/google-button';
import { muralLink, normalizeCode } from '../core/cloud-murals';
import { News } from '../core/news';
import { GameLookup } from '../core/game-lookup';
import { SiteKeys } from '../core/site-keys';
import { plural } from '../core/text';
import { DAY_MS, daysAgoLabel, localDay } from '../core/dates';


type Tab = 'conta' | 'mural' | 'amigos' | 'backup' | 'busca' | 'desempenho';
const TABS: readonly Tab[] = ['conta', 'mural', 'amigos', 'backup', 'busca', 'desempenho'];

/** "às 14:32" hoje; "em 3 de outubro às 14:32" antes. */
function when(ms: number): string {
  const d = new Date(ms);
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString()
    ? `às ${time}`
    : `em ${d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })} às ${time}`;
}

/**
 * Ajustes: um quadro de pinus com parafusos e papelão dentro. À esquerda (no celular, em cima), uma
 * etiqueta de papel por parte (Conta, Mural, Amigos, Backup, Busca), com uma linha do que tem nela; ao
 * lado, a folha creme da parte aberta. Cada ajuste é uma linha: o nome, o que ele faz e o controle
 * (interruptor, seletor ou botão). O que não tem volta fica junto, no pé da folha, em "Cuidado".
 * Nada aqui tem botão de salvar: vale na hora. Em Mural e Amigos, cada ajuste tem uma prévia do que
 * ele muda: no computador, num bilhete no papelão embaixo do índice (o ajuste em que o mouse ou o
 * foco está); no celular, embaixo do ajuste tocado.
 */
@Component({
  selector: 'app-settings-page',
  imports: [Busy, LucideAngularModule, Pin, GoogleButton, RouterLink, NgTemplateOutlet, JudgeLabel, BonusSticker, Rabisco],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  /** As partes, na ordem do índice. A aberta fica no endereço (#/ajustes?aba=backup), para links irem direto. */
  protected readonly tabs: readonly { id: Tab; label: string; hint: string; icon: LucideIconData }[] = [
    { id: 'conta', label: 'Conta', hint: 'Nome, perfil e nuvem', icon: UserRound },
    { id: 'mural', label: 'Mural', hint: 'Notas, grupos e spoilers', icon: LayoutGrid },
    { id: 'amigos', label: 'Amigos', hint: 'O que chega dos outros', icon: UsersRound },
    { id: 'backup', label: 'Backup', hint: 'Baixar e restaurar', icon: HardDriveDownload },
    { id: 'busca', label: 'Busca', hint: 'De onde vêm as capas', icon: Search },
    { id: 'desempenho', label: 'Desempenho', hint: 'Qualidade ou leveza', icon: Gauge },
  ];
  /** As três predefinições de qualidade do mural (ver `PERFORMANCE_PRESETS`). */
  protected readonly presets: readonly { id: PerformancePreset; label: string; icon: LucideIconData }[] = [
    { id: 'desempenho', label: 'Desempenho', icon: Zap },
    { id: 'equilibrio', label: 'Equilíbrio', icon: Scale },
    { id: 'qualidade', label: 'Qualidade', icon: Gem },
  ];
  /** O que cada predefinição faz, numa frase. */
  protected readonly presetHint: Record<PerformancePreset, string> = {
    desempenho: 'Tudo o que alivia o aparelho, ligado. Para computador sem placa de vídeo, notebook antigo ou celular que engasga.',
    equilibrio: 'O padrão: o desenho inteiro das fichas, com a rolagem solta.',
    qualidade: 'Cada traço como foi desenhado, sem nenhum atalho. Pede mais do aparelho ao rolar.',
  };
  /** Cada escolha de Desempenho, com o interruptor dela. */
  protected readonly performanceOptions: readonly { id: string; key: PerformanceKey; title: string; desc: string }[] = [
    {
      id: 'camadas',
      key: 'cardLayers',
      title: 'Rolagem lisa',
      desc: 'Cada ficha perto da tela é desenhada uma vez e guardada, em vez de ser redesenhada quando as vizinhas chegam. A rolagem fica bem mais solta; alguns traços a lápis saem um tico mais suaves.',
    },
    {
      id: 'sombra',
      key: 'noCutShadows',
      title: 'Sem sombra na cartolina',
      desc: 'As fichas rasgadas, queimadas e furadas ficam sem a sombra que segue o recorte; as inteiras continuam com a delas. É o que mais alivia um aparelho sem placa de vídeo.',
    },
    {
      id: 'lapis',
      key: 'plainPencil',
      title: 'Lápis sem grão',
      desc: 'Os rabiscos a lápis e as manchas de lama, de mofo e de terra perdem o grão e o tremido, e ficam de traço limpo.',
    },
    {
      id: 'paradas',
      key: 'stillCards',
      title: 'Fichas paradas',
      desc: 'As fichas não levantam quando o mouse passa, e os brilhos das notas altas ficam parados.',
    },
    {
      id: 'poucas',
      key: 'fewCards',
      title: 'Menos fichas prontas',
      desc: 'Menos fichas ficam montadas em volta da tela, e entram uma de cada vez. Numa rolagem rápida, aparecem mais vagas tracejadas antes de as fichas entrarem; o aparelho trabalha bem menos.',
    },
  ];
  /** As etiquetas no papelão, cada uma presa num ângulo (a aberta fica reta). */
  protected readonly tilts = ['-1.2deg', '0.9deg', '-0.6deg', '1.1deg', '-0.9deg', '0.7deg'];
  protected readonly tab = signal<Tab>(this.tabFrom(this.route.snapshot.queryParamMap.get('aba')));
  /** Um link para outra aba (o "Baixar backup" do aviso) com a página já aberta também troca a aba. */
  private readonly followTabParam = this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((q) => this.tab.set(this.tabFrom(q.get('aba'))));

  private tabFrom(value: string | null): Tab {
    // "perfil" era o nome da Conta (links antigos e de outras páginas)
    if (value === 'perfil') return 'conta';
    return TABS.includes(value as Tab) ? (value as Tab) : 'conta';
  }

  /** O ajuste cuja prévia aparece (o último em que o mouse passou ou o foco entrou), na parte em que ele está. */
  private readonly peeked = signal<{ tab: Tab; id: string } | null>(null);
  protected readonly peeking = computed(() => {
    const p = this.peeked();
    return p && p.tab === this.tab() ? p.id : null;
  });

  protected peek(id: string): void {
    if (this.peeked()?.id !== id) this.peeked.set({ tab: this.tab(), id });
  }

  protected go(id: Tab): void {
    this.tab.set(id);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { aba: id }, replaceUrl: true });
  }

  /** Setas, Home e End andam entre as partes (o padrão das abas para teclado; o índice fica de pé ou deitado). */
  protected onTabKey(e: KeyboardEvent): void {
    const i = TABS.indexOf(this.tab());
    const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
    const next = forward ? (i + 1) % TABS.length : back ? (i - 1 + TABS.length) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    this.go(TABS[next]);
    queueMicrotask(() => document.getElementById(`aba-${TABS[next]}`)?.focus());
  }

  protected readonly store = inject(ReviewStore);
  protected readonly settings = inject(Settings);
  /** O jeito de mostrar a nota, com um 8,4 em cada um. */
  protected readonly scoreDisplays: readonly { value: ScoreDisplay; label: string; sample: string }[] = [
    { value: 'livre', label: 'Como dei', sample: '8,4' },
    { value: 'metade', label: 'De meio em meio', sample: '8,5' },
    { value: 'inteiro', label: 'Inteiras', sample: '8' },
  ];
  protected readonly backup = inject(Backup);
  protected readonly ownerNameMax = OWNER_NAME_MAX;
  /** Como o próximo backup vai se chamar, com o nome digitado. */
  protected readonly fileNamePreview = computed(() =>
    backupFileName(this.settings.ownerName(), localDay(new Date()), typeof CompressionStream === 'undefined' ? 'json' : 'json.gz'),
  );
  private readonly toasts = inject(Toasts);
  private readonly confirm = inject(Confirm);
  protected readonly cloud = inject(Cloud);
  protected readonly news = inject(News);
  protected readonly MegaphoneIcon = Megaphone;
  private readonly lookup = inject(GameLookup);
  private readonly siteKeys = inject(SiteKeys);
  protected readonly account = inject(CloudAccount);
  /** Quem você segue e quem te segue, no seu perfil: as listas ou só os números (fica na nuvem). */
  protected readonly peoplePrivacy = inject(ProfilePeople);
  protected readonly privacyBusy = signal(false);
  /** Quem comenta nas suas fichas: quem segue você, ou só quem você segue (fica na nuvem). */
  protected readonly comments = inject(Comments);
  protected readonly commentsBusy = signal(false);
  /** O seu nome na prévia de quem comenta ("Para comentar, siga Igor."). */
  protected readonly previewName = computed(() => this.account.account()?.nome ?? 'você');
  protected readonly sync = inject(CloudSync);
  protected readonly beforeCopy = signal<BeforeCloudCopy | null>(null);
  /** A ação da conta em andamento ('entrar', 'codigo', 'sair', 'sair-todos', 'apagar'): ela mostra o aro, as outras esperam. */
  protected readonly accountBusy = signal<string | null>(null);
  protected readonly exporting = signal(false);
  protected readonly importing = signal(false);
  protected readonly accountMsg = signal<string | null>(null);

  protected readonly DownloadIcon = Download;
  protected readonly UploadIcon = Upload;
  protected readonly ShowIcon = Eye;
  protected readonly HideIcon = EyeOff;
  protected readonly ClearIcon = X;
  protected readonly OkIcon = CircleCheck;
  protected readonly AlertIcon = TriangleAlert;
  protected readonly ShieldIcon = ShieldAlert;
  protected readonly TrashIcon = Trash2;
  protected readonly CloudOnIcon = CloudIcon;
  protected readonly CopyIcon = Copy;
  protected readonly PenIcon = Pencil;
  protected readonly ResetIcon = RotateCcw;
  protected readonly FriendsIcon = UsersRound;
  protected readonly mural = inject(Mural);
  protected readonly kindIcon = KIND_ICON;
  /** Os murais com fichas (a prévia de "Novidades em Amigos"). */
  protected readonly wallKinds: readonly Kind[] = KINDS.filter((k) => k !== 'anotacoes');
  /** O 8,4 da prévia das notas, como ele aparece com a escolha de agora. */
  protected readonly sampleScore = computed(() => {
    this.settings.scoreDisplay();
    return formatScore(8.4);
  });
  /** O pedaço de parede da prévia das etiquetas: dois meses, cinco fichas. */
  protected readonly wallSample = [
    { label: 'Março', stocks: ['rosa', 'azul', 'verde'] },
    { label: 'Fevereiro', stocks: ['amarelo', 'laranja'] },
  ];
  /** A prévia do modo sem spoilers: dois bônus, um de cada lado, e uma frase de resenha. */
  protected readonly sampleBonuses: Bonus[] = [
    { id: 'trilha-sonora', label: 'Trilha sonora incrível', kind: 'favor' },
    { id: 'bugs', label: 'Muitos bugs', kind: 'contra' },
  ];
  protected readonly sampleLead = 'Valeu cada hora, mesmo com o final corrido.';
  protected readonly sampleLeadMasked = scramble(this.sampleLead, 'previa');
  protected readonly LinkIcon = LinkIconData;
  protected readonly LogOutIcon = LogOut;
  protected readonly RefreshIcon = RefreshCw;
  protected readonly CloudOffIcon = CloudOff;

  protected readonly showRawg = signal(false);
  protected readonly showTmdb = signal(false);

  /** A busca do site tem as duas chaves: ninguém precisa da própria. */
  protected readonly siteReady = computed(() => !!this.cloud.config() && this.siteKeys.rawg() && this.siteKeys.tmdb());
  /** "Usar as suas próprias chaves" abre sozinho quando há chave colada ou quando o site está sem as dele. */
  protected readonly keysOpen = signal(this.settings.hasRawg() || this.settings.hasTmdb() || !this.siteReady());
  protected readonly ownKeysLine = computed(() => {
    const own = [this.settings.hasTmdb() && 'TMDB', this.settings.hasRawg() && 'RAWG'].filter(Boolean);
    return own.length ? `Em uso: ${own.join(' e ')}` : 'Opcional';
  });

  /** De onde cada mural busca agora: muda com as chaves (as suas e as do site). */
  protected readonly sources = computed(() => {
    const games = this.lookup.gamesSource();
    const films = this.lookup.filmsSource();
    const yours = (own: boolean) => (own ? ', com a sua chave' : '');
    const rows: { wall: string; icons: LucideIconData[]; name: string; via: string }[] = [
      { wall: 'Jogos', icons: [Gamepad2], name: games.name, via: games.name === 'RAWG' ? `com a capa da Steam${yours(games.own)}` : 'em inglês' },
      { wall: 'Livros', icons: [BookOpen], name: 'Open Library', via: 'edição em português' },
      { wall: 'Filmes e séries', icons: [Film, Tv], name: films.name, via: films.name === 'TMDB' ? `em português${yours(films.own)}` : 'em inglês' },
      { wall: 'Animes', icons: [Origami], name: 'Kitsu', via: 'nome brasileiro quando tem' },
      { wall: 'Músicas', icons: [Disc3], name: 'iTunes', via: 'capa e um trecho de cada faixa, sem chave' },
    ];
    return rows;
  });

  /** O que pede atenção, por parte: a sincronização com problema, o backup atrasado. */
  protected readonly attention = computed<Partial<Record<Tab, string>>>(() => ({
    ...(this.syncTrouble() && this.account.signedIn() ? { conta: 'a sincronização precisa de atenção' } : {}),
    ...(this.overdue() ? { backup: 'hora de baixar um backup' } : {}),
  }));
  protected readonly importMsg = signal<{ text: string; error: boolean } | null>(null);
  protected readonly erasing = signal(false);

  constructor() {
    // a página recarregou depois de apagar o save
    if (takeErased()) this.toasts.show('Save apagado. O mural começou do zero.');
    // a cópia de antes da nuvem nasce na primeira sincronização: confere de novo a cada uma
    effect(() => {
      this.sync.lastSyncAt();
      void readBeforeCloud().then((copy) => this.beforeCopy.set(copy));
    });
    // a escolha de quem você segue e quem te segue fica na nuvem: vem dela ao entrar na conta
    effect(() => {
      if (this.account.signedIn() && this.cloud.config()) {
        untracked(() => {
          void this.peoplePrivacy.loadPrivacy();
          void this.comments.loadFrom();
        });
      }
    });
  }

  protected async setCommentsFrom(value: CommentsFrom): Promise<void> {
    if (this.commentsBusy() || this.comments.from() === value) return;
    this.commentsBusy.set(true);
    try {
      await this.comments.setFrom(value);
    } catch (err) {
      this.toasts.show(err instanceof Error ? err.message : 'Não deu para mudar agora. Tente de novo.');
    } finally {
      this.commentsBusy.set(false);
    }
  }

  protected async setPeoplePrivacy(value: PeoplePrivacy): Promise<void> {
    if (this.privacyBusy() || this.peoplePrivacy.privacy() === value) return;
    this.privacyBusy.set(true);
    try {
      await this.peoplePrivacy.setPrivacy(value);
    } catch (err) {
      this.toasts.show(err instanceof Error ? err.message : 'Não deu para mudar agora. Tente de novo.');
    } finally {
      this.privacyBusy.set(false);
    }
  }

  private readonly wishCount = computed(() => this.store.wishes().length);
  protected readonly hasData = computed(() => this.store.count() > 0 || this.store.draftCount() > 0 || this.wishCount() > 0);

  /** Dias desde o último backup (null: nunca baixou). */
  private readonly daysSince = computed(() => {
    const at = this.backup.lastAt();
    return at ? Math.max(0, Math.floor((Date.now() - Date.parse(at)) / DAY_MS)) : null;
  });

  /** Mesmo critério do bilhete em cima do mural: passou do prazo, ou nunca baixou e já tem o que guardar. */
  protected readonly overdue = computed(() => {
    if (this.backup.inCloud()) return false;
    const d = this.daysSince();
    return this.hasData() && (d === null || d >= BACKUP_EVERY_DAYS);
  });

  protected readonly lastBackup = computed(() => {
    const d = this.daysSince();
    if (d === null) return 'Nenhum backup baixado ainda';
    const when = daysAgoLabel(d);
    return this.overdue() ? `Último backup: ${when}. Hora de baixar outro.` : `Último backup: ${when}`;
  });

  /** O que entra no arquivo, contado. */
  protected readonly contents = computed(() => {
    const n = this.store.count();
    const drafts = this.store.draftCount();
    const wishes = this.wishCount();
    if (!n && !drafts && !wishes) return 'Ainda não há nada para guardar.';
    const parts = [plural(n, 'resenha', 'resenhas')];
    if (drafts) parts.push(`${drafts} pra depois`);
    if (wishes) parts.push(`${wishes} na wishlist`);
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}` : parts[0];
    return `O arquivo leva ${list}.`;
  });

  /** "K7QF-M2XA" soletrado para o leitor de tela: "K 7 Q F, M 2 X A". */
  protected spelled(code: string): string {
    return code.split('-').map((part) => part.split('').join(' ')).join(', ');
  }

  /** Roda uma ação da conta mostrando o erro da nuvem na ficha. */
  private async accountAction(key: string, run: () => Promise<void>): Promise<boolean> {
    this.accountBusy.set(key);
    this.accountMsg.set(null);
    try {
      await run();
      return true;
    } catch (err) {
      this.accountMsg.set(err instanceof CloudError ? err.message : 'Algo deu errado. Tente de novo.');
      return false;
    } finally {
      this.accountBusy.set(null);
    }
  }

  protected async signIn(credential: string): Promise<void> {
    let created = false;
    if (await this.accountAction('entrar', async () => void (created = (await this.account.signIn(credential)).nova))) {
      this.toasts.show(created ? 'Conta criada. O seu código está aqui em Ajustes.' : 'Você entrou na sua conta.');
    }
  }

  protected async copyCode(code: string): Promise<void> {
    await this.toasts.copy(code, `Código ${code} copiado`, 'Não deu para copiar. Selecione o código e copie à mão.');
  }

  /** A linha do estado da sincronização, na ficha da Conta. */
  protected readonly syncLine = computed(() => {
    const status = this.sync.status();
    const at = this.sync.lastSyncAt();
    switch (status) {
      case 'sincronizando':
        return 'Sincronizando…';
      case 'ok':
        return at ? `Salvo na nuvem ${when(at)}` : 'Salvo na nuvem';
      case 'sem-rede':
        return 'Só neste aparelho por enquanto';
      case 'pausado':
        return 'Sincronização pausada';
      case 'escolha':
        return 'Falta uma escolha sua';
      case 'desatualizado':
        return 'Site desatualizado';
      case 'erro':
        return 'A sincronização parou';
      default:
        return at ? `Salvo na nuvem ${when(at)}` : 'Conectando à nuvem…';
    }
  });
  protected readonly syncTrouble = computed(() => ['sem-rede', 'pausado', 'escolha', 'desatualizado', 'erro'].includes(this.sync.status()));

  protected reload(): void {
    location.reload();
  }

  protected readonly keepDays = KEEP_VERSION_DAYS;
  /** Por que cada versão ficou guardada, do jeito que a lista diz. */
  private static readonly KEPT_WHY: Record<KeptReason, string> = {
    juntou: 'mudou em dois aparelhos',
    apagada: 'apagada em outro aparelho',
    editor: 'chegou enquanto você editava',
    trocada: 'saiu quando você restaurou outra',
    compartilhada: 'de uma anotação compartilhada, não pôde subir',
  };
  /** As versões guardadas (ver core/kept-versions.ts), com o que a lista mostra de cada uma. */
  protected readonly keptVersions = computed(() =>
    this.store.versions().map((v) => {
      const now = this.store.get(v.ficha.id);
      return {
        v,
        key: versionKey(v),
        name: v.ficha.game.name,
        icon: this.kindIcon[v.ficha.kind],
        wall: cap(profileOf(v.ficha.kind).singular),
        why: SettingsPage.KEPT_WHY[v.motivo],
        when: new Date(v.em).toLocaleString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
        current: !!now && sameContent(now, v.ficha),
      };
    }),
  );

  protected restoreVersion(v: KeptVersion): void {
    this.store.restoreVersion(v);
    this.toasts.show(`“${v.ficha.game.name}” voltou ao mural como estava nessa versão.`);
  }

  protected copyUntil(copy: BeforeCloudCopy): string {
    const until = new Date(Date.parse(copy.at) + KEEP_DAYS * DAY_MS);
    return until.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
  }

  protected downloadBefore(copy: BeforeCloudCopy): void {
    const url = URL.createObjectURL(copy.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meu-mural-antes-da-nuvem-${localDay(new Date(copy.at))}.json.gz`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  protected async copyLink(code: string): Promise<void> {
    await this.toasts.copy(muralLink(code), 'Link do mural copiado', `Não deu para copiar. O link é ${muralLink(code)}`);
  }

  /** O código que a pessoa está escrevendo para trocar o dela, como foi digitado. */
  protected readonly codeDraft = signal('');
  /** O mesmo, do jeito que a nuvem guarda (`ABCD-1234`); null enquanto não é um código possível. */
  protected readonly codeWanted = computed(() => normalizeCode(this.codeDraft()));
  /** O código que a nuvem recusou por já ser de outra pessoa: o aviso fica até o campo mudar. */
  protected readonly codeTaken = signal('');
  /** A linha embaixo do campo: o que falta, como o código vai ficar, ou que ele já tem dono. */
  protected readonly codeNote = computed<{ text: string; bad: boolean } | null>(() => {
    const typed = this.codeDraft().toUpperCase().replace(/[\s-]/g, '');
    if (!typed) return null;
    const wanted = this.codeWanted();
    if (!wanted) {
      if (/[^0-9A-Z]/.test(typed)) return { text: 'Só letras sem acento e números.', bad: true };
      if (typed.includes('U')) return { text: 'A letra U não entra no código.', bad: true };
      return typed.length > 8 ? { text: 'São 8 letras e números.', bad: true } : null;
    }
    if (wanted === this.codeTaken()) return { text: `${wanted} já é de outra pessoa. Escolha outro.`, bad: true };
    if (wanted === this.account.account()?.codigo) return { text: 'Esse já é o seu código.', bad: false };
    // O vira 0, I e L viram 1 (para ninguém confundir ao ler): a pessoa vê o código como ele vai ficar
    return wanted.replace('-', '') === typed ? null : { text: `Vai ficar ${wanted}: O vira 0, I e L viram 1.`, bad: false };
  });
  private readonly codeInput = viewChild<ElementRef<HTMLInputElement>>('codeInput');

  /** Troca o código pelo que a pessoa escreveu, se ninguém estiver usando. */
  protected async chooseCode(event: Event, current: string): Promise<void> {
    event.preventDefault();
    const code = this.codeWanted();
    if (!code || code === current || this.accountBusy()) return;
    const sure = await this.confirm.ask({
      title: `Trocar o código para ${code}?`,
      text:
        'O código e o link de agora param de abrir o seu mural, e o código antigo fica livre para outra pessoa usar. Quem já abriu fica com a cópia que tinha, e quem segue você continua seguindo.',
      confirm: `Usar ${code}`,
      icon: null,
    });
    if (!sure) return;
    let taken = false;
    const done = await this.accountAction('codigo-escolhido', async () => {
      try {
        await this.account.chooseCode(code);
      } catch (err) {
        // já tem dono: o aviso vai embaixo do campo, e o código de agora continua valendo
        if (!(err instanceof CloudError) || err.code !== 'codigo-em-uso') throw err;
        taken = true;
      }
    });
    if (taken) {
      this.codeTaken.set(code);
      this.codeInput()?.nativeElement.focus();
    } else if (done) {
      this.codeDraft.set('');
      this.codeTaken.set('');
      this.toasts.show(`Código novo: ${code}`);
    }
  }

  protected async newCode(): Promise<void> {
    const sure = await this.confirm.ask({
      title: 'Trocar o código?',
      text:
        'O código e o link de agora param de abrir o seu mural. Quem já abriu fica com a cópia que tinha, e quem segue você continua seguindo.',
      confirm: 'Trocar o código',
      icon: null,
    });
    let code = '';
    if (sure && (await this.accountAction('codigo', async () => void (code = await this.account.newCode())))) {
      this.toasts.show(`Código novo: ${code}`);
    }
  }

  protected async signOut(): Promise<void> {
    let done = false;
    if (await this.accountAction('sair', async () => void (done = await this.sync.signOut()))) {
      if (done) this.toasts.show('Você saiu da conta. O mural continua neste navegador.');
    }
  }

  protected async signOutEverywhere(): Promise<void> {
    const sure = await this.confirm.ask({
      title: 'Sair de todos os aparelhos?',
      text: 'Todo aparelho onde você entrou vai precisar entrar de novo. O mural de cada um continua lá.',
      confirm: 'Sair de todos',
      icon: null,
    });
    if (sure && (await this.accountAction('sair-todos', () => this.account.signOutEverywhere()))) {
      this.toasts.show('Você saiu de todos os aparelhos.');
    }
  }

  protected async deleteAccount(name: string, code: string): Promise<void> {
    const sure = await this.confirm.ask({
      title: 'Apagar a conta?',
      text:
        `A conta de ${name}, o código ${code} e tudo o que estiver na nuvem vão embora, e quem segue você deixa de seguir. ` +
        'O mural deste navegador continua aqui. Não dá para desfazer.',
      confirm: 'Apagar a conta',
    });
    if (sure && (await this.accountAction('apagar', () => this.account.deleteAccount()))) {
      this.sync.forgetAccount();
      this.toasts.show('Conta apagada. O mural continua neste navegador.');
    }
  }

  /** Liga ou desliga as duas perguntas do editor (sem categoria, sem tag) de uma vez. */
  protected setAskOnSave(on: boolean): void {
    this.settings.askNoCategory.set(on);
    this.settings.askNoTag.set(on);
  }

  /** "Voltar ao padrão": pergunta antes, dizendo o que volta e o que fica. */
  protected async resetAll(): Promise<void> {
    const sure = await this.confirm.ask({
      title: 'Voltar ao padrão?',
      text:
        'As escolhas de Mural, Amigos e Desempenho voltam ao começo: notas como você deu, etiquetas dos grupos, contagem de novidades e a pergunta ao salvar sem categoria ou tag ligadas, ' +
        'sem spoilers desligado, o que você não avaliou em segredo, novidades de todos os murais e a qualidade do mural no Equilíbrio. ' +
        'O seu nome, o perfil, a conta, as chaves e o backup não mudam.',
      confirm: 'Voltar ao padrão',
      icon: null,
      tone: 'neutro',
    });
    if (!sure) return;
    this.settings.resetPreferences();
    this.toasts.show('Os ajustes voltaram ao padrão.');
  }

  protected async exportFile(): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    try {
      await this.backup.download();
    } finally {
      this.exporting.set(false);
    }
  }

  /** Apagar o save: pergunta, apaga e recarrega, para nada ficar com o save velho na memória. */
  protected async erase(): Promise<void> {
    const sure = await this.confirm.ask({
      text:
        'Tudo o que o mural guarda neste navegador vai embora: resenhas, pra depois, wishlist, colegas e Extras.' +
        (this.overdue() ? ' Você não tem um backup recente.' : '') +
        ' Não dá para desfazer.',
      confirm: 'Apagar o save',
    });
    if (!sure) return;
    this.erasing.set(true);
    await eraseSave();
    location.reload();
  }

  protected async importFile(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      // lê antes de perguntar: um arquivo que não serve não pede confirmação nenhuma
      this.importing.set(true);
      let text: string;
      try {
        text = await readBackupFile(file);
      } finally {
        this.importing.set(false);
      }
      // não serve (não é backup, é de outro app ou de uma versão mais nova): avisa antes de perguntar qualquer coisa
      const owner = ownerNameOf(backupLists(text).data);
      const n = this.store.count();
      const lists = this.store.draftCount() + this.wishCount();
      // com algo aqui, a pergunta vem depois do arquivo: juntar (o seguro, a principal) ou substituir
      let replace = false;
      if (n > 0 || lists > 0) {
        const choice = await this.confirm.choose({
          title: 'Juntar ou substituir?',
          text:
            'Juntar soma o arquivo ao que já está aqui (se uma resenha está nos dois, fica a mais nova). ' +
            'Substituir apaga o que está aqui e deixa os murais iguais ao arquivo.',
          confirm: 'Juntar',
          secondary: 'Substituir',
        });
        if (!choice) return;
        replace = choice === 'secondary';
      }
      // o backup de um colega misturaria as fichas dele com as suas: o lugar dele é Comparar
      const me = this.settings.ownerName().trim();
      if (
        owner &&
        me &&
        fold(owner) !== fold(me) &&
        !(await this.confirm.ask({
          title: `Esse backup é de ${owner}`,
          text: `As fichas de ${owner} vão ${replace ? 'ficar no lugar das suas' : 'se misturar com as suas'}. Para ver o mural sem misturar, abra o arquivo em Extras › Comparar.`,
          confirm: replace ? 'Substituir mesmo assim' : 'Juntar mesmo assim',
          icon: null,
        }))
      ) {
        return;
      }
      if (
        replace &&
        (n > 0 || lists > 0) &&
        !(await this.confirm.ask({
          text: n
            ? `${n === 1 ? 'A resenha que está aqui sai' : `As ${n} resenhas que estão aqui saem`} e os murais ficam iguais ao arquivo.`
            : 'O pra depois e a wishlist daqui saem e ficam iguais aos do arquivo.',
          confirm: 'Substituir',
          icon: null,
        }))
      ) {
        return;
      }
      const res = this.store.importJson(text, replace ? 'replace' : 'merge');
      // o seu próprio backup num navegador novo: o nome volta junto, se ainda não há um aqui
      if (!this.settings.ownerName().trim() && owner) this.settings.ownerName.set(owner.slice(0, OWNER_NAME_MAX));
      const parts = [plural(res.added, 'resenha nova', 'resenhas novas')];
      if (res.updated) parts.push(plural(res.updated, 'atualizada', 'atualizadas'));
      if (res.skipped) parts.push(plural(res.skipped, 'ignorada', 'ignoradas'));
      if (res.removed) parts.push(`${plural(res.removed, 'apagada', 'apagadas')} como no backup`);
      if (res.drafts) parts.push(`${res.drafts} pra depois`);
      if (res.wishes) parts.push(`${res.wishes} na wishlist`);
      this.importMsg.set({ text: `Backup restaurado: ${parts.join(', ')}.`, error: false });
      const total = res.added + res.updated;
      if (total) this.toasts.show(`${plural(total, 'resenha voltou', 'resenhas voltaram')} para os murais`);
    } catch (err) {
      this.importMsg.set({ text: (err as Error).message, error: true });
    }
  }
}
