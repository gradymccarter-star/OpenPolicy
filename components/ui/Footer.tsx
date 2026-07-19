import Link from 'next/link';
import Keystone from './Keystone';

export default function Footer() {
  return (
    <footer className="mt-auto" style={{ borderTop: '1px solid var(--rule)', background: 'var(--card)' }}>
      <div className="container-page py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <Keystone size={14} style={{ color: 'var(--brass-bright)' }} />
              <p className="font-serif font-semibold text-body-sm text-primary-950">PA Chamber Intelligence</p>
            </div>
            <p className="text-caption text-primary-500 leading-relaxed">
              Evidence-based candidate intelligence for the Pennsylvania Chamber of Commerce endorsement process.
            </p>
          </div>

          <div>
            <p className="overline mb-4" style={{ fontSize: '0.68rem' }}>Navigate</p>
            <ul className="space-y-2 text-body-sm text-primary-600">
              <li><Link href="/" className="hover:text-primary-950 transition-colors">Home</Link></li>
              <li><Link href="/politicians" className="hover:text-primary-950 transition-colors">Candidates</Link></li>
              <li><Link href="/compare" className="hover:text-primary-950 transition-colors">Compare</Link></li>
            </ul>
          </div>

          <div>
            <p className="overline mb-4" style={{ fontSize: '0.68rem' }}>Learn</p>
            <ul className="space-y-2 text-body-sm text-primary-600">
              <li><Link href="/principles" className="hover:text-primary-950 transition-colors">Scoring Criteria</Link></li>
              <li><Link href="/about" className="hover:text-primary-950 transition-colors">About &amp; Methodology</Link></li>
            </ul>
          </div>

          <div>
            <p className="overline mb-4" style={{ fontSize: '0.68rem' }}>Standards</p>
            <ul className="space-y-2 text-body-sm text-primary-600">
              <li>Internal use only</li>
              <li>All claims are cited and traceable</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-6 text-caption text-primary-400" style={{ borderTop: '1px solid var(--rule-soft)' }}>
          <p>&copy; {new Date().getFullYear()} PA Chamber of Commerce Endorsement Intelligence. Built with evidence-based methodology.</p>
        </div>
      </div>
    </footer>
  );
}
