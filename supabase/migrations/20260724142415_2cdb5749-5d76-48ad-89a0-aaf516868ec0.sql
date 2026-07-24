
CREATE POLICY "site-logos owner write"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'site-logos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "site-logos owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'site-logos' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'site-logos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "site-logos owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'site-logos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "site-logos public read"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'site-logos');
