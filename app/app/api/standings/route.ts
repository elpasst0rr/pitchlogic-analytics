import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const league = searchParams.get('league') || 'PD';

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  // Validar si la URL empieza por http:// o https://
  const isValidUrl = supabaseUrl.startsWith('http://') || supabaseUrl.startsWith('https://');

  if (!isValidUrl || !supabaseKey) {
    return NextResponse.json({
      status: 'warning',
      league,
      message: 'Base de datos no configurada o URL de Supabase inválida',
      standings: [],
      data: []
    });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from('match_stats_cache')
      .select('*')
      .limit(50);

    return NextResponse.json({
      status: 'success',
      league,
      standings: data || [],
      data: data || []
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Internal Server Error', details: err.message },
      { status: 500 }
    );
  }
}