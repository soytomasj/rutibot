import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

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
      const { stdout } = await execAsync(`textutil -convert txt "${tempPath}" -stdout`);
      await fs.unlink(tempPath).catch(() => {});
      return NextResponse.json({ text: stdout });
    } catch (execError) {
      await fs.unlink(tempPath).catch(() => {});
      return NextResponse.json({ error: 'Failed to parse .doc file on server. Ensure you are on macOS with textutil available.' }, { status: 500 });
    }
  } catch (error) {
    if (tempPath) await fs.unlink(tempPath).catch(() => {});
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
