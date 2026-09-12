"""Сверить числа отчётов с выгрузками движка и при необходимости обновить их.

Из корня:
    python scripts/sync_documents.py            — только проверка, ничего не меняет
    python scripts/sync_documents.py --fix       — обновить явно помеченные значения фактов
    python scripts/sync_documents.py --snapshot  — обновить слепок после успешной сверки документов

Зачем. В записке около 170 различных дробных чисел. Если входные данные или метод изменятся,
вручную их не переписать, а разойдясь с инструментом они стоят баллов: кейс требует, чтобы
цифры записки, презентации и вывода кода совпадали.

Как. Движок остаётся единственным источником: здесь нет ни одной своей формулы канона.
Каждый факт получает имя, значение, формат и список документов, где обязан встречаться.
Слепок предыдущих значений лежит в `results/document_facts.json`. Автоправка допустима лишь
в явной привязке `<!-- fact: C0 -->1129,8<!-- /fact -->`. Непомеченные числа проверяются
как целые числовые токены, но не заменяются: одинаковое число может означать разные факты.
Если старое число осталось вне маркеров, слепок не обновляется до проверки автором.

Чего инструмент не делает. Он не переписывает утверждения об отношениях величин («перекрывают
разрыв двенадцатикратно», «треть ограничений»): такие фразы проверяются отдельно по диапазону
и при выходе из него выносятся человеку. Автоматически менять слова в тексте мы не будем —
это обязанность автора, а не скрипта.
"""
import argparse
import json
import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.app.core.services.portfolio_engine.canonical import CASE_ROOT
from backend.app.core.services.portfolio_engine.export_integrity import verify_export
from backend.app.core.services.portfolio_engine.hybrid import score_frame
SNAPSHOT = ROOT / 'results/document_facts.json'
NOTE, SUMMARY, ALGORITHM = 'docs/23-management-note.md', 'docs/24-stress-summary.md', 'docs/22-hybrid-selection.md'
SLIDES = 'docs/25-presentation-skeleton.md'  # содержание слайдов: те же числа, что в записке

# Правило распределения запуска по уровням бюджета — управленческое решение команды, раздел 4
# записки. Лежит здесь, чтобы суммы не расходились с текстом при смене состава портфеля.
FINANCING = {'FIRE': {'федеральный': 1.0}, 'ENV': {'федеральный': 0.6, 'региональный': 0.4},
             'AGRI': {'региональный': 0.6, 'оператор': 0.4}, 'TRANS': {'региональный': 0.6, 'оператор': 0.4}}


def money(value, digits=1):
    return f'{value:.{digits}f}'.replace('.', ',')


def current_export():
    """Сверка происхождения готовых результатов без нового перебора портфелей."""
    verify_export(ROOT / 'results', ROOT / 'config/decision.json')
    return (
        json.loads((ROOT / 'results/team_decision_config.json').read_text(encoding='utf-8')),
        json.loads((ROOT / 'results/portfolio_metrics.json').read_text(encoding='utf-8')),
        json.loads((ROOT / 'results/hybrid_analysis.json').read_text(encoding='utf-8')),
    )


