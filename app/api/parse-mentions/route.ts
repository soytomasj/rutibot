import { NextResponse } from 'next/server';

function parseHeuristic(text: string) {
  // Dividir por líneas y limpiar espacios
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const menciones = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toUpperCase();
    
    // Detectar inicio de bloque
    if (line.includes('BLOQUE')) {
      let cli = '';
      let dateIdx = -1;

      // Buscar una fecha (DD/MM/YYYY) en las próximas 8 líneas
      for (let offset = 1; offset <= 8; offset++) {
        if (i + offset < lines.length) {
          const checkLine = lines[i + offset];
          // Regex para fecha paraguaya/argentina 31/03/2026
          if (/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/.test(checkLine)) {
             dateIdx = i + offset;
             // El cliente suele ser la línea anterior a la fecha
             cli = lines[dateIdx - 1];
             break;
          }
        }
      }

      if (dateIdx !== -1 && cli && !cli.toLowerCase().includes('producto') && !cli.toLowerCase().includes('estacion40') && !cli.toUpperCase().startsWith('BLOQUE')) {
         let txt = '';
         let j = dateIdx + 1;
         
         // Recolectar texto hasta el siguiente bloque o palabra clave
         while (
           j < lines.length && 
           !lines[j].toUpperCase().includes('BLOQUE') && 
           lines[j].toLowerCase() !== 'bloques' &&
           !/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/.test(lines[j])
         ) {
           const low = lines[j].toLowerCase();
           // Ignorar palabras de cabecera que a veces se filtran
           if (!['posicion', 'medio', 'producto', 'fecha', 'texto', '=>'].includes(low) && 
               !low.includes('estacion40') && 
               !low.includes('elegidos 40') &&
               !(/^\d+$/.test(low) && low.length <= 2)) { // Ignorar números de posición sueltos
             txt += lines[j] + ' ';
           }
           j++;
         }

         if (txt.trim().length > 3) {
           menciones.push({
             cli: cli.trim().toUpperCase(),
             tipo: 'Mencion Live',
             cant: 1,
             txt: txt.trim()
           });
         }
         
         // No saltamos todo para no perder bloques que vengan pegados
         i = dateIdx; 
      }
    }
  }

  // Agrupar por Cliente y Texto para sumar repeticiones
  const grouped: Record<string, any> = {};
  for (const m of menciones) {
    const key = `${m.cli.toLowerCase()}|||${m.txt.toLowerCase()}`;
    if (!grouped[key]) {
      grouped[key] = { ...m };
    } else {
      grouped[key].cant += 1;
    }
  }
  
  return Object.values(grouped);
}

export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    if (!text) return NextResponse.json({ error: 'No text provided' }, { status: 400 });

    const result = parseHeuristic(text);
    if (result.length > 0) {
      return NextResponse.json({ menciones: result });
    }

    // Fallback a IA si el formato es muy distinto (requiere clave configurada)
    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'No se detectó el formato automático. Configurá GEMINI_API_KEY en Vercel para usar detección con IA.' }, { status: 400 });
    }

    const pr = `Analiza este texto de radio y extrae las menciones comerciales en JSON: {"menciones":[{"cli":"CLIENTE","tipo":"Mencion Live","cant":1,"txt":"GUION"}]}. TEXTO:\n${text.substring(0, 5000)}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: pr }] }] })
    });
    
    const d = await response.json();
    const content = d.candidates[0].content.parts[0].text;
    const cleanContent = content.replace(/```json|```/g, '').trim();
    return NextResponse.json(JSON.parse(cleanContent));

  } catch (error: any) {
    return NextResponse.json({ error: 'Error al procesar menciones' }, { status: 500 });
  }
}
