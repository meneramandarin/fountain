-- Add visually reviewed official logos and product imagery to the live age-test
-- listings featured by the biological-age editorial article.

CREATE SCHEMA IF NOT EXISTS fountain_raw;

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'add_age_test_listing_images_20260810'
);

CREATE TEMP TABLE age_test_image_assets_20260810 (
  location_id integer NOT NULL,
  org_id integer NOT NULL,
  slug text NOT NULL,
  image_url text NOT NULL,
  blob_url text NOT NULL,
  content_sha256 text PRIMARY KEY,
  alt text NOT NULL,
  image_kind text NOT NULL CHECK (image_kind IN ('logo', 'photo'))
) ON COMMIT DROP;

INSERT INTO age_test_image_assets_20260810 (
  location_id, org_id, slug, image_url, blob_url, content_sha256, alt, image_kind
)
VALUES
  (18237, 11085, 'elysium-index-biological-age-test',
   'https://www.elysiumhealth.com/cdn/shop/files/elysium-wordmark.svg?v=1724693675',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11085/elysium-logo-0928014d6a47974cb732.png',
   '0928014d6a47974cb73223d706572cff8c1c35ac368ed5a5de640546d98eea02',
   'Elysium Health logo', 'logo'),
  (18237, 11085, 'elysium-index-biological-age-test',
   'https://www.elysiumhealth.com/cdn/shop/files/Frame253.jpg?v=1762189834',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11085/elysium-index-kit-0c8e03d54858ab1153b1.jpg',
   '0c8e03d54858ab1153b1b3694d928a109a41712ccd96c00375e000242250e7cc',
   'Elysium Health Index biological age test kit', 'photo'),

  (18238, 11086, 'mydnage-blood-biological-age-test',
   'https://www.mydnage.com/_next/static/image/public/logos/logo-colored.53f72f29cd621fc115aa78fdfdfb700a.svg',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11086/mydnage-logo-ae5bafb0f1b999b78b7e.png',
   'ae5bafb0f1b999b78b7eca2a10dddfee399d4c3890c5570726194a201ff75469',
   'myDNAge logo', 'logo'),
  (18238, 11086, 'mydnage-blood-biological-age-test',
   'https://images.ctfassets.net/6exc86ujxvhg/13RfXBLn1ruZxFKSxvcrpn/c31d2e3ca63a9fd4646ffa8b00f2cd87/Layer_1.jpg',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11086/mydnage-blood-kit-fb3daebdfb9eb63c715c.jpg',
   'fb3daebdfb9eb63c715c8ce5bf5a9d9ec3ea5a58435a66c8d4044cb9eaa3ee88',
   'myDNAge blood biological age test kit', 'photo'),

  (1387, 894, 'trudiagnostic',
   'https://shop.trudiagnostic.com/cdn/shop/files/Logo_With_Tagline_On_Light.svg?v=1723655696&width=900',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/894/trudiagnostic-logo-3ccb326a34266f59684d.png',
   '3ccb326a34266f59684deb582f3edf7b2ded6a27eeaf3a08ab2428aede4b250f',
   'TruDiagnostic logo', 'logo'),
  (1387, 894, 'trudiagnostic',
   'https://shop.trudiagnostic.com/cdn/shop/files/TruAge_Box_Packaging_Render.avif?v=1786379321&width=1080',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/894/trudiagnostic-truage-kit-106b20973cf03303406a.jpg',
   '106b20973cf03303406a018a4be03b6feb2c842909e1d3b2f85eee2c68902cdb',
   'TruDiagnostic TruAge biological age test kit', 'photo'),

  (18239, 11087, 'trume-labs-truage-explorer',
   'https://shop.trumelabs.com/cdn/shop/files/trume-labs_1445x.svg?v=1730753241',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11087/trume-labs-logo-daecc5892d3207f9db15.png',
   'daecc5892d3207f9db156dcfda7ac7874d991f17b3e3f713ac780b11b80141e4',
   'TruMe Labs logo', 'logo'),
  (18239, 11087, 'trume-labs-truage-explorer',
   'https://shop.trumelabs.com/cdn/shop/files/AgeTest-Mockup_1445x.jpg?v=1712351800',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11087/trume-biological-age-kit-89de553b3405861409a4.jpg',
   '89de553b3405861409a4184e2b469ba94111014999adba00a5669be3d9179a2f',
   'TruMe Labs biological age DNA test kit', 'photo'),

  (18241, 11089, 'agemeter-functional-biological-age-platform',
   'https://agemeter.com/cdn/shop/files/AGEMETER_Logo_4_with_Registration.png?v=1762144711&width=1200',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11089/agemeter-logo-ba2c88394840f5b8f418.png',
   'ba2c88394840f5b8f418d97d1e008bde33eb71ecd485eab5c3338f3ccc15c0df',
   'AgeMeter logo', 'logo'),
  (18241, 11089, 'agemeter-functional-biological-age-platform',
   'https://agemeter.com/cdn/shop/files/AgeMeterInStand1920x1080.jpg?v=1760393937',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11089/agemeter-system-b8773b8fb6f276446688.jpg',
   'b8773b8fb6f2764466889e94913a8735e56cd4b8b7811c7cfe96bb85294b32e2',
   'AgeMeter functional biological age assessment system', 'photo'),

  (18242, 11090, 'glycanage-biological-age-test',
   'https://glycanage.com/images/GlycanAge.svg',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11090/glycanage-logo-ddd81bf00c6c3960840d.png',
   'ddd81bf00c6c3960840dcdb3642fe2fbb076f08da33c3a6de39eef2cfeef6a4b',
   'GlycanAge logo', 'logo'),
  (18242, 11090, 'glycanage-biological-age-test',
   'https://glycanage.com/images/web4/home/pricing-main.png',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11090/glycanage-kit-5d9b831f67c1243bf64e.jpg',
   '5d9b831f67c1243bf64efc16342950a63bfa457f4b69b10a1cde34dc53e1a256',
   'GlycanAge at-home biological age test kit', 'photo'),

  (18244, 11092, 'edifice-health-iage-inflammatory-age-test',
   'https://edificehealthstore.com/cdn/shop/files/edifice-logo-footer.png?v=1763479371&width=1200',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11092/edifice-health-logo-03280148e60aa5f68780.png',
   '03280148e60aa5f687804accfdcedf8784851ffa9a44ad8d585466603b70d233',
   'Edifice Health logo', 'logo'),
  (18244, 11092, 'edifice-health-iage-inflammatory-age-test',
   'https://cdn.shopify.com/s/files/1/0660/1542/8656/files/baseline.png?v=1777081440',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11092/edifice-iage-kit-b9b75578ad87acb6c72d.png',
   'b9b75578ad87acb6c72d79564eb33acd44cfc7907510b0601b68db73b853e2b3',
   'Edifice Health iAge inflammatory age test kit', 'photo');

