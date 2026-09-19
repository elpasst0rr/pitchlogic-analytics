"""
PitchLogic Analytics — Motor del modelo de 4 capas (calculate_predictions.py)
============================================================================
Lee datos ya ingeridos en Supabase (partidos, estadísticas históricas,
bajas, clima, árbitros) y escribe en `predictions` y `value_alerts` el
resultado del modelo de deducción en 4 capas:

    Capa 1 (40%) — Rendimiento base / xG
        Modelo de Poisson con fuerza de ataque/defensa por equipo, separado
        en casa/fuera, con shrinkage bayesiano hacia el promedio de la liga
        cuando hay pocos partidos jugados. La ventaja de local queda
        incorporada aquí (sale de los propios datos, no de un multiplicador).

    Capa 2 (25%) — Plantilla y bajas
        Ajusta el lambda ofensivo del equipo según player_importance_score
        de los jugadores confirmados fuera / dudosos.

    Capa 3 (20%) — Descanso y fatiga
        Ajusta el lambda según días de descanso y congestión de calendario
        (partidos en los últimos 14 días).

    Capa 4 (15%) — Factores contextuales (clima / árbitro)
        Ajusta el lambda según lluvia/viento (remates, córners, faltas) y
        el histórico del árbitro (tarjetas, faltas).

Cada capa recalcula su propia probabilidad de Poisson con el lambda
ajustado. La probabilidad final es la combinación ponderada exacta de tu
modelo: composite = 0.40*L1 + 0.25*L2 + 0.20*L3 + 0.15*L4.

Es un job batch: se pensó para correr 2-3 veces al día y 1h antes de cada
partido (con alineaciones confirmadas), dejando `predictions` y
`value_alerts` listos para que el frontend solo lea.

Variables de entorno requeridas:
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY

Uso:
    python calculate_predictions.py --season 2026 --hours-ahead 72
    python calculate_predictions.py --season 2026 --date 2026-09-20 --run-type pre_match_lineup_confirmed

IMPORTANTE — punto de ajuste para tu validación en Sheets:
    Los pesos de las capas, las constantes de shrinkage y los factores de
    ajuste (squad/fatiga/clima/árbitro) están todos agrupados en la sección
    "CONSTANTES DEL MODELO" al inicio del archivo. Si tu hoja de Google
    Sheets usa números distintos para algún ajuste, cámbialos ahí — el resto
    del código no necesita tocarse.
============================================================================
"""

from __future__ import annotations

import argparse
import logging
import math
import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Optional

from dotenv import load_dotenv
from supabase import create_client, Client

# ----------------------------------------------------------------------------
# Configuración y logging
# ----------------------------------------------------------------------------

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("pitchlogic.calculate_predictions")

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

DEFAULT_SEASON = 2026  # Temporada 2026/2027
DEFAULT_LEAGUE_API_ID = 140  # LaLiga

# ----------------------------------------------------------------------------
# CONSTANTES DEL MODELO — punto único de ajuste
# ----------------------------------------------------------------------------

LAYER_WEIGHTS = {
    "layer1": 0.40,
    "layer2": 0.25,
    "layer3": 0.20,
    "layer4": 0.15,
}

ROLLING_MATCHES_WINDOW = 10  # nº de partidos recientes considerados
SHRINKAGE_PRIOR_WEIGHT = 5   # "K": a cuántos partidos de liga equivale la confianza previa
GOAL_RANGE_MAX = 10          # rango de goles sumado en la matriz de Poisson para 1X2
PROBABILITY_FLOOR = 0.01
PROBABILITY_CEIL = 0.99

# Capa 2 — impacto de bajas
INJURY_WEIGHT_CONFIRMED_OUT = 1.0
INJURY_WEIGHT_DOUBTFUL = 0.5
SQUAD_IMPACT_CAP = 0.5          # impacto normalizado máximo considerado
SQUAD_MAX_LAMBDA_REDUCTION = 0.25  # reducción máxima del lambda ofensivo (25%)

# Capa 3 — descanso y fatiga
FATIGUE_QUICK_TURNAROUND_DAYS = 3
FATIGUE_QUICK_TURNAROUND_FACTOR = 0.93
FATIGUE_WELL_RESTED_DAYS = 7
FATIGUE_WELL_RESTED_FACTOR = 1.03
FATIGUE_CONGESTION_MATCHES_14D = 3
FATIGUE_CONGESTION_FACTOR = 0.95
FATIGUE_FACTOR_MIN, FATIGUE_FACTOR_MAX = 0.80, 1.10

# Capa 4 — clima
WEATHER_HEAVY_RAIN_MM = 2.0
WEATHER_HIGH_WIND_KMH = 30.0
WEATHER_SHOTS_CORNERS_FACTOR = 0.93
WEATHER_FOULS_FACTOR = 1.05
WEATHER_GOALS_FACTOR = 0.95

