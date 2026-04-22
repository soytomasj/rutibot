import { NextResponse } from 'next/server';

export async function GET() {
  const envKeys = Object.keys(process.env);
  const hasKey = !!process.env.GEMINI_API_KEY;
  const hasPubKey = !!process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  
  return NextResponse.json({
    status: "Diagnostic V3",
    GEMINI_API_KEY_EXISTS: hasKey,
    NEXT_PUBLIC_GEMINI_API_KEY_EXISTS: hasPubKey,
    available_keys: envKeys.filter(k => !k.includes('KEY') && !k.includes('SECRET') && !k.includes('PASSWORD')),
    all_keys_count: envKeys.length,
    msg: hasKey ? "OK: La clave existe." : "ERROR: No se encuentra GEMINI_API_KEY."
  });
}
