import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Configuración de Supabase incompleta: Faltan SUPABASE_URL o SUPABASE_ANON_KEY en las variables de entorno.');
  }

  if (!supabaseUrl.startsWith('http://') && !supabaseUrl.startsWith('https://')) {
    throw new Error(`URL de Supabase inválida: "${supabaseUrl}". Debe comenzar por http:// o https://`);
  }

  return createClient(supabaseUrl, supabaseKey);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const league = searchParams.get('league') || 'PD';

  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('match_stats_cache')
      .select('*')
      .order('match_date', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error consultando Supabase:', error);
      return NextResponse.json(
        { error: 'Error en la consulta a la base de datos', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: 'success',
      league,
      matches: data || []
    });
  } catch (err: any) {
    console.error('Error en API matches:', err.message);
    return NextResponse.json(
      { error: 'Error de configuración o servidor', details: err.message },
      { status: 500 }
    );
  }
}