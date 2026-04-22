import { NextResponse } from 'next/server';

function parseHeuristic(text: string) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const menciones = [];
  
  for (let i = 0; i < lines.length; i++) {
    // Look for the block header, e.g. "BLOQUE 2"
    if (lines[i].toUpperCase().startsWith('BLOQUE')) {
      let cli = '';
      let dateIdx = -1;

      // Scan the next few lines (up to 5) to find the date pattern
      for (let offset = 1; offset <= 5; offset++) {
        if (i + offset < lines.length && /^(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/.test(lines[i + offset])) {
           dateIdx = i + offset;
           cli = lines[dateIdx - 1];
           break;
        }
      }

      if (dateIdx !== -1 && cli && cli !== 'Producto' && cli !== 'ESTACION40' && !cli.toUpperCase().startsWith('BLOQUE')) {
         let txt = '';
         let j = dateIdx + 1;
         
         while (
           j < lines.length && 
           !lines[j].toUpperCase().startsWith('BLOQUE') && 
           lines[j].toLowerCase() !== 'bloques' &&
           !/^(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/.test(lines[j])
         ) {
           const lowerL = lines[j].toLowerCase();
           if (['posicion', 'medio', 'producto', 'fecha', 'texto', '=>', 'bloque'].includes(lowerL)) {
              // skip header word
           } else if (!isNaN(parseInt(lines[j], 10)) && lines[j].length <= 3) {
              // skip solitary position numbers
           } else if (lines[j].toUpperCase() === 'ESTACION40' || lines[j].toUpperCase().includes('ELEGIDOS 40')) {
              // skip media/station name
           } else {
             txt += lines[j] + ' ';
           }
           j++;
         }

         menciones.push({
           cli: cli,
           tipo: 'Mencion Live',
           cant: 1,
           txt: txt.trim()
         });

         i = j - 1; // Skip ahead to where we stopped
      }
    }
  }

  // Group by client and text
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

    // 1. Try heuristic parser first (perfect for "Resumen Mencion Locutores" DOCs)
    const result = parseHeuristic(text);
    if (result.length > 0) {
      return NextResponse.json({ menciones: result });
    }

    // 2. If heuristic yields 0, try AI fallback if process.env.ANTHROPIC_API_KEY exists
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'No se encontraron menciones con el formato esperado. Para usar la detección avanzada con IA, configura la variable de entorno ANTHROPIC_API_KEY.' }, { status: 400 });
    }

    const pr = `Analiza el siguiente texto de un archivo comercial de radio argentina. Extrae TODAS las menciones comerciales. Para cada una identifica: cli (cliente), tipo (Mencion Live, Spot Grabado, etc), cant (veces por dia), txt (guion). Responde UNICAMENTE con JSON valido: {"menciones":[{"cli":"nombre","tipo":"Mencion Live","cant":1,"txt":"texto"}]}\n\nTEXTO:\n"""\n${text.substring(0, 3500)}\n"""\nSi no hay menciones claras responde: {"menciones":[]}`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', 
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model: 'claude-3-5-sonnet-20240620', max_tokens: 1000, messages: [{ role: 'user', content: pr }] })
    });
    
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    const raw = d.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return NextResponse.json(parsed);

  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error processing mentions' }, { status: 500 });
  }
}