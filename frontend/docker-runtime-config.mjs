import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function publicOrigin(value) {
  if (!value) return '';
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Public API and CDN URLs must be HTTP(S) URLs without credentials');
  }
  return url.origin;
}

export function renderWorkerConfig(source, env) {
  return source
    .replaceAll('__ALEXANDRIE_API_ORIGIN__', publicOrigin(env.NUXT_PUBLIC_BASE_API))
    .replaceAll('__ALEXANDRIE_CDN_ORIGIN__', publicOrigin(env.NUXT_PUBLIC_BASE_CDN));
}

export async function configureWorker(outputDirectory, env = process.env) {
  const worker = join(outputDirectory, 'public', 'sw.js');
  // Store the original outside the public directory so restarts can change URLs.
  const template = join(outputDirectory, 'server', 'sw-runtime-template.js');
  try {
    await access(template);
  } catch {
    await writeFile(template, await readFile(worker, 'utf8'));
  }
  const source = await readFile(template, 'utf8');
  await writeFile(worker, renderWorkerConfig(source, env));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const outputDirectory = process.argv[2] || fileURLToPath(new URL('./.output/', import.meta.url));
  await configureWorker(outputDirectory);
}
