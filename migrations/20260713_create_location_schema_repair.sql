BEGIN;

-- rating and review_count were removed from fountain.locations during schema
-- streamlining, but the mutation API retained the old column list.
CREATE OR REPLACE FUNCTION fountain.create_location(
  p_location jsonb,
  p_actor_id uuid DEFAULT NULL::uuid
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  new_location_id integer;
BEGIN
  PERFORM fountain.set_mutation_actor(p_actor_id, 'admin');

  INSERT INTO fountain.locations(
    org_id,
    name,
    address,
    locality,
    region,
    postal_code,
    country_code,
    country_name,
    latitude,
    longitude,
    phone,
    email,
    website,
    dedup_key,
    data_origin,
    owner_account_id,
    verification_status
  )
  VALUES (
    NULLIF(p_location->>'org_id', '')::integer,
    NULLIF(p_location->>'name', ''),
    NULLIF(p_location->>'address', ''),
    NULLIF(p_location->>'locality', ''),
    NULLIF(p_location->>'region', ''),
    NULLIF(p_location->>'postal_code', ''),
    NULLIF(p_location->>'country_code', ''),
    NULLIF(p_location->>'country_name', ''),
    NULLIF(p_location->>'latitude', '')::double precision,
    NULLIF(p_location->>'longitude', '')::double precision,
    NULLIF(p_location->>'phone', ''),
    NULLIF(p_location->>'email', ''),
    NULLIF(p_location->>'website', ''),
    NULLIF(p_location->>'dedup_key', ''),
    COALESCE(NULLIF(p_location->>'data_origin', ''), 'manual'),
    NULLIF(p_location->>'owner_account_id', '')::uuid,
    COALESCE(NULLIF(p_location->>'verification_status', ''), 'unverified')
  )
  RETURNING id INTO new_location_id;

  RETURN new_location_id;
END;
$$;

COMMIT;
