-- Complete the official imagery pass for the remaining diagnostics imported
-- from AgingBiotech. Prosper is retired because both its direct product URL
-- and its underlying Shopify storefront now return "store unavailable".

CREATE SCHEMA IF NOT EXISTS fountain_raw;

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'complete_diagnostic_listing_images_20260810'
);

CREATE TEMP TABLE diagnostic_image_assets_20260810 (
  location_id integer NOT NULL,
  org_id integer NOT NULL,
  slug text NOT NULL,
  image_url text NOT NULL,
  blob_url text NOT NULL,
  content_sha256 text NOT NULL,
  alt text NOT NULL,
  image_kind text NOT NULL CHECK (image_kind IN ('logo', 'photo', 'text_graphic')),
  PRIMARY KEY (location_id, content_sha256)
) ON COMMIT DROP;

INSERT INTO diagnostic_image_assets_20260810 (
  location_id, org_id, slug, image_url, blob_url, content_sha256, alt, image_kind
)
VALUES
  (18243, 11091, 'klothoyears-klotho-test',
   'https://klothoyears.com/wp-content/uploads/2021/05/KlothoYearsLogo.png',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11091/klothoyears-logo-06befeafa83a44a00450.png',
   '06befeafa83a44a0045043d5f87839e89a1f6d3837d89f0e29f4be8a620b0d2b',
   'KlothoYears logo', 'logo'),
  (18243, 11091, 'klothoyears-klotho-test',
   'https://klothoyears.com/wp-content/uploads/2021/08/klothotest-600x600.jpg',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11091/klothoyears-test-kit-48a8cc0335ef59a50e99.jpg',
   '48a8cc0335ef59a50e996bf75d0d2cac8994199cf4a30655a3906f41673acdfd',
   'KlothoYears Klotho blood test kit', 'photo'),

  (18245, 11093, 'jinfiniti-agingsos-advanced-longevity-panel',
   'https://www.jinfiniti.com/wp-content/uploads/2026/07/logo-101.png',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11093/jinfiniti-logo-51f046dcf11be46918a9.png',
   '51f046dcf11be46918a96058bc16644ee46db1e661a922289645349cca1b6005',
   'Jinfiniti logo', 'logo'),
  (18245, 11093, 'jinfiniti-agingsos-advanced-longevity-panel',
   'https://www.jinfiniti.com/wp-content/uploads/2026/06/1-3.webp',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11093/jinfiniti-agingsos-kit-74e4baeb8a654cb58acb.jpg',
   '74e4baeb8a654cb58acb7924c3e85e76d528d7121106e08bd6c028ad60d4c91a',
   'Jinfiniti AgingSOS Advanced Longevity Panel test kit', 'photo'),

  (18246, 11093, 'jinfiniti-intracellular-nad-test',
   'https://www.jinfiniti.com/wp-content/uploads/2026/07/logo-101.png',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11093/jinfiniti-logo-51f046dcf11be46918a9.png',
   '51f046dcf11be46918a96058bc16644ee46db1e661a922289645349cca1b6005',
   'Jinfiniti logo', 'logo'),
  (18246, 11093, 'jinfiniti-intracellular-nad-test',
   'https://www.jinfiniti.com/wp-content/uploads/2022/11/product-intracellular-NAD-test-featured.png',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11093/jinfiniti-nad-test-kit-7cebf2107b3efb4c6365.png',
   '7cebf2107b3efb4c6365c06a79cd325f7fdf1696ab15a665e5ae7886678f15e5',
   'Jinfiniti Intracellular NAD test kit', 'photo'),

  (18247, 11094, 'c2n-diagnostics-precivityad2',
   'https://images.squarespace-cdn.com/content/v1/5f5f9aa2954456537a28b45f/c22dedbd-9de7-47fb-8790-7f5d487f0544/C2N_logo_V_One-Color_Reverse.png',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11094/c2n-diagnostics-logo-43b16e5ad31b751eb04f.png',
   '43b16e5ad31b751eb04f1de14fa5a4cddfbe887a90440c847fc2e243fd19e886',
   'C2N Diagnostics logo', 'logo'),
  (18247, 11094, 'c2n-diagnostics-precivityad2',
   'https://images.squarespace-cdn.com/content/v1/5f5f9aa2954456537a28b45f/1600204840374-DEH93Z6APTHXMP94TJKL/Viles-light.jpg',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11094/precivityad-blood-vials-2a474b32380e9cecc978.webp',
   '2a474b32380e9cecc978fb6030e9e21ffcab465e96b221c93c8ed5e2b4fa78ce',
   'Laboratory blood vials for PrecivityAD testing', 'photo'),

  (18248, 11095, 'private-md-labs-cmv-igg-antibody-test',
   'https://www.privatemdlabs.com/img/logo/pmd-logo-large.svg',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11095/private-md-labs-logo-90624701cc957e18d2d0.png',
   '90624701cc957e18d2d07a364e0c3e0d6af0ff5a5ae15c3255831546316cbdcc',
   'Private MD Labs logo', 'logo'),
  (18248, 11095, 'private-md-labs-cmv-igg-antibody-test',
   'https://www.privatemdlabs.com/img/product-images/stds_1.jpg',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11095/private-md-labs-cmv-eea72ef802acb4365359.jpg',
   'eea72ef802acb4365359097ec556064434b18d2cb12689533c496d116d2ec786',
   'Private MD Labs CMV IgG antibody test', 'photo'),

  (18249, 11095, 'private-md-labs-toxoplasma-igg-antibody-test',
   'https://www.privatemdlabs.com/img/logo/pmd-logo-large.svg',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11095/private-md-labs-logo-90624701cc957e18d2d0.png',
   '90624701cc957e18d2d07a364e0c3e0d6af0ff5a5ae15c3255831546316cbdcc',
   'Private MD Labs logo', 'logo'),
  (18249, 11095, 'private-md-labs-toxoplasma-igg-antibody-test',
   'https://www.privatemdlabs.com/img/product-images/family_or_cancer_1.jpg',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11095/private-md-labs-toxoplasma-163ac234be1c410d2740.jpg',
   '163ac234be1c410d2740f40aa18c68c23e87735936650ba860558c1e50965819',
   'Private MD Labs Toxoplasma IgG antibody test', 'photo'),

  (18250, 11096, 'grail-galleri-multi-cancer-early-detection-test',
   'https://assets.galleri.com/statics/Logos/Grail.svg',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11096/grail-logo-f3cf9086b28758b6548b.png',
   'f3cf9086b28758b6548b56ee2a1f962581a81ef093370826f3c0033b4f67fdf2',
   'GRAIL logo', 'logo'),
  (18250, 11096, 'grail-galleri-multi-cancer-early-detection-test',
   'https://assets.galleri.com/statics/Logos/Galleri-logo-180.svg',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11096/galleri-logo-1f4bfb6cb8bdab7cc586.png',
   '1f4bfb6cb8bdab7cc586ee3dd3c05d8c262d2998cd95c3ed6e2911f8604257dd',
   'Galleri multi-cancer early detection test logo', 'text_graphic'),

  (18251, 11097, 'life-length-healthtav-telomere-test',
   'https://lifelength.com/wp-content/uploads/2025/08/cropped-Life_Length.png',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11097/life-length-logo-5ea1607da6ebbe503990.png',
   '5ea1607da6ebbe503990ad6a410b1f5c19eefe422cab76504dbd864554ef9c5a',
   'Life Length logo', 'logo'),
  (18251, 11097, 'life-length-healthtav-telomere-test',
   'https://lifelength.com/wp-content/uploads/2025/09/lifelength-blue-chromosmes-telomeres.webp',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11097/life-length-telomeres-83f63bcc234e68bef4eb.webp',
   '83f63bcc234e68bef4eb7fbda3d9c5c1486dd869438b3ff8d3decffe230c7046',
   'Telomeres on chromosomes as analyzed by the Life Length HealthTAV test', 'photo'),

  (18252, 11098, 'q-bio-q-exam-redwood-city',
   'https://q.bio/assets/logos/qbio-wordmark-white.png',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11098/q-bio-logo-2719f8e421c1e786f7cf.png',
   '2719f8e421c1e786f7cf753ff1e9ca1adfcd5268764e5bc1ebbe1c4a9029d939',
   'Q Bio logo', 'logo'),
  (18252, 11098, 'q-bio-q-exam-redwood-city',
   'https://q.bio/assets/dashboard/01-overview.jpg',
   'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/11098/q-exam-dashboard-2fbd04383e5ef4130306.jpg',
   '2fbd04383e5ef413030613b947fb2162418dc3c1102c86ee5832d4cf9f84cefa',
   'Q Bio Health Dashboard produced by the Q Exam', 'photo');

