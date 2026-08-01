"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";

export function ListingShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  async function shareListing() {
    const url = window.location.href;

    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }

      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      className="listing-hero-share"
      type="button"
      aria-label={copied ? "Link copied" : `Share ${title}`}
      title={copied ? "Link copied" : "Share"}
      onClick={shareListing}
    >
      <Share2 size={20} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}
