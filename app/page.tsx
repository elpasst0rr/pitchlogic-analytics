"use client";

import { useEffect, useState } from "react";

const ADMIN_PIN = "1004";

const LIGAS = [
  { id: "PD", name: "LaLiga 🇪🇸" },
  { id: "PL", name: "Premier League 🦁" },
  { id: "SA", name: "Serie A 🇮🇹" },
  { id: "BL1", name: "Bundesliga 🇩🇪" },
  { id: "FL1", name: "Ligue 1 🇫🇷" }
];

function normalizarNombreEquipo(nombre: string): string {
  if (!nombre) return "";
  if (nombre.includes("Atletico") || nombre.includes("Atlético")) return "Atlético de Madrid";
  if (nombre.includes("Betis")) return "Real Betis";
  if (nombre.includes("Sociedad")) return "Real Sociedad";
  if (nombre.includes("Rayo")) return "Rayo Vallecano";
  if (nombre.includes("Espanyol") || nombre.includes("Español")) return "RCD Espanyol";
  if (nombre.includes("Racing")) return "Racing de Santander";
  return nombre;
}

function obtenerRachaLista(formStr: string): { tipo: string; letra: string; color: string }[] {
  if (!formStr) return [];
  const partidos = formStr.split(",").map((p) => p.trim().toUpperCase()).slice(-5);

  return partidos.map((p) => {
    if (p === "W") return { tipo: "W", letra: "V", color: "#22c55e" };
    if (p === "D") return { tipo: "D", letra: "E", color: "#eab308" };
    return { tipo: "L", letra: "D", color: "#ef4444" };
  });
}

function calcularFormaUltimos5(formStr: string) {
  const lista = obtenerRachaLista(formStr);
  if (lista.length === 0) return { porcentaje: 50, lista: [] };

  let puntos = 0;
  lista.forEach((item) => {
    if (item.tipo === "W") puntos += 3;
    else if (item.tipo === "D") puntos += 1;
  });

  const maxPuntos = Math.max(lista.length * 3, 1);
  const porcentaje = Math.round((puntos / maxPuntos) * 100);

  return { porcentaje, lista };
}

function calcularFactorH2HReciente(homeRank: number, awayRank: number, playedGames: number) {
  const esRecienteValido = playedGames >= 3; 

  if (!esRecienteValido) {
    return { homeH2H: 50, awayH2H: 50, pesoH2H: 0 };
  }

  const diffRank = awayRank - homeRank; 
  let h2hHomeScore = 50 + diffRank * 1.2;
  h2hHomeScore = Math.min(80, Math.max(20, h2hHomeScore));

  return { homeH2H: h2hHomeScore, awayH2H: 100 - h2hHomeScore, pesoH2H: 0.15 };
}

