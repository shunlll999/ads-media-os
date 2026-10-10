CREATE TABLE "programmatic_records" (
 "id" TEXT PRIMARY KEY, "kind" TEXT NOT NULL, "payload" JSONB NOT NULL,
 "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "programmatic_kind_idx" ON "programmatic_records"("kind");
CREATE TABLE "programmatic_transactions" (
 "id" TEXT PRIMARY KEY, "deal_id" TEXT NOT NULL REFERENCES "programmatic_records"("id"),
 "inventory_id" TEXT NOT NULL REFERENCES "inventory"("id"),
 "occurred_at" TIMESTAMPTZ(6) NOT NULL, "source" TEXT NOT NULL CHECK (source IN ('mock','partner')),
 "impressions" INTEGER NOT NULL CHECK (impressions >= 0),
 "requests" INTEGER NOT NULL CHECK (requests >= 0),
 "bids" INTEGER NOT NULL CHECK (bids >= 0 AND bids <= requests),
 "wins" INTEGER NOT NULL CHECK (wins >= 0 AND wins <= bids),
 "spend" DECIMAL(14,2) NOT NULL CHECK (spend >= 0),
 "ssp_fee" DECIMAL(14,2) NOT NULL CHECK (ssp_fee >= 0 AND ssp_fee <= spend),
 "cost" DECIMAL(14,2) NOT NULL CHECK (cost >= 0 AND cost <= spend - ssp_fee)
);
CREATE INDEX "programmatic_transaction_deal_idx" ON "programmatic_transactions"("deal_id","occurred_at");
