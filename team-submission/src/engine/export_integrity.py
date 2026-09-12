"""Происхождение контрольного экспорта; сверка хешей не запускает расчёт."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from .canonical import dataset_hash
from .decision import DEFAULT_CONFIG_PATH

MANIFEST_NAME = "export_manifest.json"
EXPORT_FILES = (
    "hybrid_analysis.json", "portfolio_detail.csv", "portfolio_metrics.json",
    "team_decision_config.json", "portfolio_space.csv", "constraints_BASE.csv",
    "constraints_STRESS.csv", "sensitivity_BASE.csv", "sensitivity_STRESS.csv",
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_hashes(config_path: Path | None = None) -> dict:
    return {
        "case_sha256": dataset_hash(),
        "decision_sha256": sha256(config_path or DEFAULT_CONFIG_PATH),
        "implementation": {path.name: sha256(path)
                           for path in sorted(Path(__file__).parent.glob("*.py"))},
    }


def write_export_manifest(directory: Path, config_path: Path | None = None) -> None:
    manifest = {
        "format_version": 1,
        "sources": source_hashes(config_path),
        "files": {name: sha256(directory / name) for name in EXPORT_FILES},
    }
    (directory / MANIFEST_NAME).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8",
    )


def verify_export(directory: Path, config_path: Path | None = None) -> None:
    """Отказать при иных входах, исходниках или результатах вместо повторного поиска."""
    try:
        manifest = json.loads((directory / MANIFEST_NAME).read_text(encoding="utf-8"))
        if manifest.get("format_version") != 1:
            raise ValueError("неизвестный формат манифеста экспорта")
        if manifest.get("sources") != source_hashes(config_path):
            raise ValueError("изменились входы кейса, конфигурация или реализация движка")
        if manifest.get("files") != {name: sha256(directory / name) for name in EXPORT_FILES}:
            raise ValueError("изменились контрольные результаты")
    except (OSError, ValueError, TypeError, AttributeError) as error:
        raise ValueError(
            f"Контрольный экспорт отсутствует или устарел: {error}. "
            "Выполните команду export действующего CLI перед сверкой и сборкой."
        ) from error
