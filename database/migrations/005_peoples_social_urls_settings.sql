-- 005: Profiles -> Peoples, social links as a flat URL list, card-field setting, favicon cache, lower-case tags
--
-- "Profile" stays a generic word (a people profile or an organization profile); the table of individuals is now `peoples`.
-- Data, ids and relationships are untouched: this migration only renames objects and reshapes social_links.

-- ---- renames ---------------------------------------------------------------------
ALTER TABLE profiles RENAME TO peoples;
ALTER TABLE profile_photos RENAME TO people_photos;
ALTER TABLE people_photos RENAME COLUMN profile_id TO people_id;
ALTER TABLE posts RENAME COLUMN profile_id TO people_id;
ALTER TABLE caller_contacts RENAME COLUMN profile_id TO people_id;
ALTER TABLE users RENAME COLUMN profile_id TO people_id;
ALTER TABLE memberships RENAME COLUMN human_id TO people_id;

-- every index / constraint / trigger / sequence that still carries the old words gets the new name
CREATE FUNCTION pg_temp.newname(n text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(n,
    'profile_photos', 'people_photos', 'g'), 'profiles', 'peoples', 'g'), 'profile_id', 'people_id', 'g'), 'human_id', 'people_id', 'g'), 'profile', 'people', 'g')
$$;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'i' AND (c.relname ~ 'profile|human') LOOP
    EXECUTE format('ALTER INDEX %I RENAME TO %I', r.relname, pg_temp.newname(r.relname));       -- renames a backing constraint too
  END LOOP;
  FOR r IN SELECT con.conname, con.conrelid::regclass::text AS tbl FROM pg_constraint con JOIN pg_namespace n ON n.oid = con.connamespace
            WHERE n.nspname = 'public' AND con.contype IN ('c', 'f') AND (con.conname ~ 'profile|human') LOOP
    EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I', r.tbl, r.conname, pg_temp.newname(r.conname));
  END LOOP;
  FOR r IN SELECT t.tgname, t.tgrelid::regclass::text AS tbl FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND NOT t.tgisinternal AND t.tgname ~ 'profile' LOOP
    EXECUTE format('ALTER TRIGGER %I ON %s RENAME TO %I', r.tgname, r.tbl, pg_temp.newname(r.tgname));
  END LOOP;
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'S' AND c.relname ~ 'profile' LOOP
    EXECUTE format('ALTER SEQUENCE %I RENAME TO %I', r.relname, pg_temp.newname(r.relname));
  END LOOP;
END $$;

-- audit trail wording follows the rename
UPDATE audit_logs SET action = regexp_replace(action, '^profile\.', 'people.') WHERE action LIKE 'profile.%';
UPDATE audit_logs SET entity_type = 'people' WHERE entity_type = 'profile';

-- ---- social links: one flat list of URLs (was { facebook: [], instagram: [], tiktok: [] }) --------------
CREATE FUNCTION pg_temp.social_urls(j jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN jsonb_typeof(j) = 'array' THEN j
    ELSE COALESCE((
      SELECT jsonb_agg(u) FROM (
        SELECT CASE WHEN v ~* '^https?://' THEN btrim(v)
                    ELSE (CASE e.key WHEN 'facebook' THEN 'https://facebook.com/' WHEN 'instagram' THEN 'https://instagram.com/' ELSE 'https://tiktok.com/@' END)
                         || regexp_replace(regexp_replace(btrim(v), '^@', ''), '[^A-Za-z0-9_.\-/?=&]', '', 'g') END AS u
          FROM jsonb_each(CASE WHEN jsonb_typeof(j) = 'object' THEN j ELSE '{}'::jsonb END) AS e(key, value)
          CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(e.value) = 'array' THEN e.value ELSE '[]'::jsonb END) AS v
         WHERE btrim(v) <> ''
         ORDER BY CASE e.key WHEN 'facebook' THEN 1 WHEN 'instagram' THEN 2 ELSE 3 END
      ) s WHERE length(u) <= 255), '[]'::jsonb)
  END
$$;
ALTER TABLE peoples       ALTER COLUMN social_links DROP DEFAULT;
ALTER TABLE organizations ALTER COLUMN social_links DROP DEFAULT;
UPDATE peoples       SET social_links = pg_temp.social_urls(social_links);
UPDATE organizations SET social_links = pg_temp.social_urls(social_links);
ALTER TABLE peoples       ALTER COLUMN social_links SET DEFAULT '[]'::jsonb;
ALTER TABLE organizations ALTER COLUMN social_links SET DEFAULT '[]'::jsonb;
ALTER TABLE peoples       ADD CONSTRAINT peoples_social_links_array       CHECK (jsonb_typeof(social_links) = 'array');
ALTER TABLE organizations ADD CONSTRAINT organizations_social_links_array CHECK (jsonb_typeof(social_links) = 'array');

-- ---- which fields appear on cards (admin setting) ---------------------------------------------------------
INSERT INTO site_settings (key, value) VALUES
  ('card_fields', '{"people": ["nickname", "occupation", "district"], "organization": ["district", "foundedOn"]}')
ON CONFLICT (key) DO NOTHING;

-- ---- favicon cache for social-media icons (fetched server-side so viewers never contact third parties) -----
CREATE TABLE favicons (
  domain       text PRIMARY KEY,
  content_type text,
  data         bytea,
  found        boolean NOT NULL,
  fetched_at   timestamptz NOT NULL DEFAULT now()
);

-- ---- tags are stored lower-case without '#', so "#BD" and "bd" are the same tag everywhere ---------------------------------
UPDATE peoples       SET tags = COALESCE((SELECT array_agg(DISTINCT lower(regexp_replace(btrim(t), '^#+', ''))) FROM unnest(tags) t WHERE regexp_replace(btrim(t), '^#+', '') <> ''), '{}') WHERE cardinality(tags) > 0;
UPDATE organizations SET tags = COALESCE((SELECT array_agg(DISTINCT lower(regexp_replace(btrim(t), '^#+', ''))) FROM unnest(tags) t WHERE regexp_replace(btrim(t), '^#+', '') <> ''), '{}') WHERE cardinality(tags) > 0;
CREATE INDEX IF NOT EXISTS peoples_tags_idx ON peoples USING gin (tags);
