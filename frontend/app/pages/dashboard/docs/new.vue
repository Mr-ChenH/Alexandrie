<template>
  <LazyMarkdownEditor v-model="document" autofocus-title :persist="persist" :draft-key="draftKey" @exit="exit" />
</template>

<script lang="ts" setup>
import localForage from 'localforage';
import type { Node } from '~/stores';

definePageMeta({ breadcrumb: { i18n: 'common.actions.new' }, key: route => route.fullPath });
const store = useNodesStore();
const route = useRoute();
const router = useRouter();
const sidebar = useSidebar();
const defaultParent = (route.query.parent_id as string) || sidebar.workspaceId.value || undefined;
const draftKey = `new:${defaultParent || 'root'}`;
const pendingNode = await localForage.getItem<Node>('pendingNode');
const document = ref<Partial<Node>>({
  accessibility: 1,
  access: 2,
  role: 3,
  ...pendingNode,
  parent_id: ['root', 'shared'].includes(defaultParent || '') ? undefined : defaultParent,
});
let createdId: string | undefined;

async function persist(snapshot: Partial<Node>): Promise<Node> {
  const existingId = createdId || snapshot.id;
  const saved = existingId
    ? await store.update({ ...snapshot, id: existingId } as Node)
    : await store.post(snapshot);
  createdId = saved.id;
  // Keep the same editor and caret; the first autosave must not redirect the user.
  await localForage.removeItem('pendingNode');
  return saved;
}

const exit = (id?: string) => router.push(id ? `/dashboard/docs/${id}` : '/dashboard');
</script>
