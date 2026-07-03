import fs from 'fs';
import path from 'path';
import type { ContactInfoFile, DistrictContactInfo } from '@/lib/utils/types';

let cache: ContactInfoFile | null | undefined;

/** Static JSON, scraped by scripts/jobs/fetch-contact-info.js — only covers current incumbents. */
function loadContactInfo(): ContactInfoFile | null {
  if (cache !== undefined) return cache;
  const filePath = path.join(process.cwd(), 'public', 'data', 'pa-house-contact-info.json');
  cache = fs.existsSync(filePath) ? (JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ContactInfoFile) : null;
  return cache;
}

export function getContactInfoForDistrict(district: string | null | undefined): DistrictContactInfo | null {
  if (!district) return null;
  return loadContactInfo()?.districts[district] ?? null;
}

/** e.g. "Republican Chair, Education" — null if the member holds no chair role (plain "Member" doesn't count). */
export function getCommitteeChairLabel(contactInfo: DistrictContactInfo | null): string | null {
  if (!contactInfo) return null;
  const chairRole = contactInfo.committeeAssignments.find((c) => /chair/i.test(c.role));
  if (!chairRole) return null;
  return `${chairRole.role.split(';')[0].trim()}, ${chairRole.committee}`;
}

export type LeadershipTier = 'chair' | 'subcommittee-chair' | 'officer' | 'member';

const TIER_RANK: Record<LeadershipTier, number> = { chair: 4, 'subcommittee-chair': 3, officer: 2, member: 1 };

/** Highest committee leadership tier held, for map/table leadership views — null only when there's no committee data at all. */
export function getLeadershipTier(contactInfo: DistrictContactInfo | null): LeadershipTier | null {
  if (!contactInfo || contactInfo.committeeAssignments.length === 0) return null;
  let best: LeadershipTier = 'member';
  for (const c of contactInfo.committeeAssignments) {
    for (const role of c.role.split(';').map((r) => r.trim())) {
      let tier: LeadershipTier = 'member';
      if (/^(republican |democratic )?chair$/i.test(role)) tier = 'chair';
      else if (/subcommittee.*chair/i.test(role)) tier = 'subcommittee-chair';
      else if (/vice chair|secretary/i.test(role)) tier = 'officer';
      if (TIER_RANK[tier] > TIER_RANK[best]) best = tier;
    }
  }
  return best;
}
