import { Link } from 'react-router-dom';
import { useSession } from '../session/SessionContext';

/**
 * Body's noun-state: stats, level/xp, profession, from GET
 * /characters/me alone. No inventory section yet - that's a later
 * phase, and half-aggregating it now would just be a worse version of
 * the screen Phase 3 actually builds.
 */
export function CharacterSheetPage() {
  const { character, logout } = useSession();

  if (!character) {
    return null;
  }

  return (
    <div className="character-sheet">
      <p>
        <Link to="/">← Back</Link>
      </p>
      <h1>{character.name}</h1>
      <p className="character-sheet__archetype">{character.archetype}</p>
      <dl>
        <dt>Level</dt>
        <dd>
          {character.level} ({character.xp} xp)
        </dd>
        <dt>Body / Mind / Presence</dt>
        <dd>
          {character.body} / {character.mind} / {character.presence}
        </dd>
        <dt>HP</dt>
        <dd>
          {character.hp} / {character.maxHp}
        </dd>
        <dt>Action Points</dt>
        <dd>
          {character.actionPoints} / {character.maxActionPoints}
        </dd>
        <dt>Gold</dt>
        <dd>{character.gold}</dd>
        <dt>Profession</dt>
        <dd>
          {character.profession
            ? `${character.profession} (level ${character.professionLevel})`
            : 'None chosen yet'}
        </dd>
      </dl>
      <button onClick={() => void logout()}>Log out</button>
    </div>
  );
}
