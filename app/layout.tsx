import React from 'react';
import './globals.css';

export const metadata = {
  title: 'PitchLogic Analytics',
  description: 'Análisis predictivo de rendimiento deportivo',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="bg-slate-950 text-slate-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}