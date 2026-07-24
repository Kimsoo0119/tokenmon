// 1회 실행: PokeAPI 전체 종의 한글 이름 → 영문 슬러그 매핑 생성
const fs = require('node:fs');

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

(async () => {
  const list = (await getJson('https://pokeapi.co/api/v2/pokemon-species?limit=2000')).results;
  const out = {};
  const BATCH = 20;
  for (let i = 0; i < list.length; i += BATCH) {
    const specs = await Promise.all(list.slice(i, i + BATCH).map((s) => getJson(s.url)));
    for (const sp of specs) {
      const ko = sp.names.find((n) => n.language.name === 'ko');
      if (ko) out[ko.name] = sp.name;
    }
    process.stdout.write(`\r${Math.min(i + BATCH, list.length)}/${list.length}`);
  }
  fs.mkdirSync('assets', { recursive: true });
  fs.writeFileSync('assets/names-ko.json', JSON.stringify(out, null, 1));
  console.log(`\n완료: ${Object.keys(out).length}개`);
})();
