# Vue: TanStack Vue Query / composables

Same layers and rules as React: the `src/api` client functions and key factories are identical (framework-free).

## Hooks (composables)
```ts
// src/features/orders/api/queries.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import { computed, type MaybeRefOrGetter, toValue } from 'vue';
import { getOrder, payOrder, orderKeys } from '@/api/orders';

export const useOrder = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => orderKeys.detail(toValue(id))), // reactive key → refetches when id changes
    queryFn: () => getOrder(toValue(id)),
    staleTime: 30_000,
  });

export const usePayOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: payOrder,
    onSuccess: (order) => {
      qc.setQueryData(orderKeys.detail(order.id), order);
      qc.invalidateQueries({ queryKey: orderKeys.lists() });
    },
  });
};
```

## Component states
```vue
<script setup lang="ts">
const props = defineProps<{ id: string }>();
const { data, isPending, isError, refetch } = useOrder(() => props.id);
const pay = usePayOrder();
</script>

<template>
  <OrderDetailsSkeleton v-if="isPending" />
  <ErrorState v-else-if="isError" title="Couldn't load the order" @retry="refetch()" />
  <Card v-else>
    <Text>{{ formatCurrency(data!.total) }}</Text>
    <Button :loading="pay.isPending.value" :disabled="data!.status === 'paid'" @click="pay.mutate(data!.id)">Pay</Button>
  </Card>
</template>
```

## Nuxt
- `useFetch`/`useAsyncData` are fine **inside** a composable in the API layer (`src/api` or `composables/api/`), with a stable `key`. Components call the composable, never `$fetch` directly.
- Mutations: `$fetch` in the client function, then `refreshNuxtData(key)` or `clearNuxtData`.

## Pinia
Pinia is for **client** state (UI preferences, multi-step wizard drafts). Never mirror server responses into a store. Keep them in the query cache (see `state-decision`).

## Anti-patterns
- `onMounted(async () => { order.value = await getOrder(id) })`: use a query composable
- Non-reactive keys (`queryKey: orderKeys.detail(props.id)` evaluated once): use `computed`/getter
- Destructuring props in `<script setup>` and losing reactivity in the key
