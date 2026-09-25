import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const league = searchParams.get('league') || 'PD';
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Configuración incompleta: Falta la variable FOOTBALL_DATA_API_KEY en Vercel.' },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(`https://api.football-data.org/v4/competitions/${league}/standings`, {
      headers: {
        'X-Auth-Token': apiKey,
      },
      next: { revalidate: 3600 } // Caché de 1 hora
    });

    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json(
        { error: `Error en respuesta de Football-Data API (${res.status})`, details: errorText },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json({
      status: 'success',
      league,
      standings: data.standings || []
    });
  } catch (err: any) {
    console.error('Error en API standings:', err.message);
    return NextResponse.json(
      { error: 'Error interno del servidor al consultar la clasificación', details: err.message },
      { status: 500 }
    );
  }
}