import { FormEvent, useState } from 'react';
import { ApiError } from '../api';
import { Archetype } from '../api-types';
import { useSession } from '../session/SessionContext';

const ARCHETYPES: { value: Archetype; label: string; blurb: string }[] = [
  { value: 'DUELIST', label: 'Duelist', blurb: 'Leans on Body.' },
  { value: 'SCHOLAR', label: 'Scholar', blurb: 'Leans on Mind.' },
  { value: 'DIPLOMAT', label: 'Diplomat', blurb: 'Leans on Presence.' },
];

export function CreateCharacterPage() {
  const { createCharacter } = useSession();
  const [name, setName] = useState('');
  const [archetype, setArchetype] = useState<Archetype>('DUELIST');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createCharacter(name, archetype);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <h1>Who are you?</h1>
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="auth-page__form"
      >
        <label>
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            minLength={2}
            maxLength={20}
            required
          />
        </label>
        <fieldset className="archetype-picker">
          <legend>Archetype</legend>
          {ARCHETYPES.map((option) => (
            <label key={option.value} className="archetype-picker__option">
              <input
                type="radio"
                name="archetype"
                value={option.value}
                checked={archetype === option.value}
                onChange={() => setArchetype(option.value)}
              />
              <strong>{option.label}</strong> — {option.blurb}
            </label>
          ))}
        </fieldset>
        {error && <p className="auth-page__error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Stepping into the world...' : 'Step into the world'}
        </button>
      </form>
    </div>
  );
}
