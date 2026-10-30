<template>
  <button :class="[type, { large, small }]" @click="onClick">
    <slot />
  </button>
</template>

<script setup lang="ts">
defineProps<{ type: 'primary' | 'secondary' | 'success' | 'link' | 'danger'; large?: boolean; small?: boolean }>();
const emit = defineEmits(['click']);
const onClick = () => emit('click');
</script>

<style scoped lang="scss">
button {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 0.5rem;
  width: fit-content;
  min-height: 36px;
  padding: 8px 14px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  font-weight: 550;
  line-height: 1.4;
  white-space: nowrap;
  transition:
    background-color $transition-fast,
    border-color $transition-fast,
    box-shadow $transition-fast;

  &:disabled {
    opacity: 0.8;
    cursor: not-allowed;
  }
}

.large {
  padding: 10px 14px;
  font-size: 1rem;
}

.small {
  padding: 6px 10px;
  font-size: 0.8rem;
}

.primary {
  color: var(--on-primary);
  background: var(--primary);

  &:hover {
    background: var(--primary-dark);
  }

  :deep(.icon) {
    color: var(--on-primary) !important;
  }
}

.secondary {
  border-color: var(--border-strong);
  color: var(--text-primary);
  background: var(--surface-card);

  &:hover {
    border-color: var(--primary);
    background: var(--surface-raised);
  }
}

.success {
  color: white;
  background: var(--green);

  &:hover {
    background: var(--green-dark);
  }
}

.link {
  font-weight: bold;
  color: var(--primary);
  background: none;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
}

.danger {
  color: white;
  background: var(--red);

  &:hover {
    background: var(--red-dark);
  }
}

@media screen and (width <= 768px) {
  button {
    padding: 8px;
    font-size: 0.8rem;
  }
}
</style>
