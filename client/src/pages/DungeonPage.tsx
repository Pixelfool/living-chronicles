import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api';
import {
  DungeonActionResult,
  DungeonRetreatResult,
  DungeonThreshold,
} from '../api-types';
import { useDungeonCurrent, useDungeonList } from '../dungeons/useDungeons';

const characterQueryKey = ['character', 'me'];
const dungeonCurrentQueryKey = ['dungeons', 'current'];

/**
 * A threshold, not a route (M11 design language) - its own screen,
 * unlike Travel/Combat/World-Event-responses, which all stay inline in
 * City Hub because they resolve instantly with no state of their own.
 * A dungeon run is multi-beat and has a real retreat-or-press-on
 * decision at every step.
 */
export function DungeonPage() {
  const queryClient = useQueryClient();
  const { data: current } = useDungeonCurrent();
  const { data: dungeons } = useDungeonList();

  const [log, setLog] = useState<string[] | null>(null);
  const [outcome, setOutcome] = useState<'cleared' | 'retreated' | null>(null);

  // Eager, not lazy - the threshold read is free and repeatable
  // (DungeonsService.getThreshold), so there's no reason to make a
  // player click to see it.
  const thresholdQueries = useQueries({
    queries: (dungeons ?? []).map((dungeon) => ({
      queryKey: ['dungeons', 'threshold', dungeon.id],
      queryFn: () =>
        apiFetch<DungeonThreshold>(
          'GET',
          `/world/dungeons/${dungeon.id}/threshold`,
        ),
      enabled: !current,
    })),
  });

  // enter/advance don't return an updated character, unlike travel/
  // combat/world-events (see DungeonActionResult in api-types.ts) - a
  // real API inconsistency found by building this screen, not something
  // to paper over. Refetch instead of writing from the response.
  const enterMutation = useMutation({
    mutationFn: (dungeonId: string) =>
      apiFetch<DungeonActionResult>(
        'POST',
        `/world/dungeons/${dungeonId}/enter`,
      ),
    onMutate: () => queryClient.cancelQueries({ queryKey: characterQueryKey }),
    onSuccess: (result) => {
      setLog(result.beatLog);
      setOutcome(result.cleared ? 'cleared' : null);
      void queryClient.invalidateQueries({ queryKey: characterQueryKey });
      void queryClient.invalidateQueries({ queryKey: dungeonCurrentQueryKey });
    },
  });

  const advanceMutation = useMutation({
    mutationFn: () =>
      apiFetch<DungeonActionResult>('POST', '/world/dungeons/current/advance'),
    onMutate: () => queryClient.cancelQueries({ queryKey: characterQueryKey }),
    onSuccess: (result) => {
      setLog(result.beatLog);
      setOutcome(result.cleared ? 'cleared' : null);
      void queryClient.invalidateQueries({ queryKey: characterQueryKey });
      void queryClient.invalidateQueries({ queryKey: dungeonCurrentQueryKey });
    },
  });

  const retreatMutation = useMutation({
    mutationFn: () =>
      apiFetch<DungeonRetreatResult>('POST', '/world/dungeons/current/retreat'),
    onSuccess: () => {
      setOutcome('retreated');
      void queryClient.invalidateQueries({ queryKey: dungeonCurrentQueryKey });
    },
  });

  // No auto-navigate on cleared/retreated - the player keeps control of
  // when they leave this moment, not yanked back to City Hub the
  // instant it resolves.
  if (outcome) {
    return (
      <div className="dungeon-page">
        <p className="dungeon-page__outcome">
          {outcome === 'cleared' ? 'You cleared it.' : 'You retreated, safe.'}
        </p>
        <Link to="/">Back to the city</Link>
      </div>
    );
  }

  if (current) {
    return (
      <div className="dungeon-page">
        <h1>{current.name}</h1>
        <p>
          Beat {current.currentBeat} of {current.totalBeats}
        </p>
        {log && (
          <div className="dungeon-page__log">
            {log.map((line, index) => (
              <p key={index}>{line}</p>
            ))}
          </div>
        )}
        <div className="dungeon-page__actions">
          <button
            disabled={advanceMutation.isPending}
            onClick={() => advanceMutation.mutate()}
          >
            Press on
          </button>
          <button
            disabled={retreatMutation.isPending}
            onClick={() => retreatMutation.mutate()}
          >
            Retreat
          </button>
        </div>
        {(advanceMutation.isError || retreatMutation.isError) && (
          <p className="dungeon-page__error">
            {(advanceMutation.error ?? retreatMutation.error)?.message}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="dungeon-page">
      <p>
        <Link to="/">← Back</Link>
      </p>
      <h1>What waits here</h1>
      {(dungeons ?? []).length === 0 && <p>Nothing here calls to you.</p>}
      {(dungeons ?? []).map((dungeon, index) => {
        const threshold = thresholdQueries[index]?.data;
        return (
          <div key={dungeon.id} className="dungeon-page__entry">
            <h2>{dungeon.name}</h2>
            {threshold && (
              <p className="dungeon-page__flavor">{threshold.flavor}</p>
            )}
            <button
              disabled={enterMutation.isPending}
              onClick={() => enterMutation.mutate(dungeon.id)}
            >
              Enter ({dungeon.entryCost} AP)
            </button>
          </div>
        );
      })}
      {enterMutation.isError && (
        <p className="dungeon-page__error">{enterMutation.error.message}</p>
      )}
    </div>
  );
}
