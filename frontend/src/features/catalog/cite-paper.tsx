"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button, Eyebrow, Icon, useToast } from "@/components/ui";

/** The reference in APA style, ready to paste into a reading list or a paper (BS-34). */
export function CitePaper({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast({ title: "Couldn’t copy: select the text and copy it instead", tone: "danger" });
    }
  };
  return (
    <section aria-labelledby="cite-heading" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-sunken p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Eyebrow>
          <span id="cite-heading">Cite this paper</span>
        </Eyebrow>
        <Button size="sm" variant="outline" onClick={() => void copy()} leadingIcon={<Icon icon={copied ? Check : Copy} size="sm" />}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="text-sm leading-relaxed wrap-anywhere text-text select-all">{text}</p>
      <span className="sr-only" aria-live="polite">
        {copied ? "Reference copied" : ""}
      </span>
    </section>
  );
}
