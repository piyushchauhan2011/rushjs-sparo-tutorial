import { ApiError } from '@hotel/api-client';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@hotel/ui';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import * as React from 'react';

import { useAuth } from '../lib/auth.js';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      void navigate({ to: '/' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to log in');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader>
        <CardTitle>Log in</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={isSubmitting}>
            Log in
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            No account?{' '}
            <Link to="/register" className="underline">
              Register
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
