<!-- eslint-disable vue/no-v-html -->
<template>
  <div class="editor-wrapper" @compositionstart="startComposition" @compositionend="finishComposition">
    <Teleport v-if="!public" to="#navbar-title"> {{ t('components.editor.title') }}</Teleport>

    <div v-if="recovery" class="recovery-banner" role="alert">
      <span>{{ t('components.editor.recovery') }}</span>
      <AppButton type="primary" small @click="restoreDraft">{{ t('components.editor.restoreDraft') }}</AppButton>
      <AppButton type="secondary" small @click="discardDraft">{{ t('components.editor.useSaved') }}</AppButton>
    </div>
    <div class="editor-container" :inert="recovery ? true : undefined">
      <div class="editor-controls">
        <div class="layout-controls" role="group" :aria-label="t('components.editor.layout')">
          <button :class="{ selected: layout === 'edit' }" :aria-pressed="layout === 'edit'" @click="setLayout('edit')"><Icon name="editor" display="sm" />{{ t('common.actions.edit') }}</button>
          <button :class="{ selected: layout === 'split' }" :aria-pressed="layout === 'split'" @click="setLayout('split')"><Icon name="view" display="sm" />{{ t('components.editor.split') }}</button>
          <button :class="{ selected: layout === 'preview' }" :aria-pressed="layout === 'preview'" @click="setLayout('preview')"><Icon name="preview" display="sm" />{{ t('common.actions.preview') }}</button>
        </div>
        <div class="save-status" :class="status" role="status" aria-live="polite">
          <Icon :name="status === 'error' ? 'warning' : status === 'local' ? 'no_synced' : status === 'saved' ? 'check' : 'save'" display="sm" />
          <span>{{ statusLabel }}</span>
          <button v-if="status === 'error' || status === 'local'" class="retry-save" @click="save">{{ t('components.editor.retry') }}</button>
        </div>
      </div>
      <p v-if="draftWarning" class="draft-warning" role="alert">{{ t('components.editor.draftUnavailable') }}</p>
      <!-- Toolbar Section -->

      <Toolbar v-model="document" :public="public" @execute-action="handleToolbarAction" />

      <!-- Compact Document Metadata -->
      <div class="document-meta">
        <div class="line">
          <input
            ref="titleInput"
            v-model="document.name"
            :autofocus="autofocusTitle"
            :placeholder="t('components.editor.placeholder.title')"
            class="meta-title"
            :aria-label="t('components.editor.placeholder.title')"
          />
          <input
            v-model="document.description"
            :placeholder="t('components.editor.placeholder.description')"
            class="meta-description"
            :aria-label="t('components.editor.placeholder.description')"
          />
        </div>
        <AppTagInput v-model="document.tags" display="row" minimal />
      </div>

      <!-- Editor Content Section -->
      <div class="editor-content" :class="`layout-${layout}`">
        <div v-show="layout !== 'preview'" class="editor-panel" :class="{ 'with-preview': layout === 'split' }">
          <div ref="editorContainer" class="codemirror-editor" :class="{ 'scroll-beyond-last-line': scrollBeyondLastLine }" />
        </div>

        <div v-if="showPreview" class="preview-panel">
          <div class="panel-header">
            <span class="panel-label">{{ t('common.actions.preview') }}</span>
          </div>
          <NodeDocumentContentCompiled ref="markdownPreviewComponent" :node="document" :interactive="false" />
          <DrawioSidebar :diagrams="referencedDrawioResources" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { EditorView } from '@codemirror/view';
import { loadTheme } from './themes';
import { createEditorState } from './modules/editorState';
import { createKeymaps } from './modules/editorKeymaps';
import { createUploadsHandlers } from './modules/editorUploads';
import { createSnippetSource } from './modules/editorUtils';
import { createInternalLinks } from './modules/internalLinks';
import { createCommands } from './modules/editorCommands';
import { createScrollSync } from './modules/scrollSync';
import { createAutosave, type SaveStatus } from '~/helpers/editor-autosave';
import { editorDraftKey, editorSignature, readEditorDraft, writeEditorDraft, type EditorDraft } from '~/helpers/editor-draft';
import compile from '~/helpers/markdown';
import Toolbar from './Toolbar.vue';
import DrawioSidebar from './DrawioSidebar.vue';
import NodeDocumentContentCompiled from '~/components/Node/Document/ContentCompiled.vue';
import type { Node } from '~/stores';

