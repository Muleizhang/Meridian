import { redirect } from 'next/navigation';
import { getEditSession } from '@/lib/session';
import { LoginForm } from '@/components/LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const session = await getEditSession();

  if (session.loggedIn) {
    redirect('/edit');
  }

  return <LoginForm />;
}