DO $$
BEGIN
  IF (SELECT count(*) FROM age_test_image_assets_20260810) <> 14 THEN
    RAISE EXCEPTION 'Expected fourteen reviewed age-test image assets';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM age_test_image_assets_20260810 asset
    LEFT JOIN fountain.locations location ON location.id = asset.location_id
    WHERE location.id IS NULL
       OR location.org_id <> asset.org_id
       OR location.slug <> asset.slug
       OR location.status <> 'active'
       OR location.deleted_at IS NOT NULL
       OR location.owner_account_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'An age-test listing identity, status, or ownership drifted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM fountain_ops.field_status status
    WHERE status.entity_type = 'location'
      AND status.entity_id IN (1387, 18237, 18238, 18239, 18241, 18242, 18244)
      AND status.field = 'images'
      AND (status.locked OR status.verification IN ('human_verified', 'owner_verified'))
  ) THEN
    RAISE EXCEPTION 'A protected age-test image field cannot be changed';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS fountain_raw.age_test_images_backup_20260810 AS
SELECT *, now() AS backed_up_at
FROM fountain.images
WHERE entity_type = 'location'
  AND entity_id IN (1387, 18237, 18238, 18239, 18241, 18242, 18244);

CREATE TABLE IF NOT EXISTS fountain_raw.age_test_image_field_status_backup_20260810 AS
SELECT *, now() AS backed_up_at
FROM fountain_ops.field_status
WHERE entity_type = 'location'
  AND entity_id IN (1387, 18237, 18238, 18239, 18241, 18242, 18244)
  AND field = 'images';

