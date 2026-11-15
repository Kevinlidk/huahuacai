import { useEffect, useRef } from 'react';
import GlyphWind from '../background/renderer.js';
import '../background/engine.css';

// 字形流动背景：装饰性全屏层（z-index:-2），在应用根部挂载一次。
// 随机种子每次进入图案不同；窗口失焦自动淡出；WebGL2 不可用时回退纯底色。
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
            seed: buf[0] || 0x19a4c637, // 每次进入随机图案
            interactive: false, // 纯装饰：不绑定指针事件，不拦截任何点击
          });
        },
        timing: () => ({ fadeIn: 2000, fadeOut: 500 }),
        onReady: () => {
          // 尊重系统「减少动态效果」偏好：保持静止
          if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            instance.setRunning(true);
          }
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
