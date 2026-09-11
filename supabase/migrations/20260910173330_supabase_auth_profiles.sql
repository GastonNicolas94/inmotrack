TRUNCATE TABLE public.usuarios CASCADE;
ALTER TABLE public.usuarios DROP COLUMN password_hash;
ALTER TABLE public.usuarios ADD COLUMN auth_user_id uuid NOT NULL;
CREATE UNIQUE INDEX usuarios_auth_user_id_key ON public.usuarios(auth_user_id);
