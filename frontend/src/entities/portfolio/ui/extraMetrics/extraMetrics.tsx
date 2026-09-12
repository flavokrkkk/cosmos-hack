import type { PortfolioMetrics } from '@shared/api/contracts'
import { Collapsible, Tag } from '@shared/ui'

import { EXTRA_METRIC_TILES, type MetricTileDefinition } from '../../lib/format'
import { MetricTiles } from '../metricTiles'

type Props = {
  metrics: PortfolioMetrics
  /** Плитки основного блока, которые здесь повторять не нужно. */
  shown?: readonly MetricTileDefinition[]
  /** Основные плитки, не попавшие в компактный блок (например, CASH и t_rep в ручном режиме). */
  rest?: readonly MetricTileDefinition[]
}

/**
 * «Подробнее о портфеле» (бриф D1): средние индексы готовности, устойчивости и
 * тиражируемости, счётчики разнообразия и набор групп возможностей. Всё это
 * приходит в `metrics` — считать в браузере нечего.
 */
export function ExtraMetrics({ metrics, shown = [], rest = [] }: Props) {
  const shownKeys = new Set(shown.map((tile) => tile.key))
  const tiles = [...rest, ...EXTRA_METRIC_TILES].filter((tile) => !shownKeys.has(tile.key))

  return (
    <Collapsible title={<span className="text-[15px] font-semibold">Подробнее о портфеле</span>}>
      <MetricTiles metrics={metrics} tiles={tiles} columns={3} className="lg:grid-cols-6" />
      <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
        Группы возможностей:
        {metrics.capability_set.map((group) => (
          <Tag key={group} tone="muted">{group}</Tag>
        ))}
      </p>
    </Collapsible>
  )
}
