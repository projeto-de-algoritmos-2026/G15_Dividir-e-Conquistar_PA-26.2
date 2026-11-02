/* Pares próximos com dividir e conquistar (todos os pares a menos de r). */
(function () {
  'use strict';

  window.Contagio = window.Contagio || {};

  var Config = window.Contagio.Config;
  var Utils = window.Contagio.Utils;
  var Selection = window.Contagio.Selection;

  // Valida os argumentos antes de iniciar os algoritmos.
  function validateInput(people, radius) {
    if (!Array.isArray(people)) {
      throw new TypeError('people deve ser um array.');
    }

    if (typeof radius !== 'number' || Number.isNaN(radius)) {
      throw new TypeError('O raio r deve ser um número válido.');
    }
    if (radius < 0) {
      throw new RangeError('O raio r não pode ser negativo.');
    }

    for (var index = 0; index < people.length; index += 1) {
      var person = people[index];
      if (!person || typeof person.x !== 'number' || typeof person.y !== 'number') {
        throw new TypeError('Cada pessoa deve possuir coordenadas x e y numéricas.');
      }
    }
  }

  // Constrói um nó da árvore com os limites horizontais do intervalo.
  function createNode(xSorted, lo, hi, depth, cutX) {
    if (lo >= hi) {
      return {
        depth: depth,
        count: 0,
        cutX: cutX,
        minX: null,
        maxX: null,
        left: null,
        right: null
      };
    }

    return {
      depth: depth,
      count: hi - lo,
      cutX: cutX,
      minX: xSorted[lo].person.x,
      maxX: xSorted[hi - 1].person.x,
      left: null,
      right: null
    };
  }

  // Compara registros pela coordenada x e usa y/índice para desempatar.
  function compareByX(a, b) {
    if (a.person.x !== b.person.x) return a.person.x - b.person.x;
    if (a.person.y !== b.person.y) return a.person.y - b.person.y;
    return a.xIndex - b.xIndex;
  }

  // Compara registros pela coordenada y e usa x/índice para desempatar.
  function compareByY(a, b) {
    if (a.person.y !== b.person.y) return a.person.y - b.person.y;
    if (a.person.x !== b.person.x) return a.person.x - b.person.x;
    return a.xIndex - b.xIndex;
  }

  // Normaliza um par usando os IDs para ignorar a ordem dos elementos.
  function getPairKey(pair) {
    var firstId = String(pair[0].id);
    var secondId = String(pair[1].id);
    return firstId <= secondId
      ? firstId + '::' + secondId
      : secondId + '::' + firstId;
  }

  // Retorna pares encontrados por força bruta; usado como referência de validação.
  function bruteForcePairs(people, radius) {
    validateInput(people, radius);

    var pairs = [];
    var comparisons = 0;
    var radiusSquared = radius * radius;

    for (var firstIndex = 0; firstIndex < people.length; firstIndex += 1) {
      for (var secondIndex = firstIndex + 1; secondIndex < people.length; secondIndex += 1) {
        comparisons += 1;

        if (Utils.distSq(people[firstIndex], people[secondIndex]) < radiusSquared) {
          pairs.push([people[firstIndex], people[secondIndex]]);
        }
      }
    }

    return {
      pairs: pairs,
      comparisons: comparisons
    };
  }

  // Encontra todos os pares próximos usando pré-ordenação e dividir e conquistar.
  function findPairsWithinRadius(people, radius) {
    validateInput(people, radius);

    if (!Selection || typeof Selection.median !== 'function') {
      throw new Error('Contagio.Selection deve ser carregado antes de Contagio.Pairs.');
    }
    if (!Utils || typeof Utils.distSq !== 'function') {
      throw new Error('Contagio.Utils deve ser carregado antes de Contagio.Pairs.');
    }

    var pairs = [];
    var comparisons = 0;
    var radiusSquared = radius * radius;
    var treeMaxDepth = Config.PAIR_TREE_MAX_DEPTH;

    // Os registros preservam a identidade e a posição original de cada pessoa.
    var xSorted = people.map(function (person, originalIndex) {
      return {
        person: person,
        originalIndex: originalIndex,
        xIndex: -1
      };
    });

    // Ordenação por x realizada uma única vez.
    xSorted.sort(compareByX);
    xSorted.forEach(function (record, index) {
      record.xIndex = index;
    });

    // Ordenação por y também é feita uma única vez.
    // Nas chamadas recursivas, filtramos essa lista mantendo a ordem existente.
    // Assim, cada nível custa O(n) para dividir os pontos por lado e a recorrência
    // fica T(n) = 2T(n/2) + O(n) = O(n log n), além do custo de emitir k pares.
    // Ordenar a faixa com sort() em todos os níveis custaria O(n log² n).
    var ySorted = xSorted.slice().sort(compareByY);

    // Caso vazio: ainda devolve um nó raiz válido para a interface.
    if (people.length === 0) {
      return {
        pairs: pairs,
        comparisons: comparisons,
        tree: createNode(xSorted, 0, 0, 0, null)
      };
    }

    // Resolve um intervalo xSorted[lo..hi), recebendo seus pontos já ordenados por y.
    function solve(lo, hi, depth, currentYSorted, storeNode) {
      var count = hi - lo;
      var node = storeNode ? createNode(xSorted, lo, hi, depth, null) : null;

      // Base: até três pontos, todos os pares do intervalo são testados diretamente.
      if (count <= 3) {
        for (var first = lo; first < hi; first += 1) {
          for (var second = first + 1; second < hi; second += 1) {
            comparisons += 1;
            var firstPerson = xSorted[first].person;
            var secondPerson = xSorted[second].person;

            if (Utils.distSq(firstPerson, secondPerson) < radiusSquared) {
              pairs.push([firstPerson, secondPerson]);
            }
          }
        }

        return { node: node };
      }

      // O índice do meio define a divisão estável por posição no array xSorted.
      var mid = Math.floor((lo + hi) / 2);

      // O elemento mediano superior é o primeiro elemento da metade direita.
      // Portanto, sua coordenada x representa a linha que separa os dois intervalos.
      // Em caso de x repetido, os registros continuam separados pelo índice xIndex.
      var xRange = xSorted.slice(lo, hi);
      var medianRecord = Selection.median(xRange, function (record) {
        return record.person.x;
      });
      var cutX = medianRecord.person.x;

      if (node) {
        node.cutX = cutX;
      }

      // Divide a sequência ordenada por y sem executar uma nova ordenação.
      var leftY = [];
      var rightY = [];
      for (var yIndex = 0; yIndex < currentYSorted.length; yIndex += 1) {
        var yRecord = currentYSorted[yIndex];
        if (yRecord.xIndex < mid) {
          leftY.push(yRecord);
        } else {
          rightY.push(yRecord);
        }
      }

      // Conquista: resolve cada lado de forma independente.
      // A árvore só é guardada até o limite configurado; a recursão continua completa.
      var keepChildren = storeNode && depth < treeMaxDepth;
      var leftResult = solve(lo, mid, depth + 1, leftY, keepChildren);
      var rightResult = solve(mid, hi, depth + 1, rightY, keepChildren);

      if (node && keepChildren) {
        node.left = leftResult.node;
        node.right = rightResult.node;
      }

      // Combinação: a faixa já está ordenada por y por ter vindo de currentYSorted.
      var strip = [];
      for (var stripIndex = 0; stripIndex < currentYSorted.length; stripIndex += 1) {
        var candidate = currentYSorted[stripIndex];
        if (Math.abs(candidate.person.x - cutX) < radius) {
          strip.push(candidate);
        }
      }

      // Só pares entre lados opostos são testados aqui; os pares de mesmo lado
      // já foram examinados nas chamadas recursivas. A varredura da janela em y
      // é output-sensitive: cada lado da faixa ocupa um retângulo r por r; ao
      // subdividi-lo em quatro células de lado r/2, pontos na mesma célula
      // formam pares a distância menor que r. Assim, janelas muito povoadas
      // já correspondem a muitos pares emitidos nas recursões (custo O(n + k)).
      for (var firstStripIndex = 0; firstStripIndex < strip.length; firstStripIndex += 1) {
        var firstRecord = strip[firstStripIndex];
        var firstIsLeft = firstRecord.xIndex < mid;

        for (
          var secondStripIndex = firstStripIndex + 1;
          secondStripIndex < strip.length &&
            (strip[secondStripIndex].person.y - firstRecord.person.y) < radius;
          secondStripIndex += 1
        ) {
          var secondRecord = strip[secondStripIndex];
          var secondIsLeft = secondRecord.xIndex < mid;

          // Ignora comparações duplicadas do mesmo lado da divisão.
          if (firstIsLeft === secondIsLeft) {
            continue;
          }

          comparisons += 1;
          if (Utils.distSq(firstRecord.person, secondRecord.person) < radiusSquared) {
            pairs.push([firstRecord.person, secondRecord.person]);
          }
        }
      }

      return { node: node };
    }

    var result = solve(0, xSorted.length, 0, ySorted, true);

    return {
      pairs: pairs,
      comparisons: comparisons,
      tree: result.node
    };
  }

  // Compara os conjuntos de pares sem considerar ordem dos pares ou dos pontos.
  function comparePairSets(firstPairs, secondPairs) {
    var firstSet = new Set(firstPairs.map(getPairKey));
    var secondSet = new Set(secondPairs.map(getPairKey));
    var missing = [];
    var extra = [];

    firstSet.forEach(function (key) {
      if (!secondSet.has(key)) missing.push(key);
    });
    secondSet.forEach(function (key) {
      if (!firstSet.has(key)) extra.push(key);
    });

    return {
      equal: missing.length === 0 && extra.length === 0,
      missing: missing,
      extra: extra
    };
  }

  // Executa cenários aleatórios de 500 pessoas e compara D&C com força bruta.
  function selfTest() {
    var runCount = Config.PAIRS_SELF_TEST_RUNS;
    var pointCount = Config.PAIRS_SELF_TEST_POPULATION;
    var radius = Config.CONTACT_RADIUS;
    var summaries = [];

    for (var runIndex = 0; runIndex < runCount; runIndex += 1) {
      var people = [];

      for (var personIndex = 0; personIndex < pointCount; personIndex += 1) {
        people.push({
          id: 'test-' + runIndex + '-' + personIndex,
          x: Utils.randInt(0, Config.WORLD_WIDTH),
          y: Utils.randInt(0, Config.WORLD_HEIGHT),
          vx: 0,
          vy: 0,
          state: 'S',
          daysInfected: 0,
          quarantined: false,
          districtId: 0
        });
      }

      var divideAndConquer = findPairsWithinRadius(people, radius);
      var bruteForce = bruteForcePairs(people, radius);
      var comparison = comparePairSets(divideAndConquer.pairs, bruteForce.pairs);

      var summary = {
        test: runIndex + 1,
        points: pointCount,
        pairs: divideAndConquer.pairs.length,
        comparisonsDC: divideAndConquer.comparisons,
        comparisonsBrute: bruteForce.comparisons,
        savedComparisons: bruteForce.comparisons - divideAndConquer.comparisons
      };
      summaries.push(summary);

      if (!comparison.equal) {
        console.error('Falha no teste ' + (runIndex + 1) + ': conjuntos de pares diferentes.', {
          summary: summary,
          missingInDivideAndConquer: comparison.missing,
          extraInDivideAndConquer: comparison.extra,
          people: people
        });
        console.table(summaries);
        return false;
      }
    }

    console.table(summaries);
    console.log('OK');
    return true;
  }

  window.Contagio.Pairs = Object.freeze({
    findPairsWithinRadius: findPairsWithinRadius,
    bruteForcePairs: bruteForcePairs,
    _selfTest: selfTest
  });
}());