def collect():
    """Все числа отчётов, выведенные из выгрузок движка. Возвращает имя → (строка, документы)."""
    decision, metrics, analysis = current_export()
    selection = decision['recommended']['selection']
    space = pd.read_csv(ROOT / 'results/portfolio_space.csv')
    detail = pd.read_csv(ROOT / 'results/portfolio_detail.csv')
    sens = pd.read_csv(ROOT / 'results/sensitivity_STRESS.csv')
    ours = space[space.lots.str.split('+').apply(set) == {lot for lot, _ in selection}]
    stress = space[space.STRESS_ok]
    lots = pd.read_csv(CASE_ROOT / 'data/lots.csv').set_index('lot_id')
    modes = pd.read_csv(CASE_ROOT / 'data/access_modes.csv').set_index('mode_id')
    anchor = sum(lots.at[lot, 'anchor_cash_mrub_per_year'] * modes.at[mode, 'k_anchor'] for lot, mode in selection)
    commercial = sum(lots.at[lot, 'commercial_cash_mrub_per_year'] * modes.at[mode, 'k_commercial']
                     for lot, mode in selection)
    c0, opex, cash = metrics['c0_mrub'], metrics['opex_mrub_per_year'], metrics['cash_mrub_per_year']
    surplus = cash - opex
    reference = space[space.BASE_ok & (space.STRESS_ok if decision['algorithm_parameters'].get('require_stress', True) else True)]
    # Только нормировка сохранённых показателей; перебор и новый выбор не запускаются.
    scored = score_frame(reference.assign(surplus=reference.cash - reference.opex), analysis['bounds'])

    facts = {
        'Q победителя': (str(analysis['q_max']).replace('.', ','), (NOTE, ALGORITHM, SLIDES)),
        'Δ, млн ₽/год': (str(analysis['effective_delta_mrub']).replace('.', ','), (NOTE, ALGORITHM, SLIDES)),
        'максимальный остаток S в допустимой области': (money(analysis['s_max_mrub'], 2), (NOTE, ALGORITHM)),
        'C0': (money(c0), (NOTE, SUMMARY, ALGORITHM, SLIDES)),
        'OPEX': (money(opex, 2), (NOTE, SUMMARY, ALGORITHM, SLIDES)),
        'CASH': (money(cash, 1), (NOTE, SUMMARY, ALGORITHM, SLIDES)),
        'VPUB': (money(metrics['vpub_mrub_per_year'], 1), (NOTE, SUMMARY, ALGORITHM)),
        'KCASH': (money(metrics['kcash'], 3), (NOTE, SUMMARY)),
        't_rep': (money(metrics['t_rep'], 3), (NOTE, SUMMARY)),
        'остаток S': (money(surplus, 2), (NOTE, SUMMARY, ALGORITHM, SLIDES)),
        'остаток S, % к OPEX': (money(surplus / opex * 100, 1), (NOTE, SLIDES)),
        'запас STRESS': (money(1180 - c0), (NOTE, SUMMARY, ALGORITHM, SLIDES)),
        'запас BASE': (money(1300 - c0), (SUMMARY,)),
        'сокращение лимита в стрессе, %': (money((1300 - 1180) / 1300 * 100, 2), (NOTE, SUMMARY, SLIDES)),
        'минимум C0 пространства': (money(stress.c0.min()), (NOTE, SUMMARY, SLIDES)),
        'конфигураций всего': (str(len(space)), (NOTE, SUMMARY, ALGORITHM, SLIDES)),
        'проходят BASE': (str(int(space.BASE_ok.sum())), (NOTE, ALGORITHM, SLIDES)),
        'проходят STRESS': (str(len(stress)), (NOTE, SUMMARY, ALGORITHM, SLIDES)),
        'конфигураций с максимальным Q': (str(int((scored.q_exact == scored.q_exact.max()).sum())), (NOTE, SLIDES)),
        'наборов проходит STRESS': (str(stress.lots.nunique()), (NOTE,)),
        'режимных комбинаций нашего набора': (str(int(ours.STRESS_ok.sum())), (NOTE,)),
        'якорные поступления': (money(anchor, 2), (NOTE,)),
        'коммерческие поступления': (money(commercial, 2), (NOTE,)),
        'доля коммерческих поступлений': (money(commercial / cash * 100, 1), (NOTE, SUMMARY, SLIDES)),
    }
    flood = space[(space.lots.str.split('+').apply(set) == {'FLOOD', 'AGRI', 'TRANS', 'ENV'}) & (space.modes == 'ACCA')].iloc[0]
    facts['FLOOD-вариант: остаток'] = (money(flood.cash - flood.opex, 2), (NOTE,))
    facts['FLOOD-вариант: VPUB'] = (money(flood.vpub, 1), (NOTE,))
    facts['FLOOD-вариант: запас STRESS'] = (money(1180 - flood.c0), (NOTE, SLIDES))
    facts['FLOOD-вариант: прирост остатка, %'] = (money((flood.cash - flood.opex - surplus) / surplus * 100, 1), (NOTE, SLIDES))
    facts['FLOOD-вариант: прирост VPUB, %'] = (money((flood.vpub / metrics['vpub_mrub_per_year'] - 1) * 100, 1), (NOTE, SLIDES))
    flood_outcome = next((point['winner'] for point in analysis['switching_curve']
                          if point['winner']['selection_id'] == 'AGRI:C,ENV:A,FLOOD:A,TRANS:C'), None)
    if flood_outcome is None:
        raise ValueError('FLOOD-вариант отсутствует в сохранённой кривой выбора; сравнение в защите требует проверки')
    facts['FLOOD-вариант: Q'] = (str(flood_outcome['q']).replace('.', ','), (NOTE, SLIDES))
    facts['дефицит ядра'] = (money(abs(sum(b for b in (detail.cash_mrub_per_year - detail.opex_mrub_per_year) if b < 0)), 2), (NOTE,))
    for row in detail.itertuples():
        facts[f'{row.lot_id}: c0'] = (money(row.c0_mrub, 2), (NOTE,))
        facts[f'{row.lot_id}: баланс'] = (money(abs(row.cash_mrub_per_year - row.opex_mrub_per_year), 2), (NOTE,))
        shares = FINANCING.get(row.lot_id, {})
        for level, share in shares.items():
            facts[f'{row.lot_id}: {level}'] = (money(row.c0_mrub * share, 2), (NOTE,))
    for level in ('федеральный', 'региональный', 'оператор'):
        total = sum(row.c0_mrub * FINANCING.get(row.lot_id, {}).get(level, 0) for row in detail.itertuples())
        facts[f'запуск, {level}'] = (money(total, 2), (NOTE, SLIDES))
    for row in sens.itertuples():
        name = row.input.split(' ')[0]
        facts[f'предел {name} {row.direction} ({row.binding_constraint.split(" ")[0]})'] = (
            money(abs(row.change_pct), 1), (NOTE, SUMMARY))
    return facts


