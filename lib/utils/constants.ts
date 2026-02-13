// Evidence type weights (Section 4.1)
export const EVIDENCE_WEIGHTS: Record<string, number> = {
  floor_vote: 1.0,
  bill_sponsorship: 0.9,
  bill_cosponsorship: 0.7,
  committee_statement: 0.6,
  floor_speech: 0.5,
  press_release: 0.4,
  social_media: 0.2,
};

// Temporal decay parameter (Section 6.1)
export const TEMPORAL_DECAY_LAMBDA = 0.001;

// Confidence saturation parameter (Section 6.3)
export const CONFIDENCE_TAU = 1.5;

// Minimum diversity for full confidence (Section 6.3)
export const DIVERSITY_THRESHOLD = 2;

// Relevance filter confidence threshold (Section 4.2)
export const RELEVANCE_CONFIDENCE_THRESHOLD = 0.6;

// Claim-to-score mapping table (Section 5.2)
export const CLAIM_SCORE_MAP: Record<string, number> = {
  'support,strong,false': 1.0,
  'support,strong,true': 0.85,
  'support,moderate,false': 0.8,
  'support,moderate,true': 0.7,
  'support,weak,false': 0.6,
  'support,weak,true': 0.6,
  'conditional,strong,false': 0.55,
  'conditional,strong,true': 0.55,
  'conditional,moderate,false': 0.55,
  'conditional,moderate,true': 0.55,
  'conditional,weak,false': 0.55,
  'conditional,weak,true': 0.55,
  'neutral,strong,false': 0.5,
  'neutral,strong,true': 0.5,
  'neutral,moderate,false': 0.5,
  'neutral,moderate,true': 0.5,
  'neutral,weak,false': 0.5,
  'neutral,weak,true': 0.5,
  'oppose,weak,false': 0.4,
  'oppose,weak,true': 0.4,
  'oppose,moderate,false': 0.25,
  'oppose,moderate,true': 0.25,
  'oppose,strong,false': 0.0,
  'oppose,strong,true': 0.05,
};

// Vote position encoding
export const VOTE_POSITION_MAP: Record<string, number> = {
  yea: 1,
  nay: -1,
  abstain: 0,
  not_voting: 0,
};

// AI relevance keyword lexicon (Section 4.2, Stage 1)
// Keep in sync with scripts/shared/constants.js
export const AI_RELEVANCE_KEYWORDS = [
  // Core AI/ML terms
  'artificial intelligence', 'machine learning', 'deep learning',
  'neural network', 'algorithm', 'algorithmic',
  'large language model', 'generative ai', 'generative artificial intelligence',
  'chatbot', 'robotics', 'computer vision',

  // Biometrics & recognition
  'facial recognition', 'face recognition', 'biometric',

  // Autonomous systems
  'autonomous vehicle', 'autonomous weapon', 'autonomous system',
  'lethal autonomous', 'unmanned',

  // Synthetic content
  'deepfake', 'deep fake', 'synthetic media',

  // Surveillance & policing
  'surveillance', 'predictive policing',

  // Privacy & data
  'data privacy', 'data protection', 'personal data',

  // Cybersecurity
  'cybersecurity', 'cyber security',

  // Automated systems
  'automated decision', 'automated system',

  // AI governance
  'ai safety', 'ai alignment', 'ai governance', 'ai regulation',
  'ai ethics', 'responsible ai', 'trustworthy ai',
  'ai transparency', 'algorithmic transparency', 'algorithmic accountability',
  'ai bias', 'algorithmic bias', 'algorithmic discrimination',
  'ai audit', 'algorithm audit',
  'ai workforce', 'automation displacement', 'ai job',
  'ai innovation', 'ai research', 'ai development',
  'national ai', 'ai strategy', 'ai competitiveness',
  'ai standards', 'nist ai', 'ai framework',
  'ai disclosure', 'ai labeling', 'ai watermark',

  // Specific legislation
  'future of ai act', 'algorithmic accountability act', 'ai leadership act',
  'no fakes act', 'take it down act',
  'kids online safety', 'kosa',
  'american privacy rights act', 'apra',
  'american data privacy', 'adppa',
  'protect elections from deceptive ai', 'deepfakes accountability',
  'ai foundation model transparency', 'bipartisan framework for ai',

  // Executive orders & government
  'executive order on ai', 'executive order 14110', 'ai executive order',
  'safe secure trustworthy ai', 'ai bill of rights', 'ai safety institute',

  // Broader tech policy
  'frontier model', 'foundation model', 'open source ai',
  'semiconductor', 'chips act', 'chips and science',
  'section 230', 'content moderation',
  'tech regulation', 'big tech',
  'digital platform', 'online platform',
  'child safety online', 'quantum computing',

  // AI application domains
  'ai in healthcare', 'ai in education', 'ai in defense',
  'ai in finance', 'ai in hiring',
];

