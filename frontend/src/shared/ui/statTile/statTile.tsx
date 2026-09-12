import type { ReactNode } from 'react'

import { cn } from '@shared/lib/cn'

import { Tile } from '../panel'

export type StatTone = 'neutral' | 'fail' | 'pass' | 'muted'

type Props = {
  label: ReactNode
  value: ReactNode
  /** Строка под значением: единица, запас, пояснение. */
  hint?: ReactNode
  tone?: StatTone
  className?: string
  /** Плитка становится кнопкой: открыть подробности по клику/фокусу. */
  onClick?: () => void
  title?: string
}

const TONE: Record<StatTone, string> = {
  neutral: 'bg-card text-ink',
  fail: 'bg-fail-bg text-fail shadow-none [&_.stat-label]:text-fail',
  pass: 'bg-card text-ink [&_.stat-hint]:text-pass',
  muted: 'bg-card text-muted [&_.stat-label]:text-muted-300',
}

/* Смена тона (BASE ↔ STRESS) перекрашивает плитку плавно, а не скачком. */
const MOTION = 'transition-[background-color,color,box-shadow] duration-300 ease-(--ease-soft) [&_.stat-label]:transition-colors [&_.stat-label]:duration-300'

/**
 * Плитка показателя: подпись сверху, значение крупно. Статус передаётся тоном
 * И подписью — на одном цвете разница «прошло / нарушено» не строится.
 */
export function StatTile({ label, value, hint, tone = 'neutral', className, onClick, title }: Props) {
  const body = (
    <>
      <span className="stat-label block text-[12.5px] leading-tight text-muted">{label}</span>
      <span className="mt-2 block text-[16px] leading-tight font-bold tracking-[-0.01em] whitespace-nowrap tabular-nums">
        {value}
      </span>
      {hint ? <span className="stat-hint mt-1 block text-[11.5px] leading-snug text-muted">{hint}</span> : null}
    </>
  )

  if (onClick) {
    return (
      <Tile
        className={cn(TONE[tone], MOTION, 'p-0 text-left', className)}
        title={title}
      >
        <button
          type="button"
          onClick={onClick}
          className="block h-full w-full rounded-tile px-4 py-3.5 text-left"
        >
          {body}
        </button>
      </Tile>
    )
  }

  return (
    <Tile className={cn('px-4 py-3.5', TONE[tone], MOTION, className)} title={title}>
      {body}
    </Tile>
  )
}
