'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ThemeToggleButton } from '@/components/ThemeToggleButton';

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? '登录失败');
      }

      router.replace('/edit');
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '登录失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center bg-[var(--background)] px-4 py-8 text-[var(--foreground)]">
      <div className="absolute right-4 top-4 z-10 md:right-6 md:top-6">
        <ThemeToggleButton />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="meridian-panel w-full max-w-md rounded-[2rem] p-6 md:p-8"
      >
        <div className="text-2xl font-semibold">Meridian</div>
        <p className="meridian-muted-text mt-2 text-sm">输入编辑密码以进入记录维护模式。</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <div className="meridian-muted-text-strong mb-2 text-sm">编辑密码</div>
            <input
              type="password"
              className="meridian-input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
            />
          </label>

          {error ? <div className="text-sm text-red-600">{error}</div> : null}

          <button type="submit" className="meridian-button w-full" disabled={isSubmitting || !password}>
            {isSubmitting ? '登录中…' : '登录'}
          </button>
        </form>
      </motion.div>
    </main>
  );
}
