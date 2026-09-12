/**
 * @license
 * Copyright 2026 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * First-run onboarding hero art. Replaces the upstream onboarding recording,
 * which streamed from upstream's CDN: a first run must not reach the network,
 * least of all upstream's. Pure inline SVG on theme tokens, so it needs no
 * bundled asset, works offline, and follows light/dark.
 */

export function OnboardingIllustration() {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-3xl border border-border-2 bg-bg-sunken shadow-sm ring-1 ring-foreground/5 md:aspect-auto md:h-full">
      <svg
        viewBox="0 0 320 180"
        role="img"
        aria-label="An agent driving a browser window: a task list on the left, a page filling in on the right"
        className="h-full w-full"
        preserveAspectRatio="xMidYMid slice"
      >
        <title>An agent driving a browser window</title>
        {/* Window */}
        <rect
          x="20"
          y="18"
          width="280"
          height="144"
          rx="10"
          className="fill-card stroke-border-2"
          strokeWidth="1"
        />
        {/* Sidebar */}
        <rect
          x="20"
          y="18"
          width="78"
          height="144"
          rx="10"
          className="fill-muted"
        />
        <rect x="88" y="18" width="10" height="144" className="fill-muted" />
        {/* Sidebar rows: the top one is the live run. */}
        <rect
          x="31"
          y="34"
          width="40"
          height="6"
          rx="3"
          className="fill-accent"
        />
        {[52, 66, 80, 94].map((y) => (
          <rect
            key={y}
            x="31"
            y={y}
            width={y === 52 ? 52 : y === 66 ? 44 : 48}
            height="5"
            rx="2.5"
            className="fill-border-2"
          />
        ))}
        {/* Page content filling in */}
        <rect
          x="112"
          y="34"
          width="96"
          height="7"
          rx="3.5"
          className="fill-border-2"
        />
        {[52, 64, 76].map((y) => (
          <rect
            key={y}
            x="112"
            y={y}
            width={y === 76 ? 108 : 168}
            height="5"
            rx="2.5"
            className="fill-border-2"
          />
        ))}
        <rect
          x="112"
          y="96"
          width="80"
          height="22"
          rx="6"
          className="fill-accent-tint stroke-accent"
          strokeWidth="1"
        />
        <rect
          x="124"
          y="105"
          width="40"
          height="5"
          rx="2.5"
          className="fill-accent"
        />
        {/* Agent cursor on the action */}
        <circle cx="196" cy="107" r="9" className="fill-accent opacity-20" />
        <path
          d="M193 101l12 6-5 1.5-1.5 5z"
          className="fill-accent"
          strokeWidth="0"
        />
      </svg>
    </div>
  )
}
