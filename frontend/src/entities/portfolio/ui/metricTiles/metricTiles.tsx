import type { PortfolioMetrics } from '@shared/api/contracts'
import { cn } from '@shared/lib/cn'
import { StatTile, Tooltip } from '@shared/ui'

import { METRIC_TILES, type MetricTileDefinition } from '../../lib/format'

type Props = {
  metrics: PortfolioMetrics
  tiles?: readonly MetricTileDefinition[]
  columns?: 2 | 3
  className?: string
}

/**
 * Плитки показателей портфеля. Подпись короткая, как на макете; полное
 * название и предостережение («не прибыль», «не складывается») — в подсказке.
 */
export function MetricTiles({ metrics, tiles = METRIC_TILES, columns = 3, className }: Props) {
  return (
    <div className={cn('grid gap-3', columns === 3 ? 'sm:grid-cols-3' : 'grid-cols-2', className)}>
      {tiles.map((tile) => {
        const value = Number(metrics[tile.key])
        return (
          <Tooltip
            key={tile.key}
            content={
              <span>
                <span className="font-semibold">{tile.title}</span>
                {tile.caveat ? <span className="block text-white/75">{tile.caveat}</span> : null}
              </span>
            }
          >
            <div tabIndex={0} className="rounded-tile">
              <StatTile label={tile.label} value={tile.format(value)} />
            </div>
          </Tooltip>
        )
      })}
    </div>
  )
}
