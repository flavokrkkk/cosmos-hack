"""Подготовить отдельную копию приложения для ручной публикации в GitVerse.

Берёт текущие отслеживаемые и неигнорируемые новые файлы, без корневой docs,
секретов и локальных данных. Не создаёт коммитов и не обращается к сети.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shlex
import shutil
import stat
import subprocess


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "gitverse-submission"
REMOTE = "https://gitverse.ru/hackrus.experts/kosmo-nizni_tchk_misis_31.git"
ENGINE = "backend/app/core/services/portfolio_engine"
EXPORT_FILES = (
    "portfolio_detail.csv", "portfolio_metrics.json", "team_decision_config.json",
    "hybrid_analysis.json",
)
CASE_FILES = (
    "case_core.py", "data/lots.csv", "data/access_modes.csv", "config/case_config.json",
)
PDF_FILES = (
    "docs/management-note.pdf", "docs/management-note-appendices.pdf", "docs/stress-summary.pdf",
)
EXCLUDED_PARTS = {
    ".git", ".agents", ".agent", ".codex", ".cursor", ".claude", ".vscode", ".idea",
    "runtime", "storage", "flowers_store", "node_modules", ".venv", "venv", "env", "virtualenv",
    "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".ipynb_checkpoints",
    ".ollama", "ollama_data", "model_weights", "weights", "dist", "coverage",
}
EXCLUDED_NAMES = {
    "AGENTS.md", "CLAUDE.md", "GEMINI.md", ".cursorrules", ".cursorignore",
    "copilot-instructions.md", ".DS_Store", ".envrc",
}
WEIGHT_SUFFIXES = {
    ".gguf", ".safetensors", ".pt", ".pth", ".ckpt", ".onnx", ".h5", ".hdf5",
    ".bin", ".pkl", ".pickle", ".joblib", ".tflite",
}


def relative_path(value: str) -> Path:
    """Манифест и Git могут называть только файлы внутри своего корня."""
    path = PurePosixPath(value)
    if not value or path.is_absolute() or ".." in path.parts or "\\" in value:
        raise ValueError(f"Недопустимый относительный путь: {value!r}")
    return Path(*path.parts)


def check_symlinks(path: Path, boundary: Path) -> None:
    for candidate in (path, *path.parents):
        if candidate.is_symlink():
            raise ValueError(f"Символические ссылки не включаются в копию: {candidate}")
        if candidate == boundary:
            return
    raise ValueError(f"Путь выходит за пределы {boundary}: {path}")


def regular_file(path: Path, boundary: Path) -> None:
    check_symlinks(path, boundary)
    if not stat.S_ISREG(path.stat().st_mode):
        raise ValueError(f"Ожидался обычный файл: {path}")


def digest(path: Path) -> str:
    regular_file(path, ROOT)
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_object(path: Path) -> dict:
    regular_file(path, ROOT)
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Ожидался JSON-объект: {path}")
    return value


def verify_export() -> None:
    """То же правило export_provenance v2, что у движка, без импорта pandas и расчётов."""
    directory = ROOT / "results"
    if {path.name for path in directory.iterdir() if path.is_file()} != set(EXPORT_FILES):
        raise ValueError("В results должны быть ровно четыре контрольных файла.")
    payload = read_object(directory / "team_decision_config.json")
    provenance = payload.pop("export_provenance", None)
    if not isinstance(provenance, dict) or provenance.get("format_version") != 2:
        raise ValueError("Отсутствует export_provenance версии 2; сначала подготовьте export.")
    case_digest = hashlib.sha256()
    for name in CASE_FILES:
        source = ROOT / "case/source" / name
        regular_file(source, ROOT)
        case_digest.update(name.encode())
        case_digest.update(source.read_bytes())
    sources = {
        "case_sha256": case_digest.hexdigest(),
        "decision_sha256": digest(ROOT / "config/decision.json"),
        "implementation": {path.name: digest(path) for path in sorted((ROOT / ENGINE).glob("*.py"))},
    }
    files = {name: digest(directory / name) for name in EXPORT_FILES if name != "team_decision_config.json"}
    files["team_decision_config.json"] = hashlib.sha256(
        json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    if provenance.get("sources") != sources or provenance.get("files") != files:
        raise ValueError("Контрольный export устарел: изменились входы, движок или результаты.")


def verify_bundle() -> dict:
    bundle = ROOT / "team-submission"
    manifest = read_object(bundle / "manifest.json")
    files, sources = manifest.get("files"), manifest.get("source_copies")
    if not isinstance(files, dict) or not isinstance(sources, dict):
        raise ValueError("В manifest.json отсутствуют files или source_copies.")
    for name, expected in files.items():
        if digest(bundle / relative_path(name)) != expected:
            raise ValueError(f"Файл комплекта изменился после сборки: {name}")
    for name, source in sources.items():
        if name not in files or not isinstance(source, dict):
            raise ValueError(f"Некорректная запись source_copies: {name}")
        path = ROOT / relative_path(source["source"])
        if digest(path) != source.get("source_sha256"):
            raise ValueError(f"Источник комплекта изменился: {source['source']}; пересоберите комплект.")
    for name in PDF_FILES:
        if name not in files:
            raise ValueError(f"В комплекте отсутствует обязательный PDF: {name}")
    if {path.name for path in (bundle / "results").iterdir() if path.is_file()} != set(EXPORT_FILES):
        raise ValueError("В team-submission/results должны быть ровно четыре файла.")
    for name in EXPORT_FILES:
        if digest(bundle / "results" / name) != digest(ROOT / "results" / name):
            raise ValueError(f"Результаты основного проекта и комплекта различаются: {name}")
    return manifest


def excluded(path: Path, output: Path) -> bool:
    source = ROOT / path
    if source.is_relative_to(output) or source.is_relative_to(DEFAULT_OUTPUT):
        return True
    if path.parts[0] == "docs" or path == Path("scripts/prepare_gitverse.py"):
        return True
    if any(part in EXCLUDED_PARTS for part in path.parts) or path.name in EXCLUDED_NAMES:
        return True
    name = path.name.lower()
    if ".env" in name:
        example = name == ".env.example" or (name.startswith(".env.") and name.endswith(".example"))
        if not example:
            return True
    return path.suffix.lower() in WEIGHT_SUFFIXES | {".pyc", ".pyo"}


def current_files(output: Path) -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=ROOT, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    paths = []
    for value in sorted(set(result.stdout.split(b"\0")) - {b""}):
        path = relative_path(os.fsdecode(value))
        if excluded(path, output):
            continue
        source = ROOT / path
        check_symlinks(source, ROOT)
        if not source.exists():
            continue  # Удаление в рабочей копии учитывается без коммита.
        regular_file(source, ROOT)
        paths.append(path)
    return paths


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    output = Path(os.path.abspath(args.output.expanduser()))
    try:
        check_symlinks(output, Path(output.anchor))
        if ROOT.is_relative_to(output):
            raise ValueError("Каталог назначения не может совпадать с проектом или содержать его.")
        if output.exists() and (not output.is_dir() or any(output.iterdir())):
            raise ValueError(f"Каталог назначения непустой или не является каталогом: {output}. Ничего не удалено.")
        verify_export()
        manifest = verify_bundle()
        paths = current_files(output)
        selected = {path.as_posix() for path in paths}
        required = {
            "README.md", "docker-compose.yml", "backend/Dockerfile", "frontend/Dockerfile",
            "notebooks/portfolio_review.ipynb", "notebooks/requirements.txt",
            "team-submission/manifest.json", "config/decision.json",
            *[f"results/{name}" for name in EXPORT_FILES],
            *[f"team-submission/{name}" for name in manifest["files"]],
        }
        missing = required - selected
        if missing:
            raise ValueError("Нужные файлы не попали в список Git или исключены: " + ", ".join(sorted(missing)))
        check_symlinks(output, Path(output.anchor))
        if output.exists():
            if not output.is_dir() or any(output.iterdir()):
                raise ValueError(f"Каталог назначения стал непустым: {output}. Ничего не перезаписано.")
        else:
            output.mkdir(parents=True)
        for path in paths:
            source, target = ROOT / path, output / path
            regular_file(source, ROOT)
            target.parent.mkdir(parents=True, exist_ok=True)
            check_symlinks(target, output)
            with source.open("rb") as incoming, target.open("xb") as outgoing:
                shutil.copyfileobj(incoming, outgoing)
            shutil.copystat(source, target, follow_symlinks=False)

        ignore = output / ".gitignore"
        text = ignore.read_text(encoding="utf-8") if ignore.exists() else ""
        if "/docs/" not in text.splitlines():
            ignore.write_text(text + ("\n" if text and not text.endswith("\n") else "") + "/docs/\n", encoding="utf-8")
        for name in PDF_FILES:
            manifest["source_copies"][name] = {
                "source": f"team-submission/{name}",
                "source_sha256": manifest["files"][name],
            }
        (output / "team-submission/manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8",
        )
    except (OSError, ValueError, KeyError, TypeError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Копия не подготовлена: {error}\nСкрипт не удаляет существующие файлы; при ошибке копирования частичный каталог остаётся для проверки.\n")

    print(f"Подготовлена копия: {output}\nФайлов скопировано: {len(paths)}. Корневая docs исключена, PDF сохранены.")
    print("\nДля ручной публикации выполните:")
    print(f"cd {shlex.quote(str(output))}")
    print("git init -b master")
    print(f"git remote add origin {shlex.quote(REMOTE)}")
    print("git add .")
    print('git commit -m "Финальное решение кейса 02"')
    print("git push -u origin master")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
