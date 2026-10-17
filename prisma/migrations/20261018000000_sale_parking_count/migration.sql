-- A sale can have more than one car park, and the parking can be included in the agreement value.
--   carParkingCount     how many car parks were sold (carParking stays as "count > 0")
--   carParkingIncluded  true when the parking is part of the agreement value (no separate parking charge or demand)
ALTER TABLE "sales" ADD COLUMN "carParkingCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sales" ADD COLUMN "carParkingIncluded" BOOLEAN NOT NULL DEFAULT false;
-- Project setting: car parking is either charged separately (default) or included in the agreement value
ALTER TABLE "projects" ADD COLUMN "carParkingIncluded" BOOLEAN NOT NULL DEFAULT false;
UPDATE "sales" SET "carParkingCount" = 1 WHERE "carParking" = true;
