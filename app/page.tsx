import React from 'react';

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Cabecera original */}
        <header className="border-b border-slate-800 pb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-emerald-400">
              PitchLogic Analytics
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Plataforma de análisis predictivo y rendimiento deportivo
            </p>
          </div>
          <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-semibold">
            Sistema En Línea 🟢
          </span>
        </header>

        {/* Tarjetas de Resumen (KPIs) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Jugadores Monitorizados</p>
            <h3 className="text-2xl font-bold text-slate-100 mt-2">24</h3>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Valor Total Plantilla</p>
            <h3 className="text-2xl font-bold text-emerald-400 mt-2">€142.5M</h3>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Eficiencia Promedio</p>
            <h3 className="text-2xl font-bold text-amber-400 mt-2">84.2%</h3>
          </div>
        </div>

        {/* Panel del Radar de Valor (Original) */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-slate-100">
              Radar de Valor de la Plantilla
            </h2>
            <span className="text-xs text-slate-400 bg-slate-800 px-2.5 py-1 rounded">
              Métricas Algorítmicas
            </span>
          </div>

          <div className="space-y-4">
            {/* Métrica 1 */}
            <div>
              <div className="flex justify-between text-sm font-medium mb-1">
                <span className="text-slate-300">Rendimiento Técnico</span>
                <span className="text-emerald-400 font-bold">88 / 100</span>
              </div>
              <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full w-[88%]" />
              </div>
            </div>

            {/* Métrica 2 */}
            <div>
              <div className="flex justify-between text-sm font-medium mb-1">
                <span className="text-slate-300">Potencial de Mercado</span>
                <span className="text-amber-400 font-bold">74 / 100</span>
              </div>
              <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden">
                <div className="bg-amber-500 h-full rounded-full w-[74%]" />
              </div>
            </div>

            {/* Métrica 3 */}
            <div>
              <div className="flex justify-between text-sm font-medium mb-1">
                <span className="text-slate-300">Riesgo de Lesión</span>
                <span className="text-rose-400 font-bold">18 / 100 (Bajo)</span>
              </div>
              <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden">
                <div className="bg-rose-500 h-full rounded-full w-[18%]" />
              </div>
            </div>
          </div>
        </section>

        {/* Tabla de Jugadores */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl overflow-x-auto">
          <h2 className="text-xl font-semibold text-slate-100 mb-4">
            Análisis Individual de Jugadores
          </h2>
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-medium">
                <th className="py-3 px-2">Jugador</th>
                <th className="py-3 px-2">Posición</th>
                <th className="py-3 px-2">Rendimiento</th>
                <th className="py-3 px-2">Valor Mercado</th>
                <th className="py-3 px-2">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              <tr>
                <td className="py-3 px-2 font-semibold text-slate-200">Carlos Alcaraz</td>
                <td className="py-3 px-2 text-slate-400">Centrocampista</td>
                <td className="py-3 px-2 text-emerald-400 font-bold">92</td>
                <td className="py-3 px-2 text-slate-300">€45.0M</td>
                <td className="py-3 px-2"><span className="text-emerald-400 text-xs bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">Disponible</span></td>
              </tr>
              <tr>
                <td className="py-3 px-2 font-semibold text-slate-200">Mateo Silva</td>
                <td className="py-3 px-2 text-slate-400">Delantero</td>
                <td className="py-3 px-2 text-emerald-400 font-bold">85</td>
                <td className="py-3 px-2 text-slate-300">€38.0M</td>
                <td className="py-3 px-2"><span className="text-emerald-400 text-xs bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">Disponible</span></td>
              </tr>
              <tr>
                <td className="py-3 px-2 font-semibold text-slate-200">David Rubio</td>
                <td className="py-3 px-2 text-slate-400">Defensa</td>
                <td className="py-3 px-2 text-amber-400 font-bold">78</td>
                <td className="py-3 px-2 text-slate-300">€18.5M</td>
                <td className="py-3 px-2"><span className="text-rose-400 text-xs bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">Duda Lesión</span></td>
              </tr>
            </tbody>
          </table>
        </section>

      </div>
    </main>
  );
}