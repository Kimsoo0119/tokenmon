function stageIndex(thresholds, percent) {
  let s = 0;
  for (const t of thresholds) if (percent >= t) s++;
  return s;
}

function evenThresholds(stageCount) {
  return Array.from({ length: stageCount - 1 }, (_, i) =>
    Math.round(((i + 1) * 100) / stageCount));
}

function validThresholds(t) {
  return t.every((v, i) => v > 0 && v < 100 && (i === 0 || v > t[i - 1]));
}

module.exports = { stageIndex, evenThresholds, validThresholds };
