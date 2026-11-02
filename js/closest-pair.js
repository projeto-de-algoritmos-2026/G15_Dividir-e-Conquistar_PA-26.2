(function (global) {
  'use strict';

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function compareX(a, b) {
    return a.x - b.x || a.y - b.y || String(a.id).localeCompare(String(b.id));
  }

  function compareY(a, b) {
    return a.y - b.y || a.x - b.x || String(a.id).localeCompare(String(b.id));
  }

  function pairIds(pair) {
    return pair ? [pair.a.id, pair.b.id] : [];
  }

  function better(candidate, current) {
    return candidate && (!current || candidate.distance < current.distance);
  }

  function closestPair(points) {
    if (!Array.isArray(points) || points.length < 2) {
      throw new RangeError('O algoritmo precisa de pelo menos dois pontos.');
    }

    var normalized = points.map(function (point, index) {
      var x = Number(point.x);
      var y = Number(point.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new TypeError('As coordenadas dos pontos precisam ser números finitos.');
      }
      return { id: point.id == null ? index : point.id, x: x, y: y };
    });

    var ids = new Set(normalized.map(function (point) { return String(point.id); }));
    if (ids.size !== normalized.length) {
      throw new Error('Cada ponto precisa ter um identificador único.');
    }

    var events = [];
    var nodes = [];
    var comparisons = 0;
    var nodeSequence = 0;

    function emit(type, node, data) {
      events.push(Object.assign({
        type: type,
        nodeId: node ? node.id : null,
        nodePath: node ? node.path : '',
        depth: node ? node.depth : 0,
        pointIds: node ? node.points.map(function (p) { return p.id; }) : [],
        comparisons: comparisons
      }, data || {}));
    }

    var sortedX = normalized.slice().sort(compareX);
    var sortedY = normalized.slice().sort(compareY);

    function recurse(xSorted, ySorted, path, depth) {
      var node = {
        id: 'N' + (++nodeSequence),
        path: path || 'Raiz',
        depth: depth,
        points: xSorted,
        left: null,
        right: null,
        cutX: null,
        best: null
      };
      nodes.push(node);

      if (xSorted.length <= 3) {
        emit('base-start', node, {
          pointCount: xSorted.length,
          totalPairs: xSorted.length * (xSorted.length - 1) / 2
        });

        var localBest = null;
        for (var i = 0; i < xSorted.length; i += 1) {
          for (var j = i + 1; j < xSorted.length; j += 1) {
            var candidate = {
              a: xSorted[i],
              b: xSorted[j],
              distance: distance(xSorted[i], xSorted[j])
            };
            comparisons += 1;
            var improved = better(candidate, localBest);
            if (improved) localBest = candidate;
            emit('base-compare', node, {
              pair: pairIds(candidate),
              distance: candidate.distance,
              bestDistance: localBest ? localBest.distance : null,
              improved: !!improved
            });
          }
        }
        node.best = localBest;
        emit('base-done', node, {
          bestPair: pairIds(localBest),
          bestDistance: localBest ? localBest.distance : null
        });
        return node;
      }

      var middle = Math.floor(xSorted.length / 2);
      var leftX = xSorted.slice(0, middle);
      var rightX = xSorted.slice(middle);
      var leftIds = new Set(leftX.map(function (p) { return p.id; }));
      var rightIds = new Set(rightX.map(function (p) { return p.id; }));
      var leftY = ySorted.filter(function (p) { return leftIds.has(p.id); });
      var rightY = ySorted.filter(function (p) { return rightIds.has(p.id); });
      var leftBoundary = leftX[leftX.length - 1].x;
      var rightBoundary = rightX[0].x;
      var cutX = leftBoundary + (rightBoundary - leftBoundary) / 2;
      node.cutX = cutX;

      emit('divide', node, {
        cutX: cutX,
        leftIds: leftX.map(function (p) { return p.id; }),
        rightIds: rightX.map(function (p) { return p.id; }),
        leftCount: leftX.length,
        rightCount: rightX.length,
        leftBoundary: leftBoundary,
        rightBoundary: rightBoundary
      });

      node.left = recurse(leftX, leftY, path ? path + ' · E' : 'Esquerda', depth + 1);
      node.right = recurse(rightX, rightY, path ? path + ' · D' : 'Direita', depth + 1);

      var delta = Math.min(node.left.best.distance, node.right.best.distance);
      var strip = ySorted.filter(function (p) {
        return Math.abs(p.x - cutX) <= delta;
      });

      emit('strip', node, {
        cutX: cutX,
        delta: delta,
        stripIds: strip.map(function (p) { return p.id; }),
        leftBest: pairIds(node.left.best),
        rightBest: pairIds(node.right.best),
        leftDistance: node.left.best.distance,
        rightDistance: node.right.best.distance
      });

      var best = node.left.best.distance <= node.right.best.distance
        ? node.left.best
        : node.right.best;
      var leftSet = leftIds;

      for (var a = 0; a < strip.length; a += 1) {
        for (var b = a + 1; b < strip.length && b <= a + 7; b += 1) {
          if (strip[b].y - strip[a].y > delta) break;
          var sameSide = leftSet.has(strip[a].id) === leftSet.has(strip[b].id);
          if (sameSide) continue;

          var crossing = {
            a: strip[a],
            b: strip[b],
            distance: distance(strip[a], strip[b])
          };
          comparisons += 1;
          var improves = crossing.distance < best.distance;
          if (improves) best = crossing;
          emit('strip-compare', node, {
            pair: pairIds(crossing),
            distance: crossing.distance,
            previousBest: improves ? (crossing.distance === node.left.best.distance || crossing.distance === node.right.best.distance ? crossing.distance : null) : best.distance,
            bestDistance: best.distance,
            improved: improves,
            delta: delta,
            stripIds: strip.map(function (p) { return p.id; })
          });
        }
      }

      node.best = best;
      emit('merge', node, {
        bestPair: pairIds(best),
        bestDistance: best.distance,
        leftDistance: node.left.best.distance,
        rightDistance: node.right.best.distance,
        cutX: cutX
      });
      return node;
    }

    emit('intro', null, { totalPoints: normalized.length });
    var root = recurse(sortedX, sortedY, '', 0);

    var brute = { pair: null, comparisons: 0 };
    for (var bi = 0; bi < normalized.length; bi += 1) {
      for (var bj = bi + 1; bj < normalized.length; bj += 1) {
        var d = distance(normalized[bi], normalized[bj]);
        brute.comparisons += 1;
        if (!brute.pair || d < brute.pair.distance) {
          brute.pair = { a: normalized[bi], b: normalized[bj], distance: d };
        }
      }
    }

    emit('complete', root, {
      bestPair: pairIds(root.best),
      bestDistance: root.best.distance,
      bruteComparisons: brute.comparisons,
      bruteDistance: brute.pair.distance,
      verified: Math.abs(root.best.distance - brute.pair.distance) < 1e-9
    });

    return {
      points: normalized,
      root: root,
      nodes: nodes,
      events: events,
      result: root.best,
      comparisons: comparisons,
      brute: brute
    };
  }

  global.ClosestPair = Object.freeze({ run: closestPair, distance: distance });
}(window));
