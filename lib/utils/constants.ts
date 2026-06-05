// Evidence type weights
// Bill sponsorship is weighted highest per PA Chamber guidance (most important signal)
export const EVIDENCE_WEIGHTS: Record<string, number> = {
  bill_sponsorship: 1,
  floor_vote: 0.85,
  committee_vote: 0.85,
  bill_cosponsorship: 0.75,
  questionnaire_response: 0.7,
  committee_statement: 0.55,
  floor_speech: 0.45,
  press_release: 0.35,
  other_endorsement: 0.3,
  social_media: 0.2,
};

// Multiplier applied to evidence tied to a PA Chamber priority bill
export const CHAMBER_PRIORITY_BILL_MULTIPLIER = 3;

// Temporal decay parameter
export const TEMPORAL_DECAY_LAMBDA = 0.001;

// Confidence saturation parameter
export const CONFIDENCE_TAU = 1.5;

// Minimum diversity for full confidence
export const DIVERSITY_THRESHOLD = 2;

// Relevance filter confidence threshold
export const RELEVANCE_CONFIDENCE_THRESHOLD = 0.6;

// Claim-to-score mapping table
export const CLAIM_SCORE_MAP: Record<string, number> = {
  'support,strong,false': 1,
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

// PA business relevance keyword lexicon
// Keep in sync with scripts/shared/constants.js
export const PA_RELEVANCE_KEYWORDS = [
  // Taxes & competitiveness
  'corporate net income', 'cni tax', 'net operating loss', 'nol', 'tax reform',
  'corporate tax', 'tax rate', 'tax cut', 'tax credit', 'tax burden',
  'business tax', 'small business tax', 'startup tax', 'local tax',
  'tax competitiveness', 'flat tax', 'income tax',

  // Permitting & regulatory reform
  'permitting reform', 'permit reform', 'speed program', 'regulatory reform',
  'permit streamlining', 'regulatory burden', 'deregulation', 'red tape',
  'environmental permit', 'DEP permit', 'permit delay', 'economic development permit',

  // Civil justice & legal reform
  'lawsuit abuse', 'tort reform', 'venue shopping', 'civil justice',
  'liability reform', 'litigation reform', 'punitive damages', 'joint and several',
  'asbestos litigation', 'medical malpractice', 'legal reform',

  // Fiscal responsibility & state spending
  'state budget', 'fiscal responsibility', 'balanced budget', 'state spending',
  'pension reform', 'public pension', 'pension debt', 'pension liability',
  'privatization', 'public private partnership', 'government efficiency',
  'budget deficit', 'state debt', 'spending reform',

  // Workforce & education
  'workforce development', 'job training', 'apprenticeship', 'career readiness',
  'upskilling', 'reskilling', 'workforce reentry', 'job creation',
  'school choice', 'educational choice', 'charter school', 'voucher',
  'higher education', 'community college', 'career and technical education', 'CTE',
  'childcare', 'child care', 'early childhood education',

  // Energy & environment
  'natural gas', 'energy policy', 'all of the above energy', 'energy independence',
  'nuclear energy', 'hydrogen energy', 'small modular reactor', 'SMR',
  'energy mandate', 'renewable portfolio standard', 'RGGI', 'carbon tax',
  'energy costs', 'electricity rates', 'power grid', 'pipeline',
  'environmental regulation', 'clean air', 'clean water', 'emissions',
  'fracking', 'natural gas production', 'marcellus shale',

  // Labor & employment
  'workers compensation', "workers' compensation", 'work comp',
  'unemployment compensation', 'prevailing wage', 'union dues', 'right to work',
  'minimum wage', 'overtime', 'independent contractor', 'gig worker',
  'paid leave', 'family leave', 'sick leave', 'NLRA', 'collective bargaining',
  'labor law', 'employment law', 'workplace safety', 'OSHA',

  // Infrastructure & transportation
  'transportation funding', 'road funding', 'bridge repair', 'highway',
  'broadband', 'broadband access', 'rural broadband', 'internet access',
  'infrastructure investment', 'public transit', 'mass transit',
  'telecom', 'telecommunications', 'utility infrastructure',

  // Health care
  'health insurance', 'health care costs', 'employer mandate', 'ACA',
  'insurance reform', 'prescription drug', 'drug pricing', 'Medicaid',
  'health care access', 'certificate of need', 'CON law', 'hospital competition',
  'health care competition', 'employer sponsored insurance',

  // General business climate
  'business climate', 'economic growth', 'job growth', 'business regulation',
  'business competitiveness', 'economic competitiveness', 'pro-business',
  'chamber of commerce', 'economic development', 'business-friendly',
];

// PA Chamber of Commerce Principles
export const PA_CHAMBER_PRINCIPLES: Record<string, {
  name: string;
  description: string;
  indicators: string[];
}> = {
  P1: {
    name: 'Taxes & Business Competitiveness',
    description: 'Supports reducing the tax burden on businesses and making Pennsylvania competitive',
    indicators: [
      'Corporate net income tax phase-down acceleration',
      'Net operating loss treatment improvements',
      'Local tax administration reform',
      'Small business tax relief',
      'Alignment with federal tax code',
    ],
  },
  P2: {
    name: 'Permitting & Regulatory Reform',
    description: 'Supports streamlining permits and reducing unnecessary regulatory burdens',
    indicators: [
      'SPEED program and permitting modernization',
      'Permit delay reduction',
      'Regulatory burden reduction for businesses',
      'Science-based rather than politically motivated regulation',
      'Economic impact review of new regulations',
    ],
  },
  P3: {
    name: 'Civil Justice Reform',
    description: 'Supports a fair legal system that prevents lawsuit abuse and venue-shopping',
    indicators: [
      'Lawsuit abuse reform',
      'Venue-shopping prevention',
      'Judicial efficiency improvements',
      'Predictable liability rules for employers',
      'Balance between plaintiff access and business certainty',
    ],
  },
  P4: {
    name: 'Fiscal Responsibility',
    description: 'Supports responsible state spending, pension reform, and efficient government',
    indicators: [
      'On-time, responsible state budgets',
      'Public pension system reform',
      'Government privatization and efficiency',
      'Public-private partnerships',
      'Reducing state debt and unfunded liabilities',
    ],
  },
  P5: {
    name: 'Workforce & Education',
    description: 'Supports career readiness, job training, and educational options that serve employers',
    indicators: [
      'Career and technical education investment',
      'Workforce re-entry and upskilling programs',
      'Childcare access and affordability',
      'Educational choice and accountability',
      'Higher education alignment with employer needs',
    ],
  },
  P6: {
    name: 'Energy & Environment',
    description: 'Supports an all-of-the-above energy policy and science-based environmental regulation',
    indicators: [
      'All-of-the-above energy development',
      'Opposing anti-competitive energy mandates',
      'Hydrogen and advanced nuclear support',
      'Flexible, science-based environmental standards',
      'Energy cost competitiveness for businesses',
    ],
  },
  P7: {
    name: 'Labor & Employment',
    description: 'Supports balanced labor laws that protect workers without burdening employers',
    indicators: [
      'Workers compensation system reform',
      'Unemployment compensation integrity',
      'Opposition to compulsory union dues',
      'Opposing excessive wage mandates',
      'Fair and balanced labor relations policy',
    ],
  },
  P8: {
    name: 'Infrastructure',
    description: 'Supports reliable transportation, broadband, and utility infrastructure investment',
    indicators: [
      'Transportation and road funding',
      'Rural broadband expansion',
      'Utility and telecom infrastructure',
      'Permitting streamlining for infrastructure projects',
      'Public-private infrastructure partnerships',
    ],
  },
  P9: {
    name: 'Health Care',
    description: 'Supports employer flexibility, market competition, and affordability in health care',
    indicators: [
      'Employer flexibility in health care decisions',
      'Health care market competition',
      'Certificate of need reform',
      'Prescription drug cost reduction',
      'Reducing administrative burden on employers',
    ],
  },
};

// Principle IDs list
export const PRINCIPLE_IDS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9'] as const;

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
  PA_LEGIS_RPS: 2,
};

