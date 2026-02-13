import Link from 'next/link';
import Image from 'next/image';

export default function Footer() {
  return (
    <footer className="bg-primary-950 text-white mt-auto">
      <div className="container-page py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="md:col-span-1">
            <Image
              src="/openpolicy-shield.png"
              alt="OpenPolicy AI"
              width={32}
              height={32}
              className="w-8 h-8 brightness-0 invert mb-4"
            />
            <p className="text-body-sm text-primary-400 leading-relaxed">
              Transparent, data-driven evaluation of AI governance alignment.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-body-sm mb-4">Navigate</h4>
            <ul className="space-y-2 text-body-sm text-primary-400">
              <li><Link href="/" className="hover:text-white transition-colors">Home</Link></li>
              <li><Link href="/politicians" className="hover:text-white transition-colors">Politicians</Link></li>
              <li><Link href="/compare" className="hover:text-white transition-colors">Compare</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-body-sm mb-4">Learn</h4>
            <ul className="space-y-2 text-body-sm text-primary-400">
              <li><Link href="/principles" className="hover:text-white transition-colors">OECD Principles</Link></li>
              <li><Link href="/about" className="hover:text-white transition-colors">About &amp; Methodology</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-body-sm mb-4">Legal</h4>
            <ul className="space-y-2 text-body-sm text-primary-400">
              <li>For informational purposes only</li>
              <li>Scores are not endorsements</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 text-caption text-primary-500" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <p>&copy; {new Date().getFullYear()} OpenPolicy AI. Open source. Built with evidence-based methodology.</p>
        </div>
      </div>
    </footer>
  );
}
