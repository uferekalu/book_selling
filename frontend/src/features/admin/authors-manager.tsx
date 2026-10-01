"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, UserPlus } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Avatar, Button, Card, ConfirmDialog, EmptyState, FormField, Icon, Input, Modal, Skeleton, Textarea, useToast } from "@/components/ui";
import {
  useAdminAuthorsQuery,
  useAuthorPhotoMutation,
  useCreateAuthorMutation,
  useDeleteAuthorMutation,
  useUpdateAuthorMutation,
  type AdminAuthor,
  type AuthorInput,
} from "@/lib/api/catalog-admin-api";
import { errorMessage } from "@/lib/api/errors";
import { AdminQueryError } from "./admin-query-error";
import { useUpload } from "./book-editor/use-upload";
import { FileDrop } from "./file-drop";
import { MarkdownField } from "./markdown-field";

const optionalUrl = z
  .string()
  .trim()
  .refine((v) => v === "" || /^https?:\/\/\S+\.\S+/.test(v), "Enter a full link starting with https://");

const authorSchema = z.object({
  name: z.string().trim().min(1, "Enter the name").max(120, "Use at most 120 characters"),
  title: z.string().trim().max(160, "Use at most 160 characters"),
  affiliations: z
    .string()
    .refine((v) => v.split("\n").filter((l) => l.trim()).length <= 10, "List at most 10")
    .refine((v) => v.split("\n").every((l) => l.trim().length <= 160), "Keep each line under 160 characters"),
  bioMarkdown: z.string().max(20_000),
  website: optionalUrl,
  googleScholar: optionalUrl,
  researchGate: optionalUrl,
  linkedin: optionalUrl,
});
type AuthorValues = z.infer<typeof authorSchema>;

const LINK_FIELDS = [
  { name: "website", label: "Website" },
  { name: "googleScholar", label: "Google Scholar" },
  { name: "researchGate", label: "ResearchGate" },
  { name: "linkedin", label: "LinkedIn" },
] as const;

function valuesFrom(author?: AdminAuthor): AuthorValues {
  return {
    name: author?.name ?? "",
    title: author?.title ?? "",
    affiliations: author?.affiliations.join("\n") ?? "",
    bioMarkdown: author?.bioMarkdown ?? "",
    website: author?.links.website ?? "",
    googleScholar: author?.links.googleScholar ?? "",
    researchGate: author?.links.researchGate ?? "",
    linkedin: author?.links.linkedin ?? "",
  };
}

function toInput(values: AuthorValues): AuthorInput {
  const links: AuthorInput["links"] = {};
  for (const { name } of LINK_FIELDS) if (values[name].trim()) links[name] = values[name].trim();
  return {
    name: values.name.trim(),
    title: values.title.trim(),
    bioMarkdown: values.bioMarkdown,
    affiliations: values.affiliations
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
    links,
  };
}