const { t } = useI18nT();
const resourcesStore = useResourcesStore();
const nodesStore = useNodesStore();
const userStore = useUserStore();
const preferences = usePreferencesStore();
const { isMobile } = useDevice();
const props = defineProps<{
  public?: boolean;
  autofocusTitle?: boolean;
  draftKey?: string;
  persist: (document: Partial<Node>) => Promise<Node>;
}>();
const emit = defineEmits<{ exit: [id?: string] }>();
const document = defineModel<Partial<Node>>({ required: true });
const editorContainer = ref<HTMLDivElement>();
const titleInput = ref<HTMLInputElement>();
const markdownPreviewComponent = ref<InstanceType<typeof NodeDocumentContentCompiled>>();
const markdownPreview = computed(() => markdownPreviewComponent.value?.rootElement as HTMLElement | undefined);
const editorView = shallowRef<EditorView | null>(null);
const layout = ref<'edit' | 'split' | 'preview'>(isMobile.value ? 'edit' : preferences.get('editorLayout').value);
const showPreview = computed({ get: () => layout.value !== 'edit', set: value => setLayout(value ? 'split' : 'edit') });
const autoSaveEnabled = preferences.get('documentAutoSave');
const scrollBeyondLastLine = preferences.get('editorScrollBeyondLastLine');
const status = ref<SaveStatus>('idle');
const recovery = ref<EditorDraft>();
const draftWarning = ref(false);
const composing = ref(false);
let previewTimer: ReturnType<typeof setTimeout> | undefined;
let draftTimer: ReturnType<typeof setTimeout> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let baseUpdatedAt = document.value.updated_timestamp || 0;
let disposed = false;
const storageKey = editorDraftKey(userStore.user?.id || document.value.user_id || 'local', props.draftKey || document.value.id || 'new');
const scrollSync = createScrollSync({ getView: () => editorView.value, getPreview: () => markdownPreview.value });
const resolveNode = (id: string) => nodesStore.getById(id)?.name;

const statusLabel = computed(() => {
  if (status.value === 'idle') return t(autoSaveEnabled.value ? 'components.editor.autosaveOn' : 'components.editor.autosaveOff');
  if (status.value === 'dirty') return t(autoSaveEnabled.value ? 'components.editor.savePending' : 'components.editor.unsaved');
  return t(`components.editor.${status.value}`);
});

function renderPreview() {
  clearTimeout(previewTimer);
  document.value.content_compiled = compile(document.value.content || '', resolveNode);
}

function snapshot(): Partial<Node> {
  // Read synchronously before persistence; compilation must not lag a save request.
  if (editorView.value) document.value.content = editorView.value.state.doc.toString();
  renderPreview();
  return { ...document.value, name: document.value.name?.trim() || t('components.editor.untitled') };
}

function persistDraft(): boolean {
  clearTimeout(draftTimer);
  if (recovery.value || !saver.dirty && status.value !== 'local' && status.value !== 'error') return true;
  try {
    writeEditorDraft(localStorage, storageKey, document.value, baseUpdatedAt);
    draftWarning.value = false;
    return true;
  } catch {
    draftWarning.value = true;
    return false;
  }
}

function removeDraft() {
  clearTimeout(draftTimer);
  try { localStorage.removeItem(storageKey); } catch { /* Storage may be disabled. */ }
}

const saver = createAutosave({
  snapshot,
  persist: data => props.persist(data),
  enabled: () => autoSaveEnabled.value && !composing.value && !recovery.value,
  canPersist: () => !composing.value && !recovery.value,
  isLocal: node => node.synced === false,
  onStatus: value => { status.value = value; },
  onResult: (node, current) => {
    baseUpdatedAt = node.updated_timestamp || baseUpdatedAt;
    document.value = { ...document.value, id: node.id, user_id: node.user_id, synced: node.synced, partial: false, updated_timestamp: node.updated_timestamp };
    if (current && node.synced !== false) removeDraft();
    else {
      if (node.synced === false) status.value = 'local';
      persistDraft();
    }
    clearTimeout(retryTimer);
    if (node.synced === false) retryTimer = setTimeout(() => { if (navigator.onLine) void reconnect(); }, 10000);
  },
});

function changed() {
  if (disposed || recovery.value) return;
  saver.change();
  clearTimeout(draftTimer);
  draftTimer = setTimeout(persistDraft, 120);
}

const commands = createCommands({
  getView: () => editorView.value,
  getDoc: () => document.value as Node,
  setDoc: data => { document.value = data; },
  showPreview,
  save: () => { void save(); },
});
const uploadsHandlers = createUploadsHandlers({ resourcesStore, nodeId: () => document.value.id, insertText: text => commands.exec('insertText', text) });
const referencedDrawioResources = computed(() => nodesStore.resources.filter(resource => resource.metadata?.drawio && resource.parent_id === document.value.id));
const state = createEditorState({
  initialDoc: document.value.content || '',
  spellCheck: preferences.get('editorSpellCheck'),
  themeExtension: loadTheme(),
  keymaps: createKeymaps(commands),
  snippetSource: createSnippetSource(preferences.get('editorSnippetsEnabled'), preferences.get('snippets')),
  internalLinks: createInternalLinks({ getName: resolveNode, getDocuments: () => nodesStore.documents }),
  onDocChanged: (content, isComposing) => {
    if (isComposing) composing.value = true;
    document.value.content = content;
  },
  uploadsHandlers,
});

