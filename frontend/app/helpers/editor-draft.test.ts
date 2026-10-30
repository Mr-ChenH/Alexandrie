import assert from 'node:assert/strict';
import { test } from 'node:test';
import { editorDraftKey, editorSignature, readEditorDraft, writeEditorDraft } from './editor-draft';

test('recovery drafts are scoped to user and note, and retain the last typed character', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) || null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const key = editorDraftKey('user-1', 'note-1');
  writeEditorDraft(storage, key, { id: 'note-1', name: '中文', content: '最后一个字。', content_compiled: '<p>large</p>' }, 10);
  assert.equal(readEditorDraft(storage, key)?.document.content, '最后一个字。');
  assert.equal(readEditorDraft(storage, key)?.document.content_compiled, undefined);
  assert.equal(readEditorDraft(storage, editorDraftKey('user-2', 'note-1')), undefined);
  assert.equal(readEditorDraft(storage, editorDraftKey('user-1', 'note-2')), undefined);
});

test('malformed drafts are ignored and persistence metadata does not count as editing', () => {
  assert.equal(readEditorDraft({ getItem: () => '{broken' }, 'x'), undefined);
  assert.equal(readEditorDraft({ getItem: () => JSON.stringify({ document: { content: 123 }, savedAt: 4 }) }, 'x'), undefined);
  assert.equal(editorSignature({ name: 'same', content: 'same', synced: false }), editorSignature({ name: 'same', content: 'same', synced: true, updated_timestamp: 20 }));
  assert.notEqual(editorSignature({ content: 'a' }), editorSignature({ content: 'ab' }));
});
