# React: react-hook-form + zod

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { isApiError } from '@/lib/http';

export const profileSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name'),
  email: z.string().trim().email('Enter a valid email'),
  phone: z.string().trim().optional(),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export function ProfileForm({ profile }: { profile: ProfileInput }) {
  const update = useUpdateProfile();                       // mutation hook (data-flow)
  const form = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    values: profile,                                       // async data → `values`, static → `defaultValues`
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });

  const onSubmit = form.handleSubmit(async (input) => {
    try {
      await update.mutateAsync(input);
      toast.success('Profile saved');
      form.reset(input);
    } catch (e) {
      if (isApiError(e) && e.fields) {
        for (const [field, message] of Object.entries(e.fields)) form.setError(field as keyof ProfileInput, { message }, { shouldFocus: true });
      } else {
        form.setError('root', { message: isApiError(e) ? e.message : 'Something went wrong. Try again.' });
      }
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate>
        {form.formState.errors.root && <Alert variant="destructive">{form.formState.errors.root.message}</Alert>}
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl><Input autoComplete="name" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="email" render={({ field }) => (
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl><Input type="email" autoComplete="email" {...field} /></FormControl>
            <FormDescription>We'll send receipts here.</FormDescription>
            <FormMessage />
          </FormItem>
        )} />
        <Button type="submit" loading={form.formState.isSubmitting} disabled={form.formState.isSubmitting || !form.formState.isDirty}>Save</Button>
      </form>
    </Form>
  );
}
```

## Notes
- `FormField`/`FormItem`/`FormMessage` is the shadcn pattern. Use whatever your field primitives are; they must wire `id`, `aria-describedby` and `aria-invalid`.
- Controlled third-party inputs (Select, DatePicker): use `FormField` render props with `value`/`onChange`, never `register`.
- Field arrays: `useFieldArray`, with `key={field.id}` (not the index).
- Dependent fields: `form.watch('country')`, or zod `.superRefine` for cross-field rules (e.g. end date after start date).
- Next.js server actions: you can still use RHF on the client and call the action in `onSubmit`. Return `{ fields }` from the action and map them the same way.
- Unsaved changes: `useBeforeUnload(form.formState.isDirty)` plus a router guard.