watch(() => editorSignature(document.value), () => {
  if (recovery.value) return;
  const view = editorView.value;
  if (view && view.state.doc.toString() !== (document.value.content || '')) {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: document.value.content || '' } });
  }
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, 120);
  changed();
}, { flush: 'sync' });

watch(autoSaveEnabled, enabled => {
  if (enabled && saver.dirty) saver.schedule();
  else if (!enabled) saver.cancelTimers();
});

watch(() => document.value.content_compiled, () => nextTick(scrollSync.syncEditorToPreview));

function setLayout(value: 'edit' | 'split' | 'preview') {
  layout.value = value;
  preferences.set('editorLayout', value);
  renderPreview();
  void nextTick(() => {
    editorView.value?.requestMeasure();
    if (value !== 'preview') editorView.value?.focus();
    scrollSync.syncEditorToPreview();
  });
}

async function save() {
  if (recovery.value || composing.value) return;
  clearTimeout(retryTimer);
  snapshot();
  persistDraft();
  if (!saver.dirty && (status.value === 'local' || status.value === 'error' || !document.value.id)) saver.change();
  await saver.flush();
}

async function reconnect() {
  if (disposed || !autoSaveEnabled.value || recovery.value) return;
  if (status.value !== 'local' && status.value !== 'error' && !saver.dirty) return;
  await nodesStore.syncLocalDeltas();
  if (disposed) return;
  saver.change();
  await saver.flush();
}

function startComposition() {
  composing.value = true;
  saver.cancelTimers();
}

function finishComposition() {
  composing.value = false;
  void nextTick(() => {
    if (editorView.value) document.value.content = editorView.value.state.doc.toString();
    if (saver.dirty) saver.schedule();
  });
}

function handleGlobalKeys(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || composing.value || useModal().modals.value.length || useCommandCenter().isOpen?.value) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    void save();
  }
  if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === 'p') {
    event.preventDefault();
    setLayout(layout.value === 'edit' ? 'split' : 'edit');
  }
}

function handleToolbarAction(action: string, payload?: string) {
  if (action === 'save') return void save();
  if (action === 'preview') return setLayout(layout.value === 'edit' ? 'split' : 'edit');
  if (action === 'goto') return void exit();
  if (layout.value === 'preview') {
    setLayout('split');
    void nextTick(() => { commands.exec(action, payload); });
  } else commands.exec(action, payload);
}

function restoreDraft() {
  const draft = recovery.value;
  if (!draft) return;
  recovery.value = undefined;
  document.value = { ...document.value, ...draft.document };
  renderPreview();
  // Even an identical draft may represent an offline write awaiting retry.
  if (!saver.dirty) changed();
}

function discardDraft() {
  recovery.value = undefined;
  removeDraft();
}

async function prepareLeave(): Promise<boolean> {
  if (recovery.value) return true;
  snapshot();
  const local = persistDraft();
  if (autoSaveEnabled.value) {
    const saved = await saver.flush();
    return saved || local;
  }
  return !saver.dirty || local;
}

async function exit() {
  if (await prepareLeave()) emit('exit', document.value.id);
}

function beforeUnload(event: BeforeUnloadEvent) {
  if (!persistDraft() && saver.dirty) { event.preventDefault(); event.returnValue = ''; }
}
function visibilityChanged() {
  if (window.document.visibilityState !== 'hidden') return;
  persistDraft();
  if (autoSaveEnabled.value && !composing.value) void saver.flush();
}

onBeforeRouteLeave(prepareLeave);
onBeforeRouteUpdate(prepareLeave);
onMounted(() => {
  const draft = readEditorDraft(localStorage, storageKey);
  if (draft && editorSignature(draft.document) !== editorSignature(document.value)) recovery.value = draft;
  else if (draft) removeDraft();
  renderPreview();
  if (!editorContainer.value) return;
  editorView.value = new EditorView({ state, parent: editorContainer.value });
  editorView.value.scrollDOM.addEventListener('scroll', scrollSync.syncEditorToPreview);
  window.addEventListener('keydown', handleGlobalKeys);
  window.addEventListener('beforeunload', beforeUnload);
  window.addEventListener('pagehide', persistDraft);
  window.addEventListener('online', reconnect);
  window.document.addEventListener('visibilitychange', visibilityChanged);
  if (props.autofocusTitle && !recovery.value) titleInput.value?.focus();
});
onBeforeUnmount(() => {
  persistDraft();
  disposed = true;
  saver.dispose();
  clearTimeout(previewTimer);
  clearTimeout(draftTimer);
  clearTimeout(retryTimer);
  editorView.value?.scrollDOM.removeEventListener('scroll', scrollSync.syncEditorToPreview);
  editorView.value?.destroy();
  scrollSync.dispose();
  window.removeEventListener('keydown', handleGlobalKeys);
  window.removeEventListener('beforeunload', beforeUnload);
  window.removeEventListener('pagehide', persistDraft);
  window.removeEventListener('online', reconnect);
  window.document.removeEventListener('visibilitychange', visibilityChanged);
});
</script>

