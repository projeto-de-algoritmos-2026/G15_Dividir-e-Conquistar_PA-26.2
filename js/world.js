/* Criação, movimentação e organização espacial do mundo. */
(function () {
  'use strict';

  window.Contagio = window.Contagio || {};

  var World = {};
  var Utils = window.Contagio.Utils;

  function getConfig(config) {
    var resolved = config || window.Contagio.Config;
    if (!resolved) {
      throw new Error('Contagio.Config deve ser carregado antes de Contagio.World.');
    }
    if (!Utils) {
      throw new Error('Contagio.Utils deve ser carregado antes de Contagio.World.');
    }
    return resolved;
  }

  // Gera um valor normal padrão usando Box-Muller.
  function gaussianRandom() {
    var u = 0;
    var v = 0;

    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();

    return Math.sqrt(-2 * Math.log(u)) *
      Math.cos(2 * Math.PI * v);
  }

  // Cria uma pessoa inicialmente suscetível e com velocidade aleatória.
  function createPerson(id, config, region) {
    var x;
    var y;

    if (region) {
      x = region.x + gaussianRandom() * region.radiusX;
      y = region.y + gaussianRandom() * region.radiusY;
    } else {
      x = Utils.randRange(0, config.WORLD_WIDTH);
      y = Utils.randRange(0, config.WORLD_HEIGHT);
    }

    x = Utils.clamp(x, 0, config.WORLD_WIDTH);
    y = Utils.clamp(y, 0, config.WORLD_HEIGHT);

    var angle = Utils.randRange(0, Math.PI * 2);
    var speed = Utils.randRange(0, config.MOVE_SPEED);

    return {
      id: id,
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      state: 'S',
      daysInfected: 0,
      quarantined: false,
      districtId: 0
    };
  }

  // Escolhe uma mancha de acordo com os pesos configurados.
  // A soma dos pesos é limitada a 1; a fração restante é uniforme.
  function chooseDensityRegion(regions) {
    var valid = regions.filter(function (region) {
      return region &&
        Number.isFinite(region.x) &&
        Number.isFinite(region.y) &&
        Number.isFinite(region.radiusX) &&
        Number.isFinite(region.radiusY) &&
        region.radiusX > 0 &&
        region.radiusY > 0 &&
        Number.isFinite(region.weight) &&
        region.weight > 0;
    });

    var totalWeight = valid.reduce(function (sum, region) {
      return sum + region.weight;
    }, 0);

    if (valid.length === 0 || totalWeight <= 0) return null;

    // Se a soma passar de 1, normaliza os pesos entre as regiões.
    // Caso contrário, a parcela restante da população fica uniforme.
    var selection = Math.random() * Math.max(1, totalWeight);
    var cumulative = 0;

    for (var index = 0; index < valid.length; index += 1) {
      cumulative += valid[index].weight;
      if (selection < cumulative) return valid[index];
    }

    return null;
  }

  function countStates(people) {
    var counts = { S: 0, I: 0, R: 0, V: 0 };

    people.forEach(function (person) {
      if (Object.prototype.hasOwnProperty.call(counts, person.state)) {
        counts[person.state] += 1;
      }
    });

    return counts;
  }

  /**
   * Cria o mundo e a população inicial.
   *
   * DENSITY_REGIONS é opcional. Cada região possui:
   * { x, y, radiusX, radiusY, weight }.
   * weight indica a fração aproximada da população naquela mancha.
   */
  World.create = function (config) {
    config = getConfig(config);

    var population = config.POPULATION;
    var regions = Array.isArray(config.DENSITY_REGIONS)
      ? config.DENSITY_REGIONS
      : [];

    var world = {
      width: config.WORLD_WIDTH,
      height: config.WORLD_HEIGHT,
      people: [],
      day: 0,
      districts: [],
      stats: {
        S: 0,
        I: 0,
        R: 0,
        V: 0,
        total: population,
        newInfections: 0,
        recoveries: 0
      },
      lastPairs: [],
      lastTree: null
    };

    for (var index = 0; index < population; index += 1) {
      var region = chooseDensityRegion(regions);
      world.people.push(createPerson(index, config, region));
    }

    var counts = countStates(world.people);
    world.stats.S = counts.S;
    world.stats.I = counts.I;
    world.stats.R = counts.R;
    world.stats.V = counts.V;

    return world;
  };

  /**
   * Move todas as pessoas por um turno.
   * A direção varia suavemente; não há teletransporte.
   * Pessoas em quarentena ficam completamente imóveis.
   */
  World.step = function (world) {
    var config = getConfig();
    var maxSpeed = config.MOVE_SPEED;
    var maxTurn = 0.22;
    var speedVariation = 0.08;

    world.people.forEach(function (person) {
      if (person.quarantined) {
        person.vx = 0;
        person.vy = 0;
        return;
      }

      // Pequena rotação da velocidade atual.
      var angleChange = Utils.randRange(-maxTurn, maxTurn);
      var cos = Math.cos(angleChange);
      var sin = Math.sin(angleChange);
      var nextVx = person.vx * cos - person.vy * sin;
      var nextVy = person.vx * sin + person.vy * cos;

      // Pequena variação de módulo para simular caminhada.
      var variation = 1 + Utils.randRange(-speedVariation, speedVariation);
      nextVx *= variation;
      nextVy *= variation;

      var speed = Math.sqrt(nextVx * nextVx + nextVy * nextVy);

      // Evita que uma pessoa fique parada permanentemente.
      if (speed < 0.05 && maxSpeed > 0) {
        var randomAngle = Utils.randRange(0, Math.PI * 2);
        nextVx = Math.cos(randomAngle) * maxSpeed * 0.25;
        nextVy = Math.sin(randomAngle) * maxSpeed * 0.25;
        speed = Math.sqrt(nextVx * nextVx + nextVy * nextVy);
      }

      if (speed > maxSpeed && speed > 0) {
        var factor = maxSpeed / speed;
        nextVx *= factor;
        nextVy *= factor;
      }

      person.vx = nextVx;
      person.vy = nextVy;
      person.x += person.vx;
      person.y += person.vy;

      // Reflexão horizontal nas bordas.
      if (person.x < 0) {
        person.x = -person.x;
        person.vx = Math.abs(person.vx);
      } else if (person.x > world.width) {
        person.x = 2 * world.width - person.x;
        person.vx = -Math.abs(person.vx);
      }

      // Reflexão vertical nas bordas.
      if (person.y < 0) {
        person.y = -person.y;
        person.vy = Math.abs(person.vy);
      } else if (person.y > world.height) {
        person.y = 2 * world.height - person.y;
        person.vy = -Math.abs(person.vy);
      }

      // Proteção adicional para velocidades fora do esperado.
      person.x = Utils.clamp(person.x, 0, world.width);
      person.y = Utils.clamp(person.y, 0, world.height);
    });

    return world;
  };

  /**
   * Atribui districtId percorrendo os cortes reais da árvore de Pairs.
   *
   * DISTRICT_DEPTH = 1: primeiro corte, até 2 distritos.
   * DISTRICT_DEPTH = 2: primeiro e segundo níveis, até 4 distritos.
   *
   * A árvore atual de Pairs armazena cutX como coordenada x da mediana
   * superior. O percurso usa x <= cutX para o filho esquerdo e x > cutX
   * para o filho direito.
   */
  World.updateDistricts = function (world, tree) {
    var config = getConfig();
    var maxDepth = Number.isInteger(config.DISTRICT_DEPTH)
      ? Math.max(1, config.DISTRICT_DEPTH)
      : 1;

    var previousDistricts = world.districts || [];
    var previousById = {};

    previousDistricts.forEach(function (district) {
      previousById[district.id] = district;
    });

    var districtMap = {};

    function ensureDistrict(id) {
      if (!districtMap[id]) {
        var previous = previousById[id];

        districtMap[id] = {
          id: id,
          minX: Infinity,
          maxX: -Infinity,
          count: 0,
          infected: 0,
          locked: previous ? Boolean(previous.locked) : false
        };
      }

      return districtMap[id];
    }

    function findDistrictId(person, node, depth, id) {
      if (!node || depth >= maxDepth ||
          node.cutX === null || node.cutX === undefined ||
          !node.left || !node.right) {
        return id;
      }

      if (person.x <= node.cutX) {
        return findDistrictId(person, node.left, depth + 1, id * 2);
      }

      return findDistrictId(person, node.right, depth + 1, id * 2 + 1);
    }

    // Sem árvore disponível, todas as pessoas permanecem no distrito 0.
    world.people.forEach(function (person) {
      var districtId = findDistrictId(person, tree, 0, 0);
      person.districtId = districtId;

      var district = ensureDistrict(districtId);
      district.count += 1;
      district.minX = Math.min(district.minX, person.x);
      district.maxX = Math.max(district.maxX, person.x);

      if (person.state === 'I') {
        district.infected += 1;
      }
    });

    world.districts = Object.keys(districtMap)
      .map(function (id) {
        var district = districtMap[id];

        if (district.count === 0) {
          district.minX = 0;
          district.maxX = 0;
        }

        return district;
      })
      .sort(function (a, b) {
        return a.id - b.id;
      });

    return world.districts;
  };

  /**
   * Atualiza o resumo de estados sem depender da implementação futura
   * de Contagio.Epidemic. O módulo Epidemic poderá atualizar os mesmos
   * campos ao final de cada turno.
   */
  World.updateStats = function (world, epidemicResult) {
    var counts = countStates(world.people);
    epidemicResult = epidemicResult || {};

    world.stats = {
      S: counts.S,
      I: counts.I,
      R: counts.R,
      V: counts.V,
      total: world.people.length,
      newInfections: epidemicResult.newInfections || 0,
      recoveries: epidemicResult.recoveries || 0
    };

    return world.stats;
  };

  /*
   * ORDEM DE EXECUÇÃO DE UM TURNO COMPLETO (responsabilidade de Game):
   * (1) Contagio.World.step(world) — movimentar as pessoas.
   * (2) Contagio.Pairs.findPairsWithinRadius(world.people, CONTACT_RADIUS).
   * (3) Contagio.Epidemic.step(world, result.pairs) — contágio e recuperação.
   * (4) Contagio.World.updateDistricts(world, result.tree) e updateStats(...).
   *
   * Este módulo implementa a criação, a movimentação e a atualização
   * espacial; não executa Pairs nem Epidemic automaticamente.
   */

  window.Contagio.World = Object.freeze(World);
}());
