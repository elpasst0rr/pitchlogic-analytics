
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
 
// ============================================================================
// IMPORTANTE — principio de diseño de este archivo:
// Esta ruta NUNCA llama a API-Football. Córners/tarjetas/remates se leen
// EXCLUSIVAMENTE de `match_stats_cache` en Supabase, que puebla un proceso
// en segundo plano (fuera de este archivo). Si el dato no está en Supabase,
// se devuelve `statsAvailable: false` — nunca un número calculado.
// La fecha/rival/marcador de los últimos 10 SIGUEN viniendo de
// football-data.org, que siempre ha sido dato real (eso nunca fue el
// problema) y es estable en su plan gratuito.
// ============================================================================
 
const FOOTBALL_DATA_BASE_URL = "https://api.football-data.org/v4";
const LEAGUE_CODES = new Set(["PD", "PL", "SA", "BL1", "FL1"]);
const UPCOMING_WINDOW_DAYS = 10;
 
function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
 
async function fetchFootballData<T>(path: string, revalidateSeconds: number): Promise<T> {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) throw new Error("Falta FOOTBALL_DATA_API_KEY.");
 
  const response = await fetch(`${FOOTBALL_DATA_BASE_URL}${path}`, {
    headers: { "X-Auth-Token": apiKey },
    next: { revalidate: revalidateSeconds },
  });
 
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`football-data.org ${response.status} en ${path}: ${body?.message ?? response.statusText}`);
  }
  return body as T;
}
 
// ============================================================================
// Tipos
// ============================================================================
 
export interface TeamHistoryMatch {
  id: number; // id de football-data.org
  utcDate: string;
  isHome: boolean;
  opponent: string;
  goalsFor: number;
  goalsAgainst: number;
  statsAvailable: boolean;
  shots: number | null;
  shotsOnTarget: number | null;
  corners: number | null;
  fouls: number | null;
  cards: number | null; // amarillas + 2×rojas
  statsStatus: "complete" | "pending" | "unavailable";
}
 
// ============================================================================
// GET /api/matches
//   ?league=PD                           -> próximos partidos + clasificación
//   ?league=PD&mode=last10&teamId=86      -> últimos 10 partidos (stats reales o "no disponible")
// ============================================================================
 
export async function GET(request: NextRequest) {
  const league = request.nextUrl.searchParams.get("league");
  const mode = request.nextUrl.searchParams.get("mode");
  const teamId = request.nextUrl.searchParams.get("teamId");
 
  if (!league || !LEAGUE_CODES.has(league)) {
    return NextResponse.json(
      { error: `Código de liga inválido. Usa uno de: ${[...LEAGUE_CODES].join(", ")}` },
      { status: 400 }
    );
  }
 
  if (mode === "last10") {
    if (!teamId) return NextResponse.json({ error: "Falta teamId para mode=last10." }, { status: 400 });
    return handleLast10(league, teamId);
  }
 
  return handleUpcomingAndStandings(league);
}
 
async function handleUpcomingAndStandings(league: string) {
  const today = new Date();
  const windowEnd = new Date();
  windowEnd.setUTCDate(windowEnd.getUTCDate() + UPCOMING_WINDOW_DAYS);
 
  try {
    const [matchesData, standingsData] = await Promise.all([
      fetchFootballData<{ matches: any[] }>(
        `/competitions/${league}/matches?status=SCHEDULED&dateFrom=${toISODate(today)}&dateTo=${toISODate(windowEnd)}`,
        60 * 60
      ),
      fetchFootballData<{ standings: { type: string; table: any[] }[] }>(
        `/competitions/${league}/standings`,
        60 * 30
      ),
    ]);
 
    const fixtures = (matchesData.matches ?? []).map((m) => ({
      id: m.id,
      utcDate: m.utcDate,
      status: m.status,
      matchday: m.matchday,
      homeTeam: { id: m.homeTeam.id, name: m.homeTeam.name, crest: m.homeTeam.crest },
      awayTeam: { id: m.awayTeam.id, name: m.awayTeam.name, crest: m.awayTeam.crest },
    }));
 
    const standingsTable = standingsData.standings?.find((s) => s.type === "TOTAL")?.table ?? [];
    const standings = standingsTable.map((row: any) => ({
      position: row.position,
      team: { id: row.team.id, name: row.team.name, crest: row.team.crest },
      playedGames: row.playedGames,
      won: row.won,
      draw: row.draw,
      lost: row.lost,
      points: row.points,
      goalDifference: row.goalDifference,
    }));
 
    return NextResponse.json({ fixtures, standings });
  } catch (error) {
    console.error("[/api/matches] Error consultando football-data.org:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido.", fixtures: [], standings: [] },
      { status: 502 }
    );
  }
}
 
async function handleLast10(league: string, teamId: string) {
  try {
    // football-data.org: fecha, rival y marcador reales. `competitions`
    // filtra a esta liga para que solo veas partidos de la competición
    // mostrada (no Champions, Copa, etc. mezclados).
    const data = await fetchFootballData<{ matches: any[] }>(
      `/teams/${teamId}/matches?status=FINISHED&limit=10&competitions=${league}`,
      60 * 60 * 6
    );
    const recentMatches = (data.matches ?? []).slice(0, 10);
 
    if (recentMatches.length === 0) {
      return NextResponse.json({ matches: [] });
    }
 
    // Una sola consulta a Supabase para los 10 partidos, no 10 consultas sueltas.
    const fixtureIds = recentMatches.map((m) => m.id);
    const { data: statsRows, error: statsError } = await supabase
      .from("match_stats_cache")
      .select("fixture_id_football_data, shots, shots_on_target, corners, fouls, yellow_cards, red_cards, status")
      .in("fixture_id_football_data", fixtureIds);
 
    if (statsError) {
      // Un fallo de Supabase no debe tumbar los resultados/rivales/fechas,
      // que siguen siendo reales — simplemente no habrá stats esta vez.
      console.error("[team-history] Error leyendo match_stats_cache:", statsError);
    }
 
    const statsByFixture = new Map((statsRows ?? []).map((row) => [row.fixture_id_football_data, row]));
 
    const results: TeamHistoryMatch[] = recentMatches.map((match) => {
      const isHome = match.homeTeam.id === Number(teamId);
      const opponent = isHome ? match.awayTeam.name : match.homeTeam.name;
      const goalsFor = (isHome ? match.score.fullTime.home : match.score.fullTime.away) ?? 0;
      const goalsAgainst = (isHome ? match.score.fullTime.away : match.score.fullTime.home) ?? 0;
 
      const cached = statsByFixture.get(match.id);
      const isComplete = cached?.status === "complete";
 
      return {
        id: match.id,
        utcDate: match.utcDate,
        isHome,
        opponent,
        goalsFor,
        goalsAgainst,
        statsAvailable: isComplete,
        shots: isComplete ? cached!.shots : null,
        shotsOnTarget: isComplete ? cached!.shots_on_target : null,
        corners: isComplete ? cached!.corners : null,
        fouls: isComplete ? cached!.fouls : null,
        cards: isComplete ? (cached!.yellow_cards ?? 0) + 2 * (cached!.red_cards ?? 0) : null,
        statsStatus: (cached?.status ?? "pending") as "complete" | "pending" | "unavailable",
      };
    });
 
    return NextResponse.json({ matches: results });
  } catch (error) {
    console.error("[/api/matches?mode=last10] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido.", matches: [] },
      { status: 502 }
    );
  }
}
