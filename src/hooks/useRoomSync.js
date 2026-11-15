import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { getSyncConfig, onSyncConfigChange } from '../lib/sync-config.js';

// 房间状态轮询：间隔由 /api/health 下发的同步配置决定
// （Cloudflare 部署 2s 省额度，自托管 0.5s 实时），页面隐藏时暂停，回到前台立即刷新
export function useRoomSync(roomId, { intervalMs } = {}) {
  const [room, setRoom] = useState(null);
  const [error, setError] = useState(null);
  const [pollMs, setPollMs] = useState(intervalMs ?? getSyncConfig().pollMs);
  const stoppedRef = useRef(false);

  useEffect(() => onSyncConfigChange((cfg) => setPollMs(intervalMs ?? cfg.pollMs)), [intervalMs]);

  const refresh = useCallback(async () => {
    if (!roomId) return;
    try {
      const data = await api.getRoom(roomId);
      if (!stoppedRef.current) {
        setRoom(data);
        setError(null);
      }
    } catch (e) {
      if (!stoppedRef.current) setError(e);
    }
  }, [roomId]);

  useEffect(() => {
    stoppedRef.current = false;
    refresh();
    const timer = setInterval(() => {
      if (document.hidden) return;
      refresh();
    }, pollMs);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stoppedRef.current = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, pollMs]);

  return { room, error, refresh };
}
