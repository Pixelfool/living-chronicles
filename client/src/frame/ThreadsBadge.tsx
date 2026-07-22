/**
 * The cross-cutting lens for "things in motion" - not a fourth
 * destination alongside Place/People/Body, a query over the flux state
 * of the other three. Phase 1 has no real contributor yet (world
 * events, quests, crafting, and trades all land in later phases), so
 * this renders an honest empty state now rather than being skipped -
 * later phases populate it without the frame needing to change shape.
 */
export function ThreadsBadge() {
  return (
    <div className="threads-badge" title="Things in motion">
      Nothing in motion right now.
    </div>
  );
}
