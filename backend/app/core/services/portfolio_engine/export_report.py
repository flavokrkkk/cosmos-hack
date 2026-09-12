"""Компактный отчёт для эксперта из уже рассчитанного решения, без выгрузки пространства."""

from .canonical import scenarios
from .constraints import diagnose
from .hybrid import candidate_frame, score_frame
from .sensitivity import input_headroom, surplus_headroom
from .space import format_selection


def short_winner(winner):
    if winner is None:
        return None
    return {key: winner[key] for key in ('selection_id', 'q', 'annual_surplus_mrub')}


def build_report(decision, metrics):
    analysis = decision.analysis
    # enumerate_space внутри candidate_frame возвращает кэш уже выполненного поиска.
    frame = candidate_frame(decision.inputs)
    stress = frame[frame.STRESS_ok]
    selected_lots = {lot for lot, _ in decision.recommended.selection}
    same_lots = stress.lots.map(lambda lots: set(lots.split('+')) == selected_lots)
    alternatives = []
    for variant in decision.alternatives:
        identity = format_selection(sorted(variant.selection))
        matches = frame[frame.stable_id == identity]
        if matches.empty:
            raise ValueError(f'Альтернатива отсутствует в пространстве A/B/C: {identity}')
        row = matches.iloc[0]
        quality = score_frame(matches, analysis['bounds']).iloc[0].q_exact
        alternatives.append(dict(name=variant.name, selection_id=identity,
            c0=float(row.c0), opex=float(row.opex), cash=float(row.cash), vpub=float(row.vpub),
            q=float(quality), BASE_ok=bool(row.BASE_ok), STRESS_ok=bool(row.STRESS_ok)))
    report = dict(format_version=2, method=decision.decision_method, scenario=decision.scenario,
        selection_rule='После обязательных условий и денежного предела выбираем максимальный Q, '
            'затем больший S; далее сумму оценок и стабильный ID. Авто Δ — цена достижения лучшего Q.',
        winner=analysis['winner'])
    for key in ('q_max', 'effective_delta_mrub', 's_max_mrub', 'cash_floor_mrub',
                'cash_eligible_count', 'cash_loss_limit_mrub', 'quality_epsilon', 'reference_count'):
        report[key] = analysis[key]
    report['checks'] = {scenario: [row.as_dict() for row in diagnose(metrics, scenario)]
                        for scenario in scenarios()}
    report['search_summary'] = dict(total_count=len(frame), base_count=int(frame.BASE_ok.sum()),
        stress_count=len(stress), stress_lot_sets=int(stress.lots.nunique()),
        min_stress_c0=float(stress.c0.min()) if not stress.empty else None,
        selected_lot_set_stress_count=int(same_lots.sum()),
        max_q_count=analysis["max_q_count"],
        feasible_count=analysis["feasible_count"],
        scope="total/base/stress: вся область на входах расчёта; feasible/max_q: после условий поиска",
        never_binding_constraints=[key[4:] for key in frame if key.startswith('chk_') and bool(frame[key].all())])
    report['alternatives'] = alternatives
    report['headroom'] = {scenario: [row.as_dict() for row in
        input_headroom(decision.recommended.selection, scenario, decision.inputs) + surplus_headroom(decision.recommended.selection, decision.inputs)]
        for scenario in scenarios()}
    report['switching_curve'] = [dict(delta_from_mrub=point['delta_from_mrub'],
        delta_to_exclusive_mrub=point['delta_to_exclusive_mrub'], winner=short_winner(point['winner']))
        for point in analysis['switching_curve']]
    report['sensitivity'] = [dict(id=item['id'], title=item['title'], feasible_count=item['feasible_count'],
        budget_cap_mrub=item['budget_cap_mrub'], outcome=dict(
            winner=short_winner(item['outcome']['winner']),
            winner_changed=item['outcome']['winner_changed'],
            original_still_feasible=item['outcome']['original_still_feasible']))
        for item in analysis['sensitivity']]
    report['caveat'] = analysis['caveat']
    return report
