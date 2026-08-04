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
      </head>
      <body className="font-sans antialiased min-h-screen scrollbar-thin" suppressHydrationWarning>
        {/*
          Scripts live in <body> (not <head>) on purpose: some Chrome
          extensions inject their own <script> tag into <head>, which
          shifts our sibling script tags around and triggers a React
          hydration mismatch. Rendering them here keeps their DOM
          position stable and safe from head-level extension injection.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var attrs=['bis_skin_checked','bis_register','data-new-gr-c-s-check-loaded','data-gr-ext-installed','cz-shortcut-listen','data-lt-installed'];function clean(root){for(var i=0;i<attrs.length;i++){var els=root.querySelectorAll('['+attrs[i]+']');for(var j=0;j<els.length;j++){els[j].removeAttribute(attrs[i]);}}}try{clean(document);var mo=new MutationObserver(function(muts){for(var i=0;i<muts.length;i++){var m=muts[i];if(m.type==='attributes'&&attrs.indexOf(m.attributeName)!==-1){m.target.removeAttribute(m.attributeName);}else if(m.addedNodes){for(var k=0;k<m.addedNodes.length;k++){var n=m.addedNodes[k];if(n.nodeType===1){clean(n);}}}}});mo.observe(document.documentElement,{subtree:true,attributes:true,childList:true,attributeFilter:attrs});}catch(e){}})();`,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <AppShell>{children}</AppShell>
          <AppToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
