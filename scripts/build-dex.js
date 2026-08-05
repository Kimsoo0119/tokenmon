// 1회 실행: 도감에 실을 종 데이터 생성 (전국도감 번호·한글 이름·세대·진화 부모)
//
// PokeAPI REST로 종을 하나씩 받으면 1000회가 넘는 요청이 필요하지만, GraphQL은
// 같은 내용을 한 번에 준다. 그리고 species 응답의 evolves_from_species_id 하나면
// 진화 체인 트리가 전부 복원되므로 evolution-chain은 따로 받지 않는다.
//
//   node scripts/build-dex.js            # 데이터만 생성
//   node scripts/build-dex.js --verify   # 전 종의 스프라이트 실존을 HEAD로 확인
const fs = require('node:fs');

// 펫 스프라이트로 쓰는 pokemondb의 흑백 애니메이션 GIF는 5세대 게임의 도트라
// 그 시점까지의 649종만 존재한다 (genesect 200 / chespin 404). 등록할 수 없는
// 종을 도감에 실으면 눌러도 아무 일이 없는 칸이 되므로 여기서 잘라낸다.
const BW_ANIM_MAX_NO = 649;
const KOREAN_LANGUAGE_ID = 3;
const GRAPHQL = 'https://graphql.pokeapi.co/v1beta2';
const SPRITE = (slug) => `https://img.pokemondb.net/sprites/black-white/anim/normal/${slug}.gif`;
const SLUG = /^[a-z0-9-]+$/;
const OUT = 'assets/dex.json';

// PokeAPI는 마나피와 피오네를 한 진화 체인(250)에 묶어두지만 둘은 진화 관계가
// 아니라 알에서 나오는 사이라, 이 체인에는 부모 없는 종이 둘이다. 도감에서는
// 각각 따로 등록하는 별개의 종으로 다룬다 — 그래서 종을 묶는 기준을 체인 번호가
// 아니라 from을 거슬러 올라간 뿌리로 잡는다. 체인 번호를 파일에 넣지 않는 것도
// 같은 이유다. 넣어두면 언젠가 그걸로 묶으려는 사람이 나온다. (2026-08 기준)
const KNOWN_MULTI_ROOT_CHAINS = [250];

const QUERY = `{
  pokemonspecies(limit: 2000, order_by: {id: asc}) {
    id
    name
    generation_id
    evolution_chain_id
    is_legendary
    is_mythical
    evolves_from_species_id
    pokemonspeciesnames(where: {language_id: {_eq: ${KOREAN_LANGUAGE_ID}}}) { name }
  }
}`;

async function fetchSpecies() {
  const res = await fetch(GRAPHQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY }),
  });
  if (!res.ok) throw new Error(`${GRAPHQL} → ${res.status}`);
  const body = await res.json();
  if (body.errors) throw new Error(`GraphQL 오류: ${JSON.stringify(body.errors)}`);
  return body.data.pokemonspecies;
}

function build(species) {
  const slugById = new Map(species.map((s) => [s.id, s.name]));
  const out = {};
  for (const s of species) {
    if (s.id > BW_ANIM_MAX_NO) continue;
    const ko = s.pokemonspeciesnames[0];
    const entry = {
      no: s.id,
      ko: ko ? ko.name : s.name,
      gen: s.generation_id,
    };
    // from이 없으면 진화 트리의 뿌리 — 도감에서 바로 등록할 수 있는 종이다.
    // 값이 없는 필드는 아예 넣지 않아 파일을 짧게 유지한다.
    if (s.evolves_from_species_id) entry.from = slugById.get(s.evolves_from_species_id);
    if (s.is_legendary) entry.legendary = true;
    if (s.is_mythical) entry.mythical = true;
    out[s.name] = entry;
  }
  return out;
}

