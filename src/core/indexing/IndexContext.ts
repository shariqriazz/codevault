import path from 'path';
import fs from 'fs';
import { createEmbeddingProvider, getModelProfile, getSizeLimits, type EmbeddingProvider } from '../../providers/index.js';
import { BATCH_SIZE, type ModelProfile } from '../../providers/base.js';
import { readCodemap, type Codemap } from '../../codemap/io.js';
import { loadMerkle, cloneMerkle, type MerkleTree } from '../../indexer/merkle.js';
import { resolveEncryptionPreference } from '../../storage/encrypted-chunks.js';
import { Database, initDatabase } from '../../database/db.js';
import { BatchEmbeddingProcessor } from '../batch-indexer.js';
import { logger } from '../../utils/logger.js';
import { resolveProviderContext } from '../../config/resolver.js';
import type { IndexProjectOptions } from '../types.js';

export interface SizeLimits {
  optimal: number;
  min: number;
  max: number;
  overlap: number;
  unit: string;
}

export interface IndexContextData {
  repo: string;
  repoPath: string;
  provider: string;
  providerInstance: EmbeddingProvider;
  providerName: string;
  modelName: string | null;
  modelProfile: ModelProfile;
  limits: SizeLimits;
  codemapPath: string;
  chunkDir: string;
  dbPath: string;
  encryptionPreference: any;
  codemap: Codemap;
  merkle: MerkleTree;
  updatedMerkle: MerkleTree;
  db: Database;
  batchProcessor: BatchEmbeddingProcessor;
  isPartialUpdate: boolean;
}

/**
 * IndexContext prepares the indexing environment by:
 * - Validating repository
 * - Initializing embedding provider
 * - Setting up database
 * - Loading codemap and merkle tree
 * - Creating batch processor
 */
export class IndexContext {
  static async prepare(options: IndexProjectOptions): Promise<IndexContextData> {
    const {
      repoPath = '.',
      provider = 'auto',
      changedFiles = null,
      embeddingProviderOverride = null,
      encryptMode = undefined
    } = options;

    const repo = path.resolve(repoPath);

    // Validate repository exists
    try {
      await fs.promises.access(repo);
    } catch {
      throw new Error(`Directory ${repo} does not exist`);
    }

    // Setup provider context and embedding provider
    const providerContext = resolveProviderContext(repo);
    const providerInstance = embeddingProviderOverride ||
      createEmbeddingProvider(provider, providerContext.embedding);

    if (!embeddingProviderOverride && providerInstance.init) {
      await providerInstance.init();
    }

    // Get provider and model information
    const providerName = providerInstance.getName();
    const modelName = providerInstance.getModelName ? providerInstance.getModelName() : null;
    const modelProfile = await getModelProfile(providerName, modelName || providerName);
    const limits = getSizeLimits(modelProfile);

    // Log configuration
    if (!process.env.CODEVAULT_QUIET) {
      logger.info(`Chunking Configuration`, {
        provider: providerName,
        model: modelName,
        dimensions: providerInstance.getDimensions(),
        mode: limits.unit
      });
    }

    // Initialize database
    await initDatabase(providerInstance.getDimensions(), repo);

    // Setup paths
    const codemapPath = path.join(repo, 'codevault.codemap.json');
    const chunkDir = path.join(repo, '.codevault/chunks');
    const dbPath = path.join(repo, '.codevault/codevault.db');

    // Check for dimension mismatches
    await IndexContext.checkDimensionMismatch(dbPath, providerInstance);

    // Setup encryption
    const encryptionPreference = resolveEncryptionPreference({
      mode: encryptMode,
      logger: console
    });

    // Load existing state
    const codemap = readCodemap(codemapPath);
    const merkle = loadMerkle(repo);
    const updatedMerkle = cloneMerkle(merkle);

    // Create database connection
    const db = new Database(dbPath);

    // Create batch processor
    const batchProcessor = new BatchEmbeddingProcessor(providerInstance, db, BATCH_SIZE);

    const isPartialUpdate = changedFiles !== null;

    return {
      repo,
      repoPath,
      provider,
      providerInstance,
      providerName,
      modelName,
      modelProfile,
      limits,
      codemapPath,
      chunkDir,
      dbPath,
      encryptionPreference,
      codemap,
      merkle,
      updatedMerkle,
      db,
      batchProcessor,
      isPartialUpdate
    };
  }

  /**
   * Check if there's a dimension or provider mismatch and warn user
   */
  private static async checkDimensionMismatch(
    dbPath: string,
    embeddingProvider: EmbeddingProvider
  ): Promise<void> {
    try {
      await fs.promises.access(dbPath);
    } catch {
      return; // DB doesn't exist yet
    }

    const db = new Database(dbPath);
    try {
      const existingDimensions = await db.getExistingDimensions();

      if (existingDimensions.length > 0) {
        const currentProvider = embeddingProvider.getName();
        const currentDimensions = embeddingProvider.getDimensions();

        const hasMismatch = existingDimensions.some(
          row => row.embedding_provider !== currentProvider ||
                 row.embedding_dimensions !== currentDimensions
        );

        if (hasMismatch) {
          logger.warn('Dimension/Provider Mismatch Detected!', {
            existing: existingDimensions,
            current: { provider: currentProvider, dimensions: currentDimensions },
            recommendation: 'Full re-index recommended'
          });

          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    } catch (error) {
      logger.debug('Migration check encountered an error (continuing)', {
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      db.close();
    }
  }
}
