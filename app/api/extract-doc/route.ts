import { NextResponse } from 'next/server';
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
      return NextResponse.json({ error: 'Error al extraer texto del documento: ' + execError.message }, { status: 500 });
    }
  } catch (error) {
    if (tempPath) await fs.unlink(tempPath).catch(() => {});
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
