-- Create the GIN index on the expression directly
CREATE INDEX "Transcript_searchVector_idx" ON "Transcript" USING GIN (
  (setweight(to_tsvector('simple', coalesce("title", '')), 'A') || setweight(to_tsvector('simple', coalesce("summary", '')), 'B'))
);