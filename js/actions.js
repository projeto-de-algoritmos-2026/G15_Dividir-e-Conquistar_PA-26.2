/* Medidas estratégicas do jogador e gerenciamento de orçamento. */
(function () {
  'use strict';

  window.Contagio = window.Contagio || {};

  var Actions = {};
  var Utils = window.Contagio.Utils;

  function config() {
    var value = window.Contagio.Config;
    if (!value) throw new Error('Contagio.Config deve ser carregado antes de Contagio.Actions.');
    if (!Utils) throw new Error('Contagio.Utils deve ser carregado antes de Contagio.Actions.');
    return value;
  }

  function ensureState(world) {
    if (!world.actionState) {
      world.actionState = {
        lockdowns: {},
        distancing: { active: false, strength: 0, daysRemaining: 0 },
        tracedPeople: [],
        tracedQuarantine: {}
      };
    }
    var state = world.actionState;
    state.lockdowns = state.lockdowns || {};
    state.tracedPeople = state.tracedPeople || [];
    state.tracedQuarantine = state.tracedQuarantine || {};
    state.distancing = state.distancing || { active: false, strength: 0, daysRemaining: 0 };
    if (!Number.isFinite(world.budget)) {
      world.budget = Number.isFinite(config().INITIAL_BUDGET) ? config().INITIAL_BUDGET : 100;
    }
    return state;
  }

  function result(ok, cost, message) {
    return { ok: Boolean(ok), cost: Number(cost) || 0, message: message };
  }

  function charge(world, cost) {
    cost = Math.max(0, Number(cost) || 0);
    if (world.budget + 1e-9 < cost) return false;
    world.budget = Math.max(0, world.budget - cost);
    return true;
  }

  function isDistrictLocked(world, districtId) {
    return Boolean((world.actionState.lockdowns || {})[String(districtId)]);
  }

  function isPersonInLockedDistrict(world, person) {
    return isDistrictLocked(world, person.districtId);
  }

  function refreshPersonQuarantine(world, person) {
    var state = ensureState(world);
    var traceRemaining = state.tracedQuarantine[String(person.id)] || 0;
    person.quarantined = isPersonInLockedDistrict(world, person) || traceRemaining > 0;
  }

  /**
   * Bloqueia um distrito durante LOCKDOWN_DAYS. O custo escala com a
   * população da área. A transmissão na fronteira não é zerada: Epidemic
   * aplica QUARANTINE_LEAKAGE aos contatos que envolvem pessoas isoladas.
   */
  Actions.lockdownDistrict = function (world, districtId) {
    var cfg = config();
    var state = ensureState(world);
    var district = (world.districts || []).find(function (item) {
      return String(item.id) === String(districtId);
    });

    if (!district) return result(false, 0, 'Distrito não encontrado.');
    if (district.locked || isDistrictLocked(world, districtId)) {
      return result(false, 0, 'Este distrito já está em lockdown.');
    }

    var people = world.people.filter(function (person) {
      return String(person.districtId) === String(districtId);
    });
    if (people.length === 0) return result(false, 0, 'O distrito não possui habitantes.');

    var cost = people.length * (Number(cfg.LOCKDOWN_COST_PER_PERSON) || 0);
    if (!charge(world, cost)) return result(false, cost, 'Orçamento insuficiente para o lockdown.');

    var duration = Math.max(1, Math.floor(cfg.LOCKDOWN_DAYS || cfg.LOCKDOWN_DURATION || 1));
    state.lockdowns[String(districtId)] = { daysRemaining: duration };
    district.locked = true;
    district.lockdownDaysRemaining = duration;

    people.forEach(function (person) {
      person.quarantined = true;
      person.vx = 0;
      person.vy = 0;
    });

    return result(true, cost, 'Lockdown ativado no distrito ' + districtId + ' por ' + duration + ' dias.');
  };

  /**
   * strength = 0 desliga o distanciamento; valores positivos ligam ou
   * atualizam sua intensidade. O custo é cobrado diariamente por tickActions.
   */
  Actions.distancing = function (world, strength) {
    var cfg = config();
    var state = ensureState(world);
    var min = Number.isFinite(cfg.DISTANCING_MIN_STRENGTH) ? cfg.DISTANCING_MIN_STRENGTH : 0;
    var max = Number.isFinite(cfg.DISTANCING_MAX_STRENGTH) ? cfg.DISTANCING_MAX_STRENGTH : 1;
    var value = Number(strength);

    if (!Number.isFinite(value)) return result(false, 0, 'Informe uma intensidade válida.');
    if (value <= 0) {
      state.distancing.active = false;
      state.distancing.strength = 0;
      state.distancing.daysRemaining = 0;
      return result(true, 0, 'Distanciamento desativado.');
    }

    value = Utils.clamp(value, Math.max(0, min), Math.max(min, max));
    var dailyCost = Math.max(0, Number(cfg.DISTANCING_DAILY_COST) || 0);
    if (world.budget < dailyCost) return result(false, dailyCost, 'Orçamento insuficiente para ativar o distanciamento.');

    state.distancing.active = true;
    state.distancing.strength = value;
    state.distancing.daysRemaining = Math.max(1, Math.floor(cfg.DISTANCING_DAYS || 1));
    return result(true, 0, 'Distanciamento ativado com intensidade ' + value.toFixed(2) + '. Custo diário: ' + dailyCost + '.');
  };

  /**
   * Vacina suscetíveis por grau no grafo de contatos. O algoritmo Pairs
   * evita comparar indiscriminadamente todos os pares: world.lastPairs já
   * contém somente contatos próximos, permitindo estimar o grau de cada
   * pessoa em O(k), onde k é o número de pares encontrados.
   */
  Actions.vaccinate = function (world, n) {
    var cfg = config();
    ensureState(world);
    var requested = Math.max(0, Math.floor(Number(n) || 0));
    if (requested === 0) return result(false, 0, 'Informe uma quantidade positiva de vacinas.');

    var susceptible = world.people.filter(function (person) { return person.state === 'S'; });
    var amount = Math.min(requested, susceptible.length);
    if (amount === 0) return result(false, 0, 'Não há pessoas suscetíveis para vacinar.');

    var degree = new Map();
    (world.lastPairs || []).forEach(function (pair) {
      if (!pair || pair.length < 2) return;
      degree.set(pair[0], (degree.get(pair[0]) || 0) + 1);
      degree.set(pair[1], (degree.get(pair[1]) || 0) + 1);
    });

    susceptible.sort(function (a, b) {
      return (degree.get(b) || 0) - (degree.get(a) || 0) || a.id - b.id;
    });

    var cost = amount * (Number(cfg.VACCINE_COST_PER_PERSON) || 0);
    if (!charge(world, cost)) return result(false, cost, 'Orçamento insuficiente para vacinar ' + amount + ' pessoas.');

    for (var index = 0; index < amount; index += 1) {
      susceptible[index].state = 'V';
      susceptible[index].daysInfected = 0;
    }

    if (window.Contagio.Epidemic && typeof window.Contagio.Epidemic.countByState === 'function') {
      var counts = window.Contagio.Epidemic.countByState(world);
      world.stats = world.stats || {};
      world.stats.S = counts.S;
      world.stats.I = counts.I;
      world.stats.R = counts.R;
      world.stats.V = counts.V;
      world.stats.total = world.people.length;
    }

    return result(true, cost, amount + ' pessoa(s) vacinada(s), priorizando os maiores graus de contato.');
  };

  /** Marca para a UI os suscetíveis que tiveram contato com infectados. */
  Actions.trace = function (world) {
    var cfg = config();
    var state = ensureState(world);
    var epidemic = window.Contagio.Epidemic;
    if (!epidemic || typeof epidemic.getTracedPeople !== 'function') {
      return result(false, 0, 'Contagio.Epidemic.getTracedPeople não está disponível.');
    }

    var traced = epidemic.getTracedPeople(world, world.lastPairs || []);
    var cost = Math.max(0, Number(cfg.TRACE_COST) || 0);
    if (!charge(world, cost)) return result(false, cost, 'Orçamento insuficiente para rastrear contatos.');

    state.tracedPeople = traced;
    world.tracedPeople = traced;
    return result(true, cost, traced.length + ' contato(s) de risco identificado(s).');
  };

  /**
   * Segundo clique após trace(): coloca em quarentena os contatos rastreados.
   * A lista permanece disponível para o renderer/UI destacar os contatos.
   */
  Actions.quarantineTraced = function (world) {
    var cfg = config();
    var state = ensureState(world);
    var traced = state.tracedPeople || [];
    var candidates = traced.filter(function (person) {
      return person && person.state === 'S' && !person.quarantined;
    });
    if (candidates.length === 0) return result(false, 0, 'Não há contatos rastreados disponíveis para isolar.');

    var cost = candidates.length * (Number(cfg.TRACE_QUARANTINE_COST_PER_PERSON) || 0);
    if (!charge(world, cost)) return result(false, cost, 'Orçamento insuficiente para isolar os contatos rastreados.');

    var duration = Math.max(1, Math.floor(cfg.TRACE_QUARANTINE_DURATION || 1));
    candidates.forEach(function (person) {
      state.tracedQuarantine[String(person.id)] = duration;
      person.quarantined = true;
      person.vx = 0;
      person.vy = 0;
    });

    return result(true, cost, candidates.length + ' contato(s) colocado(s) em quarentena por ' + duration + ' dias.');
  };

  /**
   * Avança as medidas em um dia: renda diária, prazos de lockdown e
   * quarentenas individuais, cobrança do distanciamento e repulsão.
   * Deve ser chamado uma vez por dia, ao fechar o turno.
   */
  Actions.tickActions = function (world) {
    var cfg = config();
    var state = ensureState(world);
    var releasedLockdowns = 0;
    var releasedTraces = 0;
    var dailyIncome = Math.max(0, Number(cfg.DAILY_BUDGET_INCOME) || 0);
    world.budget += dailyIncome;

    Object.keys(state.lockdowns).forEach(function (districtId) {
      var lockdown = state.lockdowns[districtId];
      lockdown.daysRemaining -= 1;
      var district = (world.districts || []).find(function (item) { return String(item.id) === districtId; });
      if (district) district.lockdownDaysRemaining = Math.max(0, lockdown.daysRemaining);
      if (lockdown.daysRemaining <= 0) {
        delete state.lockdowns[districtId];
        if (district) {
          district.locked = false;
          delete district.lockdownDaysRemaining;
        }
        releasedLockdowns += 1;
      }
    });

    Object.keys(state.tracedQuarantine).forEach(function (personId) {
      state.tracedQuarantine[personId] -= 1;
      if (state.tracedQuarantine[personId] <= 0) {
        delete state.tracedQuarantine[personId];
        releasedTraces += 1;
      }
    });

    world.people.forEach(function (person) { refreshPersonQuarantine(world, person); });

    var distancing = state.distancing;
    var distancingCost = 0;
    if (distancing.active) {
      distancingCost = Math.max(0, Number(cfg.DISTANCING_DAILY_COST) || 0);
      if (!charge(world, distancingCost)) {
        distancing.active = false;
        distancing.strength = 0;
        distancing.daysRemaining = 0;
      } else {
        applyRepulsion(world, distancing.strength, cfg);
        distancing.daysRemaining -= 1;
        if (distancing.daysRemaining <= 0) {
          distancing.active = false;
          distancing.strength = 0;
        }
      }
    }

    return {
      dailyIncome: dailyIncome,
      distancingCost: distancingCost,
      releasedLockdowns: releasedLockdowns,
      releasedTraces: releasedTraces,
      budget: world.budget
    };
  };

  // Usa somente world.lastPairs: nenhuma busca espacial adicional é executada.
  function applyRepulsion(world, strength, cfg) {
    var maxSpeed = Math.max(0.01, Number(cfg.MOVE_SPEED) || 1);
    var force = Math.max(0, Number(cfg.DISTANCING_REPULSION) || 0.12) * strength;
    (world.lastPairs || []).forEach(function (pair) {
      if (!pair || pair.length < 2) return;
      var a = pair[0];
      var b = pair[1];
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var distanceSq = dx * dx + dy * dy;
      if (distanceSq < 1e-8) {
        // Direção determinística para evitar divisão por zero em posições iguais.
        dx = (Number(a.id) <= Number(b.id)) ? 1 : -1;
        dy = 0;
        distanceSq = 1;
      }
      var distance = Math.sqrt(distanceSq);
      var nx = dx / distance;
      var ny = dy / distance;
      var magnitude = force * Math.max(0.15, 1 - distance / Math.max(1, cfg.CONTACT_RADIUS));
      if (!a.quarantined) {
        a.vx -= nx * magnitude;
        a.vy -= ny * magnitude;
      }
      if (!b.quarantined) {
        b.vx += nx * magnitude;
        b.vy += ny * magnitude;
      }
    });

    world.people.forEach(function (person) {
      if (person.quarantined) {
        person.vx = 0;
        person.vy = 0;
        return;
      }
      var speed = Math.sqrt(person.vx * person.vx + person.vy * person.vy);
      if (speed > maxSpeed) {
        person.vx = person.vx / speed * maxSpeed;
        person.vy = person.vy / speed * maxSpeed;
      }
    });
  }

  Actions.getTracedPeople = function (world) {
    return ensureState(world).tracedPeople.slice();
  };

  window.Contagio.Actions = Object.freeze(Actions);
}());
