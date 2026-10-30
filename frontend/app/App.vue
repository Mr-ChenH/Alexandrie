<template>
  <div v-show="!isLoading" id="app">
    <ModalManager />
    <ContextMenuManager />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <Notification />
  </div>
  <SplashScreen v-show="isLoading" />
</template>

<script setup lang="ts">
import 'virtual:svg-icons-register';

useFavicon();
const { isLoading } = useAppState();
const router = useRouter();
const route = useRoute();
const requestUrl = useRequestURL();
const config = useRuntimeConfig();
const baseUrl = computed(() => (config.public.baseUrl || requestUrl.origin).replace(/\/+$/, ''));
const { t, locale } = useI18n();
const i18nHead = useLocaleHead();

router.beforeEach((to, from) => {
  if (to.path.startsWith('/dashboard') && (from.path === '/login' || from.path === '/')) {
    isLoading.value = true;
  }
  return;
});

const canonicalUrl = computed(() => new URL(route.path, baseUrl.value).toString());

useHead({
  link: [
    {
      rel: 'canonical',
      href: canonicalUrl,
    },
    {
      rel: 'preconnect',
      href: config.public.baseApi || undefined,
    },
    {
      rel: 'preconnect',
      href: config.public.baseCdn || undefined,
    },
    ...(i18nHead.value.link || []),
  ],
  meta: [
    {
      property: 'og:url',
      content: canonicalUrl,
    },
  ],
  htmlAttrs: {
    lang: i18nHead.value.htmlAttrs?.lang,
  },
  script: [
    {
      type: 'application/ld+json',
      innerHTML: computed(() => {
        void locale.value;
        return JSON.stringify({
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'WebSite',
              name: 'Alexandrie',
              url: canonicalUrl.value,
              inLanguage: i18nHead.value.htmlAttrs?.lang || 'en',
              description: t('landing.seo.description'),
            },
            {
              '@type': 'SoftwareApplication',
              applicationCategory: 'ProductivityApplication',
              name: 'Alexandrie',
              operatingSystem: 'Web',
              url: canonicalUrl.value,
              description: t('landing.seo.description'),
            },
          ],
        });
      }),
    },
  ],
});

useSeoMeta({
  title: () => t('landing.seo.title'),
  description: () => t('landing.seo.description'),
  ogTitle: () => t('landing.seo.title'),
  ogDescription: () => t('landing.seo.description'),
  ogType: 'website',
  ogUrl: () => canonicalUrl.value,
  ogImage: () => `${baseUrl.value}/icons/icon-192.png`,
  twitterCard: 'summary_large_image',
  twitterTitle: () => t('landing.seo.title'),
  twitterDescription: () => t('landing.seo.description'),
  twitterImage: () => `${baseUrl.value}/screenshots/mock/0.png`,
});
</script>

<style lang="scss">
#app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: auto scroll;
}

@media print {
  #app {
    height: auto;
    overflow: visible;
  }
}
</style>
