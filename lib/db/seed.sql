-- Seed OECD AI Principles

INSERT INTO oecd_principles (title, short_name, description, key_indicators) VALUES
(
  'Inclusive Growth, Sustainable Development & Well-being',
  'Inclusive Growth',
  'AI should benefit all of humanity and promote inclusive growth, sustainable development, and well-being.',
  '["Support for equitable AI benefits distribution", "Environmental sustainability measures", "Economic opportunity expansion", "Addressing AI impact on employment", "Ensuring broad access to AI benefits"]'
),
(
  'Human-Centered Values & Fairness',
  'Human-Centered Values',
  'AI systems should respect human rights, democratic values, diversity, and ensure fairness.',
  '["Protection of civil liberties", "Anti-discrimination measures", "Privacy protections", "Respect for democratic values", "Support for diversity and inclusion"]'
),
(
  'Transparency & Explainability',
  'Transparency',
  'People should understand AI outcomes affecting them and be able to challenge them when appropriate.',
  '["Support for AI disclosure requirements", "Algorithm transparency mandates", "Right to explanation of AI decisions", "Public access to AI documentation", "Regulatory transparency measures"]'
),
(
  'Robustness, Security & Safety',
  'Security & Safety',
  'AI systems should function appropriately and be secure, safe, and robust throughout their lifecycle.',
  '["Cybersecurity measures for AI systems", "AI testing and validation requirements", "Safety standards and protocols", "Risk assessment frameworks", "Incident response protocols"]'
),
(
  'Accountability',
  'Accountability',
  'Organizations and individuals developing, deploying, or operating AI systems should be held accountable for their proper functioning.',
  '["Clear accountability frameworks", "Enforcement mechanisms", "Oversight body establishment", "Liability standards for AI harms", "Regular auditing requirements"]'
);
