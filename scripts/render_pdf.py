"""Собрать PDF материалов защиты из markdown: headless Chrome, A4, без сторонних движков вёрстки.

Из корня: python scripts/render_pdf.py          — записка и резюме стресса в docs/
          python scripts/render_pdf.py --check  — только напечатать число страниц

Требования кейса: записка 8–12 страниц, резюме стресс-сценария — одна. Скрипт печатает
фактическое число страниц, поэтому соответствие проверяется, а не заявляется.
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path

# Chrome штампует в PDF момент рендера, из-за чего файл меняется при каждом запуске даже без
# правок текста: в git шумят бинарники, а проверка актуальности комплекта падает на пустом месте.
# Подменяем штамп фиксированным той же длины — смещения xref при этом не сдвигаются.
STAMP = rb"(D:19700101000000+00'00')"

ROOT = Path(__file__).resolve().parents[1]
CHROME = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")

# Записка плотная, резюме обязано уложиться в страницу — отсюда разные кегли.
# Требование «8–12 страниц» относится к самой записке, поэтому у записки проверяется объём
# разделов 1–11, а приложения А–Г считаются отдельно: это проверяемый материал к ней, и состав
# документа объявлен на первой странице. Подмена проверки на общий объём скрыла бы разницу.
JOBS = [
    ("docs/23-management-note.md", "docs/management-note.pdf", "10.3pt", range(8, 13), "## Приложение А"),
    ("docs/24-stress-summary.md", "docs/stress-summary.pdf", "10.5pt", range(1, 2), None),
]

CSS = """
@page { size: A4; margin: 14mm 15mm; }
html { -webkit-print-color-adjust: exact; }
body { font: {size}/1.33 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #111; margin: 0; }
h1 { font-size: 1.45em; margin: 0 0 .25em; }
h2 { font-size: 1.12em; margin: 1em 0 .35em; border-bottom: 1px solid #ccc; padding-bottom: .1em; }
h3 { font-size: 1em; margin: .8em 0 .3em; }
p, ul, ol { margin: .42em 0; }
li { margin: .12em 0; }
table { border-collapse: collapse; width: 100%; margin: .5em 0; font-size: .9em; }
th, td { border: 1px solid #bbb; padding: 2px 5px; text-align: left; vertical-align: top; }
th { background: #f0f0f0; }
code { font-family: "SF Mono", Menlo, monospace; font-size: .92em; background: #f4f4f4; padding: 0 2px; }
pre { background: #f6f6f6; padding: 5px 7px; font-size: .82em; white-space: pre-wrap; margin: .45em 0; }
pre code { background: none; }
blockquote { margin: .5em 0; padding: .2em .7em; border-left: 3px solid #bbb; color: #333; }
"""


def normalise(pdf: Path) -> None:
    """Сделать файл побайтово воспроизводимым: выкинуть дату рендера."""
    raw = pdf.read_bytes()
    for key in (b'/CreationDate', b'/ModDate'):
        raw = re.sub(key + rb"\s*\(D:[^)]*\)", key + b' ' + STAMP, raw)
    pdf.write_bytes(raw)


def page_count(pdf: Path) -> int:
    raw = pdf.read_bytes()
    counts = [int(value) for value in re.findall(rb"/Count\s+(\d+)", raw)]
    return max(counts) if counts else len(re.findall(rb"/Type\s*/Page[^s]", raw))


def render(source: Path, target: Path, size: str, *, text: str | None = None) -> int:
    import markdown

    html = markdown.markdown(text if text is not None else source.read_text(encoding="utf-8"),
                             extensions=["tables", "fenced_code", "sane_lists"])
    # Ссылку на файл репозитория Chrome превращает в file:///Users/... — абсолютный путь с машины
    # автора, мёртвый у любого читателя. Оставляем подпись, ссылку снимаем; внешние URL сохраняем.
    html = re.sub(r'<a href="(?!https?:|mailto:)[^"]*">(.*?)</a>', r"\1", html, flags=re.S)
    staging = target.with_suffix(".render.html")
    staging.write_text(f'<!doctype html><meta charset="utf-8">'
                       f"<style>{CSS.replace('{size}', size)}</style>{html}", encoding="utf-8")
    try:
        subprocess.run([str(CHROME), "--headless", "--disable-gpu", "--no-pdf-header-footer",
                        f"--print-to-pdf={target}", staging.resolve().as_uri()],
                       check=True, capture_output=True)
    finally:
        staging.unlink(missing_ok=True)
    normalise(target)
    return page_count(target)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="не оставлять PDF, только измерить объём")
    args = parser.parse_args()
    if not CHROME.exists():
        print(f"Не найден Chrome: {CHROME}. Рендер PDF доступен только на машине с Chrome.", file=sys.stderr)
        return 2

    failures = []
    for source, target, size, allowed, appendix_marker in JOBS:
        path, markdown_text = ROOT / target, (ROOT / source).read_text(encoding="utf-8")
        total = render(ROOT / source, path, size)
        counted, tail = total, ""
        if appendix_marker and appendix_marker in markdown_text:
            body = markdown_text[: markdown_text.index(appendix_marker)]
            scratch = path.with_suffix(".body.pdf")
            counted = render(ROOT / source, scratch, size, text=body)
            scratch.unlink(missing_ok=True)
            tail = f", приложения +{total - counted}"
        verdict = "ок" if counted in allowed else f"ВНЕ ТРЕБОВАНИЯ {allowed.start}–{allowed.stop - 1}"
        print(f"{target}: {counted} стр.{tail} ({size}) — {verdict}")
        if counted not in allowed:
            failures.append(target)
        if args.check:
            path.unlink(missing_ok=True)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
