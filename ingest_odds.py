"""
PitchLogic Analytics — Ingesta de cuotas (API-Football /odds) → Supabase
============================================================================
Puebla `bookmaker_odds` con las cuotas disponibles para los próximos partidos,
cerrando el círculo del sistema: `calculate_predictions.py` ya compara
automáticamente `composite_probability` contra estas cuotas (función
`maybe_create_value_alerts`) y genera `value_alerts` cuando encuentra edge.

Cobertura real de mercados (limitación de la propia API, no del script):
    - 1X2                    (bet "Match Winner")
    - Doble Oportunidad       (bet "Double Chance")
    - Goles totales Over/Under (bet "Goals Over/Under")

Remates / córners / tarjetas / faltas NO tienen cuotas disponibles vía
API-Football (ni la mayoría de APIs de cuotas estándar) — para esos mercados
`value_alerts` seguirá sin generarse, lo cual es el comportamiento esperado,
no un error. El `composite_probability` del modelo para esos mercados sigue
siendo válido igualmente, solo no hay cuota de mercado con la que compararlo.

IMPORTANTE: el endpoint /odds de API-Football normalmente requiere un plan
de pago (no incluido en el free tier). Verifícalo en tu cuenta antes de la
primera corrida — si no tienes acceso, la API devuelve una respuesta vacía
o un error, que este script registra en el log sin fallar el resto del job.

Variables de entorno requeridas:
    API_FOOTBALL_KEY
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY

Uso:
    python ingest_odds.py --season 2026 --hours-ahead 72
    python ingest_odds.py --season 2026 --date 2026-09-20 --bookmaker-id 8
============================================================================
"""

from __future__ import annotations

import argparse
import logging
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests
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
log = logging.getLogger("pitchlogic.ingest_odds")

API_FOOTBALL_KEY = os.environ.get("API_FOOTBALL_KEY")
API_FOOTBALL_HOST = "v3.football.api-sports.io"
API_FOOTBALL_BASE_URL = f"https://{API_FOOTBALL_HOST}"

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

DEFAULT_SEASON = 2026
DEFAULT_LEAGUE_API_ID = 140  # LaLiga

REQUEST_TIMEOUT_SECONDS = 20
MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = 5

# Nombres de "bet" tal como los devuelve API-Football (verificar contra una
# respuesta real de tu cuenta antes de producción: pueden variar según plan).
BET_NAME_1X2 = "Match Winner"
BET_NAME_DOUBLE_CHANCE = "Double Chance"
BET_NAME_GOALS_OU = "Goals Over/Under"

MATCH_WINNER_VALUE_MAP = {"Home": "home", "Draw": "draw", "Away": "away"}
DOUBLE_CHANCE_VALUE_MAP = {
    "Home/Draw": "home_or_draw",
    "Draw/Away": "draw_or_away",
    "Home/Away": "home_or_away",
}
OVER_UNDER_PATTERN = re.compile(r"(Over|Under)\s+([\d.]+)")


# ----------------------------------------------------------------------------
# Cliente de API-Football
# ----------------------------------------------------------------------------


