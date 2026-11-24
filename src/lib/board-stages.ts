// Identidad visual de las columnas del Kanban (24/11/2026). Solo presentación: no cambia fases, flujo ni datos.
// Cada fase real del contrato (DEVELOPMENT_PHASES / ADMINISTRATIVE_PHASES) recibe un TONO de etapa; el color
// concreto (claro y oscuro) vive en index.css bajo [data-stage]. Tres canales independientes:
//   etapa → columna (fondo sutil + acento de cabecera)   prioridad → insignia   responsable → franja + anillo.
// Sin violeta (Taste). Tonos derivados de la identidad Procont y de los colores semánticos aprobados.

export type StageTone = 'queue' | 'analysis' | 'design' | 'build' | 'review' | 'testing' | 'release' | 'done'

const TONES: Record<string, StageTone> = {
  // Development (flujo vigente M12)
  backlog: 'queue', analysis: 'analysis', design: 'design', dev: 'build',
  code_review: 'review', testing: 'testing', deploy: 'release', done: 'done',
  // Administrative (histórico)
  ready_to_start: 'review', discovery: 'analysis', build: 'build', uat_validation: 'testing', deployed: 'done',
}

/** Tono de etapa de una fase; una fase desconocida usa el tono neutro de cola. */
export const stageTone = (phase: string | null | undefined): StageTone => (phase && TONES[phase]) || 'queue'
