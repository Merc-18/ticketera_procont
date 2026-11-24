import { useState, useRef } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { useChecklist } from '../../hooks/useChecklist'
import type { ProjectFlow } from '../../types/database.types'
import { PHASE_LABELS } from '../../lib/constants'
import { useAuth } from '../../hooks/useAuth'
import { canEdit } from '../../lib/access'
import { errorMessage } from '../../lib/supabase-errors'
import { toast } from '../../lib/toast'
import { phasesFor } from '../../lib/board'
import Icon from '../ui/Icon'
import { missingTemplateTasks } from '../../lib/checklist-templates'

interface Props {
  flow: ProjectFlow
  /** Tras cada cambio: recargar el snapshot del servidor (progreso y pendientes). */
  onChanged?: () => void
}

export default function ChecklistSection({ flow, onChanged }: Props) {
  const { user } = useAuth()
  const editable = canEdit(user)
  const busy = useRef(false)
  const { items, loading, error, toggleItem, addItem, addMany, editItem, deleteItem, reorderItems } = useChecklist(flow.id)

  const handleDragEnd = async (result: DropResult) => {
    const { source, destination } = result
    if (!destination || source.droppableId !== destination.droppableId) return
    if (source.index === destination.index) return
    if (!editable || busy.current) return
    busy.current = true
    setSaving('order')
    try { await reorderItems(source.droppableId, source.index, destination.index) }
    catch (err) { toast.error(errorMessage(err)) }
    finally { busy.current = false; setSaving(null) }
  }
  const [newItemText, setNewItemText] = useState<Record<string, string>>({})
  const [expandedPhase, setExpandedPhase] = useState<string | null>(flow.current_phase)
  const [saving, setSaving] = useState<string | null>(null)

  const phases = phasesFor(flow.flow_type)

  const itemsByPhase = phases.reduce((acc, phase) => {
    acc[phase] = items.filter(i => i.phase === phase)
    return acc
  }, {} as Record<string, typeof items>)

  const handleToggle = async (itemId: string, completed: boolean) => {
    if (!editable || busy.current) return
    busy.current = true
    setSaving(itemId)
    try { await toggleItem(itemId, completed); onChanged?.() }
    catch (err) { toast.error(errorMessage(err)) }
    finally { busy.current = false; setSaving(null) }
  }
  const handleAdd = async (phase: string) => {
    const text = newItemText[phase]?.trim()
    if (!text || !editable || busy.current) return
    busy.current = true
    setSaving(phase)
    try { await addItem(phase, text); setNewItemText(prev => ({ ...prev, [phase]: '' })); onChanged?.() }
    catch (err) { toast.error(errorMessage(err)) }
    finally { busy.current = false; setSaving(null) }
  }

  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const handleEdit = async () => {
    const text = editing?.text.trim()
    if (!editing || !text || !editable || busy.current) return
    busy.current = true
    setSaving(editing.id)
    try { await editItem(editing.id, text); setEditing(null); onChanged?.() }
    catch (err) { toast.error(errorMessage(err)) }
    finally { busy.current = false; setSaving(null) }
  }
  /** Tarjetas existentes: agrega la plantilla de una fase vacía por acción explícita (sin duplicar texto). */
  const handleSuggested = async (phase: string, tasks: string[]) => {
    if (!tasks.length || !editable || busy.current) return
    busy.current = true
    setSaving(phase)
    try { await addMany(phase, tasks); toast.success(`Se agregaron ${tasks.length} tareas sugeridas.`); onChanged?.() }
    catch (err) { toast.error(errorMessage(err)) }
    finally { busy.current = false; setSaving(null) }
  }

  const handleDelete = async (id: string) => {
    if (!editable || busy.current) return
    busy.current = true
    setSaving(id)
    try { await deleteItem(id); onChanged?.() }
    catch (err) { toast.error(errorMessage(err)) }
    finally { busy.current = false; setSaving(null) }
  }

  if (error) return <p role="alert" className="text-red-700">{error}</p>
  if (loading) {
    return <p role="status" className="text-sm text-gray-600 py-2">Cargando checklist…</p>
  }

  const totalItems = items.length
  const completedItems = items.filter(i => i.completed).length
  // El porcentaje del checklist lo calcula el servidor (snapshot); aquí solo se muestran conteos.

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
    <div className="space-y-1.5 mt-3">
      {/* Resumen global */}
      {totalItems > 0 && (
        <div className="text-xs text-gray-500 mb-2">
          <span>{completedItems} de {totalItems} tareas completadas</span>
        </div>
      )}

      {phases.map(phase => {
        const phaseItems = itemsByPhase[phase] || []
        const isCurrentPhase = phase === flow.current_phase
        const isExpanded = expandedPhase === phase
        const completedCount = phaseItems.filter(i => i.completed).length
        const allDone = phaseItems.length > 0 && completedCount === phaseItems.length

        return (
          <div
            key={phase}
            className={`border rounded-lg overflow-hidden ${
              isCurrentPhase ? 'border-brand-300' : allDone ? 'border-green-200' : 'border-gray-200'
            }`}
          >
            <button
              onClick={() => setExpandedPhase(isExpanded ? null : phase)}
              className={`w-full px-3 py-2 flex items-center justify-between text-sm font-medium transition ${
                isCurrentPhase
                  ? 'bg-brand-50 text-brand-800 hover:bg-brand-100'
                  : allDone
                  ? 'bg-green-50 text-green-800 hover:bg-green-100'
                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-2">
                {isCurrentPhase && <span className="w-2 h-2 bg-accent-400 rounded-full" aria-hidden="true" />}{isCurrentPhase && <span className="sr-only">Fase actual</span>}
                {allDone && !isCurrentPhase && <Icon name="check" size={14} className="text-green-700" aria-label="Completada" />}
                <span>{PHASE_LABELS[phase]}</span>
                {isCurrentPhase && (
                  <span className="text-xs bg-brand-200 text-brand-700 px-1.5 py-0.5 rounded font-normal">
                    Fase actual
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {phaseItems.length > 0 && (
                  <span className={`text-xs ${allDone ? 'text-green-700 font-semibold' : 'text-gray-500'}`}>
                    {completedCount}/{phaseItems.length}
                  </span>
                )}
                <Icon name="arrow" size={14} className={`text-gray-500 transition-transform ${isExpanded ? '-rotate-90' : 'rotate-90'}`} />
              </div>
            </button>

            {isExpanded && (
              <div className="p-3 space-y-1.5 bg-surface">
                {phaseItems.length === 0 && (() => {
                  const suggested = missingTemplateTasks(flow.flow_type, phase, phaseItems)
                  return suggested.length ? (
                    <div className="checklist-suggested" aria-label={`Tareas sugeridas para ${PHASE_LABELS[phase]}`}>
                      <p className="checklist-suggested-title">Tareas sugeridas para {PHASE_LABELS[phase]}</p>
                      <ul>{suggested.map(t => <li key={t}>{t}</li>)}</ul>
                      {editable && (
                        <button type="button" className="ui-button ui-button-secondary" disabled={!!saving}
                          onClick={() => { void handleSuggested(phase, suggested) }}>
                          <Icon name="plus" size={16} />{saving === phase ? 'Agregando…' : `Agregar tareas sugeridas (${suggested.length})`}
                        </button>
                      )}
                    </div>
                  ) : <p className="text-sm text-gray-600 mb-2">Sin tareas. Agrega una a continuación.</p>
                })()}

                <Droppable droppableId={phase}>
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
                      {phaseItems.map((item, index) => (
                        <Draggable isDragDisabled={!editable || !!saving} key={item.id} draggableId={item.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`flex items-start gap-2.5 group py-0.5 rounded ${
                                snapshot.isDragging ? 'bg-brand-50 shadow-sm' : ''
                              } ${saving === item.id ? 'opacity-50' : ''}`}
                            >
                              <span
                                {...provided.dragHandleProps}
                                className="text-gray-500 hover:text-gray-700 cursor-grab active:cursor-grabbing mt-0.5 shrink-0 text-xs select-none"
                                title="Arrastrar para reordenar"
                              >
                                ⠿
                              </span>
                              <input
                                type="checkbox"
                                checked={item.completed}
                                disabled={!editable || !!saving}
                                onChange={() => handleToggle(item.id, !item.completed)}
                                className="mt-0.5 w-4 h-4 text-brand-600 border-gray-300 rounded cursor-pointer flex-shrink-0"
                              />
                              {editing?.id === item.id ? (
                                <span className="checklist-edit">
                                  <input aria-label="Editar tarea" autoFocus value={editing.text} maxLength={2000}
                                    onChange={e => setEditing({ id: item.id, text: e.target.value })}
                                    onKeyDown={e => { if (e.key === 'Enter') void handleEdit(); if (e.key === 'Escape') setEditing(null) }}
                                    className="ui-input" />
                                  <button type="button" onClick={() => { void handleEdit() }} disabled={!editing.text.trim() || !!saving} className="ui-button ui-button-primary">Guardar</button>
                                  <button type="button" onClick={() => setEditing(null)} className="ui-button ui-button-quiet">Cancelar</button>
                                </span>
                              ) : (
                              <span
                                className={`text-sm leading-snug flex-1 ${
                                  item.completed ? 'line-through text-gray-500' : 'text-gray-700'
                                }`}
                              >
                                {item.description}
                              </span>
                              )}
                              {editable && editing?.id !== item.id && (
                                <button
                                  disabled={!!saving} onClick={() => setEditing({ id: item.id, text: item.description })}
                                  aria-label={`Editar tarea: ${item.description}`} title="Editar tarea"
                                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 text-gray-500 hover:text-brand-700 transition flex-shrink-0 inline-grid place-items-center min-w-[32px] min-h-[32px] rounded"
                                >
                                  <Icon name="edit" size={14} />
                                </button>
                              )}
                              <button
                                aria-label={`Eliminar tarea: ${item.description}`}
                                disabled={!editable || !!saving} onClick={() => { void handleDelete(item.id) }}
                                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 text-gray-500 hover:text-red-700 transition ml-1 flex-shrink-0 inline-grid place-items-center min-w-[32px] min-h-[32px] rounded"
                                title="Eliminar item"
                              >
                                <Icon name="close" size={14} />
                              </button>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>

                {/* Agregar nuevo item */}
                <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100">
                  <input
                    type="text"
                    value={newItemText[phase] || ''}
                    onChange={e => setNewItemText(prev => ({ ...prev, [phase]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleAdd(phase)}
                    placeholder="Agregar item..."
                    className="flex-1 text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                  <button
                    onClick={() => handleAdd(phase)}
                    disabled={!editable || !!saving || !newItemText[phase]?.trim()}
                    className="text-xs px-2.5 py-1.5 bg-brand-100 text-brand-700 rounded hover:bg-brand-200 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    + Agregar
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
    </DragDropContext>
  )
}
