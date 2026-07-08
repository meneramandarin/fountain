"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";

type EditorialShareButtonProps = {
  title: string;
  url: string;
};

export function EditorialShareButton({ title, url }: EditorialShareButtonProps) {
  const [copied, setCopied] = useState(false);

  async function shareArticle() {
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
    <button className="dateline-share" onClick={shareArticle} type="button">
      <span>{copied ? "Copied" : "Share"}</span>
      <Share2 aria-hidden="true" size={14} strokeWidth={1.8} />
    </button>
  );
}
