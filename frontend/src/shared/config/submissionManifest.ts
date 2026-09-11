/**
 * Состав сдачи — то, что эксперт должен найти, не разбирая дерево папок.
 *
 * Данные лежат здесь, а не в JSX: чтобы добавить материал или проставить
 * ссылку, править компонент не нужно. Когда на бэкенде появится
 * `SubmissionManifest`, этот файл заменяется одним запросом — форма записи
 * та же.
 *
 * ПРАВИЛО: не ставить ссылку на то, чего нет. Отсутствующий материал получает
 * статус `missing` и честную подпись. Фальшивая активная ссылка хуже
 * отсутствия: эксперт кликает, попадает в 404 и перестаёт верить остальному.
 */

export type MaterialStatus = 'ready' | 'draft' | 'missing'

export type Material = {
  title: string
  /** Зачем этот материал, одной строкой. */
  purpose: string
  format: string
  /** Путь в репозитории. Показывается текстом, копируется глазами. */
  path?: string
  /** Внешний адрес. Ставить, только когда он реально открывается. */
  href?: string
  status: MaterialStatus
  /** Чем статус отличается от «готово». Обязателен для draft и missing. */
  note?: string
}

export type MaterialGroup = {
  /** Совпадает с группировкой продуктовых критериев П1–П9 в плане сдачи. */
  id: string
  title: string
  criteria: string
  materials: Material[]
}

export const STATUS_LABEL: Record<MaterialStatus, string> = {
  ready: 'готово',
  draft: 'черновик',
  missing: 'не добавлено',
}

/**
 * Ссылка на репозиторий команды в GitVerse.
 *
 * Пусто: репозиторий на момент написания не создан, а выдумывать адрес нельзя.
 * Как появится — вписать сюда, и раздел покажет рабочую ссылку сам.
 */
export const REPOSITORY_URL = ''

export const SUBMISSION_MANIFEST: readonly MaterialGroup[] = [
  {
    id: 'documents',
    title: 'Документы',
    criteria: 'П1–П9 — продуктовая часть, 75 из 100 баллов',
    materials: [
      {
        title: 'Управленческая записка',
        purpose: 'Выбор четырёх лотов и режимов, финансовая и договорная модель, риски, дорожная карта',
        format: '8–12 страниц',
        path: 'docs/10-management-note.md',
        status: 'draft',
        note: 'Исходник в репозитории. PDF для сдачи ещё не собран.',
      },
      {
        title: 'Резюме стресс-сценария',
        purpose: 'Что происходит с портфелем при сокращении лимита и какое решение принимается',
        format: 'ровно 1 страница, отдельный файл',
        path: 'docs/11-stress-summary.md',
        status: 'draft',
        note: 'Исходник в репозитории. PDF для сдачи ещё не собран.',
      },
      {
        title: 'Презентация защиты',
        purpose: 'Доклад и живой пересчёт на защите',
        format: '≤ 12 слайдов',
        status: 'missing',
        note: 'Не добавлена. Обязательный материал сдачи.',
      },
    ],
  },
  {
    id: 'code',
    title: 'Код и запуск',
    criteria: 'Т1, Т5 — формулы в коде и воспроизводимый запуск',
    materials: [
      {
        title: 'Репозиторий команды',
        purpose: 'Сдача целиком: код, данные, настройки, документы',
        format: 'GitVerse',
        status: REPOSITORY_URL ? 'ready' : 'missing',
        href: REPOSITORY_URL || undefined,
        note: REPOSITORY_URL ? undefined : 'Адрес репозитория ещё не внесён в манифест.',
      },
      {
        title: 'Инструкция запуска',
        purpose: 'Как эксперт поднимает backend и frontend у себя, без логина и ключей',
        format: 'README',
        path: 'README.md',
        status: 'ready',
      },
      {
        title: 'Расчётное ядро',
        purpose: 'Формулы портфеля, перебор, проверка ограничений',
        format: 'Python',
        path: 'backend/app/core/services/portfolio_engine/',
        status: 'ready',
      },
      {
        title: 'Зависимости',
        purpose: 'Версии, на которых решение реально проверено',
        format: 'requirements.txt, package.json',
        path: 'backend/requirements.txt · frontend/package.json',
        status: 'ready',
      },
    ],
  },
  {
    id: 'data',
    title: 'Данные и настройки',
    criteria: 'Т2 — портфель и параметры меняются без правки кода',
    materials: [
      {
        title: 'Исходные данные кейса',
        purpose: 'Лоты, режимы доступа и конфигурация организаторов — взяты без изменений',
        format: 'CSV, JSON, case_core.py',
        path: 'case/source/',
        status: 'ready',
        note: 'Неизменяемые материалы организаторов. Версия видна в шапке как dataset_hash.',
      },
      {
        title: 'Конфигурация решения команды',
        purpose: 'Выбранный портфель, альтернативы и допущения — правится файлом, не кодом',
        format: 'JSON',
        path: 'config/decision.json',
        status: 'ready',
      },
    ],
  },
  {
    id: 'results',
    title: 'Результаты и проверка',
    criteria: 'Т3, Т4 — проверка ограничений и сопоставление вариантов',
    materials: [
      {
        title: 'Контрольные результаты BASE и STRESS',
        purpose: 'Числа, с которыми обязаны совпадать записка, слайды и вывод инструмента',
        format: 'CSV, JSON',
        path: 'results/',
        status: 'ready',
      },
      {
        title: 'Тесты расчётного ядра',
        purpose: 'Проверка формул и воспроизводимости',
        format: 'pytest',
        path: 'tests/test_engine.py · backend/tests/test_portfolio.py',
        status: 'ready',
        note: 'Наличие файлов не означает, что прогон был зелёным: отчёта о прогоне в сдаче нет.',
      },
    ],
  },
]
