import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core'

interface DragHandleProps {
  attributes: DraggableAttributes
  listeners: DraggableSyntheticListeners
  label?: string
}

export default function DragHandle({ attributes, listeners, label = 'גרור' }: DragHandleProps) {
  return (
    <button
      {...attributes}
      {...listeners}
      className="shrink-0 select-none touch-none cursor-grab active:cursor-grabbing text-gray-400 dark:text-gray-500 p-3"
      aria-label={label}
    >
      ⠿
    </button>
  )
}
