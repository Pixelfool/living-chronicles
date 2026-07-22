import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api';
import { WorldEventView } from '../api-types';

/**
 * Scoped to a single city, deliberately - this represents what a
 * character standing in cityId could see, not a server-wide feed (see
 * ThreadsBadge.tsx and the Phase 2 plan's discussion of character vs.
 * player awareness).
 */
export function useWorldEvent(cityId: string | undefined) {
  return useQuery({
    queryKey: ['worldEvents', cityId],
    queryFn: () => apiFetch<WorldEventView>('GET', `/world/events/${cityId}`),
    enabled: Boolean(cityId),
  });
}
