/* Definição das fases, condições de término e pontuação do Contágio. */
(function () {
  'use strict';

  window.Contagio = window.Contagio || {};

  var Levels = {};

  /*
   * goal é uma porcentagem (0 a 100) da população que deve estar
   * imunizada: recuperados (R) + vacinados (V).
   *
   * Campos opcionais usados para ensinar mecânicas específicas:
   * - densityRegions: manchas gaussianas passadas para Config.DENSITY_REGIONS.
   * - initialInfectedPosition: posição-alvo dos infectados iniciais. Depois de
   *   Epidemic.seed(), a função prepareInitialInfected() os posiciona perto dela.
   */

  var PHASES = [
    {
      name: 'Primeiro caso',
      description: 'Um único caso surgiu na cidade. Aprenda a observar a linha de corte e como ela divide a população em distritos.',
      population: 200,
      initialInfected: 1,
      contactRadius: 24,
      infectionProb: 0.13,
      recoveryDays: 13,
      hospitalCapacity: 34,
      budget: 105,
      budgetPerDay: 13,
      dayLimit: 65,
      districtDepth: 1,
      goal: 80,
      tips: 'Observe a linha vertical da árvore de divisão. Ela separa a cidade em dois distritos; use a visualização de distritos para entender essa divisão antes de gastar seu orçamento.'
    },
    {
      name: 'Fronteira perigosa',
      description: 'O surto começou junto à linha de corte. A fronteira entre distritos não é uma barreira contra o contágio.',
      population: 300,
      initialInfected: 5,
      contactRadius: 30,
      infectionProb: 0.19,
      recoveryDays: 14,
      hospitalCapacity: 48,
      budget: 125,
      budgetPerDay: 12,
      dayLimit: 60,
      districtDepth: 2,
      goal: 82,
      initialInfectedPosition: { x: 550, y: 360, spread: 18 },
      tips: 'Atenção à faixa central: pessoas de distritos diferentes podem estar a poucos pixels de distância. Ative a faixa de contatos para enxergar os riscos próximos à linha de corte.'
    },
    {
      name: 'Centro denso',
      description: 'Uma grande concentração de habitantes facilita a formação de muitos contatos próximos.',
      population: 500,
      initialInfected: 8,
      contactRadius: 25,
      infectionProb: 0.21,
      recoveryDays: 15,
      hospitalCapacity: 72,
      budget: 155,
      budgetPerDay: 13,
      dayLimit: 58,
      districtDepth: 2,
      goal: 84,
      densityRegions: [
        { x: 550, y: 355, radiusX: 88, radiusY: 68, weight: 0.58 }
      ],
      initialInfectedPosition: { x: 550, y: 355, spread: 42 },
      tips: 'O centro concentra mais pessoas e, portanto, mais pares de contato. A vacinação prioriza pessoas com maior grau no grafo de contatos — observe como os pares encontrados ajudam a identificar esses pontos.'
    },
    {
      name: 'Variante rápida',
      description: 'A transmissão é mais provável e a capacidade hospitalar é limitada. Cada dia importa.',
      population: 600,
      initialInfected: 12,
      contactRadius: 29,
      infectionProb: 0.31,
      recoveryDays: 12,
      hospitalCapacity: 55,
      budget: 170,
      budgetPerDay: 11,
      dayLimit: 48,
      districtDepth: 2,
      goal: 86,
      densityRegions: [
        { x: 520, y: 350, radiusX: 115, radiusY: 82, weight: 0.38 },
        { x: 820, y: 210, radiusX: 75, radiusY: 65, weight: 0.18 }
      ],
      initialInfectedPosition: { x: 520, y: 350, spread: 55 },
      tips: 'A variante transmite mais rápido e o hospital suporta menos pacientes. Compare os contatos próximos e use medidas preventivas cedo; esperar o hospital lotar pode custar a fase.'
    },
    {
      name: 'Metrópole',
      description: 'Mil habitantes, múltiplas regiões densas e orçamento apertado. Planeje cada medida.',
      population: 1000,
      initialInfected: 16,
      contactRadius: 27,
      infectionProb: 0.27,
      recoveryDays: 14,
      hospitalCapacity: 88,
      budget: 145,
      budgetPerDay: 8,
      dayLimit: 55,
      districtDepth: 2,
      goal: 88,
      densityRegions: [
        { x: 300, y: 260, radiusX: 90, radiusY: 75, weight: 0.22 },
        { x: 700, y: 390, radiusX: 115, radiusY: 90, weight: 0.30 },
        { x: 900, y: 170, radiusX: 65, radiusY: 60, weight: 0.12 }
      ],
      initialInfectedPosition: { x: 700, y: 390, spread: 65 },
      tips: 'Na metrópole, nem todas as medidas cabem no orçamento. Use as comparações do algoritmo de divisão e conquista para analisar os contatos sem precisar testar todos os pares possíveis. Priorize as regiões e pessoas mais conectadas.'
    }
  ];

  function clonePhase(phase) {
    var copy = {};
    Object.keys(phase).forEach(function (key) {
      var value = phase[key];
      if (Array.isArray(value)) {
        copy[key] = value.map(function (item) {
          return item && typeof item === 'object'
            ? Object.assign({}, item)
            : item;
        });
      } else if (value && typeof value === 'object') {
        copy[key] = Object.assign({}, value);
      } else {
        copy[key] = value;
      }
    });
    return copy;
  }

  function validIndex(index) {
    return Number.isInteger(index) && index >= 0 && index < PHASES.length;
  }

  Levels.list = function () {
    return PHASES.map(clonePhase);
  };

  Levels.get = function (index) {
    if (!validIndex(index)) return null;
    return clonePhase(PHASES[index]);
  };

  /**
   * Cria um objeto de configuração específico para a fase sem modificar
   * Contagio.Config (que é congelado no projeto).
   *
   * Exemplo:
   * var level = Contagio.Levels.get(0);
   * var levelConfig = Contagio.Levels.createConfig(Contagio.Config, level);
   * var world = Contagio.World.create(levelConfig);
   */
  Levels.createConfig = function (baseConfig, level) {
    if (!baseConfig || !level) {
      throw new Error('createConfig requer a configuração-base e uma fase.');
    }

    var result = Object.assign({}, baseConfig, {
      POPULATION: level.population,
      INITIAL_INFECTED: level.initialInfected,
      CONTACT_RADIUS: level.contactRadius,
      INFECTION_PROB: level.infectionProb,
      RECOVERY_DAYS: level.recoveryDays,
      HOSPITAL_CAPACITY: level.hospitalCapacity,
      INITIAL_BUDGET: level.budget,
      DAILY_BUDGET_INCOME: level.budgetPerDay,
      DISTRICT_DEPTH: level.districtDepth,
      DENSITY_REGIONS: Array.isArray(level.densityRegions)
        ? level.densityRegions.map(function (region) { return Object.assign({}, region); })
        : []
    });

    return result;
  };

  /**
   * Posiciona os infectados iniciais perto da região indicada pela fase.
   * Deve ser chamada logo depois de Epidemic.seed(world, level.initialInfected).
   * O pequeno espalhamento evita que todos ocupem exatamente a mesma posição.
   */
  Levels.prepareInitialInfected = function (world, level) {
    if (!world || !Array.isArray(world.people) || !level ||
        !level.initialInfectedPosition) {
      return 0;
    }

    var target = level.initialInfectedPosition;
    var infected = world.people.filter(function (person) {
      return person.state === 'I';
    });
    var spread = Math.max(0, Number(target.spread) || 0);

    infected.forEach(function (person) {
      var angle = Math.random() * Math.PI * 2;
      var radius = Math.sqrt(Math.random()) * spread;
      person.x = Math.max(0, Math.min(world.width,
        Number(target.x) + Math.cos(angle) * radius));
      person.y = Math.max(0, Math.min(world.height,
        Number(target.y) + Math.sin(angle) * radius));
    });

    return infected.length;
  };

  /**
   * checkEnd pode ser chamado mais de uma vez no mesmo dia pela UI.
   * O contador de dias acima da capacidade só avança uma vez por dia.
   */
  Levels.checkEnd = function (world, level) {
    if (!world || !Array.isArray(world.people) || !level) return 'playing';

    // Um resultado terminal é definitivo: chamadas posteriores da UI não
    // podem transformar derrota em vitória (ou vice-versa).
    if (world.levelRuntime &&
        (world.levelRuntime.result === 'won' || world.levelRuntime.result === 'lost')) {
      return world.levelRuntime.result;
    }

    var epidemic = window.Contagio.Epidemic;
    var counts = epidemic && typeof epidemic.countByState === 'function'
      ? epidemic.countByState(world)
      : world.people.reduce(function (acc, person) {
          if (Object.prototype.hasOwnProperty.call(acc, person.state)) {
            acc[person.state] += 1;
          }
          return acc;
        }, { S: 0, I: 0, R: 0, V: 0 });

    var population = world.people.length;
    var goalPercent = Math.max(0, Math.min(100, Number(level.goal) || 0));
    var immune = counts.R + counts.V;
    var immunePercent = population > 0 ? immune / population * 100 : 100;

    // Vitória tem prioridade caso uma condição de vitória e outra de derrota
    // sejam satisfeitas na mesma avaliação.
    if (counts.I === 0 || immunePercent >= goalPercent) {
      world.levelRuntime = world.levelRuntime || {};
      world.levelRuntime.result = 'won';
      return 'won';
    }

    var day = Number.isFinite(world.day) ? world.day : 0;
    var capacity = Math.max(0, Number(level.hospitalCapacity) || 0);

    if (!world.levelRuntime) {
      world.levelRuntime = {
        overloadDays: 0,
        lastCheckedDay: null,
        result: null
      };
    }

    var runtime = world.levelRuntime;

    if (runtime.result === 'won' || runtime.result === 'lost') {
      return runtime.result;
    }

    if (runtime.lastCheckedDay !== day) {
      if (counts.I > capacity) {
        if (runtime.lastCheckedDay === day - 1) {
          runtime.overloadDays += 1;
        } else {
          runtime.overloadDays = 1;
        }
      } else {
        runtime.overloadDays = 0;
      }
      runtime.lastCheckedDay = day;
    }

    if (runtime.overloadDays >= 3) {
      runtime.result = 'lost';
      return 'lost';
    }

    if (day > Number(level.dayLimit)) {
      runtime.result = 'lost';
      return 'lost';
    }

    return 'playing';
  };

  /**
   * Pontuação de 0 a 3 estrelas:
   * 1 estrela se R + I (total que já foi infectado) não superar 20% da
   * população; 1 estrela se a fase terminar em até 70% do limite de dias;
   * 1 estrela se restar pelo menos 30% do orçamento inicial.
   *
   * A pontuação é calculada em critérios independentes. Em caso de derrota,
   * retorna zero. Para o orçamento inicial, usa level.budget, que é o valor
   * configurado no início da fase.
   */
  Levels.computeScore = function (world, level) {
    if (!world || !Array.isArray(world.people) || !level) return 0;

    if (world.levelRuntime && world.levelRuntime.result === 'lost') return 0;

    var counts = window.Contagio.Epidemic &&
      typeof window.Contagio.Epidemic.countByState === 'function'
      ? window.Contagio.Epidemic.countByState(world)
      : { I: 0, R: 0 };

    var population = world.people.length;
    var totalEverInfected = counts.R + counts.I;
    var infectionRatio = population > 0 ? totalEverInfected / population : 0;
    var dayLimit = Math.max(1, Number(level.dayLimit) || 1);
    var days = Math.max(0, Number(world.day) || 0);
    var initialBudget = Math.max(0, Number(level.budget) || 0);
    var remainingBudget = Math.max(0, Number(world.budget) || 0);
    var budgetRatio = initialBudget > 0
      ? remainingBudget / initialBudget
      : 0;

    var stars = 0;

    if (infectionRatio <= 0.20) stars += 1;
    if (days <= dayLimit * 0.70) stars += 1;
    if (budgetRatio >= 0.30) stars += 1;

    return Math.max(0, Math.min(3, stars));
  };

  window.Contagio.Levels = Levels;
}());
