// Catálogo de colores personales (M17, 24 identificadores) y paleta ofrecida de 10 (24/11/2026). Módulo puro.
export const OWNER_COLORS = [
  { id: 'azul', label: 'Azul Procont' }, { id: 'azul-claro', label: 'Azul claro' },
  { id: 'azul-oscuro', label: 'Azul profundo' }, { id: 'azul-acero', label: 'Azul acero' },
  { id: 'celeste', label: 'Celeste' }, { id: 'celeste-claro', label: 'Celeste claro' },
  { id: 'celeste-oscuro', label: 'Celeste intenso' }, { id: 'celeste-acero', label: 'Celeste acero' },
  { id: 'dorado', label: 'Dorado' }, { id: 'dorado-claro', label: 'Dorado claro' },
  { id: 'dorado-oscuro', label: 'Dorado tostado' }, { id: 'dorado-ocre', label: 'Dorado ocre' },
  { id: 'ambar', label: 'Ámbar' }, { id: 'ambar-claro', label: 'Ámbar claro' },
  { id: 'ambar-oscuro', label: 'Ámbar profundo' }, { id: 'ambar-bronce', label: 'Ámbar bronce' },
  { id: 'grafito', label: 'Grafito' }, { id: 'grafito-claro', label: 'Grafito claro' },
  { id: 'grafito-oscuro', label: 'Grafito oscuro' }, { id: 'grafito-humo', label: 'Grafito humo' },
  { id: 'pizarra', label: 'Pizarra' }, { id: 'pizarra-claro', label: 'Pizarra claro' },
  { id: 'pizarra-oscuro', label: 'Pizarra oscuro' }, { id: 'pizarra-acero', label: 'Pizarra acero' },
] as const
export type OwnerColorId = typeof OWNER_COLORS[number]['id']

/**
 * Paleta ofrecida (24/11/2026): 10 colores, máximo pedido por el usuario. Son los 6 originales aprobados
 * (azul, celeste, dorado, ámbar, grafito, pizarra; incluyen las dos asignaciones reales: azul y pizarra) y los
 * 4 tonos del catálogo M17 más alejados de ellos en CIELAB, medido en claro y oscuro (BOARD_COLOR_PALETTE.md).
 * Los otros 14 identificadores siguen siendo válidos para PINTAR una asignación previa, pero no se ofrecen.
 * Mientras no se aplique la migración propuesta, la autoasignación del servidor aún puede entregar uno retirado.
 */
export const OWNER_PALETTE: readonly OwnerColorId[] = [
  'azul', 'celeste', 'dorado', 'ambar', 'grafito', 'pizarra', 'dorado-claro', 'ambar-bronce', 'celeste-oscuro', 'pizarra-acero',
]
export const OWNER_PALETTE_SIZE = OWNER_PALETTE.length
const OFFERED = new Set<string>(OWNER_PALETTE)
export const isOfferedColor = (color: string | null | undefined) => !!color && OFFERED.has(color)
export const ownerColorLabel = (color: string | null | undefined) => OWNER_COLORS.find(c => c.id === color)?.label ?? null
/** Colores de la paleta ofrecida que nadie más tiene asignados. */
export const availableColors = (assignments: Record<string, string>, userId: string) =>
  OWNER_PALETTE.filter(c => !Object.entries(assignments).some(([id, color]) => color === c && id !== userId))
