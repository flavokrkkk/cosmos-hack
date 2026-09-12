import { yupResolver } from '@hookform/resolvers/yup'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import * as yup from 'yup'

import { useSavedVariants, type SavedSource } from '@entities/portfolio'
import type { Calculation } from '@shared/api/contracts'
import { notifySuccess } from '@shared/lib/notify'
import { Button, Dialog, DialogClose, DialogContent, TextField } from '@shared/ui'

const schema = yup.object({
  name: yup.string().trim().required('Дайте варианту имя').max(60, 'Не длиннее 60 символов'),
  comment: yup.string().trim().max(300, 'Не длиннее 300 символов').default(''),
})

type Values = yup.InferType<typeof schema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  calculation: Calculation
  source: SavedSource
  defaultName: string
  engineVersion: string
}

/**
 * «Сохранить вариант» — компактный диалог имени и комментария (бриф S1).
 * Сохраняются только входы: состав, режимы и версии данных/движка. Числа при
 * открытии пересчитает бэкенд, поэтому сохранённое нельзя «подправить руками».
 */
export function SaveVariantDialog({
  open, onOpenChange, calculation, source, defaultName, engineVersion,
}: Props) {
  const save = useSavedVariants((state) => state.save)
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<Values>({
    resolver: yupResolver(schema),
    defaultValues: { name: defaultName, comment: '' },
    mode: 'onTouched',
  })

  useEffect(() => {
    if (open) reset({ name: defaultName, comment: '' })
  }, [open, defaultName, reset])

  const submit = handleSubmit((values) => {
    save({
      name: values.name,
      comment: values.comment ?? '',
      datasetHash: calculation.dataset_hash,
      engineVersion,
      inputHash: calculation.input_hash,
      selection: calculation.selection.map((item) => ({ ...item })),
      source,
      feasible: { ...calculation.feasible_by_scenario },
    })
    notifySuccess('Вариант сохранён', 'Список — в «Сохранённые варианты» наверху страницы')
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        title="Сохранить вариант"
        description="Состав, режимы и версия данных; показатели при открытии считаются заново."
      >
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <TextField
            label="Название"
            autoFocus
            error={errors.name?.message}
            {...register('name')}
          />
          <TextField
            label="Комментарий"
            hint="Необязательно: зачем этот вариант и чем отличается"
            error={errors.comment?.message}
            {...register('comment')}
          />
          <div className="mt-2 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost" size="md">Отмена</Button>
            </DialogClose>
            <Button type="submit" size="md" loading={isSubmitting}>
              Сохранить
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