class ApiFootballClient:
    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("Falta API_FOOTBALL_KEY en las variables de entorno.")
        self.session = requests.Session()
        self.session.headers.update({"x-apisports-key": api_key})

    def get(self, path: str, params: Optional[dict] = None) -> dict:
        url = f"{API_FOOTBALL_BASE_URL}{path}"
        last_error: Optional[Exception] = None

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                response = self.session.get(url, params=params, timeout=REQUEST_TIMEOUT_SECONDS)

                if response.status_code == 429:
                    wait = RETRY_BACKOFF_SECONDS * attempt
                    log.warning("Rate limit alcanzado en %s. Esperando %ss...", path, wait)
                    time.sleep(wait)
                    continue

                response.raise_for_status()
                payload = response.json()

                errors = payload.get("errors")
                if errors:
                    # Suele indicar "plan sin acceso a odds" — se registra y se continúa sin romper el job.
                    log.warning("API-Football devolvió errores en %s: %s", path, errors)

                return payload

            except requests.RequestException as exc:
                last_error = exc
                wait = RETRY_BACKOFF_SECONDS * attempt
                log.warning(
                    "Error de red en %s (intento %s/%s): %s. Reintentando en %ss...",
                    path, attempt, MAX_RETRIES, exc, wait,
                )
                time.sleep(wait)

        log.error("Fallaron todos los reintentos para %s: %s", path, last_error)
        return {}

    def get_odds_for_fixture(self, fixture_id: int, bookmaker_id: Optional[int] = None) -> list[dict]:
        params: dict = {"fixture": fixture_id}
        if bookmaker_id:
            params["bookmaker"] = bookmaker_id
        data = self.get("/odds", params)
        return data.get("response", [])


# ----------------------------------------------------------------------------
# Repositorio Supabase
# ----------------------------------------------------------------------------