# Capa 4 — árbitro (solo aplica a mercados de tarjetas/faltas)
REFEREE_FACTOR_MIN, REFEREE_FACTOR_MAX = 0.80, 1.30

# Recomendación de quiniela (1X2 + Doble Oportunidad)
THRESHOLD_SIMPLE_WIN = 0.60       # Victoria simple (1, X o 2) si composite >= 60%
THRESHOLD_DOUBLE_CHANCE_MIN = 0.52  # Doble oportunidad (1X, X2, 12) si composite >= 52%
# Sin techo superior para doble oportunidad a propósito: un 1X al 75% sigue
# siendo un pick válido y no debería quedar "sin recomendación" por superar
# el rango 52-59% que solo describe la zona típica bajo el umbral de 60%.
# Si prefieres un techo duro, añade DOUBLE_CHANCE_MAX y aplícalo en
# determine_match_recommendation().

SIMPLE_SELECTION_LABELS = {"home": "1", "draw": "X", "away": "2"}
DOUBLE_CHANCE_SELECTION_LABELS = {"home_or_draw": "1X", "draw_or_away": "X2", "home_or_away": "12"}

# Estadísticas consideradas y su columna origen en match_stats
# ("goals" es especial: sale de matches.home_score/away_score, no de match_stats)
STAT_KEYS = ["goals", "shots_total", "corners", "fouls_committed", "cards_weighted"]

# Mercados de equipo: market_code -> (stat_key, línea por defecto)
TEAM_MARKETS = {
    "TEAM_SHOTS_OU": ("shots_total", 11.5),
    "TEAM_CORNERS_OU": ("corners", 4.5),
    "TEAM_FOULS_OU": ("fouls_committed", 11.5),
    "TEAM_CARDS_OU": ("cards_weighted", 2.5),
}

# Mercados de partido (suma de ambos equipos): market_code -> (stat_key, línea por defecto)
MATCH_MARKETS = {
    "MATCH_CORNERS_OU": ("corners", 9.5),
    "MATCH_CARDS_OU": ("cards_weighted", 4.5),
    "MATCH_FOULS_OU": ("fouls_committed", 22.5),
}


# ----------------------------------------------------------------------------
# Utilidades de Poisson (sin dependencias externas)
# ----------------------------------------------------------------------------


def poisson_pmf(k: int, lam: float) -> float:
    if lam <= 0:
        return 1.0 if k == 0 else 0.0
    return math.exp(-lam) * (lam ** k) / math.factorial(k)


def poisson_cdf(k: int, lam: float) -> float:
    return sum(poisson_pmf(i, lam) for i in range(0, k + 1))


def prob_over_under(line: float, lam: float) -> tuple[float, float]:
    """Devuelve (P(over línea), P(under línea)) para una línea tipo X.5."""
    threshold = math.floor(line)  # línea X.5 -> over significa >= threshold+1
    p_under_or_eq = poisson_cdf(threshold, lam)
    p_over = 1.0 - p_under_or_eq
    return _clip(p_over), _clip(1.0 - p_over)


def prob_1x2(lambda_home: float, lambda_away: float) -> tuple[float, float, float]:
    """Devuelve (P(home), P(draw), P(away)) vía matriz conjunta de Poisson independientes."""
    p_home = p_draw = p_away = 0.0
    for gh in range(0, GOAL_RANGE_MAX + 1):
        p_gh = poisson_pmf(gh, lambda_home)
        for ga in range(0, GOAL_RANGE_MAX + 1):
            p_joint = p_gh * poisson_pmf(ga, lambda_away)
            if gh > ga:
                p_home += p_joint
            elif gh == ga:
                p_draw += p_joint
            else:
                p_away += p_joint
    total = p_home + p_draw + p_away
    if total == 0:
        return 1 / 3, 1 / 3, 1 / 3
    return _clip(p_home / total), _clip(p_draw / total), _clip(p_away / total)


def _clip(p: float) -> float:
    return min(max(p, PROBABILITY_FLOOR), PROBABILITY_CEIL)


def shrunk_average(sample_values: list[float], league_avg: float, prior_weight: int = SHRINKAGE_PRIOR_WEIGHT) -> float:
    n = len(sample_values)
    if n == 0:
        return league_avg
    sample_mean = sum(sample_values) / n
    return (sample_mean * n + league_avg * prior_weight) / (n + prior_weight)


# ----------------------------------------------------------------------------
# Repositorio Supabase
# ----------------------------------------------------------------------------


