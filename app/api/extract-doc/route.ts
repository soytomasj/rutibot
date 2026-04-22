import { NextResponse } from 'next/server';
// @ts-ignore
import WordExtractor from 'word-extractor';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export async function POST(req: Request) {
  let tempPath = '';
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const rawContent = buffer.toString('utf-8');

    // 1. Detectar si es un "Falso Word" (es un HTML de ScriptCase/Excel)
    if (rawContent.includes('<html') || rawContent.includes('<table')) {
      // Es un HTML. Limpiamos las etiquetas para quedarnos con el texto puro.
      const text = rawContent
        .replace(/<style([\s\S]*?)<\/style>/gi, '') // Sacar CSS
        .replace(/<script([\s\S]*?)<\/script>/gi, '') // Sacar JS
        .replace(/<\/?[^>]+(>|$)/g, "\n") // Reemplazar etiquetas por saltos de linea
        .replace(/&nbsp;/g, ' ')
        .replace(/\n\s*\n/g, '\n') // Quitar saltos de linea vacios
        .trim();
      
      return NextResponse.json({ text });
    }

    // 2. Si no es HTML, intentar extraer como Word binario (.doc / .docx)
    tempPath = path.join(os.tmpdir(), `upload_${Date.now()}.doc`);
    await fs.writeFile(tempPath, buffer);

    try {
      const extractor = new WordExtractor();
      const extracted = await extractor.extract(tempPath);
      const text = extracted.getBody();
      
      await fs.unlink(tempPath).catch(() => {});
      return NextResponse.json({ text });
    } catch (execError: any) {
      await fs.unlink(tempPath).catch(() => {});
      // Si falla word-extractor, intentamos devolver el buffer como texto por las dudas
      return NextResponse.json({ text: buffer.toString('utf-8').substring(0, 10000) });
    }
  } catch (error) {
    if (tempPath) await fs.unlink(tempPath).catch(() => {});
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
