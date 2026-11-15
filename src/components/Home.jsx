import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { getPlayerId, getPlayerName, setPlayerName } from '../lib/session.js';

export default function Home() {
  const navigate = useNavigate();
  const [name, setName] = useState(getPlayerName());
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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

  const join = async (e) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,6}$/.test(code)) {
      setError('房间号为 4-6 位大写字母或数字');
      return;
    }
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
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          玩法：每人认领 2×2 网格中的一格作画，全部完成后拼合揭晓
        </p>
      </div>
    </main>
  );
}