function check(dex, species) {
  const fail = (msg) => { throw new Error(`데이터 검증 실패: ${msg}`); };
  const entries = Object.entries(dex);
  if (!entries.length) fail('종이 하나도 없습니다');

  const chainOf = new Map(species.map((s) => [s.name, s.evolution_chain_id]));
  const rootsByChain = new Map();

  for (const [slug, e] of entries) {
    if (!SLUG.test(slug)) fail(`슬러그에 쓸 수 없는 문자: ${slug}`);
    if (!e.ko) fail(`한글 이름이 없습니다: ${slug}`);
    if (e.no < 1 || e.no > BW_ANIM_MAX_NO) fail(`도감 번호가 범위를 벗어납니다: ${slug} (${e.no})`);
    if (e.gen < 1 || e.gen > 5) fail(`세대가 범위를 벗어납니다: ${slug} (${e.gen})`);

    const chain = chainOf.get(slug);
    if (!e.from) {
      rootsByChain.set(chain, (rootsByChain.get(chain) || 0) + 1);
      continue;
    }
    // 부모가 잘려나갔다면 그 종은 진화로 도달할 방법이 없어 도감에 실으면 안 된다
    if (!dex[e.from]) fail(`부모가 도감에 없습니다: ${slug} ← ${e.from}`);
    if (chainOf.get(e.from) !== chain) fail(`부모와 체인이 다릅니다: ${slug} ← ${e.from}`);
  }

  // 뿌리가 둘 이상인 체인이 늘어났다면 알아야 한다 — 종을 묶는 방식이 흔들린다
  const multi = [...rootsByChain].filter(([, n]) => n > 1).map(([c]) => c).sort((a, b) => a - b);
  const expected = [...KNOWN_MULTI_ROOT_CHAINS].sort((a, b) => a - b);
  if (multi.join(',') !== expected.join(',')) {
    fail(`뿌리가 둘 이상인 체인이 예상과 다릅니다: [${multi}] (예상 [${expected}])`);
  }

  const roots = [...rootsByChain.values()].reduce((a, b) => a + b, 0);
  return { total: entries.length, chains: rootsByChain.size, roots };
}

// 종마다 한 줄씩 쓴다. JSON.stringify의 들여쓰기는 중첩 객체까지 펼쳐버려서
// 650줄짜리 파일이 4000줄이 되고, diff에서 어떤 종이 바뀌었는지 읽기 어려워진다.
function serialize(dex) {
  const body = Object.entries(dex)
    .map(([slug, e]) => ` ${JSON.stringify(slug)}: ${JSON.stringify(e)}`)
    .join(',\n');
  return `{\n${body}\n}\n`;
}

async function verifySprites(dex) {
  const slugs = Object.keys(dex);
  const missing = [];
  const BATCH = 8;
  for (let i = 0; i < slugs.length; i += BATCH) {
    const batch = slugs.slice(i, i + BATCH);
    const found = await Promise.all(batch.map(async (slug) => {
      const res = await fetch(SPRITE(slug), { method: 'HEAD' });
      return res.ok;
    }));
    batch.forEach((slug, j) => { if (!found[j]) missing.push(slug); });
    process.stdout.write(`\r스프라이트 확인 ${Math.min(i + BATCH, slugs.length)}/${slugs.length}`);
  }
  process.stdout.write('\n');
  return missing;
}

(async () => {
  const species = await fetchSpecies();
  console.log(`PokeAPI 응답: ${species.length}종`);

  const dex = build(species);
  const { total, chains, roots } = check(dex, species);

  if (process.argv.includes('--verify')) {
    const missing = await verifySprites(dex);
    if (missing.length) throw new Error(`스프라이트가 없는 종 ${missing.length}개: ${missing.join(', ')}`);
    console.log('스프라이트: 전 종 확인');
  }

  fs.mkdirSync('assets', { recursive: true });
  fs.writeFileSync(OUT, serialize(dex));

  const byGen = {};
  for (const e of Object.values(dex)) byGen[e.gen] = (byGen[e.gen] || 0) + 1;
  const legendary = Object.values(dex).filter((e) => e.legendary).length;
  const mythical = Object.values(dex).filter((e) => e.mythical).length;

  console.log(`${OUT} 생성: ${total}종 / 체인 ${chains}개 (뿌리 ${roots})`);
  console.log(`세대별: ${Object.entries(byGen).map(([g, n]) => `${g}세대 ${n}`).join(' · ')}`);
  console.log(`선택 가능(뿌리) ${roots} · 진화로만 ${total - roots} · 전설 ${legendary} · 환상 ${mythical}`);
})();
