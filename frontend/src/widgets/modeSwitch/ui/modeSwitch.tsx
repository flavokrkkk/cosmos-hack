import { BookmarkSimple, Moon, Sun } from '@phosphor-icons/react'

import { useSavedVariants, useWorkspace, type WorkspaceMode } from '@entities/portfolio'
import { useTheme } from '@shared/lib/theme'
import { Button, IconButton, Segmented } from '@shared/ui'

type Props = {
  onOpenSaved: () => void
}

const OPTIONS = [
  { value: 'auto' as const, label: 'Автоподбор' },
  { value: 'manual' as const, label: 'Ручная проверка' },
]

/**
 * Верхняя панель: переключатель режима страницы по центру, сохранённые варианты справа.
 * Переключение режима ничего не сбрасывает — у каждого режима своё состояние.
 */
export function ModeSwitch({ onOpenSaved }: Props) {
  const mode = useWorkspace((state) => state.mode)
  const setMode = useWorkspace((state) => state.setMode)
  const savedCount = useSavedVariants((state) => state.items.length)
  const { theme, toggleTheme } = useTheme()
  const dark = theme === 'dark'

  return (
    <div className="flex flex-col items-center gap-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:gap-4">
      <div className="hidden sm:block" />
      <Segmented
        value={mode}
        onChange={(value: WorkspaceMode) => setMode(value)}
        options={OPTIONS}
        label="Режим страницы"
      />
      <div className="flex items-center gap-2 sm:justify-self-end">
        <IconButton
          label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'}
          size="md"
          onClick={toggleTheme}
          aria-pressed={dark}
          className="opacity-80 hover:opacity-100"
        >
          {dark ? <Sun className="size-[18px]" aria-hidden /> : <Moon className="size-[18px]" aria-hidden />}
        </IconButton>
        <Button variant="ghost" size="sm" onClick={onOpenSaved}>
          <BookmarkSimple className="size-4" aria-hidden />
          Сохранённые{savedCount > 0 ? ` · ${savedCount}` : ''}
        </Button>
      </div>
    </div>
  )
}
