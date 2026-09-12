"""Собрать PDF материалов защиты из markdown: headless Chrome, A4, без сторонних движков вёрстки.

Из корня: python scripts/render_pdf.py          — записка, приложения и резюме стресса в docs/
          python scripts/render_pdf.py --check  — только напечатать число страниц

Требования кейса: записка 8–12 страниц, резюме стресс-сценария — одна. Трекер на консультации
12.09 подтвердила: «двенадцать максимум». Поэтому разделы 1–11 записки собираются в
management-note.pdf, а приложения А–Г — в отдельный management-note-appendices.pdf; markdown
при этом остаётся одним документом. Скрипт печатает фактическое число страниц и сверяет его
с объявленным на первой странице — соответствие проверяется, а не заявляется.
"""
import argparse
import os
import re
import signal
import subprocess
import sys
import time
from tempfile import NamedTemporaryFile, TemporaryDirectory
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHROME = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
APPENDIX_MARKER = "## Приложение А"
APPENDICES_TITLE = ("# Приложения к управленческой записке\n\n**Команда «ТЧК MISIS»** · Кейс 02 «Космос как "
                    "инфраструктура» · портфель `FIRE:A, AGRI:C, TRANS:C, ENV:A` · основной документ — "
                    "`management-note.pdf`, разделы 1–11\n\n")

# Chrome штампует в PDF момент рендера, из-за чего файл меняется при каждом запуске даже без
# правок текста: в git шумят бинарники, а проверка актуальности комплекта падает на пустом месте.
# Подменяем штамп фиксированным той же длины — смещения xref при этом не сдвигаются.
STAMP = rb"(D:19700101000000+00'00')"

# Записка плотная, резюме обязано уложиться в страницу — отсюда разные кегли.
JOBS = [
    dict(source="docs/23-management-note.md", target="docs/management-note.pdf", size="10.3pt",
         allowed=range(8, 13), part="body", declares=True),
    dict(source="docs/23-management-note.md", target="docs/management-note-appendices.pdf", size="10.3pt",
         allowed=range(1, 7), part="appendices", declares=False),
    dict(source="docs/24-stress-summary.md", target="docs/stress-summary.pdf", size="10.5pt",
         allowed=range(1, 2), part=None, declares=False),
]