DO $$
BEGIN
  IF (SELECT count(*) FROM diagnostic_image_assets_20260810) <> 18 THEN
    RAISE EXCEPTION 'Expected eighteen reviewed diagnostic image assets';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM diagnostic_image_assets_20260810 asset
    LEFT JOIN fountain.locations location ON location.id = asset.location_id
    WHERE location.id IS NULL
       OR location.org_id <> asset.org_id
       OR location.slug <> asset.slug
       OR location.status <> 'active'
       OR location.deleted_at IS NOT NULL
       OR location.owner_account_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'A diagnostic listing identity, status, or ownership drifted';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fountain.locations
    WHERE id = 18240
      AND org_id = 11088
      AND slug = 'prosper-epigenetics-kit-lifestyle-program'
      AND status = 'active'
      AND deleted_at IS NULL
      AND owner_account_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Prosper listing identity, status, or ownership drifted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM fountain_ops.field_status status
    WHERE status.entity_type = 'location'
      AND status.entity_id IN (18243, 18245, 18246, 18247, 18248, 18249, 18250, 18251, 18252)
      AND status.field = 'images'
      AND (status.locked OR status.verification IN ('human_verified', 'owner_verified'))
  ) THEN
    RAISE EXCEPTION 'A protected diagnostic image field cannot be changed';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS fountain_raw.remaining_diagnostic_images_backup_20260810 AS
