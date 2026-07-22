import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { FightResult, Region, TravelResult } from '../api-types';
import { useMonsters } from '../combat/useMonsters';
import { useSession } from '../session/SessionContext';
import { useCities, useRoutes } from '../world/useWorldData';

type Panel = 'none' | 'travel' | 'combat';

/**
 * The backend's log lines only ever describe the fight itself
 * (resolveBeat/describeBattle don't know about leveling) - this is where
 * that easily-missed fact actually becomes visible to the player instead
 * of silently changing the character underneath them. Leveling up also
 * fully heals a character (character/leveling.ts) - without this line, a
 * character showing full HP right after a fight they clearly took
 * damage in reads as a bug, not a level-up.
 *
 * Deliberately says nothing about loot, even though fight results carry
 * a lootItemId: with no Inventory screen until Phase 3, "you found
 * something" would be a claim this client can't back up anywhere - the
 * same reason a regen countdown isn't faked either (see
 * SessionContext.tsx). Add this back the moment Inventory actually
 * exists to substantiate it, not before.
 */
function appendOutcomeNotes(log: string[], leveledUp: boolean): string[] {
  const notes = [...log];
  if (leveledUp) {
    notes.push('You leveled up!');
  }
  return notes;
}

/**
 * The resting state (Phase 1 plan): answers "why should I care" before
 * "what can I do." Never its own dashboard - a short arrival/return
 * line, the place itself, then a small number of things a character can
 * do here, phrased as things a character does. Travel and combat both
 * stay inline (the design heuristic: an interaction that begins and
 * resolves in the current context stays in that context) rather than
 * becoming their own routes.
 */
export function CityHubPage() {
  const { character, checkIn, settleCheckIn } = useSession();
  const { data: cities } = useCities();
  const { data: routes } = useRoutes();
  const queryClient = useQueryClient();

  // Captured once, at mount, so this stays true for the whole time this
  // City Hub instance is on screen even after the session-wide checkIn
  // flips to 'settled' moments later - the arrival framing shouldn't
  // vanish the instant it appears. A fresh mount later (navigating away
  // and back) reads whatever checkIn is by then, which is 'settled'
  // unless a new login/character-creation/session-restore just happened.
  const [showArrival] = useState(() => checkIn === 'arriving');
  useEffect(() => {
    settleCheckIn();
  }, [settleCheckIn]);

  const [panel, setPanel] = useState<Panel>('none');
  const [encounterLog, setEncounterLog] = useState<string[] | null>(null);
  const [fightLog, setFightLog] = useState<string[] | null>(null);

  const { data: monsters } = useMonsters();

  // Cancelling any in-flight character fetch before a mutation's onSuccess
  // writes fresh data closes a real race: the periodic refetchInterval
  // poll (or a window-refocus refetch) can be mid-flight when a fight or
  // trip resolves, and if that stale response lands after our fresh
  // write, it silently overwrites it - which is exactly what "HP not
  // updated until I reload" looks like from the outside.
  const characterQueryKey = ['character', 'me'];

  const travelMutation = useMutation({
    mutationFn: (toCityId: string) =>
      apiFetch<TravelResult>('POST', '/world/travel', { toCityId }),
    onMutate: () => queryClient.cancelQueries({ queryKey: characterQueryKey }),
    onSuccess: (result) => {
      queryClient.setQueryData(characterQueryKey, result.character);
      setEncounterLog(
        result.encounter
          ? appendOutcomeNotes(result.encounter.log, result.encounter.leveledUp)
          : null,
      );
      setFightLog(null);
      setPanel('none');
    },
  });

  const fightMutation = useMutation({
    mutationFn: (monsterId: string) =>
      apiFetch<FightResult>('POST', '/combat/fight', { monsterId }),
    onMutate: () => queryClient.cancelQueries({ queryKey: characterQueryKey }),
    onSuccess: (result) => {
      queryClient.setQueryData(characterQueryKey, result.character);
      setFightLog(appendOutcomeNotes(result.log, result.leveledUp));
      setEncounterLog(null);
    },
  });

  if (!character) {
    return null;
  }

  const city = cities?.find(
    (candidate) => candidate.id === character.currentCityId,
  );
  const reachableRoutes: { region: Region; toCityId: string }[] =
    routes
      ?.filter((region) => region.cities.includes(character.currentCityId))
      .map((region) => ({
        region,
        toCityId: region.cities.find((id) => id !== character.currentCityId)!,
      })) ?? [];

  const isRested = character.actionPoints >= character.maxActionPoints * 0.9;

  return (
    <div className="city-hub">
      {showArrival && (
        <p className="city-hub__arrival">
          {isRested
            ? 'You feel rested.'
            : `You're back in ${city?.name ?? 'the city'}.`}
        </p>
      )}

      {/*
        Deliberately the first thing on the page, not the last: this used
        to render at the bottom, after the (by-then-collapsed) travel
        panel - meaning something as significant as an ambush along the
        road could resolve below whatever the player was last looking at,
        easy to miss entirely if AP happened to be high enough to stop
        them from digging further. An encounter is exactly the kind of
        thing that should be impossible to miss.
      */}
      {encounterLog && (
        <div className="city-hub__log city-hub__log--encounter">
          <h2>Something happened on the road</h2>
          {encounterLog.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
        </div>
      )}

      {fightLog && (
        <div className="city-hub__log city-hub__log--encounter">
          <h2>The fight</h2>
          {fightLog.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
        </div>
      )}

      <h1>{city?.name ?? 'Somewhere'}</h1>
      <p className="city-hub__description">{city?.description}</p>

      <div className="city-hub__actions">
        <button
          onClick={() => setPanel(panel === 'travel' ? 'none' : 'travel')}
        >
          Leave {city?.name ?? 'the city'}
        </button>
        <button
          onClick={() => setPanel(panel === 'combat' ? 'none' : 'combat')}
        >
          Look for a fight
        </button>
      </div>

      {panel === 'travel' && (
        <div className="city-hub__panel">
          <h2>The roads out of {city?.name}</h2>
          {reachableRoutes.length === 0 && (
            <p>No roads lead anywhere from here.</p>
          )}
          <ul>
            {reachableRoutes.map(({ region, toCityId }) => (
              <li key={region.id}>
                <button
                  disabled={travelMutation.isPending}
                  onClick={() => travelMutation.mutate(toCityId)}
                >
                  {region.description} ({region.travelCost} AP)
                </button>
              </li>
            ))}
          </ul>
          {travelMutation.isError && (
            <p className="city-hub__error">{travelMutation.error.message}</p>
          )}
        </div>
      )}

      {panel === 'combat' && (
        <div className="city-hub__panel">
          <h2>Something to fight</h2>
          <ul>
            {(monsters ?? []).map((monster) => (
              <li key={monster.id}>
                <button
                  disabled={fightMutation.isPending}
                  onClick={() => fightMutation.mutate(monster.id)}
                >
                  {monster.name} ({monster.hp} HP)
                </button>
              </li>
            ))}
          </ul>
          {fightMutation.isError && (
            <p className="city-hub__error">{fightMutation.error.message}</p>
          )}
        </div>
      )}
    </div>
  );
}
