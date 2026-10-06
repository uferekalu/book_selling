"use client";

import { History, Search } from "lucide-react";
import NextLink from "next/link";
import { useDeferredValue, useState } from "react";
import { Accordion, Badge, Card, EmptyState, FormField, Icon, Input, Pagination, Select, Skeleton } from "@/components/ui";
import { useAuditLogQuery, type AuditEntry } from "@/lib/api/admin-api";
import { AdminQueryError } from "./admin-query-error";
import { actionLabel, entityTypeLabel } from "./audit-labels";

const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * The audit log for the owner (BS-12): every money, staff and security action, who did it and
 * when. Rows are never edited or deleted, so this is the record to check when something is
 * questioned.
 */
export function AuditAdmin() {
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState("");
  const [page, setPage] = useState(1);
  const q = useDeferredValue(search.trim());
  const { data, isLoading, error, refetch } = useAuditLogQuery({ page, ...(q ? { q } : {}), ...(entityType ? { entityType } : {}) });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-medium">Audit log</h2>
        <p className="max-w-3xl text-text-muted">
          Every refund, staff change, order decision and sign-in security change, newest first. Entries can’t be changed or removed.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <FormField label="Search actions" hideLabel className="flex-1">
          <Input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Action, e.g. refund or role"
            leading={<Icon icon={Search} size="sm" />}
          />
        </FormField>
        <FormField label="About" className="sm:w-48">
          <Select
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              setPage(1);
            }}
            options={[{ value: "", label: "Everything" }, ...(data?.entityTypes ?? []).map((t) => ({ value: t, label: entityTypeLabel(t) }))]}
          />
        </FormField>
      </div>
      {error ? (
        <AdminQueryError error={error} onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : !data.items.length ? (
        <EmptyState icon={History} title="Nothing recorded" description={q || entityType ? "No entries match these filters." : "Actions appear here as staff use the store."} />
      ) : (
        <>
          <ol className="flex flex-col gap-2">
            {data.items.map((entry) => (
              <li key={entry.id}>
                <AuditRow entry={entry} />
              </li>
            ))}
          </ol>
          <Pagination page={data.page} totalPages={Math.ceil(data.total / data.pageSize)} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

function AuditRow({ entry: e }: { entry: AuditEntry }) {
  const who = e.actor ? (e.actor.name ?? e.actor.email ?? "A deleted account") : "The store (automatic)";
  const changes = e.changes && Object.keys(e.changes).length ? e.changes : null;
  return (
    <Card padding="sm" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <p className="font-medium text-text">{actionLabel(e.action)}</p>
        <time className="text-sm whitespace-nowrap text-text-muted tabular-nums" dateTime={e.at}>
          {when.format(new Date(e.at))}
        </time>
      </div>
      <p className="text-sm text-text-muted">
        By {who}
        {e.actor?.role && e.actor.role !== "customer" && (
          <Badge tone="neutral" size="sm" className="ml-1.5 align-middle">
            {e.actor.role}
          </Badge>
        )}
        {" · "}
        {entityTypeLabel(e.entityType)}{" "}
        {e.entityHref ? (
          <NextLink href={e.entityHref} className="text-primary underline-offset-4 hover:underline">
            {e.entityLabel}
          </NextLink>
        ) : (
          <span className="break-all">{e.entityLabel ?? e.entityId}</span>
        )}
      </p>
      {changes && (
        <Accordion
          headingLevel={3}
          items={[
            {
              id: e.id,
              title: "Details",
              content: (
                <dl className="grid gap-1 text-sm">
                  {Object.entries(changes).map(([key, value]) => (
                    <div key={key} className="flex flex-wrap gap-x-2">
                      <dt className="text-text-subtle">{key}</dt>
                      <dd className="min-w-0 font-mono text-xs break-all">{typeof value === "string" ? value : JSON.stringify(value)}</dd>
                    </div>
                  ))}
                  {e.ip && (
                    <div className="flex flex-wrap gap-x-2">
                      <dt className="text-text-subtle">IP address</dt>
                      <dd className="font-mono text-xs">{e.ip}</dd>
                    </div>
                  )}
                </dl>
              ),
            },
          ]}
        />
      )}
    </Card>
  );
}
