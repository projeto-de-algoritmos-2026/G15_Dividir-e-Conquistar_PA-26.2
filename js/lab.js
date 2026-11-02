(function () {
  'use strict';

  var WIDTH = 900;
  var HEIGHT = 540;
  var MARGIN = 48;
  var LEVELS = [
    { name: 'Aquecimento', count: 7, seed: 1543, trap: false },
    { name: 'Dois lados', count: 10, seed: 3181, trap: false },
    { name: 'Par na fronteira', count: 12, seed: 7727, trap: true },
    { name: 'Desafio final', count: 16, seed: 9413, trap: true }
  ];

  var elements = {};
  var state = {
    level: 0,
    variation: 0,
    run: null,
    index: -1,
    timer: null,
    delay: 850,
    hintCount: 0,
    history: []
  };

  function byId(id) { return document.getElementById(id); }

  function seededRandom(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pointDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function closest(points) {
    var best = Infinity;
    for (var i = 0; i < points.length; i += 1) {
      for (var j = i + 1; j < points.length; j += 1) {
        best = Math.min(best, pointDistance(points[i], points[j]));
      }
    }
    return best;
  }

  function isCrossingBest(points) {
    var sorted = points.slice().sort(function (a, b) { return a.x - b.x || a.y - b.y; });
    var middle = Math.floor(sorted.length / 2);
    var left = sorted.slice(0, middle);
    var right = sorted.slice(middle);
    var localBest = Math.min(closest(left), closest(right));
    var crossBest = Infinity;
    left.forEach(function (a) {
      right.forEach(function (b) { crossBest = Math.min(crossBest, pointDistance(a, b)); });
    });
    return crossBest < localBest * 0.88;
  }

  function generatePoints(levelIndex, variation) {
    var level = LEVELS[levelIndex];
    var random = seededRandom(level.seed + variation * 104729);
    var points = [];
    var attempts = 0;
    var needsTrap = level.trap;

    while (attempts < (needsTrap ? 9000 : 3000)) {
      attempts += 1;
      var pointsCandidate = [];
      while (pointsCandidate.length < level.count) {
        var x = Math.round(MARGIN + 15 + random() * (WIDTH - (MARGIN + 15) * 2));
        var y = Math.round(MARGIN + 15 + random() * (HEIGHT - (MARGIN + 15) * 2));
        var tooClose = pointsCandidate.some(function (p) { return pointDistance(p, { x: x, y: y }) < 25; });
        if (!tooClose) pointsCandidate.push({ id: pointsCandidate.length, x: x, y: y });
      }
      if (!needsTrap || isCrossingBest(pointsCandidate)) {
        points = pointsCandidate;
        break;
      }
    }

    if (!points.length) {
      points = Array.from({ length: level.count }, function (_, i) {
        return { id: i, x: MARGIN + 25 + i * 31, y: MARGIN + 20 + ((i * 83) % (HEIGHT - 90)) };
      });
    }
    return points;
  }

  function eventCopy(event) {
    var n = event.pointIds ? event.pointIds.length : 0;
    var measured = Number.isFinite(event.distance) ? event.distance : (Number.isFinite(event.bestDistance) ? event.bestDistance : null);
    var d = measured == null ? '—' : measured.toFixed(1);
    switch (event.type) {
      case 'intro': return { label: 'Início', icon: '✦', title: 'Vamos encontrar o par mais próximo.', description: 'O conjunto tem ' + event.totalPoints + ' pontos. Em vez de medir todas as combinações, vamos dividir o problema em partes menores.', detail: 'No final, vamos conferir a resposta calculando também a distância de todos os pares possíveis.' };
      case 'divide': return { label: 'Dividir', icon: '⌁', title: 'Separar em duas metades.', description: 'Este subproblema contém ' + n + ' pontos. A linha vertical passa entre os dois pontos centrais da ordenação por x.', detail: 'Metade esquerda: ' + event.leftCount + ' pontos. Metade direita: ' + event.rightCount + '. Cada lado será resolvido independentemente.' };
      case 'base-start': return { label: 'Caso base', icon: '▦', title: 'O problema ficou pequeno.', description: 'Com ' + event.pointCount + ' ponto(s), não precisamos dividir mais. Basta comparar todos os pares disponíveis neste pequeno conjunto.', detail: 'Número de pares neste caso-base: ' + event.totalPairs + '.' };
      case 'base-compare': return { label: 'Comparação', icon: '↔', title: 'Medindo um par de pontos.', description: 'A distância entre este par é ' + d + ' unidades.' + (event.improved ? ' É a menor encontrada até agora neste subproblema.' : ' O melhor par atual continua sendo mais próximo.'), detail: 'A distância euclidiana considera a diferença horizontal e vertical entre os pontos.' };
      case 'base-done': return { label: 'Caso base resolvido', icon: '✓', title: 'A melhor resposta desta parte foi guardada.', description: 'Este subproblema devolve a menor distância encontrada: ' + d + ' unidades.', detail: 'Ao retornar da recursão, essa resposta será comparada com a da outra metade.' };
      case 'strip': return { label: 'Faixa central', icon: '▥', title: 'Investigar a faixa ao redor do corte.', description: 'A melhor distância entre os lados é δ = ' + Number(event.delta).toFixed(1) + '. Um par que atravessa o corte só pode melhorar esse valor se estiver dentro da faixa sombreada.', detail: 'Foram selecionados ' + event.stripIds.length + ' ponto(s). Na ordenação por y, cada ponto precisa examinar no máximo os sete seguintes.' };
      case 'strip-compare': return { label: 'Comparação na faixa', icon: '⇄', title: 'Verificar um possível par cruzado.', description: 'A distância deste par é ' + d + ' unidades. ' + (event.improved ? 'Encontramos uma distância menor: a resposta melhorou!' : 'Esse par não supera a melhor distância conhecida.'), detail: 'Só comparamos pontos de lados diferentes. Pares do mesmo lado já foram tratados na recursão.' };
      case 'merge': return { label: 'Combinar', icon: '⌘', title: 'Unir as respostas dos dois lados.', description: 'A menor distância deste subproblema é ' + d + ' unidades. Ela pode vir da esquerda, da direita ou da faixa central.', detail: 'A resposta retorna para a chamada anterior, até chegar novamente à raiz.' };
      case 'complete': return { label: 'Concluído', icon: '✦', title: 'O par mais próximo foi encontrado.', description: 'O menor par está destacado no plano. A conferência pelo método que testa todos os pares ' + (event.verified ? 'encontrou a mesma distância.' : 'apontou uma diferença que precisa ser investigada.'), detail: 'Os dois métodos precisam chegar à mesma distância mínima; a diferença está na quantidade de pares que cada um mede.' };
      default: return { label: 'ETAPA', icon: '·', title: 'Executando algoritmo.', description: '', detail: '' };
    }
  }

  function stopPlayback() {
    if (state.timer !== null) {
      window.clearInterval(state.timer);
      state.timer = null;
    }
    updatePlayButton();
  }

  function updatePlayButton() {
    var playing = state.timer !== null;
    if (!elements.playIcon || !elements.playText || !elements.runState) return;
    var hasRun = !!state.run;
    elements.playIcon.textContent = playing ? 'Ⅱ' : '▶';
    elements.playText.textContent = playing ? 'Pausar' : 'Animar execução';
    elements.runState.textContent = playing ? 'Em andamento' : (hasRun && state.index >= state.run.events.length - 1 ? 'Concluído' : 'Pronto');
    if (elements.runState.parentElement && elements.runState.parentElement.classList) {
      elements.runState.parentElement.classList.toggle('running', playing);
      elements.runState.parentElement.classList.toggle('done', !playing && hasRun && state.index >= state.run.events.length - 1);
    }
  }

  function nodeForEvent(event) {
    if (!event || !event.nodeId) return null;
    return state.run.nodes.find(function (node) { return node.id === event.nodeId; }) || null;
  }

  function svgElement(name, attrs, text) {
    var attrText = Object.keys(attrs || {}).map(function (key) {
      return key + '="' + String(attrs[key]).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"';
    }).join(' ');
    return '<' + name + ' ' + attrText + '>' + (text == null ? '' : text) + '</' + name + '>';
  }

  function renderPlot(event) {
    var layer = [];
    var node = nodeForEvent(event);
    var points = state.run.points;
    var activeIds = new Set(event && event.pointIds ? event.pointIds : points.map(function (p) { return p.id; }));
    var leftIds = new Set();
    var rightIds = new Set();
    var stripIds = new Set(event && event.stripIds ? event.stripIds : []);
    var pairIds = new Set(event && event.pair ? event.pair : (event && event.bestPair ? event.bestPair : []));
    var finalIds = event && event.type === 'complete' ? new Set(event.bestPair || []) : new Set();

    if (event && event.leftIds) {
      leftIds = new Set(event.leftIds);
      rightIds = new Set(event.rightIds);
    } else if (node && node.left && node.right) {
      node.left.points.forEach(function (p) { leftIds.add(p.id); });
      node.right.points.forEach(function (p) { rightIds.add(p.id); });
    }

    var minX = Math.min.apply(null, (node ? node.points : points).map(function (p) { return p.x; }));
    var maxX = Math.max.apply(null, (node ? node.points : points).map(function (p) { return p.x; }));
    var rangeWidth = Math.max(1, maxX - minX);
    if (node) {
      layer.push(svgElement('rect', { x: Math.max(0, minX - 22), y: 0, width: Math.min(WIDTH, rangeWidth + 44), height: HEIGHT, fill: 'var(--plot-area)' }, ''));
    }

    if (event && Number.isFinite(event.cutX) && (event.type === 'divide' || event.type === 'strip' || event.type === 'strip-compare' || event.type === 'merge')) {
      if (event.type === 'strip' || event.type === 'strip-compare') {
        var delta = Number(event.delta) || 0;
        layer.push(svgElement('rect', { x: event.cutX - delta, y: 0, width: Math.max(0, delta * 2), height: HEIGHT, fill: 'var(--plot-band)' }, ''));
      } else if (event.type === 'merge' && node && node.left && node.right) {
        var mergeDelta = Math.min(node.left.best.distance, node.right.best.distance);
        layer.push(svgElement('rect', { x: event.cutX - mergeDelta, y: 0, width: mergeDelta * 2, height: HEIGHT, fill: 'var(--plot-band-soft)' }, ''));
      }
      layer.push(svgElement('line', { x1: event.cutX, y1: 0, x2: event.cutX, y2: HEIGHT, stroke: 'var(--plot-selected)', 'stroke-width': 2, 'stroke-dasharray': '8 7', opacity: .9 }, ''));
      layer.push(svgElement('rect', { x: event.cutX - 29, y: 9, width: 58, height: 22, rx: 8, fill: 'var(--green)' }, ''));
      layer.push(svgElement('text', { x: event.cutX, y: 24, 'text-anchor': 'middle', fill: '#fff', 'font-size': 10, 'font-family': 'monospace' }, 'Corte'));
    }

    if (event && event.type === 'base-start') {
      layer.push(svgElement('rect', { x: Math.max(0, minX - 30), y: 0, width: rangeWidth + 60, height: HEIGHT, rx: 4, fill: 'var(--plot-strip-area)', stroke: 'var(--plot-left)', 'stroke-width': 1, 'stroke-dasharray': '4 5' }, ''));
    }

    points.forEach(function (point) {
      var active = activeIds.has(point.id);
      var sideColor = leftIds.has(point.id) ? 'var(--plot-left)' : rightIds.has(point.id) ? 'var(--plot-right)' : 'var(--plot-neutral)';
      var color = pairIds.has(point.id) || finalIds.has(point.id) ? 'var(--plot-selected)' : (stripIds.has(point.id) ? 'var(--plot-strip)' : sideColor);
      var opacity = active || event && event.type === 'complete' ? 1 : .26;
      layer.push(svgElement('circle', { cx: point.x, cy: point.y, r: pairIds.has(point.id) || finalIds.has(point.id) ? 10 : 7, fill: color, opacity: opacity, stroke: 'var(--plot-bg)', 'stroke-width': pairIds.has(point.id) || finalIds.has(point.id) ? 2 : 1.5 }, ''));
      if (active || event && event.type === 'complete') {
        layer.push(svgElement('text', { x: point.x, y: point.y - 12, 'text-anchor': 'middle', fill: 'var(--plot-label)', 'font-size': 10, 'font-family': 'monospace', opacity: .85 }, 'P' + point.id));
      }
    });

    if (event && (event.pair || event.bestPair)) {
      var pair = event.pair || event.bestPair;
      var p1 = points.find(function (p) { return String(p.id) === String(pair[0]); });
      var p2 = points.find(function (p) { return String(p.id) === String(pair[1]); });
      if (p1 && p2) {
        layer.push(svgElement('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, stroke: 'var(--plot-line)', 'stroke-width': event.type === 'complete' ? 4 : 2.5, 'stroke-linecap': 'round', 'stroke-dasharray': event.type === 'complete' ? 'none' : '5 4' }, ''));
        if (event.type === 'complete') {
          var middleX = (p1.x + p2.x) / 2;
          var middleY = (p1.y + p2.y) / 2;
          layer.push(svgElement('rect', { x: middleX - 38, y: middleY - 28, width: 76, height: 20, rx: 7, fill: 'var(--green)' }, ''));
          layer.push(svgElement('text', { x: middleX, y: middleY - 14, 'text-anchor': 'middle', fill: '#fff', 'font-size': 10, 'font-family': 'monospace' }, event.bestDistance.toFixed(1)));
        }
      }
    }

    elements.plotLayer.innerHTML = layer.join('');
  }

  function renderLog(event) {
    var list = elements.eventLog;
    list.innerHTML = '';
    if (state.index < 0) {
      var empty = document.createElement('li');
      empty.className = 'empty-log';
      empty.textContent = 'As etapas aparecerão aqui.';
      list.appendChild(empty);
      elements.logCount.textContent = '0';
      return;
    }
    var start = Math.max(0, state.index - 34);
    for (var i = start; i <= state.index; i += 1) {
      var item = state.run.events[i];
      var li = document.createElement('li');
      li.className = i === state.index ? 'current' : 'done';
      var indexSpan = document.createElement('span');
      indexSpan.className = 'log-index';
      indexSpan.textContent = String(i + 1).padStart(2, '0');
      var textSpan = document.createElement('span');
      var content = eventCopy(item);
      textSpan.textContent = content.label + ' · ' + content.title;
      li.appendChild(indexSpan);
      li.appendChild(textSpan);
      list.appendChild(li);
    }
    elements.logCount.textContent = String(state.index + 1);
    list.scrollTop = list.scrollHeight;
  }

  function updateUI() {
    var event = state.index >= 0 ? state.run.events[state.index] : null;
    var info = event ? eventCopy(event) : eventCopy({ type: 'intro', totalPoints: state.run.points.length });
    elements.stageIcon.textContent = info.icon;
    elements.stageLabel.textContent = info.label;
    elements.stageTitle.textContent = info.title;
    elements.stageDescription.textContent = info.description;
    elements.detailText.textContent = info.detail;

    var completed = Math.max(0, state.index + 1);
    var total = state.run.events.length;
    var comparisons = event ? event.comparisons : 0;
    elements.comparisons.textContent = String(comparisons);
    elements.completed.textContent = String(completed);
    elements.depth.textContent = String(event ? event.depth : 0);
    elements.pointCount.textContent = String(state.run.points.length);
    elements.algoComparisons.textContent = String(comparisons);
    elements.bruteComparisons.textContent = String(state.run.brute.comparisons);
    elements.progressBar.style.width = (completed / total * 100) + '%';
    elements.progressText.textContent = completed + ' / ' + total + ' etapas';
    elements.prevBtn.disabled = state.index < 0;
    elements.nextBtn.disabled = state.index >= total - 1;
    elements.resetBtn.disabled = state.index < 0;
    elements.hintBtn.disabled = state.index >= total - 1;
    elements.runAllBtn.disabled = state.index >= total - 1;

    var finished = event && event.type === 'complete';
    elements.resultPanel.hidden = !finished;
    if (finished) {
      var p = state.run.result;
      elements.resultDistance.textContent = p.distance.toFixed(2);
      elements.resultSummary.textContent = 'P' + p.a.id + ' e P' + p.b.id + ' são os pontos mais próximos. Dividir e conquistar calculou ' + state.run.comparisons + ' distância(s); testar todos os pares calculou ' + state.run.brute.comparisons + '. ' + (event.verified ? 'Os dois métodos chegaram ao mesmo resultado.' : 'Os resultados não coincidiram.');
    }
    renderPlot(event);
    renderLog(event);
    updatePlayButton();
  }

  function advance() {
    if (state.index >= state.run.events.length - 1) {
      stopPlayback();
      return false;
    }
    state.index += 1;
    updateUI();
    if (state.index >= state.run.events.length - 1) stopPlayback();
    return true;
  }

  function play() {
    if (state.timer !== null) {
      stopPlayback();
      return;
    }
    if (state.index >= state.run.events.length - 1) state.index = -1;
    advance();
    if (state.index >= state.run.events.length - 1) return;
    state.timer = window.setInterval(advance, state.delay);
    updatePlayButton();
  }

  function runAll() {
    stopPlayback();
    if (state.index >= state.run.events.length - 1) state.index = -1;
    if (state.index < 0) advance();
    if (state.index >= state.run.events.length - 1) return;
    state.timer = window.setInterval(advance, state.delay);
    updatePlayButton();
  }

  function jumpToResult() {
    stopPlayback();
    state.index = state.run.events.length - 1;
    updateUI();
  }

  function reset() {
    stopPlayback();
    state.index = -1;
    updateUI();
  }

  function showHint() {
    var event = state.index >= 0 ? state.run.events[state.index] : null;
    var hint;
    if (!event || event.type === 'intro') hint = 'Comece pela divisão: ordene os pontos pelo x e separe-os em duas metades equilibradas.';
    else if (event.type === 'divide') hint = 'A linha deve ficar entre os dois pontos centrais da lista ordenada por x. As metades podem ter tamanhos diferentes por apenas um ponto.';
    else if (event.type.indexOf('base') === 0) hint = 'No caso-base, compare todos os pares. Para três pontos, existem exatamente três pares possíveis.';
    else if (event.type === 'strip') hint = 'Use δ como limite horizontal: mantenha os pontos com |x − corte| ≤ δ. Depois pense na ordem por y.';
    else if (event.type === 'strip-compare') hint = 'Um par cruzado tem um ponto de cada lado. Se a diferença vertical já ultrapassa δ, os próximos não poderão melhorar a resposta.';
    else if (event.type === 'merge') hint = 'A resposta combinada é a menor entre a esquerda, a direita e os pares cruzados da faixa.';
    else hint = 'A execução terminou. Compare o número de distâncias calculadas com o método que testa todos os pares.';
    state.hintCount += 1;
    elements.detailText.textContent = hint;
    elements.hintBtn.textContent = '✦ Dica exibida';
  }

  function newVariation() {
    stopPlayback();
    state.variation += 1;
    makeRun();
  }

  function makeRun() {
    stopPlayback();
    var points = generatePoints(state.level, state.variation);
    state.run = window.ClosestPair.run(points);
    state.index = -1;
    state.hintCount = 0;
    elements.hintBtn.textContent = '✦ Mostrar uma dica';
    elements.levelSelect.value = String(state.level);
    elements.resultPanel.hidden = true;
    updateUI();
  }

  function init() {
    [
      'levelSelect', 'speedSelect', 'newBtn', 'runAllBtn', 'plotLayer', 'runState', 'resetBtn', 'prevBtn', 'playBtn', 'playIcon', 'playText', 'nextBtn', 'stepAllBtn', 'progressBar', 'progressText', 'stageIcon', 'stageLabel', 'stageTitle', 'stageDescription', 'detailText', 'hintBtn', 'comparisons', 'completed', 'depth', 'pointCount', 'algoComparisons', 'bruteComparisons', 'eventLog', 'logCount', 'resultPanel', 'resultSummary', 'resultDistance', 'resultNewBtn'
    ].forEach(function (id) { elements[id] = byId(id); });

    var missing = Object.keys(elements).filter(function (id) { return !elements[id]; });
    if (missing.length) {
      console.error('[Seja o Algoritmo] Elementos ausentes no HTML:', missing.join(', '));
      return;
    }

    elements.levelSelect.addEventListener('change', function () {
      state.level = Number(elements.levelSelect.value);
      state.variation = 0;
      makeRun();
    });
    elements.speedSelect.addEventListener('change', function () {
      state.delay = Number(elements.speedSelect.value) || 850;
      if (state.timer !== null) {
        window.clearInterval(state.timer);
        state.timer = window.setInterval(advance, state.delay);
      }
    });
    elements.newBtn.addEventListener('click', newVariation);
    elements.resultNewBtn.addEventListener('click', newVariation);
    elements.runAllBtn.addEventListener('click', runAll);
    elements.stepAllBtn.addEventListener('click', jumpToResult);
    elements.resetBtn.addEventListener('click', reset);
    elements.prevBtn.addEventListener('click', function () {
      stopPlayback();
      state.index = Math.max(-1, state.index - 1);
      updateUI();
    });
    elements.nextBtn.addEventListener('click', function () {
      stopPlayback();
      advance();
    });
    elements.playBtn.addEventListener('click', play);
    elements.hintBtn.addEventListener('click', showHint);

    window.addEventListener('beforeunload', stopPlayback);
    makeRun();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}());
