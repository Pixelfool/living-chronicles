import { useQuery } from '@tanstack/react-query';
import { ApiError, apiFetch } from '../api';
import { DungeonListEntry, DungeonRunStatusView } from '../api-types';

/** Already server-filtered to the character's current city + level. */
export function useDungeonList() {
  return useQuery({
    queryKey: ['dungeons', 'list'],
    queryFn: () => apiFetch<DungeonListEntry[]>('GET', '/world/dungeons'),
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
