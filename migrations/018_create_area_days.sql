-- The days the company works an area (a subdivision). A customer whose property is in the area picks from these days.
-- A day is a calendar date, not a weekday rule, so one week can be skipped without an exceptions table.
-- Deleting an area removes its days. properties.subdivision_id has no ON DELETE action, so an area in use cannot be
-- deleted at all.
CREATE TABLE area_days (
    subdivision_id INTEGER NOT NULL REFERENCES subdivisions (id) ON DELETE CASCADE,
    day DATE NOT NULL,
    PRIMARY KEY (subdivision_id, day)
);
