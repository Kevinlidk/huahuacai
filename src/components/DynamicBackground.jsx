import { useEffect, useRef } from 'react';
import GlyphWind from '../background/renderer.js';
import '../background/engine.css';
import '../background/theme-linkage.css';

// 字形流动背景：装饰性全屏层（z-index:-2），在应用根部挂载一次。
// 每次进入随机种子（图案不重样）；其余参数对齐插件 0.1.2 实测基准：
// look mixed、interactive false、timing {fadeIn:3000, fadeOut:500}。
export default function DynamicBackground() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let instance = null;
    try {
      instance = GlyphWind.create({
        element: el,
        settings: () => {
          const buf = new Uint32Array(1);
          crypto.getRandomValues(buf);
          return Object.assign(GlyphWind.defaults(), {
            seed: buf[0] || 0x19a4c637, // 随机种子（加密安全源，0 回退基准值）
            look: 'mixed',
            interactive: false, // 纯装饰：不绑定指针事件，不拦截任何点击
          });
        },
        timing: () => ({ fadeIn: 3000, fadeOut: 500 }),
        onReady: () => {
          // 产品决策：背景流动是本应用的核心视觉，始终运行
          // （部分浏览器环境会上报「减少动态效果」偏好，此前因此保持静止）
          instance.setRunning(true);
        },
        onError: (e) => {
          console.error('[background]', e);
          el.style.display = 'none';
        },
      });
      // 开发环境暴露调试句柄（生产构建不含）
      if (import.meta.env.DEV) window.__glyphInstance = instance;
    } catch (e) {
      console.error('[background]', e);
      el.style.display = 'none';
    }
    return () => {
      try {
        instance?.destroy();
      } catch {
        /* 忽略销毁异常 */
      }
    };
  }, []);

  return <div id="bg-stage" ref={ref} aria-hidden="true" />;
}
