<template>
  <svg v-if="isSpriteIcon" class="icon" :class="display" :style="{ color: fill, width: iconSize, height: iconSize }" aria-hidden="true">
    <use :href="`#icon-${name}`" />
  </svg>

  <!-- eslint-disable-next-line vue/no-v-html | OK Because not a user entry-->
  <i v-else class="icon c-icon" :style="{ fill: fill || 'currentColor' }" :class="display" v-html="name" />
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{ name: string; fill?: string; display?: 'xsm' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl'; size?: number | string }>(), {
  display: 'md',
  fill: 'currentColor',
  size: undefined,
});

const iconSize = computed(() => (typeof props.size === 'number' ? `${props.size}px` : props.size));

const isUnicode = (str: string) => Array.from(str).some(char => char.charCodeAt(0) > 255);

const isSpriteIcon = computed(() => {
  return typeof props.name === 'string' && props.name.length < 50 && !isUnicode(props.name);
});
</script>

<style scoped lang="scss">
.icon {
  display: inline-flex;
  flex-shrink: 0;
  justify-content: center;
  align-items: center;
  pointer-events: none;
  user-select: none;

  // The symbol owns its fill and stroke. Do not fill outline icons here.
  use {
    fill: none;
  }

  /* Custom sizes */
  &.xsm {
    width: 15px;
    height: 15px;
  }

  &.sm {
    width: 18px;
    height: 18px;
  }

  &.md {
    width: 22px;
    height: 22px;
  }

  &.lg {
    width: 25px;
    height: 25px;
  }

  &.xl {
    width: 28px;
    height: 28px;
  }

  &.xxl {
    width: 32px;
    height: 32px;
  }
}

.c-icon:deep(svg),
.c-icon:deep(svg > * > path) {
  height: min-content;
  fill: inherit !important;
}
</style>
