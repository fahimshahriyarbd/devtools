import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import AppToaster from '@/components/AppToaster';
import AppShell from '@/components/AppShell';

export const metadata = {
  title: 'DevHub — Developer Utility Platform',
  description: 'ZIP Compare · Text Diff · WiFi File Share · Real-time Collaboration',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <AppShell>{children}</AppShell>
          <AppToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
