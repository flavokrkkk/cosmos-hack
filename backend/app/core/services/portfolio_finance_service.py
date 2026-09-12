from app.core.dto.portfolio import FinancialSummary, SelectionItem
from app.core.services.portfolio_engine import canonical


def financial_summary(selection: list[SelectionItem], metrics: dict) -> FinancialSummary | None:
    if not selection:
        return None
    lots, modes, config = canonical.load_case()
    lots, modes = lots.set_index("lot_id"), modes.set_index("mode_id")
    surplus = metrics["cash_mrub_per_year"] - metrics["opex_mrub_per_year"]
    return FinancialSummary(
        annual_surplus_mrub=surplus, annual_funding_gap_mrub=max(-surplus, 0), operating_self_financed=surplus >= 0,
        anchor_cash_mrub_per_year=sum(float(lots.loc[item.lot_id].anchor_cash_mrub_per_year) * float(modes.loc[item.mode_id].k_anchor) for item in selection),
        commercial_cash_mrub_per_year=sum(float(lots.loc[item.lot_id].commercial_cash_mrub_per_year) * float(modes.loc[item.mode_id].k_commercial) for item in selection),
        cash_drop_break_even_pct=100 * surplus / metrics["cash_mrub_per_year"] if surplus >= 0 and metrics["cash_mrub_per_year"] > 0 else None,
        opex_growth_break_even_pct=100 * surplus / metrics["opex_mrub_per_year"] if surplus >= 0 and metrics["opex_mrub_per_year"] > 0 else None,
        startup_headroom_mrub={key: scenario["c0_max_mrub"] - metrics["c0_mrub"] for key, scenario in config["scenarios"].items()},
        public_lot_ids=[item.lot_id for item in selection if bool(modes.loc[item.mode_id].public_core)],
    )
