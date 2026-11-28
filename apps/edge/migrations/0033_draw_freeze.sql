-- Lucky Draw fairness (P1 audit H1): the entry list closes at the draw time (automatic) or at the press of Start (manual), and a removal after that moment is ignored.
-- freeze_ms = the press (manual); target_round = the beacon round chosen at the press (always later than the press); seat.blk_ms = when a seat was blocked. test/migrations.test.ts keeps this identical to DRAW_FREEZE_SCHEMA in src/draw.ts.
ALTER TABLE draw ADD COLUMN freeze_ms INTEGER;
ALTER TABLE draw ADD COLUMN target_round INTEGER;
ALTER TABLE seat ADD COLUMN blk_ms INTEGER;
