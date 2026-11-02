/* Dinâmica epidemiológica SIR com vacinação e histórico diário. */
(function () {
  'use strict';

  window.Contagio = window.Contagio || {};

  var Epidemic = {};
  var Utils = window.Contagio.Utils;

  function getConfig() {
    var config = window.Contagio.Config;
    if (!config) {
      throw new Error('Contagio.Config deve ser carregado antes de Contagio.Epidemic.');
    }
    if (!Utils) {
      throw new Error('Contagio.Utils deve ser carregado antes de Contagio.Epidemic.');
    }
    return config;
  }

  // Conta quantas pessoas existem em cada estado epidemiológico.
  Epidemic.countByState = function (world) {
    var counts = { S: 0, I: 0, R: 0, V: 0 };

    world.people.forEach(function (person) {
      if (Object.prototype.hasOwnProperty.call(counts, person.state)) {
        counts[person.state] += 1;
      }
    });

    return counts;
  };

  // Garante que o histórico fique separado das contagens atuais.
  // Assim stats.S/stats.I/etc. continuam sendo números para a interface.
  function ensureHistory(world) {
    if (!world.stats) world.stats = {};

    if (!world.stats.history) {
      world.stats.history = {
        days: [],
        S: [],
        I: [],
        R: [],
        V: []
      };
    }

    return world.stats.history;
  }

  // Registra uma fotografia da população. Se já houver um registro
  // para o mesmo dia (por exemplo, após seed), ele é substituído.
  function recordHistory(world, dayOverride) {
    var history = ensureHistory(world);
    var counts = Epidemic.countByState(world);
    var day = Number.isFinite(dayOverride)
      ? dayOverride
      : (Number.isFinite(world.day) ? world.day : 0);
    var lastIndex = history.days.length - 1;
    var index;

    if (lastIndex >= 0 && history.days[lastIndex] === day) {
      index = lastIndex;
    } else {
      index = history.days.length;
      history.days.push(day);
    }

    history.S[index] = counts.S;
    history.I[index] = counts.I;
    history.R[index] = counts.R;
    history.V[index] = counts.V;

    world.stats.S = counts.S;
    world.stats.I = counts.I;
    world.stats.R = counts.R;
    world.stats.V = counts.V;
    world.stats.total = world.people.length;

    return counts;
  }

  /**
   * Escolhe n pessoas suscetíveis aleatórias e inicia a infecção.
   * O embaralhamento é feito em uma cópia para não reordenar world.people.
   */
  Epidemic.seed = function (world, n) {
    getConfig();

    var amount = Math.max(0, Math.min(
      world.people.length,
      Number.isFinite(n) ? Math.floor(n) : 0
    ));

    var susceptible = world.people.filter(function (person) {
      return person.state === 'S';
    });

    Utils.shuffle(susceptible);

    var infected = Math.min(amount, susceptible.length);

    for (var index = 0; index < infected; index += 1) {
      susceptible[index].state = 'I';
      susceptible[index].daysInfected = 0;
    }

    world.stats = world.stats || {};
    recordHistory(world);

    return infected;
  };

  /**
   * Retorna suscetíveis que tiveram contato com pelo menos um infectado
   * no início do turno. A lista não contém duplicatas.
   * É usada como ponto de extensão por Contagio.Actions.trace.
   */
  Epidemic.getTracedPeople = function (world, pairs) {
    var snapshot = new Map();
    var traced = new Set();

    world.people.forEach(function (person) {
      snapshot.set(person, person.state);
    });

    (pairs || []).forEach(function (pair) {
      if (!pair || pair.length < 2) return;

      var a = pair[0];
      var b = pair[1];
      var stateA = snapshot.get(a);
      var stateB = snapshot.get(b);

      if (stateA === 'I' && stateB === 'S') traced.add(b);
      if (stateB === 'I' && stateA === 'S') traced.add(a);
    });

    return Array.from(traced);
  };

  /**
   * Executa um turno epidemiológico.
   *
   * a) Só pares cujo estado no snapshot seja I-S podem transmitir.
   * b) O snapshot impede que recém-infectados transmitam no mesmo turno.
   * c) A duração da infecção avança apenas para quem já estava infectado
   *    no começo do turno; ao atingir RECOVERY_DAYS, a pessoa se recupera.
   * d) Recuperados têm imunidade total. Vacinados também têm imunidade total
   *    quando VACCINE_EFFICACY = 1. Com eficácia parcial, existe uma pequena
   *    chance de infecção de breakthrough proporcional a (1 - eficácia).
   *
   * A probabilidade diminui com a distância: p = INFECTION_PROB *
   * sqrt(1 - distância / CONTACT_RADIUS). Assim, contatos mais próximos
   * têm maior chance de transmissão. A quarentena reduz a transmissão:
   * cada integrante em quarentena multiplica a chance por QUARANTINE_LEAKAGE.
   */
  Epidemic.step = function (world, pairs) {
    var config = getConfig();
    var contactRadius = Math.max(0, config.CONTACT_RADIUS || 0);
    var infectionProbability = Utils.clamp(
      Number.isFinite(config.INFECTION_PROB) ? config.INFECTION_PROB : 0,
      0,
      1
    );
    var recoveryDays = Math.max(1, config.RECOVERY_DAYS || 1);
    var vaccineEfficacy = Utils.clamp(
      Number.isFinite(config.VACCINE_EFFICACY) ? config.VACCINE_EFFICACY : 1,
      0,
      1
    );

    var snapshot = new Map();
    var newlyInfected = new Set();
    var infectedAtStart = [];
    var recoveries = 0;

    world.people.forEach(function (person) {
      snapshot.set(person, person.state);
      if (person.state === 'I') infectedAtStart.push(person);
    });

    // Primeiro calcula todas as transmissões usando exclusivamente o snapshot.
    (pairs || []).forEach(function (pair) {
      if (!pair || pair.length < 2) return;

      var a = pair[0];
      var b = pair[1];
      var stateA = snapshot.get(a);
      var stateB = snapshot.get(b);
      var source;
      var target;
      var targetState;

      if (stateA === 'I' && (stateB === 'S' || stateB === 'V')) {
        source = a;
        target = b;
        targetState = stateB;
      } else if (stateB === 'I' && (stateA === 'S' || stateA === 'V')) {
        source = b;
        target = a;
        targetState = stateA;
      } else {
        return;
      }

      // Quarentena completa: basta uma das pessoas estar isolada
      // para impedir a transmissão deste contato.
      if (source.quarantined || target.quarantined) return;
      if (newlyInfected.has(target)) return;
      if (contactRadius <= 0) return;

      var distance = Utils.dist(source, target);
      if (distance > contactRadius) return;

      // A chance tende a zero no limite do raio e é máxima em distância zero.
      var proximityFactor = Math.sqrt(Math.max(0, 1 - (distance / contactRadius)));
      var probability = infectionProbability * proximityFactor;
      var leakage = Utils.clamp(
        Number.isFinite(config.QUARANTINE_LEAKAGE) ? config.QUARANTINE_LEAKAGE : 0.1,
        0,
        1
      );
      if (source.quarantined) probability *= leakage;
      if (target.quarantined) probability *= leakage;

      // Para vacinados, a eficácia reduz a chance de breakthrough.
      if (targetState === 'V') {
        probability *= (1 - vaccineEfficacy);
      }

      probability = Utils.clamp(probability, 0, 1);

      if (Math.random() < probability) {
        newlyInfected.add(target);
      }
    });

    // Aplica as novas infecções somente depois de avaliar todos os pares.
    newlyInfected.forEach(function (person) {
      person.state = 'I';
      person.daysInfected = 0;
    });

    // Avança o tempo de infecção apenas para infectados no início do turno.
    infectedAtStart.forEach(function (person) {
      person.daysInfected = (Number.isFinite(person.daysInfected)
        ? person.daysInfected
        : 0) + 1;

      if (person.daysInfected >= recoveryDays) {
        person.state = 'R';
        person.daysInfected = 0;
        recoveries += 1;
      }
    });

    var result = {
      newInfections: newlyInfected.size,
      recoveries: recoveries
    };

    world.stats = world.stats || {};
    world.stats.newInfections = result.newInfections;
    world.stats.recoveries = result.recoveries;
    // step representa o fechamento do próximo turno; Game incrementa world.day
    // ao concluir a sequência completa de atualização.
    recordHistory(world, (Number.isFinite(world.day) ? world.day : 0) + 1);

    return result;
  };

  window.Contagio.Epidemic = Object.freeze(Epidemic);
}());
