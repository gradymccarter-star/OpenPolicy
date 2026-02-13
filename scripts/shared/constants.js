/**
 * Shared constants for pipeline scripts (CommonJS)
 * Single source of truth for AI relevance keywords.
 */

const AI_RELEVANCE_KEYWORDS = [
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

function isAIRelevant(text) {
  const lower = (text || '').toLowerCase();
  return AI_RELEVANCE_KEYWORDS.some((kw) => lower.includes(kw));
}

module.exports = { AI_RELEVANCE_KEYWORDS, isAIRelevant };
