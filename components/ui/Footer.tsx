import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-primary-950 text-white mt-auto">
      <div className="container-page py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="md:col-span-1">
            <p className="font-bold text-body-sm mb-3">PA Chamber Intelligence</p>
            <p className="text-body-sm text-primary-400 leading-relaxed">
              Evidence-based candidate intelligence for the Pennsylvania Chamber of Commerce endorsement process.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-body-sm mb-4">Navigate</h4>
            <ul className="space-y-2 text-body-sm text-primary-400">
              <li><Link href="/" className="hover:text-white transition-colors">Home</Link></li>
              <li><Link href="/politicians" className="hover:text-white transition-colors">Candidates</Link></li>
              <li><Link href="/compare" className="hover:text-white transition-colors">Compare</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-body-sm mb-4">Learn</h4>
            <ul className="space-y-2 text-body-sm text-primary-400">
              <li><Link href="/principles" className="hover:text-white transition-colors">Scoring Criteria</Link></li>
              <li><Link href="/about" className="hover:text-white transition-colors">About &amp; Methodology</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-body-sm mb-4">Legal</h4>
            <ul className="space-y-2 text-body-sm text-primary-400">
              <li>Internal use only</li>
              <li>All claims are cited and traceable</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 text-caption text-primary-500" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <p>&copy; {new Date().getFullYear()} PA Chamber of Commerce Endorsement Intelligence. Built with evidence-based methodology.</p>
        </div>
      </div>
    </footer>
  );
}
