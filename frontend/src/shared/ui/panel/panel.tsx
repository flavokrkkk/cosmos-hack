import type { ComponentProps } from 'react'

import { cn } from '@shared/lib/cn'

/** Большой мягкий контейнер раздела (второй уровень поверхности после страницы). */
export function Panel({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cn('rounded-panel border border-line bg-panel p-4 shadow-panel backdrop-blur-[8px]', className)}
      {...props}
    />
  )
}

/** Белая карточка внутри панели или сама по себе. */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('rounded-card border border-line bg-card shadow-card backdrop-blur-[8px]', className)}
      {...props}
    />
  )
}

/** Плитка показателя — самый мелкий уровень поверхности. */
export function Tile({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('rounded-tile border border-line bg-card shadow-tile backdrop-blur-[8px]', className)} {...props} />
}

/** Заголовок панели: слева название, справа действия/переключатель. */
export function PanelHeader({ className, ...props }: ComponentProps<'header'>) {
  return (
    <header
      className={cn('mb-4 flex flex-wrap items-center justify-between gap-3', className)}
      {...props}
    />
  )
}

export function PanelTitle({ className, ...props }: ComponentProps<'h2'>) {
  return (
    <h2 className={cn('text-[20px] leading-tight font-bold', className)} {...props} />
  )
}
