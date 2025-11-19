export class SimpleLRU<K, V> {
  private max: number;
  private map: Map<K, V>;

  constructor(max: number) {
    this.max = max;
    this.map = new Map<K, V>();
  }

  get(key: K): V | undefined {
    const item = this.map.get(key);
    if (item) {
      // refresh
      this.map.delete(key);
      this.map.set(key, item);
    }
    return item;
  }

  set(key: K, value: V): void {
    // Refresh recency for existing keys
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.max) {
      // Evict only when at capacity
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) {
        this.map.delete(firstKey);
      }
    }
    this.map.set(key, value);
  }

  clear() {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
