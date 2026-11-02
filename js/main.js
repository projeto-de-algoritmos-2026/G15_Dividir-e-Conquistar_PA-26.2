/* Integração final: ciclo de simulação, renderização e estado global do jogo. */
(function () {
  'use strict';

  window.Contagio = window.Contagio || {};

  var Game = {};
  var world = null;
  var currentLevel = null;
  var currentLevelIndex = -1;
  var simulationTimer = null;
  var animationFrame = null;
  var lastRenderTime = 0;
  var speed = 1;
  var initialized = false;
  var debugState = { enabled: false, turnsRemaining: 0, divergences: 0 };
  var renderOptions = {
    showPairs: false,
    showDistricts: false,
    showStrip: false,
    highlightTraced: false,
    tracedPeople: []
  };

  function moduleAt(name, method) {
    var module = window.Contagio[name];
    if (!module || (method && typeof module[method] !== 'function')) {
      throw new Error('Contagio.' + name + (method ? '.' + method : '') + ' não foi carregado corretamente.');
    }
    return module;
  }

  function getCanvas() {
    return document.getElementById('city');
  }

  function clearSimulationTimer() {
    if (simulationTimer !== null) {
      window.clearInterval(simulationTimer);
      simulationTimer = null;
    }
  }

  function simulationInterval() {
    var config = (world && world.config) || window.Contagio.Config || {};
    var base = Math.max(50, Number(config.PLAY_INTERVAL_MS) || 700);
    var minimum = Math.max(50, Number(config.MIN_PLAY_INTERVAL_MS) || 120);
    return Math.max(minimum, base / Math.max(1, speed));
  }

  function pairKey(pair) {
    var first = String(pair[0].id);
    var second = String(pair[1].id);
    return first < second ? first + '|' + second : second + '|' + first;
  }

  function comparePairResults(divideAndConquer, bruteForce) {
    var first = new Set((divideAndConquer.pairs || []).map(pairKey));
    var second = new Set((bruteForce.pairs || []).map(pairKey));
    if (first.size !== second.size) return false;
    for (var key of first) if (!second.has(key)) return false;
    return true;
  }

  function validatePairsThisTurn() {
    if (!debugState.enabled || debugState.turnsRemaining <= 0 || !world) return;
    debugState.turnsRemaining -= 1;

    var config = world.config || window.Contagio.Config;
    var brute = moduleAt('Pairs', 'bruteForcePairs').bruteForcePairs(
      world.people,
      Math.max(0, Number(config.CONTACT_RADIUS) || 0)
    );
    var dc = { pairs: world.lastPairs || [] };
    if (!comparePairResults(dc, brute)) {
      debugState.divergences += 1;
      console.warn('[Contágio][DEBUG] Divergência entre dividir e conquistar e força bruta no dia ' + world.day + '.', {
        divideAndConquerPairs: dc.pairs.length,
        bruteForcePairs: brute.pairs.length,
        people: world.people
      });
    }
    if (debugState.turnsRemaining === 0) {
      console.info('[Contágio][DEBUG] Validação concluída: 20 turnos; divergências: ' + debugState.divergences + '.');
    }
  }

  // Loop público de animação: desenho contínuo independente dos turnos
  // epidemiológicos, limitado a aproximadamente 60 quadros por segundo.
  Game.loop = function (timestamp) {
    animationFrame = null;
    var now = Number.isFinite(timestamp) ? timestamp : lastRenderTime + (1000 / 60);
    if (world && now - lastRenderTime >= (1000 / 60) - 1) {
      lastRenderTime = now;
      var renderer = window.Contagio.Renderer;
      if (renderer && typeof renderer.draw === 'function') {
        renderOptions.tracedPeople = world.tracedPeople ||
          (world.actionState && world.actionState.tracedPeople) || [];
        renderer.draw(world, renderOptions);
      }
    }
    if (initialized && typeof window.requestAnimationFrame === 'function') {
      animationFrame = window.requestAnimationFrame(Game.loop);
    }
  };

  Game.init = function () {
    if (initialized) return Game;
    var canvas = getCanvas();
    if (!canvas) throw new Error('O canvas #city não foi encontrado no index.html.');
    moduleAt('UI', 'init').init(Game);
    initialized = true;
    if (typeof window.requestAnimationFrame === 'function') {
      animationFrame = window.requestAnimationFrame(Game.loop);
    }
    return Game;
  };

  Game.start = function (levelIndex) {
    clearSimulationTimer();
    var levels = moduleAt('Levels', 'get');
    var level = levels.get(Number(levelIndex));
    if (!level) throw new RangeError('Fase inexistente: ' + levelIndex);

    currentLevelIndex = Number(levelIndex);
    currentLevel = level;
    var levelConfig = moduleAt('Levels', 'createConfig').createConfig(
      moduleAt('Config'),
      currentLevel
    );

    world = moduleAt('World', 'create').create(levelConfig);
    moduleAt('Epidemic', 'seed').seed(world, currentLevel.initialInfected);
    if (typeof window.Contagio.Levels.prepareInitialInfected === 'function') {
      window.Contagio.Levels.prepareInitialInfected(world, currentLevel);
    }

    world.levelRuntime = { overloadDays: 0, lastCheckedDay: null, result: null };
    var initialPairs = moduleAt('Pairs', 'findPairsWithinRadius').findPairsWithinRadius(
      world.people,
      Math.max(0, Number(levelConfig.CONTACT_RADIUS) || 0)
    );
    world.lastPairs = initialPairs.pairs;
    world.lastTree = initialPairs.tree;
    world.lastComparisons = initialPairs.comparisons;
    world.lastPairsResult = initialPairs;
    moduleAt('World', 'updateDistricts').updateDistricts(world, initialPairs.tree);
    moduleAt('World', 'updateStats').updateStats(world, {});

    debugState.turnsRemaining = debugState.enabled ? 20 : 0;
    debugState.divergences = 0;
    if (window.Contagio.UI) window.Contagio.UI.update(world, { status: 'playing', skipRender: true });
    if (window.Contagio.Renderer) window.Contagio.Renderer.draw(world, renderOptions);
    return world;
  };

  Game.nextTurn = function () {
    if (!world || !currentLevel) return null;
    if (world.levelRuntime && world.levelRuntime.result) return {
      status: world.levelRuntime.result,
      world: world
    };

    var config = world.config || window.Contagio.Config;
    var World = moduleAt('World');
    var Pairs = moduleAt('Pairs');
    var Epidemic = moduleAt('Epidemic');
    var Actions = moduleAt('Actions');

    // (1) Movimento.
    World.step(world);

    // (2) Pares próximos e árvore D&C.
    var pairsResult = Pairs.findPairsWithinRadius(
      world.people,
      Math.max(0, Number(config.CONTACT_RADIUS) || 0)
    );
    world.lastPairs = pairsResult.pairs;
    world.lastTree = pairsResult.tree;
    world.lastComparisons = pairsResult.comparisons;
    world.lastPairsResult = pairsResult;

    // (3) Atualização dos distritos usando a árvore deste turno.
    World.updateDistricts(world, pairsResult.tree);

    // (4) Contágio e recuperação.
    var epidemicResult = Epidemic.step(world, world.lastPairs);

    // (5) Duração, custos e efeitos das medidas.
    var actionResult = Actions.tickActions(world);

    // (6) Fechamento do dia, estatísticas e histórico.
    world.day += 1;
    World.updateStats(world, epidemicResult);
    moduleAt('Epidemic', 'recordHistory').recordHistory(world, world.day);
    world.stats.lastActionTick = actionResult;

    // (7) Verificação de vitória/derrota.
    var status = moduleAt('Levels', 'checkEnd').checkEnd(world, currentLevel);

    // (8) Atualização da interface e desenho.
    var extra = {
      status: status,
      comparisons: pairsResult.comparisons,
      pairsResult: pairsResult,
      epidemic: epidemicResult,
      actions: actionResult,
      skipRender: true
    };
    if (window.Contagio.UI) window.Contagio.UI.update(world, extra);
    if (window.Contagio.Renderer) window.Contagio.Renderer.draw(world, renderOptions);

    validatePairsThisTurn();
    if (status !== 'playing') clearSimulationTimer();
    return Object.assign({ status: status, world: world }, extra);
  };

  Game.play = function () {
    if (!world || (world.levelRuntime && world.levelRuntime.result)) return false;
    clearSimulationTimer();
    simulationTimer = window.setInterval(function () {
      Game.nextTurn();
    }, simulationInterval());
    return true;
  };

  Game.pause = function () {
    clearSimulationTimer();
    return true;
  };

  Game.togglePlay = function () {
    if (Game.isPlaying()) Game.pause();
    else Game.play();
    return Game.isPlaying();
  };

  Game.isPlaying = function () {
    return simulationTimer !== null;
  };

  Game.setSpeed = function (value) {
    var allowed = [1, 2, 4];
    var numeric = Number(value);
    speed = allowed.indexOf(numeric) >= 0 ? numeric : 1;
    if (Game.isPlaying()) Game.play();
    return speed;
  };

  Game.getWorld = function () { return world; };
  Game.getLevel = function () { return currentLevel ? Object.assign({}, currentLevel) : null; };
  Game.getLevelIndex = function () { return currentLevelIndex; };
  Game.getSpeed = function () { return speed; };

  // No console: Contagio.Game.debug(true) valida D&C x força bruta nos próximos 20 turnos.
  Game.debug = function (enabled) {
    debugState.enabled = enabled !== false;
    debugState.turnsRemaining = debugState.enabled && world ? 20 : 0;
    debugState.divergences = 0;
    console.info(debugState.enabled
      ? '[Contágio][DEBUG] Validação D&C ativada para os próximos 20 turnos.'
      : '[Contágio][DEBUG] Validação D&C desativada.');
    return Object.assign({}, debugState);
  };

  Game.destroy = function () {
    clearSimulationTimer();
    if (animationFrame !== null && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    initialized = false;
    world = null;
    currentLevel = null;
    currentLevelIndex = -1;
  };

  window.Contagio.Game = Game;

  function boot() {
    try {
      Game.init();
    } catch (error) {
      console.error('[Contágio] Falha ao inicializar o jogo:', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
}());
