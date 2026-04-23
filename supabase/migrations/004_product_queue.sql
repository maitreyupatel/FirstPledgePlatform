-- Product queue for automated ingestion pipeline
-- Tracks products pending AI vetting (from Open Food Facts, user requests, admin batch)

CREATE TYPE queue_status_enum AS ENUM ('pending', 'processing', 'done', 'failed');
CREATE TYPE queue_source_enum AS ENUM ('cron_auto', 'user_request', 'admin');

CREATE TABLE product_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name TEXT NOT NULL,
  brand TEXT,
  barcode TEXT UNIQUE,
  image_url TEXT,
  ingredients_text TEXT,
  source queue_source_enum NOT NULL DEFAULT 'cron_auto',
  status queue_status_enum NOT NULL DEFAULT 'pending',
  off_product_id TEXT,
  error_message TEXT,
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_product_queue_status ON product_queue(status);
CREATE INDEX idx_product_queue_requested_at ON product_queue(requested_at DESC);

-- Prevent re-queuing same product by barcode
CREATE UNIQUE INDEX idx_product_queue_barcode ON product_queue(barcode) WHERE barcode IS NOT NULL;
