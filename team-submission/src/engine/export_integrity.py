"""Происхождение четырёх контрольных файлов; сверка хешей не запускает расчёт."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from .canonical import dataset_hash
from .decision import DEFAULT_CONFIG_PATH

CONFIG_NAME = "team_decision_config.json"
EXPORT_FILES = ("portfolio_detail.csv", "portfolio_metrics.json", CONFIG_NAME, "hybrid_analysis.json")
LEGACY_FILES = ("README.md", "portfolio_space.csv", "constraints_BASE.csv", "constraints_STRESS.csv",
                "sensitivity_BASE.csv", "sensitivity_STRESS.csv", "document_facts.json", "export_manifest.json")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_hashes(config_path: Path | None = None) -> dict:
    return {
        "case_sha256": dataset_hash(),
        "decision_sha256": sha256(config_path or DEFAULT_CONFIG_PATH),
        "implementation": {path.name: sha256(path)
                           for path in sorted(Path(__file__).parent.glob("*.py"))},
    }


def result_hashes(directory: Path) -> dict:
    hashes = {name: sha256(directory / name) for name in EXPORT_FILES if name != CONFIG_NAME}
    payload = json.loads((directory / CONFIG_NAME).read_text(encoding="utf-8"))
    payload.pop("export_provenance", None)
    # Исключаем только саму подпись: настройки, победитель и слепок документов защищены.
    hashes[CONFIG_NAME] = hashlib.sha256(
        json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    return hashes


def write_export_provenance(directory: Path, config_path: Path | None = None) -> None:
    path = directory / CONFIG_NAME
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["export_provenance"] = {
        "format_version": 2, "sources": source_hashes(config_path), "files": result_hashes(directory),
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def verify_export(directory: Path, config_path: Path | None = None) -> None:
    """Отказать при иных входах, исходниках или результатах вместо повторного поиска."""
    try:
        payload = json.loads((directory / CONFIG_NAME).read_text(encoding="utf-8"))
        provenance = payload["export_provenance"]
        if provenance.get("format_version") != 2:
            raise ValueError("неизвестный формат происхождения экспорта")
        if provenance.get("sources") != source_hashes(config_path):
            raise ValueError("изменились входы кейса, конфигурация или реализация движка")
        if provenance.get("files") != result_hashes(directory):
            raise ValueError("изменились контрольные результаты")
    except (OSError, KeyError, ValueError, TypeError, AttributeError) as error:
        raise ValueError(
            f"Контрольный экспорт отсутствует или устарел: {error}. "
            "Выполните команду export действующего CLI перед сверкой и сборкой."
        ) from error
