import { Skeleton } from '@shared/ui'

/**
 * Скелет первой отрисовки: повторяет геометрию экрана автоподбора, чтобы
 * каталог появился на своём месте без прыжка вёрстки, а не после спиннера.
 */
export function PageSkeleton() {
  return (
    <main
      className="mx-auto flex w-full max-w-[1440px] flex-col gap-14 px-6 pt-7 pb-10 sm:px-8 xl:px-[60px]"
      aria-busy
      aria-label="Загружаем каталог кейса"
    >
      <div className="flex justify-center">
        <Skeleton className="h-12 w-[310px] rounded-full" />
      </div>
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-7 w-[420px] max-w-full" />
        <Skeleton className="h-4 w-[520px] max-w-full" />
        <Skeleton className="mt-3 h-[26px] w-[300px] rounded-full" />
        <Skeleton className="mt-8 h-[52px] w-[220px] rounded-full" />
      </div>
      <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <li key={index}>
            <Skeleton className="h-[205px] rounded-card" />
          </li>
        ))}
      </ul>
    </main>
  )
}
