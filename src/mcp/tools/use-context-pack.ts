import { z } from 'zod';
import { loadContextPack } from '../../context/packs.js';
import type { ContextPack } from '../../types/context-pack.js';

export const useContextPackInputSchema = z.object({
  name: z.string().min(1, 'Context pack name is required'),
  path: z.string().optional()
});

export const useContextPackResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  pack: z.object({
    key: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    scope: z.record(z.string(), z.unknown())
  }).optional()
});

interface ErrorLogger {
  debugLog?: (message: string, context?: Record<string, unknown>) => void;
  log?: (error: unknown, context?: Record<string, unknown>) => void;
}

interface ToolServer {
  tool: (name: string, schema: Record<string, z.ZodType>, handler: (params: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>) => void;
}

interface CreateHandlerOptions {
  getWorkingPath: () => string;
  setSessionPack: (pack: ContextPack) => void;
  clearSessionPack: () => void;
  errorLogger?: ErrorLogger;
}

export function createUseContextPackHandler(options: CreateHandlerOptions) {
  const { getWorkingPath, setSessionPack, clearSessionPack, errorLogger } = options;

  return async ({ name, path: explicitPath }: { name: string; path?: string }) => {
    const basePath = explicitPath && explicitPath.trim().length > 0
      ? explicitPath.trim()
      : (typeof getWorkingPath === 'function' ? getWorkingPath() : '.');

    if (name === 'default' || name === 'none' || name === 'clear') {
      if (typeof clearSessionPack === 'function') {
        clearSessionPack();
      }
      if (errorLogger?.debugLog) {
        errorLogger.debugLog('Cleared MCP session context pack', { basePath, name });
      }
      return {
        success: true,
        message: 'Cleared active context pack for this session'
      };
    }

    try {
      const pack = loadContextPack(name, basePath);
      const sessionPack = {
        ...pack,
        description: pack.description ?? undefined,
        basePath
      };

      if (typeof setSessionPack === 'function') {
        setSessionPack(sessionPack as any);
      }

      if (errorLogger?.debugLog) {
        errorLogger.debugLog('Activated MCP session context pack', {
          pack: pack.key,
          basePath
        });
      }

      return {
        success: true,
        message: `Context pack "${pack.key}" activated for session`,
        pack: {
          key: pack.key,
          name: pack.name,
          description: pack.description ?? undefined,
          scope: pack.scope
        }
      };
    } catch (error) {
      if (errorLogger?.log) {
        errorLogger.log(error, {
          operation: 'use_context_pack',
          name,
          basePath
        });
      }
      throw error;
    }
  };
}

export function registerUseContextPackTool(server: ToolServer, options: CreateHandlerOptions) {
  const handler = createUseContextPackHandler(options);

  server.tool(
    'use_context_pack',
    {
      name: z.string().min(1).describe('Context pack name (e.g., "test-pack", "stripe-backend") or "clear" to reset'),
      path: z.string().optional().describe('PROJECT ROOT directory path (defaults to ".")')
    },
    async (params: Record<string, unknown>) => {
      const result = await handler(params as { name: string; path?: string });
      return {
        content: [
          {
            type: 'text',
            text: result.message
          }
        ]
      };
    }
  );

  return handler;
}