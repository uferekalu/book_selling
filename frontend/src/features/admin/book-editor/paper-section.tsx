"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Alert, FormField, Input, RadioGroup, Select, useToast } from "@/components/ui";
import { useUpdateBookMutation, type AdminBook } from "@/lib/api/catalog-admin-api";
import { errorMessage } from "@/lib/api/errors";
import { useReportDirty } from "./dirty";
import { EVENT_TYPE_OPTIONS, paperFromBook, paperSchema, paperUpdate, type PaperValues } from "./paper-form";
import { EditorSection } from "./section";

/**
 * Papers only (BS-34): where the paper was presented or published, and how it is offered. A paper
 * for sale needs its PDF, a free preview of its first pages and a price; a paper the author didn't
 * write (or can't sell) is "read at the publisher": the page shows its abstract and citation and
 * links there instead.
 */
export function PaperSection({ book }: { book: AdminBook }) {
  const [update, state] = useUpdateBookMutation();
  const { toast } = useToast();
  const form = useForm<PaperValues>({ resolver: zodResolver(paperSchema), defaultValues: paperFromBook(book) });
  const { errors, isDirty } = form.formState;
  const access = useWatch({ control: form.control, name: "access" });
  const published = book.status === "published";
  useReportDirty("paper", isDirty);

  useEffect(() => {
    if (!form.formState.isDirty) form.reset(paperFromBook(book));
  }, [book, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = await update({ id: book.id, changes: paperUpdate(values) }).unwrap();
      form.reset(paperFromBook(saved));
      toast({ title: "Paper details saved", tone: "success" });
    } catch (error) {
      toast({ title: errorMessage(error), tone: "danger" });
    }
  });

  return (
    <EditorSection
      id="paper"
      title="Paper details"
      description="Where the paper was presented or published. This is shown on its page and used in its citation."
      dirty={isDirty}
      saving={state.isLoading}
      onReset={() => form.reset(paperFromBook(book))}
      form="paper-form"
    >
      <form id="paper-form" onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-5">
        <Controller
          control={form.control}
          name="access"
          render={({ field }) => (
            <RadioGroup
              legend="How readers get the paper"
              variant="cards"
              value={field.value}
              onChange={field.onChange}
              options={[
                {
                  value: "sale",
                  label: "Sold here as a PDF",
                  description: "Readers see the first pages free, then buy the full paper.",
                  disabled: published && field.value !== "sale",
                },
                {
                  value: "external",
                  label: "Read at the publisher",
                  description: "For a paper you can’t sell here: its page shows the abstract and citation, and links to the publisher.",
                  disabled: published && field.value !== "external",
                },
              ]}
            />
          )}
        />
        {published && (
          <Alert tone="info">To change how readers get this paper, unpublish it first. It then goes through the publish checklist again.</Alert>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Type" error={errors.eventType?.message}>
            <Select options={[...EVENT_TYPE_OPTIONS]} {...form.register("eventType")} />
          </FormField>
          <FormField label="Location" hint="e.g. Enugu, Nigeria" error={errors.location?.message}>
            <Input {...form.register("location")} maxLength={120} />
          </FormField>
        </div>
        <FormField
          label="Presented at, or published in"
          required
          hint="The conference, workshop or journal, e.g. Nigerian Metallurgical Society Annual Conference."
          error={errors.venue?.message}
        >
          <Input {...form.register("venue")} maxLength={200} />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Publisher" hint="Who published the proceedings or journal (optional)." error={errors.publisher?.message}>
            <Input {...form.register("publisher")} maxLength={160} />
          </FormField>
          <FormField label="Pages" hint="In the proceedings, e.g. 112–124 (optional)." error={errors.pages?.message}>
            <Input {...form.register("pages")} maxLength={20} />
          </FormField>
        </div>
        <FormField label="DOI" hint="Optional, e.g. 10.1016/j.matdes.2019.01.001" error={errors.doi?.message}>
          <Input {...form.register("doi")} autoCapitalize="none" spellCheck={false} maxLength={120} />
        </FormField>
        <FormField
          label="Link to the paper on the publisher’s website"
          required={access === "external"}
          hint={access === "external" ? "Readers are sent here to read the paper." : "Optional; shown in the citation."}
          error={errors.externalUrl?.message}
        >
          <Input type="url" inputMode="url" autoCapitalize="none" spellCheck={false} placeholder="https://" {...form.register("externalUrl")} maxLength={500} />
        </FormField>
      </form>
    </EditorSection>
  );
}
