<template>
  <div class="share-export" role="dialog" aria-modal="true" aria-labelledby="pdf-export-title" @keydown.stop @keydown.esc="emit('close')">
    <h2 id="pdf-export-title"><Icon name="share" />{{ t('nodes.pdf.title') }}</h2>
    <p class="note-name">{{ doc.name }}</p>

    <section class="export-panel">
      <div class="format-heading">
        <span class="format-icon"><Icon name="sidebar/pdf" /></span>
        <div>
          <h3>{{ t('nodes.actions.exportAsPdf') }}</h3>
          <p>{{ t('nodes.pdf.description') }}</p>
        </div>
      </div>

      <form @submit.prevent="generate">
        <div class="pdf-options">
          <div>
            <label for="pdf-format">{{ t('nodes.pdf.paperSize') }}</label>
            <select id="pdf-format" v-model="format" :disabled="busy">
              <option value="a4">A4</option>
              <option value="letter">Letter</option>
            </select>
          </div>
          <div>
            <label for="pdf-orientation">{{ t('nodes.pdf.orientation') }}</label>
            <select id="pdf-orientation" v-model="orientation" :disabled="busy">
              <option value="portrait">{{ t('nodes.pdf.portrait') }}</option>
              <option value="landscape">{{ t('nodes.pdf.landscape') }}</option>
            </select>
          </div>
        </div>
        <label class="description-option">
          <input v-model="includeDescription" type="checkbox" :disabled="busy" />
          {{ t('nodes.pdf.includeDescription') }}
        </label>

        <p v-if="busy" class="export-status" role="status" aria-live="polite">
          <LoaderSpinner />{{ progress ? t('nodes.pdf.progress', progress) : t('nodes.pdf.generating') }}
        </p>
        <p v-if="error" class="export-error" role="alert">{{ error }}</p>
        <AppButton v-if="!result" type="primary" :disabled="busy" @click="generate">
          <Icon name="sidebar/pdf" display="sm" />{{ busy ? t('nodes.pdf.generating') : t('nodes.pdf.generate') }}
        </AppButton>
      </form>

      <div v-if="result" class="export-result">
        <p class="export-success" role="status">{{ t('nodes.pdf.ready', { count: result.pages }) }}</p>
        <p v-if="result.missingImages" class="asset-warning" role="status">{{ t('nodes.pdf.missingImages', { count: result.missingImages }) }}</p>
        <div class="export-actions">
          <a class="download-pdf" :href="downloadUrl" :download="result.file.name"><Icon name="download" display="sm" />{{ t('nodes.pdf.download') }}</a>
          <AppButton v-if="canShareFile" type="secondary" :disabled="sharing" @click="sharePdf"><Icon name="share" display="sm" />{{ t('nodes.pdf.share') }}</AppButton>
          <a :href="downloadUrl" target="_blank" rel="noopener" class="preview-pdf">{{ t('common.actions.preview') }}</a>
        </div>
        <p v-if="!canShareFile" class="share-hint">{{ t('nodes.pdf.shareFallback') }}</p>
      </div>
    </section>

    <section v-if="isPublic || doc.accessibility === 3" class="link-panel">
      <h3><Icon name="link" display="sm" />{{ t('nodes.actions.publicLink') }}</h3>
      <div class="link-actions">
        <input :value="publicUrl" :aria-label="t('nodes.actions.publicLink')" readonly @focus="($event.target as HTMLInputElement).select()" />
        <AppButton type="secondary" @click="copyLink">{{ t('common.actions.copyLink') }}</AppButton>
        <AppButton v-if="canShareLink" type="secondary" @click="sharePublicLink">{{ t('common.actions.share') }}</AppButton>
      </div>
    </section>
    <p v-else class="privacy-hint"><Icon name="security" display="sm" />{{ t('nodes.pdf.privateNote') }}</p>
  </div>
</template>

<script setup lang="ts">
import type { Node } from '~/stores';
import type { DocumentPdf } from '~/helpers/pdf';

const props = defineProps<{ doc: Node; isPublic?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18nT();
const nodesStore = useNodesStore();
const preferences = usePreferencesStore();
const notifications = useNotifications();
const requestUrl = useRequestURL();
const publicUrl = computed(() => `${requestUrl.origin}/doc/${props.doc.id}`);

const format = ref<'a4' | 'letter'>('a4');
const orientation = ref<'portrait' | 'landscape'>('portrait');
const includeDescription = ref(true);
const busy = ref(false);
const sharing = ref(false);
const progress = ref<{ page: number; total: number }>();
const result = shallowRef<DocumentPdf>();
const error = ref('');
const downloadUrl = ref('');
let controller: AbortController | undefined;

const canShareLink = computed(() => import.meta.client && typeof navigator.share === 'function');
const canShareFile = computed(() => {
  if (!result.value || !import.meta.client || !navigator.share || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [result.value.file] });
  } catch {
    return false;
  }
});

