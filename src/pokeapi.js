const fs = require('node:fs');
const path = require('node:path');

function resolveSlug(input, namesKo) {
  const t = input.trim();
  return namesKo[t] || t.toLowerCase();
}

function chainPaths(node) {
  const paths = [];
  (function walk(n, acc) {
    const cur = [...acc, n.species.name];
    if (!n.evolves_to.length) return paths.push(cur);
    for (const next of n.evolves_to) walk(next, cur);
  })(node, []);
  return paths;
}

function assertSlug(slug) {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`잘못된 이름: ${slug}`);
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

async function fetchEvolutionPaths(slug) {
  assertSlug(slug);
  const sp = await getJson(`https://pokeapi.co/api/v2/pokemon-species/${slug}`);
  const chain = await getJson(sp.evolution_chain.url);
  return chainPaths(chain.chain);
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

module.exports = { resolveSlug, chainPaths, fetchEvolutionPaths, downloadGif };
