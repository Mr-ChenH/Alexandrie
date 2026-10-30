<template>
  <div v-if="hasChildren">
    <SidebarItem :level="level" :item="item" class="collapse-header doc">
      <button class="collapse-toggle" :class="{ rotated: !isExpanded }" :aria-label="item.label" :aria-expanded="isExpanded" @click.stop="toggleShow">
        <Icon name="nav_arrow" display="sm" />
      </button>
    </SidebarItem>
    <template v-if="isExpanded">
      <div v-for="child in children" :key="child.id" class="collapse-body" style="margin-left: 15px">
        <CollapseItem v-if="getItemChildren(child)?.length" :item="child" :level="level + 1" />
        <SidebarItem v-else :level="level + 1" :item="child" />
      </div>
    </template>
  </div>
  <!-- Filter hidden "navigation items" -->
  <SidebarItem v-else-if="item.data?.role !== -1 || isVisible" :item="item" :level="level" />
</template>
<script setup lang="ts">
import { type SidebarItem, getItemChildren, isItemVisible } from './helpers';

const props = withDefaults(defineProps<{ item: SidebarItem; level?: number }>(), { level: 0 });

const nodesTree = useNodesTree();

const children = computed(() => getItemChildren(props.item));
const hasChildren = computed(() => (children.value?.length ?? 0) > 0);
const isExpanded = computed(() => nodesTree.isExpanded(props.item.id));
const isVisible = computed(() => isItemVisible(props.item));

const toggleShow = () => nodesTree.toggleExpand(props.item.id);
</script>

<style lang="scss" scoped>
.collapse-toggle {
  display: flex;
  flex-shrink: 0;
  justify-content: center;
  align-items: center;
  width: 24px;
  height: 24px;
  padding: 3px;
  color: var(--text-secondary);
  transition: transform $transition-fast;

  &.rotated {
    transform: rotate(-90deg);
  }

  &:hover {
    color: var(--text-primary);
    background: var(--surface-transparent);
  }
}
</style>
