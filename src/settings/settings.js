const { ipcRenderer, webUtils } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { loadConfig, saveConfigPreserving } = require('../config');
const { evenThresholds, validThresholds } = require('../evolution');
const { resolveSlug } = require('../pokeapi');
const { esc } = require('../esc');
const { buildIndex, chainPathsFor } = require('../dex');
const namesKo = require('../../assets/names-ko.json');

// 이름표는 1025종을 모두 담고 있어 도감 밖의 종을 입력해도 무엇을 찾았는지
// 알 수 있다. 진화 경로는 등록할 수 있는 종만 담긴 도감에서 가져온다.
const dexIndex = buildIndex(require('../../assets/dex.json'));

const koBySlug = Object.fromEntries(Object.entries(namesKo).map(([k, v]) => [v, k]));
const ko = (slug) => koBySlug[slug] || slug;

const CONFIG_FILE = ipcRenderer.sendSync('get-config-path');
const CACHE_DIR = path.join(path.dirname(CONFIG_FILE), 'cache');
let cfg = loadConfig(CONFIG_FILE);

const $ = (id) => document.getElementById(id);
const list = $('monsters');

function save() {
  saveConfigPreserving(CONFIG_FILE, cfg); // 펫 위치·사용량 캐시·도감 기록은 main이 주인
  ipcRenderer.send('config-changed');
  render();
}

