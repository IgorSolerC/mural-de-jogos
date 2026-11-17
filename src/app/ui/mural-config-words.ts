import { LucideIconData } from 'lucide-angular';
import { AutoTab, GroupSort, GroupView, WallShow } from '../core/mural-config';
import type { Audience } from '../core/review';
import { ICON } from './icons';

/**
 * As palavras e os desenhos das Configurações do mural (ui/mural-config.ts), num lugar só: a folha do
 * conflito (ui/conflict-rows.ts) diz cada ajuste com os mesmos nomes da folha onde ele se muda.
 */

export const AUDIENCES: readonly { value: Audience; label: string; icon: LucideIconData; desc: string }[] = [
  { value: 'privada', label: 'Privada', icon: ICON.privada, desc: 'Fica só com você, e ninguém é avisado.' },
  { value: 'visivel', label: 'Disponível', icon: ICON.publica, desc: 'No seu mural e no seu perfil, sem aparecer no Feed.' },
  { value: 'publicar', label: 'Publicar', icon: ICON.megafone, desc: 'No seu mural e no Feed de quem segue você.' },
];
export const AUDIENCE_LABEL: Record<Audience, string> = { privada: 'Privada', visivel: 'Disponível', publicar: 'Publicar' };

/** As visualizações que um grupo pode escolher para abrir, com os desenhos dos botões da régua do mural. */
export const VIEWS: readonly { value: GroupView; label: string; icon: LucideIconData }[] = [
  { value: 'completa', label: 'Comuns', icon: ICON.completas },
  { value: 'inteira', label: 'Inteiras', icon: ICON.painel },
  { value: 'simples', label: 'Visão geral', icon: ICON.simples },
  { value: 'lista', label: 'Lista', icon: ICON.lista },
];

/** O "Mostrar também" do Filtrar, com os mesmos nomes, para o grupo abrir com eles ligados. */
export const SHOWS: readonly { value: WallShow; label: string; said: string }[] = [
  { value: 'finalizadas', label: 'Finalizadas', said: 'as finalizadas' },
  { value: 'kanban', label: 'Só no Kanban', said: 'as do Kanban' },
  { value: 'flashcards', label: 'Só nos Flashcards', said: 'as dos Flashcards' },
];

/** As abas que o mural gera, na lista dos grupos: o nome e o desenho fixos, e o que cada uma junta. */
export const AUTO_ROWS: readonly { key: AutoTab; label: string; icon: LucideIconData; what: string }[] = [
  { key: 'tudo', label: 'Tudo', icon: ICON.camadas, what: 'O mural inteiro, de todos os grupos' },
  { key: 'fixadas', label: 'Fixadas', icon: ICON.fixar, what: 'As fixadas de todos os grupos, quando há alguma' },
  { key: 'compartilhadas', label: 'Compartilhadas', icon: ICON.pessoas, what: 'O que outras pessoas compartilharam com você' },
];

/** As ordens que um grupo pode escolher para abrir, com os nomes do Ordenar da pasta. */
export const SORTS: readonly { value: GroupSort; label: string; icon: LucideIconData }[] = [
  { value: 'prioridade', label: 'Prioridade', icon: ICON.fixar },
  { value: 'data', label: 'Data', icon: ICON.calendario },
  { value: 'alfabetica', label: 'Título', icon: ICON.porNome },
  { value: 'assunto', label: 'Pasta', icon: ICON.pastaDeNotas },
  { value: 'tag', label: 'Tag', icon: ICON.etiqueta },
  { value: 'criacao', label: 'Criação', icon: ICON.novaNota },
  { value: 'alteracao', label: 'Alteração', icon: ICON.historico },
  { value: 'finalizacao', label: 'Finalização', icon: ICON.concluido },
  { value: 'tarefas', label: 'Tarefas', icon: ICON.tarefas },
  { value: 'cor', label: 'Cor', icon: ICON.paleta },
  { value: 'quem', label: 'Quem vê', icon: ICON.privada },
  { value: 'dono', label: 'Dono', icon: ICON.pessoa },
];
