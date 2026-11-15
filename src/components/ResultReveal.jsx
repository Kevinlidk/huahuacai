import { useMemo } from 'react';
import { composeReveal } from '../lib/strokes.js';

// 结果揭晓：四格全部完成后，信封动画展开完整拼图
export default function ResultReveal({ room, onReset, onClose }) {
  // 揭晓后全部笔迹已冻结（reset 会卸载本组件），合成图只需计算一次；
  // room 来自轮询、每秒都是新引用，不能作为依赖，否则每秒重绘大位图
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const imageUrl = useMemo(() => composeReveal(room.canvases, room.playerCount), []);

  const handleSave = () => {
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `拼图作品-${room.roomId}.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      {/* 卡片尺寸自适应：取「视口宽 92%」与「可用高度」较小者，上限 980px */}
      <div
        className="relative w-[min(92vw,calc(100dvh-200px),980px)] min-w-[280px] my-auto"
        style={{ perspective: '1200px' }}
      >
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
            <p className="text-center text-sm sm:text-base text-slate-400 mb-2">
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
                ⬇ 保存
              </button>
              <button
                onClick={onClose}
                className="flex-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-semibold py-2.5 transition"
              >
                回看网格
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
