"use client";

import { useState } from "react";

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
    <button
      className="editorial-share"
      onClick={shareArticle}
      type="button"
      aria-label={copied ? "Link copied" : `Share ${title}`}
      title={copied ? "Link copied" : "Share"}
    >
      SHARE
    </button>
  );
}
