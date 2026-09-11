/**
 * Сохранение текстового файла из уже полученных данных.
 *
 * Никакой доменной логики: сюда приходит готовое содержимое, здесь только
 * Blob и клик по временной ссылке. BOM не добавляем — контрольные файлы в
 * `results/` записаны как UTF-8 без BOM, и расходиться с ними нельзя.
 */
export function downloadFile(name: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  // Освобождаем URL после того, как браузер забрал файл.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
