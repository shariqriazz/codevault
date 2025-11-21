import { resolveProjectRoot } from '../../utils/path-helpers.js';
import { UseContextPackArgs } from '../schemas.js';

export async function handleUseContextPack(args: UseContextPackArgs, setSessionPack: (pack: unknown) => void) {
  const cleanPath = resolveProjectRoot(args);
  const name = args.name;

  if (name === 'default' || name === 'none' || name === 'clear') {
    setSessionPack(null);
    return {
      content: [{ type: 'text', text: 'Cleared active context pack for this session' }],
    };
  }

  try {
    const { loadContextPack } = await import('../../context/packs.js');
    const pack = loadContextPack(name, cleanPath);
    setSessionPack({ ...pack, basePath: cleanPath });

    return {
      content: [
        {
          type: 'text',
          text: `Context pack "${pack.key}" activated for session\n\nScope: ${JSON.stringify(pack.scope, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
      isError: true,
    };
  }
}