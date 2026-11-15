import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { addRecentRoom, getPlayerId, getPlayerName, setPlayerName } from '../lib/session.js';
import { useRoomSync } from '../hooks/useRoomSync.js';
import GridBoard from './GridBoard.jsx';
import DrawingCanvas from './DrawingCanvas.jsx';
import ResultReveal from './ResultReveal.jsx';

// 旧式复制兜底（navigator.clipboard 被拒时）
function legacyCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export default function Room() {
  const { roomId: rawRoomId } = useParams();
  const roomId = (rawRoomId || '').toUpperCase();
  const navigate = useNavigate();
  const [playerId] = useState(getPlayerId());
  const [name, setName] = useState(getPlayerName());
  const { room, error, refresh } = useRoomSync(roomId);
  const [activeCanvas, setActiveCanvas] = useState(null);
  const [revealVisible, setRevealVisible] = useState(true);
  const [notice, setNotice] = useState('');

  // 进入房间即记录到「最近的房间」（Home 页快捷入口）
  useEffect(() => {
    if (roomId) addRecentRoom(roomId, name);
    // 仅挂载时记录一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

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

  // 轮询发现画板被他人接管时自动收起绘画层，避免本地继续画、上传却被拒。
  // 只认「status=drawing 且画主不是自己」这一种新状态：认领前的旧快照里
  // 该格只会是 idle/drawing(自己)，不会误伤刚认领的瞬间
  useEffect(() => {
    if (!activeCanvas || !room) return;
    const c = room.canvases[String(activeCanvas)];
    if (c && c.status === 'drawing' && c.artistId && c.artistId !== playerId) {
      setActiveCanvas(null);
      setNotice('该画板已被其他画友接管');
      refresh();
    }
  }, [room, activeCanvas, playerId, refresh]);

  // 揭晓状态出现时默认弹出作品；reset 后随状态自动消失
  useEffect(() => {
    if (room?.status === 'revealed') setRevealVisible(true);
  }, [room?.status]);

  const handleEditName = (newName) => {
    const nn = String(newName || '').trim().slice(0, 24);
    if (!nn || nn === name) return;
    setPlayerName(nn);
    setName(nn);
    setNotice('昵称已更新');
  };

  const handleCopyInvite = () => {
    const link = `${window.location.origin}/room/${roomId}`;
    const done = () => setNotice('邀请链接已复制，发给朋友即可加入');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(link).then(done, () => legacyCopy(link) ? done() : setNotice(link));
    } else {
      legacyCopy(link) ? done() : setNotice(link);
    }
  };

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
      <header className="max-w-3xl mx-auto flex items-center justify-between px-4 pt-5">
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
            onClick={handleCopyInvite}
            className="font-mono text-2xl font-bold tracking-widest text-slate-800 hover:text-sky-600 transition"
            title="复制邀请链接"
          >
            {roomId}
          </button>
        </div>
        <div className="text-right text-sm text-slate-500">
          {Object.keys(room.players).length} 人在线
        </div>
      </header>

      <GridBoard
        room={room}
        playerId={playerId}
        onCellClick={handleCellClick}
        onReveal={handleReveal}
        onRelease={handleRelease}
        onEditName={handleEditName}
        onShowReveal={() => setRevealVisible(true)}
      />

      {room.status !== 'revealed' && activeCanvas && (
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

      {room.status === 'revealed' && revealVisible && (
        <ResultReveal room={room} onReset={handleReset} onClose={() => setRevealVisible(false)} />
      )}

      {notice && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-sm px-4 py-2 rounded-full shadow-lg hhc-pop">
          {notice}
        </div>
      )}
    </main>
  );
}
