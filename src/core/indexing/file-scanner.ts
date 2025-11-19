import fg from 'fast-glob';
import path from 'path';
import fs from 'fs';
import { LANG_RULES, getSupportedLanguageExtensions } from '../../languages/rules.js';
import { DEFAULT_SCAN_IGNORES } from '../../utils/scan-patterns.js';

export interface ScanResult {
  files: string[];
  toDelete: string[];
}

/**
 * Lightweight helper responsible only for discovering files eligible for indexing.
 */
export class FileScanner {
  async scan(repo: string, normalizedChanged: string[] | null): Promise<ScanResult> {
    const languagePatterns = getSupportedLanguageExtensions().map(ext => `**/*${ext}`);
    let files: string[] = [];

    if (normalizedChanged === null) {
      files = await fg(languagePatterns, {
        cwd: repo,
        absolute: false,
        followSymbolicLinks: false,
        ignore: DEFAULT_SCAN_IGNORES,
        onlyFiles: true,
        dot: false
      });
    } else {
      files = normalizedChanged.filter(rel => {
        const ext = path.extname(rel).toLowerCase();
        return !!LANG_RULES[ext];
      });
    }

    const uniqueFiles: string[] = [];
    const toDelete: string[] = [];
    const seenFiles = new Set<string>();

    for (const rel of files) {
      if (!rel || seenFiles.has(rel)) {
        continue;
      }

      const absPath = path.join(repo, rel);
      try {
        await fs.promises.access(absPath);
        seenFiles.add(rel);
        uniqueFiles.push(rel);
      } catch {
        toDelete.push(rel);
      }
    }

    return { files: uniqueFiles, toDelete };
  }
}