class SupabaseRepository:
    def __init__(self, url: str, service_key: str):
        if not url or not service_key:
            raise ValueError("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en las variables de entorno.")
        self.client: Client = create_client(url, service_key)

    # -- Carga masiva de la temporada (una vez por corrida) ------------------

    def load_finished_matches(self, league_id: str, season: int) -> list[dict]:
        result = (
            self.client.table("matches")
            .select("id, home_team_id, away_team_id, match_date, home_score, away_score, referee_id")
            .eq("league_id", league_id)
            .eq("season", season)
            .eq("status", "finished")
            .order("match_date")
            .execute()
        )
        return result.data or []

    def load_match_stats_for_matches(self, match_ids: list[str]) -> list[dict]:
        if not match_ids:
            return []
        rows: list[dict] = []
        # Supabase/PostgREST limita el tamaño de los filtros `in_`; se pagina por bloques.
        chunk_size = 200
        for i in range(0, len(match_ids), chunk_size):
            chunk = match_ids[i:i + chunk_size]
            result = self.client.table("match_stats").select("*").in_("match_id", chunk).execute()
            rows.extend(result.data or [])
        return rows

    def get_league_uuid(self, api_football_league_id: int) -> Optional[str]:
        result = (
            self.client.table("leagues")
            .select("id")
            .eq("api_football_id", api_football_league_id)
            .limit(1)
            .execute()
        )
        return result.data[0]["id"] if result.data else None

    # -- Partidos próximos ------------------------------------------------

    def get_upcoming_matches(self, league_id: str, season: int, hours_ahead: int, only_date: Optional[str]) -> list[dict]:
        query = (
            self.client.table("matches")
            .select("id, home_team_id, away_team_id, match_date, referee_id")
            .eq("league_id", league_id)
            .eq("season", season)
            .in_("status", ["scheduled", "lineups_confirmed"])
        )
        if only_date:
            query = query.gte("match_date", f"{only_date}T00:00:00Z").lte("match_date", f"{only_date}T23:59:59Z")
        else:
            now = datetime.now(timezone.utc)
            until = now + timedelta(hours=hours_ahead)
            query = query.gte("match_date", now.isoformat()).lte("match_date", until.isoformat())

        result = query.order("match_date").execute()
        return result.data or []

    # -- Bajas / plantilla --------------------------------------------------

    def get_missing_players(self, team_id: str) -> list[dict]:
        result = (
            self.client.table("injuries_suspensions")
            .select("status, players(player_importance_score)")
            .eq("team_id", team_id)
            .in_("status", ["confirmed_out", "doubtful"])
            .execute()
        )
        return result.data or []

    # -- Descanso / fatiga ----------------------------------------------

    def get_team_recent_match_dates(self, team_id: str, before_date: str, days_back: int = 21) -> list[str]:
        since = (datetime.fromisoformat(before_date.replace("Z", "+00:00")) - timedelta(days=days_back)).isoformat()
        result = (
            self.client.table("matches")
            .select("match_date")
            .eq("status", "finished")
            .lt("match_date", before_date)
            .gte("match_date", since)
            .or_(f"home_team_id.eq.{team_id},away_team_id.eq.{team_id}")
            .order("match_date", desc=True)
            .execute()
        )
        return [row["match_date"] for row in (result.data or [])]

    # -- Clima / árbitro --------------------------------------------------

    def get_latest_weather(self, match_id: str) -> Optional[dict]:
        result = (
            self.client.table("weather_snapshots")
            .select("precipitation_mm, wind_speed_kmh")
            .eq("match_id", match_id)
            .order("captured_at", desc=True)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None

    def get_referee_stats(self, referee_id: Optional[str], season: int) -> Optional[dict]:
        if not referee_id:
            return None
        result = (
            self.client.table("referee_stats")
            .select("avg_yellow_cards_per_match, avg_red_cards_per_match, avg_fouls_given_per_match")
            .eq("referee_id", referee_id)
            .eq("season", season)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None

    # -- Model runs / predictions / value alerts -------------------------

    def create_model_run(self, run_type: str) -> str:
        result = self.client.table("model_runs").insert({"run_type": run_type, "status": "running"}).execute()
        return result.data[0]["id"]

    def finish_model_run(self, model_run_id: str, matches_processed: int, predictions_generated: int, status: str = "completed") -> None:
        self.client.table("model_runs").update({
            "status": status,
            "finished_at": "now()",
            "matches_processed": matches_processed,
            "predictions_generated": predictions_generated,
        }).eq("id", model_run_id).execute()

    def get_market_id(self, code: str) -> Optional[str]:
        result = self.client.table("markets").select("id").eq("code", code).limit(1).execute()
        return result.data[0]["id"] if result.data else None

    def insert_prediction(self, row: dict) -> dict:
        result = self.client.table("predictions").insert(row).execute()
        return result.data[0]

    def get_bookmaker_odds(self, match_id: str, market_id: str) -> list[dict]:
        result = (
            self.client.table("bookmaker_odds")
            .select("id, selection, odds_decimal, line_value")
            .eq("match_id", match_id)
            .eq("market_id", market_id)
            .order("captured_at", desc=True)
            .execute()
        )
        return result.data or []

    def insert_value_alert(self, row: dict) -> None:
        self.client.table("value_alerts").insert(row).execute()

    def insert_match_recommendation(self, row: dict) -> None:
        self.client.table("match_recommendations").upsert(row, on_conflict="match_id,model_run_id").execute()


# ----------------------------------------------------------------------------
# Dataset de temporada en memoria (evita cientos de round-trips a Supabase)
# ----------------------------------------------------------------------------


class SeasonDataset:
    """Precalcula, una sola vez por corrida, los promedios de liga y por
    equipo (casa/fuera) para cada estadística, con shrinkage bayesiano."""

    def __init__(self, matches: list[dict], match_stats: list[dict]):
        self.matches_by_id = {m["id"]: m for m in matches}
        self.stats_by_match_team: dict[tuple[str, str], dict] = {}
        for s in match_stats:
            key = (s["match_id"], s["team_id"])
            s["cards_weighted"] = (s.get("yellow_cards") or 0) + 2 * (s.get("red_cards") or 0)
            self.stats_by_match_team[key] = s

        # team_venue_values[team_id][venue]["for"|"against"][stat_key] -> list[float]
        self.team_venue_values: dict[str, dict] = {}
        # league_venue_avg[venue][stat_key] -> float (promedio "for" del lado que juega en ese venue)
        self.league_venue_avg: dict[str, dict] = {"home": {}, "away": {}}

        self._build(matches)

    def _build(self, matches: list[dict]) -> None:
        league_values: dict[str, dict[str, list[float]]] = {"home": {k: [] for k in STAT_KEYS}, "away": {k: [] for k in STAT_KEYS}}

        for m in matches:
            home_id, away_id = m["home_team_id"], m["away_team_id"]
            home_stats = self.stats_by_match_team.get((m["id"], home_id), {})
            away_stats = self.stats_by_match_team.get((m["id"], away_id), {})

            home_values = self._extract_stat_values(m, home_stats, is_home=True)
            away_values = self._extract_stat_values(m, away_stats, is_home=False)

            for stat_key in STAT_KEYS:
                h_val, a_val = home_values.get(stat_key), away_values.get(stat_key)
                if h_val is None or a_val is None:
                    continue  # partido sin estadísticas cargadas todavía: se ignora para ese stat

                self._append_team_value(home_id, "home", "for", stat_key, h_val)
                self._append_team_value(home_id, "home", "against", stat_key, a_val)
                self._append_team_value(away_id, "away", "for", stat_key, a_val)
                self._append_team_value(away_id, "away", "against", stat_key, h_val)

                league_values["home"][stat_key].append(h_val)
                league_values["away"][stat_key].append(a_val)

        for venue in ("home", "away"):
            for stat_key in STAT_KEYS:
                values = league_values[venue][stat_key]
                # Fallback conservador si aún no hay ningún dato cargado en la liga/temporada.
                self.league_venue_avg[venue][stat_key] = (sum(values) / len(values)) if values else 1.0

    def _extract_stat_values(self, match: dict, stats_row: dict, is_home: bool) -> dict:
        values = {}
        if match.get("home_score") is not None and match.get("away_score") is not None:
            values["goals"] = float(match["home_score"] if is_home else match["away_score"])
        for stat_key in ("shots_total", "corners", "fouls_committed", "cards_weighted"):
            if stats_row.get(stat_key) is not None:
                values[stat_key] = float(stats_row[stat_key])
        return values

    def _append_team_value(self, team_id: str, venue: str, side: str, stat_key: str, value: float) -> None:
        team = self.team_venue_values.setdefault(team_id, {
            "home": {"for": {k: [] for k in STAT_KEYS}, "against": {k: [] for k in STAT_KEYS}},
            "away": {"for": {k: [] for k in STAT_KEYS}, "against": {k: [] for k in STAT_KEYS}},
        })
        values = team[venue][side][stat_key]
        values.append(value)
        # Mantiene solo la ventana móvil más reciente (los partidos se cargan en orden cronológico).
        if len(values) > ROLLING_MATCHES_WINDOW:
            values.pop(0)

    def team_avg(self, team_id: str, venue: str, side: str, stat_key: str) -> float:
        league_avg = self.league_venue_avg[venue][stat_key]
        team = self.team_venue_values.get(team_id)
        if not team:
            return league_avg
        return shrunk_average(team[venue][side][stat_key], league_avg)

    def base_lambda(self, home_team_id: str, away_team_id: str, stat_key: str) -> tuple[float, float]:
        """Lambda base (Capa 1, sin ajustes de capas 2-4) para home y away."""
        league_home_for = self.league_venue_avg["home"][stat_key] or 1.0
        league_away_for = self.league_venue_avg["away"][stat_key] or 1.0

        attack_home = self.team_avg(home_team_id, "home", "for", stat_key) / league_home_for
        defense_away = self.team_avg(away_team_id, "away", "against", stat_key) / league_home_for
        lambda_home = league_home_for * attack_home * defense_away

        attack_away = self.team_avg(away_team_id, "away", "for", stat_key) / league_away_for
        defense_home = self.team_avg(home_team_id, "home", "against", stat_key) / league_away_for
        lambda_away = league_away_for * attack_away * defense_home

        return max(lambda_home, 0.01), max(lambda_away, 0.01)


# ----------------------------------------------------------------------------
# Capas 2-4: factores de ajuste sobre el lambda base
# ----------------------------------------------------------------------------


def squad_availability_factor(repo: SupabaseRepository, team_id: str) -> float:
    missing = repo.get_missing_players(team_id)
    impact = 0.0
    for row in missing:
        player = row.get("players") or {}
        importance = (player.get("player_importance_score") or 0) / 100
        weight = INJURY_WEIGHT_CONFIRMED_OUT if row["status"] == "confirmed_out" else INJURY_WEIGHT_DOUBTFUL
        impact += importance * weight

    impact = min(impact, SQUAD_IMPACT_CAP)
    reduction = (impact / SQUAD_IMPACT_CAP) * SQUAD_MAX_LAMBDA_REDUCTION
    return 1.0 - reduction


def fatigue_factor(repo: SupabaseRepository, team_id: str, match_date: str) -> float:
    recent_dates = repo.get_team_recent_match_dates(team_id, match_date)
    factor = 1.0

    if recent_dates:
        last_match = datetime.fromisoformat(recent_dates[0].replace("Z", "+00:00"))
        kickoff = datetime.fromisoformat(match_date.replace("Z", "+00:00"))
        days_since_last = (kickoff - last_match).days

        if days_since_last <= FATIGUE_QUICK_TURNAROUND_DAYS:
            factor *= FATIGUE_QUICK_TURNAROUND_FACTOR
        elif days_since_last >= FATIGUE_WELL_RESTED_DAYS:
            factor *= FATIGUE_WELL_RESTED_FACTOR

    matches_last_14d = sum(
        1 for d in recent_dates
        if (datetime.fromisoformat(match_date.replace("Z", "+00:00")) - datetime.fromisoformat(d.replace("Z", "+00:00"))).days <= 14
    )
    if matches_last_14d >= FATIGUE_CONGESTION_MATCHES_14D:
        factor *= FATIGUE_CONGESTION_FACTOR

    return min(max(factor, FATIGUE_FACTOR_MIN), FATIGUE_FACTOR_MAX)


def contextual_factor(repo: SupabaseRepository, match_id: str, referee_id: Optional[str], season: int, stat_key: str) -> float:
    factor = 1.0

    weather = repo.get_latest_weather(match_id)
    if weather:
        heavy_rain = (weather.get("precipitation_mm") or 0) >= WEATHER_HEAVY_RAIN_MM
        high_wind = (weather.get("wind_speed_kmh") or 0) >= WEATHER_HIGH_WIND_KMH
        if heavy_rain or high_wind:
            if stat_key in ("shots_total", "corners"):
                factor *= WEATHER_SHOTS_CORNERS_FACTOR
            elif stat_key == "fouls_committed":
                factor *= WEATHER_FOULS_FACTOR
            elif stat_key == "goals":
                factor *= WEATHER_GOALS_FACTOR

    if stat_key in ("fouls_committed", "cards_weighted"):
        ref_stats = repo.get_referee_stats(referee_id, season)
        if ref_stats:
            if stat_key == "cards_weighted":
                ref_value = (ref_stats.get("avg_yellow_cards_per_match") or 0) + 2 * (ref_stats.get("avg_red_cards_per_match") or 0)
                league_reference = 3.5  # promedio orientativo de tarjetas ponderadas por partido/equipo
            else:
                ref_value = ref_stats.get("avg_fouls_given_per_match") or 0
                league_reference = 11.0  # promedio orientativo de faltas por partido/equipo

            if ref_value and league_reference:
                ratio = ref_value / league_reference
                factor *= min(max(ratio, REFEREE_FACTOR_MIN), REFEREE_FACTOR_MAX)

    return factor


# ----------------------------------------------------------------------------
# Cálculo de una predicción (las 4 capas) para un mercado concreto
# ----------------------------------------------------------------------------


def compute_team_market_prediction(
    repo: SupabaseRepository,
    dataset: SeasonDataset,
    match: dict,
    team_id: str,
    opponent_id: str,
    is_home: bool,
    stat_key: str,
    line: float,
    season: int,
) -> dict:
    lambda_home, lambda_away = dataset.base_lambda(match["home_team_id"], match["away_team_id"], stat_key)
    base_lambda = lambda_home if is_home else lambda_away

    p1, _ = prob_over_under(line, base_lambda)

    squad_factor = squad_availability_factor(repo, team_id)
    p2, _ = prob_over_under(line, base_lambda * squad_factor)

    rest_factor = fatigue_factor(repo, team_id, match["match_date"])
    p3, _ = prob_over_under(line, base_lambda * rest_factor)

    ctx_factor = contextual_factor(repo, match["id"], match.get("referee_id"), season, stat_key)
    p4, _ = prob_over_under(line, base_lambda * ctx_factor)

    composite = _combine_layers(p1, p2, p3, p4)

    return {
        "target_team_id": team_id,
        "target_player_id": None,
        "line_value": line,
        "selection": "over",
        "layer1_performance_xg": p1,
        "layer2_squad_availability": p2,
        "layer3_rest_fatigue": p3,
        "layer4_contextual": p4,
        "composite_probability": composite,
    }


def compute_match_market_prediction(
    repo: SupabaseRepository,
    dataset: SeasonDataset,
    match: dict,
    stat_key: str,
    line: float,
    season: int,
) -> dict:
    lambda_home, lambda_away = dataset.base_lambda(match["home_team_id"], match["away_team_id"], stat_key)
    p1, _ = prob_over_under(line, lambda_home + lambda_away)

    squad_h = squad_availability_factor(repo, match["home_team_id"])
    squad_a = squad_availability_factor(repo, match["away_team_id"])
    p2, _ = prob_over_under(line, lambda_home * squad_h + lambda_away * squad_a)

    rest_h = fatigue_factor(repo, match["home_team_id"], match["match_date"])
    rest_a = fatigue_factor(repo, match["away_team_id"], match["match_date"])
    p3, _ = prob_over_under(line, lambda_home * rest_h + lambda_away * rest_a)

    ctx = contextual_factor(repo, match["id"], match.get("referee_id"), season, stat_key)
    p4, _ = prob_over_under(line, (lambda_home + lambda_away) * ctx)

    composite = _combine_layers(p1, p2, p3, p4)

    return {
        "target_team_id": None,
        "target_player_id": None,
        "line_value": line,
        "selection": "over",
        "layer1_performance_xg": p1,
        "layer2_squad_availability": p2,
        "layer3_rest_fatigue": p3,
        "layer4_contextual": p4,
        "composite_probability": composite,
    }


def compute_1x2_prediction(repo: SupabaseRepository, dataset: SeasonDataset, match: dict, season: int) -> list[dict]:
    lambda_home, lambda_away = dataset.base_lambda(match["home_team_id"], match["away_team_id"], "goals")
    p1_home, p1_draw, p1_away = prob_1x2(lambda_home, lambda_away)

    squad_h = squad_availability_factor(repo, match["home_team_id"])
    squad_a = squad_availability_factor(repo, match["away_team_id"])
    p2_home, p2_draw, p2_away = prob_1x2(lambda_home * squad_h, lambda_away * squad_a)

    rest_h = fatigue_factor(repo, match["home_team_id"], match["match_date"])
    rest_a = fatigue_factor(repo, match["away_team_id"], match["match_date"])
    p3_home, p3_draw, p3_away = prob_1x2(lambda_home * rest_h, lambda_away * rest_a)

    ctx = contextual_factor(repo, match["id"], match.get("referee_id"), season, "goals")
    p4_home, p4_draw, p4_away = prob_1x2(lambda_home * ctx, lambda_away * ctx)

    rows = []
    for selection, (l1, l2, l3, l4) in {
        "home": (p1_home, p2_home, p3_home, p4_home),
        "draw": (p1_draw, p2_draw, p3_draw, p4_draw),
        "away": (p1_away, p2_away, p3_away, p4_away),
    }.items():
        rows.append({
            "target_team_id": None,
            "target_player_id": None,
            "line_value": None,
            "selection": selection,
            "layer1_performance_xg": l1,
            "layer2_squad_availability": l2,
            "layer3_rest_fatigue": l3,
            "layer4_contextual": l4,
            "composite_probability": _combine_layers(l1, l2, l3, l4),
        })
    return rows


def _combine_layers(p1: float, p2: float, p3: float, p4: float) -> float:
    composite = (
        LAYER_WEIGHTS["layer1"] * p1
        + LAYER_WEIGHTS["layer2"] * p2
        + LAYER_WEIGHTS["layer3"] * p3
        + LAYER_WEIGHTS["layer4"] * p4
    )
    return _clip(composite)


def compute_double_chance_predictions(rows_1x2: list[dict]) -> list[dict]:
    """Deriva 1X / X2 / 12 sumando las probabilidades de los resultados
    simples correspondientes, capa por capa. Es exacto matemáticamente:
    como composite = suma ponderada lineal de las 4 capas, la suma de dos
    composites simples equivale al composite de la suma de esas capas."""
    by_selection = {row["selection"]: row for row in rows_1x2}
    home, draw, away = by_selection["home"], by_selection["draw"], by_selection["away"]

    def sum_rows(a: dict, b: dict, selection: str) -> dict:
        return {
            "target_team_id": None,
            "target_player_id": None,
            "line_value": None,
            "selection": selection,
            "layer1_performance_xg": _clip(a["layer1_performance_xg"] + b["layer1_performance_xg"]),
            "layer2_squad_availability": _clip(a["layer2_squad_availability"] + b["layer2_squad_availability"]),
            "layer3_rest_fatigue": _clip(a["layer3_rest_fatigue"] + b["layer3_rest_fatigue"]),
            "layer4_contextual": _clip(a["layer4_contextual"] + b["layer4_contextual"]),
            "composite_probability": _clip(a["composite_probability"] + b["composite_probability"]),
        }

    return [
        sum_rows(home, draw, "home_or_draw"),   # 1X
        sum_rows(draw, away, "draw_or_away"),   # X2
        sum_rows(home, away, "home_or_away"),   # 12
    ]


def determine_match_recommendation(rows_1x2: list[dict], rows_double_chance: list[dict]) -> dict:
    """Decide la 'casilla' de quiniela recomendada según los umbrales del
    proyecto: Victoria simple >= 60%, Doble Oportunidad >= 52%."""
    simple_by_selection = {r["selection"]: r["composite_probability"] for r in rows_1x2}
    double_by_selection = {r["selection"]: r["composite_probability"] for r in rows_double_chance}

    best_simple_selection = max(simple_by_selection, key=simple_by_selection.get)
    best_simple_prob = simple_by_selection[best_simple_selection]

    best_double_selection = max(double_by_selection, key=double_by_selection.get)
    best_double_prob = double_by_selection[best_double_selection]

    if best_simple_prob >= THRESHOLD_SIMPLE_WIN:
        pick = SIMPLE_SELECTION_LABELS[best_simple_selection]
        tier = "victoria_simple"
        probability = best_simple_prob
    elif best_double_prob >= THRESHOLD_DOUBLE_CHANCE_MIN:
        pick = DOUBLE_CHANCE_SELECTION_LABELS[best_double_selection]
        tier = "doble_oportunidad"
        probability = best_double_prob
    else:
        pick = None
        tier = "sin_recomendacion"
        probability = None

    return {
        "recommended_pick": pick,
        "recommendation_tier": tier,
        "recommended_probability": probability,
        "prob_home": simple_by_selection["home"],
        "prob_draw": simple_by_selection["draw"],
        "prob_away": simple_by_selection["away"],
        "prob_double_1x": double_by_selection["home_or_draw"],
        "prob_double_x2": double_by_selection["draw_or_away"],
        "prob_double_12": double_by_selection["home_or_away"],
    }


# ----------------------------------------------------------------------------
# Value alerts (best-effort: requiere que bookmaker_odds ya tenga datos)
# ----------------------------------------------------------------------------


def maybe_create_value_alerts(repo: SupabaseRepository, prediction_row: dict, match_id: str, market_id: str) -> None:
    odds_rows = repo.get_bookmaker_odds(match_id, market_id)
    if not odds_rows:
        return  # sin cuotas ingeridas todavía para este mercado; no hay nada que comparar

    for odds in odds_rows:
        if odds["selection"] != prediction_row["selection"]:
            continue
        if odds.get("line_value") is not None and prediction_row.get("line_value") is not None:
            if abs(odds["line_value"] - prediction_row["line_value"]) > 0.01:
                continue  # misma selección pero línea distinta, no son comparables

        market_odds = odds["odds_decimal"]
        implied_prob = 1 / market_odds if market_odds else None
        if not implied_prob:
            continue

        model_prob = prediction_row["composite_probability"]
        edge_pct = ((model_prob - implied_prob) / implied_prob) * 100

        if edge_pct >= 15:
            level = "premium"
        elif edge_pct >= 10:
            level = "high"
        elif edge_pct >= 5:
            level = "medium"
        else:
            continue  # edge insuficiente, no se genera alerta

        repo.insert_value_alert({
            "prediction_id": prediction_row["id"],
            "bookmaker_odds_id": odds["id"],
            "match_id": match_id,
            "market_id": market_id,
            "model_probability": model_prob,
            "market_odds": market_odds,
            "value_edge_pct": round(edge_pct, 2),
            "alert_level": level,
        })
        log.info("Value alert (%s, edge %.1f%%) creada para partido %s.", level, edge_pct, match_id)


# ----------------------------------------------------------------------------
# Orquestación
# ----------------------------------------------------------------------------


def run(season: int, league_api_id: int, hours_ahead: int, only_date: Optional[str], run_type: str) -> None:
    repo = SupabaseRepository(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    league_id = repo.get_league_uuid(league_api_id)
    if not league_id:
        raise RuntimeError(f"Liga con api_football_id={league_api_id} no encontrada en Supabase. ¿Corriste ingest_laliga.py?")

    log.info("Cargando dataset histórico de la temporada %s...", season)
    finished_matches = repo.load_finished_matches(league_id, season)
    match_stats = repo.load_match_stats_for_matches([m["id"] for m in finished_matches])
    dataset = SeasonDataset(finished_matches, match_stats)
    log.info("Dataset cargado: %s partidos finalizados, %s filas de estadísticas.", len(finished_matches), len(match_stats))

    upcoming_matches = repo.get_upcoming_matches(league_id, season, hours_ahead, only_date)
    log.info("%s partido(s) próximos a predecir.", len(upcoming_matches))

    if not upcoming_matches:
        log.info("Nada que predecir en esta corrida.")
        return

    model_run_id = repo.create_model_run(run_type)
    predictions_generated = 0

    market_id_cache: dict[str, Optional[str]] = {}

    def market_id_for(code: str) -> Optional[str]:
        if code not in market_id_cache:
            market_id_cache[code] = repo.get_market_id(code)
            if not market_id_cache[code]:
                log.warning("Mercado '%s' no existe en la tabla markets. Se omite.", code)
        return market_id_cache[code]

    try:
        for match in upcoming_matches:
            log.info("Procesando partido %s (%s)...", match["id"], match["match_date"])

            # -- 1X2 --
            rows_1x2 = compute_1x2_prediction(repo, dataset, match, season)
            market_id_1x2 = market_id_for("1X2")
            if market_id_1x2:
                for pred in rows_1x2:
                    row = {**pred, "model_run_id": model_run_id, "match_id": match["id"], "market_id": market_id_1x2}
                    inserted = repo.insert_prediction(row)
                    maybe_create_value_alerts(repo, {**row, "id": inserted["id"]}, match["id"], market_id_1x2)
                    predictions_generated += 1

            # -- Doble Oportunidad (1X, X2, 12) --
            rows_double_chance = compute_double_chance_predictions(rows_1x2)
            market_id_double = market_id_for("DOUBLE_CHANCE")
            if market_id_double:
                for pred in rows_double_chance:
                    row = {**pred, "model_run_id": model_run_id, "match_id": match["id"], "market_id": market_id_double}
                    inserted = repo.insert_prediction(row)
                    maybe_create_value_alerts(repo, {**row, "id": inserted["id"]}, match["id"], market_id_double)
                    predictions_generated += 1

            # -- Recomendación de quiniela (resumen a nivel de partido) --
            recommendation = determine_match_recommendation(rows_1x2, rows_double_chance)
            repo.insert_match_recommendation({
                **recommendation,
                "match_id": match["id"],
                "model_run_id": model_run_id,
            })
            log.info(
                "Recomendación para partido %s: %s (%s, %s)",
                match["id"], recommendation["recommended_pick"] or "—",
                recommendation["recommendation_tier"],
                f"{recommendation['recommended_probability']:.1%}" if recommendation["recommended_probability"] else "n/a",
            )

            # -- Mercados por equipo (local y visitante) --
            for market_code, (stat_key, default_line) in TEAM_MARKETS.items():
                market_id = market_id_for(market_code)
                if not market_id:
                    continue
                for team_id, opponent_id, is_home in (
                    (match["home_team_id"], match["away_team_id"], True),
                    (match["away_team_id"], match["home_team_id"], False),
                ):
                    pred = compute_team_market_prediction(
                        repo, dataset, match, team_id, opponent_id, is_home, stat_key, default_line, season
                    )
                    row = {**pred, "model_run_id": model_run_id, "match_id": match["id"], "market_id": market_id}
                    inserted = repo.insert_prediction(row)
                    maybe_create_value_alerts(repo, {**row, "id": inserted["id"]}, match["id"], market_id)
                    predictions_generated += 1

            # -- Mercados de partido (total) --
            for market_code, (stat_key, default_line) in MATCH_MARKETS.items():
                market_id = market_id_for(market_code)
                if not market_id:
                    continue
                pred = compute_match_market_prediction(repo, dataset, match, stat_key, default_line, season)
                row = {**pred, "model_run_id": model_run_id, "match_id": match["id"], "market_id": market_id}
                inserted = repo.insert_prediction(row)
                maybe_create_value_alerts(repo, {**row, "id": inserted["id"]}, match["id"], market_id)
                predictions_generated += 1

        repo.finish_model_run(model_run_id, len(upcoming_matches), predictions_generated, status="completed")
        log.info("Corrida completada: %s predicciones generadas para %s partidos.", predictions_generated, len(upcoming_matches))

    except Exception:
        repo.finish_model_run(model_run_id, len(upcoming_matches), predictions_generated, status="failed")
        raise


# ----------------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Motor del modelo de 4 capas — PitchLogic Analytics")
    parser.add_argument("--season", type=int, default=DEFAULT_SEASON, help=f"Temporada (default {DEFAULT_SEASON})")
    parser.add_argument("--league", type=int, default=DEFAULT_LEAGUE_API_ID, help="ID de liga en API-Football (default LaLiga)")
    parser.add_argument("--hours-ahead", type=int, default=72, help="Ventana de partidos próximos a predecir, en horas (default 72)")
    parser.add_argument("--date", type=str, help="Predecir solo una fecha concreta (YYYY-MM-DD), en vez de usar --hours-ahead")
    parser.add_argument(
        "--run-type", type=str, default="manual",
        choices=["scheduled_daily", "scheduled_intraday", "pre_match_lineup_confirmed", "manual"],
        help="Tipo de corrida, se guarda en model_runs para trazabilidad",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    run(args.season, args.league, args.hours_ahead, args.date, args.run_type)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log.exception("Fallo fatal en el motor de predicciones.")
        sys.exit(1)
