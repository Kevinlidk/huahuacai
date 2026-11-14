import { useMemo } from 'react';
import { composeReveal } from '../lib/strokes.js';

// 结果揭晓：四格全部完成后，信封动画展开完整拼图
export default function ResultReveal({ room, onReset }) {
  const imageUrl = useMemo(() => composeReveal(room.canvases), [room.canvases]);

  const handleSave = () => {
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `拼图作品-${room.roomId}.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="relative w-full max-w-md my-auto" style={{ perspective: '1200px' }}>
        {/* 信封盖：先翻开（翻过 90° 后因背面隐藏而消失） */}
        <div
          className="hhc-flap absolute left-0 right-0 top-0 h-20 bg-rose-600 z-20"
          style={{
            clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
            backfaceVisibility: 'hidden',
            borderRadius: '1rem 1rem 0 0',
          }}
        />

        {/* 信封主体 + 信纸升起 */}
        <div className="relative z-10 rounded-2xl bg-rose-500 shadow-2xl p-3 pt-6">
          <div className="hhc-rise rounded-xl bg-white p-3">
            <p className="text-center text-sm text-slate-400 mb-2">
              🎉 房间 {room.roomId} 的合作拼图完成
            </p>
            <img
              src={imageUrl}
              alt="四人合作拼图作品"
              className="w-full rounded-lg border border-slate-100"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleSave}
                className="flex-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold py-2.5 transition"
              >
                ⬇ 保存图片
              </button>
              <button
                onClick={onReset}
                className="flex-1 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold py-2.5 transition"
              >
                🔁 再来一局
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
