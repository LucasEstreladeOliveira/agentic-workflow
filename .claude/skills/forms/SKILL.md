---
name: forms
description: Use when building or changing any form (fields, validation, submit, server errors, multi-step) in React or Vue. It's the project's standard setup — schema-first validation, design-system field primitives, accessible errors, pending/submitted states and server-error mapping.
---

# Forms

Every form is built the same way. That makes forms predictable for users, testable for QA, and boring to review.

## The standard
| Concern | React | Vue |
|---|---|---|
| state & submit | react-hook-form | vee-validate (or the project's choice) |
| validation | **zod schema** (shared with the API when possible) | same zod schema via `toTypedSchema` |
| fields | design-system `Form*`/`Field` primitives (label, description, error, aria) | same |
| submit | a mutation hook from `data-flow` | same |

Details and code: `references/react-hook-form.md`, `references/vee-validate.md`.

## Rules
1. **Schema first.** Define the zod schema (with user-facing messages), derive the TS type from it, and reuse it server-side. Never write validation rules twice.
2. **Use field primitives, never raw inputs.** Each field gets a visible `label`, an optional description, and its error wired with `aria-invalid` + `aria-describedby` (the primitive does this).
3. **When to validate**: on submit first, then on change for fields that already showed an error (RHF: `mode: 'onSubmit', reValidateMode: 'onChange'`). Don't shout errors while the user is still typing for the first time.
4. **Submit states**: disable the submit button and show a loading state while pending. Prevent double submit. Keep all input on failure.
5. **Server errors**:
   - field-level (`422 { fields: { email: '…' } }`) → `setError` on that field
   - form-level (409, 403, network) → an `Alert` above the actions (`role="alert"`)
   - focus the first invalid field after a failed submit
6. **Success**: toast and/or navigation, and reset the form if it stays on screen. Invalidate the queries the mutation affected (`data-flow`).
7. **Defaults**: edit forms load the current value as `defaultValues` (`values` in RHF when it's async). Don't copy query data into `useState`.
8. **Unsaved changes**: for long forms, warn on navigation when the form is dirty (`isDirty`).
9. **Multi-step**: one schema per step, combined with `.merge`/`.and` for the final submit. Keep the draft in form state (or a store if steps are separate routes). Never submit partial steps to the API unless the plan says so.
10. **Accessibility**: logical tab order, `autocomplete` attributes for personal data, `inputmode` for numbers and phone, required fields marked in the label (not only by color), and errors announced (the primitive's `role="alert"` / live region).

## Checklist
- [ ] zod schema with messages; type inferred from it
- [ ] Only design-system field primitives (`check-primitives` passes)
- [ ] Pending, disabled and double-submit handled
- [ ] Field and form-level server errors mapped; first invalid field focused
- [ ] Success path invalidates queries and gives feedback
- [ ] Tests: required fields, an invalid value, a server field error, successful submit (`frontend-testing`)
