ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferred_language varchar(2) NOT NULL DEFAULT 'en';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'users'::regclass
      AND conname = 'users_preferred_language_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_preferred_language_check
      CHECK (preferred_language IN ('en', 'sw'));
  END IF;
END $$;

ALTER TABLE cms_pages
  ADD COLUMN IF NOT EXISTS translations jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'cms_pages'::regclass
      AND conname = 'cms_pages_translations_object_check'
  ) THEN
    ALTER TABLE cms_pages
      ADD CONSTRAINT cms_pages_translations_object_check
      CHECK (jsonb_typeof(translations) = 'object');
  END IF;
END $$;
