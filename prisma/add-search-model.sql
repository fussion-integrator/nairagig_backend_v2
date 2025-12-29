CREATE TABLE IF NOT EXISTS search_queries (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  "userId" TEXT,
  type TEXT,
  results INTEGER DEFAULT 0,
  clicked BOOLEAN DEFAULT false,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_queries_query ON search_queries(query);
CREATE INDEX IF NOT EXISTS idx_search_queries_userId ON search_queries("userId");
CREATE INDEX IF NOT EXISTS idx_search_queries_createdAt ON search_queries("createdAt");