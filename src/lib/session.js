// 玩家身份：本地持久化的随机 ID + 昵称
const ID_KEY = 'hhc_player_id';
const NAME_KEY = 'hhc_player_name';

function randomId() {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function getPlayerId() {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id || !/^p_[A-Za-z0-9]{6,32}$/.test(id)) {
      id = 'p_' + randomId();
      localStorage.setItem(ID_KEY, id);
      localStorage.setItem(NAME_KEY, ''); // 新 ID 重置昵称
    }
    return id;
  } catch {
    return 'p_' + randomId();
  }
}

export function getPlayerName() {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}

export function setPlayerName(name) {
  try {
    localStorage.setItem(NAME_KEY, String(name || '').trim().slice(0, 24));
  } catch {
    /* 忽略存储失败 */
  }
}
