# Vue: vee-validate + zod

```vue
<script setup lang="ts">
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { profileSchema, type ProfileInput } from '@/features/profile/schema';   // same zod schema as the API
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

const props = defineProps<{ profile: ProfileInput }>();
const update = useUpdateProfile();
const formError = ref<string | null>(null);

const { handleSubmit, setFieldError, resetForm, isSubmitting, meta } = useForm({
  validationSchema: toTypedSchema(profileSchema),
  initialValues: props.profile,
});

const onSubmit = handleSubmit(async (values) => {
  formError.value = null;
  try {
    await update.mutateAsync(values);
    toast.success('Profile saved');
    resetForm({ values });
  } catch (e) {
    if (isApiError(e) && e.fields) Object.entries(e.fields).forEach(([f, m]) => setFieldError(f as keyof ProfileInput, m));
    else formError.value = isApiError(e) ? e.message : 'Something went wrong. Try again.';
  }
}, ({ errors }) => {
  // invalid submit → focus first invalid field
  const first = Object.keys(errors)[0];
  if (first) document.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
});
</script>

<template>
  <form novalidate @submit="onSubmit">
    <Alert v-if="formError" variant="destructive">{{ formError }}</Alert>
    <FormField v-slot="{ componentField }" name="name">
      <FormItem>
        <FormLabel>Name</FormLabel>
        <FormControl><Input autocomplete="name" v-bind="componentField" /></FormControl>
        <FormMessage />
      </FormItem>
    </FormField>
    <FormField v-slot="{ componentField }" name="email">
      <FormItem>
        <FormLabel>Email</FormLabel>
        <FormControl><Input type="email" autocomplete="email" v-bind="componentField" /></FormControl>
        <FormMessage />
      </FormItem>
    </FormField>
    <Button type="submit" :loading="isSubmitting" :disabled="isSubmitting || !meta.dirty">Save</Button>
  </form>
</template>
```

## Notes
- The `FormField`/`componentField` pattern is shadcn-vue. With other primitives, use `useField(name)` and bind `value`, `errorMessage` and `handleBlur`.
- Validate on submit first: `useForm({ validateOnMount: false })`, and fields re-validate on change after the first error.
- Field arrays: `useFieldArray('items')`, keyed by `field.key`.
- Async defaults: `resetForm({ values: data })` when the query resolves (watch the query's `data`).
- Unsaved changes: `onBeforeRouteLeave` + `meta.dirty`.
