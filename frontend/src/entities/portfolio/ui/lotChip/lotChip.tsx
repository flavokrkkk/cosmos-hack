import { X } from '@phosphor-icons/react'

import { LotIcon } from '@entities/case'
import { cn } from '@shared/lib/cn'
import { IconButton, ModeBadge } from '@shared/ui'

type Props = {
  lotId: string
  title: string
  /** Режим показывается, когда его назначил сервер. */
  modeId?: string
  onRemove?: (lotId: string) => void
  onClick?: (lotId: string) => void
  className?: string
}

/** Чип выбранного лота в правой колонке ручной проверки. */
export function LotChip({ lotId, title, modeId, onRemove, onClick, className }: Props) {
  return (
    <div
      className={cn(
        'relative flex min-h-[96px] min-w-[132px] flex-col gap-2 rounded-card border border-line bg-card px-3 pt-3 pb-2.5 shadow-tile backdrop-blur-[8px]',
        className,
      )}
    >
      {onRemove ? (
        <IconButton
          label={`Убрать ${title}`}
          size="sm"
          onClick={() => onRemove(lotId)}
          className="absolute top-1 right-1 text-muted-300"
        >
          <X weight="bold" />
        </IconButton>
      ) : null}
      <button
        type="button"
        onClick={onClick ? () => onClick(lotId) : undefined}
        disabled={!onClick}
        className="flex flex-col items-start gap-2 text-left disabled:cursor-default"
        aria-label={`Подробнее о лоте ${title}`}
      >
        <span className="flex items-center gap-2">
          <LotIcon lotId={lotId} tone="brand" size="sm" />
          {modeId ? <ModeBadge mode={modeId} size="sm" /> : null}
        </span>
        <span className="text-[13px] font-bold">{lotId}</span>
      </button>
    </div>
  )
}
