import React from 'react';

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Cabecera */}
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

        {/* Panel del Radar de Valor */}
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

      </div>
    </main>
  );
}