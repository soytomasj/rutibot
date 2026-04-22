import { NextResponse } from 'next/server';

export async function GET() {
  const hasKey = !!process.env.GEMINI_API_KEY;
  const keyLength = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0;
  const keyPrefix = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 7) : 'none';
  
  return NextResponse.json({
    status: "Diagnostic",
    GEMINI_API_KEY_EXISTS: hasKey,
    length: keyLength,
    prefix_check: keyPrefix, // Deberia ser AIzaSy...
    node_env: process.env.NODE_ENV,
    msg: hasKey ? "La clave está presente en el servidor." : "Vercel NO le está pasando la clave al código."
  });
}
