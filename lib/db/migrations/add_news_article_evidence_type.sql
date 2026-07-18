-- fetch-pa-news.js inserts evidence_type='news_article', which the original
-- CHECK constraint rejects silently. Widen the allowed set to include it.
ALTER TABLE evidence_items DROP CONSTRAINT IF EXISTS evidence_items_evidence_type_check;
ALTER TABLE evidence_items ADD CONSTRAINT evidence_items_evidence_type_check CHECK (evidence_type IN (
  'floor_vote', 'committee_vote',
  'bill_sponsorship', 'bill_cosponsorship',
  'committee_statement', 'floor_speech',
  'press_release', 'social_media', 'news_article',
  'questionnaire_response', 'other_endorsement'
));
