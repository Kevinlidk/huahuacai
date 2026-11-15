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

// N 人拼图布局：cols = ceil(sqrt(N))，末行不满时格子等分拉宽
export function gridLayout(playerCount) {
  const n = Math.max(1, playerCount || 1);
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  return { n, cols, rows };
}

// 第 id 块画板的宽高比（末行更少格子时格子更宽）
export function cellAspect(playerCount, id) {
  const { cols, rows } = gridLayout(playerCount);
  const k = id - (rows - 1) * cols; // 该格在末行中的序号（1..k）
  if (k > 0) return cols / k; // 末行：宽度 = 总宽/末行格数
  return 1;
}

// 把 N 个画板合成一张拼图（布局与 gridLayout 一致）
export function composeReveal(canvases, playerCount = 4) {
  const { n, cols, rows } = gridLayout(playerCount);
  const cell = 800; // 基准格高
  const width = cols * cell;
  const height = rows * cell;
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');

  const rects = [];
  for (let id = 1; id <= n; id++) {
    const row = Math.floor((id - 1) / cols);
    const k = id - row * cols; // 行内序号
    const inLastRow = row === rows - 1;
    const lastRowCount = n - (rows - 1) * cols;
    const cellW = inLastRow && lastRowCount < cols ? width / lastRowCount : cell;
    const x = (k - 1) * cellW;
    const y = row * cell;
    rects.push({ id, x, y, w: cellW, h: cell });
  }
  for (const { id, x, y, w, h } of rects) {
    ctx.save();
    ctx.translate(x, y);
    clearCanvas(ctx, w, h);
    const data = canvases?.[String(id)];
    if (data?.strokes) drawStrokes(ctx, data.strokes, w, h);
    ctx.restore();
  }
  // 分隔线：横线整幅、竖线只画本行内部边界（末行格宽与上行不同）
  ctx.save();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 6;
  ctx.beginPath();
  for (let r = 1; r < rows; r++) {
    ctx.moveTo(0, r * cell);
    ctx.lineTo(width, r * cell);
  }
  for (const rect of rects) {
    if (rect.x > 0) {
      ctx.moveTo(rect.x, rect.y);
      ctx.lineTo(rect.x, rect.y + rect.h);
    }
  }
  ctx.stroke();
  ctx.restore();
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
