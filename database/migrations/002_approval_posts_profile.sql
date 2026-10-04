-- 002: account approval, post tags/feed, multiple social links, date of death

-- ---- account approval ------------------------------------------------------
-- Existing accounts and admin-created accounts are APPROVED. Public sign-ups are inserted as PENDING by the API.
ALTER TABLE users
  ADD COLUMN approval_status text NOT NULL DEFAULT 'APPROVED' CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED')),
  ADD COLUMN approved_by uuid REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN approved_at timestamptz;
CREATE INDEX users_pending_idx ON users (created_at) WHERE approval_status = 'PENDING';

-- ---- posts (formerly "notes") -----------------------------------------------
-- Tags are stored lower-case so tag search is exact and cheap.
UPDATE posts SET tags = COALESCE((SELECT array_agg(DISTINCT lower(btrim(t))) FROM unnest(tags) AS t WHERE btrim(t) <> ''), '{}');
CREATE INDEX posts_tags_idx    ON posts USING gin (tags);
CREATE INDEX posts_feed_idx    ON posts (created_at DESC, id DESC) WHERE status = 'published';
CREATE INDEX posts_author_idx  ON posts (created_by);
CREATE INDEX posts_title_trgm_idx ON posts USING gin (title gin_trgm_ops);

-- ---- profiles: several accounts per social network, date of death -----------
ALTER TABLE profiles ADD COLUMN social_links jsonb NOT NULL DEFAULT '{}'::jsonb;
UPDATE profiles SET social_links = jsonb_strip_nulls(jsonb_build_object(
  'facebook',  CASE WHEN btrim(coalesce(facebook, ''))  <> '' THEN jsonb_build_array(btrim(facebook))  END,
  'instagram', CASE WHEN btrim(coalesce(instagram, '')) <> '' THEN jsonb_build_array(btrim(instagram)) END,
  'tiktok',    CASE WHEN btrim(coalesce(tiktok, ''))    <> '' THEN jsonb_build_array(btrim(tiktok))    END));
ALTER TABLE profiles DROP COLUMN facebook, DROP COLUMN instagram, DROP COLUMN tiktok;

ALTER TABLE profiles ADD COLUMN date_of_death date;
ALTER TABLE profiles ADD CONSTRAINT profiles_death_after_birth CHECK (dob IS NULL OR date_of_death IS NULL OR date_of_death >= dob);
