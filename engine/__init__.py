"""Расчётный слой команды поверх канонического кода кейса.

Канонические формулы берутся из `case/source/case_core.py` организаторов без изменений
(`engine.canonical`). Наш вклад — диагностика ограничений, перебор пространства решений,
Парето-сравнение и воспроизводимый экспорт результатов.
"""

from .canonical import evaluate, load_case, lot_ids, mode_ids, scenarios
from .constraints import ConstraintRow, all_passed, diagnose, failed
from .decision import Decision, Variant, load_decision
from .space import binding_analysis, enumerate_space, feasible, pareto_front

__all__ = [
    "evaluate", "load_case", "lot_ids", "mode_ids", "scenarios",
    "ConstraintRow", "diagnose", "all_passed", "failed",
    "Decision", "Variant", "load_decision",
    "enumerate_space", "feasible", "pareto_front", "binding_analysis",
]
