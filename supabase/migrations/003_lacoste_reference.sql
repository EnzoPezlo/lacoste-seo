-- Lacoste sitemap page index
CREATE TABLE lacoste_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT UNIQUE NOT NULL,
  locale TEXT NOT NULL,
  path TEXT NOT NULL,
  page_type TEXT,
  is_new BOOLEAN DEFAULT true,
  sitemap_last_seen TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_lacoste_pages_locale_active
  ON lacoste_pages (locale)
  WHERE removed_at IS NULL;

-- Cached scrapes of Lacoste pages (independent of pipeline runs)
CREATE TABLE lacoste_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT UNIQUE NOT NULL,
  markdown_content TEXT,
  head_html TEXT,
  structured_data JSONB,
  scraped_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies (same pattern as existing tables)
ALTER TABLE lacoste_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE lacoste_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read lacoste_pages" ON lacoste_pages
  FOR SELECT TO anon USING (true);
CREATE POLICY "service full lacoste_pages" ON lacoste_pages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "anon read lacoste_snapshots" ON lacoste_snapshots
  FOR SELECT TO anon USING (true);
CREATE POLICY "service full lacoste_snapshots" ON lacoste_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);
