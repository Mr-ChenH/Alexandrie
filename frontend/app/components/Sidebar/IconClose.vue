<template>
  <AppBtnIcon icon="arrow_close" display="sm" :aria-label="t('common.actions.close')" @click="toggleSidebar" />
</template>

<script setup lang="ts">
const { toggleSidebar } = useSidebar();
const { t } = useI18nT();
</script>