CSS = """
@page { size: A4; margin: 14mm 15mm; }
html { -webkit-print-color-adjust: exact; }
body { font: {size}/1.33 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #111; margin: 0; }
h1 { font-size: 1.45em; margin: 0 0 .25em; }
h2 { font-size: 1.12em; margin: 1em 0 .35em; border-bottom: 1px solid #ccc; padding-bottom: .1em; }
h3 { font-size: 1em; margin: .8em 0 .3em; }
h1, h2, h3 { break-after: avoid-page; }
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
    for key in (b"/CreationDate", b"/ModDate"):
        raw = re.sub(key + rb"\s*\(D:[^)]*\)", key + b" " + STAMP, raw)
    pdf.write_bytes(raw)


def page_count(pdf: Path) -> int:
    raw = pdf.read_bytes()
    counts = [int(value) for value in re.findall(rb"/Count\s+(\d+)", raw)]
    return max(counts) if counts else len(re.findall(rb"/Type\s*/Page[^s]", raw))


def job_text(job: dict) -> str:
    """Текст, который уходит в рендер: вся записка, только её тело или только приложения."""
    text = (ROOT / job["source"]).read_text(encoding="utf-8")
    if job["part"] == "body":
        return text[: text.index(APPENDIX_MARKER)]
    if job["part"] == "appendices":
        return APPENDICES_TITLE + text[text.index(APPENDIX_MARKER):]
    return text


def render(text: str, target: Path, size: str) -> int:
    import markdown

    html = markdown.markdown(text, extensions=["tables", "fenced_code", "sane_lists"])
    # Ссылку на файл репозитория Chrome превращает в file:///Users/... — абсолютный путь с машины
    # автора, мёртвый у любого читателя. Оставляем подпись, ссылку снимаем; внешние URL сохраняем.
    html = re.sub(r'<a href="(?!https?:|mailto:)[^"]*">(.*?)</a>', r"\1", html, flags=re.S)
    with TemporaryDirectory(prefix="cosmos-pdf-chrome-") as scratch:
        directory = Path(scratch)
        staging = directory / "document.html"
        rendered = directory / "document.pdf"
        log = directory / "chrome.log"
        staging.write_text(f'<!doctype html><meta charset="utf-8">'
                           f"<style>{CSS.replace('{size}', size)}</style>{html}", encoding="utf-8")
        command = [str(CHROME), "--headless", "--disable-gpu", "--no-pdf-header-footer",
                   "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
                   "--password-store=basic", "--use-mock-keychain", "--disable-search-engine-choice-screen",
                   "--disable-extensions", "--disable-component-update", "--disable-sync", "--disable-breakpad",
                   f"--user-data-dir={directory / 'profile'}",
                   f"--print-to-pdf={rendered}", staging.resolve().as_uri()]
        with log.open("wb") as diagnostics:
            process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=diagnostics,
                                       start_new_session=True)
            try:
                deadline = time.monotonic() + 45
                while not completed_pdf(rendered, log):
                    status = process.poll()
                    if status is not None:
                        if completed_pdf(rendered, log):
                            break
                        raise RuntimeError(f"Chrome завершился ({status}) без готового PDF: "
                                           f"{log.read_text(errors='replace')[-2000:]}")
                    if time.monotonic() >= deadline:
                        raise TimeoutError(f"Chrome не подготовил PDF за 45 секунд: "
                                           f"{log.read_text(errors='replace')[-2000:]}")
                    time.sleep(0.05)
            finally:
                stop_chrome(process)
        # В новых версиях Chrome служебные процессы могут оставаться живыми после
        # успешной печати. Готовность подтверждена самим Chrome, структурой и длиной
        # уникального временного файла; прежний target не считается результатом.
        normalise(rendered)
        pages = page_count(rendered)
        if pages < 1:
            raise RuntimeError("Chrome создал PDF без страниц")
        with NamedTemporaryFile(prefix=".cosmos-pdf-", suffix=".pdf", dir=target.parent, delete=False) as output:
            prepared = Path(output.name)
            try:
                output.write(rendered.read_bytes())
                output.flush()
                os.replace(prepared, target)
            finally:
                prepared.unlink(missing_ok=True)
        return pages


def completed_pdf(pdf: Path, log: Path) -> bool:
    """Не принять частичный PDF или файл без подтверждения завершённой печати."""
    if not pdf.is_file() or not log.is_file():
        return False
    data = pdf.read_bytes()
    if not data.startswith(b"%PDF-") or not data.rstrip().endswith(b"%%EOF"):
        return False
    confirmation = re.search(r"(\d+) bytes written to file " + re.escape(str(pdf)) + r"(?=\r?\n|$)",
                             log.read_text(errors="replace"))
    return confirmation is not None and int(confirmation[1]) == len(data)


def stop_chrome(process: subprocess.Popen) -> None:
    """Завершить только нашу отдельную process group вместе с дочерними процессами."""
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        process.wait(timeout=2)
    except subprocess.TimeoutExpired:
        pass
    finally:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait(timeout=2)


def render_job(job: dict, target: Path) -> int:
    return render(job_text(job), target, job["size"])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="не оставлять PDF, только измерить объём")
    args = parser.parse_args()
    if not CHROME.exists():
        print(f"Не найден Chrome: {CHROME}. Рендер PDF доступен только на машине с Chrome.", file=sys.stderr)
        return 2

    failures = []
    # --check никогда не пишет поверх готовой сдачи, в том числе при ошибке рендера.
    with TemporaryDirectory(prefix="cosmos-pdf-check-") as scratch:
        for job in JOBS:
            path = Path(scratch) / Path(job["target"]).name if args.check else ROOT / job["target"]
            pages = render_job(job, path)
            allowed = job["allowed"]
            verdict = "ок" if pages in allowed else f"ВНЕ ТРЕБОВАНИЯ {allowed.start}–{allowed.stop - 1}"
            print(f"{job['target']}: {pages} стр. ({job['size']}) — {verdict}")
            if pages not in allowed:
                failures.append(job["target"])
            # Первая страница записки называет свой объём — сверяем с измеренным.
            if job["declares"] and f"**{pages} страниц**" not in (ROOT / job["source"]).read_text(encoding="utf-8"):
                print(f"  ОБЪЯВЛЕННЫЙ ОБЪЁМ НЕ СОВПАДАЕТ: в тексте должно быть «**{pages} страниц**»")
                failures.append(job["target"])
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