// OECD Principles definition with full metadata
export const OECD_PRINCIPLES: Record<string, {
  name: string;
  description: string;
  indicators: string[];
}> = {
  P1: {
    name: 'Inclusive Growth, Sustainable Development & Well-being',
    description: 'AI should benefit all of humanity and promote inclusive growth',
    indicators: [
      'Equitable AI benefits across demographics',
      'AI workforce training and transition support',
      'Digital divide and rural access',
      'Environmental sustainability of AI',
      'Small business AI access',
    ],
  },
  P2: {
    name: 'Human-Centered Values & Fairness',
    description: 'AI must respect human rights, democratic values, and diversity',
    indicators: [
      'Civil liberties protection from AI systems',
      'Anti-discrimination in algorithmic decisions',
      'Privacy protections for AI data collection',
      'Democratic process integrity',
      'Consent and individual autonomy',
    ],
  },
  P3: {
    name: 'Transparency & Explainability',
    description: 'People should understand AI outcomes and be able to challenge them',
    indicators: [
      'Disclosure requirements for AI use',
      'Algorithm transparency mandates',
      'Right to explanation of AI decisions',
      'AI content labeling and watermarking',
      'Public reporting on government AI use',
    ],
  },
  P4: {
    name: 'Robustness, Security & Safety',
    description: 'AI systems must be secure, safe, and robust throughout their lifecycle',
    indicators: [
      'AI testing and evaluation requirements',
      'Cybersecurity standards for AI',
      'Critical infrastructure AI protections',
      'AI incident reporting',
      'Safety benchmarks and red-teaming',
    ],
  },
  P5: {
    name: 'Accountability',
    description: 'Organizations developing/deploying AI should be accountable',
    indicators: [
      'AI liability frameworks',
      'Oversight body creation',
      'Enforcement mechanisms',
      'Whistleblower protections for AI harms',
      'Redress mechanisms for affected individuals',
    ],
  },
};

// Principle IDs list
export const PRINCIPLE_IDS = ['P1', 'P2', 'P3', 'P4', 'P5'] as const;

// Cache TTL values (in seconds)
export const CACHE_TTL = {
  POLITICIANS_LIST: 3600,
  POLITICIAN_DETAIL: 1800,
  SCORES: 1800,
  PRINCIPLES: 86400,
  STATS: 300,
};

// API Rate Limits
export const RATE_LIMITS = {
  CLAUDE_MAX_RPM: 50,
  CONGRESS_GOV_RPS: 1, // 1 request per second
};

// Cost tracking
export const COST_PER_1M_TOKENS = {
  CLAUDE_HAIKU_INPUT: 0.25,
  CLAUDE_HAIKU_OUTPUT: 1.25,
  CLAUDE_SONNET_INPUT: 3.0,
  CLAUDE_SONNET_OUTPUT: 15.0,
};

// Photo URLs
export const PHOTO_BASE_URLS = {
  HOUSE: 'https://clerk.house.gov/content/assets/img/member-photos',
  BIOGUIDE: 'https://bioguide.congress.gov/bioguide/photo',
};

// Party colors — light blue (D), light red (R), neutral gray (I)
export const PARTY_COLORS: Record<string, string> = {
  D: '#2563eb',
  R: '#dc2626',
  I: '#6b7280',
};

// Score color ranges — monochrome (darker = better)
export const SCORE_COLORS = {
  EXCELLENT: { min: 0.8, color: '#0a0e1a' },
  GOOD: { min: 0.6, color: '#374151' },
  MODERATE: { min: 0.4, color: '#9ca3af' },
  POOR: { min: 0.0, color: '#d1d5db' },
};

// Confidence color thresholds — monochrome
export const CONFIDENCE_COLORS = {
  HIGH: { min: 0.7, color: '#0a0e1a' },
  MEDIUM: { min: 0.4, color: '#6b7280' },
  LOW: { min: 0.0, color: '#d1d5db' },
};

