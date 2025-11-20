import fs from 'fs';
import path from 'path';
import { normalizeCodemapRecord, type Codemap } from '../types/codemap.js';

export type { Codemap } from '../types/codemap.js';

export function resolveCodemapPath(basePath = '.'): string {
  return path.resolve(basePath, 'codevault.codemap.json');
}

export function readCodemap(filePath?: string): Codemap {
  const resolvedPath = filePath ? path.resolve(filePath) : resolveCodemapPath('.');

  if (!fs.existsSync(resolvedPath)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(resolvedPath, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeCodemapRecord(parsed);
  } catch (error) {
    console.warn(`Failed to read codemap at ${resolvedPath}:`, (error as Error).message);
    return {};
  }
}

export function writeCodemap(filePath: string | undefined, codemap: Codemap): Codemap {
  const resolvedPath = filePath ? path.resolve(filePath) : resolveCodemapPath('.');
  const normalized = normalizeCodemapRecord(codemap || {});

  const directory = path.dirname(resolvedPath);
  fs.mkdirSync(directory, { recursive: true });

  fs.writeFileSync(resolvedPath, JSON.stringify(normalized, null, 2));
  return normalized;
}

export async function readCodemapAsync(filePath?: string): Promise<Codemap> {
  const resolvedPath = filePath ? path.resolve(filePath) : resolveCodemapPath('.');

  try {
    const exists = await fs.promises.access(resolvedPath).then(() => true).catch(() => false);
    if (!exists) {
      return {};
    }

    const raw = await fs.promises.readFile(resolvedPath, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeCodemapRecord(parsed);
  } catch (error) {
    console.warn(`Failed to read codemap at ${resolvedPath}:`, (error as Error).message);
    return {};
  }
}
