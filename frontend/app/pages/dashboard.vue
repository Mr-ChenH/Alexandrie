<template>
  <div class="dashboard-root">
    <ClientOnly>
      <BackToTop />
    </ClientOnly>
    <Sidebar />
    <MediumView>
      <Navbar />
      <section v-if="userLoadError" class="connection-notice" role="status" aria-live="polite">
        <div><strong>{{ t('application.connection.unavailable') }}</strong><p>{{ t('application.connection.localDataKept') }}</p></div>
        <AppButton type="secondary" small :disabled="checkingUser" @click="retryConnection">{{ t('application.connection.retry') }}</AppButton>
      </section>
      <NuxtPage />
    </MediumView>
  </div>
</template>
<script setup lang="ts">
const nodesStore = useNodesStore();
const userStore = useUserStore();
const preferences = usePreferencesStore();

const { setAppColor, themeColor } = useAppColors();
const { locale: i18nLocale, loadLocaleMessages, t } = useI18n();
const { isLoading } = useAppState();
useStyleInjection(); // Custom styles for the app and documents
const { initGlobalListeners, destroyGlobalListeners } = useCommandCenter();

const primaryColor = preferences.get('primaryColor');
const colorMode = useColorMode();
const interfaceStyle = preferences.get('style');
const locale = preferences.get('locale');

/* Watchers to make sure app state reflects preferences */
watch(
  [primaryColor, () => colorMode.value],
  ([color]) => {
    setAppColor(Number(color));
  },
  { immediate: true },
);

useHead({
  meta: [
    {
      name: 'theme-color',
      content: themeColor,
    },
  ],
});

watch(
  interfaceStyle,
  style => {
    if (import.meta.client) document.documentElement.classList.toggle('glassmorphism', style === 'glassmorphism');
  },
  { immediate: true },
);

watch(
  locale,
  async newLocale => {
    await loadLocaleMessages(newLocale);
    if (newLocale) i18nLocale.value = newLocale;
  },
  { immediate: true },
);

const userLoadError = ref(false);
const checkingUser = ref(false);

async function loadCurrentUser(): Promise<boolean> {
  if (checkingUser.value) return false;
  checkingUser.value = true;
  try {
    await userStore.fetch();
    userLoadError.value = false;
    return true;
  } catch (error) {
    // A missing server must not turn the workspace into a Nuxt error page.
    userLoadError.value = true;
    console.warn('[dashboard] Could not load the current user; local data is retained', error);
    return false;
  } finally {
    checkingUser.value = false;
  }
}

async function retryConnection() {
  if (await loadCurrentUser()) await Promise.allSettled([nodesStore.init(), preferences.fetchFromBackend()]);
}

nodesStore.init();
void loadCurrentUser();
preferences.fetchFromBackend();

onMounted(() => {
  initGlobalListeners();
  isLoading.value = false;
});
onBeforeUnmount(() => {
  destroyGlobalListeners();
});
</script>

<style lang="scss">
.connection-notice {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin: 12px 16px;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-raised-light);

  p { margin: 4px 0 0; }
}

.dashboard-root {
  display: flex;
  flex-direction: column;
  height: 100%;
}
</style>
