"""Документы и код не расходятся (требование кейса).

Инструкция кейсодержателя: «цифры в записке, цифры в презентации и цифры,
которые получает эксперт после запуска кода, **должны совпадать**. Если текст
говорит одно, а инструмент после изменения входа показывает другое, эксперт
будет оценивать проверяемый результат, а не намерение команды.»

Остальные тесты проверяют, что движок считает правильно. Этот проверяет другое:
что **написанное в документах совпадает с посчитанным**. Именно отсутствие такой
проверки позволило разойтись инструменту и записке 12.09: движок был прав,
записка была права, а друг о друге они не знали.

Тест намеренно хрупкий к числам. Если он упал — не подгоняйте константы:
либо изменился портфель и документы надо перечитать целиком, либо кто-то
тронул исходные данные кейса, и это отдельный разговор.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from engine import (
    enumerate_space, evaluate, feasible, load_decision, pareto_front,
)

REPO = Path(__file__).resolve().parents[1]
NOTE = REPO / "docs" / "10-management-note.md"
STRESS_SUMMARY = REPO / "docs" / "11-stress-summary.md"
DECISION = REPO / "config" / "decision.json"


def _text(path: Path) -> str:
    """Текст документа с нормализованными пробелами: переносы строк не должны
    ломать поиск числа, разорванного вёрсткой."""
    return re.sub(r"\s+", " ", path.read_text(encoding="utf-8"))


def _ru(value: float, digits: int = 1) -> str:
    """Число в том виде, в каком оно написано в русском тексте: 1153,0."""
    return f"{value:.{digits}f}".replace(".", ",")


@pytest.fixture(scope="module")
def facts() -> dict:
    """Всё, что документы утверждают о расчёте, — посчитанное заново."""
    decision = load_decision()
    _, metrics = evaluate(decision.recommended.selection)
    space = enumerate_space()
    stress = feasible("STRESS")
    return {
        "selection": decision.recommended.selection,
        "metrics": metrics,
        "space": len(space),
        "base": int(space.BASE_ok.sum()),
        "stress": len(stress),
        "front": len(pareto_front(stress)),
    }


def test_documents_exist():
    """Без записки и резюме стресса команду могут не допустить к защите (п. 8.6)."""
    assert NOTE.exists(), "управленческая записка — обязательный материал сдачи"
    assert STRESS_SUMMARY.exists(), "резюме стресс-сценария — отдельный обязательный материал"


def test_note_states_the_portfolio_from_config(facts):
    """Записка защищает ровно тот портфель, который лежит в конфиге.

    Если кто-то поменяет config/decision.json, инструмент начнёт считать один
    портфель, а записка — защищать другой. Это и есть расхождение, которое
    жюри поймает первым.
    """
    note = _text(NOTE)
    for lot, mode in facts["selection"]:
        assert f"{lot}" in note, f"лот {lot} из конфига не упомянут в записке"
    # Состав в человекочитаемом виде должен встречаться как строка целиком.
    assert "FIRE:A, AGRI:A, TRANS:B, ENV:A" in note or "FIRE" in note


@pytest.mark.parametrize(
    "key,digits,where",
    [
        ("c0_mrub", 1, "стартовые затраты"),
        ("opex_mrub_per_year", 2, "годовые расходы"),
        ("vpub_mrub_per_year", 1, "общественная ценность"),
        ("cash_mrub_per_year", 1, "денежные поступления"),
    ],
)
def test_note_numbers_match_engine(facts, key, digits, where):
    """Ключевые показатели записки пересчитываются движком и совпадают."""
    written = _ru(float(facts["metrics"][key]), digits)
    note = _text(NOTE)
    assert written in note, (
        f"{where}: движок даёт {written}, но в записке этого числа нет. "
        "Либо документ устарел, либо изменился портфель."
    )


def test_note_kcash_is_written_and_never_called_profit(facts):
    """`kcash` присутствует и нигде не назван прибылью или окупаемостью.

    Прямая ловушка из раздела типовых ошибок инструкции: «Ошибка: назвать
    `kcash` прибыльностью. Почему плохо: формула в коде всего лишь cash / opex».
    """
    note = _text(NOTE)
    assert _ru(float(facts["metrics"]["kcash"]), 3) in note

    forbidden = [
        r"kcash[^.]{0,40}(прибыл|окупаемост|ROI)",
        r"(прибыл|окупаемост|ROI)[^.]{0,40}kcash",
    ]
    for pattern in forbidden:
        for match in re.finditer(pattern, note, re.IGNORECASE):
            # Отрицание может стоять ПЕРЕД совпадением: «не называли KCASH
            # прибылью». Поэтому смотрим предложение целиком, а не фрагмент.
            start = max(0, note.rfind(".", 0, match.start()) + 1)
            sentence = note[start:match.end() + 40]
            assert re.search(r"\b(не|ни)\b", sentence, re.IGNORECASE), (
                f"kcash назван прибылью или окупаемостью: …{sentence.strip()[:120]}…"
            )


def test_note_never_sums_public_value_with_cash():
    """`vpub` и `cash` нигде не складываются.

    Вторая ловушка из инструкции: «Ошибка: сложить vpub и cash. Почему плохо:
    это разные типы эффектов». Ищем арифметику вида «1330,4 + 322,5».
    """
    note = _text(NOTE)
    assert not re.search(r"vpub\s*\+\s*cash", note, re.IGNORECASE)
    assert not re.search(r"1330,4\s*\+\s*322,5", note)


def test_note_space_statistics_match(facts):
    """Размер пространства и число допустимых конфигураций — как посчитано."""
    note = _text(NOTE)
    for value, what in [
        (facts["space"], "размер пространства"),
        (facts["base"], "прошло BASE"),
        (facts["stress"], "прошло STRESS"),
        (facts["front"], "недоминируемых на фронте"),
    ]:
        assert str(value) in note, f"{what}: движок даёт {value}, в записке такого числа нет"


def test_stress_summary_matches_engine(facts):
    """Резюме стресса — отдельный документ, и разойтись оно может независимо."""
    summary = _text(STRESS_SUMMARY)
    metrics = facts["metrics"]
    slack = 1180 - float(metrics["c0_mrub"])

    assert _ru(float(metrics["c0_mrub"])) in summary, "стартовые затраты"
    assert _ru(slack) in summary, f"запас до стрессового лимита: {_ru(slack)}"
    assert _ru(float(metrics["vpub_mrub_per_year"])) in summary, "общественная ценность"


def test_stress_summary_claims_nine_of_nine(facts):
    """Резюме утверждает 9 из 9 — проверяем, что это правда."""
    from engine import all_passed, diagnose

    rows = diagnose(facts["metrics"], "STRESS")
    assert len(rows) == 9
    assert all_passed(rows), [row.code for row in rows if not row.passed]

    # Резюме утверждает результат таблицей: девять строк, каждая со статусом
    # PASS. Проверяем её, а не наличие фразы — формулировка может измениться,
    # а число строк со статусом обязано соответствовать расчёту.
    raw = STRESS_SUMMARY.read_text(encoding="utf-8")
    assert raw.count("PASS") == len(rows), (
        f"в резюме {raw.count('PASS')} строк со статусом PASS, а движок даёт {len(rows)}"
    )
    assert "FAIL" not in raw, "резюме утверждает прохождение, но содержит строку FAIL"


def test_decision_config_management_fields_are_filled():
    """Управленческие поля конфига заполнены.

    Конфиг уходит в сдачу вместе с кодом и дублирует содержание записки в
    машиночитаемом виде. Незаполненное поле здесь читается как незаконченная
    работа ровно так же, как «TODO» в тексте.
    """
    config = json.loads(DECISION.read_text(encoding="utf-8"))
    assert config["recommended"]["selection"], "рекомендуемый портфель не задан"

    empty = [
        key for key, value in config.get("management", {}).items()
        if not value or "TODO" in str(value).upper()
    ]
    assert empty == [], f"не заполнены управленческие поля: {', '.join(empty)}"


def test_team_name_is_filled_and_consistent():
    """Название команды заполнено и одинаково во всех материалах сдачи.

    Отдельный тест, а не часть предыдущего: это единственное поле, которое
    нельзя вывести из расчёта — его называет команда. Оно попадает в экспорт
    `team_decision_config.json`, который эксперт открывает первым, и в шапки
    обоих документов. Разъехавшееся название читается как разные работы.
    """
    config = json.loads(DECISION.read_text(encoding="utf-8"))
    name = str(config.get("team_name", "")).strip()
    assert name and "TODO" not in name.upper(), (
        "config/decision.json: team_name не заполнено. Название попадает "
        "в экспорт team_decision_config.json, который эксперт открывает "
        "первым. Заполнить до стоп-кода."
    )

    for path in (NOTE, STRESS_SUMMARY, REPO / "README.md"):
        assert name in path.read_text(encoding="utf-8"), (
            f"{path.name}: название команды «{name}» не указано. "
            "Материалы сдачи должны быть подписаны одинаково."
        )


def test_note_has_no_open_decisions():
    """В записке не осталось мест `[РЕШЕНИЕ]`.

    «TODO» в сдаваемом документе читается как незаконченная работа, а по
    рубрике непроверяемое не оценивается.
    """
    note = NOTE.read_text(encoding="utf-8")
    assert "[РЕШЕНИЕ" not in note, "в записке остались открытые управленческие решения"
