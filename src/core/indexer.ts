import { IndexerEngine } from './IndexerEngine.js';
import type { IndexProjectOptions, IndexProjectResult } from './types.js';

export async function indexProject(options: IndexProjectOptions = {}): Promise<IndexProjectResult> {
    const engine = new IndexerEngine(options);
    return await engine.index();
}
