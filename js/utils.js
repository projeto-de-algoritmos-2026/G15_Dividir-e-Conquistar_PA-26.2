/* Funções utilitárias compartilhadas pelos módulos do jogo. */
(function () {
  'use strict';

  window.Contagio = window.Contagio || {};

  var Utils = {
    // Calcula a distância euclidiana entre duas pessoas.
    dist: function (a, b) {
      return Math.sqrt(Utils.distSq(a, b));
    },

    // Calcula a distância ao quadrado, evitando uma raiz desnecessária.
    distSq: function (a, b) {
      var dx = a.x - b.x;
      var dy = a.y - b.y;
      return (dx * dx) + (dy * dy);
    },

    // Mantém um valor dentro de um intervalo.
    clamp: function (value, min, max) {
      return Math.min(Math.max(value, min), max);
    },

    // Retorna um número aleatório dentro do intervalo informado.
    randRange: function (min, max) {
      return min + (Math.random() * (max - min));
    },

    // Retorna um inteiro aleatório, incluindo os dois limites.
    randInt: function (min, max) {
      return Math.floor(Utils.randRange(min, max + 1));
    },

    // Embaralha o próprio array usando Fisher-Yates e o retorna.
    shuffle: function (array) {
      for (var index = array.length - 1; index > 0; index -= 1) {
        var swapIndex = Utils.randInt(0, index);
        var temporary = array[index];
        array[index] = array[swapIndex];
        array[swapIndex] = temporary;
      }
      return array;
    }
  };

  window.Contagio.Utils = Object.freeze(Utils);
}());