INSERT INTO fountain.images (
  id, entity_type, entity_id, image_url, blob_url, content_sha256, alt,
  source_id, status, data_origin, verification_status, image_kind
)
SELECT
  nextval(pg_get_serial_sequence('fountain.images', 'id'))::integer,
  'location', asset.location_id, asset.image_url, asset.blob_url,
  asset.content_sha256, asset.alt, NULL, 'active', 'manual',
  'human_verified', asset.image_kind
FROM age_test_image_assets_20260810 asset
WHERE NOT EXISTS (
  SELECT 1
  FROM fountain.images existing
  WHERE existing.entity_type = 'location'
    AND existing.entity_id = asset.location_id
    AND existing.content_sha256 = asset.content_sha256
    AND existing.status = 'active'
    AND existing.deleted_at IS NULL
);

INSERT INTO fountain_ops.field_status (
  entity_type, entity_id, field, verification, locked,
  verified_by, verified_at, source_note
)
SELECT
  'location', asset.location_id, 'images', 'human_verified', false,
  'add_age_test_listing_images_20260810', now(),
  string_agg(asset.image_url, ' | ' ORDER BY asset.image_kind, asset.image_url)
  || ' | official logo and product imagery downloaded, visually reviewed, and stored in Vercel Blob'
FROM age_test_image_assets_20260810 asset
GROUP BY asset.location_id
ON CONFLICT (entity_type, entity_id, field) DO UPDATE
SET verification = EXCLUDED.verification,
    locked = EXCLUDED.locked,
    verified_by = EXCLUDED.verified_by,
    verified_at = EXCLUDED.verified_at,
    source_note = EXCLUDED.source_note;

SELECT fountain.refresh_search_index_for_location(location_id)
FROM (SELECT DISTINCT location_id FROM age_test_image_assets_20260810) target;

SELECT fountain.refresh_city_index();

DO $$
BEGIN
  IF (SELECT count(*)
      FROM age_test_image_assets_20260810 asset
      JOIN fountain.images image
        ON image.entity_type = 'location'
       AND image.entity_id = asset.location_id
       AND image.content_sha256 = asset.content_sha256
      WHERE image.blob_url = asset.blob_url
        AND image.image_url = asset.image_url
        AND image.alt = asset.alt
        AND image.image_kind = asset.image_kind
        AND image.verification_status = 'human_verified'
        AND image.status = 'active'
        AND image.deleted_at IS NULL) <> 14 THEN
    RAISE EXCEPTION 'Age-test image attachment or metadata verification failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (SELECT DISTINCT location_id FROM age_test_image_assets_20260810) target
    WHERE (SELECT count(*)
           FROM fountain.images image
           WHERE image.entity_type = 'location'
             AND image.entity_id = target.location_id
             AND image.image_kind = 'logo'
             AND image.status = 'active'
             AND image.deleted_at IS NULL) < 1
       OR (SELECT count(*)
           FROM fountain.images image
           WHERE image.entity_type = 'location'
             AND image.entity_id = target.location_id
             AND image.image_kind = 'photo'
             AND image.status = 'active'
             AND image.deleted_at IS NULL) < 1
  ) THEN
    RAISE EXCEPTION 'Every featured age test must have a logo and product photo';
  END IF;
END;
$$;

COMMIT;
