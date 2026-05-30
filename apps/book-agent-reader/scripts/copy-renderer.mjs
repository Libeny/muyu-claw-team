import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(root, 'src', 'renderer');
const target = path.join(root, 'dist', 'renderer');

await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
