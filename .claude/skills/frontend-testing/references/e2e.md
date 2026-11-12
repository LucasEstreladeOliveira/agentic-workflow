# E2E with Playwright

## Structure
```
e2e/
  fixtures.ts        # test.extend: page objects, seeded data, authenticated page
  pages/             # one page object per screen
  auth.setup.ts      # logs in once, saves storageState
  checkout.spec.ts   # one file per journey
```

## Auth once
```ts
// e2e/auth.setup.ts
setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.E2E_USER!);
  await page.getByLabel('Password').fill(process.env.E2E_PASS!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('/dashboard');
  await page.context().storageState({ path: 'e2e/.auth/user.json' });
});
// playwright.config.ts: projects: [{ name: 'setup', testMatch: /auth\.setup/ }, { name: 'chromium', dependencies: ['setup'], use: { storageState: 'e2e/.auth/user.json' } }]
```

## Page object
```ts
export class CheckoutPage {
  constructor(private page: Page) {}
  coupon = () => this.page.getByLabel('Coupon');
  apply = () => this.page.getByRole('button', { name: 'Apply' });
  total = () => this.page.getByTestId('order-total');   // testid OK for values without a role
  async applyCoupon(code: string) { await this.coupon().fill(code); await this.apply().click(); }
}
```

## Journey test
```ts
test('[T7][R4] paid order shows a receipt', async ({ page, seed }) => {
  const order = await seed.order({ total: 4200 });         // seed via API/DB, not via the UI
  const checkout = new CheckoutPage(page);
  await page.goto(`/checkout/${order.id}`);
  await checkout.applyCoupon('SAVE10');
  await expect(checkout.total()).toHaveText('$37.80');
  await page.getByRole('button', { name: 'Pay' }).click();
  await expect(page.getByRole('heading', { name: 'Receipt' })).toBeVisible();
});
```

## Rules
- Role/label locators. Use `getByTestId` only for things without accessible semantics.
- Web-first assertions (`await expect(locator)…`). They auto-wait. Never `page.waitForTimeout`.
- Each test seeds its own data and doesn't depend on order. Clean up or use unique ids.
- Mock **third-party** services (payments, maps, analytics) with `page.route`. Keep your own API real.
- Turn on `trace: 'on-first-retry'` and attach traces to QA findings.
- Keep the suite to the critical journeys. Push everything else down to component tests.
