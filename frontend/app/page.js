'use client';
import Link from 'next/link';
import { FileArchive, FolderTree, GitCompareArrows, Wifi, Share2, ArrowRight, Sparkles, Zap, Shield, Globe, Layers, Activity, Braces, Github, Heart, Mail, Hash, Dice5 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const tools = [
  {
    href: '/wifi-file-share',
    title: 'WiFi File Share',
    desc: 'Peer-to-peer file transfer over LAN. QR pair, chunked streaming, real-time progress — like AirDrop, but cross-platform.',
    icon: Share2,
    color: 'from-blue-500 via-violet-500 to-fuchsia-500',
    badge: 'NEW',
  },
  {
    href: '/wifi-text-share',
    title: 'WiFi Text Share',
    desc: 'Real-time collaborative editor. Share a room code, type together. Zero latency on the same network.',
    icon: Wifi,
    color: 'from-emerald-500 via-teal-500 to-cyan-500',
  },
  {
    href: '/text-compare',
    title: 'Text Compare',
    desc: 'VS Code-grade diff viewer with syntax highlighting, side-by-side or inline view, and ignore-whitespace controls.',
    icon: GitCompareArrows,
    color: 'from-orange-500 via-rose-500 to-pink-500',
  },
  {
    href: '/folder-compare',
    title: 'Folder Compare',
    desc: 'Diff two local folders side-by-side. See added, removed, and modified files. 100% in-browser — nothing uploaded.',
    icon: FolderTree,
    color: 'from-cyan-500 via-teal-500 to-emerald-500',
    badge: 'NEW',
  },
  {
    href: '/zip-compare',
    title: 'ZIP Compare',
    desc: 'Diff two archives. See added, removed, and modified files. Inspect contents without extracting.',
    icon: FileArchive,
    color: 'from-yellow-500 via-amber-500 to-orange-500',
  },
  {
    href: '/json-studio',
    title: 'JSON Studio',
    desc: 'Validate, beautify, and inspect JSON. Live error markers, interactive tree, JSONPath query, schema validation, and conversion to YAML / XML / CSV / TypeScript.',
    icon: Braces,
    color: 'from-emerald-500 via-teal-500 to-cyan-500',
    badge: 'NEW',
  },
];

const features = [
  {
    icon: Zap,
    title: 'Blazing fast peer-to-peer performance',
    desc: 'DevHub uses direct WebRTC data channels between browsers, so transfers run at the full speed of your local network — typically 50–200 MB/s on a modern LAN. There is no upload-then-download round trip through a third-party server, no queue, and no rate limit. Diff, hash, and JSON operations run in WebAssembly and Web Workers, keeping the UI at 60 fps even on multi-megabyte payloads.',
  },
  {
    icon: Shield,
    title: 'Private by default — your data never leaves your device',
    desc: 'Every WebRTC session is end-to-end encrypted with DTLS-SRTP and uses an ephemeral room code that self-destructs after the last participant disconnects. Local tools (ZIP/Folder/Text diff, JSON Studio, Hash & Random generators) execute entirely client-side; nothing is uploaded, logged, or persisted. DevHub does not require an account, does not set tracking cookies, and does not embed analytics SDKs.',
  },
  {
    icon: Globe,
    title: 'Cross-platform and zero-install',
    desc: 'DevHub runs in any modern browser — Chrome, Edge, Firefox, Safari, Brave, Arc — on Windows, macOS, Linux, iOS, Android, and Chromebooks. No installers, no system permissions, no app-store reviews. Add the page to your home screen and it behaves like a native PWA with a dark-mode UI, offline caching of static assets, and full keyboard shortcuts.',
  },
  {
    icon: Layers,
    title: 'Chunked streaming for multi-gigabyte transfers',
    desc: 'Files are split into ordered 256 KB chunks, streamed across the data channel with backpressure-aware flow control, and reassembled on the receiver with byte-exact integrity. You get real-time progress, ETA, average throughput, and pause/resume. Transfers above 1 GB have been validated end-to-end, and the receiver writes to disk via the File System Access API where available, so RAM usage stays flat regardless of file size.',
  },
];

export default function Dashboard() {
  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-0 grid-bg opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/40 to-background" />
        <div className="relative container mx-auto px-6 py-16 lg:py-24">
          <div>
            <Badge variant="secondary" className="mb-5 gap-1.5 bg-card/60 backdrop-blur border-border/80">
              <Sparkles className="h-3 w-3 text-blue-400" />
              Developer Utility Platform · v1.0
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.05] max-w-4xl">
              The toolkit for <span className="gradient-text">debugging</span>,
              <br />sharing & shipping faster.
            </h1>
            <p className="mt-5 text-base md:text-lg text-muted-foreground max-w-2xl">
              Four cohesive tools — ZIP compare, text diff, real-time text collaboration,
              and peer-to-peer file sharing. All in one workspace, zero accounts required.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/wifi-file-share">
                <Button size="lg" className="gap-2 bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600 text-white border-0">
                  Start sharing files <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/text-compare">
                <Button size="lg" variant="outline" className="gap-2">
                  Open text diff
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Tools */}
      <section className="container mx-auto px-6 py-12">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">Tools</h2>
            <p className="text-sm text-muted-foreground">Pick one. They all talk to each other.</p>
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
            <Activity className="h-3.5 w-3.5 text-emerald-400" /> Local instance running
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tools.map((t) => {
            const Icon = t.icon;
            return (
              <Link key={t.href} href={t.href}>
                <Card className="group relative overflow-hidden glass hover:border-foreground/20 transition-all hover:shadow-xl hover:shadow-blue-500/5 cursor-pointer">
                  <div className={`absolute -top-12 -right-12 h-40 w-40 rounded-full bg-gradient-to-br ${t.color} opacity-10 group-hover:opacity-20 blur-2xl transition-opacity`} />
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${t.color} grid place-items-center shadow-lg shadow-black/10`}>
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      {t.badge && (
                        <Badge className="bg-blue-500/15 text-blue-300 border border-blue-500/30">{t.badge}</Badge>
                      )}
                    </div>
                    <h3 className="text-lg font-semibold mb-1.5">{t.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{t.desc}</p>
                    <div className="mt-4 flex items-center gap-1.5 text-sm font-medium text-foreground/70 group-hover:text-foreground transition">
                      Open <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-6 pb-16">
        <div className="mb-8">
          <h2 className="text-xl font-semibold">Why DevHub</h2>
          <p className="text-sm text-muted-foreground">Built for speed, privacy, and reliability.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <Card key={f.title} className="glass p-6">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 border border-blue-500/20 grid place-items-center mb-4">
                  <Icon className="h-5 w-5 text-blue-400" />
                </div>
                <h3 className="font-semibold text-base mb-2 leading-snug">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </Card>
            );
          })}
        </div>
      </section>

      {/* SEO content — in-depth, crawlable copy describing every tool */}
      <section className="border-t border-border/60 bg-card/20" aria-labelledby="about-devhub">
        <div className="container mx-auto px-6 py-16 max-w-5xl">
          <h2 id="about-devhub" className="text-2xl md:text-3xl font-semibold tracking-tight mb-4">
            About DevHub — a unified workspace for everyday developer tasks
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            DevHub bundles the small, repetitive tasks every engineer performs into a single,
            zero-account web workspace. Diff two archives without unzipping them. Compare a
            local folder against a release snapshot. Spot the one character that broke your
            JSON config. Move a 2&nbsp;GB build artifact from your laptop to a teammate&apos;s
            machine without uploading it to a third-party server. Everything runs in your
            browser — and when peers communicate, it&apos;s over an encrypted WebRTC channel
            negotiated directly between devices.
          </p>
          <p className="text-muted-foreground leading-relaxed mb-10">
            We built DevHub because switching between five different tabs for five different
            tools wastes hours every week. With one consistent keyboard-driven UI, a shared
            dark theme, and a command palette (<kbd className="text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded">⌘K</kbd>),
            DevHub turns chores into flow.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-lg font-semibold mb-2">ZIP &amp; archive comparison</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Drop in two <code>.zip</code> files and DevHub diffs their trees side-by-side —
                added, removed, modified, identical. Click any modified file to open it in an
                inline Monaco diff editor with syntax highlighting. Nothing is uploaded; the
                archives are parsed entirely in the browser with JSZip.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">Folder comparison</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Pick two directories from your filesystem and DevHub walks them recursively,
                showing every diverging file, with byte-for-byte change detection and content
                preview. Ideal for verifying a deploy, reviewing a backup, or sanity-checking a
                merge result.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">Text diff with VS-Code-grade UX</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Paste two snippets — logs, configs, queries, anything — and see a line-by-line
                or inline diff powered by the same engine Visual Studio Code uses. Toggle
                whitespace sensitivity, word-wrap, and theme; copy a single change to clipboard.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">JSON Studio</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Validate, beautify, and explore JSON with live error markers, an interactive
                tree view, JSONPath queries, JSON-Schema validation, and one-click conversion
                to YAML, XML, CSV, or TypeScript types. Handles JSON5 input too.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">Hash Generator</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Compute MD5, SHA-1, SHA-256, SHA-512, SHA-3, BLAKE2, and CRC-32 over any
                string or file. Backed by WebAssembly for native-speed hashing of multi-gigabyte
                inputs — without ever leaving your machine.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">Random Generator</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Crypto-grade random UUIDs, passwords, tokens, base32/64 secrets, lorem ipsum,
                dates, integers, floats, and per-locale names. Every generator uses
                <code> window.crypto.getRandomValues</code>, never <code>Math.random</code>.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">WiFi Text Share — real-time collaborative editing</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Spin up an ephemeral room, share a 4-digit code or QR, and start typing together.
                Connections are negotiated through WebRTC with STUN+TURN fallback so peers on
                different networks still connect. Host can lock editing to read-only at any
                time, change syntax language, and force-resync the document.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">WiFi File Share — P2P like AirDrop</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Cross-platform peer-to-peer transfer over an encrypted WebRTC data channel.
                Chunked streaming with progress, ETA, and pause/resume; transfers up to
                1&nbsp;GB+ per file. Files never touch a server — only a tiny signaling room
                code is exchanged to bootstrap the connection.
              </p>
            </div>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-lg font-semibold mb-2">Privacy &amp; security</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                DevHub does not collect telemetry, does not require sign-up, and stores nothing
                on a remote server. WebRTC sessions use DTLS-encrypted data channels and
                ephemeral room codes that expire after the last participant leaves.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">Works everywhere a modern browser does</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Chrome, Edge, Firefox, Safari, and their mobile counterparts. No installation,
                no plugins. Add DevHub to your home screen and it behaves like a native PWA on
                phones and tablets.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">Keyboard-first</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                A global command palette (<kbd className="text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded">⌘K</kbd>),
                collapsible sidebar (<kbd className="text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded">⌘B</kbd>),
                and consistent shortcuts inside every tool keep your hands on the keyboard.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">Open architecture</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Built on Next.js, Tailwind CSS, shadcn/ui, Monaco, JSZip, hash-wasm, and
                WebRTC. Every tool runs entirely client-side; the only server role is a
                tiny signaling endpoint that relays SDP &amp; ICE candidates between peers.
              </p>
            </div>
          </div>

          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mt-16 mb-4">
            Frequently asked questions
          </h2>
          <div className="space-y-5">
            <div>
              <h3 className="font-medium mb-1">Is DevHub free?</h3>
              <p className="text-sm text-muted-foreground">Yes. Every tool on DevHub is free and unmetered.</p>
            </div>
            <div>
              <h3 className="font-medium mb-1">Do my files leave my computer?</h3>
              <p className="text-sm text-muted-foreground">
                No. All diffing, hashing, and JSON processing happens in your browser. For
                WiFi File Share and WiFi Text Share, content travels over an encrypted WebRTC
                channel directly between participants; the server only relays a few KB of
                signaling messages to negotiate the connection.
              </p>
            </div>
            <div>
              <h3 className="font-medium mb-1">Do I need an account?</h3>
              <p className="text-sm text-muted-foreground">No accounts, no email, no logins.</p>
            </div>
            <div>
              <h3 className="font-medium mb-1">What is the largest file I can share?</h3>
              <p className="text-sm text-muted-foreground">
                Tested with 1&nbsp;GB files; there is no hard cap because chunks are streamed
                directly between peers. Practical limits depend on network speed and browser
                memory.
              </p>
            </div>
            <div>
              <h3 className="font-medium mb-1">Why might two devices fail to connect?</h3>
              <p className="text-sm text-muted-foreground">
                Some carrier-grade NATs block direct WebRTC. DevHub falls back to a public
                TURN relay so the session still works — at the cost of a small extra latency.
                If you hit a stubborn network, try a different WiFi or hotspot.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 bg-card/30">
        <div className="container mx-auto px-6 py-14">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
            {/* Brand */}
            <div className="md:col-span-1">
              <Link href="/" className="flex items-center gap-2.5 mb-3" rel="home" aria-label="DevHub Homepage">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 via-violet-500 to-fuchsia-500 grid place-items-center shadow-lg shadow-violet-500/20">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <div>
                  <div className="font-semibold text-[15px] leading-tight">DevHub</div>
                  <div className="text-[11px] text-muted-foreground leading-tight">Developer Utility Platform</div>
                </div>
              </Link>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Free, privacy-first developer utilities. Diff, compare, validate, hash, and share —
                all in one workspace, zero accounts required.
              </p>
            </div>

            {/* Compare tools */}
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3 font-medium">Compare</div>
              <ul className="space-y-2 text-sm">
                <li><Link href="/text-compare" className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-2"><GitCompareArrows className="h-3.5 w-3.5" /> Text Compare</Link></li>
                <li><Link href="/folder-compare" className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-2"><FolderTree className="h-3.5 w-3.5" /> Folder Compare</Link></li>
                <li><Link href="/zip-compare" className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-2"><FileArchive className="h-3.5 w-3.5" /> ZIP Compare</Link></li>
              </ul>
            </div>

            {/* Generate / Inspect tools */}
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3 font-medium">Inspect &amp; generate</div>
              <ul className="space-y-2 text-sm">
                <li><Link href="/json-studio" className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-2"><Braces className="h-3.5 w-3.5" /> JSON Studio</Link></li>
                <li><Link href="/hash-generator" className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-2"><Hash className="h-3.5 w-3.5" /> Hash Generator</Link></li>
                <li><Link href="/random-generator" className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-2"><Dice5 className="h-3.5 w-3.5" /> Random Generator</Link></li>
              </ul>
            </div>

            {/* Share tools */}
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3 font-medium">Share over WiFi</div>
              <ul className="space-y-2 text-sm">
                <li><Link href="/wifi-text-share" className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-2"><Wifi className="h-3.5 w-3.5" /> WiFi Text Share</Link></li>
                <li><Link href="/wifi-file-share" className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-2"><Share2 className="h-3.5 w-3.5" /> WiFi File Share</Link></li>
              </ul>
              <div className="mt-5 text-xs uppercase tracking-wider text-muted-foreground mb-3 font-medium">Resources</div>
              <ul className="space-y-2 text-sm">
                <li><a href="/sitemap.xml" className="text-muted-foreground hover:text-foreground transition-colors">Sitemap</a></li>
                <li><a href="/robots.txt" className="text-muted-foreground hover:text-foreground transition-colors">Robots</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-border/60 pt-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} DevHub. All tools run locally in your browser.
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Activity className="h-3 w-3 text-emerald-400" /> Local instance · v1.0
              </span>
              <span className="hidden md:inline">·</span>
              <span className="inline-flex items-center gap-1.5">
                Built with <Heart className="h-3 w-3 text-rose-400 fill-rose-400" /> for developers
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
