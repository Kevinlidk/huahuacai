// HTTP JSON 响应编码输出：本文件不引入任何请求数据，只做「编码后写回」这一步。
// 所有业务数据在 shared/api.js 中已经过白名单校验与净化。
export function writeJson(outgoing, status, payloadObject) {
  outgoing.statusCode = status;
  outgoing.setHeader('Content-Type', 'application/json; charset=utf-8');
  outgoing.end(JSON.stringify(payloadObject ?? null));
}
