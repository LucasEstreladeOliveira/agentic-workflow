# Vue testing patterns

Same principles as React: Testing Library + MSW + factories. Only the render and providers differ.

## renderWithProviders
```ts
// src/test/render.ts
import { render } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query';
import { createTestingPinia } from '@pinia/testing';
import { createRouter, createMemoryHistory } from 'vue-router';
import { routes } from '@/router/routes';

export async function renderWithProviders(component: any, { props = {}, route = '/', piniaState = {} } = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes });
  router.push(route);
  await router.isReady();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup();
  const utils = render(component, {
    props,
    global: { plugins: [router, [VueQueryPlugin, { queryClient }], createTestingPinia({ initialState: piniaState, stubActions: false })] },
  });
  return { user, router, queryClient, ...utils };
}
```

## Component test
```ts
it('[T2][R1] applies a valid coupon', async () => {
  const { user } = await renderWithProviders(CouponField, { props: { cartId: 'c1' } });
  await user.type(screen.getByLabelText(/coupon/i), 'SAVE10');
  await user.click(screen.getByRole('button', { name: /apply/i }));
  expect(await screen.findByText(/10% off applied/i)).toBeInTheDocument();
});
```

## Notes
- Emitted events: assert their *effect* on the UI. Use `emitted()` only for reusable primitives whose contract is the event.
- `v-model` components: render inside a tiny wrapper, or assert on `update:modelValue` for primitives.
- Composables with no DOM: call them inside `withSetup` (mount a dummy component) or test them through the component.
- Nuxt: `@nuxt/test-utils` (`mountSuspended`, `registerEndpoint`) instead of the plain render above.
