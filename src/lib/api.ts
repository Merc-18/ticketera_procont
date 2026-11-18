import { supabase } from './supabase'
import { createOperations } from './operations'
import { createMetricsAdapter } from './metrics-adapter'

export const operations = createOperations(supabase)
/** Métricas del servidor (contrato de Codex; ver metrics-adapter.ts). */
export const metrics = createMetricsAdapter(supabase)
import { createBoard } from './board'
/** Tablero: RPC de operaciones de Codex (M12); sin escrituras directas a fases/estado/auditoría. */
export const board = createBoard(supabase)
