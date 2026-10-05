"use client";

import { Globe2, Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FormField,
  Icon,
  Input,
  Modal,
  MoneyInput,
  Skeleton,
  Switch,
  Textarea,
  useToast,
} from "@/components/ui";
import {
  useAdminShippingZonesQuery,
  useCreateShippingZoneMutation,
  useDeleteShippingZoneMutation,
  useUpdateShippingZoneMutation,
  type ShippingZone,
  type ShippingZoneInput,
} from "@/lib/api/commerce-api";
import { errorMessage } from "@/lib/api/errors";
import { countryName } from "@/lib/countries";
import { CURRENCIES, formatMoney, type Currency } from "@/lib/money";
import { AdminQueryError } from "./admin-query-error";
import { ShippingCoverageAlert } from "./shipping-coverage";

const REST = "*";

/** Where print copies ship and what it costs, per currency (ARCHITECTURE §4.3). */
export function ShippingManager() {
  const { data, error, isLoading, refetch } = useAdminShippingZonesQuery();
  const [editing, setEditing] = useState<ShippingZone | "new" | null>(null);

  if (error) return <AdminQueryError error={error} onRetry={() => void refetch()} />;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-text-muted">
          Print copies can only be bought for countries in an active zone with a rate in the buyer&rsquo;s currency. Ebooks need no shipping.
        </p>
        <Button leadingIcon={<Icon icon={Plus} size="sm" />} onClick={() => setEditing("new")}>
          Add zone
        </Button>
      </div>
      <ShippingCoverageAlert linkToShipping={false} />
      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : !data?.length ? (
        <EmptyState
          icon={Globe2}
          title="No shipping zones yet"
          description='Start with "Nigeria", then add "Everywhere else" for international orders.'
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {data.map((zone) => (
            <li key={zone.id}>
              <Card className="flex h-full flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-xl">{zone.name}</p>
                    <p className="text-sm text-text-muted">
                      {zone.countries.includes(REST) ? "Every country not in another zone" : zone.countries.map((c) => countryName(c)).join(", ")}
                    </p>
                  </div>
                  {!zone.active && <Badge>Off</Badge>}
                </div>
                <ul className="flex flex-wrap gap-2 text-sm">
                  {zone.rates.map((rate) => (
                    <li key={rate.currency}>
                      <Badge size="sm">
                        {formatMoney({ amount: rate.firstItem, currency: rate.currency })} + {formatMoney({ amount: rate.additionalItem, currency: rate.currency })} each extra
                      </Badge>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-text-subtle">
                  {zone.estimatedDays.min}–{zone.estimatedDays.max} working days
                </p>
                <Button variant="outline" size="sm" className="mt-auto self-start" leadingIcon={<Icon icon={Pencil} size="sm" />} onClick={() => setEditing(zone)}>
                  Edit
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {editing && <ZoneDialog zone={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

type RateDraft = Record<Currency, { first: number | null; additional: number | null }>;

function ZoneDialog({ zone, onClose }: { zone?: ShippingZone; onClose: () => void }) {
  const [name, setName] = useState(zone?.name ?? "");
  const [rest, setRest] = useState(zone?.countries.includes(REST) ?? false);
  const [countries, setCountries] = useState(zone && !zone.countries.includes(REST) ? zone.countries.join(", ") : "");
  const [rates, setRates] = useState<RateDraft>(() => {
    const draft = Object.fromEntries(CURRENCIES.map((c) => [c, { first: null, additional: null }])) as RateDraft;
    for (const r of zone?.rates ?? []) draft[r.currency] = { first: r.firstItem, additional: r.additionalItem };
    return draft;
  });
  const [minDays, setMinDays] = useState(String(zone?.estimatedDays.min ?? 3));
  const [maxDays, setMaxDays] = useState(String(zone?.estimatedDays.max ?? 7));
  const [active, setActive] = useState(zone?.active ?? true);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [create, createState] = useCreateShippingZoneMutation();
  const [update, updateState] = useUpdateShippingZoneMutation();
  const [remove, removeState] = useDeleteShippingZoneMutation();
  const { toast } = useToast();

  const codes = useMemo(
    () =>
      countries
        .split(/[\s,;]+/)
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean),
    [countries],
  );
  const unknown = codes.filter((c) => !/^[A-Z]{2}$/.test(c) || countryName(c) === c);

  const save = async () => {
    setProblem(null);
    const rateList = CURRENCIES.flatMap((currency) => {
      const r = rates[currency];
      return r.first !== null ? [{ currency, firstItem: r.first, additionalItem: r.additional ?? 0 }] : [];
    });
    if (!name.trim()) return setProblem("Name the zone, e.g. Nigeria");
    if (!rest && (codes.length === 0 || unknown.length)) {
      return setProblem(unknown.length ? `Unknown country codes: ${unknown.join(", ")}` : "Add at least one country code, e.g. NG");
    }
    if (rateList.length === 0) return setProblem("Set a rate in at least one currency");
    const input: ShippingZoneInput = {
      name: name.trim(),
      countries: rest ? [REST] : codes,
      rates: rateList,
      estimatedDays: { min: Number(minDays) || 0, max: Number(maxDays) || 0 },
      active,
    };
    try {
      if (zone) await update({ id: zone.id, zone: input }).unwrap();
      else await create(input).unwrap();
      toast({ title: zone ? "Zone saved" : "Zone added", tone: "success" });
      onClose();
    } catch (error) {
      setProblem(errorMessage(error));
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={zone ? `Edit ${zone.name}` : "Add shipping zone"}
      size="lg"
      footer={
        <>
          {zone && (
            <Button variant="ghost" className="mr-auto text-danger" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={createState.isLoading || updateState.isLoading} onClick={() => void save()}>
            {zone ? "Save" : "Add zone"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {problem && <Alert tone="danger" title={problem} />}
        <FormField label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nigeria, West Africa, United Kingdom" maxLength={80} />
        </FormField>
        <Switch checked={rest} onCheckedChange={setRest} label="Everywhere else" description="Covers every country that is not in another zone." />
        {!rest && (
          <FormField
            label="Countries"
            hint={codes.length && !unknown.length ? codes.map((c) => countryName(c)).join(", ") : "Two-letter codes separated by commas, e.g. NG, GH, KE"}
            error={unknown.length ? `Unknown: ${unknown.join(", ")}` : undefined}
          >
            <Textarea rows={2} value={countries} onChange={(e) => setCountries(e.target.value)} />
          </FormField>
        )}
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-medium text-text">Rates (leave a currency empty to not ship in it)</legend>
          {CURRENCIES.map((currency) => (
            <div key={currency} className="grid grid-cols-2 gap-3">
              <FormField label={`First copy · ${currency}`}>
                <MoneyInput currency={currency} value={rates[currency].first} onChange={(first) => setRates((r) => ({ ...r, [currency]: { ...r[currency], first } }))} />
              </FormField>
              <FormField label={`Each extra copy · ${currency}`}>
                <MoneyInput
                  currency={currency}
                  value={rates[currency].additional}
                  onChange={(additional) => setRates((r) => ({ ...r, [currency]: { ...r[currency], additional } }))}
                />
              </FormField>
            </div>
          ))}
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Fastest (working days)">
            <Input inputMode="numeric" value={minDays} onChange={(e) => setMinDays(e.target.value)} />
          </FormField>
          <FormField label="Slowest (working days)">
            <Input inputMode="numeric" value={maxDays} onChange={(e) => setMaxDays(e.target.value)} />
          </FormField>
        </div>
        <Switch checked={active} onCheckedChange={setActive} label="Active" description="Switch off to stop shipping to these countries for now." />
      </div>
      {zone && (
        <ConfirmDialog
          open={confirmDelete}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() =>
            void remove(zone.id)
              .unwrap()
              .then(() => {
                toast({ title: "Zone deleted", tone: "success" });
                onClose();
              })
              .catch((error: unknown) => toast({ title: errorMessage(error), tone: "danger" }))
              .finally(() => setConfirmDelete(false))
          }
          title={`Delete ${zone.name}?`}
          description="Print copies can no longer be bought for these countries unless another zone covers them."
          confirmLabel="Delete"
          tone="danger"
          isConfirming={removeState.isLoading}
        />
      )}
    </Modal>
  );
}
