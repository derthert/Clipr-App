const { performance } = require('perf_hooks');

const views = [];
for (let i = 0; i < 1000; i++) {
  views.push({
    id: i.toString(),
    timelineStart: Math.random() * 1000,
    timelineDuration: 10,
    sourceId: 'src',
    sourceStart: 0,
    sourceEnd: 10
  });
}

const viewsRef = { current: views };

function getSortedViews() {
  return [...viewsRef.current].sort((a, b) => a.timelineStart - b.timelineStart);
}

function findUpcomingSegmentAfter(t, excludeId) {
  const sorted = getSortedViews();
  return sorted.find((v) => v.id !== excludeId && v.timelineStart >= t - 0.02);
}

const start = performance.now();
for (let i = 0; i < 10000; i++) {
  findUpcomingSegmentAfter(500, '5');
}
const end = performance.now();
console.log(`Original: ${end - start} ms`);