// 도감 설정과 잠금 판정은 메인이 하고 여기서는 받아 쓴다
let pick = { locked: false, unlockAt: null };
let dexOpt = { enabled: false, freeMode: false };
const fmtDate = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()}`; };

// panel.js도 같은 이벤트를 듣는다 — 창 하나에 두 스크립트가 올라가 있어 각자 필요한 것만 본다
ipcRenderer.on('panel-data', (_, d) => {
  if (!d || !d.pick) return;
  pick = d.pick;
  dexOpt = { enabled: !!d.dexEnabled, freeMode: !!d.dexFreeMode };
  render();
});

async function setDexOption(opt) {
  const res = await ipcRenderer.invoke('set-dex-option', opt);
  dexOpt = { enabled: res.enabled, freeMode: res.freeMode };
  render();
}
$('dex-enabled').onchange = () => setDexOption({ enabled: $('dex-enabled').checked });
$('dex-free').onchange = () => setDexOption({ freeMode: $('dex-free').checked });

function applyLock() {
  $('dex-enabled').checked = dexOpt.enabled;
  $('dex-free').checked = dexOpt.freeMode;
  $('dex-free').disabled = !dexOpt.enabled; // 도감을 켜야 의미가 있는 설정이다

  // 도감을 쓰는 동안에는 고르는 창구를 도감 하나로 모은다. 여기서도 고를 수
  // 있으면 도감을 거치지 않고 규칙을 지나가게 된다.
  $('dex-pick-sec').hidden = !dexOpt.enabled;
  $('poke-sec').hidden = dexOpt.enabled;
  $('custom-sec').hidden = dexOpt.enabled;

  $('pick-lock').textContent = pick.locked
    ? `이번 주에 키울 포켓몬은 이미 골랐어요${pick.unlockAt ? ` · ${fmtDate(pick.unlockAt)} 리셋 후에 바꿀 수 있어요` : ''}`
    : '';
  for (const el of [$('poke-lookup'), $('poke-add'), $('custom-add')]) el.disabled = pick.locked;
}
$('open-dex-btn').onclick = () => ipcRenderer.send('open-dex');

function render() {
  if (cfg.source !== 'codex') cfg.source = 'claude';
  document.querySelector(`input[name=source][value=${cfg.source}]`).checked = true;
  list.innerHTML = '';
  for (const [id, m] of Object.entries(cfg.monsters)) {
    const active = id === cfg.activeMonster;
    const li = document.createElement('li');
    // 도감을 쓰는 동안에는 여기서 고를 수 없다 — 고르는 창구는 도감 하나뿐이다.
    // 임계값 편집과 삭제는 고르는 것과 다른 일이라 그대로 둔다.
    li.innerHTML = `
      ${dexOpt.enabled
    ? `<b>${esc(m.displayName)}</b>${active ? ' <span class="hint">키우는 중</span>' : ''}`
    : `<label><input type="radio" name="active"> <b>${esc(m.displayName)}</b></label>`}
      ${m.stages.map((s) => esc(s.name)).join(' → ')}
      임계값: <input class="thr" value="${esc(m.thresholds.join(','))}">
      <button class="thr-save">저장</button> <button class="del">삭제</button>`;
    const radio = li.querySelector('input[name=active]');
    if (radio) {
      radio.checked = active;
      // 활성 몬스터 변경은 메인이 판정한다. 거절당하면 라디오를 원래대로 되돌린다.
      radio.onchange = async () => {
        const res = await ipcRenderer.invoke('set-active-monster', id);
        if (!res.ok) alert(res.error);
        cfg = loadConfig(CONFIG_FILE);
        render();
      };
    }
    li.querySelector('.thr-save').onclick = () => {
      const t = li.querySelector('.thr').value.split(',').map(Number);
      if (t.length !== m.stages.length - 1 || !validThresholds(t)) {
        return alert('임계값이 잘못됐어요. 오름차순 0~100, 개수 = 단계 수 - 1');
      }
      m.thresholds = t;
      save();
    };
    li.querySelector('.del').onclick = () => {
      delete cfg.monsters[id];
      if (cfg.activeMonster === id) cfg.activeMonster = Object.keys(cfg.monsters)[0] ?? null;
      save();
    };
    list.appendChild(li);
  }
  applyLock();
}

document.querySelectorAll('input[name=source]').forEach((r) => {
  r.onchange = () => { cfg.source = r.value; save(); };
});

// --- 펫 크기 ---
$('pet-size').value = cfg.petSize || 140;
$('pet-size-label').textContent = `${cfg.petSize || 140}px`;
$('pet-size').oninput = () => { $('pet-size-label').textContent = `${$('pet-size').value}px`; };
$('pet-size').onchange = () => { cfg.petSize = +$('pet-size').value; save(); };

// --- 포켓몬 추가 ---
let paths = [];
$('poke-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('poke-lookup').click(); });
$('poke-lookup').onclick = () => {
  $('poke-paths').hidden = $('poke-add').hidden = true;
  const slug = resolveSlug($('poke-name').value, namesKo);
  if (!dexIndex.bySlug[slug]) {
    // 6세대 이후는 펫으로 쓸 애니메이션 스프라이트가 없어 도감에도 없다.
    // 받아보고 실패하는 것보다 여기서 바로 알려주는 편이 빠르고 정확하다.
    $('poke-status').textContent = namesKo[$('poke-name').value.trim()]
      ? '6세대 이후 포켓몬은 아직 등록할 수 없어요'
      : '그런 이름은 못 찾았어요';
    return;
  }
  paths = chainPathsFor(dexIndex, slug);
  $('poke-paths').innerHTML = paths
    .map((p, i) => `<option value="${i}">${esc(p.map(ko).join(' → '))}</option>`).join('');
  $('poke-paths').hidden = $('poke-add').hidden = false;
  $('poke-status').textContent = '';
};
$('poke-add').onclick = async () => {
  $('poke-status').textContent = 'GIF 다운로드 중…';
  const res = await ipcRenderer.invoke('add-monster', paths[+$('poke-paths').value]);
  if (!res.ok) return void ($('poke-status').textContent = '실패: ' + res.error);
  // 등록은 메인이 했으므로 설정 파일이 이미 바뀌어 있다. 여기서 저장하면 되레 덮어쓴다
  cfg = loadConfig(CONFIG_FILE);
  render();
  $('poke-status').textContent = '추가하고 이 계통으로 바꿨어요';
};

// --- 커스텀 몬스터 ---
$('custom-add').onclick = async () => {
  const name = $('custom-name').value.trim();
  const files = [...$('custom-files').files].sort((a, b) => a.name.localeCompare(b.name));
  if (!name || files.length < 1) return alert('이름과 GIF 파일을 지정해줘요');
  if (!/^[\w가-힣 -]+$/.test(name)) return alert('이름에는 한글/영문/숫자/공백/하이픈만 쓸 수 있어요');
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const stages = files.map((f, i) => {
    const dest = path.join(CACHE_DIR, `custom-${name}-${i}.gif`);
    fs.copyFileSync(webUtils.getPathForFile(f), dest);
    return { name: `${name} ${i + 1}단계`, gif: dest };
  });
  const id = 'custom-' + name;
  cfg.monsters[id] = { displayName: name, stages, thresholds: evenThresholds(stages.length) };
  save();
  // 포켓몬을 추가할 때와 마찬가지로 방금 만든 몬스터로 갈아탄다
  const res = await ipcRenderer.invoke('set-active-monster', id);
  if (!res.ok) alert(res.error);
  cfg = loadConfig(CONFIG_FILE);
  render();
};

render();