def relations():
    """Утверждения об отношениях величин: проверяются по диапазону, правятся человеком."""
    _, metrics, _ = current_export()
    space = pd.read_csv(ROOT / 'results/portfolio_space.csv')
    detail = pd.read_csv(ROOT / 'results/portfolio_detail.csv')
    sens = pd.read_csv(ROOT / 'results/sensitivity_STRESS.csv')
    balances = detail.cash_mrub_per_year - detail.opex_mrub_per_year
    never = [c for c in space.columns if c.startswith('chk_') and bool(space[c].all())]
    limits = {r.binding_constraint.split(' ')[0] + ':' + r.input.split(' ')[0]: abs(r.change_pct)
              for r in sens.itertuples()}
    # Диапазон задан тем, что означает фраза: «двенадцатикратно» читается как «не меньше двенадцати»,
    # «вчетверо» — как округление до четырёх. Границы здесь, а не в тексте, чтобы при смене данных
    # ломался скрипт, а не доверие эксперта к записке.
    return [
        ('«перекрывают разрыв двенадцатикратно» (раздел 4)',
         balances[balances > 0].sum() / abs(balances[balances < 0].sum()), 12.0, 13.0),
        ('«четыре ограничения из девяти не работают никогда» (раздел 5.1)', float(len(never)), 4.0, 5.0),
        ('«запас по росту расходов вчетверо больше» (резюме)',
         limits['opex_limit:opex'] / limits['c0_limit:c0'], 3.5, 4.5),
        ('«вдвое больше до нарушения порога KCASH» (раздел 7)',
         limits['kcash_floor:cash'] / limits['zero_surplus:cash'], 2.0, 3.0),
        ('«предел доли оператора 46%» — окно 30–60 мес. × остаток / C0 рыночных лотов (раздел 4)',
         (2.5 * (metrics['cash_mrub_per_year'] - metrics['opex_mrub_per_year']))
         / float(detail.loc[detail.mode_id == 'C', 'c0_mrub'].sum()) * 100, 46.0, 47.0),
        ('«при 50% возврат уходит за контрольную точку» (раздел 4)',
         0.5 * float(detail.loc[detail.mode_id == 'C', 'c0_mrub'].sum())
         / (metrics['cash_mrub_per_year'] - metrics['opex_mrub_per_year']), 2.5, 99.0),
        ('«субсидия 0,7% от стартовых затрат в год» (раздел 4)',
         abs(balances[balances < 0].sum()) / metrics['c0_mrub'] * 100, 0.65, 0.75),
        ('«запас FLOOD-варианта меньше в 1,7 раза» (раздел 5.3)',
         (1180 - metrics['c0_mrub']) / (1180 - float(space[(space.lots.str.split('+').apply(set) == {'FLOOD','AGRI','TRANS','ENV'}) & (space.modes == 'ACCA')].c0.iloc[0])), 1.65, 1.75),
        ('«остаток 30,2% сверх расходов» (раздел 1)',
         (metrics['cash_mrub_per_year'] - metrics['opex_mrub_per_year']) / metrics['opex_mrub_per_year'] * 100,
         30.0, 31.0),
    ]


