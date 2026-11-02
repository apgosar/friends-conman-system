-- Parking types are kept short ("Tandem", not "Tandem Parking"): a template adds its own words
UPDATE "ParkingSlot" SET "type" = btrim(regexp_replace("type", '\s+(car\s+)?parking$', '', 'i')) WHERE "type" ~* '\s(car\s+)?parking$';
