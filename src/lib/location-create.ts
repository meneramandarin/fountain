import { row } from "@/lib/db";
import { geocodeLocationInput, hasUsableCoordinates, type GeocodeLocationInput } from "@/lib/geocoding";

export type CreateLocationInput = GeocodeLocationInput & {
  org_id?: number | string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  rating?: number | string | null;
  review_count?: number | string | null;
  dedup_key?: string | null;
  data_origin?: string | null;
  owner_account_id?: string | null;
  verification_status?: string | null;
};

export async function createLocationWithGeocode(location: CreateLocationInput, actorId?: string | null) {
  const prepared = { ...location };
  const latitude = numericCoordinate(prepared.latitude);
  const longitude = numericCoordinate(prepared.longitude);

  if (!hasUsableCoordinates(latitude, longitude)) {
    const geocode = await geocodeLocationInput(prepared);
    if (!geocode.needs_review && hasUsableCoordinates(geocode.latitude, geocode.longitude)) {
      prepared.latitude = geocode.latitude;
      prepared.longitude = geocode.longitude;
    } else {
      delete prepared.latitude;
      delete prepared.longitude;
    }
  }

  const created = await row<{ id: number }>(
    "SELECT create_location(?::jsonb, ?::uuid) AS id",
    [JSON.stringify(prepared), actorId || null],
  );
  if (!created) {
    throw new Error("create_location did not return an id.");
  }
  return created.id;
}

function numericCoordinate(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
