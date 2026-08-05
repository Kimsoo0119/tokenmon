const fs = require('node:fs');
const path = require('node:path');

function resolveSlug(input, namesKo) {
  const t = input.trim();
  return namesKo[t] || t.toLowerCase();
}

function assertSlug(slug) {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`잘못된 이름: ${slug}`);
}

async function downloadGif(slug, destDir) {
  assertSlug(slug);
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, `${slug}.gif`);
  if (fs.existsSync(dest)) return dest;
  const res = await fetch(`https://img.pokemondb.net/sprites/black-white/anim/normal/${slug}.gif`);
  if (!res.ok) throw new Error(`스프라이트 없음: ${slug} (${res.status})`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

module.exports = { resolveSlug, downloadGif };
