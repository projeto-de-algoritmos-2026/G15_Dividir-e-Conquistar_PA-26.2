/* Configuração central do jogo Contágio. */
(function () {
  'use strict';

  window.Contagio = window.Contagio || {};

  window.Contagio.Config = Object.freeze({
    WORLD_WIDTH: 1100,
    WORLD_HEIGHT: 720,
    POPULATION: 300,
    CONTACT_RADIUS: 22,
    INFECTION_PROB: 0.18,
    RECOVERY_DAYS: 14,
    HOSPITAL_CAPACITY: 45,
    MOVE_SPEED: 1.15,

    // Parâmetros usados pelas próximas etapas da simulação.
    INITIAL_INFECTED: 4,
    DISTRICT_COLUMNS: 4,
    DISTRICT_ROWS: 3,
    PERSON_RADIUS: 3.2,
    QUARANTINE_SPEED_FACTOR: 0,
    DISTANCING_MIN_STRENGTH: 0,
    DISTANCING_MAX_STRENGTH: 1,
    DEFAULT_DISTANCING_STRENGTH: 0.5,
    VACCINE_BATCH_SIZE: 12,
    LOCKDOWN_DURATION: 5,
    TRACE_QUARANTINE_DURATION: 4,
    PLAY_INTERVAL_MS: 700,
    MIN_PLAY_INTERVAL_MS: 120,
    SPEED_LEVELS: Object.freeze([1, 2, 4]),

    // Limites de visualização e parâmetros do autoteste de pares próximos.
    PAIR_TREE_MAX_DEPTH: 6,
    PAIRS_SELF_TEST_RUNS: 5,
    PAIRS_SELF_TEST_POPULATION: 500,

    COLORS: Object.freeze({
      S: '#4ba7ff',
      I: '#ff5f70',
      R: '#39d6a0',
      V: '#a78bfa',
      BACKGROUND: '#0b1727',
      DISTRICT: 'rgba(112, 167, 225, 0.42)',
      DIVISION: 'rgba(112, 167, 225, 0.22)',
      CONTACT: 'rgba(255, 95, 112, 0.16)'
    }),

    UI: Object.freeze({
      DAY_LABEL_DIGITS: 2,
      PROGRESS_MAX: 100
    })
  });
}());
