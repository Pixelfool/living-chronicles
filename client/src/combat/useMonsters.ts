import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api';
import { Monster } from '../api-types';

export function useMonsters() {
  return useQuery({
    queryKey: ['combat', 'monsters'],
    queryFn: () => apiFetch<Monster[]>('GET', '/combat/monsters'),
    staleTime: Infinity,
  });
}
