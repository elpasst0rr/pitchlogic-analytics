"""
PitchLogic Analytics — Ingesta de clima (OpenWeatherMap) → Supabase
============================================================================
Alimenta la Capa 4 (factores contextuales) del modelo:
    1. Lee los próximos partidos de `matches` en Supabase.
    2. Resuelve lat/lng del estadio (venue -> equipo -> geocoding, con caché).
    3. Consulta OpenWeatherMap:
         - /data/2.5/forecast  (pronóstico 3h) para partidos a más de ~2h vista
         - /data/2.5/weather   (clima actual)   para partidos a menos de ~2h vista
    4. Guarda temperatura, sensación térmica, humedad, viento y precipitación
       en `weather_snapshots`.

Pensado para correr varias veces al día (cron / GitHub Actions): cada corrida
refina el pronóstico a medida que se acerca el partido, y la corrida "1h
antes" captura condiciones reales en vez de una previsión.

Variables de entorno requeridas:
    OPENWEATHERMAP_API_KEY
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY

Uso:
    # Partidos en las próximas 48h (default)
    python ingest_weather.py

    # Ventana personalizada, ej. toda la próxima semana
    python ingest_weather.py --hours-ahead 168

Limitación conocida de la API gratuita de OpenWeatherMap:
    El endpoint /forecast solo cubre ~5 días (120h) vista, en pasos de 3h.
    Para partidos más lejanos, el script los salta con un log informativo —
    se rellenarán solo en una corrida posterior, cuando ya estén dentro de
    la ventana de pronóstico. No hace falta lógica especial para esto: basta
    con seguir corriendo el script 2-3 veces al día como ya tienes planeado.
============================================================================
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from datetime import datetime, timedelta, timezone
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
log = logging.getLogger("pitchlogic.ingest_weather")

OPENWEATHERMAP_API_KEY = os.environ.get("OPENWEATHERMAP_API_KEY")
OWM_BASE_URL = "https://api.openweathermap.org"

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

REQUEST_TIMEOUT_SECONDS = 15
MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = 5

# Umbral: por debajo de esto, se usa clima ACTUAL en vez de pronóstico.
CURRENT_WEATHER_THRESHOLD_HOURS = 2

# El plan gratuito de OpenWeatherMap solo cubre pronóstico hasta ~5 días vista.
FORECAST_MAX_HOURS = 114  # margen de seguridad bajo las 120h nominales

# País por defecto para geocodificar (proyecto actualmente scopeado a LaLiga).
DEFAULT_COUNTRY_CODE = "ES"


# ----------------------------------------------------------------------------
# Cliente de OpenWeatherMap
# ----------------------------------------------------------------------------


class OpenWeatherMapClient:
    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("Falta OPENWEATHERMAP_API_KEY en las variables de entorno.")
        self.api_key = api_key
        self.session = requests.Session()

    def _get(self, path: str, params: dict) -> Optional[dict]:
        url = f"{OWM_BASE_URL}{path}"
        params = {**params, "appid": self.api_key}
        last_error: Optional[Exception] = None

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                response = self.session.get(url, params=params, timeout=REQUEST_TIMEOUT_SECONDS)

                if response.status_code == 429:
                    wait = RETRY_BACKOFF_SECONDS * attempt
                    log.warning("Rate limit de OpenWeatherMap. Esperando %ss...", wait)
                    time.sleep(wait)
                    continue

                if response.status_code == 404:
                    log.warning("OpenWeatherMap devolvió 404 para %s (params=%s).", path, _redact(params))
                    return None

                response.raise_for_status()
                return response.json()

            except requests.RequestException as exc:
                last_error = exc
                wait = RETRY_BACKOFF_SECONDS * attempt
                log.warning(
                    "Error de red en %s (intento %s/%s): %s. Reintentando en %ss...",
                    path, attempt, MAX_RETRIES, exc, wait,
                )
                time.sleep(wait)

        log.error("Fallaron todos los reintentos para %s: %s", path, last_error)
        return None

    def geocode(self, query: str) -> Optional[tuple[float, float]]:
        data = self._get("/geo/1.0/direct", {"q": query, "limit": 1})
        if not data:
            return None
        return float(data[0]["lat"]), float(data[0]["lon"])

    def get_forecast(self, lat: float, lon: float) -> Optional[dict]:
        return self._get("/data/2.5/forecast", {"lat": lat, "lon": lon, "units": "metric"})

    def get_current_weather(self, lat: float, lon: float) -> Optional[dict]:
        return self._get("/data/2.5/weather", {"lat": lat, "lon": lon, "units": "metric"})


def _redact(params: dict) -> dict:
    return {k: v for k, v in params.items() if k != "appid"}


# ----------------------------------------------------------------------------
# Repositorio Supabase
# ----------------------------------------------------------------------------


class SupabaseRepository:
    def __init__(self, url: str, service_key: str):
        if not url or not service_key:
            raise ValueError(
                "Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en las variables de entorno."
            )
        self.client: Client = create_client(url, service_key)

    def get_upcoming_matches(self, hours_ahead: int) -> list[dict]:
        now = datetime.now(timezone.utc)
        until = now + timedelta(hours=hours_ahead)

        result = (
            self.client.table("matches")
            .select("id, match_date, status, venue_name, venue_lat, venue_lng, home_team_id")
            .in_("status", ["scheduled", "lineups_confirmed"])
            .gte("match_date", now.isoformat())
            .lte("match_date", until.isoformat())
            .execute()
        )
        return result.data or []

    def get_team(self, team_id: str) -> Optional[dict]:
        result = (
            self.client.table("teams")
            .select("id, name, stadium_name, stadium_lat, stadium_lng")
            .eq("id", team_id)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None

    def update_team_coordinates(self, team_id: str, lat: float, lon: float) -> None:
        self.client.table("teams").update(
            {"stadium_lat": lat, "stadium_lng": lon}
        ).eq("id", team_id).execute()

    def update_match_venue_coordinates(self, match_id: str, lat: float, lon: float) -> None:
        self.client.table("matches").update(
            {"venue_lat": lat, "venue_lng": lon}
        ).eq("id", match_id).execute()

    def insert_weather_snapshot(self, row: dict) -> None:
        self.client.table("weather_snapshots").insert(row).execute()


# ----------------------------------------------------------------------------
# Resolución de coordenadas (con caché en memoria + persistencia en Supabase)
# ----------------------------------------------------------------------------


def resolve_match_coordinates(
    repo: SupabaseRepository,
    owm: OpenWeatherMapClient,
    match: dict,
    team_cache: dict[str, dict],
    country_code: str,
) -> Optional[tuple[float, float]]:
    # 1. Ya está en el propio partido (ej. estadio neutral, o ya geocodificado antes)
    if match.get("venue_lat") is not None and match.get("venue_lng") is not None:
        return match["venue_lat"], match["venue_lng"]

    home_team_id = match["home_team_id"]
    team = team_cache.get(home_team_id)
    if team is None:
        team = repo.get_team(home_team_id)
        if team is None:
            log.warning("No se encontró el equipo local %s para el partido %s.", home_team_id, match["id"])
            return None
        team_cache[home_team_id] = team

    # 2. Coordenadas ya cacheadas a nivel de equipo/estadio
    if team.get("stadium_lat") is not None and team.get("stadium_lng") is not None:
        return team["stadium_lat"], team["stadium_lng"]

    # 3. Geocodificar y cachear (en memoria para esta corrida + persistido en Supabase)
    query_candidates = []
    if match.get("venue_name"):
        query_candidates.append(f"{match['venue_name']}, {country_code}")
    if team.get("stadium_name"):
        query_candidates.append(f"{team['stadium_name']}, {country_code}")
    query_candidates.append(f"{team['name']}, {country_code}")

    for query in query_candidates:
        coords = owm.geocode(query)
        if coords:
            lat, lon = coords
            log.info("Geocodificado '%s' -> (%s, %s). Cacheando en teams.", query, lat, lon)
            repo.update_team_coordinates(home_team_id, lat, lon)
            team["stadium_lat"], team["stadium_lng"] = lat, lon
            return lat, lon

    log.warning(
        "No se pudo geocodificar ninguna variante para el equipo '%s' (partido %s). "
        "Revisa manualmente stadium_name / venue_name.",
        team["name"], match["id"],
    )
    return None


# ----------------------------------------------------------------------------
# Transformación de respuestas de OpenWeatherMap -> fila de weather_snapshots
# ----------------------------------------------------------------------------


def _wind_ms_to_kmh(speed_ms: Optional[float]) -> Optional[float]:
    if speed_ms is None:
        return None
    return round(speed_ms * 3.6, 2)


def build_snapshot_from_current(match_id: str, data: dict) -> dict:
    main = data.get("main", {})
    wind = data.get("wind", {})
    weather = (data.get("weather") or [{}])[0]
    rain = data.get("rain", {})
    snow = data.get("snow", {})

    return {
        "match_id": match_id,
        "is_forecast": False,
        "temperature_c": main.get("temp"),
        "feels_like_c": main.get("feels_like"),
        "humidity_pct": main.get("humidity"),
        "wind_speed_kmh": _wind_ms_to_kmh(wind.get("speed")),
        "precipitation_mm": (rain.get("1h") or 0) + (snow.get("1h") or 0),
        "weather_condition": weather.get("main"),
        "weather_code": weather.get("id"),
        "source": "openweathermap",
    }


def build_snapshot_from_forecast_entry(match_id: str, entry: dict) -> dict:
    main = entry.get("main", {})
    wind = entry.get("wind", {})
    weather = (entry.get("weather") or [{}])[0]
    rain = entry.get("rain", {})
    snow = entry.get("snow", {})

    return {
        "match_id": match_id,
        "is_forecast": True,
        "temperature_c": main.get("temp"),
        "feels_like_c": main.get("feels_like"),
        "humidity_pct": main.get("humidity"),
        "wind_speed_kmh": _wind_ms_to_kmh(wind.get("speed")),
        "precipitation_mm": (rain.get("3h") or 0) + (snow.get("3h") or 0),
        "weather_condition": weather.get("main"),
        "weather_code": weather.get("id"),
        "source": "openweathermap",
    }


def pick_closest_forecast_entry(forecast_list: list[dict], kickoff: datetime) -> Optional[dict]:
    if not forecast_list:
        return None
    return min(
        forecast_list,
        key=lambda entry: abs(datetime.fromtimestamp(entry["dt"], tz=timezone.utc) - kickoff),
    )


# ----------------------------------------------------------------------------
# Orquestación
# ----------------------------------------------------------------------------


def process_match(
    match: dict,
    repo: SupabaseRepository,
    owm: OpenWeatherMapClient,
    team_cache: dict[str, dict],
    country_code: str,
) -> None:
    match_id = match["id"]
    kickoff = datetime.fromisoformat(match["match_date"].replace("Z", "+00:00"))
    hours_until_kickoff = (kickoff - datetime.now(timezone.utc)).total_seconds() / 3600

    coords = resolve_match_coordinates(repo, owm, match, team_cache, country_code)
    if not coords:
        return
    lat, lon = coords

    if hours_until_kickoff <= CURRENT_WEATHER_THRESHOLD_HOURS:
        data = owm.get_current_weather(lat, lon)
        if not data:
            log.warning("Sin respuesta de clima actual para partido %s.", match_id)
            return
        snapshot = build_snapshot_from_current(match_id, data)
        log.info("Clima ACTUAL guardado para partido %s (kickoff en %.1fh).", match_id, hours_until_kickoff)

    elif hours_until_kickoff <= FORECAST_MAX_HOURS:
        data = owm.get_forecast(lat, lon)
        if not data or not data.get("list"):
            log.warning("Sin pronóstico disponible para partido %s.", match_id)
            return
        entry = pick_closest_forecast_entry(data["list"], kickoff)
        if not entry:
            return
        snapshot = build_snapshot_from_forecast_entry(match_id, entry)
        log.info(
            "Pronóstico guardado para partido %s (kickoff en %.1fh, slot más cercano usado).",
            match_id, hours_until_kickoff,
        )

    else:
        log.info(
            "Partido %s fuera de rango de pronóstico (%.1fh vista, máx %sh). Se reintentará en una corrida posterior.",
            match_id, hours_until_kickoff, FORECAST_MAX_HOURS,
        )
        return

    repo.insert_weather_snapshot(snapshot)


def run(hours_ahead: int, country_code: str) -> None:
    owm = OpenWeatherMapClient(OPENWEATHERMAP_API_KEY)
    repo = SupabaseRepository(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    matches = repo.get_upcoming_matches(hours_ahead)
    log.info("%s partido(s) próximos dentro de %sh.", len(matches), hours_ahead)

    team_cache: dict[str, dict] = {}

    for match in matches:
        try:
            process_match(match, repo, owm, team_cache, country_code)
        except Exception:
            log.exception("Error procesando clima del partido %s. Se continúa con el siguiente.", match["id"])

    log.info("Ingesta de clima completada.")


# ----------------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Ingesta de clima (OpenWeatherMap) — PitchLogic Analytics")
    parser.add_argument(
        "--hours-ahead", type=int, default=48,
        help="Ventana de partidos próximos a procesar, en horas (default 48)",
    )
    parser.add_argument(
        "--country-code", type=str, default=DEFAULT_COUNTRY_CODE,
        help=f"Código de país ISO-2 usado para geocodificar estadios (default {DEFAULT_COUNTRY_CODE})",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    run(hours_ahead=args.hours_ahead, country_code=args.country_code)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log.exception("Fallo fatal en la ingesta de clima.")
        sys.exit(1)
