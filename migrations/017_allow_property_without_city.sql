-- A spreadsheet import can know a street and nothing else. A missing city is stored as NULL, not as made-up text,
-- so "WHERE city IS NULL" finds every property that still needs one. Properties made by hand still require a city.
ALTER TABLE properties ALTER COLUMN city DROP NOT NULL;