FACT_MARKER = re.compile(r'<!--\s*fact:\s*(?P<name>.*?)\s*-->(?P<value>.*?)<!--\s*/fact\s*-->', re.S)


def contains_value(text: str, value: str) -> bool:
    """Не засчитывать 9,5 внутри 99,50, 0,5 внутри 0,50 или 8 внутри 1180."""
    return re.search(r'(?<![\d.,])' + re.escape(value) + r'(?!\d|[.,]\d)', text) is not None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fix', action='store_true', help='обновить значения в явных fact-маркерах')
    parser.add_argument('--snapshot', action='store_true', help='обновить слепок после успешной сверки документов')
    args = parser.parse_args()

    try:
        facts = collect()
        relation_values = relations()
    except (ValueError, OSError) as error:
        print(f'ОШИБКА: {error}')
        return 1
    previous = json.loads(SNAPSHOT.read_text(encoding='utf-8')) if SNAPSHOT.exists() else {}
    missing, manual = [], []
    changed = [(name, previous[name], value, documents)
               for name, (value, documents) in facts.items()
               if name in previous and previous[name] != value]
    documents = {document for _, paths in facts.values() for document in paths}
    originals = {document: (ROOT / document).read_text(encoding='utf-8') for document in documents}
    texts = dict(originals)

    for document in sorted(documents):
        def update_marker(match):
            name, written = match.group('name'), match.group('value').strip()
            if name not in facts or document not in facts[name][1]:
                manual.append(f'неизвестный или неверно размещённый fact-маркер {name} в {document}')
                return match.group(0)
            value = facts[name][0]
            if written == value:
                return match.group(0)
            if args.fix and written == previous.get(name):
                return f'<!-- fact: {name} -->{value}<!-- /fact -->'
            manual.append(f'fact-маркер {name} в {document}: {written} вместо {value}')
            return match.group(0)

        texts[document] = FACT_MARKER.sub(update_marker, texts[document])

    for name, was, value, paths in changed:
        print(f'  изменилось {name}: {was} → {value}')
        for document in paths:
            unmarked = FACT_MARKER.sub('', texts[document])
            if contains_value(unmarked, was):
                manual.append(f'{name}: прежнее {was} осталось без fact-маркера в {document}; '
                              'автору нужно проверить контекст и явно привязать факт')

    for name, (value, paths) in sorted(facts.items()):
        for document in paths:
            # Подпись чужого маркера не заменяет наличие значения данного факта.
            visible = FACT_MARKER.sub(lambda match: match.group('value'), texts[document])
            if not contains_value(visible, value):
                missing.append((name, value, document))

    for label, value, low, high in relation_values:
        if not low <= value < high:
            manual.append(f'{label}: фактическое отношение {value:.2f} вне диапазона [{low}; {high})')

    for name, value, document in missing:
        print(f'  НЕТ В ТЕКСТЕ {name} = {value} → {document}')
    for line in manual:
        print(f'  ЧЕЛОВЕКУ: {line}')

    failed = bool(missing or manual or (changed and not (args.fix or args.snapshot)))
    # Проверка ничего не пишет. --fix применяет подготовленные правки лишь после общей сверки.
    if not failed and args.fix:
        for document, text in texts.items():
            if text != originals[document]:
                (ROOT / document).write_text(text, encoding='utf-8')
                print(f'  правка fact-маркеров: {document}')
    if not failed and (args.fix or args.snapshot):
        SNAPSHOT.write_text(json.dumps({k: v[0] for k, v in facts.items()}, ensure_ascii=False, indent=2) + '\n',
                            encoding='utf-8')
        print(f'Слепок обновлён: {SNAPSHOT.relative_to(ROOT)}')

    print(f'Фактов: {len(facts)}; изменилось: {len(changed)}; нет в тексте: {len(missing)}; '
          f'человеку: {len(manual)}')
    return int(failed)


if __name__ == '__main__':
    raise SystemExit(main())
