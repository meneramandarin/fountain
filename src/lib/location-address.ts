type LocationAddressParts = {
  address?: string | null;
  locality?: string | null;
  region?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
};

const COUNTRY_ALIASES: Record<string, string[]> = {
  AU: ["Australia"],
  CA: ["Canada"],
  GB: ["Great Britain", "UK", "United Kingdom"],
  US: ["USA", "United States", "United States of America"],
};

export function formatLocationAddress(parts: LocationAddressParts) {
  const address = clean(parts.address);
  if (!address) return null;

  const locality = clean(parts.locality);
  const region = clean(parts.region);
  const postalCode = clean(parts.postalCode);
  const countryCode = clean(parts.countryCode)?.toLocaleUpperCase("en-US") || null;
  const countryName = clean(parts.countryName);
  const addressParts = address.split(",").map(clean).filter((part): part is string => Boolean(part));

  if (!locality || addressParts.length < 4) {
    return addressParts.join(", ");
  }

  const allowedSuffixParts = structuredAddressValues({
    locality,
    region,
    postalCode,
    countryCode,
    countryName,
  });
  const localityKey = normalize(locality);

  for (let index = addressParts.length - 2; index > 0; index -= 1) {
    const prefix = addressParts.slice(0, index);
    const suffix = addressParts.slice(index);
    const prefixKey = normalize(prefix.join(" "));
    const suffixKeys = suffix.map(normalize);

    if (
      prefixKey.includes(localityKey)
      && suffixKeys.includes(localityKey)
      && suffixKeys.every((value) => allowedSuffixParts.has(value))
    ) {
      if (postalCode && !normalize(prefix.join(" ")).includes(normalize(postalCode))) {
        prefix.push(postalCode);
      }
      return prefix.join(", ");
    }
  }

  return addressParts.join(", ");
}

function structuredAddressValues({
  locality,
  region,
  postalCode,
  countryCode,
  countryName,
}: Required<Pick<LocationAddressParts, "locality">> & Omit<LocationAddressParts, "address" | "locality">) {
  const individual = [
    locality,
    region,
    postalCode,
    countryCode,
    countryName,
    ...(countryCode ? COUNTRY_ALIASES[countryCode.toLocaleUpperCase("en-US")] || [] : []),
  ].map(normalize).filter(Boolean);
  const combined = [
    [region, postalCode],
    [locality, region],
    [locality, postalCode],
    [locality, region, postalCode],
  ].map((values) => normalize(values.filter(Boolean).join(" "))).filter(Boolean);

  return new Set([...individual, ...combined]);
}

function clean(value: string | null | undefined) {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function normalize(value: string | null | undefined) {
  return (value || "")
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "");
}
