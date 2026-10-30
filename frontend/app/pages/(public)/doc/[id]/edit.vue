<template>
  <ClientOnly>
    <LazyMarkdownEditor v-if="document && !error" :key="nodeId" v-model="document" public :persist="persist" :draft-key="`note:${nodeId}`" @exit="exit" />
    <Error v-else-if="error" :error="String(error)" />
  </ClientOnly>
</template>

<script lang="ts" setup>
import type { Node, PublicNodeResponse } from '~/stores';

definePageMeta({ breadcrumb: { i18n: 'common.actions.edit' } });
const store = useNodesStore();
const route = useRoute();
const router = useRouter();
const nodeId = computed(() => route.params.id as string);
const { data: document, error } = await useAsyncData(() => `public-doc-e-${nodeId.value}`, async (): Promise<Node> => {
  const request = await makeRequest<PublicNodeResponse>(`nodes/public/${nodeId.value}`, 'GET');
  if (request.status !== 'success' || !request.result?.node) throw new Error(request.message || 'Document not found');
  return { ...request.result.node, partial: false, shared: false, permissions: [] };
});
const persist = (snapshot: Partial<Node>) => store.update(snapshot as Node);
const exit = (id?: string) => router.push(`/doc/${id || nodeId.value}`);
</script>
