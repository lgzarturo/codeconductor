import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderDocs } from '../src/cli/command-registry';

const destination = resolve(import.meta.dir, '..', 'docs', 'generated');
await mkdir(destination, { recursive: true });
await writeFile(resolve(destination, 'cli.md'), `${renderDocs()}\n`, 'utf-8');
