import crypto from 'crypto';
import { EmbeddingProvider } from './base.js';

function normalizeVector(values: number[]): number[] {
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
  return values.map(value => value / magnitude);
}

function buildDeterministicVector(text: string, dimensions: number): number[] {
  const hash = crypto.createHash('sha256').update(text).digest();
  const values: number[] = [];

  for (let i = 0; i < dimensions; i++) {
    const raw = hash[i % hash.length];
    // Spread values across a small range to avoid identical vectors
    values.push((raw / 255) * (1 + (i % 5) * 0.05));
  }

  return normalizeVector(values);
}

/**
 * Lightweight mock embedding provider for integration tests.
 * Generates deterministic vectors without external API calls.
 */
export class MockEmbeddingProvider extends EmbeddingProvider {
  constructor(private dimensions = 32) {
    super();
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getName(): string {
    return 'mock';
  }

  getModelName(): string {
    return 'mock';
  }

  async init(): Promise<void> {
    // No-op for mock provider
  }

  async generateEmbedding(text: string): Promise<number[]> {
    return buildDeterministicVector(text, this.dimensions);
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    return texts.map(text => buildDeterministicVector(text, this.dimensions));
  }
}
