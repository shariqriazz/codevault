import path from 'path';
import { getActiveContextPack, listContextPacks, loadContextPack, setActiveContextPack } from '../../context/packs.js';
import type { Command } from 'commander';
import type { ContextPack } from '../../types/context-pack.js';

function resolveProjectPath(projectPath = '.'): string {
  return path.resolve(projectPath || '.');
}

interface ContextPackWithKey extends ContextPack {
  key: string;
  invalid?: boolean;
}

function formatPackLine(pack: ContextPackWithKey, activeKey: string | null): string {
  const parts: string[] = [];
  const isActive = pack.key === activeKey;
  const marker = isActive ? '•' : '-';
  parts.push(`${marker} ${pack.key}`);

  if (pack.name && pack.name !== pack.key) {
    parts.push(`(${pack.name})`);
  }

  if (pack.description) {
    parts.push(`– ${pack.description}`);
  }

  if (pack.invalid) {
    parts.push('(invalid)');
  }

  return parts.join(' ');
}

function printPackDetails(pack: ContextPackWithKey): void {
  const output = {
    key: pack.key,
    name: pack.name,
    description: pack.description || null,
    scope: pack.scope
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)  }\n`);
}

export function registerContextCommands(program: Command): void {
  const contextCommand = program
    .command('context')
    .description('Manage context packs for scoped search defaults');

  contextCommand
    .command('list [path]')
    .description('List available context packs')
    .action((projectPath = '.') => {
      const resolvedPath = resolveProjectPath(projectPath);
      const packs = listContextPacks(resolvedPath);
      const active = getActiveContextPack(resolvedPath);
      const activeKey = active ? active.key : null;

      if (!packs || packs.length === 0) {
        process.stdout.write('No context packs found. Create files in .codevault/contextpacks/*.json' + '\n');
        return;
      }

      process.stdout.write(`Context packs in ${resolvedPath}:` + '\n');
      packs
        .sort((a, b) => a.key.localeCompare(b.key))
        .forEach(pack => {
          const normalizedPack: ContextPackWithKey = {
            ...pack,
            description: pack.description ?? undefined
          };
          process.stdout.write(`  ${formatPackLine(normalizedPack, activeKey)}` + '\n');
        });

      if (active) {
        process.stdout.write(`\nActive: ${active.key}${active.name && active.name !== active.key ? ` (${active.name})` : ''}` + '\n');
      }
    });

  contextCommand
    .command('show <name> [path]')
    .description('Show context pack definition')
    .action((name, projectPath = '.') => {
      const resolvedPath = resolveProjectPath(projectPath);
      try {
        const pack = loadContextPack(name, resolvedPath);
        const normalizedPack: ContextPackWithKey = {
          ...pack,
          description: pack.description ?? undefined
        };
        printPackDetails(normalizedPack);
      } catch (error) {
        console.error(`Failed to load context pack "${name}": ${(error as Error).message}`);
        process.exitCode = 1;
      }
    });

  contextCommand
    .command('use <name> [path]')
    .description('Activate a context pack')
    .action((name, projectPath = '.') => {
      const resolvedPath = resolveProjectPath(projectPath);
      try {
        const pack = setActiveContextPack(name, resolvedPath);
        process.stdout.write(`Activated context pack: ${pack.key}` + '\n');
        if (pack.name && pack.name !== pack.key) {
          process.stdout.write(`Display name: ${pack.name}` + '\n');
        }
        if (pack.description) {
          process.stdout.write(`Description: ${pack.description}` + '\n');
        }
        if (pack.scope && Object.keys(pack.scope).length > 0) {
          process.stdout.write('Default scope:' + '\n');
          for (const [key, value] of Object.entries(pack.scope)) {
            const valueStr = Array.isArray(value) ? value.join(', ') : String(value);
            process.stdout.write(`  ${key}: ${valueStr}` + '\n');
          }
        }
      } catch (error) {
        console.error(`Failed to activate context pack "${name}": ${(error as Error).message}`);
        process.exitCode = 1;
      }
    });
}
