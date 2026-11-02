/* Seleção determinística em tempo linear: algoritmo da mediana das medianas. */
(function () {
  'use strict';

  window.Contagio = window.Contagio || {};

  var GROUP_SIZE = 5;

  // Compara dois elementos usando a chave informada (ou o próprio valor).
  function compareValues(a, b, keyFn) {
    var keyA = keyFn(a);
    var keyB = keyFn(b);

    if (keyA < keyB) return -1;
    if (keyA > keyB) return 1;
    return 0;
  }

  // Ordena uma cópia pequena do grupo, sem alterar o array recebido.
  function getGroupMedian(group, keyFn) {
    var sortedGroup = group.slice();

    sortedGroup.sort(function (a, b) {
      return compareValues(a, b, keyFn);
    });

    return sortedGroup[Math.floor(sortedGroup.length / 2)];
  }

  // Escolhe um pivô robusto pela mediana das medianas dos grupos de cinco.
  function choosePivot(array, keyFn) {
    var medians = [];

    for (var index = 0; index < array.length; index += GROUP_SIZE) {
      var group = array.slice(index, index + GROUP_SIZE);
      medians.push(getGroupMedian(group, keyFn));
    }

    // A própria seleção encontra a mediana das medianas.
    var medianIndex = Math.floor(medians.length / 2);
    return kthSmallest(medians, medianIndex, keyFn);
  }

  // Retorna o elemento que ocupa a posição k quando ordenamos pela chave.
  function kthSmallest(arr, k, keyFn) {
    var getKey = typeof keyFn === 'function' ? keyFn : function (value) {
      return value;
    };

    if (!Array.isArray(arr)) {
      throw new TypeError('kthSmallest espera receber um array.');
    }

    if (!Number.isInteger(k) || k < 0 || k >= arr.length) {
      throw new RangeError('O índice k deve estar entre 0 e arr.length - 1.');
    }

    // A cópia garante que nenhuma partição altere o array original.
    var values = arr.slice();

    // Caso-base: um único elemento já está na posição correta.
    if (values.length === 1) {
      return values[0];
    }

    // Obtém o pivô pela mediana das medianas.
    var pivot = choosePivot(values, getKey);
    var pivotKey = getKey(pivot);
    var lower = [];
    var equal = [];
    var greater = [];

    // Particiona em três grupos para tratar duplicatas sem recursão infinita.
    for (var index = 0; index < values.length; index += 1) {
      var current = values[index];
      var currentKey = getKey(current);

      if (currentKey < pivotKey) {
        lower.push(current);
      } else if (currentKey > pivotKey) {
        greater.push(current);
      } else {
        equal.push(current);
      }
    }

    // Se k está à esquerda do pivô, continua apenas no grupo dos menores.
    if (k < lower.length) {
      return kthSmallest(lower, k, getKey);
    }

    // Se k está dentro do bloco de valores iguais, qualquer elemento do
    // bloco ocupa uma posição válida para a mesma chave.
    if (k < lower.length + equal.length) {
      return equal[0];
    }

    // Ajusta k para o índice relativo ao grupo dos maiores.
    return kthSmallest(
      greater,
      k - lower.length - equal.length,
      getKey
    );
  }

  // Retorna o elemento mediano; para tamanho par, escolhe a mediana superior.
  function median(arr, keyFn) {
    if (!Array.isArray(arr) || arr.length === 0) {
      throw new RangeError('median espera receber um array não vazio.');
    }

    return kthSmallest(arr, Math.floor(arr.length / 2), keyFn);
  }

  // Valida a seleção comparando-a com sort em mil arrays aleatórios.
  function selfTest() {
    var testCount = 1000;

    for (var testIndex = 0; testIndex < testCount; testIndex += 1) {
      var length = randomInteger(1, 80);
      var values = [];

      // Intervalo pequeno para produzir também muitos valores repetidos.
      for (var valueIndex = 0; valueIndex < length; valueIndex += 1) {
        values.push(randomInteger(-12, 12));
      }

      var original = values.slice();
      var sorted = values.slice().sort(function (a, b) {
        return a - b;
      });

      for (var k = 0; k < values.length; k += 1) {
        var selected = kthSmallest(values, k);
        if (selected !== sorted[k]) {
          console.error('Falha no teste ' + (testIndex + 1) + ', k=' + k, {
            input: original,
            expected: sorted[k],
            received: selected
          });
          return false;
        }
      }

      // Confere também seleção por chave em objetos.
      var objects = values.map(function (value, index) {
        return { value: value, originalIndex: index };
      });
      var sortedKeys = objects.map(function (item) {
        return item.value;
      }).sort(function (a, b) {
        return a - b;
      });

      for (var objectK = 0; objectK < objects.length; objectK += 1) {
        var selectedObject = kthSmallest(objects, objectK, function (item) {
          return item.value;
        });

        if (selectedObject.value !== sortedKeys[objectK]) {
          console.error('Falha com keyFn no teste ' + (testIndex + 1) + ', k=' + objectK, {
            input: objects,
            expected: sortedKeys[objectK],
            received: selectedObject.value
          });
          return false;
        }
      }

      // O algoritmo não pode modificar os arrays de entrada.
      if (values.some(function (value, index) {
        return value !== original[index];
      })) {
        console.error('O array original foi modificado no teste ' + (testIndex + 1), original);
        return false;
      }
    }

    console.log('OK');
    return true;
  }

  // Gera inteiros para os casos aleatórios do autoteste.
  function randomInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  window.Contagio.Selection = Object.freeze({
    kthSmallest: kthSmallest,
    median: median,
    _selfTest: selfTest
  });
}());
