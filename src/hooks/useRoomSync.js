import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

// 房间状态轮询：默认 1s 一次，页面隐藏时暂停，回到前台立即刷新
export function useRoomSync(roomId, { intervalMs = 1000 } = {}) {
  const [room, setRoom] = useState(null);
  const [error, setError] = useState(null);
  const stoppedRef = useRef(false);

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
    }, intervalMs);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stoppedRef.current = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, intervalMs]);

  return { room, error, refresh };
}
