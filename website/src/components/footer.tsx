"use client";

import Link from "next/link";

export function Footer() {
  return (
    <footer>
      <div className="mx-auto max-w-6xl px-6 py-16 border-t border-border-subtle">
        <div className="flex flex-col md:flex-row md:justify-between gap-12">
          <div className="max-w-sm">
            <div className="text-base font-black tracking-wide uppercase mb-4">
              OCC.WTF
            </div>
            <p className="text-sm text-text-tertiary leading-relaxed">
              OCC introduces a new computational primitive.<br />
              Proof becomes reachable only through an authorized commit path.{" "}
              <span className="font-semibold italic">If proof exists, the path existed.</span>
            </p>
          </div>

          <div className="flex gap-28">
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wider text-text-tertiary mb-4">
                Protocol
              </h4>
              <ul className="space-y-2">
                <li><Link href="/studio" className="text-sm text-text-secondary hover:text-text transition-colors">Studio</Link></li>
                <li><Link href="/use-cases" className="text-sm text-text-secondary hover:text-text transition-colors">Use Cases</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-medium uppercase tracking-wider text-text-tertiary mb-4">
                Developers
              </h4>
              <ul className="space-y-2">
                <li><Link href="/docs" className="text-sm text-text-secondary hover:text-text transition-colors">Documentation</Link></li>
                <li><Link href="/api-reference" className="text-sm text-text-secondary hover:text-text transition-colors">API Reference</Link></li>
                <li><Link href="/docs/proof-format" className="text-sm text-text-secondary hover:text-text transition-colors">Proof Format</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-medium uppercase tracking-wider text-text-tertiary mb-4">
                Resources
              </h4>
              <ul className="space-y-2">
                <li><a href="https://github.com/mikeargento/occ" target="_blank" rel="noopener" className="text-sm text-text-secondary hover:text-text transition-colors">GitHub ↗</a></li>
                <li><a href="https://npmjs.com/package/occproof" target="_blank" rel="noopener" className="text-sm text-text-secondary hover:text-text transition-colors">npm ↗</a></li>
                <li><Link href="/docs/trust-model" className="text-sm text-text-secondary hover:text-text transition-colors">Trust Model</Link></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-border-subtle pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-text-tertiary">
            Origin Controlled Computing
          </p>
          <p className="text-xs text-text-tertiary">
            Apache 2.0 License
          </p>
        </div>
      </div>
    </footer>
  );
}
