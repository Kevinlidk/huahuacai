import { useEffect, useRef } from 'react';
import { paintCell } from '../lib/strokes.js';

const STATUS_TEXT = {
  idle: '空闲',
  drawing: '绘画中',
  done: '已完成',
};

const STATUS_STYLE = {
  idle: 'bg-slate-100 text-slate-400',
  drawing: 'bg-amber-100 text-amber-600',
  done: 'bg-emerald-100 text-emerald-600',
};

function CellCanvas({ strokes }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    paintCell(el, strokes);
    const ro = new ResizeObserver(() => paintCell(el, strokes));
    ro.observe(el);
    return () => ro.disconnect();
  }, [strokes]);
  return <canvas ref={ref} className="absolute inset-0 w-full h-full rounded-xl" />;
}

function Cell({ n, canvas, playerId, onClick }) {
  const isMine = canvas.artistId === playerId;
  const hint =
    canvas.status === 'idle'
      ? '点击作画'
      : canvas.status === 'drawing'
        ? isMine
          ? '继续画'
          : `${canvas.artistName || '画友'}${canvas.artistOnline ? '' : '（离线）'}`
        : `by ${canvas.artistName || '画友'}`;

  return (
    <button
      onClick={onClick}
      className={`relative aspect-square rounded-2xl border-2 transition overflow-hidden text-left ${
        canvas.status === 'idle'
          ? 'border-dashed border-slate-300 bg-white/60 hover:border-sky-400 hover:bg-white'
          : 'border-transparent bg-white shadow-sm hover:shadow-md'
      }`}
    >
      {(canvas.status !== 'idle' || canvas.strokes.length > 0) && (
        <CellCanvas strokes={canvas.strokes} />
      )}
      <div className="absolute inset-0 flex flex-col justify-between p-3 pointer-events-none">
        <div className="flex justify-between items-start">
          <span className="w-7 h-7 rounded-full bg-slate-800/80 text-white text-sm flex items-center justify-center font-bold">
            {n}
          </span>
          {canvas.status === 'drawing' && !canvas.artistOnline && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-500">可接管</span>
          )}
        </div>
        <div className="flex justify-between items-end gap-1">
          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[canvas.status]}`}>
            {STATUS_TEXT[canvas.status]}
          </span>
          <span className="text-[11px] text-slate-400 truncate max-w-[60%] text-right">{hint}</span>
        </div>
      </div>
    </button>
  );
}

export default function GridBoard({ room, playerId, onCellClick, onReveal, onRelease }) {
  const cells = [1, 2, 3, 4].map((n) => ({ n, canvas: room.canvases[String(n)] }));
  const allDone = cells.every(({ canvas }) => canvas.status === 'done');
  const myDrawing = cells.find(({ canvas }) => canvas.status === 'drawing' && canvas.artistId === playerId);

  return (
    <section className="mx-auto w-full px-4 py-4 flex flex-col items-center">
      {/* 在场玩家 */}
      <div className="flex flex-wrap justify-center gap-2 mb-4">
        {Object.entries(room.players).map(([pid, p]) => (
          <span
            key={pid}
            className={`text-xs px-2.5 py-1 rounded-full ${
              pid === playerId ? 'bg-sky-500 text-white' : 'bg-white text-slate-500 shadow-sm'
            }`}
          >
            {p.name}
            {pid === playerId ? '（我）' : ''}
          </span>
        ))}
      </div>

      {/* 网格尺寸自适应：取「视口宽 92%」与「可用高度」较小者，上限 860px */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 aspect-square w-[min(92vw,calc(100dvh-250px),860px)] min-w-[280px]">
        {cells.map(({ n, canvas }) => (
          <Cell
            key={n}
            n={n}
            canvas={canvas}
            playerId={playerId}
            onClick={() => onCellClick(n)}
          />
        ))}
      </div>

      <div className="mt-5 text-center space-y-3">
        {allDone ? (
          <button
            onClick={onReveal}
            className="rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-semibold px-8 py-3 shadow transition hhc-pop"
          >
            🎉 全部完成，揭晓作品！
          </button>
        ) : (
          <p className="text-sm text-slate-400">
            已完成 {cells.filter(({ canvas }) => canvas.status === 'done').length} / 4 格
            {myDrawing ? ' · 你有一格画到一半' : ' · 点空白格开始作画'}
          </p>
        )}

        {/* 离线画板清理入口 */}
        {cells
          .filter(
            ({ canvas }) =>
              canvas.status === 'drawing' &&
              canvas.artistId !== playerId &&
              !canvas.artistOnline
          )
          .map(({ n }) => (
            <button
              key={n}
              onClick={() => onRelease(n)}
              className="block mx-auto text-xs text-rose-400 hover:text-rose-600 underline underline-offset-2 transition"
            >
              释放第 {n} 格（画友已离线）
            </button>
          ))}
      </div>
    </section>
  );
}
