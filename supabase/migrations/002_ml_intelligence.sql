-- ============================================================================
-- FacePass Migration 002: Advanced ML & Fraud Intelligence
-- ============================================================================

-- 1. Extend attendance_logs with ML fraud detection scores
ALTER TABLE attendance_logs
    ADD COLUMN IF NOT EXISTS spoof_score DOUBLE PRECISION DEFAULT 1.0,
    ADD COLUMN IF NOT EXISTS anomaly_score DOUBLE PRECISION DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS impossible_travel_flag BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS collusion_flag BOOLEAN DEFAULT FALSE;

-- 2. Extend embeddings with drift learning flags
ALTER TABLE embeddings
    ADD COLUMN IF NOT EXISTS is_drift_template BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS quality_score DOUBLE PRECISION DEFAULT 1.0;

-- 3. Create fraud_alerts table for security monitoring
CREATE TABLE IF NOT EXISTS fraud_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    attendance_id UUID REFERENCES attendance_logs(id) ON DELETE SET NULL,
    alert_type TEXT NOT NULL,  -- 'impossible_travel', 'collusion', 'spoof_attack', 'time_anomaly'
    severity TEXT NOT NULL DEFAULT 'medium',  -- 'low', 'medium', 'high', 'critical'
    details JSONB DEFAULT '{}'::jsonb,
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_by UUID REFERENCES admin_users(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for quick alert filtering
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_company ON fraud_alerts(company_id);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_resolved ON fraud_alerts(is_resolved);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_created ON fraud_alerts(created_at DESC);

-- 4. Enable RLS and set access policies
ALTER TABLE fraud_alerts ENABLE ROW LEVEL SECURITY;

-- Admins can view and resolve fraud alerts in their company
CREATE POLICY "admin_manage_fraud_alerts" ON fraud_alerts
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM admin_users
            WHERE admin_users.auth_user_id = auth.uid()
            AND admin_users.company_id = fraud_alerts.company_id
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM admin_users
            WHERE admin_users.auth_user_id = auth.uid()
            AND admin_users.company_id = fraud_alerts.company_id
        )
    );

-- Grant permissions to Supabase roles
GRANT ALL ON TABLE fraud_alerts TO anon, authenticated, service_role;
