-- FacePass MVP Database Schema
-- Run this migration against your Supabase Postgres instance

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";  -- pgvector for face embeddings

-- ============================================================
-- COMPANIES (multi-tenant)
-- ============================================================
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,  -- URL-safe identifier
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SITES (work locations with geofence)
-- ============================================================
CREATE TABLE sites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    radius_meters DOUBLE PRECISION NOT NULL DEFAULT 100.0,  -- Circular geofence radius
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sites_company ON sites(company_id);

-- ============================================================
-- EMPLOYEES
-- ============================================================
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    auth_user_id UUID UNIQUE,  -- Links to Supabase Auth user
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    employee_code TEXT,  -- Internal employee ID
    is_enrolled BOOLEAN NOT NULL DEFAULT FALSE,  -- Has face embeddings
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_employees_company ON employees(company_id);
CREATE INDEX idx_employees_auth_user ON employees(auth_user_id);

-- ============================================================
-- FACE EMBEDDINGS (ArcFace 512D vectors)
-- ============================================================
CREATE TABLE embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    embedding vector(512) NOT NULL,  -- ArcFace 512-dimensional vector
    capture_angle TEXT,  -- 'front', 'left', 'right', 'up', 'down'
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_embeddings_employee ON embeddings(employee_id);

-- Create an IVFFlat index for fast similarity search
-- (Rebuild after inserting initial data with: REINDEX INDEX idx_embeddings_vector)
CREATE INDEX idx_embeddings_vector ON embeddings
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- ============================================================
-- ATTENDANCE LOGS (immutable records)
-- ============================================================
CREATE TABLE attendance_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
    
    -- Check-in/out
    check_type TEXT NOT NULL CHECK (check_type IN ('check_in', 'check_out')),
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Location data
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    geofence_distance_meters DOUBLE PRECISION,  -- Distance from site center
    
    -- Recognition scores
    face_match_confidence DOUBLE PRECISION,  -- Cosine similarity (0-1)
    liveness_score DOUBLE PRECISION,          -- Liveness check result (0-1)
    trust_score DOUBLE PRECISION,             -- Composite trust score (0-100)
    
    -- Matching info
    matched_embedding_id UUID REFERENCES embeddings(id) ON DELETE SET NULL,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'verified' CHECK (status IN ('verified', 'flagged', 'rejected', 'manual_override')),
    flag_reason TEXT,  -- Why it was flagged, if applicable
    
    -- Device info
    device_fingerprint TEXT,
    user_agent TEXT,
    
    -- Client-generated for offline idempotency
    client_uuid UUID UNIQUE,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attendance_employee ON attendance_logs(employee_id);
CREATE INDEX idx_attendance_site ON attendance_logs(site_id);
CREATE INDEX idx_attendance_checked_at ON attendance_logs(checked_at);
CREATE INDEX idx_attendance_status ON attendance_logs(status);

-- ============================================================
-- ADMIN USERS (for the Next.js dashboard)
-- ============================================================
CREATE TABLE admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_user_id UUID UNIQUE NOT NULL,  -- Links to Supabase Auth user
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'supervisor', 'viewer')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_users_company ON admin_users(company_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) Policies
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (used by FastAPI backend)
-- These policies allow the service key full access while 
-- restricting anon/authenticated access

-- Employees can read their own data
CREATE POLICY "employees_self_read" ON employees
    FOR SELECT
    USING (auth.uid() = auth_user_id);

-- Admins can read all employees in their company
CREATE POLICY "admin_read_employees" ON employees
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM admin_users
            WHERE admin_users.auth_user_id = auth.uid()
            AND admin_users.company_id = employees.company_id
        )
    );

-- Admins can read attendance logs for their company's employees
CREATE POLICY "admin_read_attendance" ON attendance_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM admin_users
            JOIN employees ON employees.id = attendance_logs.employee_id
            WHERE admin_users.auth_user_id = auth.uid()
            AND admin_users.company_id = employees.company_id
        )
    );

-- Admins can read sites in their company
CREATE POLICY "admin_read_sites" ON sites
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM admin_users
            WHERE admin_users.auth_user_id = auth.uid()
            AND admin_users.company_id = sites.company_id
        )
    );

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply auto-update triggers
CREATE TRIGGER tr_companies_updated_at
    BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_sites_updated_at
    BEFORE UPDATE ON sites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_employees_updated_at
    BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_admin_users_updated_at
    BEFORE UPDATE ON admin_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
