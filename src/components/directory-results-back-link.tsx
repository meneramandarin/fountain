"use client";

import { useSyncExternalStore } from "react";
import { BackPillLink } from "@/components/back-pill-link";
import { readDirectoryReturn } from "@/lib/directory-return-navigation";

export function DirectoryResultsBackLink({ destinationPath }: { destinationPath: string }) {
  const returnHref = useSyncExternalStore(
    emptySubscribe,
    () => readDirectoryReturn(destinationPath),
    () => null,
  );

  if (!returnHref) {
    return null;
  }

  return (
    <BackPillLink href={returnHref} tone="light">
      Back to results
    </BackPillLink>
  );
}

function emptySubscribe() {
  return () => {};
}
