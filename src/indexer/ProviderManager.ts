import { createEmbeddingProvider, type EmbeddingProvider } from '../providers/index.js';
import type { EmbeddingOptions } from '../config/resolver.js';

/**
 * Manages the lifecycle of embedding providers for the watch service.
 * Ensures providers are initialized once and reused across updates.
 */
export class ProviderManager {
  private providerInstance: EmbeddingProvider | null = null;
  private initPromise: Promise<EmbeddingProvider> | null = null;
  private initErrorLogged = false;

  constructor(
    private providerName: string,
    private providerContext: EmbeddingOptions,
    private logger: Console = console
  ) {}

  /**
   * Get or create the embedding provider instance.
   * Handles concurrent initialization requests safely.
   */
  async getProvider(): Promise<EmbeddingProvider> {
    if (this.providerInstance) {
      return this.providerInstance;
    }

    // If initialization is already in progress, wait for it
    if (!this.initPromise) {
      this.initPromise = this.initializeProvider();
    }

    try {
      return await this.initPromise;
    } catch (error) {
      // Reset on error so next attempt can retry
      this.initPromise = null;
      this.providerInstance = null;
      throw error;
    }
  }

  /**
   * Initialize the embedding provider
   */
  private async initializeProvider(): Promise<EmbeddingProvider> {
    const instance = createEmbeddingProvider(this.providerName, this.providerContext);

    if (instance.init) {
      await instance.init();
    }

    this.providerInstance = instance;
    return instance;
  }

  /**
   * Attempt to get provider, logging errors but not throwing
   */
  async getProviderSafe(): Promise<EmbeddingProvider | null> {
    try {
      return await this.getProvider();
    } catch (error) {
      if (!this.initErrorLogged && typeof this.logger.error === 'function') {
        this.logger.error('CodeVault watch provider initialization failed:', error);
        this.initErrorLogged = true;
      }
      return null;
    }
  }

  /**
   * Clean up provider resources
   */
  cleanup(): void {
    this.providerInstance = null;
    this.initPromise = null;
    this.initErrorLogged = false;
  }
}
