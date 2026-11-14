import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { getPlayerId, getPlayerName } from '../lib/session.js';
import { useRoomSync } from '../hooks/useRoomSync.js';
import GridBoard from './GridBoard.jsx';
import DrawingCanvas from './DrawingCanvas.jsx';
import ResultReveal from './ResultReveal.jsx';

export default function Room() {
  const { roomId: rawRoomId } = useParams();
  const roomId = (rawRoomId || '').toUpperCase();
  const navigate = useNavigate();
  const [playerId] = useState(getPlayerId());
  const [name] = useState(getPlayerName());
  const { room, error, refresh } = useRoomSync(roomId);
  const [activeCanvas, setActiveCanvas] = useState(null);
  const [notice, setNotice] = useState('');

  // 房间不存在时回首页
  useEffect(() => {
    if (error?.status === 404) {
      navigate('/', { replace: true });
    }
  }, [error, navigate]);

  // 心跳：5s 一次，维持在场状态
  useEffect(() => {
    if (!roomId) return;
    const beat = () => api.heartbeat(roomId, playerId, name).catch(() => {});
    beat();
    const timer = setInterval(beat, 5000);
    return () => clearInterval(timer);
  }, [roomId, playerId, name]);

  const handleCellClick = async (canvasId) => {
    const canvas = room?.canvases?.[String(canvasId)];
    if (!canvas) return;
    setNotice('');
    try {
      if (canvas.status === 'idle') {
        await api.claim(roomId, canvasId, playerId, name);
        setActiveCanvas(canvasId);
        refresh();
      } else if (canvas.status === 'drawing' && canvas.artistId === playerId) {
        setActiveCanvas(canvasId); // 继续画
      } else if (canvas.status === 'drawing') {
        setNotice(`${canvas.artistName || '其他画友'} 正在绘制这一格`);
      }
    } catch (e) {
      setNotice(e.message);
      refresh();
    }
  };

  const handleReveal = async () => {
    try {
      await api.reveal(roomId);
      refresh();
    } catch (e) {
      setNotice(e.message);
    }
  };

  const handleReset = async () => {
    try {
      await api.reset(roomId);
      setActiveCanvas(null);
      refresh();
    } catch (e) {
      setNotice(e.message);
    }
  };

  const handleRelease = async (canvasId) => {
    try {
      await api.release(roomId, canvasId, playerId);
      setActiveCanvas(null);
      refresh();
    } catch (e) {
      setNotice(e.message);
    }
  };

  if (!room) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-sky-100 via-white to-rose-50 flex items-center justify-center">
        <p className="text-slate-500">
          {error ? `连接失败：${error.message}` : '正在进入房间…'}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-100 via-white to-rose-50">
      <header className="max-w-xl mx-auto flex items-center justify-between px-4 pt-5">
        <button
          onClick={() => navigate('/')}
          className="text-slate-400 hover:text-slate-600 transition"
          title="返回首页"
        >
          ← 退出
        </button>
        <div className="text-center">
          <p className="text-xs text-slate-400">房间号（点击复制）</p>
          <button
            onClick={() => navigator.clipboard?.writeText(roomId)}
            className="font-mono text-2xl font-bold tracking-widest text-slate-800 hover:text-sky-600 transition"
          >
            {roomId}
          </button>
        </div>
        <div className="text-right text-sm text-slate-500">
          {Object.keys(room.players).length} 人在线
        </div>
      </header>

      {room.status === 'revealed' ? (
        <ResultReveal room={room} onReset={handleReset} />
      ) : (
        <>
          <GridBoard
            room={room}
            playerId={playerId}
            onCellClick={handleCellClick}
            onReveal={handleReveal}
            onRelease={handleRelease}
          />
          {activeCanvas && (
            <DrawingCanvas
              key={activeCanvas}
              roomId={roomId}
              canvasId={activeCanvas}
              playerId={playerId}
              initialStrokes={room.canvases[String(activeCanvas)]?.strokes || []}
              onClose={() => {
                setActiveCanvas(null);
                refresh();
              }}
            />
          )}
        </>
      )}

      {notice && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-sm px-4 py-2 rounded-full shadow-lg hhc-pop">
          {notice}
        </div>
      )}
    </main>
  );
}
