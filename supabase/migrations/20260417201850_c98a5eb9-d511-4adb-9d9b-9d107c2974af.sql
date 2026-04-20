UPDATE auth.users
SET encrypted_password = crypt('MarisolToledo2024@@', gen_salt('bf')),
    updated_at = now()
WHERE id = 'd0fa6dc4-d9cb-4c1e-be3d-a883081bd064';