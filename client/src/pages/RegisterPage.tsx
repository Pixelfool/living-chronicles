import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api';
import { useSession } from '../session/SessionContext';

export function RegisterPage() {
  const { register } = useSession();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(email, username, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <h1>The Living Chronicles</h1>
      <p className="auth-page__tagline">Every world writes its own legend.</p>
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="auth-page__form"
      >
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label>
          Username
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            minLength={3}
            maxLength={24}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        {error && <p className="auth-page__error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Arriving...' : 'Begin your story'}
        </button>
      </form>
      <p>
        Already have a character? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
