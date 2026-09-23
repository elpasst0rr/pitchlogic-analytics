import React from 'react';

interface MetricPrediction {
  label: string;
  market: string;
  probability: number;
  color: 'green' | 'yellow' | 'red';
}

const predictions: MetricPrediction[] = [
  { label: 'Córners Totales', market: '+8.5 Córners', probability: 82, color: 'green' },
  { label: 'Tarjetas Totales', market: '+4.5 Tarjetas', probability: 64, color: 'yellow' },
  { label: 'Goles Totales', market: '+2.5 Goles', probability: 38, color: 'red' },
];

export default function ValueRadar() {
  const getColorStyles = (color: MetricPrediction['color']) => {
    switch (color) {
      case 'green':
        return {
          bar: 'bg-emerald-500',
          badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          text: 'Alta Probabilidad',
        };
      case 'yellow':
        return {
          bar: 'bg-amber-500',
          badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
          text: 'Probabilidad Media',
        };
      case 'red':
        return {
          bar: 'bg-rose-500',
          badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
          text: 'Baja Probabilidad',
        };
    }
  };

  return (
    <div className="w-full max-w-xl p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl text-white my-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold tracking-wide">Radar de Valor</h3>
          <p className="text-xs text-slate-400">Predicción probabilística basada en xG y promedios</p>
        </div>
        <span className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-full">
          Algoritmo v1.0
        </span>
      </div>

      <div className="space-y-5">
        {predictions.map((item, index) => {
          const style = getColorStyles(item.color);
          return (
            <div key={index} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-semibold text-slate-200">{item.label}</span>
                  <span className="ml-2 text-xs text-slate-400">({item.market})</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-0.5 text-xs font-medium border rounded-md ${style.badge}`}>
                    {style.text}
                  </span>
                  <span className="font-mono font-bold text-base">{item.probability}%</span>
                </div>
              </div>

              <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${style.bar}`}
                  style={{ width: `${item.probability}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}