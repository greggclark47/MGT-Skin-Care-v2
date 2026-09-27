CREATE TABLE IF NOT EXISTS hub_records (
  scope TEXT NOT NULL,
  id TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY(scope,id)
);

ALTER TABLE hub_records ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE hub_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION portal_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS hub_records_touch_updated_at ON hub_records;
CREATE TRIGGER hub_records_touch_updated_at
BEFORE UPDATE ON hub_records
FOR EACH ROW EXECUTE FUNCTION portal_touch_updated_at();

CREATE INDEX IF NOT EXISTS hub_records_scope_updated_at_idx
ON hub_records(scope, updated_at DESC);
