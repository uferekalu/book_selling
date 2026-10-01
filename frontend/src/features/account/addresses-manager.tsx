"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  FormField,
  Icon,
  IconButton,
  Input,
  Modal,
  Select,
  Skeleton,
  useToast,
} from "@/components/ui";
import {
  useAddAddressMutation,
  useAddressesQuery,
  useRemoveAddressMutation,
  useUpdateAddressMutation,
} from "@/lib/api/auth-api";
import { errorMessage } from "@/lib/api/errors";
import type { Address } from "@/lib/api/types";
import { countryName, countryOptions } from "@/lib/countries";
import { useAppSelector } from "@/lib/redux/hooks";
import { addressSchema, type AddressValues } from "@/features/auth/schemas";

const MAX_ADDRESSES = 10;

export function AddressesManager() {
  const { data: addresses, isLoading, isError, error, refetch } = useAddressesQuery();
  const [editing, setEditing] = useState<Address | "new" | null>(null);
  const [removing, setRemoving] = useState<Address | null>(null);
  const [remove, removeState] = useRemoveAddressMutation();
  const { toast } = useToast();
  const canAdd = (addresses?.length ?? 0) < MAX_ADDRESSES;

  return (
    <Card as="section" aria-labelledby="addresses-title">
      <CardHeader
        title={<span id="addresses-title">Delivery addresses</span>}
        description="Used for print orders. Your default is pre-selected at checkout."
        action={
          addresses && addresses.length > 0 && canAdd ? (
            <Button size="sm" leadingIcon={<Icon icon={Plus} size="sm" />} onClick={() => setEditing("new")}>
              Add
            </Button>
          ) : undefined
        }
      />
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      )}
      {isError && (
        <Alert tone="danger" title={errorMessage(error)} action={<Button size="sm" variant="outline" onClick={() => void refetch()}>Try again</Button>} />
      )}
      {addresses?.length === 0 && (
        <EmptyState
          icon={MapPin}
          title="No saved addresses"
          description="Save an address now to check out faster when you order a print copy."
          action={<Button onClick={() => setEditing("new")}>Add an address</Button>}
        />
      )}
      {addresses && addresses.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2">
          {addresses.map((address) => (
            <li key={address.id} className="flex flex-col gap-3 rounded-xl border border-border-strong bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="truncate font-medium text-text">{address.label || address.fullName}</p>
                  {address.isDefault && <Badge tone="primary" size="sm" className="self-start">Default</Badge>}
                </div>
                <div className="flex shrink-0">
                  <IconButton size="sm" label={`Edit ${address.label || "address"}`} icon={<Icon icon={Pencil} size="sm" />} onClick={() => setEditing(address)} />
                  <IconButton size="sm" label={`Delete ${address.label || "address"}`} icon={<Icon icon={Trash2} size="sm" />} onClick={() => setRemoving(address)} />
                </div>
              </div>
              <address className="text-sm leading-relaxed text-text-muted not-italic">
                {address.fullName}
                <br />
                {address.line1}
                {address.line2 && (
                  <>
                    <br />
                    {address.line2}
                  </>
                )}
                <br />
                {[address.city, address.state, address.postalCode].filter(Boolean).join(", ")}
                <br />
                {countryName(address.country)}
                <br />
                {address.phone}
              </address>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <AddressDialog
          address={editing === "new" ? null : editing}
          isFirst={(addresses?.length ?? 0) === 0}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={removing !== null}
        title="Delete this address?"
        description={removing ? `${removing.line1}, ${removing.city} will be removed from your saved addresses.` : undefined}
        confirmLabel="Delete address"
        tone="danger"
        isConfirming={removeState.isLoading}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (!removing) return;
          void remove(removing.id)
            .unwrap()
            .then(() => toast({ title: "Address deleted", tone: "success" }))
            .catch((e: unknown) => toast({ title: errorMessage(e), tone: "danger" }))
            .finally(() => setRemoving(null));
        }}
      />
    </Card>
  );
}

function AddressDialog({ address, isFirst, onClose }: { address: Address | null; isFirst: boolean; onClose: () => void }) {
  const user = useAppSelector((state) => state.session.user);
  const [add, addState] = useAddAddressMutation();
  const [update, updateState] = useUpdateAddressMutation();
  const state = address ? updateState : addState;
  const { toast } = useToast();
  const countries = useMemo(() => countryOptions(), []);

  const form = useForm<AddressValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: address
      ? { ...address }
      : {
          label: "",
          fullName: user?.name ?? "",
          phone: "",
          line1: "",
          line2: "",
          city: "",
          state: "",
          postalCode: "",
          country: user?.country ?? "",
          isDefault: isFirst,
        },
  });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    const payload = {
      label: values.label,
      fullName: values.fullName,
      phone: values.phone,
      line1: values.line1,
      line2: values.line2,
      city: values.city,
      state: values.state,
      postalCode: values.postalCode,
      country: values.country,
      isDefault: values.isDefault,
    };
    try {
      if (address) await update({ id: address.id, address: payload }).unwrap();
      else await add(payload).unwrap();
      toast({ title: address ? "Address updated" : "Address saved", tone: "success" });
      onClose();
    } catch {
      // shown via state.error
    }
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={address ? "Edit address" : "Add an address"}
      dismissible={!state.isLoading}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={state.isLoading}>
            Cancel
          </Button>
          <Button type="submit" form="address-form" isLoading={state.isLoading} loadingLabel="Saving">
            Save address
          </Button>
        </>
      }
    >
      <form id="address-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4 pb-2">
        {state.isError && <Alert tone="danger" title={errorMessage(state.error)} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Recipient's full name" error={errors.fullName?.message} required>
            <Input autoComplete="shipping name" {...form.register("fullName")} />
          </FormField>
          <FormField label="Phone" error={errors.phone?.message} required hint="For the courier, with country code.">
            <Input type="tel" autoComplete="shipping tel" inputMode="tel" {...form.register("phone")} />
          </FormField>
        </div>
        <FormField label="Country" error={errors.country?.message} required>
          <Select placeholder="Choose a country" options={countries} autoComplete="shipping country" {...form.register("country")} />
        </FormField>
        <FormField label="Street address" error={errors.line1?.message} required>
          <Input autoComplete="shipping address-line1" {...form.register("line1")} />
        </FormField>
        <FormField label="Apartment, suite, building (optional)" error={errors.line2?.message}>
          <Input autoComplete="shipping address-line2" {...form.register("line2")} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="City or town" error={errors.city?.message} required>
            <Input autoComplete="shipping address-level2" {...form.register("city")} />
          </FormField>
          <FormField label="State / region" error={errors.state?.message}>
            <Input autoComplete="shipping address-level1" {...form.register("state")} />
          </FormField>
          <FormField label="Postal code" error={errors.postalCode?.message}>
            <Input autoComplete="shipping postal-code" {...form.register("postalCode")} />
          </FormField>
        </div>
        <FormField label="Label (optional)" hint='e.g. "Home" or "Office"' error={errors.label?.message}>
          <Input {...form.register("label")} />
        </FormField>
        <Controller
          control={form.control}
          name="isDefault"
          render={({ field }) => (
            <Checkbox
              label="Use as my default delivery address"
              checked={field.value}
              disabled={isFirst}
              onChange={(e) => field.onChange(e.target.checked)}
            />
          )}
        />
      </form>
    </Modal>
  );
}
