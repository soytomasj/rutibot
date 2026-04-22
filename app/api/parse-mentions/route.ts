import { NextResponse } from 'next/server';

function parseHeuristic(text: string) {
  // Dividir por líneas y limpiar espacios
  const rawLines = text.split('\n');
  const menciones: any[] = [];
  
  // 1. INTENTO TABULAR (Fila única con todas las columnas separadas por tabs o muchos espacios)
  rawLines.forEach(line => {
    // Buscar patrón: Bloque X [espacios] Numero [espacios] ESTACION40 [espacios] CLIENTE [espacios] FECHA [espacios] TEXTO
    // Ejemplo: BLOQUE 2	1	ESTACION40	LACTEOS LACTOLANDA	31/03/2026	¿Buscás sumar...
    const tabularMatch = line.match(/(BLOQUE\s+\d+)\s+(\d+)\s+([\w\s\d\-]+)\s+([A-Z\s\.\&\-]+)\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s+(.*)/i);
    
    if (tabularMatch) {
      const cli = tabularMatch[4].trim();
      const txt = tabularMatch[6].trim();
      
      if (cli && txt && !cli.toLowerCase().includes('producto') && !cli.toLowerCase().includes('estacion40')) {
        menciones.push({
          cli: cli.toUpperCase(),
          tipo: 'Mencion Live',
          cant: 1,
          txt: txt
        });
      }
    }
  });

  if (menciones.length > 0) return groupMentions(menciones);

  // 2. INTENTO MULTI-LÍNEA (El de antes)
  const lines = rawLines.map(l => l.trim()).filter(l => l.length > 0);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toUpperCase();
    if (line.includes('BLOQUE')) {
      let cli = '';
      let dateIdx = -1;
      for (let offset = 1; offset <= 8; offset++) {
        if (i + offset < lines.length) {
          const checkLine = lines[i + offset];
          if (/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/.test(checkLine)) {
             dateIdx = i + offset;
             cli = lines[dateIdx - 1];
             break;
          }
        }
      }
      if (dateIdx !== -1 && cli && !cli.toLowerCase().includes('producto') && !cli.toLowerCase().includes('estacion40') && !cli.toUpperCase().startsWith('BLOQUE')) {
         let txt = '';
         let j = dateIdx + 1;
         while (
           j < lines.length && 
           !lines[j].toUpperCase().includes('BLOQUE') && 
           lines[j].toLowerCase() !== 'bloques' &&
           !/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/.test(lines[j])
         ) {
           const low = lines[j].toLowerCase();
           if (!['posicion', 'medio', 'producto', 'fecha', 'texto', '=>'].includes(low) && 
               !low.includes('estacion40') && 
               !low.includes('elegidos 40') &&
               !(/^\d+$/.test(low) && low.length <= 2)) {
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
         i = dateIdx; 
      }
    }
  }

  return groupMentions(menciones);
}

function groupMentions(menciones: any[]) {
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

    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'No se detectó el formato automático. Configurá GEMINI_API_KEY en Vercel para usar detección con IA.' }, { status: 400 });
    }

    const pr = `Analiza este texto de radio y extrae TODAS las menciones comerciales de la tabla. 
Busca nombres de clientes (Producto) y sus guiones (Texto).
Responde UNICAMENTE con JSON: {"menciones":[{"cli":"CLIENTE","tipo":"Mencion Live","cant":1,"txt":"GUION"}]}. 
TEXTO:\n${text.substring(0, 5000)}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: pr }] }] })
    });
    
    const d = await response.json();
    if (!d.candidates || !d.candidates[0]) {
       throw new Error(d.error?.message || 'La IA no pudo procesar este formato de texto.');
    }
    const content = d.candidates[0].content.parts[0].text;
    const cleanContent = content.replace(/```json|```/g, '').trim();
    return NextResponse.json(JSON.parse(cleanContent));

  } catch (error: any) {
    return NextResponse.json({ error: 'Error al procesar menciones: ' + error.message }, { status: 500 });
  }
}
