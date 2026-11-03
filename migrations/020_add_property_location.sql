-- Where a property is, found once from its address and kept, so a route never has to ask a map service twice.
-- geocode_status: pending means not looked up yet (or the address changed), ok means latitude and longitude are
-- set, failed means the map services answered but found nothing usable, so staff should fix the address.
-- A lookup that errors (network, quota) leaves the property pending so it is tried again.
ALTER TABLE properties
    ADD COLUMN latitude DOUBLE PRECISION,
    ADD COLUMN longitude DOUBLE PRECISION,
    ADD COLUMN geocode_status TEXT NOT NULL DEFAULT 'pending',
    ADD COLUMN geocoded_at TIMESTAMPTZ,
    ADD CONSTRAINT properties_geocode_status_check CHECK (geocode_status IN ('pending', 'ok', 'failed')),
    ADD CONSTRAINT properties_location_range_check CHECK (
        (latitude IS NULL AND longitude IS NULL)
        OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
    ),
    ADD CONSTRAINT properties_location_matches_status_check CHECK (
        (geocode_status = 'ok') = (latitude IS NOT NULL)
    );
