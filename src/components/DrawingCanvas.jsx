import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { getSyncConfig } from '../lib/sync-config.js';
import { PEN_COLORS, PEN_SIZES, clearCanvas, drawStrokes, drawStroke, strokeColor } from '../lib/strokes.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// 全屏绘画层：认领后进入，绘制自己认领的那一格
export default function DrawingCanvas({ roomId, canvasId, playerId, initialStrokes, onClose }) {
  // initialStrokes 只在挂载时取一次，之后的差异全部由本地操作驱动
  const [strokes, setStrokes] = useState(() => [...initialStrokes]);
  const [redoStack, setRedoStack] = useState([]); // 被撤销的笔触，重做时按序放回
  const [tool, setTool] = useState('pen');
  const [colorIdx, setColorIdx] = useState(0);
  const [sizeIdx, setSizeIdx] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [side, setSide] = useState(0);
  const drawnCountRef = useRef(0);
  const lastSideRef = useRef(0);
  const currentRef = useRef(null); // 正在进行的笔触
  const drawingRef = useRef(false);
  const pendingRef = useRef([]); // 待上传笔触缓冲（批量写，省 KV 额度）
  const flushTimerRef = useRef(null);

  // 把缓冲中的笔触一次性提交（一次 KV 写）；失败则放回队首等待重试
  const flushStrokes = async () => {
    const pending = pendingRef.current;
    if (pending.length === 0) return;
    pendingRef.current = [];
    try {
      await api.strokesBatch(roomId, canvasId, playerId, pending);
    } catch (e) {
      setError(e.message);
      pendingRef.current = [...pending, ...pendingRef.current];
    }
  };

  const queueStroke = (stroke) => {
    pendingRef.current.push(stroke);
    // 上传节奏由部署模式决定：自托管每笔立即上传（实时），Cloudflare 攒批省额度
    const cfg = getSyncConfig();
    const max = Math.max(1, cfg.strokeBatchMax || 1);
    if (pendingRef.current.length >= max) {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      flushStrokes();
    } else if (cfg.strokeBatchMs > 0 && !flushTimerRef.current) {
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        flushStrokes();
      }, cfg.strokeBatchMs);
    }
  };

  const discardPending = () => {
    pendingRef.current = [];
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  };

  // 卸载时兜底冲刷，避免未上传的笔迹丢失
  useEffect(
    () => () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      const pending = pendingRef.current;
      if (pending.length > 0) {
        api.strokesBatch(roomId, canvasId, playerId, pending).catch(() => {});
      }
    },
    [roomId, canvasId, playerId]
  );

  // 容器尺寸 → 正方形边长
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSide(Math.max(0, Math.floor(Math.min(rect.width, rect.height))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 渲染：新笔触增量绘制；撤销/尺寸变化时全量重绘
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || side <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    if (el.width !== Math.round(side * dpr)) {
      el.width = Math.round(side * dpr);
      el.height = Math.round(side * dpr);
    }
    const ctx = el.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (side !== lastSideRef.current) {
      clearCanvas(ctx, side, side);
      drawStrokes(ctx, strokes, side, side);
      drawnCountRef.current = strokes.length;
      lastSideRef.current = side;
    } else if (strokes.length < drawnCountRef.current) {
      clearCanvas(ctx, side, side);
      drawStrokes(ctx, strokes, side, side);
      drawnCountRef.current = strokes.length;
    } else {
      drawStrokes(ctx, strokes, side, side, drawnCountRef.current);
      drawnCountRef.current = strokes.length;
    }
  }, [strokes, side]);

  const posOf = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return [clamp01((e.clientX - rect.left) / rect.width), clamp01((e.clientY - rect.top) / rect.height)];
  };

  const makeStroke = (points) => ({
    tool,
    color: PEN_COLORS[colorIdx],
    size: PEN_SIZES[sizeIdx],
    points,
  });

  const onPointerDown = (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    canvasRef.current.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const p = posOf(e);
    currentRef.current = makeStroke([p, p]); // 起笔即画一个点
    const ctx = canvasRef.current.getContext('2d');
    drawStroke(ctx, currentRef.current, side, side);
  };

  const onPointerMove = (e) => {
    if (!drawingRef.current || !currentRef.current) return;
    const p = posOf(e);
    const pts = currentRef.current.points;
    const last = pts[pts.length - 1];
    if (Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) < 0.002) return; // 距离阈值去抖
    pts.push(p);
    const ctx = canvasRef.current.getContext('2d');
    drawStroke(ctx, currentRef.current, side, side); // 实心线条重复描画无副作用
  };

  const onPointerUp = () => {
    if (!drawingRef.current || !currentRef.current) return;
    drawingRef.current = false;
    const stroke = currentRef.current;
    currentRef.current = null;
    if (stroke.points.length < 2) return;
    setRedoStack([]); // 新笔触入栈后重做历史作废
    setStrokes((s) => [...s, stroke]);
    queueStroke(stroke);
  };

  const handleUndo = async () => {
    if (strokes.length === 0) return;
    setError('');
    try {
      await flushStrokes(); // 先把缓冲笔触落库，保证撤销作用在完整状态上
      await api.undo(roomId, canvasId, playerId);
      const last = strokes[strokes.length - 1];
      setRedoStack((s) => [...s, last]);
      setStrokes((s) => s.slice(0, -1));
    } catch (e) {
      setError(e.message);
    }
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const st = redoStack[redoStack.length - 1];
    setRedoStack((s) => s.slice(0, -1));
    setStrokes((s) => [...s, st]);
    api.addStroke(roomId, canvasId, playerId, st).catch((e) => setError(e.message));
  };

  const handleClear = async () => {
    if (strokes.length === 0 || busy) return;
    if (!window.confirm('清空本格所有笔迹？')) return;
    setBusy(true);
    setError('');
    discardPending(); // 服务端整体清空，缓冲无需上传
    try {
      await api.clear(roomId, canvasId, playerId);
      setStrokes([]);
      setRedoStack([]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleFinish = async () => {
    setBusy(true);
    setError('');
    try {
      await flushStrokes(); // 确保缓冲笔触已落库再标记完成
      await api.finish(roomId, canvasId, playerId);
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const handleAbandon = async () => {
    if (!window.confirm('放弃本格绘画？已画的笔迹会全部清空。')) return;
    setBusy(true);
    discardPending();
    try {
      await api.release(roomId, canvasId, playerId);
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-white flex flex-col">
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-100">
        <span className="text-sm font-semibold text-slate-600 mr-1">第 {canvasId} 格</span>

        <div className="flex rounded-lg bg-slate-100 p-0.5">
          <button
            onClick={() => setTool('pen')}
            className={`px-3 py-1 rounded-md text-sm ${tool === 'pen' ? 'bg-white shadow text-slate-800' : 'text-slate-400'}`}
          >
            画笔
          </button>
          <button
            onClick={() => setTool('eraser')}
            className={`px-3 py-1 rounded-md text-sm ${tool === 'eraser' ? 'bg-white shadow text-slate-800' : 'text-slate-400'}`}
          >
            橡皮
          </button>
        </div>

        {tool === 'pen' && (
          <div className="flex gap-1">
            {PEN_COLORS.map((c, i) => (
              <button
                key={c}
                onClick={() => setColorIdx(i)}
                style={{ backgroundColor: c }}
                className={`w-6 h-6 rounded-full border-2 transition ${
                  i === colorIdx ? 'border-slate-800 scale-110' : 'border-transparent'
                }`}
                title={`颜色 ${i + 1}`}
              />
            ))}
          </div>
        )}

        <div className="flex gap-1">
          {PEN_SIZES.map((s, i) => (
            <button
              key={s}
              onClick={() => setSizeIdx(i)}
              className={`w-7 h-7 rounded-full flex items-center justify-center ${
                i === sizeIdx ? 'bg-slate-200' : ''
              }`}
              title={`粗细 ${i + 1}`}
            >
              <span
                className="rounded-full bg-slate-600"
                style={{ width: 3 + i * 3, height: 3 + i * 3 }}
              />
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleUndo}
            disabled={strokes.length === 0}
            className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-600 transition"
          >
            ↩ 撤销
          </button>
          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-600 transition"
          >
            ↪ 重做
          </button>
          <button
            onClick={handleClear}
            disabled={strokes.length === 0 || busy}
            className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-rose-500 transition"
          >
            🗑 清空
          </button>
          <button
            onClick={handleAbandon}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-rose-500 transition"
          >
            放弃
          </button>
          <button
            onClick={handleFinish}
            disabled={busy}
            className="px-4 py-1.5 rounded-lg text-sm bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold transition"
          >
            ✓ 保存完成
          </button>
        </div>
      </div>

      {error && (
        <p className="text-center text-sm text-rose-500 py-1 bg-rose-50">{error}</p>
      )}

      {/* 画布区域 */}
      <div ref={containerRef} className="flex-1 flex items-center justify-center p-2 min-h-0">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ width: side, height: side, touchAction: 'none' }}
          className={`bg-white border border-slate-200 rounded-lg shadow-inner ${
            tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair'
          }`}
        />
      </div>

      <p className="text-center text-xs text-slate-300 pb-2">
        提示：其他画友可在网格页看到你的笔迹（约 1 秒同步一次）
      </p>
    </div>
  );
}
