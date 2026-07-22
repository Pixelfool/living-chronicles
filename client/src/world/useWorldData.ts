import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api';
import { City, Region } from '../api-types';

export function useCities() {
  return useQuery({
    queryKey: ['world', 'cities'],
    queryFn: () => apiFetch<City[]>('GET', '/world/cities'),
    staleTime: Infinity, // content, not state - never goes stale mid-session
  });
}

export function useRoutes() {
  return useQuery({
    queryKey: ['world', 'routes'],
    queryFn: () => apiFetch<Region[]>('GET', '/world/routes'),
    staleTime: Infinity,
  });
}