// Cost tracking
export const COST_PER_1M_TOKENS = {
  CLAUDE_HAIKU_INPUT: 0.25,
  CLAUDE_HAIKU_OUTPUT: 1.25,
  CLAUDE_SONNET_INPUT: 3,
  CLAUDE_SONNET_OUTPUT: 15,
};

// PA General Assembly photo base URL
export const PHOTO_BASE_URL = 'https://www.legis.state.pa.us/images/members';

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
  POOR: { min: 0, color: '#d1d5db' },
};

// Confidence color thresholds — monochrome
export const CONFIDENCE_COLORS = {
  HIGH: { min: 0.7, color: '#0a0e1a' },
  MEDIUM: { min: 0.4, color: '#6b7280' },
  LOW: { min: 0, color: '#d1d5db' },
};

// Evidence type display labels
export const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  floor_vote: 'Floor Vote',
  committee_vote: 'Committee Vote',
  bill_sponsorship: 'Bill Sponsorship',
  bill_cosponsorship: 'Bill Co-sponsorship',
  committee_statement: 'Committee Statement',
  floor_speech: 'Floor Speech',
  press_release: 'Press Release',
  social_media: 'Social Media',
  questionnaire_response: 'Candidate Questionnaire',
  other_endorsement: 'Third-Party Endorsement',
};