// Generador Determinista de Resguardo (Seeded Random)
function seededRandom(seed: number) {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

function obtenerHistorialRealEquipo(teamName: string, finishedMatches: any[], homeGF: number, homeGC: number) {
  const normTeam = normalizarNombreEquipo(teamName);
  
  const partidosEquipo = finishedMatches.filter((m: any) => {
    const home = normalizarNombreEquipo(m.homeTeam?.name || "");
    const away = normalizarNombreEquipo(m.awayTeam?.name || "");
    return home.includes(normTeam) || normTeam.includes(home) || away.includes(normTeam) || normTeam.includes(away);
  });

  const ultimos10 = partidosEquipo.slice(-10).reverse();

  if (ultimos10.length === 0) {
    const rivalesEjemplo = ["Valencia", "Villarreal", "Sevilla", "Athletic", "Getafe", "Celta", "Mallorca", "Osasuna", "Girona", "Alavés"];
    return Array.from({ length: 10 }).map((_, idx) => {
      const rival = rivalesEjemplo[idx % rivalesEjemplo.length];
      const esLocal = idx % 2 === 0;
      return {
        num: idx + 1,
        rival,
        esLocal,
        fuenteTag: "Estimado",
        cornersFav: 5, cornersRival: 4, cornersTotal: 9,
        tarjetasFav: 2, tarjetasRival: 2, tarjetasTotal: 4,
        golesFav: 1, golesRival: 1, golesTotal: 2,
        rematesFav: 12, rematesRival: 10, rematesTotal: 22,
        rematesPuertaFav: 4, rematesPuertaRival: 3, rematesPuertaTotal: 7
      };
    });
  }

  return ultimos10.map((m: any, idx: number) => {
    const homeName = normalizarNombreEquipo(m.homeTeam?.name || "");
    const esLocal = homeName.includes(normTeam) || normTeam.includes(homeName);
    const rival = esLocal ? normalizarNombreEquipo(m.awayTeam?.name || "") : normalizarNombreEquipo(m.homeTeam?.name || "");

    const golesFav = esLocal ? (m.score?.fullTime?.home ?? 1) : (m.score?.fullTime?.away ?? 1);
    const golesRival = esLocal ? (m.score?.fullTime?.away ?? 0) : (m.score?.fullTime?.home ?? 0);

    const esRealApiFootball = m.fuente === "api_football" && m.stats;
    const seed = Number(m.id || idx + 100);

    // Métricas Reales o Deterministas
    const cornersFav = esRealApiFootball 
      ? (esLocal ? (m.stats.cornersHome ?? 5) : (m.stats.cornersAway ?? 4))
      : Math.max(2, Math.round(4 + golesFav * 1.4 + seededRandom(seed + 1) * 3));

    const cornersRival = esRealApiFootball
      ? (esLocal ? (m.stats.cornersAway ?? 4) : (m.stats.cornersHome ?? 5))
      : Math.max(1, Math.round(3 + golesRival * 1.2 + seededRandom(seed + 2) * 3));

    const tarjetasFav = esRealApiFootball
      ? (esLocal ? ((m.stats.yellowHome ?? 2) + (m.stats.redHome ?? 0)) : ((m.stats.yellowAway ?? 2) + (m.stats.redAway ?? 0)))
      : Math.max(1, Math.round(2 + (golesRival > golesFav ? 1 : 0) + Math.floor(seededRandom(seed + 3) * 2)));

    const tarjetasRival = esRealApiFootball
      ? (esLocal ? ((m.stats.yellowAway ?? 2) + (m.stats.redAway ?? 0)) : ((m.stats.yellowHome ?? 2) + (m.stats.redHome ?? 0)))
      : Math.max(1, Math.round(2 + (golesFav > golesRival ? 1 : 0) + Math.floor(seededRandom(seed + 4) * 2)));

    const rematesFav = esRealApiFootball
      ? (esLocal ? (m.stats.shotsHome ?? 12) : (m.stats.shotsAway ?? 10))
      : Math.max(7, Math.round(10 + golesFav * 2.2 + seededRandom(seed + 5) * 4));

    const rematesRival = esRealApiFootball
      ? (esLocal ? (m.stats.shotsAway ?? 10) : (m.stats.shotsHome ?? 12))
      : Math.max(5, Math.round(8 + golesRival * 2.0 + seededRandom(seed + 6) * 4));

    const rematesPuertaFav = esRealApiFootball
      ? (esLocal ? (m.stats.shotsOnGoalHome ?? 4) : (m.stats.shotsOnGoalAway ?? 3))
      : Math.max(2, Math.round(rematesFav * 0.35));

    const rematesPuertaRival = esRealApiFootball
      ? (esLocal ? (m.stats.shotsOnGoalAway ?? 3) : (m.stats.shotsOnGoalHome ?? 4))
      : Math.max(1, Math.round(rematesRival * 0.32));

    return {
      num: idx + 1,
      rival,
      esLocal,
      fuenteTag: esRealApiFootball ? "Real" : "Estimado",
      cornersFav, cornersRival, cornersTotal: cornersFav + cornersRival,
      tarjetasFav, tarjetasRival, tarjetasTotal: tarjetasFav + tarjetasRival,
      golesFav, golesRival, golesTotal: golesFav + golesRival,
      rematesFav, rematesRival, rematesTotal: rematesFav + rematesRival,
      rematesPuertaFav, rematesPuertaRival, rematesPuertaTotal: rematesPuertaFav + rematesPuertaRival
    };
  });
}

function calcularModeloPitchLogic(
  homeNameRaw: string,
  awayNameRaw: string,
  standings: any[],
  finishedMatches: any[],
  params: { bajasHome: number; fatigaHome: number; bajasAway: number; fatigaAway: number }
) {
  const homeName = normalizarNombreEquipo(homeNameRaw);
  const awayName = normalizarNombreEquipo(awayNameRaw);

  const homeTeam = standings.find((s) => s.team.name.includes(homeName) || homeName.includes(s.team.name));
  const awayTeam = standings.find((s) => s.team.name.includes(awayName) || awayName.includes(s.team.name));

  if (!homeTeam || !awayTeam || standings.length === 0) {
    return {
      homeName,
      awayName,
      homeProb: 50,
      awayProb: 50,
      fuerzaHome: "60.0",
      fuerzaAway: "50.0",
      formaHome: { porcentaje: 50, lista: [] },
      formaAway: { porcentaje: 50, lista: [] },
      h2hInfo: { homeH2H: 50, awayH2H: 50, pesoH2H: 0 },
      pick: null,
      probabilidadPick: 50,
      goles: { homeFavor: "1.40", homeContra: "1.10", awayFavor: "1.10", awayContra: "1.50", totalEstimado: 2.5, pickGoles: null, probGoles: 50 },
      corners: { homeFavor: "5.2", homeContra: "4.1", awayFavor: "4.3", awayContra: "5.5", totalEstimado: 9.5, pickCorners: null, probCorners: 50 },
      tarjetas: { homeFavor: "2.3", homeContra: "2.1", awayFavor: "2.5", awayContra: "2.0", totalEstimado: 4.5, pickTarjetas: null, probTarjetas: 50 },
      remates: { homeFavor: "13.5", homeContra: "10.2", awayFavor: "11.2", awayContra: "14.1", totalEstimado: 24.5, pickRematesHome: null, probRematesHome: 0, pickRematesAway: null, probRematesAway: 0 },
      rematesPuerta: { homeFavor: "5.1", homeContra: "3.8", awayFavor: "4.2", awayContra: "5.5", totalEstimado: 9.3, pickRematesPuertaHome: null, probRematesPuertaHome: 0, pickRematesPuertaAway: null, probRematesPuertaAway: 0 },
      historialHome: obtenerHistorialRealEquipo(homeName, finishedMatches, 1.4, 1.1),
      historialAway: obtenerHistorialRealEquipo(awayName, finishedMatches, 1.1, 1.5)
    };
  }

  const totalGames = standings.reduce((acc, s) => acc + s.playedGames, 0) / 2 || 1;
  const totalGoals = standings.reduce((acc, s) => acc + s.goalsFor, 0) || 1;
  const avgGoals = totalGoals / totalGames;

  const hPJ = homeTeam.playedGames || 1;
  const aPJ = awayTeam.playedGames || 1;

  const homeGF = homeTeam.goalsFor / hPJ;
  const homeGC = homeTeam.goalsAgainst / hPJ;
  const awayGF = awayTeam.goalsFor / aPJ;
  const awayGC = awayTeam.goalsAgainst / aPJ;

  const hxG = homeGF / (avgGoals / 2 || 1);
  const hxGA = homeGC / (avgGoals / 2 || 1);
  const axG = awayGF / (avgGoals / 2 || 1);
  const axGA = awayGC / (avgGoals / 2 || 1);

  const rendHome = Math.min(100, Math.max(0, hxG * 35));
  const rendHomeAgainst = Math.min(100, Math.max(0, hxGA * 35));
  const difHomeXgXga = 50 + (rendHome - rendHomeAgainst);

  const rendAway = Math.min(100, Math.max(0, axG * 35));
  const rendAwayAgainst = Math.min(100, Math.max(0, axGA * 35));
  const difAwayXgXga = 50 + (rendAway - rendAwayAgainst);

  const formaHomeInfo = calcularFormaUltimos5(homeTeam.form);
  const formaAwayInfo = calcularFormaUltimos5(awayTeam.form);

  const h2hInfo = calcularFactorH2HReciente(homeTeam.rank, awayTeam.rank, hPJ);
  const pesoXG = 0.40 + (0.15 - h2hInfo.pesoH2H);

  const fuerzaHome = 
    (difHomeXgXga * pesoXG) + 
    (params.bajasHome * 0.20) + 
    (params.fatigaHome * 0.15) + 
    (formaHomeInfo.porcentaje * 0.10) + 
    (h2hInfo.homeH2H * h2hInfo.pesoH2H);

  const fuerzaAway = 
    (difAwayXgXga * pesoXG) + 
    (params.bajasAway * 0.20) + 
    (params.fatigaAway * 0.15) + 
    (formaAwayInfo.porcentaje * 0.10) + 
    (h2hInfo.awayH2H * h2hInfo.pesoH2H);

  const totalFuerza = fuerzaHome + fuerzaAway || 1;
  const homeProb = Math.round((fuerzaHome / totalFuerza) * 100);
  const awayProb = 100 - homeProb;

  let pick: string | null = null;
  let probabilidadPick = 0;

  if (homeProb >= 70) {
    pick = "1";
    probabilidadPick = homeProb;
  } else if (homeProb >= 65 && homeProb < 70) {
    if (homeProb + 10 >= 70) {
      pick = "1X";
      probabilidadPick = homeProb + 10;
    }
  } else if (awayProb >= 70) {
    pick = "2";
    probabilidadPick = awayProb;
  } else if (awayProb >= 65 && awayProb < 70) {
    if (awayProb + 10 >= 70) {
      pick = "2X";
      probabilidadPick = awayProb + 10;
    }
  }

  const homeGF_Casa = homeGF * 1.15;
  const awayGC_Fuera = awayGC * 1.10;
  const awayGF_Fuera = awayGF * 0.90;
  const homeGC_Casa = homeGC * 0.85;

  const expGolesHome = 0.65 * (0.70 * homeGF_Casa + 0.30 * homeGF) + 0.35 * (0.70 * awayGC_Fuera + 0.30 * awayGC);
  const expGolesAway = 0.65 * (0.70 * awayGF_Fuera + 0.30 * awayGF) + 0.35 * (0.70 * homeGC_Casa + 0.30 * homeGC);
  const totalGolesEst = parseFloat((expGolesHome + expGolesAway).toFixed(2));

  let pickGoles: string | null = null;
  let probGoles = 0;
  if (totalGolesEst >= 3.6) {
    pickGoles = "+2.5 Goles";
    probGoles = Math.min(98, Math.round(75 + (totalGolesEst - 3.6) * 12));
  } else if (totalGolesEst >= 2.6) {
    pickGoles = "+1.5 Goles";
    probGoles = Math.min(98, Math.round(78 + (totalGolesEst - 2.6) * 15));
  }

  const baseHomeCornersFavor = (4.5 + hxG * 0.8) * 1.10;
  const baseAwayCornersFavor = (4.2 + axG * 0.8) * 0.90;
  const baseHomeCornersContra = 4.0 + hxGA * 0.6;
  const baseAwayCornersContra = (4.3 + axGA * 0.6) * 1.10;

  const totalCornersHomeMatches = 0.70 * (baseHomeCornersFavor + baseHomeCornersContra) + 0.30 * 8.5;
  const totalCornersAwayMatches = 0.70 * (baseAwayCornersFavor + baseAwayCornersContra) + 0.30 * 8.5;

  const totalCornersEst = parseFloat((0.65 * totalCornersHomeMatches + 0.35 * totalCornersAwayMatches).toFixed(1));

  let pickCorners: string | null = null;
  let probCorners = 0;
  if (totalCornersEst >= 10.5) {
    pickCorners = "+7.5 Córners";
    probCorners = Math.min(98, Math.round(75 + (totalCornersEst - 10.5) * 10));
  } else if (totalCornersEst >= 9.2) {
    pickCorners = "+6.5 Córners";
    probCorners = Math.min(98, Math.round(78 + (totalCornersEst - 9.2) * 12));
  }

  const baseHomeTarjetasFavor = 2.1 + hxGA * 0.4;
  const baseAwayTarjetasFavor = (2.4 + axGA * 0.4) * 1.15;
  const baseHomeTarjetasContra = 2.0 + hxG * 0.3;
  const baseAwayTarjetasContra = 2.2 + axG * 0.3;

  const totalTarjetasHomeMatches = 0.70 * (baseHomeTarjetasFavor + baseHomeTarjetasContra) + 0.30 * 4.2;
  const totalTarjetasAwayMatches = 0.70 * (baseAwayTarjetasFavor + baseAwayTarjetasContra) + 0.30 * 4.2;

  const totalTarjetasEst = parseFloat((0.65 * totalTarjetasHomeMatches + 0.35 * totalTarjetasAwayMatches).toFixed(1));

  let pickTarjetas: string | null = null;
  let probTarjetas = 0;
  if (totalTarjetasEst >= 5.8) {
    pickTarjetas = "+3.5 Tarjetas";
    probTarjetas = Math.min(98, Math.round(75 + (totalTarjetasEst - 5.8) * 10));
  } else if (totalTarjetasEst >= 4.6) {
    pickTarjetas = "+2.5 Tarjetas";
    probTarjetas = Math.min(98, Math.round(78 + (totalTarjetasEst - 4.6) * 12));
  }

  const expRematesHome = (12.5 + hxG * 2.1) * 1.12;
  const expRematesAway = (10.8 + axG * 1.9) * 0.88;
  const baseHomeRematesContra = 10.0 + hxGA * 1.5;
  const baseAwayRematesContra = (11.5 + axGA * 1.8) * 1.10;

  const totalRematesEst = parseFloat((0.65 * (expRematesHome + baseHomeRematesContra) + 0.35 * (expRematesAway + baseAwayRematesContra)).toFixed(1));

  let pickRematesHome: string | null = null;
  let probRematesHome = 0;
  if (expRematesHome >= 14.5) {
    probRematesHome = Math.min(98, Math.round(75 + (expRematesHome - 14.5) * 8));
    if (probRematesHome >= 70) pickRematesHome = `${homeName}: +10.5 Remates`;
  } else if (expRematesHome >= 12.5) {
    probRematesHome = Math.min(98, Math.round(72 + (expRematesHome - 12.5) * 10));
    if (probRematesHome >= 70) pickRematesHome = `${homeName}: +8.5 Remates`;
  }

  let pickRematesAway: string | null = null;
  let probRematesAway = 0;
  if (expRematesAway >= 13.5) {
    probRematesAway = Math.min(98, Math.round(75 + (expRematesAway - 13.5) * 8));
    if (probRematesAway >= 70) pickRematesAway = `${awayName}: +9.5 Remates`;
  } else if (expRematesAway >= 11.5) {
    probRematesAway = Math.min(98, Math.round(72 + (expRematesAway - 11.5) * 10));
    if (probRematesAway >= 70) pickRematesAway = `${awayName}: +7.5 Remates`;
  }

  const expRematesPuertaHome = (4.8 + hxG * 0.9) * 1.12;
  const expRematesPuertaAway = (4.0 + axG * 0.8) * 0.88;
  const baseHomeRematesPuertaContra = 3.5 + hxGA * 0.6;
  const baseAwayRematesPuertaContra = (4.2 + axGA * 0.7) * 1.10;

  const totalRematesPuertaEst = parseFloat((0.65 * (expRematesPuertaHome + baseHomeRematesPuertaContra) + 0.35 * (expRematesPuertaAway + baseAwayRematesPuertaContra)).toFixed(1));

  let pickRematesPuertaHome: string | null = null;
  let probRematesPuertaHome = 0;
  if (expRematesPuertaHome >= 6.2) {
    probRematesPuertaHome = Math.min(98, Math.round(78 + (expRematesPuertaHome - 6.2) * 10));
    if (probRematesPuertaHome >= 70) pickRematesPuertaHome = `${homeName}: +3.5 A Puerta`;
  } else if (expRematesPuertaHome >= 4.8) {
    probRematesPuertaHome = Math.min(98, Math.round(74 + (expRematesPuertaHome - 4.8) * 12));
    if (probRematesPuertaHome >= 70) pickRematesPuertaHome = `${homeName}: +2.5 A Puerta`;
  }

  let pickRematesPuertaAway: string | null = null;
  let probRematesPuertaAway = 0;
  if (expRematesPuertaAway >= 5.8) {
    probRematesPuertaAway = Math.min(98, Math.round(78 + (expRematesPuertaAway - 5.8) * 10));
    if (probRematesPuertaAway >= 70) pickRematesPuertaAway = `${awayName}: +3.5 A Puerta`;
  } else if (expRematesPuertaAway >= 4.2) {
    probRematesPuertaAway = Math.min(98, Math.round(74 + (expRematesPuertaAway - 4.2) * 12));
    if (probRematesPuertaAway >= 70) pickRematesPuertaAway = `${awayName}: +1.5 A Puerta`;
  }

  return {
    homeName,
    awayName,
    homeProb,
    awayProb,
    fuerzaHome: fuerzaHome.toFixed(1),
    fuerzaAway: fuerzaAway.toFixed(1),
    formaHome: formaHomeInfo,
    formaAway: formaAwayInfo,
    h2hInfo,
    pick,
    probabilidadPick,
    goles: { homeFavor: homeGF.toFixed(2), homeContra: homeGC.toFixed(2), awayFavor: awayGF.toFixed(2), awayContra: awayGC.toFixed(2), totalEstimado: totalGolesEst, pickGoles, probGoles },
    corners: { homeFavor: baseHomeCornersFavor.toFixed(1), homeContra: baseHomeCornersContra.toFixed(1), awayFavor: baseAwayCornersFavor.toFixed(1), awayContra: baseAwayCornersContra.toFixed(1), totalEstimado: totalCornersEst, pickCorners, probCorners },
    tarjetas: { homeFavor: baseHomeTarjetasFavor.toFixed(1), homeContra: baseHomeTarjetasContra.toFixed(1), awayFavor: baseAwayTarjetasFavor.toFixed(1), awayContra: baseAwayTarjetasContra.toFixed(1), totalEstimado: totalTarjetasEst, pickTarjetas, probTarjetas },
    remates: { homeFavor: expRematesHome.toFixed(1), homeContra: baseHomeRematesContra.toFixed(1), awayFavor: expRematesAway.toFixed(1), awayContra: baseAwayRematesContra.toFixed(1), totalEstimado: totalRematesEst, pickRematesHome, probRematesHome, pickRematesAway, probRematesAway },
    rematesPuerta: { homeFavor: expRematesPuertaHome.toFixed(1), homeContra: baseHomeRematesPuertaContra.toFixed(1), awayFavor: expRematesPuertaAway.toFixed(1), awayContra: baseAwayRematesPuertaContra.toFixed(1), totalEstimado: totalRematesPuertaEst, pickRematesPuertaHome, probRematesPuertaHome, pickRematesPuertaAway, probRematesPuertaAway },
    historialHome: obtenerHistorialRealEquipo(homeName, finishedMatches, homeGF, homeGC),
    historialAway: obtenerHistorialRealEquipo(awayName, finishedMatches, awayGF, awayGC)
  };
}

export default function Home() {
  const [activeLeague, setActiveLeague] = useState("PD");
  const [data, setData] = useState<{ fixtures: any[]; standings: any[]; finishedMatches: any[] }>({ fixtures: [], standings: [], finishedMatches: [] });
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [simParams, setSimParams] = useState<{ [key: number]: { bajasHome: number; fatigaHome: number; bajasAway: number; fatigaAway: number } }>({});
  const [selectedMatchIdx, setSelectedMatchIdx] = useState<number | null>(null);
  const [openTeamStats, setOpenTeamStats] = useState<{ matchIdx: number; teamType: "home" | "away" } | null>(null);

  const [modoFiltro, setModoFiltro] = useState<"INDIVIDUAL" | "GLOBAL">("INDIVIDUAL");
  const [filtroCondicion, setFiltroCondicion] = useState<"TODOS" | "LOCAL" | "VISITANTE">("TODOS");

  const [filtroTipo, setFiltroTipo] = useState<"NINGUNO" | "CORNERS" | "TARJETAS" | "GOLES" | "REMATES" | "PUERTA">("NINGUNO");
  const [filtroValCorners, setFiltroValCorners] = useState<number>(4.5);
  const [filtroValTarjetas, setFiltroValTarjetas] = useState<number>(1.5);
  const [filtroValGoles, setFiltroValGoles] = useState<number>(1.5);
  const [filtroValRemates, setFiltroValRemates] = useState<number>(10.5);
  const [filtroValPuerta, setFiltroValPuerta] = useState<number>(3.5);

  useEffect(() => {
    setLoading(true);
    setErrorMsg(null);
    setSelectedMatchIdx(null);
    setOpenTeamStats(null);
    setFiltroTipo("NINGUNO");
    setFiltroCondicion("TODOS");

    fetch(`/api/matches?league=${activeLeague}`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`Error en servidor (${res.status})`);
        return res.json();
      })
      .then((resData) => {
        let fixtures = resData.fixtures || [];
        const standings = resData.standings || [];
        const finishedMatches = resData.finishedMatches || [];

        const initialParams: any = {};
        fixtures.forEach((_: any, idx: number) => {
          initialParams[idx] = { bajasHome: 85, fatigaHome: 70, bajasAway: 85, fatigaAway: 70 };
        });

        setSimParams(initialParams);
        setData({ fixtures, standings, finishedMatches });
        setLoading(false);
      })
      .catch((err) => {
        setErrorMsg(err.message);
        setLoading(false);
      });
  }, [activeLeague]);

  const toggleAdmin = () => {
    if (isAdmin) {
      setIsAdmin(false);
    } else {
      const pin = prompt("Introduce la clave de Administrador:");
      if (pin === ADMIN_PIN) {
        setIsAdmin(true);
      } else if (pin !== null) {
        alert("Clave incorrecta.");
      }
    }
  };

  const handleParamChange = (matchIdx: number, key: string, value: number) => {
    setSimParams((prev) => ({
      ...prev,
      [matchIdx]: { ...prev[matchIdx], [key]: value }
    }));
  };

  const evaluarFiltroMatch = (p: any) => {
    if (modoFiltro === "INDIVIDUAL") {
      if (filtroTipo === "CORNERS") return p.cornersFav > filtroValCorners;
      if (filtroTipo === "TARJETAS") return p.tarjetasFav > filtroValTarjetas;
      if (filtroTipo === "GOLES") return p.golesFav > filtroValGoles;
      if (filtroTipo === "REMATES") return p.rematesFav > filtroValRemates;
      if (filtroTipo === "PUERTA") return p.rematesPuertaFav > filtroValPuerta;
    } else {
      if (filtroTipo === "CORNERS") return p.cornersTotal > filtroValCorners;
      if (filtroTipo === "TARJETAS") return p.tarjetasTotal > filtroValTarjetas;
      if (filtroTipo === "GOLES") return p.golesTotal > filtroValGoles;
      if (filtroTipo === "REMATES") return p.rematesTotal > filtroValRemates;
      if (filtroTipo === "PUERTA") return p.rematesPuertaTotal > filtroValPuerta;
    }
    return null;
  };

  const obtenerEstiloCelda = (cumple: boolean | null) => {
    if (cumple === true) return { backgroundColor: "rgba(34, 197, 94, 0.25)", color: "#4ade80", fontWeight: "bold" };
    if (cumple === false) return { backgroundColor: "rgba(239, 68, 68, 0.25)", color: "#f87171", fontWeight: "bold" };
    return {};
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0f172a", color: "#f8fafc", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ padding: "1.5rem 2rem", borderBottom: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#38bdf8", margin: 0 }}>Pitchlogic Analytics</h1>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <div style={{ display: "flex", gap: "0.3rem" }}>
            {LIGAS.map((l) => (
              <button
                key={l.id}
                onClick={() => setActiveLeague(l.id)}
                style={{
                  padding: "0.4rem 0.8rem",
                  borderRadius: "0.5rem",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  fontWeight: activeLeague === l.id ? "bold" : "normal",
                  backgroundColor: activeLeague === l.id ? "#0284c7" : "#1e293b",
                  color: "#ffffff"
                }}
              >
                {l.name}
              </button>
            ))}
          </div>

          <button
            onClick={toggleAdmin}
            style={{
              padding: "0.4rem 0.8rem",
              borderRadius: "0.5rem",
              border: "1px solid #334155",
              cursor: "pointer",
              fontSize: "0.8rem",
              fontWeight: "bold",
              backgroundColor: isAdmin ? "#15803d" : "#334155",
              color: "#ffffff"
            }}
          >
            {isAdmin ? "🔓 Modo Admin" : "🔒 Admin Login"}
          </button>
        </div>
      </header>

      <main style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
        {errorMsg && (
          <div style={{ padding: "1rem", backgroundColor: "#7f1d1d", color: "#fca5a5", borderRadius: "0.5rem", marginBottom: "1.5rem" }}>
            <strong>Fallo de conexión:</strong> {errorMsg}
          </div>
        )}

        {/* SECCIÓN 1: CLASIFICACIÓN DETALLADA */}
        <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem", color: "#94a3b8" }}>Clasificación Detallada 2026/27</h2>
        <div style={{ backgroundColor: "#1e293b", borderRadius: "0.75rem", border: "1px solid #334155", overflowX: "auto", marginBottom: "2.5rem" }}>
          {loading ? (
            <p style={{ padding: "1.5rem", textAlign: "center", color: "#94a3b8" }}>Cargando clasificación oficial...</p>
          ) : data.standings.length === 0 ? (
            <p style={{ padding: "1.5rem", textAlign: "center", color: "#94a3b8" }}>No hay datos de clasificación disponibles.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8" }}>
                  <th style={{ padding: "0.75rem 1rem" }}>Pos</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Equipo</th>
                  <th style={{ padding: "0.75rem 1rem" }}>PJ</th>
                  <th style={{ padding: "0.75rem 1rem" }}>PG</th>
                  <th style={{ padding: "0.75rem 1rem" }}>PE</th>
                  <th style={{ padding: "0.75rem 1rem" }}>PP</th>
                  <th style={{ padding: "0.75rem 1rem" }}>GF</th>
                  <th style={{ padding: "0.75rem 1rem" }}>GC</th>
                  <th style={{ padding: "0.75rem 1rem" }}>DG</th>
                  <th style={{ padding: "0.75rem 1rem" }}>PTS</th>
                </tr>
              </thead>
              <tbody>
                {data.standings.map((team: any, i: number) => (
                  <tr key={i} style={{ borderBottom: "1px solid #334155" }}>
                    <td style={{ padding: "0.75rem 1rem", fontWeight: "bold", color: "#38bdf8" }}>{team.rank}</td>
                    <td style={{ padding: "0.75rem 1rem", fontWeight: "600" }}>{normalizarNombreEquipo(team.team.name)}</td>
                    <td style={{ padding: "0.75rem 1rem", color: "#94a3b8" }}>{team.playedGames}</td>
                    <td style={{ padding: "0.75rem 1rem", color: "#94a3b8" }}>{team.won}</td>
                    <td style={{ padding: "0.75rem 1rem", color: "#94a3b8" }}>{team.draw}</td>
                    <td style={{ padding: "0.75rem 1rem", color: "#94a3b8" }}>{team.lost}</td>
                    <td style={{ padding: "0.75rem 1rem", color: "#94a3b8" }}>{team.goalsFor}</td>
                    <td style={{ padding: "0.75rem 1rem", color: "#94a3b8" }}>{team.goalsAgainst}</td>
                    <td style={{ padding: "0.75rem 1rem", color: team.goalDifference >= 0 ? "#4ade80" : "#f87171" }}>
                      {team.goalDifference > 0 ? `+${team.goalDifference}` : team.goalDifference}
                    </td>
                    <td style={{ padding: "0.75rem 1rem", color: "#4ade80", fontWeight: "bold" }}>{team.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* SECCIÓN 2: PRÓXIMOS PARTIDOS */}
        <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem", color: "#94a3b8" }}>Próximos Partidos Reales (Haz clic para ver Recomendaciones)</h2>
        <div style={{ display: "grid", gap: "1.5rem" }}>
          {loading ? (
            <div style={{ backgroundColor: "#1e293b", padding: "1.5rem", borderRadius: "0.75rem", textAlign: "center", color: "#94a3b8" }}>
              Cargando próximos partidos...
            </div>
          ) : data.fixtures.length === 0 ? (
            <div style={{ backgroundColor: "#1e293b", padding: "1.5rem", borderRadius: "0.75rem", textAlign: "center", color: "#94a3b8" }}>
              No hay partidos programados para los próximos días.
            </div>
          ) : (
            data.fixtures.map((item: any, i: number) => {
              const currentParams = simParams[i] || { bajasHome: 85, fatigaHome: 70, bajasAway: 85, fatigaAway: 70 };
              const model = calcularModeloPitchLogic(item.teams.home.name, item.teams.away.name, data.standings, data.finishedMatches, currentParams);
              const isSelected = selectedMatchIdx === i;

              type PickItem = { titulo: string; val: string; prob: number; color: string };
              const picksNormales: PickItem[] = [];
              const picksTopConfianza: PickItem[] = [];

              const agregarPickConExigencia = (titulo: string, val: string | null, prob: number, color: string) => {
                if (!val || prob < 70) return;
                const itemPick = { titulo, val, prob, color };
                if (prob >= 90) picksTopConfianza.push(itemPick);
                else picksNormales.push(itemPick);
              };

              agregarPickConExigencia("Resultado (1X2)", model.pick, model.probabilidadPick, "#38bdf8");
              agregarPickConExigencia("Mercado de Goles", model.goles.pickGoles, model.goles.probGoles, "#4ade80");
              agregarPickConExigencia("Línea de Córners", model.corners.pickCorners, model.corners.probCorners, "#a855f7");
              agregarPickConExigencia("Línea de Tarjetas", model.tarjetas.pickTarjetas, model.tarjetas.probTarjetas, "#f87171");
              agregarPickConExigencia("Remates Equipo", model.remates.pickRematesHome, model.remates.probRematesHome, "#38bdf8");
              agregarPickConExigencia("Remates Equipo", model.remates.pickRematesAway, model.remates.probRematesAway, "#38bdf8");
              agregarPickConExigencia("Remates a Puerta", model.rematesPuerta.pickRematesPuertaHome, model.rematesPuerta.probRematesPuertaHome, "#f59e0b");
              agregarPickConExigencia("Remates a Puerta", model.rematesPuerta.pickRematesPuertaAway, model.rematesPuerta.probRematesPuertaAway, "#f59e0b");

              const rawHistorial = openTeamStats?.matchIdx === i 
                ? (openTeamStats.teamType === "home" ? model.historialHome : model.historialAway) 
                : [];

              const activeHistorial = rawHistorial.filter((p) => {
                if (filtroCondicion === "LOCAL") return p.esLocal === true;
                if (filtroCondicion === "VISITANTE") return p.esLocal === false;
                return true;
              });

              const activeTeamName = openTeamStats?.matchIdx === i 
                ? (openTeamStats.teamType === "home" ? model.homeName : model.awayName) 
                : "";

              const conteoAciertos = activeHistorial.filter((p) => evaluarFiltroMatch(p) === true).length;
              const totalMuestra = activeHistorial.length;
              const pctAcierto = totalMuestra > 0 ? Math.round((conteoAciertos / totalMuestra) * 100) : 0;

              return (
                <div
                  key={i}
                  style={{
                    backgroundColor: "#1e293b",
                    borderRadius: "0.75rem",
                    border: isSelected ? "2px solid #38bdf8" : "1px solid #334155",
                    padding: "1.25rem",
                    cursor: "pointer",
                    transition: "all 0.2s ease"
                  }}
                  onClick={() => setSelectedMatchIdx(isSelected ? null : i)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem", fontSize: "0.85rem", color: "#94a3b8" }}>
                    <span>{new Date(item.fixture.date).toLocaleString()}</span>
                    <span style={{ color: "#38bdf8", fontWeight: "bold" }}>
                      {isSelected ? "▲ Ocultar Análisis" : "▼ Toca para abrir Análisis Completo"}
                    </span>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: "bold", fontSize: "1.1rem", marginBottom: "0.75rem" }}>
                    <span style={{ width: "40%", textAlign: "left" }}>{model.homeName}</span>
                    <span style={{ color: "#64748b", fontSize: "0.9rem" }}>VS</span>
                    <span style={{ width: "40%", textAlign: "right" }}>{model.awayName}</span>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "#cbd5e1", marginBottom: "0.75rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <span style={{ color: "#94a3b8", marginRight: "0.25rem" }}>Racha 5p:</span>
                      {model.formaHome.lista.map((item: any, idx: number) => (
                        <span key={idx} style={{ backgroundColor: item.color, color: "#000", fontWeight: "bold", borderRadius: "0.2rem", padding: "0.1rem 0.35rem", fontSize: "0.75rem" }}>
                          {item.letra}
                        </span>
                      ))}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <span style={{ color: "#94a3b8", marginRight: "0.25rem" }}>Racha 5p:</span>
                      {model.formaAway.lista.map((item: any, idx: number) => (
                        <span key={idx} style={{ backgroundColor: item.color, color: "#000", fontWeight: "bold", borderRadius: "0.2rem", padding: "0.1rem 0.35rem", fontSize: "0.75rem" }}>
                          {item.letra}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div style={{ backgroundColor: "#0f172a", borderRadius: "0.5rem", padding: "0.75rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "0.4rem" }}>
                      <span style={{ color: "#38bdf8", fontWeight: "bold" }}>
                        Local {isAdmin && `(${model.homeProb}%)`}
                      </span>
                      <span style={{ color: "#f87171", fontWeight: "bold" }}>
                        Visitante {isAdmin && `(${model.awayProb}%)`}
                      </span>
                    </div>
                    <div style={{ display: "flex", height: "8px", borderRadius: "4px", overflow: "hidden", backgroundColor: "#334155" }}>
                      <div style={{ width: `${model.homeProb}%`, backgroundColor: "#38bdf8" }} />
                      <div style={{ width: `${model.awayProb}%`, backgroundColor: "#f87171" }} />
                    </div>
                  </div>

                  {/* DESGLOSE DESPLEGABLE */}
                  {isSelected && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        marginTop: "1.25rem",
                        paddingTop: "1.25rem",
                        borderTop: "1px dashed #334155",
                        display: "grid",
                        gap: "1.25rem"
                      }}
                    >
                      <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
                        <button
                          onClick={() => setOpenTeamStats(openTeamStats?.matchIdx === i && openTeamStats?.teamType === "home" ? null : { matchIdx: i, teamType: "home" })}
                          style={{
                            padding: "0.5rem 1rem",
                            borderRadius: "0.5rem",
                            border: "1px solid #38bdf8",
                            backgroundColor: openTeamStats?.matchIdx === i && openTeamStats?.teamType === "home" ? "#0284c7" : "#0f172a",
                            color: "#ffffff",
                            fontSize: "0.8rem",
                            fontWeight: "bold",
                            cursor: "pointer"
                          }}
                        >
                          📊 Últimos Partidos {model.homeName} (2026/27)
                        </button>

                        <button
                          onClick={() => setOpenTeamStats(openTeamStats?.matchIdx === i && openTeamStats?.teamType === "away" ? null : { matchIdx: i, teamType: "away" })}
                          style={{
                            padding: "0.5rem 1rem",
                            borderRadius: "0.5rem",
                            border: "1px solid #f87171",
                            backgroundColor: openTeamStats?.matchIdx === i && openTeamStats?.teamType === "away" ? "#dc2626" : "#0f172a",
                            color: "#ffffff",
                            fontSize: "0.8rem",
                            fontWeight: "bold",
                            cursor: "pointer"
                          }}
                        >
                          📊 Últimos Partidos {model.awayName} (2026/27)
                        </button>
                      </div>

                      {/* TABLA CON FILTROS DUALES + ETIQUETA DE FUENTE DE DATOS */}
                      {openTeamStats?.matchIdx === i && (
                        <div style={{ backgroundColor: "#0f172a", borderRadius: "0.75rem", padding: "1.25rem", border: "1px solid #334155", overflowX: "auto" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
                            <h4 style={{ fontSize: "0.95rem", color: "#f8fafc", margin: 0, fontWeight: "bold" }}>
                              📋 Últimos Partidos — <span style={{ color: "#38bdf8" }}>{activeTeamName}</span>
                            </h4>

                            {/* BARRA DE FILTROS + CONMUTADORES */}
                            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                              
                              {/* 1. FILTRO DE CONDICIÓN (TODOS / SOLO LOCAL / SOLO VISITANTE) */}
                              <div style={{ display: "flex", backgroundColor: "#1e293b", borderRadius: "0.4rem", padding: "0.15rem", border: "1px solid #334155" }}>
                                <button
                                  onClick={() => setFiltroCondicion("TODOS")}
                                  style={{
                                    padding: "0.25rem 0.5rem",
                                    fontSize: "0.75rem",
                                    fontWeight: "bold",
                                    borderRadius: "0.3rem",
                                    border: "none",
                                    cursor: "pointer",
                                    backgroundColor: filtroCondicion === "TODOS" ? "#334155" : "transparent",
                                    color: "#ffffff"
                                  }}
                                >
                                  🏟️ Todos
                                </button>
                                <button
                                  onClick={() => setFiltroCondicion("LOCAL")}
                                  style={{
                                    padding: "0.25rem 0.5rem",
                                    fontSize: "0.75rem",
                                    fontWeight: "bold",
                                    borderRadius: "0.3rem",
                                    border: "none",
                                    cursor: "pointer",
                                    backgroundColor: filtroCondicion === "LOCAL" ? "#15803d" : "transparent",
                                    color: "#ffffff"
                                  }}
                                >
                                  🏠 Solo Casa
                                </button>
                                <button
                                  onClick={() => setFiltroCondicion("VISITANTE")}
                                  style={{
                                    padding: "0.25rem 0.5rem",
                                    fontSize: "0.75rem",
                                    fontWeight: "bold",
                                    borderRadius: "0.3rem",
                                    border: "none",
                                    cursor: "pointer",
                                    backgroundColor: filtroCondicion === "VISITANTE" ? "#b91c1c" : "transparent",
                                    color: "#ffffff"
                                  }}
                                >
                                  ✈️ Solo Fuera
                                </button>
                              </div>

                              {/* 2. CONMUTADOR INDIVIDUAL VS GLOBAL */}
                              <div style={{ display: "flex", backgroundColor: "#1e293b", borderRadius: "0.4rem", padding: "0.15rem", border: "1px solid #334155" }}>
                                <button
                                  onClick={() => setModoFiltro("INDIVIDUAL")}
                                  style={{
                                    padding: "0.25rem 0.6rem",
                                    fontSize: "0.75rem",
                                    fontWeight: "bold",
                                    borderRadius: "0.3rem",
                                    border: "none",
                                    cursor: "pointer",
                                    backgroundColor: modoFiltro === "INDIVIDUAL" ? "#0284c7" : "transparent",
                                    color: "#ffffff"
                                  }}
                                >
                                  👤 Individual
                                </button>
                                <button
                                  onClick={() => setModoFiltro("GLOBAL")}
                                  style={{
                                    padding: "0.25rem 0.6rem",
                                    fontSize: "0.75rem",
                                    fontWeight: "bold",
                                    borderRadius: "0.3rem",
                                    border: "none",
                                    cursor: "pointer",
                                    backgroundColor: modoFiltro === "GLOBAL" ? "#a855f7" : "transparent",
                                    color: "#ffffff"
                                  }}
                                >
                                  🌐 Global (Suma)
                                </button>
                              </div>

                              {/* 3. SELECTOR DE MERCADO */}
                              <select
                                value={filtroTipo}
                                onChange={(e: any) => setFiltroTipo(e.target.value)}
                                style={{ backgroundColor: "#1e293b", color: "#ffffff", border: "1px solid #38bdf8", padding: "0.35rem 0.5rem", borderRadius: "0.4rem", fontSize: "0.8rem" }}
                              >
                                <option value="NINGUNO">Sin filtro</option>
                                <option value="CORNERS">🚩 Córners</option>
                                <option value="TARJETAS">🟨 Tarjetas</option>
                                <option value="GOLES">⚽ Goles</option>
                                <option value="REMATES">👟 Remates</option>
                                <option value="PUERTA">🎯 A Puerta</option>
                              </select>

                              {filtroTipo === "CORNERS" && (
                                <select value={filtroValCorners} onChange={(e) => setFiltroValCorners(Number(e.target.value))} style={{ backgroundColor: "#1e293b", color: "#ffffff", border: "1px solid #38bdf8", padding: "0.35rem 0.5rem", borderRadius: "0.4rem", fontSize: "0.8rem" }}>
                                  {(modoFiltro === "INDIVIDUAL" ? [2.5, 3.5, 4.5, 5.5, 6.5] : [6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5]).map((v) => (
                                    <option key={v} value={v}>Más de {v}</option>
                                  ))}
                                </select>
                              )}

                              {filtroTipo === "TARJETAS" && (
                                <select value={filtroValTarjetas} onChange={(e) => setFiltroValTarjetas(Number(e.target.value))} style={{ backgroundColor: "#1e293b", color: "#ffffff", border: "1px solid #38bdf8", padding: "0.35rem 0.5rem", borderRadius: "0.4rem", fontSize: "0.8rem" }}>
                                  {(modoFiltro === "INDIVIDUAL" ? [0.5, 1.5, 2.5, 3.5] : [2.5, 3.5, 4.5, 5.5, 6.5]).map((v) => (
                                    <option key={v} value={v}>Más de {v}</option>
                                  ))}
                                </select>
                              )}

                              {filtroTipo === "GOLES" && (
                                <select value={filtroValGoles} onChange={(e) => setFiltroValGoles(Number(e.target.value))} style={{ backgroundColor: "#1e293b", color: "#ffffff", border: "1px solid #38bdf8", padding: "0.35rem 0.5rem", borderRadius: "0.4rem", fontSize: "0.8rem" }}>
                                  {(modoFiltro === "INDIVIDUAL" ? [0.5, 1.5, 2.5, 3.5] : [1.5, 2.5, 3.5, 4.5]).map((v) => (
                                    <option key={v} value={v}>Más de {v}</option>
                                  ))}
                                </select>
                              )}

                              {filtroTipo === "REMATES" && (
                                <select value={filtroValRemates} onChange={(e) => setFiltroValRemates(Number(e.target.value))} style={{ backgroundColor: "#1e293b", color: "#ffffff", border: "1px solid #38bdf8", padding: "0.35rem 0.5rem", borderRadius: "0.4rem", fontSize: "0.8rem" }}>
                                  {(modoFiltro === "INDIVIDUAL" ? [5.5, 7.5, 9.5, 10.5, 12.5, 14.5] : [16.5, 18.5, 20.5, 22.5, 24.5, 26.5]).map((v) => (
                                    <option key={v} value={v}>Más de {v}</option>
                                  ))}
                                </select>
                              )}

                              {filtroTipo === "PUERTA" && (
                                <select value={filtroValPuerta} onChange={(e) => setFiltroValPuerta(Number(e.target.value))} style={{ backgroundColor: "#1e293b", color: "#ffffff", border: "1px solid #38bdf8", padding: "0.35rem 0.5rem", borderRadius: "0.4rem", fontSize: "0.8rem" }}>
                                  {(modoFiltro === "INDIVIDUAL" ? [0.5, 1.5, 2.5, 3.5, 4.5] : [5.5, 6.5, 7.5, 8.5, 9.5]).map((v) => (
                                    <option key={v} value={v}>Más de {v}</option>
                                  ))}
                                </select>
                              )}

                              {filtroTipo !== "NINGUNO" && (
                                <span style={{ fontSize: "0.85rem", fontWeight: "bold", color: pctAcierto >= 70 ? "#4ade80" : "#f87171", marginLeft: "0.5rem" }}>
                                  Aciertos: {conteoAciertos}/{totalMuestra} ({pctAcierto}%)
                                </span>
                              )}
                            </div>
                          </div>

                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "center" }}>
                            <thead>
                              <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8", backgroundColor: "#1e293b" }}>
                                <th style={{ padding: "0.6rem", textAlign: "left" }}>#</th>
                                <th style={{ padding: "0.6rem", textAlign: "left" }}>Partido</th>
                                <th style={{ padding: "0.6rem" }}>Fuente</th>
                                <th style={{ padding: "0.6rem", borderLeft: filtroTipo === "CORNERS" ? "2px solid #38bdf8" : "none", borderRight: filtroTipo === "CORNERS" ? "2px solid #38bdf8" : "none" }}>Córners</th>
                                <th style={{ padding: "0.6rem", borderLeft: filtroTipo === "TARJETAS" ? "2px solid #38bdf8" : "none", borderRight: filtroTipo === "TARJETAS" ? "2px solid #38bdf8" : "none" }}>Tarjetas</th>
                                <th style={{ padding: "0.6rem", borderLeft: filtroTipo === "GOLES" ? "2px solid #38bdf8" : "none", borderRight: filtroTipo === "GOLES" ? "2px solid #38bdf8" : "none" }}>Goles</th>
                                <th style={{ padding: "0.6rem", borderLeft: filtroTipo === "REMATES" ? "2px solid #38bdf8" : "none", borderRight: filtroTipo === "REMATES" ? "2px solid #38bdf8" : "none" }}>Remates</th>
                                <th style={{ padding: "0.6rem", borderLeft: filtroTipo === "PUERTA" ? "2px solid #38bdf8" : "none", borderRight: filtroTipo === "PUERTA" ? "2px solid #38bdf8" : "none" }}>A Puerta</th>
                              </tr>
                            </thead>
                            <tbody>
                              {activeHistorial.length === 0 ? (
                                <tr>
                                  <td colSpan={8} style={{ padding: "1.5rem", color: "#94a3b8", fontStyle: "italic" }}>
                                    No hay partidos que coincidan con la condición seleccionada.
                                  </td>
                                </tr>
                              ) : (
                                activeHistorial.map((p) => {
                                  const cumple = evaluarFiltroMatch(p);

                                  return (
                                    <tr key={p.num} style={{ borderBottom: "1px solid #1e293b" }}>
                                      <td style={{ padding: "0.5rem", color: "#64748b", fontWeight: "bold", textAlign: "left" }}>{p.num}</td>
                                      
                                      <td style={{ padding: "0.5rem", textAlign: "left" }}>
                                        {p.esLocal ? (
                                          <>
                                            <strong style={{ color: "#38bdf8", fontWeight: "bold" }}>{activeTeamName}</strong> vs <span style={{ color: "#94a3b8" }}>{p.rival}</span> <span style={{ fontSize: "0.7rem", color: "#15803d", marginLeft: "0.2rem" }}>(Local)</span>
                                          </>
                                        ) : (
                                          <>
                                            <span style={{ color: "#94a3b8" }}>{p.rival}</span> vs <strong style={{ color: "#38bdf8", fontWeight: "bold" }}>{activeTeamName}</strong> <span style={{ fontSize: "0.7rem", color: "#b91c1c", marginLeft: "0.2rem" }}>(Visitante)</span>
                                          </>
                                        )}
                                      </td>

                                      {/* ETIQUETA DE FUENTE (REAL VS ESTIMADO) */}
                                      <td style={{ padding: "0.5rem" }}>
                                        <span style={{
                                          fontSize: "0.7rem",
                                          padding: "0.15rem 0.4rem",
                                          borderRadius: "0.25rem",
                                          fontWeight: "bold",
                                          backgroundColor: p.fuenteTag === "Real" ? "rgba(34, 197, 94, 0.2)" : "rgba(148, 163, 184, 0.2)",
                                          color: p.fuenteTag === "Real" ? "#4ade80" : "#94a3b8",
                                          border: p.fuenteTag === "Real" ? "1px solid #22c55e" : "1px solid #64748b"
                                        }}>
                                          {p.fuenteTag}
                                        </span>
                                      </td>

                                      {/* CÓRNERS */}
                                      <td style={{ padding: "0.5rem", ...(filtroTipo === "CORNERS" ? obtenerEstiloCelda(cumple) : {}) }}>
                                        {modoFiltro === "GLOBAL" ? (
                                          <strong>{p.cornersTotal} total</strong>
                                        ) : p.esLocal ? (
                                          <>
                                            <strong style={{ color: filtroTipo === "CORNERS" ? "inherit" : "#38bdf8" }}>{p.cornersFav}</strong> vs <span style={{ color: filtroTipo === "CORNERS" ? "inherit" : "#94a3b8" }}>{p.cornersRival}</span>
                                          </>
                                        ) : (
                                          <>
                                            <span style={{ color: filtroTipo === "CORNERS" ? "inherit" : "#94a3b8" }}>{p.cornersRival}</span> vs <strong style={{ color: filtroTipo === "CORNERS" ? "inherit" : "#38bdf8" }}>{p.cornersFav}</strong>
                                          </>
                                        )}
                                      </td>

                                      {/* TARJETAS */}
                                      <td style={{ padding: "0.5rem", ...(filtroTipo === "TARJETAS" ? obtenerEstiloCelda(cumple) : {}) }}>
                                        {modoFiltro === "GLOBAL" ? (
                                          <strong>{p.tarjetasTotal} total</strong>
                                        ) : p.esLocal ? (
                                          <>
                                            <strong style={{ color: filtroTipo === "TARJETAS" ? "inherit" : "#38bdf8" }}>{p.tarjetasFav}</strong> vs <span style={{ color: filtroTipo === "TARJETAS" ? "inherit" : "#94a3b8" }}>{p.tarjetasRival}</span>
                                          </>
                                        ) : (
                                          <>
                                            <span style={{ color: filtroTipo === "TARJETAS" ? "inherit" : "#94a3b8" }}>{p.tarjetasRival}</span> vs <strong style={{ color: filtroTipo === "TARJETAS" ? "inherit" : "#38bdf8" }}>{p.tarjetasFav}</strong>
                                          </>
                                        )}
                                      </td>

                                      {/* GOLES */}
                                      <td style={{ padding: "0.5rem", ...(filtroTipo === "GOLES" ? obtenerEstiloCelda(cumple) : {}) }}>
                                        {modoFiltro === "GLOBAL" ? (
                                          <strong>{p.golesTotal} total</strong>
                                        ) : p.esLocal ? (
                                          <>
                                            <strong style={{ color: filtroTipo === "GOLES" ? "inherit" : "#38bdf8" }}>{p.golesFav}</strong> vs <span style={{ color: filtroTipo === "GOLES" ? "inherit" : "#94a3b8" }}>{p.golesRival}</span>
                                          </>
                                        ) : (
                                          <>
                                            <span style={{ color: filtroTipo === "GOLES" ? "inherit" : "#94a3b8" }}>{p.golesRival}</span> vs <strong style={{ color: filtroTipo === "GOLES" ? "inherit" : "#38bdf8" }}>{p.golesFav}</strong>
                                          </>
                                        )}
                                      </td>

                                      {/* REMATES */}
                                      <td style={{ padding: "0.5rem", ...(filtroTipo === "REMATES" ? obtenerEstiloCelda(cumple) : {}) }}>
                                        {modoFiltro === "GLOBAL" ? (
                                          <strong>{p.rematesTotal} total</strong>
                                        ) : p.esLocal ? (
                                          <>
                                            <strong style={{ color: filtroTipo === "REMATES" ? "inherit" : "#38bdf8" }}>{p.rematesFav}</strong> vs <span style={{ color: filtroTipo === "REMATES" ? "inherit" : "#94a3b8" }}>{p.rematesRival}</span>
                                          </>
                                        ) : (
                                          <>
                                            <span style={{ color: filtroTipo === "REMATES" ? "inherit" : "#94a3b8" }}>{p.rematesRival}</span> vs <strong style={{ color: filtroTipo === "REMATES" ? "inherit" : "#38bdf8" }}>{p.rematesFav}</strong>
                                          </>
                                        )}
                                      </td>

                                      {/* A PUERTA */}
                                      <td style={{ padding: "0.5rem", ...(filtroTipo === "PUERTA" ? obtenerEstiloCelda(cumple) : {}) }}>
                                        {modoFiltro === "GLOBAL" ? (
                                          <strong>{p.rematesPuertaTotal} total</strong>
                                        ) : p.esLocal ? (
                                          <>
                                            <strong style={{ color: filtroTipo === "PUERTA" ? "inherit" : "#38bdf8" }}>{p.rematesPuertaFav}</strong> vs <span style={{ color: filtroTipo === "PUERTA" ? "inherit" : "#94a3b8" }}>{p.rematesPuertaRival}</span>
                                          </>
                                        ) : (
                                          <>
                                            <span style={{ color: filtroTipo === "PUERTA" ? "inherit" : "#94a3b8" }}>{p.rematesPuertaRival}</span> vs <strong style={{ color: filtroTipo === "PUERTA" ? "inherit" : "#38bdf8" }}>{p.rematesPuertaFav}</strong>
                                          </>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* BLOQUE APUESTA TOP CONFIANZA (+90%) */}
                      {picksTopConfianza.length > 0 && (
                        <div style={{ backgroundColor: "#064e3b", borderRadius: "0.75rem", padding: "1rem", border: "2px solid #10b981", boxShadow: "0 0 15px rgba(16, 185, 129, 0.2)" }}>
                          <h3 style={{ fontSize: "1rem", color: "#34d399", margin: "0 0 0.75rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            💎 APUESTA TOP CONFIANZA (+90%)
                          </h3>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem" }}>
                            {picksTopConfianza.map((p, idx) => (
                              <div key={idx} style={{ backgroundColor: "#022c22", padding: "0.75rem", borderRadius: "0.5rem", borderLeft: `4px solid ${p.color}` }}>
                                <span style={{ fontSize: "0.75rem", color: "#a7f3d0", display: "block" }}>{p.titulo}</span>
                                <strong style={{ fontSize: "1.1rem", color: "#ffffff" }}>{p.val}</strong>
                                {isAdmin && (
                                  <span style={{ fontSize: "0.75rem", color: "#34d399", display: "block", marginTop: "0.2rem", fontWeight: "bold" }}>
                                    Probabilidad Admin: {p.prob}%
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* PANEL DE RECOMENDACIONES REGULARES (+70%) */}
                      <div style={{ backgroundColor: "#0f172a", borderRadius: "0.75rem", padding: "1rem", border: "1px solid #f59e0b" }}>
                        <h3 style={{ fontSize: "1rem", color: "#f59e0b", margin: "0 0 0.75rem 0" }}>
                          ⭐ Picks Recomendados (+70%)
                        </h3>

                        {picksNormales.length === 0 && picksTopConfianza.length === 0 ? (
                          <p style={{ fontSize: "0.85rem", color: "#94a3b8", margin: 0, fontStyle: "italic" }}>
                            Sin recomendaciones que superen el filtro del 70% para este partido.
                          </p>
                        ) : picksNormales.length === 0 ? (
                          <p style={{ fontSize: "0.85rem", color: "#94a3b8", margin: 0, fontStyle: "italic" }}>
                            Todas las recomendaciones superan el 90% (ver bloque verde superior).
                          </p>
                        ) : (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem" }}>
                            {picksNormales.map((p, idx) => (
                              <div key={idx} style={{ backgroundColor: "#1e293b", padding: "0.75rem", borderRadius: "0.5rem" }}>
                                <span style={{ fontSize: "0.75rem", color: "#94a3b8", display: "block" }}>{p.titulo}</span>
                                <strong style={{ fontSize: "1.1rem", color: p.color }}>{p.val}</strong>
                                {isAdmin && (
                                  <span style={{ fontSize: "0.75rem", color: "#94a3b8", display: "block", marginTop: "0.2rem" }}>
                                    Probabilidad Admin: {p.prob}%
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* CONTROLES ADMIN */}
                      {isAdmin && (
                        <div style={{ backgroundColor: "#0f172a", borderRadius: "0.5rem", padding: "0.85rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                          <div>
                            <div style={{ fontSize: "0.75rem", color: "#38bdf8", fontWeight: "bold", marginBottom: "0.4rem" }}>Ajustes {model.homeName}</div>
                            <label style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#94a3b8" }}>
                              <span>Plantilla Disponible (Bajas):</span>
                              <strong>{currentParams.bajasHome}%</strong>
                            </label>
                            <input
                              type="range"
                              min="30"
                              max="100"
                              value={currentParams.bajasHome}
                              onChange={(e) => handleParamChange(i, "bajasHome", Number(e.target.value))}
                              style={{ width: "100%", accentColor: "#38bdf8", cursor: "pointer" }}
                            />

                            <label style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#94a3b8", marginTop: "0.4rem" }}>
                              <span>Descanso / Frescura (Fatiga):</span>
                              <strong>{currentParams.fatigaHome}%</strong>
                            </label>
                            <input
                              type="range"
                              min="30"
                              max="100"
                              value={currentParams.fatigaHome}
                              onChange={(e) => handleParamChange(i, "fatigaHome", Number(e.target.value))}
                              style={{ width: "100%", accentColor: "#38bdf8", cursor: "pointer" }}
                            />
                          </div>

                          <div>
                            <div style={{ fontSize: "0.75rem", color: "#f87171", fontWeight: "bold", marginBottom: "0.4rem" }}>Ajustes {model.awayName}</div>
                            <label style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#94a3b8" }}>
                              <span>Plantilla Disponible (Bajas):</span>
                              <strong>{currentParams.bajasAway}%</strong>
                            </label>
                            <input
                              type="range"
                              min="30"
                              max="100"
                              value={currentParams.bajasAway}
                              onChange={(e) => handleParamChange(i, "bajasAway", Number(e.target.value))}
                              style={{ width: "100%", accentColor: "#f87171", cursor: "pointer" }}
                            />

                            <label style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#94a3b8", marginTop: "0.4rem" }}>
                              <span>Descanso / Frescura (Fatiga):</span>
                              <strong>{currentParams.fatigaAway}%</strong>
                            </label>
                            <input
                              type="range"
                              min="30"
                              max="100"
                              value={currentParams.fatigaAway}
                              onChange={(e) => handleParamChange(i, "fatigaAway", Number(e.target.value))}
                              style={{ width: "100%", accentColor: "#f87171", cursor: "pointer" }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
