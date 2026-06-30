import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import AppToaster from '@/components/AppToaster';
import AppShell from '@/components/AppShell';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://dev-toolkit-replica.preview.emergentagent.com';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'DevHub — Developer Utility Platform | Free Online Dev Tools',
    template: '%s · DevHub',
  },
  description:
    'DevHub is a free, privacy-first developer utility platform. Compare ZIPs & folders, diff text side-by-side, generate hashes, validate JSON, and share files or text peer-to-peer over WiFi — all in one workspace, no accounts required.',
  keywords: [
    'developer tools',
    'dev tools',
    'zip compare',
    'folder compare',
    'text compare',
    'json studio',
    'json validator',
    'hash generator',
    'random generator',
    'wifi file share',
    'wifi text share',
    'p2p file transfer',
    'webrtc file share',
    'airdrop alternative',
    'online diff viewer',
    'free developer utilities',
  ],
  authors: [{ name: 'DevHub' }],
  creator: 'DevHub',
  publisher: 'DevHub',
  applicationName: 'DevHub',
  category: 'developer tools',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'DevHub',
    title: 'DevHub — Developer Utility Platform',
    description:
      'ZIP & folder compare, text diff, JSON studio, hash & random generators, and peer-to-peer WiFi file/text sharing. All in one workspace.',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DevHub — Developer Utility Platform',
    description:
      'Free, privacy-first developer toolkit: diff, compare, validate, hash, share — all in one place.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: '/icon.svg',
  },
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1020' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: 'DevHub',
        description:
          'Developer Utility Platform — ZIP & folder compare, text diff, JSON studio, hash & random generators, P2P WiFi file & text sharing.',
        inLanguage: 'en-US',
      },
      {
        '@type': 'SoftwareApplication',
        name: 'DevHub',
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Web',
        url: SITE_URL,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        description:
          'Free online developer utilities: file & folder diff, text diff, JSON validator, hash & random generators, WebRTC P2P sharing.',
      },
    ],
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="canonical" href={`${SITE_URL}/`} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="font-sans antialiased min-h-screen scrollbar-thin" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <AppShell>{children}</AppShell>
          <AppToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
