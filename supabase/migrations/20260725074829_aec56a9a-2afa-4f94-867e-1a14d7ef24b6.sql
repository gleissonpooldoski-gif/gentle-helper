
DO $$ BEGIN
  CREATE POLICY "story_images_auth_write"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'story-images');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "story_images_auth_read"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'story-images');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "story_images_auth_delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'story-images');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
