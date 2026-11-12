# React testing patterns

## Test setup
```ts
// src/test/setup.ts
import '@testing-library/jest-dom/vitest';
import { server } from './server';
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// src/test/server.ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';
export const server = setupServer(...handlers);
```

## renderWithProviders
```tsx
// src/test/render.tsx
export function renderWithProviders(ui: React.ReactElement, { route = '/', queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }) } = {}) {
  window.history.pushState({}, '', route);
  const user = userEvent.setup();
  const utils = render(<QueryClientProvider client={queryClient}><ThemeProvider>{ui}</ThemeProvider></QueryClientProvider>);
  return { user, queryClient, ...utils };
}
```
Next.js App Router: mock `next/navigation` (`useRouter`, `usePathname`, `useSearchParams`) once in setup, or use `next-router-mock`.

## Component test with MSW overrides
```tsx
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { buildOrder } from '@/test/factories';

it('[T4][R3] shows a retry when the order fails to load', async () => {
  server.use(http.get('*/orders/:id', () => HttpResponse.json({ error: { code: 'boom' } }, { status: 500 })));
  const { user } = renderWithProviders(<OrderDetails id="o1" />);

  expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't load/i);

  server.use(http.get('*/orders/:id', () => HttpResponse.json(buildOrder({ id: 'o1', total: 4200 }))));
  await user.click(screen.getByRole('button', { name: /retry/i }));
  expect(await screen.findByText('$42.00')).toBeInTheDocument();
});
```

## Hooks
```ts
const { result } = renderHook(() => useCartTotals(items), { wrapper: Providers });
expect(result.current.total).toBe(30);
```
Test hooks directly only when they hold real logic. Otherwise test them through the component.

## Factories
```ts
// src/test/factories.ts
let seq = 0;
export const buildOrder = (o: Partial<Order> = {}): Order => ({ id: `o${++seq}`, total: 1000, status: 'open', ...o });
```

## Forms
```tsx
await user.type(screen.getByLabelText(/email/i), 'not-an-email');
await user.click(screen.getByRole('button', { name: /save/i }));
expect(screen.getByLabelText(/email/i)).toHaveAccessibleDescription(/valid email/i);
```
