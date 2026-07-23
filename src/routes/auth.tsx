import { createFileRoute, useNavigate } from '@tanstack/react-router';
import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const Route = createFileRoute('/auth')({
  head: () => ({
    meta: [
      { title: 'Entrar — Automação de Afiliados' },
      { name: 'description', content: 'Acesse sua conta ou cadastre-se para gerenciar sua automação de afiliados.' },
      { property: 'og:title', content: 'Entrar — Automação de Afiliados' },
      { property: 'og:description', content: 'Acesse sua conta ou cadastre-se para gerenciar sua automação de afiliados.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setMessage('Login realizado com sucesso! Redirecionando...');
      navigate({ to: '/dashboard' });
    }
  };

  const handleSignUp = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });

    if (error) {
      setError(error.message);
    } else {
      setMessage('Conta criada com sucesso! Verifique seu e-mail se necessário ou faça login.');
    }
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold tracking-tight">Automação de Afiliados</CardTitle>
          <CardDescription>Entre com sua conta ou cadastre-se para acessar o painel</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">E-mail</label>
              <Input
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Senha</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {message && <p className="text-sm text-emerald-600 font-medium">{message}</p>}

            <div className="flex flex-col gap-2 pt-2">
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Carregando...' : 'Entrar'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={handleSignUp}
                className="w-full"
              >
                Criar Conta
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
