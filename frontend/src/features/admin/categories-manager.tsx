"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FolderPlus, Pencil } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button, ConfirmDialog, EmptyState, FormField, Icon, Input, Modal, Skeleton, Textarea, useToast } from "@/components/ui";
import {
  useAdminCategoriesQuery,
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useUpdateCategoryMutation,
  type AdminCategory,
} from "@/lib/api/catalog-admin-api";
import { errorMessage } from "@/lib/api/errors";
import { AdminQueryError } from "./admin-query-error";

const categorySchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(80, "Use at most 80 characters"),
  description: z.string().trim().max(400, "Use at most 400 characters"),
  sortOrder: z
    .string()
    .trim()
    .refine((v) => /^\d{1,5}$/.test(v) && Number(v) <= 10_000, "Use a whole number from 0 to 10000"),
});
type CategoryValues = z.infer<typeof categorySchema>;

export function CategoriesManager() {
  const { data, error, isLoading, refetch } = useAdminCategoriesQuery();
  const [editing, setEditing] = useState<AdminCategory | "new" | null>(null);

  if (error) return <AdminQueryError error={error} onRetry={() => void refetch()} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-text-muted">Subjects group the books in the store&rsquo;s filters and on the home page.</p>
        <Button leadingIcon={<Icon icon={FolderPlus} size="sm" />} onClick={() => setEditing("new")}>
          Add subject
        </Button>
      </div>
      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : !data?.length ? (
        <EmptyState icon={FolderPlus} title="No subjects yet" description='For example "Foundry technology", "Metal casting", "Heat treatment".' />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
          {data.map((category) => (
            <li key={category.id} className="flex items-center gap-4 p-4">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium text-text">{category.name}</span>
                <span className="text-sm text-text-muted">
                  {category.bookCount ?? 0} {category.bookCount === 1 ? "book" : "books"} · /books?category={category.slug}
                </span>
              </div>
              <Button variant="outline" size="sm" leadingIcon={<Icon icon={Pencil} size="sm" />} onClick={() => setEditing(category)}>
                Edit
              </Button>
            </li>
          ))}
        </ul>
      )}
      {editing && <CategoryDialog category={editing === "new" ? undefined : editing} nextOrder={(data?.length ?? 0) * 10} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CategoryDialog({ category, nextOrder, onClose }: { category?: AdminCategory; nextOrder: number; onClose: () => void }) {
  const [create, createState] = useCreateCategoryMutation();
  const [update, updateState] = useUpdateCategoryMutation();
  const [remove, removeState] = useDeleteCategoryMutation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { toast } = useToast();
  const form = useForm<CategoryValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: category?.name ?? "", description: category?.description ?? "", sortOrder: String(category?.sortOrder ?? nextOrder) },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    const input = { name: values.name.trim(), description: values.description.trim(), sortOrder: Number(values.sortOrder) };
    try {
      if (category) await update({ id: category.id, category: input }).unwrap();
      else await create(input).unwrap();
      toast({ title: category ? "Subject saved" : "Subject added", tone: "success" });
      onClose();
    } catch (error) {
      toast({ title: errorMessage(error), tone: "danger" });
    }
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={category ? `Edit ${category.name}` : "Add subject"}
      footer={
        <>
          {category && (
            <Button variant="ghost" className="mr-auto text-danger" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="category-form" isLoading={createState.isLoading || updateState.isLoading}>
            {category ? "Save" : "Add subject"}
          </Button>
        </>
      }
    >
      <form id="category-form" onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-5">
        <FormField label="Name" required error={errors.name?.message}>
          <Input {...form.register("name")} placeholder="e.g. Heat treatment" />
        </FormField>
        <FormField label="Description" hint="Optional; shown at the top of the subject's listing." error={errors.description?.message}>
          <Textarea rows={3} {...form.register("description")} maxLength={400} />
        </FormField>
        <FormField label="Order" hint="Lower numbers come first." error={errors.sortOrder?.message}>
          <Input inputMode="numeric" {...form.register("sortOrder")} />
        </FormField>
      </form>
      {category && (
        <ConfirmDialog
          open={confirmDelete}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() =>
            void remove(category.id)
              .unwrap()
              .then(() => {
                toast({ title: "Subject deleted", tone: "success" });
                onClose();
              })
              .catch((error: unknown) => toast({ title: errorMessage(error), tone: "danger" }))
              .finally(() => setConfirmDelete(false))
          }
          title={`Delete ${category.name}?`}
          description="Only possible when no book is filed under it."
          confirmLabel="Delete"
          tone="danger"
          isConfirming={removeState.isLoading}
        />
      )}
    </Modal>
  );
}