// Example PA House candidates for display when DB is empty
export const EXAMPLE_POLITICIANS = [
  {
    id: 'example-pa-001',
    pa_legislator_id: 'PA-H-001',
    first_name: 'James',
    last_name: 'Hartwell',
    full_name: 'James Hartwell',
    party: 'R' as const,
    district: '10',
    county: 'Chester',
    office_type: 'pa_house' as const,
    title: 'State Representative',
    photo_url: null,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    overall_score: {
      id: 'ex-os-1',
      politician_id: 'example-pa-001',
      overall_score: 0.82,
      overall_confidence: 0.78,
      total_evidence_items: 31,
      p1_score: 0.9, p2_score: 0.85, p3_score: 0.75,
      p4_score: 0.8, p5_score: 0.72, p6_score: 0.88,
      p7_score: 0.78, p8_score: 0.7, p9_score: 0.65,
      computed_at: new Date(),
    },
  },
  {
    id: 'example-pa-002',
    pa_legislator_id: 'PA-H-002',
    first_name: 'Maria',
    last_name: 'Delgado',
    full_name: 'Maria Delgado',
    party: 'D' as const,
    district: '182',
    county: 'Philadelphia',
    office_type: 'pa_house' as const,
    title: 'State Representative',
    photo_url: null,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    overall_score: {
      id: 'ex-os-2',
      politician_id: 'example-pa-002',
      overall_score: 0.38,
      overall_confidence: 0.65,
      total_evidence_items: 22,
      p1_score: 0.25, p2_score: 0.32, p3_score: 0.4,
      p4_score: 0.3, p5_score: 0.55, p6_score: 0.22,
      p7_score: 0.35, p8_score: 0.48, p9_score: 0.6,
      computed_at: new Date(),
    },
  },
  {
    id: 'example-pa-003',
    pa_legislator_id: 'PA-H-003',
    first_name: 'Thomas',
    last_name: 'Brannigan',
    full_name: 'Thomas Brannigan',
    party: 'R' as const,
    district: '57',
    county: 'Lancaster',
    office_type: 'pa_house' as const,
    title: 'State Representative',
    photo_url: null,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    overall_score: {
      id: 'ex-os-3',
      politician_id: 'example-pa-003',
      overall_score: 0.61,
      overall_confidence: 0.70,
      total_evidence_items: 18,
      p1_score: 0.7, p2_score: 0.65, p3_score: 0.55,
      p4_score: 0.6, p5_score: 0.58, p6_score: 0.72,
      p7_score: 0.5, p8_score: 0.62, p9_score: 0.48,
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
  'questionnaire_response',
];

// Vote-related evidence types (used for bill direction routing)
export const VOTE_EVIDENCE_TYPES = [
  'floor_vote',
  'committee_vote',
];

// Bill-related evidence types (used for bill direction routing)
export const BILL_EVIDENCE_TYPES = [
  'floor_vote',
  'committee_vote',
  'bill_sponsorship',
  'bill_cosponsorship',
];
