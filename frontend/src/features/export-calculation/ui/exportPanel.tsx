import { snapshotFiles } from '@entities/portfolio'
import type { Calculation, CaseCatalog, ComparisonResult } from '@shared/api/contracts'
import { downloadFile } from '@shared/lib'

type Props = {
  calculation: Calculation | undefined
  catalog: CaseCatalog
  /** Если сравнение посчитано, в выгрузку попадает и `comparison.csv`. */
  comparison: ComparisonResult | undefined
}

/**
 * Выгрузка текущего расчёта — критерий Т5.
 *
 * Формат не изобретён здесь: имена файлов и колонки совпадают с контрольными
 * снимками в `results/`, которые пишет `python -m engine export`. Эксперт может
 * положить выгрузку рядом с ними и сравнить построчно.
 *
 * Числа берутся из ответа бэкенда дословно, в полной точности. Фронтенд не
 * пересчитывает показатели — иначе выгрузка перестала бы быть доказательством.
 */
export function ExportPanel({ calculation, catalog, comparison }: Props) {
  const ready = calculation?.status === 'complete' && calculation.metrics !== null
  const files = ready ? snapshotFiles(calculation, catalog, comparison) : []

  return (
    <section className="panel" id="export">
      <header className="panel__head">
        <h2>Экспорт текущего варианта</h2>
        {ready ? (
          <span className="badge badge--neutral">
            input_hash {calculation.input_hash.slice(0, 12)}…
          </span>
        ) : null}
      </header>

      <p className="panel__muted">
        Выгрузка того портфеля, который сейчас в разделе «Текущий портфель». Имена файлов
        и колонки те же, что у контрольных результатов в <code>results/</code> — их пишет{' '}
        <code>python -m engine export</code>. Числа сохраняются в полной точности, без
        округления. Это не материалы финального решения команды: их список ниже.
      </p>

      {!ready ? (
        <p className="state">
          Выгрузка доступна для полного портфеля из четырёх лотов. Сейчас портфель не
          собран.
        </p>
      ) : (
        <>
          <ul className="export-list">
            {files.map((file) => (
              <li key={file.name}>
                <code>{file.name}</code>
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={() => downloadFile(file.name, file.content, file.mime)}
                >
                  Скачать
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              for (const file of files) downloadFile(file.name, file.content, file.mime)
            }}
          >
            Скачать все файлы ({files.length})
          </button>

          <p className="panel__note">
            Воспроизводимость: <code>decision.json</code> хранит{' '}
            <code>dataset_hash</code>, <code>engine_version</code> и{' '}
            <code>input_hash</code>. При тех же трёх значениях повторный расчёт обязан
            дать те же числа.
            {comparison
              ? ' Сопоставление вариантов включено в выгрузку как comparison.csv.'
              : ' Сравнение вариантов ещё не посчитано, поэтому comparison.csv не выгружается.'}
          </p>
        </>
      )}
    </section>
  )
}
