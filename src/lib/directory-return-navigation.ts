const storageKey = "fountain:directory-return";
const maxAgeMs = 60 * 60 * 1000;
const localOrigin = "https://fountain.local";

type DirectoryReturnRecord = {
  destinationPath: string;
  returnHref: string;
  savedAt: number;
};

export function rememberDirectoryReturn(destinationHref: string) {
  if (typeof window === "undefined" || window.location.pathname !== "/directory") {
    return;
  }

  try {
    const destination = new URL(destinationHref, window.location.origin);
    const record: DirectoryReturnRecord = {
      destinationPath: destination.pathname,
      returnHref: `${window.location.pathname}${window.location.search}`,
      savedAt: Date.now(),
    };
    window.sessionStorage.setItem(storageKey, JSON.stringify(record));
  } catch {
    // Navigation should still work if storage is unavailable.
  }
}

export function readDirectoryReturn(destinationPath: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return parseDirectoryReturn(
      window.sessionStorage.getItem(storageKey),
      destinationPath,
      Date.now(),
    );
  } catch {
    return null;
  }
}

export function parseDirectoryReturn(
  raw: string | null,
  destinationPath: string,
  now: number,
) {
  if (!raw) {
    return null;
  }

  try {
    const record = JSON.parse(raw) as Partial<DirectoryReturnRecord>;
    if (
      record.destinationPath !== destinationPath
      || typeof record.returnHref !== "string"
      || typeof record.savedAt !== "number"
      || now - record.savedAt < 0
      || now - record.savedAt > maxAgeMs
    ) {
      return null;
    }

    const returnUrl = new URL(record.returnHref, localOrigin);
    if (returnUrl.origin !== localOrigin || returnUrl.pathname !== "/directory") {
      return null;
    }
    return `${returnUrl.pathname}${returnUrl.search}`;
  } catch {
    return null;
  }
}
