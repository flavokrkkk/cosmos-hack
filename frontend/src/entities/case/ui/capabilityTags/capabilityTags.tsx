import { Tag, Tooltip } from '@shared/ui'

import { capabilityTitle } from '../../lib'

type Props = {
  groups: string[]
  className?: string
}

/** Метки групп возможностей лота с расшифровкой по наведению и фокусу. */
export function CapabilityTags({ groups, className }: Props) {
  return (
    <span className={className}>
      {groups.map((group) => (
        <Tooltip key={group} content={capabilityTitle(group)}>
          <Tag tabIndex={0} className="cursor-default">
            {group}
          </Tag>
        </Tooltip>
      ))}
    </span>
  )
}
