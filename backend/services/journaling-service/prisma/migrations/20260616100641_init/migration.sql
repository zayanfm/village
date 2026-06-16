-- CreateTable
CREATE TABLE "journal_entries" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "body_enc" BYTEA NOT NULL,
    "preview" TEXT,
    "sealed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entry_ref" TEXT,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_entry_ref_key" ON "journal_entries"("entry_ref");

-- CreateIndex
CREATE INDEX "journal_entries_owner_id_idx" ON "journal_entries"("owner_id");
