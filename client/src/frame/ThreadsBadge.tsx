import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useDungeonCurrent } from '../dungeons/useDungeons';
import { useSession } from '../session/SessionContext';
import { useWorldEvent } from '../world-events/useWorldEvent';

/**
 * The cross-cutting lens for "things in motion" - not a fourth
 * destination alongside Place/People/Body, a query over the flux state
 * of the other three.
 *
 * Represents character awareness, not player/meta awareness (Phase 2
 * design discussion): a dungeon run in progress is the character's own
 * ongoing action, so it's shown regardless of where they currently
 * stand. A world event is checked only for the character's *current*
 * city, never every city - a badge reporting "something's happening in
 * Ashford" while standing in Haven, with no in-fiction way the character
 * could know that, would be an omniscient status feed wearing this
 * lens's clothes. RESOLVED events are excluded too: once settled, an
 * event isn't a thread anymore, it's a permanent fact about the city
 * (Place), not something still in motion.
 *
 * Noted, not solved here: a character who personally witnessed an event
 * and then leaves stops seeing it here just as completely as one who
 * never saw it at all - collapsing perception and memory into the same
 * rule. Worth watching during play, not guessing at now.
 */
export function ThreadsBadge() {
  const { character } = useSession();
  const { data: dungeonCurrent } = useDungeonCurrent();
  const { data: worldEvent } = useWorldEvent(character?.currentCityId);

  const items: { key: string; content: ReactNode }[] = [];

  if (dungeonCurrent) {
    items.push({
      key: 'dungeon',
      content: (
        <Link to="/dungeon">You're mid-expedition ({dungeonCurrent.name})</Link>
      ),
    });
  }

  if (
    worldEvent &&
    (worldEvent.phase === 'EMERGING' || worldEvent.phase === 'ACTIVE')
  ) {
    // "here", not the event's own name - this only ever checks the
    // character's current city (see the note above), so the location
    // is always implied, never a distant place being named.
    items.push({
      key: 'worldEvent',
      content: 'Something is unfolding here',
    });
  }

  if (items.length === 0) {
    return (
      <div className="threads-badge" title="Things in motion">
        Nothing in motion right now.
      </div>
    );
  }

  return (
    <div className="threads-badge" title="Things in motion">
      {items.map((item) => (
        <div key={item.key}>{item.content}</div>
      ))}
    </div>
  );
}
