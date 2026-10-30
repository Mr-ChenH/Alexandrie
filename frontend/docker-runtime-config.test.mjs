import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderWorkerConfig, configureWorker } from './docker-runtime-config.mjs';

const source = 'const api="__ALEXANDRIE_API_ORIGIN__";const cdn="__ALEXANDRIE_CDN_ORIGIN__";';

test('normalizes public URLs to origins without exposing internal URLs', () => {
  const rendered = renderWorkerConfig(source, {
    NUXT_PUBLIC_BASE_API: 'https://api.example.com/service/',
    NUXT_PUBLIC_BASE_CDN: 'https://cdn.example.com:8443/bucket/',
    NUXT_BASE_API_INTERNAL: 'http://backend:8201',
  });
  assert.ok(rendered.includes('https://api.example.com"'));
  assert.ok(rendered.includes('https://cdn.example.com:8443"'));
  assert.ok(!rendered.includes('backend'));
  assert.ok(!rendered.includes('__ALEXANDRIE_'));
});

test('accepts same-origin deployments and rejects executable or credential-bearing URLs', () => {
  assert.equal(renderWorkerConfig(source, {}), 'const api="";const cdn="";');
  assert.throws(() => renderWorkerConfig(source, { NUXT_PUBLIC_BASE_API: 'javascript:alert(1)' }));
  assert.throws(() => renderWorkerConfig(source, { NUXT_PUBLIC_BASE_CDN: 'https://user:password@example.com' }));
});

test('reconfigures the worker on container restart using the unchanged template', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'alexandrie-runtime-'));
  try {
    await mkdir(join(directory, 'public'));
    await mkdir(join(directory, 'server'));
    await writeFile(join(directory, 'public', 'sw.js'), source);
    await configureWorker(directory, { NUXT_PUBLIC_BASE_API: 'http://localhost:8201' });
    assert.ok((await readFile(join(directory, 'public', 'sw.js'), 'utf8')).includes('http://localhost:8201'));
    await configureWorker(directory, { NUXT_PUBLIC_BASE_API: 'https://notes.example.com' });
    const restarted = await readFile(join(directory, 'public', 'sw.js'), 'utf8');
    assert.ok(restarted.includes('https://notes.example.com'));
    assert.ok(!restarted.includes('localhost'));
    assert.equal(await readFile(join(directory, 'server', 'sw-runtime-template.js'), 'utf8'), source);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
