CREATE TABLE fd_teams (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE
);
CREATE TABLE fd_users (
  id SERIAL PRIMARY KEY,
  identity_id UUID UNIQUE,
  email VARCHAR(254) NOT NULL UNIQUE CHECK (email = lower(email)),
  name VARCHAR(150) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('super_admin','admin','manager','sales','support')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  teams INTEGER[] NOT NULL DEFAULT '{}',
  created_by INTEGER REFERENCES fd_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE fd_records (
  id UUID PRIMARY KEY,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('lead','ticket','contact','company','deal','task','communication','note','document','product','invoice')),
  name VARCHAR(160) NOT NULL,
  email VARCHAR(254) NOT NULL DEFAULT '',
  phone VARCHAR(40) NOT NULL DEFAULT '',
  company VARCHAR(160) NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  source VARCHAR(200) NOT NULL DEFAULT '',
  status VARCHAR(40) NOT NULL DEFAULT 'New',
  details JSONB NOT NULL DEFAULT '{}',
  owner INTEGER REFERENCES fd_users(id) ON DELETE SET NULL,
  team INTEGER REFERENCES fd_teams(id) ON DELETE SET NULL,
  assigned_to INTEGER[] NOT NULL DEFAULT '{}',
  support_access BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX fd_records_kind_created ON fd_records(kind, created_at DESC);
CREATE INDEX fd_records_team ON fd_records(team);
CREATE INDEX fd_records_owner ON fd_records(owner);
CREATE INDEX fd_records_assigned ON fd_records USING gin(assigned_to);
CREATE TABLE fd_audit (
  id BIGSERIAL PRIMARY KEY,
  actor INTEGER REFERENCES fd_users(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  target VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE fd_rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
