import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { PiArrowDown, PiArrowUp, PiDotsSixVertical } from 'react-icons/pi'

function RankingItem({ item, index, total, onMove, disabled }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled })
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`tool-rank-item${isDragging ? ' is-dragging' : ''}`}>
    <span className="tool-rank-number">{index + 1}</span>
    <span className="tool-rank-label">{item.label}</span>
    <div className="tool-rank-controls">
      <button type="button" onClick={() => onMove(index, index - 1)} disabled={disabled || index === 0} aria-label={`Monter ${item.label}`}><PiArrowUp aria-hidden="true" /></button>
      <button type="button" onClick={() => onMove(index, index + 1)} disabled={disabled || index === total - 1} aria-label={`Descendre ${item.label}`}><PiArrowDown aria-hidden="true" /></button>
      <button ref={setActivatorNodeRef} type="button" {...attributes} {...listeners} disabled={disabled} className="tool-rank-handle" aria-label={`Déplacer ${item.label}`}><PiDotsSixVertical aria-hidden="true" /></button>
    </div>
  </div>
}

export default function ToolRanking({ items, onChange, disabled = false }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const move = (from, to) => {
    if (disabled || from < 0 || to < 0 || from >= items.length || to >= items.length) return
    onChange(arrayMove(items, from, to))
  }
  return <>
    <p className="tool-ranking-hint">Glisse les éléments ou utilise les flèches pour changer leur ordre.</p>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
      if (over && active.id !== over.id) move(items.findIndex((item) => item.id === active.id), items.findIndex((item) => item.id === over.id))
    }}>
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <div className="tool-ranking" role="group" aria-label="Classement">
          {items.map((item, index) => <RankingItem key={item.id} item={item} index={index} total={items.length} onMove={move} disabled={disabled} />)}
        </div>
      </SortableContext>
    </DndContext>
  </>
}
