-- Preserve previously unrestricted navigation once these modules become grantable.
UPDATE users SET permissions = (
  SELECT json_group_array(value) FROM (
    SELECT value FROM json_each(users.permissions)
    UNION SELECT 'chat' UNION SELECT 'assistants' UNION SELECT 'records' UNION SELECT 'bridge' UNION SELECT 'workspace'
  )
) WHERE role != 'admin';
UPDATE user_role SET permissions = (
  SELECT json_group_array(value) FROM (
    SELECT value FROM json_each(user_role.permissions)
    UNION SELECT 'chat' UNION SELECT 'assistants' UNION SELECT 'records' UNION SELECT 'bridge' UNION SELECT 'workspace'
  )
) WHERE user_role_id != 'admin';
UPDATE _schema_version SET version = 24;
