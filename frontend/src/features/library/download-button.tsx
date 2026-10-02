"use client";

import { Download } from "lucide-react";
import { Button, Icon, useToast, type ButtonProps } from "@/components/ui";
import { errorMessage } from "@/lib/api/errors";
import { useDownloadLinkMutation } from "@/lib/api/library-api";

/**
 * Downloads the buyer's personal PDF through a 5-minute link (PRODUCT_RULES §8). The link
 * answers with "save as", so the page stays where it is. While the copy is still being made, or
 * after 10 downloads in an hour, a toast explains instead.
 */
export function DownloadButton({
  bookId,
  title,
  children,
  ...props
}: { bookId: string; title: string } & Omit<ButtonProps, "onClick">) {
  const [download, state] = useDownloadLinkMutation();
  const { toast } = useToast();

  const start = async () => {
    try {
      const link = await download(bookId).unwrap();
      if (link.status === "preparing") {
        toast({
          title: "Your copy is almost ready",
          description: "We’re adding your name to every page. Try the download again in a minute.",
        });
        return;
      }
      window.location.assign(link.url);
      toast({ title: "Downloading", description: `${title} (PDF) is on its way to your device.`, tone: "success" });
    } catch (error) {
      toast({ title: "The download didn’t start", description: errorMessage(error), tone: "danger" });
    }
  };

  return (
    <Button
      leadingIcon={<Icon icon={Download} size="sm" />}
      isLoading={state.isLoading}
      loadingLabel="Preparing the download"
      onClick={() => void start()}
      {...props}
    >
      {children ?? "Download PDF"}
    </Button>
  );
}
