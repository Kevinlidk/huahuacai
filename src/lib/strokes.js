// 笔触渲染：本地绘画、网格缩略图、拼图合成都用这一份实现
// 坐标归一化 0..1，线宽为画布宽度的比例

export const PEN_COLORS = ['#1f2937', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];
export const PEN_SIZES = [0.006, 0.012, 0.022, 0.038]; // 相对画布宽度

export function strokeColor(stroke) {
  return stroke.tool === 'eraser' ? '#ffffff' : stroke.color;
}

export function drawStroke(ctx, stroke, w, h) {
  const pts = stroke.points;
  if (!pts || pts.length === 0) return;
  ctx.save();
  ctx.strokeStyle = strokeColor(stroke);
  ctx.fillStyle = strokeColor(stroke);
  ctx.lineWidth = Math.max(1, stroke.size * w);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (pts.length === 1) {
    const [x, y] = pts[0];
    ctx.arc(x * w, y * h, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.moveTo(pts[0][0] * w, pts[0][1] * h);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = ((pts[i][0] + pts[i + 1][0]) / 2) * w;
      const my = ((pts[i][1] + pts[i + 1][1]) / 2) * h;
      ctx.quadraticCurveTo(pts[i][0] * w, pts[i][1] * h, mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last[0] * w, last[1] * h);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawStrokes(ctx, strokes, w, h, from = 0) {
  for (let i = from; i < strokes.length; i++) {
    drawStroke(ctx, strokes[i], w, h);
  }
}

export function clearCanvas(ctx, w, h) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// 把 4 个画板合成一张 2x2 拼图
export function composeReveal(canvases) {
  const cell = 800;
  const out = document.createElement('canvas');
  out.width = cell * 2;
  out.height = cell * 2;
  const ctx = out.getContext('2d');
  for (const n of [1, 2, 3, 4]) {
    const x = ((n - 1) % 2) * cell;
    const y = n <= 2 ? 0 : cell;
    ctx.save();
    ctx.translate(x, y);
    clearCanvas(ctx, cell, cell);
    const data = canvases?.[String(n)];
    if (data?.strokes) drawStrokes(ctx, data.strokes, cell, cell);
    ctx.restore();
  }
  return out.toDataURL('image/png');
}

// 把指定画板渲染成当前尺寸的位图（用于网格缩略图）
export function paintCell(canvasEl, strokes) {
  const rect = canvasEl.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvasEl.width = Math.max(1, Math.round(rect.width * dpr));
  canvasEl.height = Math.max(1, Math.round(rect.height * dpr));
  const ctx = canvasEl.getContext('2d');
  ctx.scale(dpr, dpr);
  clearCanvas(ctx, rect.width, rect.height);
  drawStrokes(ctx, strokes || [], rect.width, rect.height);
}
