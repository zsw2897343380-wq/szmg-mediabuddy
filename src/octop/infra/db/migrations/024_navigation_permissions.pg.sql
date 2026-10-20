-- users.permissions is JSONB; role templates retain portable JSON text.
UPDATE users SET permissions = (
  SELECT jsonb_agg(value) FROM (
    SELECT value FROM jsonb_array_elements_text(users.permissions)
    UNION SELECT 'chat' UNION SELECT 'assistants' UNION SELECT 'records' UNION SELECT 'bridge' UNION SELECT 'workspace'
  ) AS grants
) WHERE role != 'admin';
UPDATE user_role SET permissions = (
  SELECT jsonb_agg(value)::text FROM (
    SELECT value FROM jsonb_array_elements_text(user_role.permissions::jsonb)
    UNION SELECT 'chat' UNION SELECT 'assistants' UNION SELECT 'records' UNION SELECT 'bridge' UNION SELECT 'workspace'
  ) AS grants
) WHERE user_role_id != 'admin';
UPDATE _schema_version SET version = 24;
