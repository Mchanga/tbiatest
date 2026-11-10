UPDATE business_profiles
SET verification_status = CASE verification_status
  WHEN 'unverified' THEN 'pending'
  WHEN 'verified' THEN 'approved'
  ELSE verification_status
END;

ALTER TABLE business_profiles
  DROP CONSTRAINT business_profiles_verification_status_check;

ALTER TABLE business_profiles
  ADD CONSTRAINT business_profiles_verification_status_check
  CHECK (verification_status IN ('pending', 'under_review', 'approved', 'rejected', 'suspended'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_business_profiles_registration_number
  ON business_profiles (registration_number)
  WHERE registration_number IS NOT NULL AND BTRIM(registration_number) <> '';