/**
 * Shared constants for pipeline scripts (CommonJS)
 * Single source of truth for PA business relevance keywords.
 * Keep in sync with lib/utils/constants.ts
 */

const PA_RELEVANCE_KEYWORDS = [
  // Taxes & competitiveness
  'corporate net income', 'cni tax', 'net operating loss', 'nol', 'tax reform',
  'corporate tax', 'tax rate', 'tax cut', 'tax credit', 'tax burden',
  'business tax', 'small business tax', 'startup tax', 'local tax',
  'tax competitiveness', 'flat tax', 'income tax',

  // Permitting & regulatory reform
  'permitting reform', 'permit reform', 'speed program', 'regulatory reform',
  'permit streamlining', 'regulatory burden', 'deregulation', 'red tape',
  'environmental permit', 'dep permit', 'permit delay', 'economic development permit',

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
  'higher education', 'community college', 'career and technical education', 'cte',
  'childcare', 'child care', 'early childhood education',

  // Energy & environment
  'natural gas', 'energy policy', 'all of the above energy', 'energy independence',
  'nuclear energy', 'hydrogen energy', 'small modular reactor', 'smr',
  'energy mandate', 'renewable portfolio standard', 'rggi', 'carbon tax',
  'energy costs', 'electricity rates', 'power grid', 'pipeline',
  'environmental regulation', 'clean air', 'clean water', 'emissions',
  'fracking', 'natural gas production', 'marcellus shale',

  // Labor & employment
  'workers compensation', "workers' compensation", 'work comp',
  'unemployment compensation', 'prevailing wage', 'union dues', 'right to work',
  'minimum wage', 'overtime', 'independent contractor', 'gig worker',
  'paid leave', 'family leave', 'sick leave', 'nlra', 'collective bargaining',
  'labor law', 'employment law', 'workplace safety', 'osha',

  // Infrastructure & transportation
  'transportation funding', 'road funding', 'bridge repair', 'highway',
  'broadband', 'broadband access', 'rural broadband', 'internet access',
  'infrastructure investment', 'public transit', 'mass transit',
  'telecom', 'telecommunications', 'utility infrastructure',

  // Health care
  'health insurance', 'health care costs', 'employer mandate', 'aca',
  'insurance reform', 'prescription drug', 'drug pricing', 'medicaid',
  'health care access', 'certificate of need', 'con law', 'hospital competition',
  'health care competition', 'employer sponsored insurance',

  // General business climate
  'business climate', 'economic growth', 'job growth', 'business regulation',
  'business competitiveness', 'economic competitiveness', 'pro-business',
  'chamber of commerce', 'economic development', 'business-friendly',
];

function isPABusinessRelevant(text) {
  const lower = (text || '').toLowerCase();
  return PA_RELEVANCE_KEYWORDS.some((kw) => lower.includes(kw));
}

module.exports = { PA_RELEVANCE_KEYWORDS, isPABusinessRelevant };
