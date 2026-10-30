<template>
  <div :class="{ 'sidebar-mask': isMobile && isOpened }" />
  <Resizable>
    <Dock v-if="!isMobile && viewDock" />
    <div class="sidebar" :class="{ compact: compactMode }">
      <section class="header">
        <span class="name">
          <IconApp fill="var(--primary)" />
          <NuxtLink class="home-link" to="/dashboard">Alexandrie</NuxtLink>
        </span>
        <IconClose class="btn" />
      </section>
      <div class="sidebar-search">
        <Icon name="search" display="sm" />
        <input v-model="filter" type="search" :aria-label="t('components.sidebar.searchPlaceholder')" :placeholder="t('components.sidebar.searchPlaceholder')" />
      </div>

      <div v-if="userStore.user" class="user">
        <UserAvatar :user="userStore.user" />
        <div class="details">
          <NuxtLink to="/dashboard/settings?p=profile">
            <div>{{ userStore.user.username }}</div>
            <div class="email">{{ userStore.user.email }}</div>
          </NuxtLink>
          <div class="icons">
            <NuxtLink to="/dashboard/docs/new" class="nav-item" @click="onClick">
              <Icon name="add_file" />
              <p class="hint-tooltip">{{ t('components.sidebar.newDoc') }}</p>
            </NuxtLink>
            <NuxtLink class="nav-item" @click="newCategory">
              <Icon name="add_folder" />
              <p class="hint-tooltip">{{ t('components.sidebar.newCategory') }}</p>
            </NuxtLink>
            <NuxtLink v-if="!nodesTree.isAllCollapsed()" class="nav-item" @click.stop="nodesTree.collapseAll">
              <Icon name="collapse" />
              <p class="hint-tooltip">{{ t('components.sidebar.closeAll') }}</p>
            </NuxtLink>
            <NuxtLink v-else class="nav-item" @click.stop="nodesTree.expandAll">
              <Icon name="arrow-expand" />
              <p class="hint-tooltip">{{ t('components.sidebar.openAll') }}</p>
            </NuxtLink>
            <NuxtLink class="nav-item" @click="toggleDock">
              <Icon name="dock" />
              <p class="hint-tooltip">{{ t('components.sidebar.toggleDock') }}</p>
            </NuxtLink>
          </div>
        </div>
      </div>
      <SidebarWorkspaces :workspaces="workspaces" :teams="teams" />
      <CollapseItem v-for="item in navigationItems(sidebarItemsPrefs)" :key="item.id" :item="item" :root="true" />
      <hr style="width: 100%; margin: 5px 0" />

      <template v-if="tree.length">
        <CollapseItem v-for="item in tree" :key="item.id" :item="item" :root="true" />
      </template>
      <template v-else>
        <SidebarSkeleton :is-loading="isLoading" />
      </template>
    </div>
  </Resizable>
</template>

<script setup lang="ts">
import { navigationItems, type Workspace } from './helpers';
import { filterTreeByLabel } from '~/helpers/TreeBuilder';
import NewCategoryModal from '~/components/Node/Modals/CreateCategory.vue';
import SidebarSkeleton from './SidebarSkeleton.vue';
import Dock from './Dock.vue';
import CollapseItem from './CollapseItem.vue';
import SidebarWorkspaces from './SidebarWorkspaces.vue';
import Resizable from './Resizable.vue';
import IconClose from './IconClose.vue';

const nodesStore = useNodesStore();
const preferences = usePreferencesStore();
const userStore = useUserStore();
const { t } = useI18nT();

const nodesTree = useNodesTree();
const { isOpened, hasSidebar, filtered } = useSidebar();
const { isMobile } = useDevice();
const modals = useModal();

const viewDock = preferences.get('view_dock');
const compactMode = preferences.get('compactMode');
const sidebarItemsPrefs = preferences.get('sidebarItems');

const filter = ref<string>('');