SELECT *, now() AS backed_up_at
FROM fountain.images
WHERE entity_type = 'location'
  AND entity_id IN (18243, 18245, 18246, 18247, 18248, 18249, 18250, 18251, 18252);

CREATE TABLE IF NOT EXISTS fountain_raw.remaining_diagnostic_image_status_backup_20260810 AS
SELECT *, now() AS backed_up_at
FROM fountain_ops.field_status
WHERE entity_type = 'location'
  AND entity_id IN (18243, 18245, 18246, 18247, 18248, 18249, 18250, 18251, 18252)
  AND field = 'images';

CREATE TABLE IF NOT EXISTS fountain_raw.prosper_unavailable_location_backup_20260810 AS
SELECT *, now() AS backed_up_at FROM fountain.locations WHERE id = 18240;

CREATE TABLE IF NOT EXISTS fountain_raw.prosper_unavailable_offerings_backup_20260810 AS
SELECT *, now() AS backed_up_at FROM fountain.offerings WHERE location_id = 18240;

INSERT INTO fountain.images (
  id, entity_type, entity_id, image_url, blob_url, content_sha256, alt,
  source_id, status, data_origin, verification_status, image_kind
)
SELECT
  nextval(pg_get_serial_sequence('fountain.images', 'id'))::integer,
  'location', asset.location_id, asset.image_url, asset.blob_url,
  asset.content_sha256, asset.alt, NULL, 'active', 'manual',
  'human_verified', asset.image_kind
FROM diagnostic_image_assets_20260810 asset
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
  'complete_diagnostic_listing_images_20260810', now(),
  string_agg(asset.image_url, ' | ' ORDER BY asset.image_kind, asset.image_url)
  || ' | official logo and product or service imagery downloaded, visually reviewed, and stored in Vercel Blob'
FROM diagnostic_image_assets_20260810 asset
GROUP BY asset.location_id
ON CONFLICT (entity_type, entity_id, field) DO UPDATE
SET verification = EXCLUDED.verification,
    locked = EXCLUDED.locked,
    verified_by = EXCLUDED.verified_by,
    verified_at = EXCLUDED.verified_at,
    source_note = EXCLUDED.source_note;

UPDATE fountain.offerings
SET status = 'deleted',
    deleted_at = coalesce(deleted_at, now()),
    updated_at = now()
WHERE location_id = 18240
  AND status = 'active'
  AND deleted_at IS NULL;

UPDATE fountain.locations
SET status = 'deleted',
    deleted_at = coalesce(deleted_at, now()),
    updated_at = now()
WHERE id = 18240
  AND org_id = 11088
  AND slug = 'prosper-epigenetics-kit-lifestyle-program'
  AND status = 'active'
  AND deleted_at IS NULL
  AND owner_account_id IS NULL;

INSERT INTO fountain_ops.field_status (
  entity_type, entity_id, field, verification, locked,
  verified_by, verified_at, source_note
)
VALUES (
  'location', 18240, 'status', 'human_verified', false,
  'complete_diagnostic_listing_images_20260810', now(),
  'Retired 2026-08-10: the direct product URL and underlying liveprosperstrong.myshopify.com storefront both return store unavailable.'
)
ON CONFLICT (entity_type, entity_id, field) DO UPDATE
SET verification = EXCLUDED.verification,
    locked = EXCLUDED.locked,
    verified_by = EXCLUDED.verified_by,
    verified_at = EXCLUDED.verified_at,
    source_note = EXCLUDED.source_note;

SELECT fountain.refresh_search_index_for_location(location_id)
FROM (SELECT DISTINCT location_id FROM diagnostic_image_assets_20260810) target;

SELECT fountain.refresh_search_index_for_location(18240);
SELECT fountain.refresh_city_index();

DO $$
BEGIN
  IF (SELECT count(*)
      FROM diagnostic_image_assets_20260810 asset
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
        AND image.deleted_at IS NULL) <> 18 THEN
    RAISE EXCEPTION 'Diagnostic image attachment or metadata verification failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (SELECT DISTINCT location_id FROM diagnostic_image_assets_20260810) target
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
             AND image.image_kind IN ('photo', 'text_graphic')
             AND image.status = 'active'
             AND image.deleted_at IS NULL) < 1
  ) THEN
    RAISE EXCEPTION 'Every remaining diagnostic must have a logo and product or service image';
  END IF;

  IF EXISTS (
    SELECT 1 FROM fountain.locations
    WHERE id = 18240
      AND (status <> 'deleted' OR deleted_at IS NULL)
  ) OR EXISTS (
    SELECT 1 FROM fountain.offerings
    WHERE location_id = 18240
      AND status = 'active'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Unavailable Prosper listing was not fully retired';
  END IF;
END;
$$;

COMMIT;
