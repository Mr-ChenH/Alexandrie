<template>
  <LazyMarkdownEditor v-if="node" :key="nodeId" v-model="node" :persist="persist" :draft-key="`note:${nodeId}`" @exit="exit" />
  <Error v-else-if="error" :error="error" />
</template>

<script lang="ts" setup>
import type { Node } from '~/stores';

definePageMeta({ breadcrumb: { i18n: 'common.actions.edit' } });
const store = useNodesStore();
const route = useRoute();
const router = useRouter();
const nodeId = computed(() => route.params.id as string);
const node = ref<Partial<Node>>();
const error = ref('');
let request = 0;
let loadedId: string | undefined;

watch([nodeId, () => store.isFetching], async ([id, fetching]) => {
  if (fetching || node.value && loadedId === id) return;
  const version = ++request;
  node.value = undefined;
  error.value = '';
  try {
    const cached = store.getById(id);
    const full = cached?.partial ? await store.fetch({ id }) : cached;
    if (version !== request) return;
    if (!full) throw new Error('Document not found');
    // Editing owns a clone: server acknowledgements must never replace typed text.
    loadedId = id;
    node.value = { ...full };
  } catch (cause) {
    if (version === request) error.value = cause instanceof Error ? cause.message : String(cause);
  }
}, { immediate: true });

const persist = (document: Partial<Node>) => store.update(document as Node);
const exit = (id?: string) => {
  const redirect = route.query.redirect as string | undefined;
  router.push(redirect || `/dashboard/docs/${id || nodeId.value}`);
};
</script>