<style scoped lang="scss">
.editor-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 0;
}

.editor-controls {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 8px 2px 4px;
}

.layout-controls {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-raised-light);

  button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    font-size: 12px;
    color: var(--text-secondary);

    &.selected {
      color: var(--primary);
      background: var(--primary-bg);
    }
  }
}

.save-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);

  &.saved { color: var(--green); }
  &.error { color: var(--red); }
  &.local { color: var(--orange); }
}

.retry-save {
  padding: 3px 6px;
  font-size: inherit;
  color: var(--primary);
  text-decoration: underline;
}

.recovery-banner {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 8px 0;
  padding: 12px;
  border: 1px solid var(--primary-border);
  border-radius: var(--radius-md);
  font-size: 13px;
  background: var(--primary-bg);
}

.draft-warning {
  margin: 4px 0;
  font-size: 12px;
  color: var(--red);
}

.layout-preview .preview-panel {
  max-height: none;
}

.editor-container {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  min-height: 0;
}

// Compact Document Metadata - Single line
.document-meta {
  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }

  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-base);
}

.meta-title {
  flex: 0 1 auto;
  box-sizing: border-box;
  min-width: 140px;
  max-width: 320px;
  height: 34px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-primary);
  background: var(--surface-raised);
  outline: none;
  transition: all $transition-base ease;

  &:hover {
    border-color: var(--border);
    background: var(--surface-overlay);
  }

  &:focus {
    border-color: var(--primary);
    background: var(--surface-base);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent);
  }

  &::placeholder {
    font-weight: 400;
    color: var(--text-secondary);
    opacity: 0.8;
  }
}

.meta-description {
  flex: 1 1 200px;
  box-sizing: border-box;
  min-width: 150px;
  height: 34px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-primary);
  background: var(--surface-raised);
  outline: none;
  transition: all $transition-base ease;

  &:hover {
    border-color: var(--border);
    background: var(--surface-overlay);
  }

  &:focus {
    border-color: var(--primary);
    background: var(--surface-base);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent);
  }

  &::placeholder {
    font-weight: 400;
    color: var(--text-secondary);
    opacity: 0.8;
  }
}

// Editor Content Section
.editor-content {
  display: flex;
  flex: 1;
  gap: 8px;
  min-height: 0;
}

.editor-panel,
.preview-panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-base);
  overflow: hidden;
}

.editor-panel.with-preview {
  max-width: 50%;
}

.panel-header {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-transparent);
}

.panel-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.codemirror-editor {
  flex: 1;
  overflow: auto;
}

.editor-container:deep(.cm-editor) {
  height: 100%;
}

.editor-container:deep(.cm-selectionBackground) {
  background-color: var(--selection-color) !important;
}

.editor-container:deep(.cm-scroller) {
  padding: 8px 12px;
}

// Scroll past the end of the document (#653), so the line being typed need not sit at
// the bottom of the screen. Padding on .cm-content rather than a CodeMirror extension:
// the space has to be INSIDE the scrollable content for the scroller to reach it, and
// this way toggling the preference is a class change with no editor reconfiguration.
//
// vh rather than a line count: the useful amount is "most of a screen", which is what
// makes the last line reachable near the top, and it stays right when the font size or
// the window changes.
.codemirror-editor.scroll-beyond-last-line:deep(.cm-content) {
  padding-bottom: 60vh;
}

.markdown-preview {
  flex: 1;
  padding: 12px 16px;
  background: var(--surface-base);
  overflow: auto;
}

// Responsive
@media (width <= 900px) {
  .editor-content {
    flex-direction: column;
  }

  .editor-panel.with-preview {
    max-width: 100%;
    max-height: 50%;
  }

  .meta-description {
    flex: 0;
  }

  .preview-panel {
    max-height: 50%;
  }
}

@media (width <= 600px) {
  .document-meta {
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    padding: 8px 10px;
  }

  .meta-title,
  .meta-description {
    width: 100%;
    max-width: 100%;
  }
}
</style>
