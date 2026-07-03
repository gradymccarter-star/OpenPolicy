import { PartyBadge } from '@/components/ui/Badge';
import { getCandidacyStatus } from '@/lib/utils/helpers';
import type { DistrictContactInfo, PoliticianWithScores } from '@/lib/utils/types';

interface Props {
  readonly politician: PoliticianWithScores;
  readonly contactInfo: DistrictContactInfo | null;
}

function ContactRow({ icon, label, value, href }: { icon: string; label: string; value: string; href?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-primary-300 text-body-sm mt-0.5 w-5 flex-shrink-0 text-center">{icon}</span>
      <div>
        <div className="text-caption text-primary-400">{label}</div>
        {href ? (
          <a href={href} className="text-body-sm font-medium text-primary-950 hover:underline">
            {value}
          </a>
        ) : (
          <div className="text-body-sm font-medium text-primary-950">{value}</div>
        )}
      </div>
    </div>
  );
}

export default function ContactTab({ politician, contactInfo }: Props) {
  // Prefer verified links scraped from the official bio page over filing-sourced fields —
  // the bio page is current and confirmed live, filing data can be stale or self-reported.
  const social = contactInfo?.socialLinks;
  const externalLinks: { label: string; href: string }[] = [];
  if (social?.website) {
    externalLinks.push({ label: 'Official Website', href: social.website });
  } else if (politician.official_website) {
    externalLinks.push({ label: 'Official Website', href: politician.official_website });
  }
  if (social?.contactForm) externalLinks.push({ label: 'Contact This Representative', href: social.contactForm });
  if (social?.facebook) externalLinks.push({ label: 'Facebook', href: social.facebook });
  if (social?.twitter) {
    externalLinks.push({ label: 'Twitter / X', href: social.twitter });
  } else if (politician.twitter_handle) {
    externalLinks.push({ label: `@${politician.twitter_handle.replace(/^@/, '')}`, href: `https://twitter.com/${politician.twitter_handle.replace(/^@/, '')}` });
  }
  if (social?.youtube) externalLinks.push({ label: 'YouTube', href: social.youtube });

  return (
    <div className="space-y-6">
      <div className="card p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-heading-3">Party &amp; Office</h2>
          <PartyBadge party={politician.party} />
        </div>

        {!contactInfo && (
          <p className="text-body-sm text-primary-400">
            {getCandidacyStatus(politician) === 'challenger'
              ? 'Not currently in office — no official Capitol or district office on file. Declared candidates have no government-issued contact page until elected.'
              : 'No official contact info on file yet.'}
          </p>
        )}

        {contactInfo && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="text-body-sm font-semibold text-primary-950">Capitol Office</h3>
              {contactInfo.capitolAddress && <ContactRow icon="📍" label="Address" value={contactInfo.capitolAddress} />}
              {contactInfo.capitolPhone && (
                <ContactRow icon="📞" label="Phone" value={contactInfo.capitolPhone} href={`tel:${contactInfo.capitolPhone.replace(/[^\d]/g, '')}`} />
              )}
              {contactInfo.capitolFax && <ContactRow icon="🖶" label="Fax" value={contactInfo.capitolFax} />}
            </div>
            <div className="space-y-4">
              <h3 className="text-body-sm font-semibold text-primary-950">District Office</h3>
              {contactInfo.districtOfficeAddress && <ContactRow icon="📍" label="Address" value={contactInfo.districtOfficeAddress} />}
              {contactInfo.districtOfficePhone && (
                <ContactRow icon="📞" label="Phone" value={contactInfo.districtOfficePhone} href={`tel:${contactInfo.districtOfficePhone.replace(/[^\d]/g, '')}`} />
              )}
              {contactInfo.districtOfficeFax && <ContactRow icon="🖶" label="Fax" value={contactInfo.districtOfficeFax} />}
              {!contactInfo.districtOfficeAddress && !contactInfo.districtOfficePhone && (
                <p className="text-caption text-primary-400">No district office on file.</p>
              )}
            </div>
          </div>
        )}

        {(externalLinks.length > 0 || contactInfo) && (
          <div className="mt-6 pt-6 flex flex-wrap items-center gap-3" style={{ borderTop: '1px solid var(--border)' }}>
            {externalLinks.map((link) => (
              <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className="btn-secondary text-caption py-2 px-4">
                {link.label} ↗
              </a>
            ))}
            {contactInfo && (
              <a href={contactInfo.source_url} target="_blank" rel="noopener noreferrer" className="text-caption text-primary-400 hover:underline ml-auto">
                Source: palegis.us bio page ↗
              </a>
            )}
          </div>
        )}
      </div>

      {contactInfo?.legislativeActivity && (
        <div className="card p-8">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-heading-3">Legislative Activity</h2>
            <span className="text-caption text-primary-400">{contactInfo.legislativeActivity.sessionLabel}</span>
          </div>
          <p className="text-caption text-primary-400 mb-6">
            Total bills and resolutions sponsored or co-sponsored this session, per the official House roster — not limited to PA Chamber priority legislation.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Bills Sponsored', value: contactInfo.legislativeActivity.billsSponsored },
              { label: 'Bills Co-Sponsored', value: contactInfo.legislativeActivity.billsCoSponsored },
              { label: 'Resolutions Sponsored', value: contactInfo.legislativeActivity.resolutionsSponsored },
              { label: 'Resolutions Co-Sponsored', value: contactInfo.legislativeActivity.resolutionsCoSponsored },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl p-3 text-center" style={{ border: '1px solid var(--border)', background: 'var(--surface-canvas)' }}>
                <div className="text-xl font-bold text-primary-950">{stat.value}</div>
                <div className="text-caption text-primary-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {contactInfo && ((contactInfo.occupation?.length ?? 0) > 0 || (contactInfo.education?.length ?? 0) > 0) && (
        <div className="card p-8">
          <h2 className="text-heading-3 mb-6">Biography</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {(contactInfo.occupation?.length ?? 0) > 0 && (
              <div>
                <h3 className="text-body-sm font-semibold text-primary-950 mb-3">Occupation</h3>
                <ul className="space-y-1.5 list-disc list-inside">
                  {contactInfo.occupation!.map((line) => (
                    <li key={line} className="text-body-sm text-primary-700">{line}</li>
                  ))}
                </ul>
              </div>
            )}
            {(contactInfo.education?.length ?? 0) > 0 && (
              <div>
                <h3 className="text-body-sm font-semibold text-primary-950 mb-3">Education</h3>
                <ul className="space-y-1.5 list-disc list-inside">
                  {contactInfo.education!.map((line) => (
                    <li key={line} className="text-body-sm text-primary-700">{line}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {contactInfo && contactInfo.committeeAssignments.length > 0 && (
        <div className="card p-8">
          <h2 className="text-heading-3 mb-1">Committee Assignments</h2>
          <p className="text-caption text-primary-400 mb-6">
            Current {contactInfo.committeeAssignments.length}-committee assignment{contactInfo.committeeAssignments.length === 1 ? '' : 's'}, per the official House committee roster.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {contactInfo.committeeAssignments.map((c) => (
              <a
                key={c.committeeUrl}
                href={c.committeeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-xl px-4 py-3 transition-colors hover:bg-stone-50"
                style={{ border: '1px solid var(--border)' }}
              >
                <span className="text-body-sm font-medium text-primary-950">{c.committee}</span>
                <span
                  className="text-caption font-semibold rounded-full px-2 py-0.5 ml-3 flex-shrink-0"
                  style={
                    c.role === 'Member'
                      ? { color: 'var(--primary-400)', background: 'var(--surface-canvas)' }
                      : { color: '#92400e', background: '#fef3c7' }
                  }
                >
                  {c.role}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
