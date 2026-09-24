import React from 'react';

export default function Home() {
  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#020617', color: '#f8fafc', padding: '2rem', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: '72rem', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* Cabecera original */}
        <header style={{ borderBottom: '1px solid #1e293b', paddingBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#34d399', margin: 0 }}>
              PitchLogic Analytics
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem', margin: 0 }}>
              Plataforma de análisis predictivo y rendimiento deportivo
            </p>
          </div>
          <span style={{ padding: '0.25rem 0.75rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 }}>
            Sistema En Línea 🟢
          </span>
        </header>

        {/* Panel del Radar de Valor de la Plantilla */}
        <section style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
              Radar de Valor de la Plantilla
            </h2>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', backgroundColor: '#1e293b', padding: '0.25rem 0.625rem', borderRadius: '0.25rem' }}>
              Métricas Algorítmicas
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Métrica 1 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                <span style={{ color: '#cbd5e1' }}>Rendimiento Técnico</span>
                <span style={{ color: '#34d399', fontWeight: 'bold' }}>88 / 100</span>
              </div>
              <div style={{ width: '100%', backgroundColor: '#1e293b', height: '0.75rem', borderRadius: '9999px', overflow: 'hidden' }}>
                <div style={{ backgroundColor: '#10b981', height: '100%', width: '88%', borderRadius: '9999px' }} />
              </div>
            </div>

            {/* Métrica 2 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                <span style={{ color: '#cbd5e1' }}>Potencial de Mercado</span>
                <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>74 / 100</span>
              </div>
              <div style={{ width: '100%', backgroundColor: '#1e293b', height: '0.75rem', borderRadius: '9999px', overflow: 'hidden' }}>
                <div style={{ backgroundColor: '#f59e0b', height: '100%', width: '74%', borderRadius: '9999px' }} />
              </div>
            </div>

            {/* Métrica 3 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                <span style={{ color: '#cbd5e1' }}>Riesgo de Lesión</span>
                <span style={{ color: '#fb7185', fontWeight: 'bold' }}>18 / 100 (Bajo)</span>
              </div>
              <div style={{ width: '100%', backgroundColor: '#1e293b', height: '0.75rem', borderRadius: '9999px', overflow: 'hidden' }}>
                <div style={{ backgroundColor: '#f43f5e', height: '100%', width: '18%', borderRadius: '9999px' }} />
              </div>
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}