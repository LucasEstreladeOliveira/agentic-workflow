# React: TanStack Query patterns (v5)

## Client function + key factory
```ts
// src/api/orders.ts
import { z } from 'zod';
import { http } from '@/lib/http';            // project HTTP client, throws ApiError on non-2xx

export const Order = z.object({ id: z.string(), total: z.number(), status: z.enum(['open', 'paid']) });
export type Order = z.infer<typeof Order>;

export const orderKeys = {
  all: ['orders'] as const,
  lists: () => [...orderKeys.all, 'list'] as const,
  list: (filters: { status?: string; page?: number }) => [...orderKeys.lists(), filters] as const,
  details: () => [...orderKeys.all, 'detail'] as const,
  detail: (id: string) => [...orderKeys.details(), id] as const,
};

export const getOrder = async (id: string) => Order.parse(await http.get(`/orders/${id}`));
export const listOrders = async (f: { status?: string; page?: number }) =>
  z.object({ items: z.array(Order), total: z.number() }).parse(await http.get('/orders', { params: f }));
export const payOrder = async (id: string) => Order.parse(await http.post(`/orders/${id}/pay`));
```

## Query options + hooks
```ts
// src/features/orders/api/queries.ts
import { queryOptions, useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { getOrder, listOrders, payOrder, orderKeys } from '@/api/orders';

export const orderQuery = (id: string) =>
  queryOptions({ queryKey: orderKeys.detail(id), queryFn: () => getOrder(id), staleTime: 30_000 });

export const useOrder = (id: string) => useQuery(orderQuery(id));

export const useOrders = (filters: { status?: string; page?: number }) =>
  useQuery({ queryKey: orderKeys.list(filters), queryFn: () => listOrders(filters), placeholderData: keepPreviousData });

export const usePayOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: payOrder,
    onSuccess: (order) => {
      qc.setQueryData(orderKeys.detail(order.id), order);   // update what we know
      qc.invalidateQueries({ queryKey: orderKeys.lists() }); // refetch what we don't
    },
  });
};
```
`queryOptions` lets the same definition be used in `useQuery`, `prefetchQuery` (loaders, RSC hydration) and `ensureQueryData`.

## Component states
```tsx
export function OrderDetails({ id }: { id: string }) {
  const { data, isPending, isError, refetch } = useOrder(id);
  const pay = usePayOrder();
  if (isPending) return <OrderDetailsSkeleton />;
  if (isError) return <ErrorState title="Couldn't load the order" onRetry={() => refetch()} />;
  return (
    <Card>
      <Text>{formatCurrency(data.total)}</Text>
      <Button loading={pay.isPending} disabled={data.status === 'paid'} onClick={() => pay.mutate(data.id)}>Pay</Button>
    </Card>
  );
}
```

## Optimistic update (only when the plan requires it)
```ts
useMutation({
  mutationFn: toggleFavorite,
  onMutate: async (id) => {
    await qc.cancelQueries({ queryKey: productKeys.detail(id) });
    const prev = qc.getQueryData(productKeys.detail(id));
    qc.setQueryData(productKeys.detail(id), (p) => p && { ...p, favorite: !p.favorite });
    return { prev };
  },
  onError: (_e, id, ctx) => qc.setQueryData(productKeys.detail(id), ctx?.prev),
  onSettled: (_d, _e, id) => qc.invalidateQueries({ queryKey: productKeys.detail(id) }),
});
```

## Infinite lists
`useInfiniteQuery({ queryKey, queryFn: ({ pageParam }) => list({ cursor: pageParam }), initialPageParam: undefined, getNextPageParam: (last) => last.nextCursor })`

## Next.js App Router
- Server components may fetch directly (allowed by `check-data-fetching`). Prefer calling the same `src/api` function.
- For client interactivity: prefetch in the server component with `queryClient.prefetchQuery(orderQuery(id))`, wrap in `<HydrationBoundary state={dehydrate(queryClient)}>`, and use `useOrder(id)` on the client.
- Server actions for mutations are fine. Still invalidate (`revalidatePath`/`revalidateTag`, or `invalidateQueries` on the client).

## Anti-patterns
- `useEffect(() => { fetchX().then(setX) }, [])`: use a query
- `const [order, setOrder] = useState(data)`: copies server state; derive it, or use the form's own state for edits
- `queryKey: ['order']` without the id: cache collisions
- `invalidateQueries()` with no key: refetches the whole app
