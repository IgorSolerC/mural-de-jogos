import { Importance } from '../core/kanban';

/** Quantos tracinhos da escala a importância acende (de 5): Crítico 5 … Baixíssimo 1. */
export const IMPORTANCE_LEVEL: Record<Importance, number> = { critico: 5, importante: 4, medio: 3, baixo: 2, baixissimo: 1 };
