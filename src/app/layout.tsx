import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { ThemeProvider, type Theme } from '@/components/ThemeProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Meridian',
  description: 'A private travel journal mapped across the world.'
};

function getThemeFromCookie(value: string | undefined): Theme {
  return value === 'dark' ? 'dark' : 'light';
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const initialTheme = getThemeFromCookie(cookieStore.get('meridian-theme')?.value);

  return (
    <html
      lang="zh-CN"
      className={initialTheme}
      data-theme={initialTheme}
      data-theme-ready="true"
      style={{
        colorScheme: initialTheme,
        backgroundColor: initialTheme === 'dark' ? '#0d1117' : '#f7f6f2'
      }}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider initialTheme={initialTheme}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
