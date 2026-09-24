
import React from 'react';
import ValueRadar from '@/components/ValueRadar';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-950">
      <div className="w-full max-w-4xl space-y-6 flex flex-col items-center">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          PitchLogic Analytics
        </h1>
        <p className="text-slate-400 text-sm">
          Panel de análisis predictivo y métricas avanzadas
        </p>

        {/* Componente Radar de Valor */}
        <ValueRadar />
      </div>
    </main>
  );
}
