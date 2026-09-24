import React from 'react';

export default function Home() {
  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#020617', color: '#f8fafc', padding: '2rem', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: '80rem', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* Cabecera PitchLogic Analytics */}
        <header style={{ borderBottom: '1px solid #1e293b', paddingBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#34d399', margin: 0 }}>
              PitchLogic Analytics
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem', margin: 0 }}>
              Modelo de Análisis Predictivo y Alertas de Valor - MVP LaLiga
            </p>
          </div>
          <span style={{ padding: '0.35rem 0.85rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 }}>
            Motor en Línea 🟢
          </span>
        </header>

        {/* Resumen del Algoritmo de 4 Capas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', padding: '1rem', borderRadius: '0.5rem' }}>
            <p style={{ color: '#94a3b8', fontSize: '0.75rem', margin: 0 }}>Capa 1: Rendimiento Base</p>
            <h4 style={{ color: '#34d399', margin: '0.25rem 0 0 0', fontSize: '1.1rem' }}>40% (xG / xGA)</h4>
          </div>
          <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', padding: '1rem', borderRadius: '0.5rem' }}>
            <p style={{ color: '#94a3b8', fontSize: '0.75rem', margin: 0 }}>Capa 2: Plantilla y Bajas</p>
            <h4 style={{ color: '#38bdf8', margin: '0.25rem 0 0 0', fontSize: '1.1rem' }}>25% (Ausencias)</h4>
          </div>
          <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', padding: '1rem', borderRadius: '0.5rem' }}>
            <p style={{ color: '#94a3b8', fontSize: '0.75rem', margin: 0 }}>Capa 3: Descanso y Fatiga</p>
            <h4 style={{ color: '#fbbf24', margin: '0.25rem 0 0 0', fontSize: '1.1rem' }}>20% (Rotación/Viajes)</h4>
          </div>
          <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', padding: '1rem', borderRadius: '0.5rem' }}>
            <p style={{ color: '#94a3b8', fontSize: '0.75rem', margin: 0 }}>Capa 4: Contexto / H2H</p>
            <h4 style={{ color: '#f43f5e', margin: '0.25rem 0 0 0', fontSize: '1.1rem' }}>15% (Clima/Árbitro)</h4>
          </div>
        </div>

        {/* Tabla de Predicciones y Alertas de Valor - LaLiga */}
        <section style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', padding: '1.5rem', overflowX: 'auto' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f8fafc', marginBottom: '1rem', margin: 0 }}>
            Análisis de Jornada y Alertas de Valor (LaLiga)
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginTop: '1rem', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b', color: '#94a3b8' }}>
                <th style={{ padding: '0.75rem' }}>Encuentro</th>
                <th style={{ padding: '0.75rem' }}>Prob. Local</th>
                <th style={{ padding: '0.75rem' }}>Prob. Visitante</th>
                <th style={{ padding: '0.75rem' }}>Cuota Victoria</th>
                <th style={{ padding: '0.75rem' }}>Diagnóstico / Alerta</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #1e293b' }}>
                <td style={{ padding: '0.75rem', fontWeight: 600 }}>Español vs Elche</td>
                <td style={{ padding: '0.75rem', color: '#34d399' }}>60.1%</td>
                <td style={{ padding: '0.75rem', color: '#cbd5e1' }}>39.9%</td>
                <td style={{ padding: '0.75rem' }}>1.83</td>
                <td style={{ padding: '0.75rem' }}><span style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', fontWeight: 600 }}>ALERTA DE VALOR (LOCAL)</span></td>
              </tr>
              <tr style={{ borderBottom: '1px solid #1e293b' }}>
                <td style={{ padding: '0.75rem', fontWeight: 600 }}>Osasuna vs Rayo Vallecano</td>
                <td style={{ padding: '0.75rem', color: '#34d399' }}>55.7%</td>
                <td style={{ padding: '0.75rem', color: '#cbd5e1' }}>44.3%</td>
                <td style={{ padding: '0.75rem' }}>2.55</td>
                <td style={{ padding: '0.75rem' }}><span style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', fontWeight: 600 }}>ALERTA DE VALOR (LOCAL)</span></td>
              </tr>
              <tr style={{ borderBottom: '1px solid #1e293b' }}>
                <td style={{ padding: '0.75rem', fontWeight: 600 }}>Athletic vs Alavés</td>
                <td style={{ padding: '0.75rem', color: '#34d399' }}>52.9%</td>
                <td style={{ padding: '0.75rem', color: '#cbd5e1' }}>47.1%</td>
                <td style={{ padding: '0.75rem' }}>1.61</td>
                <td style={{ padding: '0.75rem' }}><span style={{ backgroundColor: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem' }}>Sin Valor Claro</span></td>
              </tr>
              <tr style={{ borderBottom: '1px solid #1e293b' }}>
                <td style={{ padding: '0.75rem', fontWeight: 600 }}>Sevilla vs Barcelona</td>
                <td style={{ padding: '0.75rem', color: '#34d399' }}>50.0%</td>
                <td style={{ padding: '0.75rem', color: '#cbd5e1' }}>50.0%</td>
                <td style={{ padding: '0.75rem' }}>11.90</td>
                <td style={{ padding: '0.75rem' }}><span style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', fontWeight: 600 }}>ALERTA DE VALOR (LOCAL)</span></td>
              </tr>
              <tr>
                <td style={{ padding: '0.75rem', fontWeight 600 }}>Atlético vs Real Madrid</td>
                <td style={{ padding: '0.75rem', color: '#34d399' }}>47.4%</td>
                <td style={{ padding: '0.75rem', color: '#cbd5e1' }}>52.6%</td>
                <td style={{ padding: '0.75rem' }}>3.72</td>
                <td style={{ padding: '0.75rem' }}><span style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', fontWeight: 600 }}>ALERTA DE VALOR (LOCAL)</span></td>
              </tr>
            </tbody>
          </table>
        </section>

      </div>
    </main>
  );
}