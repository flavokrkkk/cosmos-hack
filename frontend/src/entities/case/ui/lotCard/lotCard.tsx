import type { AccessMode, Lot } from '@shared/api/contracts'

type Props = {
  lot: Lot
  /** Назначенный режим, если лот входит в текущий портфель. */
  mode?: AccessMode
  selected: boolean
  disabled: boolean
  onToggle: (lotId: string) => void
  onModeChange: (lotId: string, modeId: string) => void
  modes: AccessMode[]
}

/**
 * Карточка лота показывает ИСХОДНЫЕ значения из каталога.
 * Пересчитанные с коэффициентами режима числа живут в таблице портфеля —
 * смешивать их на одном экране нельзя, эксперт перестанет понимать источник числа.
 */
export function LotCard({
  lot, mode, selected, disabled, onToggle, onModeChange, modes,
}: Props) {
  const anchorShare = lot.anchor_cash_mrub_per_year + lot.commercial_cash_mrub_per_year
  const share = anchorShare > 0
    ? Math.round((lot.anchor_cash_mrub_per_year / anchorShare) * 100)
    : 0

  return (
    <article className={`lot-card ${selected ? 'is-selected' : ''}`}>
      <header className="lot-card__head">
        <div>
          <h3 className="lot-card__id">{lot.lot_id}</h3>
          <p className="lot-card__title">{lot.title}</p>
        </div>
        <button
          type="button"
          className={selected ? 'btn btn--ghost' : 'btn btn--primary'}
          onClick={() => onToggle(lot.lot_id)}
          disabled={disabled && !selected}
        >
          {selected ? 'Убрать' : 'Выбрать'}
        </button>
      </header>

      <p className="lot-card__meta">
        {lot.territory_title}
        {lot.federal ? ' · федеральный' : ''} · {lot.capability_groups.join(', ')}
      </p>

      <dl className="lot-card__facts">
        <div><dt>Старт</dt><dd>{lot.c0_mrub} млн ₽</dd></div>
        <div><dt>Год</dt><dd>{lot.opex_mrub_per_year} млн ₽</dd></div>
        <div><dt>Общ. ценность</dt><dd>{lot.vpub_mrub_per_year} млн ₽/год</dd></div>
        <div>
          <dt>Доля якоря</dt>
          <dd title="Якорные поступления ÷ все поступления. Показывает, кто формирует спрос">
            {share}%
          </dd>
        </div>
      </dl>

      {selected ? (
        <label className="lot-card__mode">
          <span>Режим доступа</span>
          <select
            value={mode?.mode_id ?? ''}
            onChange={(event) => onModeChange(lot.lot_id, event.target.value)}
          >
            {modes.map((item) => (
              <option key={item.mode_id} value={item.mode_id}>
                {item.mode_id}
                {item.public_core ? ' — общественное ядро' : ''}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </article>
  )
}
