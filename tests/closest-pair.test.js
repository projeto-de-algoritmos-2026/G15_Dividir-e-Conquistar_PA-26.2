const fs = require('fs');
const vm = require('vm');
const path = require('path');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'closest-pair.js'), 'utf8'), context);
const algorithm = context.window.ClosestPair;

function brute(points) {
  let best = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      best = Math.min(best, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y));
    }
  }
  return best;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let checked = 0;
for (let size = 2; size <= 50; size += 1) {
  for (let sample = 0; sample < 20; sample += 1) {
    const points = Array.from({ length: size }, (_, id) => ({
      id,
      x: Math.floor(Math.random() * 300),
      y: Math.floor(Math.random() * 300)
    }));
    const result = algorithm.run(points);
    assert(Math.abs(result.result.distance - brute(points)) < 1e-9, `Distância divergente para n=${size}`);
    assert(result.events[result.events.length - 1].verified, `Conferência final falhou para n=${size}`);
    checked += 1;
  }
}

const edgeCases = [
  Array.from({ length: 24 }, (_, id) => ({ id, x: 25, y: id * 12 })),
  [
    { id: 0, x: 10, y: 10 }, { id: 1, x: 10, y: 10 },
    { id: 2, x: 10, y: 80 }, { id: 3, x: 10, y: 130 },
    { id: 4, x: 10, y: 190 }, { id: 5, x: 10, y: 260 }
  ],
  [
    { id: 0, x: 0, y: 0 }, { id: 1, x: 100, y: 0 },
    { id: 2, x: 50, y: 50 }, { id: 3, x: 50, y: 51 },
    { id: 4, x: 55, y: 51 }, { id: 5, x: 60, y: 51 }
  ]
];
edgeCases.forEach((points) => {
  const result = algorithm.run(points);
  assert(Math.abs(result.result.distance - brute(points)) < 1e-9, 'Falha em caso-limite');
  checked += 1;
});

let rejected = false;
try { algorithm.run([{ id: 1, x: 0, y: 0 }]); } catch (_) { rejected = true; }
assert(rejected, 'O algoritmo deveria rejeitar entrada com menos de dois pontos.');
rejected = false;
try { algorithm.run([{ id: 1, x: NaN, y: 0 }, { id: 2, x: 1, y: 1 }]); } catch (_) { rejected = true; }
assert(rejected, 'O algoritmo deveria rejeitar coordenadas não finitas.');

console.log(`PASS: ${checked} conjuntos comparados com força bruta; validações de entrada aprovadas.`);
