const { ipcRenderer, webUtils } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { loadConfig, saveConfig } = require('../config');
const { evenThresholds, validThresholds } = require('../evolution');
const { resolveSlug, fetchEvolutionPaths, downloadGif } = require('../pokeapi');
const namesKo = require('../../assets/names-ko.json');

const koBySlug = Object.fromEntries(Object.entries(namesKo).map(([k, v]) => [v, k]));
const ko = (slug) => koBySlug[slug] || slug;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const CONFIG_FILE = ipcRenderer.sendSync('get-config-path');
const CACHE_DIR = path.join(path.dirname(CONFIG_FILE), 'cache');
let cfg = loadConfig(CONFIG_FILE);

const $ = (id) => document.getElementById(id);
const list = $('monsters');

function save() {
  cfg.petPosition = loadConfig(CONFIG_FILE).petPosition; // main이 갱신한 위치 보존
  saveConfig(CONFIG_FILE, cfg);
  ipcRenderer.send('config-changed');
  render();
}

function render() {
  if (cfg.source !== 'codex') cfg.source = 'claude';
  document.querySelector(`input[name=source][value=${cfg.source}]`).checked = true;
  list.innerHTML = '';
  for (const [id, m] of Object.entries(cfg.monsters)) {
    const li = document.createElement('li');
    li.innerHTML = `
      <label><input type="radio" name="active"> <b>${esc(m.displayName)}</b></label>
      ${m.stages.map((s) => esc(s.name)).join(' → ')}
      임계값: <input class="thr" value="${esc(m.thresholds.join(','))}">
      <button class="thr-save">저장</button> <button class="del">삭제</button>`;
    const radio = li.querySelector('input[name=active]');
    radio.checked = id === cfg.activeMonster;
    radio.onchange = () => { cfg.activeMonster = id; save(); };
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
$('poke-lookup').onclick = async () => {
  $('poke-status').textContent = '조회 중…';
  $('poke-paths').hidden = $('poke-add').hidden = true;
  try {
    const slug = resolveSlug($('poke-name').value, namesKo);
    paths = await fetchEvolutionPaths(slug);
    $('poke-paths').innerHTML = paths
      .map((p, i) => `<option value="${i}">${esc(p.map(ko).join(' → '))}</option>`).join('');
    $('poke-paths').hidden = $('poke-add').hidden = false;
    $('poke-status').textContent = '';
  } catch (e) {
    $('poke-status').textContent = '못 찾았어요: ' + e.message;
  }
};
$('poke-add').onclick = async () => {
  const p = paths[+$('poke-paths').value];
  $('poke-status').textContent = 'GIF 다운로드 중…';
  try {
    const stages = [];
    for (const slug of p) stages.push({ name: ko(slug), gif: await downloadGif(slug, CACHE_DIR) });
    const id = p.join('-');
    cfg.monsters[id] = { displayName: ko(p[p.length - 1]), stages, thresholds: evenThresholds(stages.length) };
    if (!cfg.activeMonster) cfg.activeMonster = id;
    save();
    $('poke-status').textContent = '추가 완료';
  } catch (e) {
    $('poke-status').textContent = '실패: ' + e.message;
  }
};

// --- 커스텀 몬스터 ---
$('custom-add').onclick = () => {
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
  if (!cfg.activeMonster) cfg.activeMonster = id;
  save();
};

render();
