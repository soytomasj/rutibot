import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { artists, temas, fuentes, efemerides, contextDia, contextTemas, config, dateStr } = body;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Falta la GEMINI_API_KEY. Por favor, asegúrate de haberla guardado en las Variables de Entorno de Vercel y luego hacé un Redeploy.' }, { status: 400 });
    }

    // Build the prompt
    let prompt = `Sos el redactor estrella de noticias de E40, una radio Top 40 de Argentina.
NUNCA inventes información. Si no encontrás nada reciente y relevante en la búsqueda, omití el tema o usá solo los datos que encuentres reales.

FECHA DE HOY: ${dateStr}

LO QUE TENÉS QUE BUSCAR:
`;
    if (artists && artists.length > 0) prompt += `- ARTISTAS: ${artists.join(', ')}\n`;
    if (temas && temas.length > 0) prompt += `- NICHOS/TEMAS: ${temas.join(', ')}\n`;
    if (efemerides) prompt += `- EFEMÉRIDES: Buscá efemérides importantes de hoy (musicales, nacionales de Argentina, o internacionales).\n`;
    if (fuentes && fuentes.length > 0) prompt += `- FUENTES SUGERIDAS: Revisá estas URLs o perfiles si es posible: ${fuentes.join(', ')}\n`;

    if (contextDia) prompt += `\nCONTEXTO DEL DÍA (Info clave de hoy):\n${contextDia}\n`;
    if (contextTemas) prompt += `\nTEMAS SONANDO EN LA RADIO:\n${contextTemas}\n`;

    prompt += `
REGLAS DE REDACCIÓN:
- Estilo: ${config.estilo === 'formal' ? 'Formal e informativo' : config.estilo === 'joven' ? 'Joven y descontracturado (usar jerga urbana argentina)' : 'Radial argentino, cercano y dinámico (hablar directo al oyente)'}
- Extensión: ${config.durn === 'corta' ? 'Máximo 3 oraciones' : config.durn === 'larga' ? 'Unos 2 párrafos detallados' : 'Un párrafo de 4-5 oraciones'}
- Tono: Rioplatense (vos, ustedes, che), en español.
`;
    if (config.muletillas) prompt += `- Usá estas frases típicas de la radio: ${config.muletillas}\n`;

    prompt += `
FORMATO DE RESPUESTA:
Devolvé ÚNICAMENTE un JSON válido, sin markdown ni comillas invertidas. El JSON debe tener esta estructura:
{
  "noticias": [
    {
      "tema": "Nombre del Artista, Nicho o Efeméride",
      "noticia": "El texto redactado listo para leer al aire",
      "fuente_o_contexto": "Breve mención de dónde salió la info o cuándo pasó (ej: Twitter de Duki, Billboard, etc)"
    }
  ]
}
`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }],
        systemInstruction: { parts: [{ text: "Sos un asistente experto en producción radial y periodismo de espectáculos." }] },
        generationConfig: {
            temperature: 0.7
        }
      })
    });

    const data = await response.json();
    if (data.error) {
        throw new Error(data.error.message);
    }

    const content = data.candidates[0].content.parts[0].text;
    const cleanContent = content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleanContent);

    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error("News Generation Error:", error);
    return NextResponse.json({ error: error.message || 'Error al generar las noticias' }, { status: 500 });
  }
}
