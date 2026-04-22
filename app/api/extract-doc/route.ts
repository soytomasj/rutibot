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

    const buffer = await file.arrayBuffer();
    const nodeBuffer = Buffer.from(buffer);
    
    // Intentar detectar si es un HTML (ScriptCase export)
    // Probamos decodificar con Latin1 (ISO-8859-1) que es lo que usa ese sistema para los acentos
    const latin1Content = nodeBuffer.toString('latin1');
    const isHtml = latin1Content.includes('<html') || latin1Content.includes('<table');

    if (isHtml) {
      // Limpieza profunda de HTML para evitar símbolos raros y basura
      let text = latin1Content
        .replace(/<style([\s\S]*?)<\/style>/gi, '') 
        .replace(/<script([\s\S]*?)<\/script>/gi, '')
        .replace(/<title>([\s\S]*?)<\/title>/gi, '')
        // Reemplazar celdas y filas por saltos de línea para mantener estructura
        .replace(/<\/tr>/gi, '\n')
        .replace(/<\/td>/gi, '\n')
        .replace(/<br\s*[\/]?>/gi, '\n')
        // Quitar el resto de etiquetas
        .replace(/<\/?[^>]+(>|$)/g, "") 
        // Decodificar entidades comunes manualmente si quedaran
        .replace(/&nbsp;/g, ' ')
        .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú')
        .replace(/&Aacute;/g, 'Á').replace(/&Eacute;/g, 'É').replace(/&Iacute;/g, 'Í').replace(/&Oacute;/g, 'Ó').replace(/&Uacute;/g, 'Ú')
        .replace(/&ntilde;/g, 'ñ').replace(/&Ntilde;/g, 'Ñ')
        .replace(/&iquest;/g, '¿').replace(/&iexcl;/g, '¡')
        .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
        .trim();

      // Normalizar saltos de línea múltiples
      text = text.split('\n').map(line => line.trim()).filter(line => line.length > 0).join('\n');
      
      return NextResponse.json({ text });
    }

    // Si no es HTML, procedemos con WordExtractor (para .doc/.docx binarios reales)
    tempPath = path.join(os.tmpdir(), `upload_${Date.now()}.doc`);
    await fs.writeFile(tempPath, nodeBuffer);

    try {
      const extractor = new WordExtractor();
      const extracted = await extractor.extract(tempPath);
      const text = extracted.getBody();
      
      await fs.unlink(tempPath).catch(() => {});
      return NextResponse.json({ text });
    } catch (execError: any) {
      await fs.unlink(tempPath).catch(() => {});
      return NextResponse.json({ text: nodeBuffer.toString('utf-8').substring(0, 10000) });
    }
  } catch (error) {
    if (tempPath) await fs.unlink(tempPath).catch(() => {});
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
