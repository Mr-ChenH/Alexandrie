import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configureWorker } from '../docker-runtime-config.mjs';

const directory = fileURLToPath(new URL('../', import.meta.url));
const output = join(directory, '.output');
const workerPath = join(output, 'public', 'sw.js');
const templatePath = join(output, 'server', 'sw-runtime-template.js');
const originalWorker = await readFile(workerPath, 'utf8');
const originalTemplate = await readFile(templatePath, 'utf8').catch(() => undefined);
const requests = [];
const backend = createServer((request, response) => {
  requests.push(request.url);
  const result = request.url === '/api/nodes/public/runtime-test'
    ? { node: { id: 'runtime-test', user_id: 'runtime-user', role: 3, name: 'Docker runtime SSR', content_compiled: '<p>runtime-private-api-ok</p>', accessibility: 3, access: 1 }, children: [] }
    : [{ id: 'runtime-user', username: 'Runtime User' }];
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ status: 'success', message: 'ok', result }));
});
await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const env = {
  ...process.env,
  PORT: String(port),
  HOST: '127.0.0.1',
  NUXT_BASE_API_INTERNAL: `http://127.0.0.1:${backend.address().port}`,
  NUXT_PUBLIC_BASE_API: 'https://api.runtime-test.example',
  NUXT_PUBLIC_BASE_CDN: 'https://files.runtime-test.example',
  NUXT_PUBLIC_BASE_URL: 'https://notes.runtime-test.example',
  NUXT_PUBLIC_I18N_BASE_URL: 'https://notes.runtime-test.example',
};
let frontend;
try {
  await configureWorker(output, env);
  frontend = spawn(process.execPath, [join(output, 'server', 'index.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  frontend.stdout.on('data', data => { logs += data; });
  frontend.stderr.on('data', data => { logs += data; });
  const address = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (frontend.exitCode !== null) throw new Error(logs);
    try {
      await fetch(address);
      ready = true;
      break;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  assert.ok(ready, `Frontend did not start: ${logs}`);
  const response = await fetch(`${address}/doc/runtime-test`);
  const html = await response.text();
  assert.equal(response.status, 200, logs);
  assert.ok(html.includes('runtime-private-api-ok'), 'Public note SSR must use the internal API');
  assert.ok(requests.includes('/api/nodes/public/runtime-test'));
  assert.ok(html.includes('https://notes.runtime-test.example/doc/runtime-test'), 'Canonical URL must use the deployment domain');
  assert.ok(html.includes(env.NUXT_PUBLIC_BASE_API), 'The public API address must reach the browser');
  assert.ok(!html.includes(env.NUXT_BASE_API_INTERNAL), 'The private API address must stay on the server');
  const worker = await readFile(workerPath, 'utf8');
  assert.ok(worker.includes(env.NUXT_PUBLIC_BASE_API));
  assert.ok(worker.includes(env.NUXT_PUBLIC_BASE_CDN));
  assert.ok(!worker.includes('__ALEXANDRIE_API_ORIGIN__'));
  await configureWorker(output, { ...env, NUXT_PUBLIC_BASE_API: 'https://second-deployment.example' });
  assert.ok((await readFile(workerPath, 'utf8')).includes('https://second-deployment.example'));
  console.log('Passed: public note SSR, runtime public URLs, private API isolation, PWA configuration and container restart.');
} finally {
  if (frontend && frontend.exitCode === null) {
    const exited = once(frontend, 'exit');
    frontend.kill();
    await exited;
  }
  backend.closeAllConnections();
  await new Promise(resolve => backend.close(resolve));
  await writeFile(workerPath, originalWorker);
  if (originalTemplate === undefined) await rm(templatePath, { force: true });
  else await writeFile(templatePath, originalTemplate);
}
