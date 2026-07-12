CREATE TABLE account_roles (account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, role text NOT NULL, PRIMARY KEY(account_id, role));
ALTER TABLE board_versions ADD COLUMN state text NOT NULL DEFAULT 'Draft';
ALTER TABLE board_versions ALTER COLUMN published_at DROP NOT NULL;
ALTER TABLE audit_events ADD COLUMN actor_account_id uuid REFERENCES accounts(id);
