import path from 'path';
import { getActiveContextPack, listContextPacks, loadContextPack, setActiveContextPack } from '../../context/packs.js';
import type { Command } from 'commander';
import { print } from '../../utils/logger.js';

function resolveProjectPath(projectPath = '.'): string {
  return path.resolve(projectPath || '.');
}

function formatPackLine(pack: any, activeKey: string | null): string {
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

function printPackDetails(pack: any): void {
  const output = {
    key: pack.key,
    name: pack.name,
    description: pack.description || null,
    scope: pack.scope
  };
  print(JSON.stringify(output, null, 2));
}

export function registerContextCommands(program: Command): void {
  const contextCommand = program
    .command('context')
    .description('Manage context packs for scoped search defaults');

  contextCommand
    .command('list [path]')
    .description('List available context packs')
    .action((projectPath = '.') => {
      const projectPathStr: string = typeof projectPath === 'string' ? projectPath : '.';
      const resolvedPath = resolveProjectPath(projectPathStr);
      const packs = listContextPacks(resolvedPath);
      const active = getActiveContextPack(resolvedPath);
      const activeKey = active ? active.key : null;

      if (!packs || packs.length === 0) {
        print('No context packs found. Create files in .codevault/contextpacks/*.json');
        return;
      }

      print(`Context packs in ${resolvedPath}:`);
      packs
        .sort((a, b) => {
          const aKey: string = typeof a.key === 'string' ? a.key : '';
          const bKey: string = typeof b.key === 'string' ? b.key : '';
          return aKey.localeCompare(bKey);
        })
        .forEach(pack => {
          print(`  ${formatPackLine(pack, activeKey)}`);
        });

      if (active) {
        print(`\nActive: ${active.key}${active.name && active.name !== active.key ? ` (${active.name})` : ''}`);
      }
    });

  contextCommand
    .command('show <name> [path]')
    .description('Show context pack definition')
    .action((name, projectPath = '.') => {
      const nameStr: string = typeof name === 'string' ? name : String(name);
      const projectPathStr: string = typeof projectPath === 'string' ? projectPath : '.';
      const resolvedPath = resolveProjectPath(projectPathStr);
      try {
        const pack = loadContextPack(nameStr, resolvedPath);
        printPackDetails(pack);
      } catch (error) {
        console.error(`Failed to load context pack "${nameStr}": ${(error as Error).message}`);
        process.exitCode = 1;
      }
    });

  contextCommand
    .command('use <name> [path]')
    .description('Activate a context pack')
    .action((name, projectPath = '.') => {
      const nameStr: string = typeof name === 'string' ? name : String(name);
      const projectPathStr: string = typeof projectPath === 'string' ? projectPath : '.';
      const resolvedPath = resolveProjectPath(projectPathStr);
      try {
        const pack = setActiveContextPack(nameStr, resolvedPath);
        print(`Activated context pack: ${pack.key}`);
        if (pack.name && pack.name !== pack.key) {
          print(`Display name: ${pack.name}`);
        }
        if (pack.description) {
          print(`Description: ${pack.description}`);
        }
        if (pack.scope && Object.keys(pack.scope).length > 0) {
          print('Default scope:');
          for (const [key, value] of Object.entries(pack.scope)) {
            print(`  ${key}: ${Array.isArray(value) ? value.join(', ') : value}`);
          }
        }
      } catch (error) {
        console.error(`Failed to activate context pack "${nameStr}": ${(error as Error).message}`);
        process.exitCode = 1;
      }
    });
}
