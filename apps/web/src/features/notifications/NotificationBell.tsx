import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Badge from '@mui/material/Badge';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import { Bell } from 'lucide-react';
import { api, unwrap } from '../../services/api';
import { timeAgo } from '../../utils/format';

interface Notification {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

const KEY = ['notifications'];

export function NotificationBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const { data } = useQuery({
    queryKey: KEY,
    queryFn: () =>
      unwrap<{ items: Notification[]; unread: number }>(api.get('/notifications', { params: { pageSize: 8 } })),
    refetchInterval: 60_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => unwrap(api.post(`/notifications/${id}/read`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  const markAll = useMutation({
    mutationFn: () => unwrap(api.post('/notifications/read-all')),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const unread = data?.unread ?? 0;
  return (
    <>
      <IconButton
        color="inherit"
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
      >
        <Badge badgeContent={unread || undefined} color="warning" max={9}>
          <Bell size={20} />
        </Badge>
      </IconButton>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 360, maxWidth: '92vw', mt: 1 } } }}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base">Notifications</h2>
          {unread > 0 && (
            <button
              className="text-sm font-medium text-blue-600"
              onClick={() => markAll.mutate()}
              type="button"
            >
              Mark all read
            </button>
          )}
        </div>
        {!data?.items.length ? (
          <p className="px-4 py-8 text-center text-sm text-muted">You are all caught up.</p>
        ) : (
          <ul className="max-h-[400px] overflow-auto">
            {data.items.map((n) => (
              <li key={n.id} className="border-b border-line last:border-0">
                <button
                  type="button"
                  className={`block w-full px-4 py-3 text-left hover:bg-blue-50 ${n.readAt ? '' : 'bg-blue-50/60'}`}
                  onClick={() => {
                    if (!n.readAt) markRead.mutate(n.id);
                    setAnchor(null);
                    if (n.link) navigate(n.link);
                  }}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="text-sm font-medium">{n.title}</span>
                    <span className="shrink-0 text-xs text-faint">{timeAgo(n.createdAt)}</span>
                  </span>
                  {n.body && <span className="mt-0.5 block text-sm text-muted">{n.body}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Popover>
    </>
  );
}
