import { writeCodemapAsync } from '../../codemap/io.js';
import { saveMerkleAsync } from '../../indexer/merkle.js';
import type { IndexContextData } from './IndexContext.js';
import type { IndexState } from './IndexState.js';

type DebouncedTask = {
  timer: NodeJS.Timeout | null;
  pending: boolean;
};

export class PersistManager {
  private codemapTask: DebouncedTask = { timer: null, pending: false };
  private merkleTask: DebouncedTask = { timer: null, pending: false };
  private readonly debounceMs: number;
  private saving = false;

  constructor(
    private context: IndexContextData,
    private state: IndexState,
    debounceMs = 1500
  ) {
    this.debounceMs = debounceMs;
  }

  scheduleCodemapSave(): void {
    this.codemapTask.pending = true;
    this.resetTimer('codemap');
  }

  scheduleMerkleSave(): void {
    this.merkleTask.pending = true;
    this.resetTimer('merkle');
  }

  async flush(): Promise<void> {
    this.clearTimers();
    await this.saveNow();
  }

  private resetTimer(type: 'codemap' | 'merkle'): void {
    const task = type === 'codemap' ? this.codemapTask : this.merkleTask;
    if (task.timer) {
      clearTimeout(task.timer);
    }
    task.timer = setTimeout(() => {
      void this.saveNow();
    }, this.debounceMs);
  }

  private clearTimers(): void {
    if (this.codemapTask.timer) {
      clearTimeout(this.codemapTask.timer);
      this.codemapTask.timer = null;
    }
    if (this.merkleTask.timer) {
      clearTimeout(this.merkleTask.timer);
      this.merkleTask.timer = null;
    }
  }

  private async saveNow(): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    try {
      if (this.state.indexMutated && this.codemapTask.pending) {
        await writeCodemapAsync(this.context.codemapPath, this.state.codemap);
        this.state.indexMutated = false;
      }

      if (this.state.merkleDirty && this.merkleTask.pending) {
        await saveMerkleAsync(this.context.repo, this.state.updatedMerkle);
        this.state.merkleDirty = false;
      }
    } finally {
      this.codemapTask.pending = false;
      this.merkleTask.pending = false;
      this.saving = false;
    }
  }
}