// Evidence type display labels
export const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  floor_vote: 'Floor Vote',
  bill_sponsorship: 'Bill Sponsorship',
  bill_cosponsorship: 'Bill Co-sponsorship',
  committee_statement: 'Committee Statement',
  floor_speech: 'Floor Speech',
  press_release: 'Press Release',
  social_media: 'Social Media',
};

// Example politicians for display when DB is empty
export const EXAMPLE_POLITICIANS = [
  {
    id: 'example-warren',
    bioguide_id: 'W000817',
    first_name: 'Elizabeth',
    last_name: 'Warren',
    full_name: 'Elizabeth Warren',
    party: 'D' as const,
    state: 'MA',
    office_type: 'senate' as const,
    title: 'Senator',
    photo_url: null,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    overall_score: {
      id: 'ex-os-1',
      politician_id: 'example-warren',
      overall_score: 0.78,
      overall_confidence: 0.82,
      total_evidence_items: 24,
      p1_score: 0.85,
      p2_score: 0.75,
      p3_score: 0.72,
      p4_score: 0.68,
      p5_score: 0.90,
      computed_at: new Date(),
    },
  },
  {
    id: 'example-cruz',
    bioguide_id: 'C001098',
    first_name: 'Ted',
    last_name: 'Cruz',
    full_name: 'Ted Cruz',
    party: 'R' as const,
    state: 'TX',
    office_type: 'senate' as const,
    title: 'Senator',
    photo_url: null,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    overall_score: {
      id: 'ex-os-2',
      politician_id: 'example-cruz',
      overall_score: 0.31,
      overall_confidence: 0.71,
      total_evidence_items: 18,
      p1_score: 0.25,
      p2_score: 0.28,
      p3_score: 0.40,
      p4_score: 0.45,
      p5_score: 0.18,
      computed_at: new Date(),
    },
  },
  {
    id: 'example-sanders',
    bioguide_id: 'S000033',
    first_name: 'Bernie',
    last_name: 'Sanders',
    full_name: 'Bernie Sanders',
    party: 'I' as const,
    state: 'VT',
    office_type: 'senate' as const,
    title: 'Senator',
    photo_url: null,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    overall_score: {
      id: 'ex-os-3',
      politician_id: 'example-sanders',
      overall_score: 0.81,
      overall_confidence: 0.76,
      total_evidence_items: 21,
      p1_score: 0.92,
      p2_score: 0.88,
      p3_score: 0.78,
      p4_score: 0.62,
      p5_score: 0.85,
      computed_at: new Date(),
    },
  },
  {
    id: 'example-murkowski',
    bioguide_id: 'M001153',
    first_name: 'Lisa',
    last_name: 'Murkowski',
    full_name: 'Lisa Murkowski',
    party: 'R' as const,
    state: 'AK',
    office_type: 'senate' as const,
    title: 'Senator',
    photo_url: null,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    overall_score: {
      id: 'ex-os-4',
      politician_id: 'example-murkowski',
      overall_score: 0.52,
      overall_confidence: 0.68,
      total_evidence_items: 15,
      p1_score: 0.55,
      p2_score: 0.48,
      p3_score: 0.50,
      p4_score: 0.60,
      p5_score: 0.47,
      computed_at: new Date(),
    },
  },
  {
    id: 'example-booker',
    bioguide_id: 'B001288',
    first_name: 'Cory',
    last_name: 'Booker',
    full_name: 'Cory Booker',
    party: 'D' as const,
    state: 'NJ',
    office_type: 'senate' as const,
    title: 'Senator',
    photo_url: null,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    overall_score: {
      id: 'ex-os-5',
      politician_id: 'example-booker',
      overall_score: 0.65,
      overall_confidence: 0.79,
      total_evidence_items: 20,
      p1_score: 0.72,
      p2_score: 0.70,
      p3_score: 0.58,
      p4_score: 0.50,
      p5_score: 0.75,
      computed_at: new Date(),
    },
  },
];

// Statement evidence types (used for claim extraction routing)
export const STATEMENT_EVIDENCE_TYPES = [
  'committee_statement',
  'floor_speech',
  'press_release',
  'social_media',
];

// Bill-related evidence types (used for bill direction routing)
export const BILL_EVIDENCE_TYPES = [
  'floor_vote',
  'bill_sponsorship',
  'bill_cosponsorship',
];
