import { redirect } from 'next/navigation';
import { getEditSession } from '@/lib/session';
import { LoginForm } from '@/components/LoginForm';

export const dynamic = 'force-dynamic';

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function toEditTarget(next: string | string[] | undefined) {
  const value = Array.isArray(next) ? next[0] : next;
  if (!value || !value.startsWith('/')) {
    return '/edit';
  }

  const [path, query = ''] = value.split('?', 2);
  const normalizedPath = path === '/' ? '/edit' : path === '/edit' ? '/edit' : null;
  if (!normalizedPath) {
    return '/edit';
  }

  return query ? `${normalizedPath}?${query}` : normalizedPath;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getEditSession();
  const params = await searchParams;

  if (session.loggedIn) {
    redirect(toEditTarget(params.next));
  }

  return <LoginForm />;
}
