/* Renderização do mundo no canvas: pessoas, contatos, distritos e hover. */
(function () {
  'use strict';

  window.Contagio = window.Contagio || {};

  var Renderer = {};
  var canvas = null;
  var context = null;
  var tooltip = null;
  var currentWorld = null;
  var currentOptions = {};
  var resizeObserver = null;
  var pixelRatio = 1;
  var cssWidth = 0;
  var cssHeight = 0;
  var scaleX = 1;
  var scaleY = 1;
  var hoveredPerson = null;
  var animationFrameId = null;

  var STATE_ORDER = ['S', 'I', 'R', 'V'];
  var FALLBACK_COLORS = {
    S: '#4ba7ff',
    I: '#ff5f70',
    R: '#39d6a0',
    V: '#a78bfa'
  };

  function getConfig() {
    return window.Contagio.Config || {};
  }

  function readCssColor(variable, fallback) {
    if (!canvas || !window.getComputedStyle) return fallback;
    var value = window.getComputedStyle(canvas).getPropertyValue(variable).trim();
    if (!value) {
      value = window.getComputedStyle(document.documentElement)
        .getPropertyValue(variable).trim();
    }
    return value || fallback;
  }

  function getStateColors() {
    var configColors = getConfig().COLORS || {};
    return {
      S: readCssColor('--color-s', configColors.S || FALLBACK_COLORS.S),
      I: readCssColor('--color-i', configColors.I || FALLBACK_COLORS.I),
      R: readCssColor('--color-r', configColors.R || FALLBACK_COLORS.R),
      V: readCssColor('--color-v', configColors.V || FALLBACK_COLORS.V)
    };
  }

  function getParentForTooltip() {
    return canvas ? canvas.parentElement : null;
  }

  function ensureTooltip() {
    if (tooltip || !canvas || !document.createElement) return;

    var parent = getParentForTooltip();
    if (!parent) return;

    var computedPosition = window.getComputedStyle
      ? window.getComputedStyle(parent).position
      : 'static';
    if (computedPosition === 'static') parent.style.position = 'relative';

    tooltip = document.createElement('div');
    tooltip.setAttribute('role', 'status');
    tooltip.style.position = 'absolute';
    tooltip.style.zIndex = '4';
    tooltip.style.display = 'none';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.padding = '7px 9px';
    tooltip.style.border = '1px solid rgba(135,173,220,.35)';
    tooltip.style.borderRadius = '7px';
    tooltip.style.background = 'rgba(7,16,28,.94)';
    tooltip.style.color = '#e5eefb';
    tooltip.style.font = '10px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace';
    tooltip.style.boxShadow = '0 5px 18px rgba(0,0,0,.3)';
    tooltip.style.whiteSpace = 'nowrap';
    parent.appendChild(tooltip);
  }

  function resizeCanvas() {
    if (!canvas || !context) return;

    var rect = canvas.getBoundingClientRect();
    var width = Math.max(1, rect.width || canvas.clientWidth || 1);
    var height = Math.max(1, rect.height || canvas.clientHeight || 1);
    var dpr = Math.max(1, window.devicePixelRatio || 1);

    if (width === cssWidth && height === cssHeight && dpr === pixelRatio) return;

    cssWidth = width;
    cssHeight = height;
    pixelRatio = dpr;

    var backingWidth = Math.max(1, Math.round(width * dpr));
    var backingHeight = Math.max(1, Math.round(height * dpr));

    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;

    var worldWidth = currentWorld && currentWorld.width
      ? currentWorld.width
      : getConfig().WORLD_WIDTH || 1100;
    var worldHeight = currentWorld && currentWorld.height
      ? currentWorld.height
      : getConfig().WORLD_HEIGHT || 720;

    scaleX = width / worldWidth;
    scaleY = height / worldHeight;
    context.setTransform(dpr * scaleX, 0, 0, dpr * scaleY, 0, 0);
  }

  function worldPointFromEvent(event) {
    var rect = canvas.getBoundingClientRect();
    var worldWidth = currentWorld ? currentWorld.width : getConfig().WORLD_WIDTH;
    var worldHeight = currentWorld ? currentWorld.height : getConfig().WORLD_HEIGHT;
    return {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * worldWidth,
      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * worldHeight
    };
  }

  function updateHover(event) {
    if (!currentWorld || !canvas) return;

    var point = worldPointFromEvent(event);
    var nearest = null;
    var nearestDistance = Infinity;
    var hitRadius = Math.max(7, (getConfig().PERSON_RADIUS || 3.2) * 2.5);
    var hitRadiusSquared = hitRadius * hitRadius;

    // Busca reversa prioriza visualmente a pessoa desenhada por último.
    for (var index = currentWorld.people.length - 1; index >= 0; index -= 1) {
      var person = currentWorld.people[index];
      var dx = person.x - point.x;
      var dy = person.y - point.y;
      var distanceSquared = dx * dx + dy * dy;
      if (distanceSquared <= hitRadiusSquared && distanceSquared < nearestDistance) {
        nearest = person;
        nearestDistance = distanceSquared;
      }
    }

    hoveredPerson = nearest;
    ensureTooltip();

    if (!tooltip) return;
    if (!nearest) {
      tooltip.style.display = 'none';
      return;
    }

    var stateNames = { S: 'Suscetível', I: 'Infectado', R: 'Recuperado', V: 'Vacinado' };
    var parentRect = getParentForTooltip().getBoundingClientRect();
    var localX = event.clientX - parentRect.left + 12;
    var localY = event.clientY - parentRect.top + 12;
    var parentWidth = parentRect.width;
    var parentHeight = parentRect.height;

    tooltip.textContent = 'ID: ' + nearest.id + ' · ' +
      (stateNames[nearest.state] || nearest.state) + ' · Dias infectado: ' +
      (nearest.state === 'I' ? nearest.daysInfected : '—');
    tooltip.style.display = 'block';
    tooltip.style.left = Math.max(5, Math.min(localX, parentWidth - 205)) + 'px';
    tooltip.style.top = Math.max(5, Math.min(localY, parentHeight - 42)) + 'px';
  }

  function drawPeople(world, options, colors, now) {
    var groups = { S: [], I: [], R: [], V: [] };
    var people = world.people;
    var baseRadius = getConfig().PERSON_RADIUS || 3.2;
    var traced = options.tracedPeople || options.traced || [];
    var tracedSet = traced instanceof Set ? traced : new Set(traced);

    for (var index = 0; index < people.length; index += 1) {
      var person = people[index];
      if (groups[person.state]) groups[person.state].push(person);
    }

    // Um único path por estado reduz as chamadas ao canvas.
    for (var stateIndex = 0; stateIndex < STATE_ORDER.length; stateIndex += 1) {
      var state = STATE_ORDER[stateIndex];
      var group = groups[state];
      context.beginPath();

      for (var personIndex = 0; personIndex < group.length; personIndex += 1) {
        var person = group[personIndex];
        var radius = baseRadius;
        if (state === 'I') {
          radius *= 1 + 0.17 * (0.5 + 0.5 * Math.sin(now / 190 + person.id * 0.73));
        }
        context.moveTo(person.x + radius, person.y);
        context.arc(person.x, person.y, radius, 0, Math.PI * 2);
      }

      context.fillStyle = colors[state];
      context.fill();
    }

    // Anéis de quarentena e destaque de rastreados em uma segunda passada.
    context.save();
    context.lineWidth = 1.35;
    context.setLineDash([3, 2]);
    context.strokeStyle = 'rgba(255,255,255,.9)';

    for (var quarantineIndex = 0; quarantineIndex < people.length; quarantineIndex += 1) {
      var quarantinedPerson = people[quarantineIndex];
      if (!quarantinedPerson.quarantined) continue;
      context.beginPath();
      context.arc(quarantinedPerson.x, quarantinedPerson.y, baseRadius + 2.5, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();

    if (options.highlightTraced) {
      context.save();
      context.strokeStyle = '#ffd84d';
      context.lineWidth = 2;
      context.setLineDash([]);
      for (var tracedIndex = 0; tracedIndex < people.length; tracedIndex += 1) {
        var tracedPerson = people[tracedIndex];
        if (!tracedSet.has(tracedPerson)) continue;
        context.beginPath();
        context.arc(tracedPerson.x, tracedPerson.y, baseRadius + 5, 0, Math.PI * 2);
        context.stroke();
      }
      context.restore();
    }

    if (hoveredPerson) {
      context.save();
      context.beginPath();
      context.arc(hoveredPerson.x, hoveredPerson.y, baseRadius + 4, 0, Math.PI * 2);
      context.strokeStyle = 'rgba(255,255,255,.95)';
      context.lineWidth = 1.5;
      context.stroke();
      context.restore();
    }
  }

  function drawRiskPairs(world) {
    var pairs = world.lastPairs || [];
    var radius = getConfig().CONTACT_RADIUS || 1;
    if (radius <= 0 || pairs.length === 0) return;

    // Quatro faixas de opacidade evitam um stroke por par.
    var buckets = [[], [], [], []];
    for (var index = 0; index < pairs.length; index += 1) {
      var pair = pairs[index];
      if (!pair || pair.length < 2) continue;
      var a = pair[0];
      var b = pair[1];
      var risky = (a.state === 'I' && b.state === 'S') ||
        (b.state === 'I' && a.state === 'S');
      if (!risky || a.quarantined || b.quarantined) continue;

      var dx = a.x - b.x;
      var dy = a.y - b.y;
      var distance = Math.sqrt(dx * dx + dy * dy);
      var proximity = Math.max(0, 1 - distance / radius);
      var bucket = Math.min(3, Math.floor(proximity * 4));
      buckets[bucket].push(a, b);
    }

    context.save();
    context.lineWidth = 0.8;
    for (var bucketIndex = 0; bucketIndex < buckets.length; bucketIndex += 1) {
      var points = buckets[bucketIndex];
      if (points.length === 0) continue;
      context.beginPath();
      for (var pointIndex = 0; pointIndex < points.length; pointIndex += 2) {
        context.moveTo(points[pointIndex].x, points[pointIndex].y);
        context.lineTo(points[pointIndex + 1].x, points[pointIndex + 1].y);
      }
      context.strokeStyle = 'rgba(255,95,112,' + (0.08 + bucketIndex * 0.075) + ')';
      context.stroke();
    }
    context.restore();
  }

  function drawTreeNode(node, depth, maxDepth, worldHeight) {
    if (!node) return;
    if (node.cutX !== null && node.cutX !== undefined && Number.isFinite(node.cutX)) {
      var opacity = Math.max(0.12, 0.55 - depth * 0.12);
      var lineWidth = Math.max(0.65, 2 - depth * 0.45);
      context.save();
      context.strokeStyle = 'rgba(112,167,225,' + opacity + ')';
      context.lineWidth = lineWidth;
      if (depth > 0) context.setLineDash([5, 5]);
      context.beginPath();
      context.moveTo(node.cutX, 0);
      context.lineTo(node.cutX, worldHeight);
      context.stroke();
      context.restore();
    }

    if (depth + 1 < maxDepth) {
      drawTreeNode(node.left, depth + 1, maxDepth, worldHeight);
      drawTreeNode(node.right, depth + 1, maxDepth, worldHeight);
    }
  }

  function drawDistrictLabels(world, tree) {
    if (!tree || tree.cutX === null || tree.cutX === undefined) return;
    var leftCount = 0;
    var rightCount = 0;
    var districts = world.districts || [];

    for (var index = 0; index < districts.length; index += 1) {
      var district = districts[index];
      // IDs 0 e 2/4/6... pertencem ao lado esquerdo da raiz;
      // IDs 1 e 3/5/7... pertencem ao lado direito.
      if (district.id < 2) leftCount += district.count;
      else rightCount += district.count;
    }

    context.save();
    context.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    context.textBaseline = 'top';
    context.fillStyle = 'rgba(205,224,247,.72)';
    context.fillText('DISTRITO A · ' + leftCount, 14, 13);
    context.fillText('DISTRITO B · ' + rightCount, tree.cutX + 12, 13);
    context.restore();
  }

  function drawDistricts(world, options) {
    var tree = world.lastTree;
    if (!tree) return;
    var config = getConfig();
    var maxDepth = Number.isInteger(config.DISTRICT_DEPTH)
      ? Math.max(1, config.DISTRICT_DEPTH)
      : (config.PAIR_TREE_MAX_DEPTH || 1);

    if (options.showStrip && Number.isFinite(tree.cutX)) {
      var radius = config.CONTACT_RADIUS || 0;
      context.save();
      context.fillStyle = 'rgba(255,205,92,.075)';
      context.fillRect(tree.cutX - radius, 0, radius * 2, world.height);
      context.strokeStyle = 'rgba(255,205,92,.2)';
      context.lineWidth = 1;
      context.setLineDash([4, 5]);
      context.beginPath();
      context.moveTo(tree.cutX - radius, 0);
      context.lineTo(tree.cutX - radius, world.height);
      context.moveTo(tree.cutX + radius, 0);
      context.lineTo(tree.cutX + radius, world.height);
      context.stroke();
      context.restore();
    }

    if (options.showDistricts) {
      drawTreeNode(tree, 0, maxDepth, world.height);
      drawDistrictLabels(world, tree);
    }

    // Reconstrói as faixas X por caminho na árvore. O esquema de IDs
    // é o mesmo usado por World.updateDistricts (filho esquerdo: id*2;
    // filho direito: id*2+1).
    var regions = [];
    function collectRegions(node, depth, id, minX, maxX) {
      if (!node) return;
      if (depth >= maxDepth || !node.left || !node.right ||
          node.cutX === null || node.cutX === undefined) {
        regions.push({ id: id, minX: minX, maxX: maxX });
        return;
      }
      collectRegions(node.left, depth + 1, id * 2, minX, node.cutX);
      collectRegions(node.right, depth + 1, id * 2 + 1, node.cutX, maxX);
    }
    collectRegions(tree, 0, 0, 0, world.width);

    var lockedIds = new Set();
    for (var districtIndex = 0; districtIndex < (world.districts || []).length; districtIndex += 1) {
      if (world.districts[districtIndex].locked) lockedIds.add(world.districts[districtIndex].id);
    }

    if (lockedIds.size > 0) {
      context.save();
      for (var regionIndex = 0; regionIndex < regions.length; regionIndex += 1) {
        var region = regions[regionIndex];
        if (!lockedIds.has(region.id)) continue;
        var x1 = Math.max(0, Math.min(world.width, region.minX));
        var x2 = Math.max(0, Math.min(world.width, region.maxX));
        var regionWidth = Math.max(0, x2 - x1);
        if (regionWidth <= 0) continue;

        context.fillStyle = 'rgba(3,8,16,.38)';
        context.fillRect(x1, 0, regionWidth, world.height);
        context.save();
        context.beginPath();
        context.rect(x1, 0, regionWidth, world.height);
        context.clip();
        context.strokeStyle = 'rgba(244,184,91,.18)';
        context.lineWidth = 1;
        for (var hatchX = x1 - world.height; hatchX < x2 + world.height; hatchX += 18) {
          context.beginPath();
          context.moveTo(hatchX, world.height);
          context.lineTo(hatchX + world.height, 0);
          context.stroke();
        }
        context.restore();

        context.font = '16px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = 'rgba(255,220,160,.9)';
        context.fillText('🔒', (x1 + x2) / 2, 42);
      }
      context.restore();
    }
  }

  function drawBackground(world) {
    var config = getConfig();
    var background = config.COLORS && config.COLORS.BACKGROUND
      ? config.COLORS.BACKGROUND
      : '#0b1727';
    context.fillStyle = background;
    context.fillRect(0, 0, world.width, world.height);
  }

  function attachEvents() {
    if (!canvas) return;
    canvas.addEventListener('pointermove', updateHover);
    canvas.addEventListener('pointerleave', function () {
      hoveredPerson = null;
      if (tooltip) tooltip.style.display = 'none';
    });
  }

  Renderer.init = function (targetCanvas) {
    if (!targetCanvas || typeof targetCanvas.getContext !== 'function') {
      throw new TypeError('Contagio.Renderer.init espera um elemento canvas válido.');
    }

    if (canvas && canvas !== targetCanvas) {
      canvas.removeEventListener('pointermove', updateHover);
    }

    canvas = targetCanvas;
    context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível obter o contexto 2D do canvas.');

    tooltip = null;
    hoveredPerson = null;
    ensureTooltip();
    attachEvents();

    if (resizeObserver) resizeObserver.disconnect();
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(resizeCanvas);
      resizeObserver.observe(canvas);
    } else {
      window.addEventListener('resize', resizeCanvas);
    }

    resizeCanvas();
    return Renderer;
  };

  Renderer.draw = function (world, options) {
    if (!canvas || !context) {
      throw new Error('Execute Contagio.Renderer.init(canvas) antes de draw().');
    }
    if (!world || !Array.isArray(world.people)) {
      throw new TypeError('draw(world) espera um mundo com people[].');
    }

    currentWorld = world;
    currentOptions = options || {};
    resizeCanvas();

    context.setTransform(pixelRatio * scaleX, 0, 0, pixelRatio * scaleY, 0, 0);
    context.clearRect(0, 0, world.width, world.height);
    drawBackground(world);

    drawDistricts(world, currentOptions);
    if (currentOptions.showPairs) drawRiskPairs(world);

    var colors = getStateColors();
    drawPeople(world, currentOptions, colors, Date.now());

    // Mantém a pulsação suave mesmo quando o jogo avança por turnos discretos.
    // Só existe um RAF ativo e ele para automaticamente quando não há infectados.
    var hasInfected = false;
    for (var infectedIndex = 0; infectedIndex < world.people.length; infectedIndex += 1) {
      if (world.people[infectedIndex].state === 'I') {
        hasInfected = true;
        break;
      }
    }
    if (hasInfected && animationFrameId === null && typeof window.requestAnimationFrame === 'function') {
      animationFrameId = window.requestAnimationFrame(function animateInfected() {
        animationFrameId = null;
        if (currentWorld) Renderer.draw(currentWorld, currentOptions);
      });
    } else if (!hasInfected && animationFrameId !== null && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    return Renderer;
  };

  window.Contagio.Renderer = Renderer;
}());
