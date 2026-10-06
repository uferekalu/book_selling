"use client";

import { Search, ShieldCheck, Users } from "lucide-react";
import { useDeferredValue, useState } from "react";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FormField,
  Icon,
  Input,
  Pagination,
  Select,
  Skeleton,
  useToast,
} from "@/components/ui";
import { useChangeRoleMutation, useCustomersQuery, type CustomerRow } from "@/lib/api/admin-api";
import { errorMessage } from "@/lib/api/errors";
import { countryName } from "@/lib/countries";
import { formatMoney } from "@/lib/money";
import { useAppSelector } from "@/lib/redux/hooks";
import { AdminQueryError } from "./admin-query-error";

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const ROLE: Record<CustomerRow["role"], string> = { customer: "Customer", admin: "Admin", owner: "Owner" };

/**
 * Everyone with an account or a guest checkout (BS-12): what they bought, per currency, and, for
 * the owner, giving or removing staff access.
 */
export function CustomersAdmin() {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"" | "customer" | "staff">("");
  const [page, setPage] = useState(1);
  const q = useDeferredValue(search.trim());
  const { data, isLoading, error, refetch } = useCustomersQuery({ page, ...(q ? { q } : {}), ...(role ? { role } : {}) });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-medium">Customers</h2>
        <p className="text-text-muted">Newest first. Spending is per currency, after refunds.</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <FormField label="Search customers" hideLabel className="flex-1">
          <Input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Name or email"
            leading={<Icon icon={Search} size="sm" />}
          />
        </FormField>
        <FormField label="Show" className="sm:w-48">
          <Select
            value={role}
            onChange={(e) => {
              setRole(e.target.value as typeof role);
              setPage(1);
            }}
            options={[
              { value: "", label: "Everyone" },
              { value: "customer", label: "Customers" },
              { value: "staff", label: "Staff" },
            ]}
          />
        </FormField>
      </div>
      {error ? (
        <AdminQueryError error={error} onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : !data.items.length ? (
        <EmptyState icon={Users} title={q ? "No one matches" : "No customers yet"} description={q ? `Nobody’s name or email contains “${q}”.` : "People appear here when they sign up or check out."} />
      ) : (
        <>
          <p className="text-sm text-text-muted">
            {data.total} {data.total === 1 ? "person" : "people"}
          </p>
          <ul className="flex flex-col gap-3">
            {data.items.map((c) => (
              <li key={c.id}>
                <CustomerCard customer={c} />
              </li>
            ))}
          </ul>
          <Pagination page={data.page} totalPages={Math.ceil(data.total / data.pageSize)} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

function CustomerCard({ customer: c }: { customer: CustomerRow }) {
  const me = useAppSelector((state) => state.session.user);
  const isOwner = me?.role === "owner";
  return (
    <Card padding="sm" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-text">{c.name}</p>
          <p className="text-sm break-all text-text-muted">{c.email}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {c.role !== "customer" && <Badge tone="primary">{ROLE[c.role]}</Badge>}
          {c.guest && <Badge tone="neutral">Guest checkout</Badge>}
          {!c.guest && !c.emailVerified && <Badge tone="warning">Email not confirmed</Badge>}
          {c.accountStatus !== "active" && <Badge tone="danger">{c.accountStatus}</Badge>}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-text-subtle">Orders</dt>
          <dd className="font-medium tabular-nums">{c.orders}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-subtle">Spent</dt>
          <dd className="flex flex-col font-medium tabular-nums">
            {c.spent.length ? c.spent.map((s) => <span key={s.currency}>{formatMoney(s)}</span>) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-subtle">Joined</dt>
          <dd>{day.format(new Date(c.joinedAt))}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-subtle">{c.lastOrderAt ? "Last order" : "Country"}</dt>
          <dd>{c.lastOrderAt ? day.format(new Date(c.lastOrderAt)) : c.country ? countryName(c.country) : "—"}</dd>
        </div>
      </dl>
      {isOwner && c.role !== "owner" && !c.guest && c.accountStatus === "active" && c.id !== me?.id && <RoleButton customer={c} />}
    </Card>
  );
}

function RoleButton({ customer: c }: { customer: CustomerRow }) {
  const [open, setOpen] = useState(false);
  const [change, state] = useChangeRoleMutation();
  const { toast } = useToast();
  const makeAdmin = c.role === "customer";
  return (
    <>
      <Button
        size="sm"
        variant={makeAdmin ? "outline" : "ghost"}
        className="self-start"
        leadingIcon={<Icon icon={ShieldCheck} size="sm" />}
        onClick={() => setOpen(true)}
      >
        {makeAdmin ? "Make staff (admin)" : "Remove staff access"}
      </Button>
      <ConfirmDialog
        open={open}
        onCancel={() => setOpen(false)}
        title={makeAdmin ? `Give ${c.name} staff access?` : `Remove ${c.name}’s staff access?`}
        description={
          makeAdmin
            ? "They will be able to manage books, orders, shipping, messages and discount codes, and see sales. They must turn on two-step verification first. Only you can refund money."
            : "They go back to being a customer and are signed out everywhere."
        }
        confirmLabel={makeAdmin ? "Give staff access" : "Remove access"}
        tone={makeAdmin ? "primary" : "danger"}
        isConfirming={state.isLoading}
        onConfirm={() =>
          void change({ id: c.id, role: makeAdmin ? "admin" : "customer" })
            .unwrap()
            .then(() => {
              setOpen(false);
              toast({ title: makeAdmin ? `${c.name} is now staff` : `${c.name} is a customer again`, tone: "success" });
            })
            .catch((e: unknown) => toast({ title: errorMessage(e), tone: "danger" }))
        }
      />
    </>
  );
}
