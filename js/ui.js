/* Interface do Contágio: controles, HUD, gráfico e integração com Game. */
(function () {
  'use strict';

  window.Contagio = window.Contagio || {};

  var UI = {};
  var game = null;
  var world = null;
  var speed = 1;
  var selectingDistrict = false;
  var awaitingTraceIsolation = false;
  var currentLevelIndex = 0;
  var measuresUsed = 0;
  var peakInfected = 0;
  var renderOptions = {
    showPairs: false,
    showDistricts: false,
    showStrip: false,
    highlightTraced: false,
    tracedPeople: []
  };
  var elements = {};
  var eventsBound = false;
  var toastTimers = [];

  function byId(id) { return document.getElementById(id); }

  function config() { return (world && world.config) || window.Contagio.Config || {}; }

  function resolveWorld() {
    if (!game) return world;
    if (typeof game.getWorld === 'function') return game.getWorld();
    if (game.world) return game.world;
    if (game.state && game.state.world) return game.state.world;
    if (game.currentWorld) return game.currentWorld;
    return world;
  }

  function resolveCounts(target) {
    if (window.Contagio.Epidemic && typeof window.Contagio.Epidemic.countByState === 'function') {
      return window.Contagio.Epidemic.countByState(target);
    }
    var counts = { S: 0, I: 0, R: 0, V: 0 };
    (target.people || []).forEach(function (person) {
      if (Object.prototype.hasOwnProperty.call(counts, person.state)) counts[person.state] += 1;
    });
    return counts;
  }

  function setText(id, value) {
    var element = elements[id] || byId(id);
    if (element) element.textContent = String(value);
  }

  function formatNumber(value) {
    return Math.round(Number(value) || 0).toLocaleString('pt-BR');
  }

  function formatMoney(value) {
    return (Number(value) || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1
    });
  }

  function setProgress(id, count, total) {
    var fill = byId(id);
    if (!fill) return;
    var percentage = total > 0 ? Math.max(0, Math.min(100, count / total * 100)) : 0;
    fill.style.width = percentage + '%';
    fill.parentNode.setAttribute('aria-valuenow', String(Math.round(percentage)));
  }

  function treeDepth(node) {
    if (!node) return 0;
    var ownDepth = Number.isFinite(node.depth) ? node.depth : 0;
    return Math.max(ownDepth, treeDepth(node.left), treeDepth(node.right));
  }

  function getComparisons(target, extra) {
    if (extra && Number.isFinite(extra.comparisons)) return extra.comparisons;
    if (extra && Number.isFinite(extra.comparisonsDC)) return extra.comparisonsDC;
    if (extra && extra.pairsResult && Number.isFinite(extra.pairsResult.comparisons)) {
      return extra.pairsResult.comparisons;
    }
    if (extra && extra.pairs && Number.isFinite(extra.pairs.comparisons)) {
      return extra.pairs.comparisons;
    }
    if (Number.isFinite(target.lastComparisons)) return target.lastComparisons;
    if (target.stats && Number.isFinite(target.stats.comparisons)) return target.stats.comparisons;
    if (target.lastPairsResult && Number.isFinite(target.lastPairsResult.comparisons)) {
      return target.lastPairsResult.comparisons;
    }
    return 0;
  }

  function getDistrictIdAtX(target, x) {
    var node = target.lastTree;
    var depthLimit = Math.max(1, Number(config().DISTRICT_DEPTH) || 1);
    var depth = 0;
    var id = 0;
    while (node && depth < depthLimit && node.left && node.right &&
      node.cutX !== null && node.cutX !== undefined) {
      if (x <= node.cutX) {
        node = node.left;
        id *= 2;
      } else {
        node = node.right;
        id = id * 2 + 1;
      }
      depth += 1;
    }
    if (!target.lastTree) {
      var districts = target.districts || [];
      var match = districts.find(function (district) {
        return x >= district.minX && x <= district.maxX;
      });
      if (match) return match.id;
      if (districts.length) {
        var nearest = districts[0];
        var best = Infinity;
        districts.forEach(function (district) {
          var center = (district.minX + district.maxX) / 2;
          var distance = Math.abs(x - center);
          if (distance < best) { best = distance; nearest = district; }
        });
        return nearest.id;
      }
    }
    return id;
  }

  function toast(message, ok) {
    var root = elements.toastRoot || byId('toast-root');
    if (!root) return;
    var item = document.createElement('div');
    item.className = 'toast ' + (ok ? 'toast-success' : 'toast-error');
    item.setAttribute('role', 'status');
    item.textContent = message || (ok ? 'Medida aplicada.' : 'Não foi possível aplicar a medida.');
    root.appendChild(item);
    window.requestAnimationFrame(function () { item.classList.add('is-visible'); });
    var firstTimer = window.setTimeout(function () {
      toastTimers = toastTimers.filter(function (timer) { return timer !== firstTimer; });
      item.classList.remove('is-visible');
      var secondTimer = window.setTimeout(function () {
        toastTimers = toastTimers.filter(function (timer) { return timer !== secondTimer; });
        if (item.parentNode) item.parentNode.removeChild(item);
      }, 260);
      toastTimers.push(secondTimer);
    }, 3200);
    toastTimers.push(firstTimer);
  }

  function clearToastTimers() {
    toastTimers.forEach(function (timer) { window.clearTimeout(timer); });
    toastTimers = [];
    var root = elements.toastRoot || byId('toast-root');
    if (root) root.textContent = '';
  }

  function actionResult(result) {
    if (!result) {
      toast('A ação não retornou um resultado válido.', false);
      return;
    }
    if (result.ok) measuresUsed += 1;
    toast(result.message, result.ok);
    UI.update(world || resolveWorld(), {});
  }

  function showSelectionHint(show) {
    selectingDistrict = Boolean(show);
    var hint = elements.selectionHint || byId('selection-hint');
    if (hint) hint.hidden = !selectingDistrict;
    if (elements.city) elements.city.style.cursor = selectingDistrict ? 'crosshair' : '';
  }

  function cancelDistrictSelection() {
    if (!selectingDistrict) return;
    showSelectionHint(false);
    toast('Seleção de distrito cancelada.', false);
  }

  function onCityClick(event) {
    if (!selectingDistrict || !world || !elements.city) return;
    var rect = elements.city.getBoundingClientRect();
    var x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * world.width;
    var districtId = getDistrictIdAtX(world, x);
    showSelectionHint(false);
    var result = window.Contagio.Actions.lockdownDistrict(world, districtId);
    actionResult(result);
  }

  function refreshRenderer() {
    var target = world || resolveWorld();
    if (!target || !window.Contagio.Renderer) return;
    renderOptions.tracedPeople = (target.tracedPeople ||
      (target.actionState && target.actionState.tracedPeople) || []);
    window.Contagio.Renderer.draw(target, renderOptions);
  }

  function togglePlay(forceState) {
    var shouldPlay = typeof forceState === 'boolean'
      ? forceState
      : !(game && typeof game.isPlaying === 'function' && game.isPlaying());
    if (!game) return;
    if (shouldPlay && typeof game.play === 'function') game.play();
    else if (!shouldPlay && typeof game.pause === 'function') game.pause();
    setText('play-label', shouldPlay ? 'Pause' : 'Play');
    setText('play-icon', shouldPlay ? 'Ⅱ' : '▶');
    var button = elements.playPause;
    if (button) button.setAttribute('aria-label', shouldPlay ? 'Pausar simulação' : 'Iniciar simulação automática');
  }

  function nextDay() {
    if (!game || typeof game.nextTurn !== 'function') return;
    game.nextTurn();
  }

  function startGame(levelIndex) {
    currentLevelIndex = Math.max(0, Number(levelIndex) || 0);
    clearToastTimers();
    measuresUsed = 0;
    peakInfected = 0;
    awaitingTraceIsolation = false;
    renderOptions.highlightTraced = false;
    renderOptions.tracedPeople = [];
    showSelectionHint(false);
    togglePlay(false);
    if (game && typeof game.start === 'function') game.start(currentLevelIndex);
    var menu = elements.menuOverlay;
    if (menu) { menu.classList.remove('is-visible'); menu.hidden = true; }
    var resultOverlay = elements.levelOverlay;
    if (resultOverlay) { resultOverlay.classList.remove('is-visible'); resultOverlay.hidden = true; }
    // Game.start já atualiza a HUD e desenha o mundo inicial. Evita uma
    // segunda atualização/renderização redundante no mesmo clique.
  }

  function updateActionButtons(target) {
    if (!target) return;
    var cfg = config();
    var budget = Number(target.budget) || 0;
    var vaccineCount = Math.min(Number(cfg.VACCINE_BATCH_SIZE) || 12,
      (target.people || []).filter(function (person) { return person.state === 'S'; }).length);
    var vaccineCost = vaccineCount * (Number(cfg.VACCINE_COST_PER_PERSON) || 0);
    var traceCost = Number(cfg.TRACE_COST) || 0;
    var distancingCost = Number(cfg.DISTANCING_DAILY_COST) || 0;
    var state = target.actionState || {};
    var distancingActive = Boolean(state.distancing && state.distancing.active);
    var traced = state.tracedPeople || target.tracedPeople || [];
    var traceIsolationCost = traced.filter(function (person) {
      return person && person.state === 'S' && !person.quarantined;
    }).length * (Number(cfg.TRACE_QUARANTINE_COST_PER_PERSON) || 0);
    var smallestDistrict = (target.districts || []).filter(function (district) {
      return !district.locked;
    }).reduce(function (min, district) {
      return Math.min(min, district.count * (Number(cfg.LOCKDOWN_COST_PER_PERSON) || 0));
    }, Infinity);
    if (!Number.isFinite(smallestDistrict)) smallestDistrict = 0;

    var lock = elements.lockdown;
    if (lock) {
      lock.disabled = budget < smallestDistrict || !(target.districts || []).some(function (d) { return !d.locked; });
      setButtonCost(lock, 'Lockdown de distrito', 'a partir de ' + formatMoney(smallestDistrict));
    }
    if (elements.distancing) {
      elements.distancing.disabled = !distancingActive && budget < distancingCost;
      setButtonCost(elements.distancing, distancingActive ? 'Desativar distanciamento' : 'Distanciamento',
        distancingActive ? 'Ativo · ' + formatMoney(distancingCost) + '/dia' : formatMoney(distancingCost) + '/dia');
    }
    if (elements.vaccinate) {
      elements.vaccinate.disabled = vaccineCount === 0 || budget < vaccineCost;
      setButtonCost(elements.vaccinate, 'Vacinar', formatMoney(vaccineCost) + ' · ' + vaccineCount + ' doses');
    }
    if (elements.trace) {
      var canIsolate = awaitingTraceIsolation && traced.length > 0;
      var cost = canIsolate ? traceIsolationCost : traceCost;
      elements.trace.disabled = budget < cost || (canIsolate && traceIsolationCost === 0);
      setButtonCost(elements.trace, canIsolate ? 'Isolar rastreados' : 'Rastrear contatos',
        canIsolate ? formatMoney(traceIsolationCost) : formatMoney(traceCost));
    }
  }

  function setButtonCost(button, title, costText) {
    if (!button) return;
    var strong = button.querySelector('.action-copy strong');
    var small = button.querySelector('.action-copy small');
    if (strong) strong.textContent = title;
    if (small) small.textContent = costText;
  }

  function drawChart(target, counts) {
    var canvas = elements.chart;
    if (!canvas || !canvas.getContext) return;
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(280, rect.width || canvas.clientWidth || 320);
    var height = Math.max(110, rect.height || canvas.clientHeight || 140);
    var dpr = Math.max(1, window.devicePixelRatio || 1);
    var backingWidth = Math.round(width * dpr);
    var backingHeight = Math.round(height * dpr);
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    var history = target.stats && target.stats.history;
    var series = history && ['S', 'I', 'R', 'V'].every(function (key) {
      return Array.isArray(history[key]);
    }) ? history : null;
    var data = series ? {
      S: series.S.slice(), I: series.I.slice(), R: series.R.slice(), V: series.V.slice()
    } : { S: [counts.S], I: [counts.I], R: [counts.R], V: [counts.V] };
    var length = Math.max(1, data.S.length, data.I.length, data.R.length, data.V.length);
    var total = Math.max(1, target.people.length);
    var left = 30, right = 8, top = 9, bottom = 20;
    var plotWidth = Math.max(1, width - left - right);
    var plotHeight = Math.max(1, height - top - bottom);
    var colors = { S: '#4ba7ff', I: '#ff5f70', R: '#39d6a0', V: '#a78bfa' };

    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(154,171,194,.75)';
    [0, 0.5, 1].forEach(function (fraction) {
      var y = top + plotHeight * (1 - fraction);
      ctx.strokeStyle = 'rgba(151,177,211,.12)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(width - right, y); ctx.stroke();
      ctx.fillText(Math.round(total * fraction), left - 5, y);
    });

    ['S', 'I', 'R', 'V'].forEach(function (key) {
      var values = data[key];
      if (!values.length) return;
      ctx.beginPath();
      for (var i = 0; i < values.length; i += 1) {
        var x = left + (length <= 1 ? 0 : i / (length - 1) * plotWidth);
        var y = top + plotHeight * (1 - Math.max(0, Math.min(total, values[i])) / total);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = colors[key];
      ctx.lineWidth = key === 'I' ? 2.2 : 1.6;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(154,171,194,.75)';
    ctx.fillText('Dia 0', left, height - 4);
    ctx.textAlign = 'right';
    ctx.fillText('Dia ' + Math.max(0, length - 1), width - right, height - 4);
  }

  function showLevelResult(status, target, extra) {
    var overlay = elements.levelOverlay;
    if (!overlay) return;
    togglePlay(false);
    overlay.hidden = false;
    overlay.classList.add('is-visible');
    var won = status === 'won' || status === 'victory' || status === true;
    setText('level-result-kicker', won ? 'FASE CONCLUÍDA' : 'FIM DE JOGO');
    setText('level-result-title', won ? 'Cidade protegida!' : 'A epidemia saiu do controle');
    var counts = resolveCounts(target);
    var history = target.stats && target.stats.history;
    var peak = peakInfected;
    if (history && Array.isArray(history.I) && history.I.length) {
      peak = Math.max.apply(null, history.I.concat([peak]));
    }
    var summary = 'Dias: ' + (target.day || 0) + ' · Pico de infectados: ' + peak +
      ' · Medidas utilizadas: ' + measuresUsed + '. ' +
      'Situação final — S: ' + counts.S + ', I: ' + counts.I + ', R: ' + counts.R + ', V: ' + counts.V + '.';
    if (extra && extra.message) summary = extra.message + ' ' + summary;
    setText('level-result-message', summary);
    var next = elements.nextLevel;
    var hasNextLevel = window.Contagio.Levels &&
      typeof window.Contagio.Levels.list === 'function' &&
      currentLevelIndex < window.Contagio.Levels.list().length - 1;
    if (next) next.hidden = !won || !hasNextLevel;
    var retry = elements.retry;
    if (retry) retry.hidden = false;
  }

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;
    if (elements.start) elements.start.addEventListener('click', function () { startGame(0); });
    if (elements.nextDay) elements.nextDay.addEventListener('click', nextDay);
    if (elements.playPause) elements.playPause.addEventListener('click', function () { togglePlay(); });
    if (elements.speed) elements.speed.addEventListener('change', function () {
      speed = Number(elements.speed.value) || 1;
      if (game && typeof game.setSpeed === 'function') game.setSpeed(speed);
    });

    if (elements.lockdown) elements.lockdown.addEventListener('click', function () {
      if (!world) return;
      showSelectionHint(true);
      toast('Clique em um distrito no mapa. Pressione ESC para cancelar.', true);
    });
    if (elements.city) elements.city.addEventListener('click', onCityClick);

    if (elements.distancing) elements.distancing.addEventListener('click', function () {
      if (!world) return;
      var active = Boolean(world.actionState && world.actionState.distancing && world.actionState.distancing.active);
      var strength = active ? 0 : (Number(config().DEFAULT_DISTANCING_STRENGTH) || 0.5);
      actionResult(window.Contagio.Actions.distancing(world, strength));
    });
    if (elements.vaccinate) elements.vaccinate.addEventListener('click', function () {
      if (!world) return;
      actionResult(window.Contagio.Actions.vaccinate(world, Number(config().VACCINE_BATCH_SIZE) || 12));
    });
    if (elements.trace) elements.trace.addEventListener('click', function () {
      if (!world) return;
      if (awaitingTraceIsolation) {
        actionResult(window.Contagio.Actions.quarantineTraced(world));
        awaitingTraceIsolation = false;
      } else {
        var result = window.Contagio.Actions.trace(world);
        if (result && result.ok) {
          awaitingTraceIsolation = true;
          renderOptions.highlightTraced = true;
        }
        actionResult(result);
      }
    });

    ['toggle-districts', 'toggle-strip', 'toggle-pairs'].forEach(function (id) {
      var checkbox = byId(id);
      if (!checkbox) return;
      checkbox.addEventListener('change', function () {
        if (id === 'toggle-districts') renderOptions.showDistricts = checkbox.checked;
        if (id === 'toggle-strip') renderOptions.showStrip = checkbox.checked;
        if (id === 'toggle-pairs') renderOptions.showPairs = checkbox.checked;
        refreshRenderer();
      });
    });

    if (elements.retry) elements.retry.addEventListener('click', function () { startGame(currentLevelIndex); });
    if (elements.nextLevel) elements.nextLevel.addEventListener('click', function () { startGame(currentLevelIndex + 1); });
    if (elements.continue) elements.continue.addEventListener('click', function () {
      if (elements.levelOverlay) {
        elements.levelOverlay.classList.remove('is-visible');
        elements.levelOverlay.hidden = true;
      }
    });

    document.addEventListener('keydown', function (event) {
      var target = event.target;
      var tag = target && target.tagName ? target.tagName.toLowerCase() : '';
      var typing = tag === 'input' || tag === 'textarea' || tag === 'select' || (target && target.isContentEditable);
      if (event.key === 'Escape') { cancelDistrictSelection(); return; }
      if (typing || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault();
        nextDay();
      } else if (event.key.toLowerCase() === 'p') {
        event.preventDefault();
        togglePlay();
      }
    });
  }

  UI.init = function (gameInstance) {
    game = gameInstance || null;
    elements = {
      city: byId('city'), chart: byId('chart'),
      start: byId('btn-start'), nextDay: byId('btn-next-day'), playPause: byId('btn-play-pause'),
      speed: byId('speed-select'), lockdown: byId('btn-lockdown'), distancing: byId('btn-distancing'),
      vaccinate: byId('btn-vaccinate'), trace: byId('btn-trace'),
      menuOverlay: byId('menu-overlay'), levelOverlay: byId('level-overlay'),
      retry: byId('btn-retry'), nextLevel: byId('btn-next-level'), continue: byId('btn-level-continue'),
      selectionHint: byId('selection-hint'), toastRoot: byId('toast-root')
    };
    if (elements.city && window.Contagio.Renderer) window.Contagio.Renderer.init(elements.city);
    bindEvents();
    return UI;
  };

  UI.update = function (targetWorld, extra) {
    if (!targetWorld) targetWorld = resolveWorld();
    if (!targetWorld) return UI;
    world = targetWorld;
    extra = extra || {};
    var counts = resolveCounts(world);
    var total = Math.max(1, world.people.length);
    peakInfected = Math.max(peakInfected, counts.I);

    setText('current-day', String(world.day || 0).padStart(2, '0'));
    setText('city-population', 'POPULAÇÃO: ' + formatNumber(world.people.length));
    setText('stat-susceptible', formatNumber(counts.S));
    setText('stat-infected', formatNumber(counts.I));
    setText('stat-recovered', formatNumber(counts.R));
    setText('stat-vaccinated', formatNumber(counts.V));
    setProgress('bar-susceptible', counts.S, total);
    setProgress('bar-infected', counts.I, total);
    setProgress('bar-recovered', counts.R, total);
    setProgress('bar-vaccinated', counts.V, total);

    var capacity = Math.max(1, Number(config().HOSPITAL_CAPACITY) || 1);
    var occupancy = counts.I / capacity * 100;
    setText('hospital-occupancy', counts.I + ' / ' + capacity);
    setText('hospital-available', Math.max(0, capacity - counts.I));
    var hospitalFill = byId('hospital-progress-fill');
    if (hospitalFill) {
      hospitalFill.style.width = Math.min(100, occupancy) + '%';
      hospitalFill.style.background = occupancy > 80 ? '#ff5f70' : '';
      var progress = byId('hospital-progress');
      if (progress) progress.setAttribute('aria-valuenow', String(Math.min(100, Math.round(occupancy))));
    }

    setText('budget-value', formatMoney(world.budget));
    setText('algorithm-comparisons', formatNumber(getComparisons(world, extra)));
    var brute = world.people.length * (world.people.length - 1) / 2;
    setText('brute-comparisons', formatNumber(brute));
    var dc = getComparisons(world, extra);
    var ratio = dc > 0 ? (brute / dc).toFixed(2) + '×' : '—';
    setText('comparison-ratio', ratio);
    setText('tree-depth', treeDepth(world.lastTree));

    // A existência de um mundo indica que a fase já foi iniciada.
    [elements.nextDay, elements.playPause, elements.speed, elements.lockdown,
      elements.distancing, elements.vaccinate, elements.trace].forEach(function (control) {
      if (control) control.disabled = false;
    });
    ['toggle-districts', 'toggle-strip', 'toggle-pairs'].forEach(function (id) {
      var checkbox = byId(id);
      if (checkbox) checkbox.disabled = false;
    });

    updateActionButtons(world);
    drawChart(world, counts);
    renderOptions.tracedPeople = world.tracedPeople ||
      (world.actionState && world.actionState.tracedPeople) || [];
    if (!extra.skipRender && window.Contagio.Renderer) window.Contagio.Renderer.draw(world, renderOptions);

    var status = extra.status || extra.result || extra.outcome;
    if (status === 'won' || status === 'lost' || status === 'victory' || status === 'defeat') {
      showLevelResult(status, world, extra);
    }
    return UI;
  };

  UI.toast = toast;
  UI.pause = function () { togglePlay(false); };
  UI.isPlaying = function () { return Boolean(game && game.isPlaying && game.isPlaying()); };

  window.Contagio.UI = UI;
}());