const teams: ComputedRef<Workspace[]> = computed(() => [...nodesStore.teams.map(c => ({ text: c.name, value: c.id, meta: c, children: [] }))]);
const workspaces = computed(() => {
  const items = [];
  for (const workspace of nodesStore.workspaces) {
    const parentTeam = teams.value.find(t => t.value === workspace.parent_id);
    if (parentTeam) {
      parentTeam.children!.push({ text: workspace.name, value: workspace.id, meta: workspace });
      continue;
    }
    items.push({ text: workspace.name, value: workspace.id, meta: workspace });
  }
  return items;
});
const isLoading = computed(() => nodesStore.isFetching);
const tree = computed(() => {
  if (!filter.value.trim()) return filtered.value;
  return filterTreeByLabel(filtered.value, filter.value);
});

// Actions
const toggleDock = () => preferences.set('view_dock', !preferences.get('view_dock').value);

const handleClickOutside = (e: MouseEvent) => {
  if (isOpened.value && e.target && !(e.target as Element).closest('.sidebar') && !(e.target as Element).closest('.open-sidebar')) isOpened.value = false;
};
const newCategory = () => modals.add(new Modal(shallowRef(NewCategoryModal), { props: { role: 2 } }));

const onClick = () => {
  if (isMobile.value) isOpened.value = false;
};

onMounted(() => {
  hasSidebar.value = true;
  if (isMobile.value) return document.addEventListener('click', handleClickOutside);
  // ELSE: Desktop
  isOpened.value = true;
});
onBeforeUnmount(() => {
  hasSidebar.value = false;
  document.removeEventListener('click', handleClickOutside);
});
</script>

<style scoped lang="scss">
.sidebar {
  width: 100%;
  min-width: 0;
  max-height: 100%;
  padding: 0.75rem 0.5rem 1rem 0.75rem;
  font-family: $font-ui;
  background: var(--surface-sidebar);
  backdrop-filter: var(--backdrop-blur) var(--backdrop-saturate);
  overflow-y: auto;
  scrollbar-gutter: stable;

  &::-webkit-scrollbar-thumb {
    background: transparent;
  }
}

.home-link {
  font-family: $font-ui;
  font-size: 17px;
  font-weight: 650;
  color: var(--text-primary);
  letter-spacing: -0.6px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 44px;
  margin-bottom: 12px;

  .name > svg {
    width: 34px;
    height: 34px;
    margin-right: 5px;
    color: var(--primary);
  }

  .btn {
    width: 30px;
    cursor: pointer;
    fill: var(--text-body);
  }

  .name {
    display: flex;
    align-items: center;
    font-size: 1rem;
    font-weight: 400;
  }
}

.nav-item:hover .hint-tooltip {
  opacity: 1;
  visibility: visible;
}

.icons {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  height: fit-content;

  a {
    padding: 4px;
    border-radius: var(--radius-sm);

    &:hover {
      background: var(--selection-color);
    }
  }
}

.sidebar-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  background: var(--surface-base);
  transition: border-color $transition-fast, box-shadow $transition-fast;

  &:focus-within {
    border-color: var(--primary);
    box-shadow: 0 0 0 3px var(--primary-bg);
  }
}

input {
  min-width: 0;
  height: 36px;
  padding: 6px 8px 6px 0;
  border: none;
  font-family: inherit;
  font-size: 13px;
  background-color: transparent;
  outline: none;
  transition: background-color $transition-base;
}

.user {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 14px 0 10px;
  padding: 10px 2px;
  border-bottom: 1px solid var(--border);

  .details {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    min-width: 0;
    font-size: 0.8rem;

    a {
      overflow: hidden;
    }

    a > div {
      text-overflow: ellipsis;
      white-space: nowrap;
      overflow: hidden;
    }
  }

  .email {
    font-size: 0.7rem;
    color: var(--text-secondary);
  }
}

.compact:deep(.item) {
  margin: 0;
  padding: 0.5px 8px;
  font-size: 14px;
}

.sidebar-mask {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 50;
  display: flex;
  width: 100vw;
  height: 100vh;
  background-color: var(--overlay-backdrop);
}
</style>
