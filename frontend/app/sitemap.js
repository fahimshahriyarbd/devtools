const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://dev-toolkit-replica.preview.emergentagent.com';

// Per-route SEO metadata. Higher priority on the homepage and the most-searched
// tools; weekly changefreq on dashboard/highly-used tools, monthly on stable
// utility tools. Update timestamps per-route so search engines can prioritise
// the freshest pages.
const NOW = new Date();

const ROUTES = [
  { path: '',                 priority: 1.0, changeFrequency: 'weekly'  },
  { path: 'wifi-file-share',  priority: 0.9, changeFrequency: 'weekly'  },
  { path: 'wifi-text-share',  priority: 0.9, changeFrequency: 'weekly'  },
  { path: 'json-studio',      priority: 0.9, changeFrequency: 'weekly'  },
  { path: 'text-compare',     priority: 0.8, changeFrequency: 'monthly' },
  { path: 'folder-compare',   priority: 0.8, changeFrequency: 'monthly' },
  { path: 'zip-compare',      priority: 0.8, changeFrequency: 'monthly' },
  { path: 'hash-generator',   priority: 0.7, changeFrequency: 'monthly' },
  { path: 'random-generator', priority: 0.7, changeFrequency: 'monthly' },
];

export default function sitemap() {
  return ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: path ? `${SITE_URL}/${path}` : `${SITE_URL}/`,
    lastModified: NOW,
    changeFrequency,
    priority,
  }));
}
