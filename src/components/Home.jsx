import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { getRecentRooms, getPlayerId, getPlayerName, setPlayerName } from '../lib/session.js';

export default function Home() {
  const navigate = useNavigate();
  const [name, setName] = useState(getPlayerName());
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recentRooms] = useState(getRecentRooms);

  const go = (roomId) => navigate(`/room/${roomId}`);

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      setPlayerName(name);
      const data = await api.createOrJoinRoom({ playerId: getPlayerId(), playerName: name });
      go(data.room.roomId);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const joinRoom = async (code) => {
    setBusy(true);
    setError('');
    try {
      setPlayerName(name);
      const data = await api.createOrJoinRoom({ roomId: code, playerId: getPlayerId(), playerName: name });
      go(data.room.roomId);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const join = async (e) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,6}$/.test(code)) {
      setError('房间号为 4-6 位大写字母或数字');
      return;
    }
    await joinRoom(code);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-100 via-white to-rose-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🎨</div>
          <h1 className="text-3xl font-bold text-slate-800">拼图绘画</h1>
          <p className="mt-2 text-slate-500">四人各画一格，拼出意外惊喜</p>
        </div>

        <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg p-6 space-y-5">
          <label className="block">
            <span className="text-sm text-slate-500">你的昵称</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              placeholder="无名画友"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-300"
            />
          </label>

          <button
            onClick={create}
            disabled={busy}
            className="w-full rounded-xl bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white font-semibold py-3 transition"
          >
            {busy ? '请稍候…' : '创建新房间'}
          </button>

          <div className="flex items-center gap-3 text-slate-300 text-sm">
            <span className="flex-1 border-t border-slate-200" />
            或加入房间
            <span className="flex-1 border-t border-slate-200" />
          </div>

          <form onSubmit={join} className="flex gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="房间号"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-center font-mono text-lg tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-sky-300"
            />
            <button
              type="submit"
              disabled={busy}
              className="shrink-0 whitespace-nowrap rounded-lg bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-semibold px-5 transition"
            >
              加入
            </button>
          </form>

          {error && <p className="text-sm text-rose-500 text-center">{error}</p>}

          {recentRooms.length > 0 && (
            <div className="pt-1 border-t border-slate-100">
              <p className="text-xs text-slate-400 mt-4 mb-2 text-left">最近的房间</p>
              <div className="flex flex-wrap gap-2">
                {recentRooms.map((r) => {
                  const d = new Date(r.ts);
                  return (
                    <button
                      key={r.roomId}
                      onClick={() => joinRoom(r.roomId)}
                      disabled={busy}
                      className="group flex flex-col items-start px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-sky-50 border border-slate-200 hover:border-sky-300 disabled:opacity-50 transition text-left"
                    >
                      <span className="font-mono font-bold tracking-widest text-slate-700 group-hover:text-sky-600">
                        {r.roomId}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {r.name || '无名画友'} · {d.getMonth() + 1}/{d.getDate()}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          玩法：每人认领 2×2 网格中的一格作画，全部完成后拼合揭晓
          <a
            className="github-link inline-block align-[-3px] ml-1.5 text-slate-400 hover:text-slate-700 transition"
            href="https://github.com/Kevinlidk/huahuacai"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub 仓库"
            title="GitHub 仓库：Kevinlidk/huahuacai"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
          </a>
        </p>
      </div>
    </main>
  );
}
