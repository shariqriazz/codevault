interface LRUNode<K, V> {
  key: K;
  value: V;
  prev: LRUNode<K, V> | null;
  next: LRUNode<K, V> | null;
  expiresAt: number | null;
}

interface LRUOptions {
  ttl?: number;
}

/**
 * True O(1) LRU cache using a doubly linked list for recency
 * Supports optional TTL eviction without refreshing on peek
 */
export class SimpleLRU<K, V> {
  private readonly max: number;
  private readonly ttl: number | null;
  private map: Map<K, LRUNode<K, V>>;
  private head: LRUNode<K, V> | null = null;
  private tail: LRUNode<K, V> | null = null;

  constructor(max: number, options: LRUOptions = {}) {
    if (!Number.isFinite(max) || max <= 0) {
      throw new Error('SimpleLRU requires a max size greater than zero');
    }

    this.max = Math.floor(max);
    this.ttl = options.ttl && options.ttl > 0 ? options.ttl : null;
    this.map = new Map<K, LRUNode<K, V>>();
  }

  get(key: K): V | undefined {
    const node = this.map.get(key);
    if (!node) return undefined;

    if (this.isExpired(node)) {
      this.removeNode(node);
      return undefined;
    }

    this.moveToFront(node);
    return node.value;
  }

  peek(key: K): V | undefined {
    const node = this.map.get(key);
    if (!node || this.isExpired(node)) {
      if (node) {
        this.removeNode(node);
      }
      return undefined;
    }
    return node.value;
  }

  set(key: K, value: V): void {
    const existing = this.map.get(key);
    const expiresAt = this.ttl ? Date.now() + this.ttl : null;

    if (existing) {
      existing.value = value;
      existing.expiresAt = expiresAt;
      this.moveToFront(existing);
      return;
    }

    const node: LRUNode<K, V> = {
      key,
      value,
      prev: null,
      next: null,
      expiresAt
    };

    this.map.set(key, node);
    this.addToFront(node);

    if (this.map.size > this.max) {
      this.evictStaleEntries();
    }
  }

  clear(): void {
    this.map.clear();
    this.head = null;
    this.tail = null;
  }

  get size(): number {
    return this.map.size;
  }

  private evictLeastRecentlyUsed(): void {
    if (!this.tail) return;
    this.removeNode(this.tail);
  }

  private evictStaleEntries(): void {
    let current = this.tail;
    while (current) {
      const prev = current.prev;
      if (this.isExpired(current)) {
        this.removeNode(current);
      }
      current = prev;
    }

    if (this.map.size > this.max) {
      this.evictLeastRecentlyUsed();
    }
  }

  private removeNode(node: LRUNode<K, V>): void {
    this.map.delete(node.key);

    if (node.prev) {
      node.prev.next = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    }

    if (this.head === node) {
      this.head = node.next;
    }
    if (this.tail === node) {
      this.tail = node.prev;
    }

    node.prev = null;
    node.next = null;
  }

  private moveToFront(node: LRUNode<K, V>): void {
    if (this.head === node) return;
    this.detach(node);
    this.addToFront(node);
  }

  private detach(node: LRUNode<K, V>): void {
    if (node.prev) {
      node.prev.next = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    }
    if (this.tail === node) {
      this.tail = node.prev;
    }
    if (this.head === node) {
      this.head = node.next;
    }
    node.prev = null;
    node.next = null;
  }

  private addToFront(node: LRUNode<K, V>): void {
    node.prev = null;
    node.next = this.head;
    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;
    if (!this.tail) {
      this.tail = node;
    }
  }

  private isExpired(node: LRUNode<K, V>): boolean {
    if (!this.ttl || node.expiresAt === null) {
      return false;
    }
    return node.expiresAt <= Date.now();
  }
}
