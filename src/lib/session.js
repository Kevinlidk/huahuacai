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

// 默认昵称：浏览器拿不到设备名/系统用户名（隐私沙箱），
// 首次访问自动生成一个有辨识度的昵称并持久化，效果等同「免输入的默认身份」
const NICK_ADJECTIVES = [
  '调皮的', '安静的', '闪亮的', '好奇的', '认真的', '温柔的',
  '勇敢的', '神秘的', '快乐的', '机灵的', '慵懒的', '热情的',
];
const NICK_NOUNS = [
  '小狐狸', '小海豚', '小熊猫', '小刺猬', '小画家', '小企鹅',
  '云朵', '星星', '柠檬', '月亮', '奶茶', '台风',
];

function randomNickname() {
  const buf = new Uint32Array(1);
  const pick = (list) => {
    crypto.getRandomValues(buf);
    return list[buf[0] % list.length];
  };
  return `${pick(NICK_ADJECTIVES)}${pick(NICK_NOUNS)}`;
}

export function getPlayerName() {
  try {
    let name = localStorage.getItem(NAME_KEY);
    if (!name) {
      name = randomNickname();
      localStorage.setItem(NAME_KEY, name);
    }
    return name;
  } catch {
    return randomNickname();
  }
}

export function setPlayerName(name) {
  try {
    localStorage.setItem(NAME_KEY, String(name || '').trim().slice(0, 24));
  } catch {
    /* 忽略存储失败 */
  }
}

const RECENT_KEY = 'hhc_recent_rooms';

export function getRecentRooms() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list.filter((r) => r && typeof r.roomId === 'string') : [];
  } catch {
    return [];
  }
}

export function addRecentRoom(roomId, name) {
  try {
    const list = getRecentRooms().filter((r) => r.roomId !== roomId);
    list.unshift({ roomId, name: String(name || '').slice(0, 24), ts: Date.now() });
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 5)));
  } catch {
    /* 忽略存储失败 */
  }
}
