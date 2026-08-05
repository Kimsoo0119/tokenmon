const { ipcRenderer } = require('electron');
const {
  buildIndex, isStarter, chainRoot, chainPathsFor, pathsThrough, searchSlugs, cellState, dexCounts,
} = require('../dex');

const index = buildIndex(require('../../assets/dex.json'));

// 도감 칸은 정지 그림, 상세는 펫과 같은 움직이는 그림. 같은 곳에서 받으므로
// 바깥에 기대는 곳이 늘지 않고, 두 번째 실행부터는 창의 디스크 캐시가 받아둔다.
const STILL = (slug) => `https://img.pokemondb.net/sprites/black-white/normal/${slug}.png`;
const ANIM = (slug) => `https://img.pokemondb.net/sprites/black-white/anim/normal/${slug}.gif`;

const { esc } = require('../esc');

const $ = (id) => document.getElementById(id);

const grid = $('grid');
const gens = Object.keys(index.byGen).map(Number).sort((a, b) => a - b);
const cache = new Map(); // 세대별 그리드 HTML — 탭을 오갈 때 다시 만들지 않는다

let state = { seen: {}, caught: {}, activeSlugs: [] };
let gen = gens[0];
let query = '';
let sheetPaths = [];

// 이름은 상태에 따라 바뀌므로 여기서 넣지 않는다. 칸 뼈대만 만들어 캐시해두고
// 공개 여부는 applyState가 클래스와 이름만 갈아끼운다.
function cellHtml(slug) {
  const e = index.bySlug[slug];
  const start = isStarter(index, slug);
  return `<button class="cell unseen" data-slug="${slug}" data-role="${start ? 'start' : 'evo'}">`
    + `<span class="no">#${String(e.no).padStart(3, '0')}</span>`
    + `<img src="${STILL(slug)}" loading="lazy" decoding="async" alt="">`
    + `<span class="nm">???</span>`
    + `<span class="badge">${start ? '●' : '▲'}</span>`
    + '</button>';
}

// 도달해본 종만 이름을 드러낸다. 격자든 상세든 이 규칙은 같아야 한다 —
// 한쪽에서만 가리면 눌러보는 것만으로 알아낼 수 있어 가리는 의미가 없다.
const caught = (slug) => cellState(state, slug) === 'caught';
const shownName = (slug) => (caught(slug) ? index.bySlug[slug].ko : '???');

function applyState() {
  for (const cell of grid.children) {
    const slug = cell.dataset.slug;
    const active = state.activeSlugs.includes(slug);
    cell.className = `cell ${cellState(state, slug)}${active ? ' active' : ''}`;
    cell.querySelector('.nm').textContent = shownName(slug);
  }
}

function renderCounts() {
  const c = dexCounts(state, index);
  $('counts').innerHTML = `도달 <b>${c.caught}</b> / ${c.total}`;
}

function render() {
  const slugs = query ? searchSlugs(index, query) : index.byGen[gen] || [];
  if (query) {
    grid.innerHTML = slugs.map(cellHtml).join('');
  } else {
    if (!cache.has(gen)) cache.set(gen, slugs.map(cellHtml).join(''));
    grid.innerHTML = cache.get(gen);
  }
  $('empty').textContent = query ? '그런 이름은 도감에 없어요' : '';
  $('empty').hidden = slugs.length > 0;
  applyState();
}

// --- 세대 탭 ---
$('tabs').insertAdjacentHTML('afterbegin',
  gens.map((g) => `<button data-gen="${g}">${g}세대</button>`).join(''));

function selectTab(g) {
  gen = g;
  query = '';
  $('search').value = '';
  for (const b of $('tabs').querySelectorAll('button')) b.classList.toggle('on', +b.dataset.gen === g);
  render();
}
$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-gen]');
  if (b) selectTab(+b.dataset.gen);
});

// --- 검색 ---
let searchTimer;
$('search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    query = $('search').value.trim();
    for (const b of $('tabs').querySelectorAll('button')) {
      b.classList.toggle('on', !query && +b.dataset.gen === gen);
    }
    render();
  }, 120);
});

// --- 상세 시트 ---
// 진화로만 만나는 종을 눌렀을 때 막다른 길로 두지 않는다. 그 종을 지나는 경로만
// 추려 보여주므로, 어디서 시작해야 하는지 보이고 그대로 등록까지 이어진다.
function openSheet(slug) {
  const e = index.bySlug[slug];
  if (!e) return;
  const start = isStarter(index, slug);
  sheetPaths = start ? chainPathsFor(index, slug) : pathsThrough(index, slug);

  const known = caught(slug);
  $('sheet-sprite').src = ANIM(slug);
  $('sheet-sprite').classList.toggle('unknown', !known);
  $('sheet-name').textContent = shownName(slug);
  // 도감 번호와 세대는 격자에서도 보이므로 그대로 두고, 전설·환상 여부처럼
  // 키워봐야 알 수 있는 것은 도달 전까지 밝히지 않는다
  $('sheet-meta').textContent = `#${String(e.no).padStart(3, '0')} · ${e.gen}세대`
    + (known && e.legendary ? ' · 전설' : '') + (known && e.mythical ? ' · 환상' : '');
  $('sheet-role').innerHTML = start
    ? '<b>여기서부터</b> 키우기 시작할 수 있어요.'
    : `진화로만 만날 수 있어요. 시작은 <b>${esc(shownName(chainRoot(index, slug)))}</b>예요.`;

  const sel = $('sheet-paths');
  sel.innerHTML = sheetPaths
    .map((p, i) => `<option value="${i}">${esc(p.map(shownName).join(' → '))}</option>`)
    .join('');
  // 갈래도 진화도 없는 종은 고를 것이 없으므로 굳이 보여주지 않는다
  sel.hidden = sheetPaths.length === 1 && sheetPaths[0].length === 1;
  $('sheet-status').textContent = '';
  $('add').disabled = false;
  $('veil').hidden = false;
}

function closeSheet() {
  $('veil').hidden = true;
}

grid.addEventListener('click', (e) => {
  const cell = e.target.closest('.cell');
  if (cell) openSheet(cell.dataset.slug);
});
// error는 버블링하지 않으므로 캡처 단계에서 잡는다
grid.addEventListener('error', (e) => {
  if (e.target.tagName === 'IMG') e.target.classList.add('broken');
}, true);

$('close').onclick = closeSheet;
$('veil').addEventListener('click', (e) => { if (e.target === $('veil')) closeSheet(); });
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if ($('veil').hidden) ipcRenderer.send('dex-close');
  else closeSheet();
});

$('add').onclick = async () => {
  const path = sheetPaths[+$('sheet-paths').value || 0];
  if (!path) return;
  $('add').disabled = true;
  $('sheet-status').textContent = '스프라이트를 받는 중…';
  const res = await ipcRenderer.invoke('add-monster', path);
  if (res.ok) {
    $('sheet-status').textContent = '추가했어요';
  } else {
    $('sheet-status').textContent = '실패: ' + res.error;
    $('add').disabled = false;
  }
};

// --- 상태 ---
function setState(s) {
  if (!s) return;
  state = s;
  document.documentElement.style.setProperty('--accent', s.source === 'codex' ? '#10a37f' : '#d97757');
  renderCounts();
  applyState();
}

ipcRenderer.on('dex-changed', (_, s) => setState(s));

selectTab(gen);
ipcRenderer.invoke('dex-state').then(setState);
