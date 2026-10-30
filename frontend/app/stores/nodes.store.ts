import { IndexedCollection } from '~/helpers/IndexedCollection';
import { parseTags, mergeNode } from '~/helpers/node';
import { LocalDbService } from '~/services/localDB';
import { skipHydrate } from 'pinia';
import type { DB_Node, Node, NodeSearchResult, Permission } from './db_structures';
import type { KanbanMetadata } from '~/components/Kanban/Board.vue';

export type TeamRole = 0;
export type CategoryRole = 1 | 2;
export type DocumentRole = 3;
export type ResourceRole = 4;
export type NodeRole = TeamRole | CategoryRole | DocumentRole | ResourceRole;

export interface SearchOptions {
  query?: string;
  fromDate?: Date;
  toDate?: Date;
  dateType?: 'created' | 'modified';
  tags?: string[];
  category?: string;
  matchMode?: 'includes' | 'starts' | 'exact';
  role?: NodeRole;
  kanbanAssignStatus?: 'assigned' | 'unassigned' | 'all';
  boardId?: string;
  assignedUserId?: string;
}

export const useNodesStore = defineStore('nodes', () => {
  const userStore = useUserStore();
  const { sortNodes } = useNodesSort();

  // Nuxt serializes the unwrapped value, so mark the collection as well as its ref.
  const nodes = shallowRef(skipHydrate(new IndexedCollection()));
  const allTags = ref<string[]>([]);
  const isFetching = ref(false);
  const writes = new Map<string, Promise<Node>>();
  const localIds = new Map<string, string>();
  let syncPromise: Promise<void> | undefined;

  const getAll = computed(() => nodes.value);
  const getAllTags = computed(() => allTags.value);
  const getById = computed(() => (id: string) => nodes.value.get(id));
  const getTotalUsedStorage = computed(() => nodes.value.toSortedArray().reduce((total, node) => total + (node.size || 0), 0));

  /* Getters for nodes by role */
  const teams = computed(() => nodes.value.getIdsByRole(0).map(id => nodes.value.get(id)!));
  const categories = computed(() => [...nodes.value.getIdsByRole(1), ...nodes.value.getIdsByRole(2)].map(id => nodes.value.get(id)!));
  const workspaces = computed(() => nodes.value.getIdsByRole(1).map(id => nodes.value.get(id)!));
  const documents = computed(() => nodes.value.getIdsByRole(3).map(id => nodes.value.get(id)!));
  const resources = computed(() => nodes.value.getIdsByRole(4).map(id => nodes.value.get(id)!));

  async function init() {
    console.debug('[store/nodes] Initializing store');
    clear();

    isFetching.value = true;
    nodes.value.startBulk();
    const results = await Promise.allSettled([syncLocalDeltas(), fetch(), fetchShared()]);
    for (const result of results) {
      if (result.status === 'rejected') console.warn('[store/nodes] Loading from local changes while the server is unavailable', result.reason);
    }
    nodes.value.endBulk();
    isFetching.value = false;
    if (import.meta.client) {
      window.addEventListener('online', () => {
        console.debug('[store/nodes] Online, syncing local deltas');
        syncLocalDeltas();
      });
    }
  }

  function syncLocalDeltas(): Promise<void> {
    if (syncPromise) return syncPromise;
    syncPromise = (async () => {
      const deltas = await LocalDbService.getDeltas();
      for (const pending of deltas) {
        try {
          await writes.get(pending.id)?.catch(() => undefined);
          const delta = await LocalDbService.getDelta(pending.id);
          if (!delta) continue;
          if ((delta.action === 'POST' || delta.action === 'PUT') && delta.node) {
            const node = { ...delta.node, id: delta.id } as Node;
            if (node.parent_id && localIds.has(node.parent_id)) node.parent_id = localIds.get(node.parent_id);
            await update(node);
          } else if (delta.action === 'DELETE') {
            await remove(delta.id);
          }
        } catch (error) {
          // Retain failed deltas for a later reconnect instead of clearing the queue.
          console.error(`[store/nodes] Failed to sync delta ${pending.action} for node ${pending.id}:`, error);
        }
      }
    })().finally(() => { syncPromise = undefined; });
    return syncPromise;
  }

  function recomputeTags() {
    const tags = new Set<string>();

    nodes.value.startBulk();

    nodes.value.forEach(node => {
      if (node.tags) {
        parseTags(node.tags).forEach(tag => tags.add(tag));
      }
      if (node.parent_id && !nodes.value.get(node.parent_id)) {
        nodes.value.set(node.id, { ...node, parent_id: '' });
      }
    });

    nodes.value.endBulk();
    allTags.value = Array.from(tags).sort();
  }

  // Check if a node (descendantId) is a descendant of another node
  const isDescendant = (parent: Node, descendantId: string): boolean => {
    let current = nodes.value.get(descendantId);
    while (current?.parent_id) {
      if (current.parent_id === parent.id) return true;
      current = nodes.value.get(current.parent_id);
    }
    return false;
  };
  // Get all descendant IDs of a node
  const getDescendantIds = (id: string): string[] => {
    const result: string[] = [];
    const queue: string[] = [id];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const childrenIds = nodes.value.getChildrenIds(currentId);
      for (const childId of childrenIds) {
        result.push(childId);
        queue.push(childId);
      }
    }
    return result;
  };

  const search = (options: SearchOptions, nodesToSearch: Node[] | readonly Node[] = nodes.value.toSortedArray()) => {
    const { query, fromDate, toDate, dateType = 'modified', tags, category, matchMode = 'includes' } = options;

    const queryLower = query?.toLowerCase().trim();
    const hasQuery = Boolean(queryLower);
    const hasTags = tags && tags.length > 0;

    const kanbanBoard: KanbanMetadata | undefined = (nodes.value.get(options.boardId || '')?.metadata as KanbanMetadata) ?? undefined;

    const filtered = nodesToSearch.filter(node => {
      // --- Filter by role ---
      if (options.role && node.role !== options.role) return false;
      // --- Filter by text search ---
      if (hasQuery) {
        const content = `${node.name ?? ''} ${node.description ?? ''} ${node.tags ?? ''}`.toLowerCase();
        switch (matchMode) {
          case 'starts':
            if (!content.startsWith(queryLower!)) return false;
            break;
          case 'exact':
            if (node.name.toLowerCase() !== queryLower) return false;
            break;
          default: // includes
            if (!content.includes(queryLower!)) return false;
        }
      }

      // --- Filter by kanban assignment status ---
      if (options.boardId) {
        if (options.kanbanAssignStatus && kanbanBoard) {
          const users = kanbanBoard?.kanban?.users ?? {};
          if (options.kanbanAssignStatus === 'assigned' && !users[node.id]) return false;
          if (options.kanbanAssignStatus === 'unassigned' && users[node.id]) return false;
        }
        if (options.assignedUserId && kanbanBoard) {
          const users = kanbanBoard?.kanban?.users ?? {};
          if (options.assignedUserId && (!users[node.id] || !users[node.id]!.includes(options.assignedUserId))) return false;
        }
      }

      // --- Filter by dates ---
      if (fromDate || toDate) {
        const timestamp = dateType === 'created' ? node.created_timestamp : node.updated_timestamp;
        const nodeDate = new Date(timestamp);
        if (fromDate && nodeDate < fromDate) return false;
        if (toDate && nodeDate > toDate) return false;
      }

      // --- Filter by tags ---
      if (hasTags) {
        if (!node.tags) return false;
        const nodeTags = parseTags(node.tags);
        // All tags must match
        if (!tags!.some(tag => nodeTags.includes(tag))) return false;
      }

      // --- Filter by category ---
      if (category && node.parent_id !== category) return false;

      return true;
    });

    // --- Sort results ---
    return filtered.sort(sortNodes);
  };

  async function fetch<T extends FetchOptions>(opts?: T): Promise<'id' extends keyof T ? Node : IndexedCollection> {
    if (opts?.id && !nodes.value.get(opts.id)?.partial) return nodes.value.get(opts.id) as 'id' extends keyof T ? Node : IndexedCollection;
    console.debug(`[store/nodes] Fetching nodes with options: ${JSON.stringify(opts)}`);
    const request = await makeRequest(`nodes/${opts?.id ? opts.id : 'user/@me'}`, 'GET', {});
    if (request.status == 'success') {
      if (opts?.id) {
        const result = request.result as { node: DB_Node; permissions: Permission[] };
        const shared = nodes.value.get(opts.id)?.shared ?? false;
        // Check for orphaned parent_id and detach if necessary
        let finalParentId = result.node.parent_id;
        if (finalParentId && !nodes.value.has(finalParentId)) {
          finalParentId = '';
        }

        const updatedNode: Node = {
          ...(result.node as DB_Node),
          parent_id: finalParentId,
          partial: false,
          synced: true,
          shared: shared,
          permissions: result.permissions,
        };
        nodes.value.set(opts.id, updatedNode, true);
        return updatedNode as 'id' extends keyof T ? Node : IndexedCollection;
      } else {
        if (!request.result) return nodes.value as 'id' extends keyof T ? Node : IndexedCollection;
        nodes.value.startBulk();
        for (const node of request.result as DB_Node[]) {
          nodes.value.set(node.id, { ...node, partial: true, synced: true, shared: false, permissions: [] });
        }
        nodes.value.endBulk();
        recomputeTags();
        return nodes.value as 'id' extends keyof T ? Node : IndexedCollection;
      }
    } else throw request.message;
  }

  async function fetchShared(): Promise<IndexedCollection> {
    console.debug(`[store/nodes] Fetching shared nodes`);
    const request = await makeRequest(`nodes/shared/@me`, 'GET', {});
    if (request.status === 'success') {
      if (!request.result) return nodes.value as IndexedCollection;
      nodes.value.startBulk();
      for (const node of request.result as DB_Node[]) {
        let finalParentId = node.parent_id;
        if (finalParentId && !nodes.value.has(finalParentId)) {
          finalParentId = '';
        }
        if (!nodes.value.has(node.id))
          nodes.value.set(node.id, { ...node, parent_id: finalParentId, partial: true, synced: true, shared: true, permissions: node.permissions || [] });
        else {
          const state = nodes.value.get(node.id);
          nodes.value.set(node.id, {
            ...node,
            parent_id: finalParentId,
            partial: true,
            synced: true,
            shared: state?.shared ?? true,
            permissions: node.permissions || [],
          });
        }
      }
      nodes.value.endBulk();
      return nodes.value as IndexedCollection;
    } else throw request;
  }
  /**
   * Performs a fulltext search on the server using MySQL FULLTEXT index
   * This is optimized for searching in document content (body)
   * @param query - Search query (min 2 characters)
   * @param includeContent - Whether to search in document body content
   * @param limit - Max results to return
   */
  async function searchFulltext(query: string, includeContent = true, limit = 20): Promise<NodeSearchResult[]> {
    if (query.length < 2) return [];
    const params = new URLSearchParams({
      q: query,
      content: includeContent.toString(),
      limit: limit.toString(),
    });
    const request = await makeRequest(`nodes/search?${params.toString()}`, 'GET', {});
    if (request.status === 'success') {
      return request.result as NodeSearchResult[];
    }
    console.error('[store/nodes] Fulltext search failed:', request.message);
    return [];
  }

  async function post(node: Partial<Node>): Promise<Node> {
    node = { ...node };
    const oldId = node.id;
    delete node.id;
    if (!node.parent_id) delete node.parent_id; // Ensure parent_id is not sent as empty string
    const response = await makeRequest<DB_Node>('nodes', 'POST', { ...node, id: undefined }, { timeout: 15000 });
    if (response.status == 'success') {
      const saved = { ...(response.result as DB_Node), partial: false, synced: true, shared: false, permissions: [] };
      nodes.value.set(saved.id, saved, true);
      return saved;
    } else if (isNetworkError(response)) {
      node.user_id = userStore.user?.id;
      const localNode = await LocalDbService.saveCreateDelta({ ...node, id: oldId });
      nodes.value.set(localNode.id, localNode, true);
      return localNode;
    }
    throw response.message || 'Failed to create node';
  }

  function update(input: Node): Promise<Node> {
    const snapshot = { ...input };
    const previous = writes.get(snapshot.id);
    const next = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(() => persistUpdate(snapshot));
    writes.set(snapshot.id, next);
    void next.finally(() => {
      if (writes.get(snapshot.id) === next) writes.delete(snapshot.id);
    }).catch(() => undefined);
    return next;
  }

  async function persistUpdate(node: Node): Promise<Node> {
    if (localIds.has(node.id)) node.id = localIds.get(node.id)!;
    const pending = await LocalDbService.getDelta(node.id);
    if (pending?.action === 'POST') {
      const saved = await post(node);
      if (saved.synced) {
        localIds.set(node.id, saved.id);
        nodes.value.delete(node.id);
        await LocalDbService.removeDelta(node.id);
      }
      return saved;
    }
    if (node.partial) {
      console.debug('[store/nodes] Node looks partial, cannot update it directly.');
      const full_node = await fetch({ id: node.id });
      if (!full_node) throw 'Node not found';
      node = mergeNode(node, full_node);
    }
    if (!node.parent_id) delete node.parent_id; // Ensure parent_id is not sent as empty string
    const response = await makeRequest(`nodes/${node.id}`, 'PUT', node, { timeout: 15000 });
    if (response.status == 'success') {
      node.updated_timestamp = Date.now(); // approximate update time for better UX & backups import
      node.synced = true;
      if (node.parent_id && !nodes.value.has(node.parent_id)) node.parent_id = ''; // Check for orphaned parent_id and detach if necessary
      nodes.value.set(node.id, node, true);
      await LocalDbService.removeDelta(node.id);
    } else if (isNetworkError(response)) {
      node.synced = false;
      node.updated_timestamp = Date.now();
      await LocalDbService.saveUpdateDelta(node);
      nodes.value.set(node.id, node, true);
    } else {
      throw new Error(response.message || 'Could not save document');
    }
    nodes.value.rebuildIndexes();
    return node;
  }

  async function duplicate(node: Node): Promise<DB_Node> {
    if (!node) throw 'Node not found in store, cannot duplicate';
    if (node.partial) {
      console.debug('[store/nodes] Node looks partial, cannot duplcate it directly.');
      const full_node = await fetch({ id: node.id });
      if (!full_node) throw 'Node not found';
      node = mergeNode(node, full_node);
    }
    const newNodeData: Partial<Node> = {
      name: node.name,
      description: node.description,
      role: node.role,
      parent_id: node.parent_id,
      tags: node.tags,
      accessibility: node.accessibility,
      access: node.access,
      content: node.content,
      content_compiled: node.content_compiled,
    };
    const newNode = await post(newNodeData);
    return newNode;
  }

  async function remove(id: string) {
    const response = await makeRequest(`nodes/${id}`, 'DELETE', {});
    if (response.status == 'success') {
      await LocalDbService.removeDelta(id);
    } else if (isNetworkError(response)) {
      await LocalDbService.saveDeleteDelta(id);
    } else {
      throw new Error(response.message || 'Could not delete document');
    }
    const allChildrens = getDescendantIds(id);
    nodes.value.delete(id);
    allChildrens.forEach(childId => nodes.value.delete(childId));
  }

  async function bulkDelete(toDelete: Node[]) {
    const deletedIds: string[] = [];
    const failedIds: { id: string; message: string }[] = [];
    for (const node of toDelete) {
      const response = await makeRequest(`nodes/${node.id}`, 'DELETE', {});
      if (response.status === 'success') {
        deletedIds.push(node.id);
      } else if (isNetworkError(response)) {
        await LocalDbService.saveDeleteDelta(node.id);
        deletedIds.push(node.id);
      } else {
        failedIds.push({ id: node.id, message: response.message || 'Unknown error' });
      }
    }
    // Update store
    nodes.value.startBulk();
    deletedIds.forEach(id => {
      const allChildrens = getDescendantIds(id);
      nodes.value.delete(id);
      allChildrens.forEach(childId => nodes.value.delete(childId));
    });
    nodes.value.endBulk();
    return { deletedIds, failedIds };
  }

  function clear() {
    nodes.value.clear();
    allTags.value = [];
    isFetching.value = false;
  }

  return {
    nodes: skipHydrate(nodes),
    allTags,
    isFetching,
    getAll,
    getAllTags,
    getById,
    getTotalUsedStorage,
    teams,
    categories,
    workspaces,
    documents,
    resources,
    isDescendant,
    getDescendantIds,
    search,
    init,
    recomputeTags,
    syncLocalDeltas,
    fetch,
    fetchShared,
    searchFulltext,
    post,
    update,
    duplicate,
    remove,
    bulkDelete,
    clear,
  };
});
