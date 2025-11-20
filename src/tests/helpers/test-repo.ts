import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export interface TempRepo {
  root: string;
  cleanup: () => Promise<void>;
}

export async function createTempRepo(files: Record<string, string>): Promise<TempRepo> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codevault-int-'));

  for (const [relativePath, contents] of Object.entries(files)) {
    await writeRepoFile(root, relativePath, contents);
  }

  return {
    root,
    cleanup: async () => {
      await fs.rm(root, { recursive: true, force: true });
    }
  };
}

export async function writeRepoFile(root: string, relativePath: string, contents: string): Promise<void> {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, contents, 'utf8');
}
