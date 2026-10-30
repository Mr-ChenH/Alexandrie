import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAutosave, type SaveStatus } from './editor-autosave';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('serializes writes, snapshots the newest content, and ignores stale acknowledgements', async () => {
  let text = 'first';
  const pending: ReturnType<typeof deferred<{ synced: boolean }>>[] = [];
  const writes: string[] = [];
  const acknowledgements: boolean[] = [];
  const statuses: SaveStatus[] = [];
  const saver = createAutosave({
    snapshot: () => text,
    persist: async value => { writes.push(value); const next = deferred<{ synced: boolean }>(); pending.push(next); return next.promise; },
    isLocal: result => !result.synced,
    onResult: (_result, current) => acknowledgements.push(current),
    onStatus: status => statuses.push(status),
    enabled: () => true,
  });
  saver.change();
  const first = saver.flush();
  text = 'second'; saver.change();
  text = 'latest'; saver.change();
  const second = saver.flush();
  assert.deepEqual(writes, ['first']);
  pending[0]!.resolve({ synced: true });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(writes, ['first', 'latest']);
  pending[1]!.resolve({ synced: true });
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.deepEqual(acknowledgements, [false, true]);
  assert.equal(statuses.at(-1), 'saved');
  assert.equal(saver.dirty, false);
  saver.dispose();
});

test('failure keeps changes dirty, reports error, and allows retry', async () => {
  let fail = true;
  const statuses: SaveStatus[] = [];
  const saver = createAutosave({ snapshot: () => 'draft', persist: async () => { if (fail) throw new Error('403'); return { synced: true }; }, isLocal: value => !value.synced, onStatus: value => statuses.push(value), enabled: () => false });
  saver.change();
  assert.equal(await saver.flush(), false);
  assert.equal(saver.dirty, true);
  assert.equal(statuses.at(-1), 'error');
  fail = false;
  assert.equal(await saver.flush(), true);
  assert.equal(saver.dirty, false);
  assert.equal(statuses.at(-1), 'saved');
  saver.dispose();
});

test('offline acknowledgement is local rather than a false server success', async () => {
  let status: SaveStatus = 'idle';
  const saver = createAutosave({ snapshot: () => 'offline', persist: async () => ({ synced: false }), isLocal: value => !value.synced, onStatus: value => { status = value; }, enabled: () => false });
  saver.change();
  await saver.flush();
  assert.equal(status, 'local');
  saver.dispose();
});

test('coalesces typing and cancels delayed saves on disposal', async () => {
  let calls = 0;
  const saver = createAutosave({ snapshot: () => '', persist: async () => { calls++; return {}; }, isLocal: () => false, onStatus: () => undefined, enabled: () => true, delay: 20, maxWait: 100 });
  saver.change(); saver.change(); saver.change();
  await new Promise(resolve => setTimeout(resolve, 35));
  assert.equal(calls, 1);
  saver.change(); saver.dispose();
  await new Promise(resolve => setTimeout(resolve, 35));
  assert.equal(calls, 1);
});

test('composition blocks queued writes even when an earlier request completes', async () => {
  let blocked = false;
  let calls = 0;
  const pending = deferred<object>();
  const saver = createAutosave({ snapshot: () => '', persist: async () => { calls++; return calls === 1 ? pending.promise : {}; }, isLocal: () => false, onStatus: () => undefined, enabled: () => !blocked, canPersist: () => !blocked });
  saver.change();
  const first = saver.flush();
  blocked = true;
  saver.change();
  pending.resolve({});
  assert.equal(await first, false);
  assert.equal(calls, 1);
  assert.equal(saver.dirty, true);
  blocked = false;
  await saver.flush();
  assert.equal(calls, 2);
  saver.dispose();
});

test('continuous typing is saved by maxWait rather than postponed indefinitely', async () => {
  let calls = 0;
  const saver = createAutosave({ snapshot: () => '', persist: async () => { calls++; return {}; }, isLocal: () => false, onStatus: () => undefined, enabled: () => true, delay: 100, maxWait: 30 });
  saver.change();
  await new Promise(resolve => setTimeout(resolve, 20)); saver.change();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(calls, 1);
  saver.dispose();
});
