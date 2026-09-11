import type { CaseCatalog } from '@shared/api/contracts'
import { STATUS_LABEL, SUBMISSION_MANIFEST } from '@shared/config/submissionManifest'

type Props = {
  /** Каталога может не быть: раздел обязан открываться и до расчёта. */
  catalog: CaseCatalog | undefined
  /** Пользователь смотрит собранный вручную вариант, а не финальное решение. */
  isDraft: boolean
}

/**
 * «Материалы решения» — постоянный нижний раздел страницы.
 *
 * Требования, которые он выполняет:
 *
 * - доступен всегда, в том числе до расчёта и при ошибке бэкенда;
 * - это витрина материалов, а не дерево папок;
 * - отсутствующий материал помечен «не добавлено» и НЕ получает ссылку;
 * - материалы финального решения отделены от экспорта текущего варианта,
 *   и если наверху открыт черновик, об этом сказано прямо.
 */
export function SolutionMaterials({ catalog, isDraft }: Props) {
  return (
    <section className="panel materials" id="materials">
      <header className="panel__head">
        <h2>Материалы финального решения команды</h2>
        {catalog ? (
          <span className="badge badge--neutral">
            данные <code>{catalog.dataset_hash.slice(0, 12)}…</code> · движок{' '}
            {catalog.engine_version}
          </span>
        ) : null}
      </header>

      <p className="panel__muted">
        Состав сдачи по критериям: продуктовая часть П1–П9 и техническая Т1–Т5. Раздел
        показывает, что подготовлено, а что ещё нет. Он не создаёт документы и ничего не
        публикует.
      </p>

      {isDraft ? (
        <p className="state">
          Наверху открыт черновик, собранный вручную. Материалы ниже относятся к
          финальному решению команды и от ручной правки не меняются.
        </p>
      ) : null}

      <div className="materials__groups">
        {SUBMISSION_MANIFEST.map((group) => (
          <article key={group.id} className="materials__group">
            <h3>{group.title}</h3>
            <p className="materials__criteria">{group.criteria}</p>
            <ul className="materials__list">
              {group.materials.map((material) => (
                <li key={material.title} className={`materials__item is-${material.status}`}>
                  <div className="materials__row">
                    <span className="materials__title">
                      {material.href ? (
                        <a href={material.href} target="_blank" rel="noreferrer">
                          {material.title}
                        </a>
                      ) : (
                        material.title
                      )}
                    </span>
                    <span className={`badge badge--${material.status}`}>
                      {STATUS_LABEL[material.status]}
                    </span>
                  </div>
                  <p className="materials__purpose">{material.purpose}</p>
                  <p className="materials__meta">
                    <span>{material.format}</span>
                    {material.path ? <code>{material.path}</code> : null}
                  </p>
                  {material.note ? (
                    <p className="materials__note">{material.note}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <p className="panel__note">
        Пути указаны относительно корня репозитория и показаны текстом: страница отдаётся
        сборщиком и файлы репозитория по ссылке не открывает. «Готово» означает, что файл
        лежит в репозитории, а не что его содержимое принято командой.
      </p>
    </section>
  )
}