export function AuthorsManager() {
  const { data, error, isLoading, refetch } = useAdminAuthorsQuery();
  const [editing, setEditing] = useState<AdminAuthor | "new" | null>(null);

  if (error) return <AdminQueryError error={error} onRetry={() => void refetch()} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-text-muted">The author profile appears on every book page and on the &ldquo;The author&rdquo; page.</p>
        <Button leadingIcon={<Icon icon={UserPlus} size="sm" />} onClick={() => setEditing("new")}>
          Add author
        </Button>
      </div>
      {isLoading ? (
        <Skeleton className="h-28 w-full rounded-2xl" />
      ) : !data?.length ? (
        <EmptyState icon={UserPlus} title="No author profile yet" description="Add the lecturer's profile: name, title, biography and photo." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {data.map((author) => (
            <li key={author.id}>
              <Card className="flex items-center gap-4">
                <Avatar name={author.name} src={author.photo?.src} size="lg" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-display text-xl text-text">{author.name}</span>
                  {author.title && <span className="text-sm text-text-muted">{author.title}</span>}
                </div>
                <Button variant="outline" size="sm" leadingIcon={<Icon icon={Pencil} size="sm" />} onClick={() => setEditing(author)}>
                  Edit
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <AuthorDialog
          author={editing === "new" ? undefined : (data?.find((a) => a.id === editing.id) ?? editing)}
          onClose={() => setEditing(null)}
          onCreated={(author) => setEditing(author)}
        />
      )}
    </div>
  );
}

function AuthorDialog({ author, onClose, onCreated }: { author?: AdminAuthor; onClose: () => void; onCreated: (author: AdminAuthor) => void }) {
  const [create, createState] = useCreateAuthorMutation();
  const [update, updateState] = useUpdateAuthorMutation();
  const [remove, removeState] = useDeleteAuthorMutation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { toast } = useToast();
  const form = useForm<AuthorValues>({ resolver: zodResolver(authorSchema), defaultValues: valuesFrom(author) });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (author) {
        const saved = await update({ id: author.id, author: toInput(values) }).unwrap();
        form.reset(valuesFrom(saved));
        toast({ title: "Author saved", tone: "success" });
        onClose();
      } else {
        const saved = await create(toInput(values)).unwrap();
        toast({ title: "Author added", description: "Now add a photo.", tone: "success" });
        onCreated(saved);
      }
    } catch (error) {
      toast({ title: errorMessage(error), tone: "danger" });
    }
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={author ? `Edit ${author.name}` : "Add author"}
      size="lg"
      footer={
        <>
          {author && (
            <Button variant="ghost" className="mr-auto text-danger" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="author-form" isLoading={createState.isLoading || updateState.isLoading}>
            {author ? "Save" : "Add author"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {author && <AuthorPhoto author={author} />}
        <form id="author-form" onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Name" required error={errors.name?.message}>
              <Input {...form.register("name")} autoComplete="off" placeholder="e.g. Prof. Ada Okafor" />
            </FormField>
            <FormField label="Title" error={errors.title?.message}>
              <Input {...form.register("title")} placeholder="e.g. Professor of Mechanical Engineering" />
            </FormField>
          </div>
          <FormField label="Affiliations" hint="One per line, e.g. department and university." error={errors.affiliations?.message}>
            <Textarea rows={3} {...form.register("affiliations")} />
          </FormField>
          <Controller
            control={form.control}
            name="bioMarkdown"
            render={({ field }) => (
              <MarkdownField label="Biography" value={field.value} onChange={field.onChange} maxLength={20_000} rows={8} hint="Research areas, teaching, industry work. Markdown works." />
            )}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            {LINK_FIELDS.map(({ name, label }) => (
              <FormField key={name} label={label} error={errors[name]?.message}>
                <Input type="url" inputMode="url" {...form.register(name)} placeholder="https://" />
              </FormField>
            ))}
          </div>
        </form>
      </div>
      {author && (
        <ConfirmDialog
          open={confirmDelete}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() =>
            void remove(author.id)
              .unwrap()
              .then(() => {
                toast({ title: "Author deleted", tone: "success" });
                onClose();
              })
              .catch((error: unknown) => toast({ title: errorMessage(error), tone: "danger" }))
              .finally(() => setConfirmDelete(false))
          }
          title={`Delete ${author.name}?`}
          description="Only possible when no book lists this author."
          confirmLabel="Delete"
          tone="danger"
          isConfirming={removeState.isLoading}
        />
      )}
    </Modal>
  );
}

function AuthorPhoto({ author }: { author: AdminAuthor }) {
  const { upload, cancel, progress } = useUpload("author-photo", author.id);
  const [attach, attachState] = useAuthorPhotoMutation();
  const { toast } = useToast();

  const choose = async (file: File) => {
    try {
      const asset = await upload(file);
      if (!asset) return;
      await attach({ id: author.id, publicId: asset.public_id }).unwrap();
      toast({ title: "Photo updated", tone: "success" });
    } catch (error) {
      toast({ title: "The photo wasn't saved", description: errorMessage(error, (error as Error).message), tone: "danger" });
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <Avatar name={author.name} src={author.photo?.src} size="xl" />
      <FileDrop
        className="flex-1 py-5"
        accept="image/jpeg,image/png,image/webp"
        title={author.photo ? "Replace the photo" : "Add a photo"}
        hint="A portrait, at least 400×400px. JPG, PNG or WebP."
        onFile={(file) => void choose(file)}
        progress={progress}
        progressLabel="Uploading photo"
        onCancel={cancel}
        disabled={attachState.isLoading}
      />
    </div>
  );
}
