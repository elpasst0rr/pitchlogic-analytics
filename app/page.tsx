import React from 'react';

export default function Home() {
  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#020617', color: '#f8fafc', padding: '2rem', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: '80rem', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* Cabecera */}
        <header style={{ borderBottom: '1px solid #1e293b', paddingBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#34d399', margin: 0 }}>
              PitchLogic Analytics
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem', margin: 0 }}>
              Plataforma de análisis predictivo, rendimiento y gestión deportiva
            </p>
          </div>
          <span style={{ padding: '0.35rem 0.85rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 }}>
            Sistema En Línea 🟢
          </span>
        </header>

        {/* Radar de Valor */}
        <section style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
              Radar de Valor de la Plantilla
            </h2>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', backgroundColor: '#1e293b', padding: '0.25rem 0.625rem', borderRadius: '0.25rem' }}>
              Métricas Algorítmicas
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                <span style={{ color: '#cbd5e1' }}>Rendimiento Técnico</span>
                <span style={{ color: '#34d399', fontWeight: 'bold' }}>88 / 100</span>
              </div>
              <div style={{ width: '100%', backgroundColor: '#1e293b', height: '0.75rem', borderRadius: '9999px', overflow: 'hidden' }}>
                <div style={{ backgroundColor: '#10b981', height: '100%', width: '88%', borderRadius: '9999px' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                <span style={{ color: '#cbd5e1' }}>Potencial de Mercado</span>
                <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>74 / 100</span>
              </div>
              <div style={{ width: '100%', backgroundColor: '#1e293b', height: '0.75rem', borderRadius: '9999px', overflow: 'hidden' }}>
                <div style={{ backgroundColor: '#f59e0b', height: '100%', width: '74%', borderRadius: '9999px' }} />
              </div>
            </div>

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

        {/* Bloque Doble: Clasificación y Próximos Partidos */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
          
          {/* Clasificación */}
          <section style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f8fafc', marginBottom: '1rem', margin: 0 }}>
              Clasificación de la Liga
            </h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginTop: '1rem', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#94a3b8' }}>
                  <th style={{ padding: '0.5rem' }}>Pos</th>
                  <th style={{ padding: '0.5rem' }}>Equipo</th>
                  <th style={{ padding: '0.5rem' }}>PJ</th>
                  <th style={{ padding: '0.5rem' }}>DG</th>
                  <th style={{ padding: '0.5rem' }}>Pts</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#34d399', fontWeight: 600 }}>
                  <td style={{ padding: '0.5rem' }}>1</td>
                  <td style={{ padding: '0.5rem' }}>PitchLogic FC</td>
                  <td style={{ padding: '0.5rem' }}>12</td>
                  <td style={{ padding: '0.5rem' }}>+18</td>
                  <td style={{ padding: '0.5rem' }}>31</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '0.5rem' }}>2</td>
                  <td style={{ padding: '0.5rem' }}>Real CD</td>
                  <td style={{ padding: '0.5rem' }}>12</td>
                  <td style={{ padding: '0.5rem' }}>+12</td>
                  <td style={{ padding: '0.5rem' }}>28</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '0.5rem' }}>3</td>
                  <td style={{ padding: '0.5rem' }}>Atlético Norte</td>
                  <td style={{ padding: '0.5rem' }}>12</td>
                  <td style={{ padding: '0.5rem' }}>+8</td>
                  <td style={{ padding: '0.5rem' }}>24</td>
                </tr>
                <tr>
                  <td style={{ padding: '0.5rem' }}>4</td>
                  <td style={{ padding: '0.5rem' }}>Deportivo Sur</td>
                  <td style={{ padding: '0.5rem' }}>12</td>
                  <td style={{ padding: '0.5rem' }}>+3</td>
                  <td style={{ padding: '0.5rem' }}>21</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Próximos Partidos */}
          <section style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f8fafc', marginBottom: '1rem', margin: 0 }}>
              Próximos Partidos
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
              <div style={{ padding: '0.85rem', backgroundColor: '#1e293b', borderRadius: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>PitchLogic FC vs Atlético Norte</p>
                  <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.2rem' }}>Jornada 13 • Local</p>
                </div>
                <span style={{ fontSize: '0.75rem', backgroundColor: '#020617', padding: '0.3rem 0.6rem', borderRadius: '0.25rem', color: '#34d399', fontWeight: 600 }}>Sáb 18:00</span>
              </div>

              <div style={{ padding: '0.85rem', backgroundColor: '#1e293b', borderRadius: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>Real CD vs PitchLogic FC</p>
                  <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.2rem' }}>Jornada 14 • Visitante</p>
                </div>
                <span style={{ fontSize: '0.75rem', backgroundColor: '#020617', padding: '0.3rem 0.6rem', borderRadius: '0.25rem', color: '#cbd5e1' }}>Dom 21:00</span>
              </div>
            </div>
          </section>

        </div>

        {/* Estadísticas Generales */}
        <section style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f8fafc', marginBottom: '1rem', margin: 0 }}>
            Estadísticas Generales
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
            <div style={{ padding: '1rem', backgroundColor: '#1e293b', borderRadius: '0.5rem' }}>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.8rem' }}>Goles a Favor</p>
              <p style={{ margin: '0.3rem 0 0 0', fontSize: '1.5rem', fontWeight: 'bold', color: '#34d399' }}>29</p>
            </div>
            <div style={{ padding: '1rem', backgroundColor: '#1e293b', borderRadius: '0.5rem' }}>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.8rem' }}>Goles en Contra</p>
              <p style={{ margin: '0.3rem 0 0 0', fontSize: '1.5rem', fontWeight: 'bold', color: '#fb7185' }}>11</p>
            </div>
            <div style={{ padding: '1rem', backgroundColor: '#1e293b', borderRadius: '0.5rem' }}>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.8rem' }}>Posesión Media</p>
              <p style={{ margin: '0.3rem 0 0 0', fontSize: '1.5rem', fontWeight: 'bold', color: '#fbbf24' }}>61.4%</p>
            </div>
            <div style={{ padding: '1rem', backgroundColor: '#1e293b', borderRadius: '0.5rem' }}>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.8rem' }}>Efectividad Pase</p>
              <p style={{ margin: '0.3rem 0 0 0', fontSize: '1.5rem', fontWeight: 'bold', color: '#38bdf8' }}>87.2%</p>
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}