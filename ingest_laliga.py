"""
PitchLogic Analytics — Ingesta LaLiga: API-Football → Supabase
============================================================================
Sincroniza, en este orden (por dependencias de claves foráneas):
    1. Liga                                  (leagues)
    2. Equipos                                (teams)
    3. Partidos / calendario                   (matches)
    4. Estadísticas de rendimiento base         (match_stats)
       -> remates, remates a puerta, córners, faltas, tarjetas, posesión, xG
    5. Jugadores + player_importance_score      (players)

Diseñado para correr como job programado (cron / GitHub Actions / Supabase
Edge Function invocando este script vía un runner). Es idempotente: puede
ejecutarse varias veces sin duplicar filas (usa upsert sobre `api_football_id`
o `(match_id, team_id)` según la tabla).

Variables de entorno requeridas (usa un archivo .env en local):
    API_FOOTBALL_KEY            -> tu clave de api-football.com (host v3.football.api-sports.io)
    SUPABASE_URL                 -> https://<tu-proyecto>.supabase.co
    SUPABASE_SERVICE_ROLE_KEY    -> service_role key (NUNCA la anon key aquí)

Uso:
    # Todo el pipeline para LaLiga (id 140), temporada 2025, calendario -2/+7 días
    python ingest_laliga.py --season 2025

    # Solo una fecha concreta
    python ingest_laliga.py --season 2025 --date 2026-09-20

    # Saltar jugadores (ej. en la corrida intradía, si solo quieres refrescar partidos)
    python ingest_laliga.py --season 2025 --skip-players

Nota importante sobre nombres de campos de la API:
    Los "type" que devuelve /fixtures/statistics (ej. "Shots on Goal",
    "Corner Kicks", "expected_goals") y la forma de /players corresponden a la
    documentación pública de API-Football v3 en el momento de escribir este
    script. Antes de la primera corrida en producción, verifica un par de
    respuestas reales de tu cuenta contra
    https://www.api-football.com/documentation-v3 — cualquier "type" no
    reconocido queda registrado en el log en vez de fallar en silencio.
============================================================================
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from datetime import date, timedelta
from typing import Any, Optional

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
log = logging.getLogger("pitchlogic.ingest_laliga")

API_FOOTBALL_KEY = os.environ.get("API_FOOTBALL_KEY")
API_FOOTBALL_HOST = "v3.football.api-sports.io"
API_FOOTBALL_BASE_URL = f"https://{API_FOOTBALL_HOST}"

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

LALIGA_LEAGUE_ID = 140  # API-Football: LaLiga (España)

REQUEST_TIMEOUT_SECONDS = 20
MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = 5

FINISHED_STATUSES = {"FT", "AET", "PEN"}  # short_status de API-Football para "terminado"

# Mapeo de los "type" de /fixtures/statistics -> columnas de match_stats.
STAT_TYPE_MAP = {
    "Shots on Goal": "shots_on_target",
    "Shots off Goal": "shots_off_target",
    "Total Shots": "shots_total",
    "Blocked Shots": "shots_blocked",
    "Corner Kicks": "corners",
    "Fouls": "fouls_committed",
    "Yellow Cards": "yellow_cards",
    "Red Cards": "red_cards",
    "Ball Possession": "possession_pct",
    "expected_goals": "xg",
}

# Pesos del cálculo de player_importance_score (ver docstring / mensaje al usuario)
IMPORTANCE_WEIGHT_MINUTES_SHARE = 0.45
IMPORTANCE_WEIGHT_STARTER_SHARE = 0.20
IMPORTANCE_WEIGHT_GOAL_CONTRIBUTION = 0.20
IMPORTANCE_WEIGHT_RATING = 0.15


# ----------------------------------------------------------------------------
# Cliente de API-Football
# ----------------------------------------------------------------------------


class ApiFootballClient:
    """Wrapper fino sobre requests con reintentos y respeto al rate limit."""

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
                    log.warning("API-Football devolvió errores en %s: %s", path, errors)

                remaining = response.headers.get("x-ratelimit-requests-remaining")
                if remaining is not None and int(remaining) < 5:
                    log.warning("Quedan solo %s requests disponibles hoy.", remaining)

                return payload

            except requests.RequestException as exc:
                last_error = exc
                wait = RETRY_BACKOFF_SECONDS * attempt
                log.warning(
                    "Error de red en %s (intento %s/%s): %s. Reintentando en %ss...",
                    path, attempt, MAX_RETRIES, exc, wait,
                )
                time.sleep(wait)

        raise RuntimeError(f"Fallaron todos los reintentos para {path}") from last_error

    def get_league(self, league_id: int, season: int) -> list[dict]:
        data = self.get("/leagues", {"id": league_id, "season": season})
        return data.get("response", [])

    def get_teams(self, league_id: int, season: int) -> list[dict]:
        data = self.get("/teams", {"league": league_id, "season": season})
        return data.get("response", [])

    def get_fixtures(self, league_id: int, season: int, date_str: str) -> list[dict]:
        data = self.get("/fixtures", {"league": league_id, "season": season, "date": date_str})
        return data.get("response", [])

    def get_fixture_statistics(self, fixture_id: int) -> list[dict]:
        data = self.get("/fixtures/statistics", {"fixture": fixture_id})
        return data.get("response", [])

    def get_players_page(self, team_id: int, season: int, page: int) -> dict:
        return self.get("/players", {"team": team_id, "season": season, "page": page})


# ----------------------------------------------------------------------------
# Repositorio Supabase
# ----------------------------------------------------------------------------


class SupabaseRepository:
    """Encapsula todas las lecturas/escrituras hacia Supabase para este pipeline."""

    def __init__(self, url: str, service_key: str):
        if not url or not service_key:
            raise ValueError(
                "Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en las variables de entorno."
            )
        self.client: Client = create_client(url, service_key)
        self._team_id_cache: dict[int, str] = {}  # api_football_id -> uuid interno

    # -- Leagues --------------------------------------------------------

    def upsert_league(self, league_payload: dict) -> str:
        info = league_payload["league"]
        seasons = league_payload.get("seasons", [])
        current_season = next(
            (s["year"] for s in seasons if s.get("current")),
            seasons[-1]["year"] if seasons else None,
        )
        row = {
            "api_football_id": info["id"],
            "name": info["name"],
            "country": league_payload.get("country", {}).get("name"),
            "logo_url": info.get("logo"),
            "current_season": current_season,
        }
        result = self.client.table("leagues").upsert(row, on_conflict="api_football_id").execute()
        return result.data[0]["id"]

    # -- Teams ------------------------------------------------------------

    def upsert_team(self, team_payload: dict, league_id: str) -> str:
        info = team_payload["team"]
        venue = team_payload.get("venue", {})
        row = {
            "api_football_id": info["id"],
            "league_id": league_id,
            "name": info["name"],
            "short_name": info.get("code"),
            "logo_url": info.get("logo"),
            "stadium_name": venue.get("name"),
            "founded": info.get("founded"),
        }
        result = self.client.table("teams").upsert(row, on_conflict="api_football_id").execute()
        team_id = result.data[0]["id"]
        self._team_id_cache[info["id"]] = team_id
        return team_id

    def get_team_uuid(self, api_football_team_id: int) -> Optional[str]:
        if api_football_team_id in self._team_id_cache:
            return self._team_id_cache[api_football_team_id]

        result = (
            self.client.table("teams")
            .select("id")
            .eq("api_football_id", api_football_team_id)
            .limit(1)
            .execute()
        )
        if not result.data:
            log.warning(
                "Equipo con api_football_id=%s no existe en Supabase todavía.",
                api_football_team_id,
            )
            return None

        team_id = result.data[0]["id"]
        self._team_id_cache[api_football_team_id] = team_id
        return team_id

    # -- Matches ------------------------------------------------------------

    def upsert_match(self, fixture_payload: dict, league_id: str) -> Optional[dict]:
        fixture = fixture_payload["fixture"]
        teams = fixture_payload["teams"]
        goals = fixture_payload["goals"]
        score = fixture_payload["score"]
        venue = fixture.get("venue", {})

        home_team_id = self.get_team_uuid(teams["home"]["id"])
        away_team_id = self.get_team_uuid(teams["away"]["id"])
        if not home_team_id or not away_team_id:
            log.warning(
                "Salto fixture %s: falta mapear equipo local/visitante en Supabase.",
                fixture["id"],
            )
            return None

        row = {
            "api_football_id": fixture["id"],
            "league_id": league_id,
            "season": fixture_payload["league"]["season"],
            "round": fixture_payload["league"].get("round"),
            "match_date": fixture["date"],
            "status": _map_match_status(fixture["status"]["short"]),
            "home_team_id": home_team_id,
            "away_team_id": away_team_id,
            "venue_name": venue.get("name"),
            "home_score": goals.get("home"),
            "away_score": goals.get("away"),
            "ht_home_score": score.get("halftime", {}).get("home"),
            "ht_away_score": score.get("halftime", {}).get("away"),
        }
        result = self.client.table("matches").upsert(row, on_conflict="api_football_id").execute()
        match_row = result.data[0]
        match_row["_is_finished"] = fixture["status"]["short"] in FINISHED_STATUSES
        match_row["_home_team_uuid"] = home_team_id
        match_row["_away_team_uuid"] = away_team_id
        return match_row

    # -- Match stats --------------------------------------------------------

    def upsert_match_stats(self, match_id: str, team_id: str, is_home: bool, stats: list[dict]) -> None:
        row: dict[str, Any] = {"match_id": match_id, "team_id": team_id, "is_home": is_home}

        for stat in stats:
            stat_type = stat.get("type")
            value = stat.get("value")
            column = STAT_TYPE_MAP.get(stat_type)

            if column is None:
                log.debug("Tipo de estadística no mapeado, se ignora: %r", stat_type)
                continue

            row[column] = _clean_stat_value(column, value)

        self.client.table("match_stats").upsert(row, on_conflict="match_id,team_id").execute()

    # -- Players --------------------------------------------------------

    def count_team_finished_matches(self, team_uuid: str, season: int) -> int:
        """Partidos ya finalizados del equipo en la temporada, según lo que
        ya tenemos sincronizado en `matches`. Se usa como base para calcular
        el % de minutos jugados de cada jugador."""
        result = (
            self.client.table("matches")
            .select("id", count="exact")
            .eq("season", season)
            .eq("status", "finished")
            .or_(f"home_team_id.eq.{team_uuid},away_team_id.eq.{team_uuid}")
            .execute()
        )
        return result.count or 0

    def upsert_player(self, player_payload: dict, team_uuid: str, importance_score: float) -> None:
        info = player_payload["player"]
        row = {
            "api_football_id": info["id"],
            "team_id": team_uuid,
            "name": info["name"],
            "position": _extract_primary_position(player_payload),
            "birth_date": info.get("birth", {}).get("date"),
            "nationality": info.get("nationality"),
            "height_cm": _parse_measurement(info.get("height")),
            "weight_kg": _parse_measurement(info.get("weight")),
            "photo_url": info.get("photo"),
            "player_importance_score": round(importance_score, 2),
            "importance_score_updated_at": "now()",
        }
        self.client.table("players").upsert(row, on_conflict="api_football_id").execute()


# ----------------------------------------------------------------------------
# Helpers de transformación
# ----------------------------------------------------------------------------


def _map_match_status(short_status: str) -> str:
    mapping = {
        "NS": "scheduled", "TBD": "scheduled",
        "1H": "live", "HT": "live", "2H": "live", "ET": "live", "P": "live",
        "FT": "finished", "AET": "finished", "PEN": "finished",
        "PST": "postponed",
        "CANC": "cancelled", "ABD": "cancelled",
        "AWD": "finished", "WO": "finished",
    }
    return mapping.get(short_status, "scheduled")


def _clean_stat_value(column: str, raw_value: Any) -> Optional[float]:
    if raw_value is None:
        return None
    if isinstance(raw_value, str):
        cleaned = raw_value.replace("%", "").strip()
        if cleaned in ("", "-"):
            return None
        try:
            return float(cleaned)
        except ValueError:
            log.debug("No se pudo convertir el valor de %s: %r", column, raw_value)
            return None
    return raw_value


def _parse_measurement(raw_value: Optional[str]) -> Optional[int]:
    """API-Football devuelve altura/peso como '184 cm' / '78 kg'."""
    if not raw_value:
        return None
    digits = "".join(ch for ch in raw_value if ch.isdigit())
    return int(digits) if digits else None


def _extract_primary_position(player_payload: dict) -> Optional[str]:
    stats_entries = player_payload.get("statistics", [])
    if stats_entries:
        return stats_entries[0].get("games", {}).get("position")
    return None


def compute_player_importance_score(stats_entry: dict, team_matches_played: int) -> float:
    """Calcula el player_importance_score (0-100) para la Capa 2.

    Heurística v1 (documentada también en el mensaje al usuario):
        45% minutos jugados / minutos totales disponibles del equipo
        20% % de partidos como titular sobre partidos disputados
        20% contribución goleadora (goles+asistencias por 90, cap en 1.0)
        15% rating medio de API-Football normalizado (escala 6-9 -> 0-1)

    No distingue por posición todavía: un central defensivo sólido puntuará
    más bajo en el componente de "contribución goleadora" que un delantero
    aunque su importancia real para el equipo sea similar o mayor. Es un
    punto de mejora natural para v2 (pesos distintos por posición).
    """
    games = stats_entry.get("games", {}) or {}
    goals = stats_entry.get("goals", {}) or {}

    minutes = games.get("minutes") or 0
    appearences = games.get("appearences") or 0
    lineups = games.get("lineups") or 0
    rating_raw = games.get("rating")

    total_team_minutes = max(team_matches_played, 1) * 90
    minutes_share = min(minutes / total_team_minutes, 1.0)

    starter_share = (lineups / appearences) if appearences > 0 else 0.0

    goals_total = goals.get("total") or 0
    assists_total = goals.get("assists") or 0
    goal_contribution_per90 = (
        ((goals_total + assists_total) / (minutes / 90)) if minutes > 0 else 0.0
    )
    goal_contribution_norm = min(goal_contribution_per90, 1.0)

    if rating_raw:
        try:
            rating = float(rating_raw)
            rating_norm = min(max((rating - 6.0) / 3.0, 0.0), 1.0)
        except (TypeError, ValueError):
            rating_norm = 0.5  # neutral si el dato viene corrupto
    else:
        rating_norm = 0.5  # neutral si aún no hay rating disponible

    score = 100 * (
        IMPORTANCE_WEIGHT_MINUTES_SHARE * minutes_share
        + IMPORTANCE_WEIGHT_STARTER_SHARE * starter_share
        + IMPORTANCE_WEIGHT_GOAL_CONTRIBUTION * goal_contribution_norm
        + IMPORTANCE_WEIGHT_RATING * rating_norm
    )
    return min(max(score, 0.0), 100.0)


# ----------------------------------------------------------------------------
# Orquestación del pipeline
# ----------------------------------------------------------------------------


def sync_league_and_teams(
    api: ApiFootballClient, repo: SupabaseRepository, league_api_id: int, season: int
) -> tuple[str, list[dict]]:
    log.info("Sincronizando liga %s (temporada %s)...", league_api_id, season)
    leagues = api.get_league(league_api_id, season)
    if not leagues:
        raise RuntimeError(f"API-Football no devolvió datos para league={league_api_id} season={season}")

    league_id = repo.upsert_league(leagues[0])
    log.info("Liga sincronizada (uuid=%s).", league_id)

    teams = api.get_teams(league_api_id, season)
    log.info("Sincronizando %s equipos...", len(teams))
    for team_payload in teams:
        repo.upsert_team(team_payload, league_id)

    return league_id, teams


def sync_fixtures_and_stats_for_date(
    api: ApiFootballClient,
    repo: SupabaseRepository,
    league_api_id: int,
    season: int,
    league_id: str,
    date_str: str,
) -> None:
    fixtures = api.get_fixtures(league_api_id, season, date_str)
    if not fixtures:
        log.info("Sin partidos para %s.", date_str)
        return

    log.info("%s partido(s) encontrados para %s.", len(fixtures), date_str)

    for fixture_payload in fixtures:
        match_row = repo.upsert_match(fixture_payload, league_id)
        if not match_row:
            continue

        fixture_id = fixture_payload["fixture"]["id"]

        if not match_row["_is_finished"]:
            log.debug("Fixture %s aún no finalizado, se omiten estadísticas.", fixture_id)
            continue

        stats_response = api.get_fixture_statistics(fixture_id)
        if not stats_response:
            log.debug("Sin estadísticas disponibles todavía para fixture %s.", fixture_id)
            continue

        for team_stats in stats_response:
            team_api_id = team_stats["team"]["id"]
            is_home = team_api_id == fixture_payload["teams"]["home"]["id"]
            team_uuid = match_row["_home_team_uuid"] if is_home else match_row["_away_team_uuid"]

            repo.upsert_match_stats(
                match_id=match_row["id"],
                team_id=team_uuid,
                is_home=is_home,
                stats=team_stats.get("statistics", []),
            )

        log.info("Estadísticas guardadas para fixture %s.", fixture_id)


def sync_players_for_team(
    api: ApiFootballClient, repo: SupabaseRepository, team_api_id: int, team_uuid: str, season: int
) -> None:
    team_matches_played = repo.count_team_finished_matches(team_uuid, season)

    page = 1
    total_pages = 1
    players_synced = 0

    while page <= total_pages:
        data = api.get_players_page(team_api_id, season, page)
        total_pages = data.get("paging", {}).get("total", 1) or 1

        for player_payload in data.get("response", []):
            stats_entries = player_payload.get("statistics", [])
            # Un jugador puede tener stats de varios equipos si fue transferido
            # en la temporada; nos quedamos con la entrada de ESTE equipo.
            team_entry = next(
                (s for s in stats_entries if s.get("team", {}).get("id") == team_api_id),
                stats_entries[0] if stats_entries else {},
            )

            importance_score = compute_player_importance_score(team_entry, team_matches_played)
            repo.upsert_player(player_payload, team_uuid, importance_score)
            players_synced += 1

        page += 1

    log.info("Jugadores sincronizados para equipo (api_id=%s): %s", team_api_id, players_synced)


def daterange(days_back: int, days_forward: int) -> list[str]:
    today = date.today()
    start = today - timedelta(days=days_back)
    end = today + timedelta(days=days_forward)
    days = (end - start).days
    return [(start + timedelta(days=i)).isoformat() for i in range(days + 1)]


# ----------------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ingesta de LaLiga (API-Football) hacia Supabase — PitchLogic Analytics"
    )
    parser.add_argument("--season", type=int, required=True, help="Temporada (ej. 2025)")
    parser.add_argument(
        "--league", type=int, default=LALIGA_LEAGUE_ID,
        help=f"ID de liga en API-Football (default {LALIGA_LEAGUE_ID} = LaLiga)",
    )
    parser.add_argument("--date", type=str, help="Sincronizar solo una fecha concreta (YYYY-MM-DD)")
    parser.add_argument("--days-back", type=int, default=2, help="Días hacia atrás a sincronizar (default 2)")
    parser.add_argument("--days-forward", type=int, default=7, help="Días hacia adelante a sincronizar (default 7)")
    parser.add_argument("--skip-players", action="store_true", help="Omitir la sincronización de jugadores")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    api = ApiFootballClient(API_FOOTBALL_KEY)
    repo = SupabaseRepository(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    league_id, teams = sync_league_and_teams(api, repo, args.league, args.season)

    dates = [args.date] if args.date else daterange(args.days_back, args.days_forward)
    for date_str in dates:
        try:
            sync_fixtures_and_stats_for_date(api, repo, args.league, args.season, league_id, date_str)
        except Exception:
            log.exception("Error sincronizando fecha %s. Se continúa con la siguiente.", date_str)

    if not args.skip_players:
        log.info("Sincronizando jugadores y player_importance_score...")
        for team_payload in teams:
            team_api_id = team_payload["team"]["id"]
            team_uuid = repo.get_team_uuid(team_api_id)
            if not team_uuid:
                continue
            try:
                sync_players_for_team(api, repo, team_api_id, team_uuid, args.season)
            except Exception:
                log.exception("Error sincronizando jugadores del equipo api_id=%s.", team_api_id)
    else:
        log.info("Sincronización de jugadores omitida (--skip-players).")

    log.info("Ingesta de LaLiga completada.")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log.exception("Fallo fatal en la ingesta.")
        sys.exit(1)
