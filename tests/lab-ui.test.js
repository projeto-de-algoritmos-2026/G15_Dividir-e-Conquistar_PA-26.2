/*
 * Smoke test do laboratório sem navegador real.
 * Executar com: node tests/lab-ui.test.js
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

class FakeElement {
  constructor(id) {
    this.id = id;
    this.children = [];
    this.listeners = {};
    this.style = {};
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.scrollHeight = 0;
    this.parentElement = { classList: { toggle() {} } };
    this.classList = { toggle() {} };
  }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  appendChild(child) { this.children.push(child); }
  setAttribute() {}
  click() { if (this.listeners.click) this.listeners.click({}); }
  change(value) {
    this.value = value;
    if (this.listeners.change) this.listeners.change({ target: this });
  }
}

const ids = [
  'levelSelect', 'speedSelect', 'newBtn', 'runAllBtn', 'plotLayer', 'runState',
  'resetBtn', 'prevBtn', 'playBtn', 'playIcon', 'playText', 'nextBtn',
  'stepAllBtn', 'progressBar', 'progressText', 'stageIcon', 'stageLabel',
  'stageTitle', 'stageDescription', 'detailText', 'hintBtn', 'comparisons',
  'completed', 'depth', 'pointCount', 'algoComparisons', 'bruteComparisons',
  'eventLog', 'logCount', 'resultPanel', 'resultSummary', 'resultDistance',
  'resultNewBtn'
];
const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement(id)]));
elements.levelSelect.value = '0';
elements.speedSelect.value = '850';

let intervalSequence = 0;
const intervals = new Map();
const fakeWindow = {
  setInterval(callback, delay) {
    const id = ++intervalSequence;
    intervals.set(id, { callback, delay });
    return id;
  },
  clearInterval(id) { intervals.delete(id); },
  addEventListener() {}
};
const fakeDocument = {
  readyState: 'complete',
  getElementById(id) { return elements[id] || null; },
  createElement() { return new FakeElement('created'); },
  addEventListener() {}
};
const context = {
  window: fakeWindow,
  document: fakeDocument,
  console,
  Math,
  Number,
  Set,
  Array,
  Object,
  String,
  Infinity
};
vm.createContext(context);
const root = path.join(__dirname, '..');
vm.runInContext(fs.readFileSync(path.join(root, 'js', 'closest-pair.js'), 'utf8'), context);
const labSource = fs.readFileSync(path.join(root, 'js', 'lab.js'), 'utf8').replace(
  "  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });",
  "  window.__testGeneratePoints = generatePoints;\n  window.__testLevels = LEVELS;\n  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });"
);
vm.runInContext(labSource, context);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function circleCount() {
  return (elements.plotLayer.innerHTML.match(/<circle\b/g) || []).length;
}
function tickCurrentInterval() {
  const first = intervals.entries().next();
  assert(!first.done, 'Esperava uma animação ativa.');
  first.value[1].callback();
}
function finishAnimation(limit = 2000) {
  let count = 0;
  while (intervals.size && count < limit) {
    tickCurrentInterval();
    count += 1;
  }
  assert(intervals.size === 0, 'A animação não terminou no limite esperado.');
}

// Inicialização: deve produzir pontos no plano, não apenas montar o SVG vazio.
assert(circleCount() === 7, `Esperava 7 pontos desenhados; encontrei ${circleCount()}.`);
assert(elements.pointCount.textContent === '7', 'Contagem inicial de pontos incorreta.');
assert(elements.stageTitle.textContent.length > 0, 'Texto inicial da etapa não foi preenchido.');
assert(elements.progressText.textContent.includes('etapas'), 'Progresso inicial ausente.');

// Navegação manual e retorno.
elements.nextBtn.click();
assert(elements.completed.textContent === '1', 'Próxima etapa não avançou.');
elements.prevBtn.click();
assert(elements.completed.textContent === '0', 'Etapa anterior não voltou ao início.');
elements.nextBtn.click();
elements.resetBtn.click();
assert(elements.completed.textContent === '0', 'Reiniciar não voltou ao início.');

// Dica altera o conteúdo da caixa de ideia-chave.
elements.hintBtn.click();
assert(elements.detailText.textContent.length > 0, 'Dica não foi apresentada.');

// Play/pause deve criar e remover um único timer.
elements.playBtn.click();
assert(intervals.size === 1, 'Play não iniciou o timer.');
assert(elements.runState.textContent === 'EXECUTANDO', 'Estado não indicou execução.');
tickCurrentInterval();
assert(Number(elements.completed.textContent) >= 2, 'Timer não avançou o algoritmo.');
elements.playBtn.click();
assert(intervals.size === 0, 'Pause não cancelou o timer.');

// Alterar velocidade durante a execução troca o intervalo sem avançar etapa.
elements.playBtn.click();
const beforeSpeedChange = elements.completed.textContent;
const oldTimer = intervals.keys().next().value;
elements.speedSelect.change('150');
assert(intervals.size === 1, 'Troca de velocidade duplicou ou removeu o timer.');
assert(!intervals.has(oldTimer), 'O timer anterior não foi substituído.');
assert(elements.completed.textContent === beforeSpeedChange, 'Troca de velocidade pulou uma etapa.');
elements.playBtn.click();
assert(intervals.size === 0, 'Pause após trocar velocidade falhou.');

// Executar até o fim percorre a trilha com timer, em vez de saltar direto.
elements.resetBtn.click();
elements.runAllBtn.click();
assert(intervals.size === 1, 'Executar até o fim não iniciou a animação.');
finishAnimation();
assert(elements.resultPanel.hidden === false, 'Resultado não apareceu ao concluir a animação.');
assert(elements.runState.textContent === 'CONCLUÍDO', 'Estado final não foi atualizado.');
assert(elements.resultDistance.textContent !== '—', 'Distância final não foi exibida.');

// Pular para resultado deve funcionar sem timer.
elements.resetBtn.click();
elements.stepAllBtn.click();
assert(intervals.size === 0, 'Pular para o resultado deixou timer ativo.');
assert(elements.resultPanel.hidden === false, 'Pular para o resultado não mostrou o resultado.');

// Nova variação e mudança de cenário regeneram e redesenham a quantidade certa.
const previousPlot = elements.plotLayer.innerHTML;
elements.resultNewBtn.click();
assert(elements.plotLayer.innerHTML !== previousPlot, 'Nova variação não alterou o plano.');
assert(circleCount() === 7, 'Nova variação perdeu os pontos.');
elements.levelSelect.change('3');
assert(elements.pointCount.textContent === '16', 'Seleção do desafio final não atualizou a quantidade.');
assert(circleCount() === 16, 'Cenário novo não desenhou todos os pontos.');

// Os cenários especiais realmente começam com o melhor par atravessando o corte principal.
[2, 3].forEach((levelIndex) => {
  for (let variation = 0; variation < 3; variation += 1) {
    const generated = fakeWindow.__testGeneratePoints(levelIndex, variation);
    const generatedRun = fakeWindow.ClosestPair.run(generated);
    const rootDivide = generatedRun.events.find((event) => event.type === 'divide' && event.depth === 0);
    const leftSet = new Set(rootDivide.leftIds);
    const rightSet = new Set(rootDivide.rightIds);
    const crosses = (leftSet.has(generatedRun.result.a.id) && rightSet.has(generatedRun.result.b.id)) ||
      (leftSet.has(generatedRun.result.b.id) && rightSet.has(generatedRun.result.a.id));
    assert(crosses, `Cenário de fronteira ${levelIndex + 1}, variação ${variation}, não gerou melhor par cruzado.`);
  }
});

// Todos os quatro cenários precisam gerar os pontos e chegar a um resultado validado.
[7, 10, 12, 16].forEach((expectedCount, levelIndex) => {
  elements.levelSelect.change(String(levelIndex));
  assert(elements.pointCount.textContent === String(expectedCount), `Quantidade incorreta no cenário ${levelIndex + 1}.`);
  assert(circleCount() === expectedCount, `Pontos não foram desenhados no cenário ${levelIndex + 1}.`);
  elements.stepAllBtn.click();
  assert(elements.resultPanel.hidden === false, `Resultado ausente no cenário ${levelIndex + 1}.`);
  assert(elements.resultSummary.textContent.includes('As duas abordagens concordam.'), `Validação com força bruta falhou no cenário ${levelIndex + 1}.`);
});

console.log('PASS: inicialização com pontos visíveis e controles do laboratório validados.');
