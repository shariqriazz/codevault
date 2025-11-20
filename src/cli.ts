#!/usr/bin/env node

import { runCli } from './cli/index.js';

runCli().catch((error) => {
  console.error('Fatal error:', (error as Error).message);
  process.exit(1);
});
