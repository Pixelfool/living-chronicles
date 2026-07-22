import { Link } from 'react-router-dom';
import { useSession } from '../session/SessionContext';
import { useCities } from '../world/useWorldData';

/**
 * Single responsibility, on purpose: character name/HP/AP/gold (Body's
 * current state) and the current city (Place identity). Nothing else
 * ever belongs here - a quest count, a pending-trade badge, or any other
 * "one more indicator" is the ThreadsBadge's job, not this one's. Any
 * future change that wants to add a second kind of information to the
 * StatusBar should be treated as a design smell, not a small addition.
 */
export function StatusBar() {
  const { character } = useSession();
  const { data: cities } = useCities();

  if (!character) {
    return null;
  }

  const cityName =
    cities?.find((city) => city.id === character.currentCityId)?.name ??
    character.currentCityId;

  return (
    <div className="status-bar">
      <Link to="/character" className="status-bar__name">
        {character.name}
      </Link>
      <span className="status-bar__stat">
        {character.hp} / {character.maxHp} HP
      </span>
      <span className="status-bar__stat">
        {character.actionPoints} / {character.maxActionPoints} AP
      </span>
      <span className="status-bar__stat">{character.gold} gold</span>
      <span className="status-bar__place">{cityName}</span>
    </div>
  );
}
