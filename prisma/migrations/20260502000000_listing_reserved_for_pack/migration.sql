-- Add RESERVED_FOR_PACK to ListingStatus.
-- Mystery-pack listings reserve their pool entries while the pack is for
-- sale; pulled cards transition RESERVED_FOR_PACK -> SOLD on outcome
-- generation, and unsold pool entries return to ACTIVE when the pack
-- listing closes. Distinguishing RESERVED_FOR_PACK from RESERVED keeps
-- the floor-enforcement worker scoped (it only sweeps pack pools).
ALTER TYPE "ListingStatus" ADD VALUE IF NOT EXISTS 'RESERVED_FOR_PACK';
