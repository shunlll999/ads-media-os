CREATE TABLE IF NOT EXISTS projects (
  id text PRIMARY KEY,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS inventory (
  id text PRIMARY KEY,
  area text NOT NULL,
  price numeric(14,2) NOT NULL CHECK (price >= 0),
  available_from date NOT NULL,
  available_to date NOT NULL CHECK (available_to >= available_from),
  payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS inventory_area_idx ON inventory(area);
CREATE TABLE IF NOT EXISTS creatives (
  id text PRIMARY KEY,
  project_id text REFERENCES projects(id),
  kind text NOT NULL CHECK (kind IN ('image','video','web','project')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creatives_project_idx ON creatives(project_id);
CREATE TABLE IF NOT EXISTS campaigns (
  id text PRIMARY KEY,
  source_project_id text REFERENCES projects(id),
  creative_id text REFERENCES creatives(id),
  status text NOT NULL CHECK (status IN ('Planning','Pending Approval','Approved','Live','Completed')),
  start_date date NOT NULL,
  end_date date NOT NULL CHECK (end_date >= start_date),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campaigns_project_idx ON campaigns(source_project_id);
CREATE INDEX IF NOT EXISTS campaigns_creative_idx ON campaigns(creative_id);
CREATE TABLE IF NOT EXISTS campaign_inventory (
  campaign_id text REFERENCES campaigns(id) ON DELETE CASCADE,
  inventory_id text REFERENCES inventory(id),
  PRIMARY KEY (campaign_id, inventory_id)
);
CREATE INDEX IF NOT EXISTS campaign_inventory_placement_idx ON campaign_inventory(inventory_id);
CREATE TABLE IF NOT EXISTS screens (
  id text PRIMARY KEY,
  inventory_id text REFERENCES inventory(id),
  token_hash text,
  payload jsonb NOT NULL,
  last_seen_at timestamptz
);
CREATE INDEX IF NOT EXISTS screens_inventory_idx ON screens(inventory_id);
CREATE TABLE IF NOT EXISTS playlist_items (
  screen_id text REFERENCES screens(id) ON DELETE CASCADE,
  creative_id text REFERENCES creatives(id),
  campaign_id text REFERENCES campaigns(id),
  position integer NOT NULL CHECK(position >= 0),
  PRIMARY KEY (screen_id, position)
);
CREATE INDEX IF NOT EXISTS playlist_creative_idx ON playlist_items(creative_id);
CREATE INDEX IF NOT EXISTS playlist_campaign_idx ON playlist_items(campaign_id);
CREATE TABLE IF NOT EXISTS playback_sessions (
  id uuid PRIMARY KEY,
  screen_id text NOT NULL REFERENCES screens(id),
  creative_id text NOT NULL REFERENCES creatives(id),
  campaign_id text REFERENCES campaigns(id),
  mode text NOT NULL CHECK(mode IN ('preview','live')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer
);
CREATE INDEX IF NOT EXISTS playback_screen_time_idx ON playback_sessions(screen_id, started_at DESC);
CREATE INDEX IF NOT EXISTS playback_campaign_time_idx ON playback_sessions(campaign_id, started_at DESC);
CREATE INDEX IF NOT EXISTS playback_creative_idx ON playback_sessions(creative_id);
