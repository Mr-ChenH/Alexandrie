import type { Node } from '~/stores';

export interface EditorDraft {
  document: Partial<Node>;
  savedAt: number;
  baseUpdatedAt: number;
}

export function editorSignature(node: Partial<Node>): string {
  return JSON.stringify([node.name || '', node.description || '', node.content || '', node.tags || '', node.parent_id || '', node.theme || '']);
}

export function editorDraftKey(scope: string, documentId: string): string {
  return `alexandrie:editor:${encodeURIComponent(scope)}:${encodeURIComponent(documentId)}`;
}

export function readEditorDraft(storage: Pick<Storage, 'getItem'>, key: string): EditorDraft | undefined {
  try {
    const value = JSON.parse(storage.getItem(key) || 'null') as EditorDraft | null;
    if (!value || !value.document || typeof value.savedAt !== 'number') return;
    if (value.document.content != null && typeof value.document.content !== 'string') return;
    return value;
  } catch {
    return;
  }
}

export function writeEditorDraft(storage: Pick<Storage, 'setItem'>, key: string, node: Partial<Node>, baseUpdatedAt: number): void {
  const document = { ...node };
  delete document.content_compiled;
  delete document.permissions;
  delete document._children;
  storage.setItem(key, JSON.stringify({ document, baseUpdatedAt, savedAt: Date.now() } satisfies EditorDraft));
}