function clearResult() {
  if (downloadUrl.value) URL.revokeObjectURL(downloadUrl.value);
  downloadUrl.value = '';
  result.value = undefined;
  error.value = '';
}
watch([format, orientation, includeDescription], clearResult);

async function generate() {
  if (busy.value) return;
  clearResult();
  busy.value = true;
  progress.value = undefined;
  const abort = new AbortController();
  controller = abort;
  try {
    // List/context-menu nodes are partial; fetch the full note before converting.
    let node = props.doc;
    if (!props.isPublic && node.partial) node = await nodesStore.fetch({ id: node.id });
    if (abort.signal.aborted) return;
    if (node.content == null && node.content_compiled == null) throw new Error('Note content unavailable');
    const { createDocumentPdf } = await import('~/helpers/pdf');
    const pdf = await createDocumentPdf(node, {
      format: format.value,
      orientation: orientation.value,
      includeDescription: includeDescription.value,
      theme: node.theme || preferences.get('theme').value,
      missingImageLabel: t('nodes.pdf.imageUnavailable'),
      resolveNode: id => nodesStore.getById(id)?.name,
      signal: abort.signal,
      onProgress: (page, total) => { progress.value = { page, total }; },
    });
    if (abort.signal.aborted) return;
    result.value = pdf;
    downloadUrl.value = URL.createObjectURL(pdf.file);
  } catch {
    if (!abort.signal.aborted) error.value = t('nodes.pdf.failed');
  } finally {
    if (!abort.signal.aborted) busy.value = false;
  }
}

async function sharePdf() {
  if (!result.value || !canShareFile.value || sharing.value) return;
  sharing.value = true;
  error.value = '';
  try {
    // Separate button keeps the required user activation after async generation.
    await navigator.share({ files: [result.value.file], title: props.doc.name });
  } catch (cause) {
    if (!(cause instanceof DOMException && cause.name === 'AbortError')) error.value = t('nodes.pdf.shareFailed');
  } finally {
    sharing.value = false;
  }
}

async function sharePublicLink() {
  try {
    await navigator.share({ title: props.doc.name, text: props.doc.description, url: publicUrl.value });
  } catch (cause) {
    if (!(cause instanceof DOMException && cause.name === 'AbortError')) await copyLink();
  }
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(publicUrl.value);
    notifications.add({ type: 'success', title: t('nodes.notifications.linkCopied') });
  } catch {
    notifications.add({ type: 'error', title: t('common.errors.generic') });
  }
}

onBeforeUnmount(() => {
  controller?.abort();
  clearResult();
});
</script>

<style scoped lang="scss">
.share-export {
  padding-bottom: 24px !important;
}

h2,
.link-panel h3 {
  display: flex;
  align-items: center;
  gap: 10px;
}

h2 {
  margin: 8px 32px 4px 0;
  border: none;
  font-size: 1.35rem;
}

.note-name {
  margin: 0 0 24px;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}

.export-panel,
.link-panel {
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-raised-light);
}

.format-heading {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 18px;

  h3 {
    margin: 0 0 4px;
    font-size: 1rem;
  }

  p {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-secondary);
  }
}

.format-icon {
  display: flex;
  padding: 10px;
  border-radius: var(--radius-md);
  color: var(--primary);
  background: var(--primary-bg);
}

.pdf-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.description-option {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 14px 0 20px;

  input {
    width: 16px;
    height: 16px;
    accent-color: var(--primary);
  }
}

.export-actions,
.link-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.download-pdf {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  font-weight: 550;
  color: var(--on-primary);
  background: var(--primary);

  &:hover {
    background: var(--primary-dark);
  }
}

.preview-pdf {
  padding: 8px 4px;
  font-size: 0.85rem;
  color: var(--primary);
  text-decoration: underline;
}

.export-status,
.privacy-hint {
  display: flex;
  align-items: center;
  gap: 8px;
}

.export-status,
.export-success,
.share-hint,
.asset-warning,
.privacy-hint {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.export-error {
  font-size: 0.85rem;
  color: var(--red);
}

.export-success {
  color: var(--green);
}

.asset-warning {
  color: var(--orange);
}

.link-panel {
  margin-top: 16px;

  h3 {
    margin: 0 0 12px;
    font-size: 0.95rem;
  }

  input {
    flex: 1;
    min-width: 0;
  }
}

.privacy-hint {
  margin-bottom: 0;
}

@media (width <= 480px) {
  .export-panel,
  .link-panel {
    padding: 14px;
  }
}
</style>
