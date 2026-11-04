-- The city a property in this area is in, used to find its address on a map when the property has no city of its
-- own. Imported sheets often give a street and an area but no city. A property's own city always wins.
ALTER TABLE subdivisions ADD COLUMN city TEXT CHECK (city IS NULL OR (city <> '' AND char_length(city) <= 100));
