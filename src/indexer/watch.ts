/**
 * Watch Service - File system watching with debounced index updates
 *
 * This module provides backward-compatible exports while delegating to the
 * refactored WatchService, ChangeQueue, and ProviderManager classes.
 *
 * The refactored architecture separates concerns:
 * - WatchService: Orchestrates file watching and event handling
 * - ChangeQueue: Manages debouncing and race-condition-free flushing
 * - ProviderManager: Handles embedding provider lifecycle
 */

export { startWatch, WatchService } from './WatchService.js';
export type { WatchServiceOptions as WatchOptions, WatchController } from './WatchService.js';
export { ChangeQueue } from './ChangeQueue.js';
export { ProviderManager } from './ProviderManager.js';
