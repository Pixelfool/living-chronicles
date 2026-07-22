import { useQuery } from '@tanstack/react-query';
import { ApiError, apiFetch } from '../api';
import { DungeonListEntry, DungeonRunStatusView } from '../api-types';

/**
 * Already server-filtered to the character's current city + level -
 * GET /world/dungeons takes no cityId param, it's inferred from the
 * session. Real bug found by playing this: the query key didn't include
 * cityId either, so after an inline travel (City Hub deliberately never
 * unmounts for that - Phase 1's whole design), there was nothing to
 * make this query ever re-run. The list shown was permanently whichever
 * city happened to be current the first time City Hub mounted. Passing
 * cityId through into the key is what actually makes traveling
 * somewhere new produce a fresh fetch.
 */
export function useDungeonList(cityId: string | undefined) {
  return useQuery({
    queryKey: ['dungeons', 'list', cityId],
    queryFn: () => apiFetch<DungeonListEntry[]>('GET', '/world/dungeons'),
    enabled: Boolean(cityId),
  });
}

/**
 * 404 means "not on an expedition", not an error - treated as a
 * legitimate, common result rather than something to retry or surface.
 */
export function useDungeonCurrent() {
  return useQuery({
    queryKey: ['dungeons', 'current'],
    queryFn: async () => {
      try {
        return await apiFetch<DungeonRunStatusView>(
          'GET',
          '/world/dungeons/current',
        );
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
  });
}
