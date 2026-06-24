'use client';
import Link from 'next/link';
import { FileArchive, FolderTree, GitCompareArrows, Wifi, Share2, ArrowRight, Sparkles, Zap, Shield, Globe, Layers, Activity } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const tools = [
  {
    href: '/wifi-fileshare',
    title: 'WiFi File Share',
    desc: 'Peer-to-peer file transfer over LAN. QR pair, chunked streaming, real-time progress — like AirDrop, but cross-platform.',
    icon: Share2,
    color: 'from-blue-500 via-violet-500 to-fuchsia-500',
    badge: 'NEW',
  },
  {
    href: '/wifi-share',
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
];

const features = [
  { icon: Zap, title: 'Blazing fast', desc: 'WebRTC direct P2P. No file ever touches a server.' },
  { icon: Shield, title: 'Private by default', desc: 'Encrypted DTLS data channels, ephemeral rooms.' },
  { icon: Globe, title: 'Cross-platform', desc: 'Works on any modern browser. Mobile, desktop, anywhere.' },
  { icon: Layers, title: 'Chunked streaming', desc: 'Resilient transfers up to 1GB+ with progress + ETA.' },
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
              <Link href="/wifi-fileshare">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <Card key={f.title} className="glass p-5">
                <Icon className="h-5 w-5 text-blue-400 mb-3" />
                <div className="font-medium text-sm mb-1">{f.title}</div>
                <div className="text-xs text-muted-foreground">{f.desc}</div>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
