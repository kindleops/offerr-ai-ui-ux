/**
 * Closed-preview seller journey entry point.
 *
 * A SERVER COMPONENT does the gating. The journey is not merely hidden from a
 * denied visitor — it is never rendered, so no markup, no copy and no client
 * bundle for the form reaches them.
 *
 * A denied visitor sees the same neutral page whether the preview is disabled,
 * their token is wrong, or this is production. Distinguishing those would let
 * someone probe the configuration.
 */

import type { Metadata } from 'next';
import { cookies } from 'next/headers';

import { SellerJourney } from '@/components/offerr/seller-journey/journey';
import { PREVIEW_TOKEN_COOKIE } from '@/lib/offerr/session-constants';
import { publicGateSummary } from '@/lib/offerr/preview-config';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Offerr — closed preview',
  // A preview surface must never be indexed, and must not leak a description
  // into a search result even if a URL escapes.
  robots: { index: false, follow: false, nocache: true },
};

export default async function OfferrStartPage() {
  const cookieStore = await cookies();
  const gate = publicGateSummary(cookieStore.get(PREVIEW_TOKEN_COOKIE)?.value);

  if (!gate.admitted) {
    return (
      <main className="flex min-h-[100svh] items-center justify-center bg-[#04070A] px-6">
        <div className="max-w-md text-center">
          <p className="text-[11px] uppercase tracking-[0.3em] text-white/25">Offerr</p>
          <h1 className="mt-4 font-display text-2xl font-medium tracking-tight text-white/80">
            Not available
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/40">
            This page is not open right now.
          </p>
        </div>
      </main>
    );
  }

  return <SellerJourney />;
}