class SupabaseRepository:
    def __init__(self, url: str, service_key: str):
        if not url or not service_key:
            raise ValueError("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en las variables de entorno.")
        self.client: Client = create_client(url, service_key)
        self._market_id_cache: dict[str, Optional[str]] = {}

    def get_league_uuid(self, api_football_league_id: int) -> Optional[str]:
        result = (
            self.client.table("leagues")
            .select("id")
            .eq("api_football_id", api_football_league_id)
            .limit(1)
            .execute()
        )
        return result.data[0]["id"] if result.data else None

    def get_upcoming_matches(self, league_id: str, season: int, hours_ahead: int, only_date: Optional[str]) -> list[dict]:
        query = (
            self.client.table("matches")
            .select("id, api_football_id, match_date")
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

    def get_market_id(self, code: str) -> Optional[str]:
        if code not in self._market_id_cache:
            result = self.client.table("markets").select("id").eq("code", code).limit(1).execute()
            self._market_id_cache[code] = result.data[0]["id"] if result.data else None
            if not self._market_id_cache[code]:
                log.warning("Mercado '%s' no existe en la tabla markets. Se omiten sus cuotas.", code)
        return self._market_id_cache[code]

    def insert_odds_rows(self, rows: list[dict]) -> None:
        if not rows:
            return
        self.client.table("bookmaker_odds").insert(rows).execute()


# ----------------------------------------------------------------------------
# Parseo de la respuesta de /odds -> filas de bookmaker_odds
# ----------------------------------------------------------------------------


def parse_odds_response(
    odds_response: list[dict], match_id: str, market_ids: dict[str, Optional[str]]
) -> list[dict]:
    rows: list[dict] = []
    if not odds_response:
        return rows

    bookmakers = odds_response[0].get("bookmakers", [])

    for bookmaker in bookmakers:
        bookmaker_name = bookmaker.get("name", "unknown")

        for bet in bookmaker.get("bets", []):
            bet_name = bet.get("name")

            if bet_name == BET_NAME_1X2 and market_ids.get("1X2"):
                for value in bet.get("values", []):
                    selection = MATCH_WINNER_VALUE_MAP.get(value.get("value"))
                    odd = _parse_odd(value.get("odd"))
                    if selection and odd:
                        rows.append(_build_row(match_id, market_ids["1X2"], selection, None, odd, bookmaker_name))

            elif bet_name == BET_NAME_DOUBLE_CHANCE and market_ids.get("DOUBLE_CHANCE"):
                for value in bet.get("values", []):
                    selection = DOUBLE_CHANCE_VALUE_MAP.get(value.get("value"))
                    odd = _parse_odd(value.get("odd"))
                    if selection and odd:
                        rows.append(_build_row(match_id, market_ids["DOUBLE_CHANCE"], selection, None, odd, bookmaker_name))

            elif bet_name == BET_NAME_GOALS_OU and market_ids.get("MATCH_GOALS_OU"):
                for value in bet.get("values", []):
                    match_ou = OVER_UNDER_PATTERN.match(value.get("value", ""))
                    odd = _parse_odd(value.get("odd"))
                    if match_ou and odd:
                        selection = "over" if match_ou.group(1) == "Over" else "under"
                        line = float(match_ou.group(2))
                        rows.append(_build_row(match_id, market_ids["MATCH_GOALS_OU"], selection, line, odd, bookmaker_name))

            else:
                log.debug("Bet no mapeado, se ignora: %r (bookmaker=%s)", bet_name, bookmaker_name)

    return rows


def _parse_odd(raw_odd) -> Optional[float]:
    try:
        return float(raw_odd)
    except (TypeError, ValueError):
        return None


def _build_row(match_id: str, market_id: str, selection: str, line: Optional[float], odd: float, bookmaker: str) -> dict:
    return {
        "match_id": match_id,
        "market_id": market_id,
        "target_team_id": None,
        "target_player_id": None,
        "line_value": line,
        "selection": selection,
        "odds_decimal": odd,
        "bookmaker": bookmaker,
    }


# ----------------------------------------------------------------------------
# Orquestación
# ----------------------------------------------------------------------------


def run(season: int, league_api_id: int, hours_ahead: int, only_date: Optional[str], bookmaker_id: Optional[int]) -> None:
    api = ApiFootballClient(API_FOOTBALL_KEY)
    repo = SupabaseRepository(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    league_id = repo.get_league_uuid(league_api_id)
    if not league_id:
        raise RuntimeError(f"Liga con api_football_id={league_api_id} no encontrada en Supabase.")

    market_ids = {
        "1X2": repo.get_market_id("1X2"),
        "DOUBLE_CHANCE": repo.get_market_id("DOUBLE_CHANCE"),
        "MATCH_GOALS_OU": repo.get_market_id("MATCH_GOALS_OU"),
    }

    matches = repo.get_upcoming_matches(league_id, season, hours_ahead, only_date)
    log.info("%s partido(s) próximos para buscar cuotas.", len(matches))

    total_rows = 0
    matches_with_odds = 0

    for match in matches:
        odds_response = api.get_odds_for_fixture(match["api_football_id"], bookmaker_id)
        if not odds_response:
            log.info("Sin cuotas disponibles todavía para partido %s (fixture %s).", match["id"], match["api_football_id"])
            continue

        rows = parse_odds_response(odds_response, match["id"], market_ids)
        if rows:
            repo.insert_odds_rows(rows)
            total_rows += len(rows)
            matches_with_odds += 1
            log.info("%s cuotas guardadas para partido %s.", len(rows), match["id"])

    log.info(
        "Ingesta de cuotas completada: %s filas guardadas en %s/%s partidos.",
        total_rows, matches_with_odds, len(matches),
    )


# ----------------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Ingesta de cuotas (API-Football /odds) — PitchLogic Analytics")
    parser.add_argument("--season", type=int, default=DEFAULT_SEASON, help=f"Temporada (default {DEFAULT_SEASON})")
    parser.add_argument("--league", type=int, default=DEFAULT_LEAGUE_API_ID, help="ID de liga en API-Football (default LaLiga)")
    parser.add_argument("--hours-ahead", type=int, default=72, help="Ventana de partidos próximos, en horas (default 72)")
    parser.add_argument("--date", type=str, help="Buscar cuotas solo para una fecha concreta (YYYY-MM-DD)")
    parser.add_argument(
        "--bookmaker-id", type=int, default=None,
        help="Filtrar por un bookmaker específico de API-Football (ej. 8 = Bet365). Por defecto trae todos.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    run(args.season, args.league, args.hours_ahead, args.date, args.bookmaker_id)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log.exception("Fallo fatal en la ingesta de cuotas.")
        sys.exit(1)
