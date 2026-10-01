"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { Alert, Badge, Button, Card, CardHeader, FormField, Input, Select, Switch, useToast } from "@/components/ui";
import { useUpdateProfileMutation } from "@/lib/api/auth-api";
import { errorMessage } from "@/lib/api/errors";
import { countryOptions } from "@/lib/countries";
import { CURRENCIES, CURRENCY_LABEL } from "@/lib/money";
import { useAppSelector } from "@/lib/redux/hooks";
import { profileSchema, type ProfileValues } from "@/features/auth/schemas";

export function ProfileForm() {
  const user = useAppSelector((state) => state.session.user)!;
  const [update, state] = useUpdateProfileMutation();
  const { toast } = useToast();
  const countries = useMemo(() => countryOptions(), []);

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user.name,
      preferredCurrency: user.preferredCurrency ?? "",
      country: user.country ?? "",
      marketingOptIn: user.marketingOptIn,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = await update({
        name: values.name,
        marketingOptIn: values.marketingOptIn,
        ...(values.preferredCurrency ? { preferredCurrency: values.preferredCurrency } : {}),
        ...(values.country ? { country: values.country } : {}),
      }).unwrap();
      form.reset({
        name: saved.name,
        preferredCurrency: saved.preferredCurrency ?? "",
        country: saved.country ?? "",
        marketingOptIn: saved.marketingOptIn,
      });
      toast({ title: "Profile saved", tone: "success" });
    } catch {
      // shown via state.error
    }
  });

  return (
    <Card as="section" aria-labelledby="profile-title">
      <CardHeader title={<span id="profile-title">Profile</span>} description="How we address you and what we show you by default." />
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        {state.isError && <Alert tone="danger" title={errorMessage(state.error)} />}
        <FormField label="Email" hint="Your sign-in and where receipts are sent.">
          <div className="flex flex-wrap items-center gap-3">
            <Input value={user.email} readOnly disabled className="min-w-0 flex-1" />
            <Badge tone={user.emailVerified ? "success" : "warning"}>{user.emailVerified ? "Confirmed" : "Not confirmed"}</Badge>
          </div>
        </FormField>
        <FormField label="Full name" error={form.formState.errors.name?.message}>
          <Input autoComplete="name" {...form.register("name")} />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Preferred currency" hint="Prices are shown in this currency.">
            <Select
              placeholder="Detect automatically"
              options={CURRENCIES.map((code) => ({ value: code, label: `${code} · ${CURRENCY_LABEL[code]}` }))}
              {...form.register("preferredCurrency")}
            />
          </FormField>
          <FormField label="Country">
            <Select placeholder="Choose a country" options={countries} autoComplete="country" {...form.register("country")} />
          </FormField>
        </div>
        <Controller
          control={form.control}
          name="marketingOptIn"
          render={({ field }) => (
            <Switch
              checked={field.value}
              onCheckedChange={field.onChange}
              label="New book and edition emails"
              description="At most one email a month. You can turn this off any time."
            />
          )}
        />
        <div className="flex justify-end">
          <Button type="submit" isLoading={state.isLoading} loadingLabel="Saving" disabled={!form.formState.isDirty}>
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  );
}
