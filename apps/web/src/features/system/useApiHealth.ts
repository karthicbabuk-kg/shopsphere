import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '../../services/api';

interface Health {
  status: string;
  db: string;
  uptime: number;
}

export function useApiHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => unwrap<Health>(api.get('/health')),
    retry: 1,
    staleTime: 30_000,
  });
}
