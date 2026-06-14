// ================================================================
// hostscript.jsx
// ExtendScript — выполняется внутри After Effects
// ================================================================

var GRID_LAYER_NAME = "RuleOfThird_Grid";


// ================================================================
// УНИВЕРСАЛЬНАЯ ФУНКЦИЯ ПОЛУЧЕНИЯ КОМПОЗИЦИИ
// ================================================================

// Надёжно находит композицию даже когда activeItem теряется
// из-за того что пользователь кликнул по панели плагина
function getActiveComp() {
  // Сначала пробуем стандартный способ
  if (app.project.activeItem && app.project.activeItem instanceof CompItem) {
    return app.project.activeItem;
  }
  // Если не сработало — берём первую композицию в проекте
  for (var i = 1; i <= app.project.numItems; i++) {
    if (app.project.item(i) instanceof CompItem) {
      return app.project.item(i);
    }
  }
  return null;
}


// ================================================================
// РАЗМЕЩЕНИЕ ВЫДЕЛЕННОГО ЭЛЕМЕНТА В ЯЧЕЙКУ
// ================================================================

function placeSelectedItemToZone(zoneDataStr) {

  var comp = getActiveComp();
  if (!comp) {
    return "Ошибка: не найдена композиция в проекте. Создай композицию в AE.";
  }

  // Проверяем что что-то выделено в панели проекта
  var selection = app.project.selection;
  if (!selection || selection.length === 0) {
    return "Ошибка: ничего не выделено в панели проекта AE. Кликни по файлу в Project panel.";
  }

  // Берём первый выделенный элемент
  var item = selection[0];

  // Проверяем что это footage, а не папка или композиция
  if (!(item instanceof FootageItem)) {
    return "Ошибка: выбери изображение или видео, не папку и не композицию.";
  }

  // Парсим данные о зоне
  var data    = eval("(" + zoneDataStr + ")");
  var zoneX   = Math.round(data.xPct * comp.width);
  var zoneY   = Math.round(data.yPct * comp.height);
  var zoneW   = Math.round(data.wPct * comp.width);
  var zoneH   = Math.round(data.hPct * comp.height);

  // Центр ячейки — сюда ставим позицию слоя
  var centerX = zoneX + zoneW / 2;
  var centerY = zoneY + zoneH / 2;

  app.beginUndoGroup("Rule of Third: разместить в зону");

  // Добавляем footage как слой в композицию
  var layer      = comp.layers.add(item);
  layer.outPoint = comp.duration;

  // Позиционируем по центру ячейки
  layer.property("Position").setValue([centerX, centerY]);

  // Масштабируем чтобы вписать в ячейку без обрезки
  var sourceW = item.width;
  var sourceH = item.height;
  if (sourceW > 0 && sourceH > 0) {
    var scaleX = (zoneW / sourceW) * 100;
    var scaleY = (zoneH / sourceH) * 100;
    var scale  = Math.min(scaleX, scaleY);
    layer.property("Scale").setValue([scale, scale]);
  }

  // Слой сетки держим поверх всего
  for (var i = 1; i <= comp.layers.length; i++) {
    if (comp.layers[i].name === GRID_LAYER_NAME) {
      comp.layers[i].moveToBeginning();
      break;
    }
  }

  app.endUndoGroup();

  return "Размещено: " + item.name + " \u2192 центр (" + Math.round(centerX) + ", " + Math.round(centerY) + ")";
}


// ================================================================
// ОТОБРАЖЕНИЕ СЕТКИ В КОМПОЗИЦИИ
// ================================================================

function showGridInComposition(gridDataStr) {

  var comp = getActiveComp();
  if (!comp) {
    return "Ошибка: не найдена композиция в проекте.";
  }

  var gridData = eval("(" + gridDataStr + ")");
  var cols = gridData.cols;
  var rows = gridData.rows;
  var type = gridData.type;
  var W    = comp.width;
  var H    = comp.height;

  app.beginUndoGroup("Rule of Third: показать сетку");

  // Удаляем старый слой сетки если есть
  removeGridLayer(comp);

  // Создаём Shape Layer
  var gridLayer = comp.layers.addShape();
  gridLayer.name     = GRID_LAYER_NAME;
  gridLayer.outPoint = comp.duration;
  gridLayer.moveToBeginning();

  // Сдвигаем anchor point в верхний левый угол —
  // чтобы координаты [0,0] совпадали с верхним левым углом композиции
  gridLayer.property("Anchor Point").setValue([0, 0]);
  gridLayer.property("Position").setValue([0, 0]);

  var contents      = gridLayer.property("Contents");
  var linePositions = getLinePositions(type, cols, rows, W, H, gridData.colWeights, gridData.rowWeights);

  // Рисуем линии
  for (var i = 0; i < linePositions.length; i++) {
    var line = linePositions[i];
    addLineToShapeLayer(contents, line.x1, line.y1, line.x2, line.y2, i);
  }

  // Рисуем точки пересечения для правила третей и золотого сечения
  if (type === "thirds" || type === "golden") {
    var points = getIntersectionPoints(type, W, H);
    for (var j = 0; j < points.length; j++) {
      addPointToShapeLayer(contents, points[j].x, points[j].y, j);
    }
  }

  app.endUndoGroup();

  return "Сетка добавлена в композицию: " + cols + "\xd7" + rows;
}

// Удаляет слой сетки из композиции
function hideGridInComposition() {
  var comp = getActiveComp();
  if (!comp) {
    return "Ошибка: не найдена композиция в проекте.";
  }

  app.beginUndoGroup("Rule of Third: скрыть сетку");
  var removed = removeGridLayer(comp);
  app.endUndoGroup();

  return removed ? "Сетка удалена." : "Слой сетки не найден.";
}

// Ищет и удаляет слой сетки
function removeGridLayer(comp) {
  for (var i = 1; i <= comp.layers.length; i++) {
    if (comp.layers[i].name === GRID_LAYER_NAME) {
      comp.layers[i].remove();
      return true;
    }
  }
  return false;
}


// ================================================================
// ВЫЧИСЛЕНИЕ ПОЗИЦИЙ ЛИНИЙ
// ================================================================

// Переводит массив весов в позиции линий-разделителей
function weightsToPositionsJSX(weights, total) {
  var totalWeight = 0;
  for (var i = 0; i < weights.length; i++) totalWeight += weights[i];
  var positions = [], accumulated = 0;
  for (var i = 0; i < weights.length - 1; i++) {
    accumulated += weights[i];
    positions.push(Math.round(accumulated / totalWeight * total));
  }
  return positions;
}

// Возвращает массив координат линий сетки в пикселях композиции
function getLinePositions(type, cols, rows, W, H, colWeights, rowWeights) {
  var lines = [];

  if (type === "thirds" || type === "custom") {
    var colPositions = [];
    var rowPositions = [];

    if (type === "custom" && colWeights && colWeights.length > 0) {
      // Кастомная сетка — позиции из весов
      colPositions = weightsToPositionsJSX(colWeights, W);
      rowPositions = weightsToPositionsJSX(rowWeights, H);
    } else {
      // Правило третей — равномерные позиции
      var colStep = W / cols;
      var rowStep = H / rows;
      for (var c = 1; c < cols; c++) colPositions.push(colStep * c);
      for (var r = 1; r < rows; r++) rowPositions.push(rowStep * r);
    }

    for (var i = 0; i < colPositions.length; i++) {
      lines.push({ x1: colPositions[i], y1: 0, x2: colPositions[i], y2: H });
    }
    for (var j = 0; j < rowPositions.length; j++) {
      lines.push({ x1: 0, y1: rowPositions[j], x2: W, y2: rowPositions[j] });
    }

  } else if (type === "golden") {
    var phi  = 1.618;
    var colB = W / (1 + phi); var colA = W - colB;
    var rowB = H / (1 + phi); var rowA = H - rowB;

    lines.push({ x1: colB, y1: 0, x2: colB, y2: H });
    lines.push({ x1: colA, y1: 0, x2: colA, y2: H });
    lines.push({ x1: 0, y1: rowB, x2: W, y2: rowB });
    lines.push({ x1: 0, y1: rowA, x2: W, y2: rowA });
  }

  return lines;
}

// Возвращает точки пересечения линий
function getIntersectionPoints(type, W, H) {
  var points = [];

  if (type === "thirds") {
    var cs = W / 3, rs = H / 3;
    for (var r = 1; r < 3; r++) {
      for (var c = 1; c < 3; c++) {
        points.push({ x: cs * c, y: rs * r });
      }
    }
  } else if (type === "golden") {
    var phi  = 1.618;
    var colB = W / (1 + phi); var colA = W - colB;
    var rowB = H / (1 + phi); var rowA = H - rowB;
    points.push({ x: colB, y: rowB });
    points.push({ x: colA, y: rowB });
    points.push({ x: colB, y: rowA });
    points.push({ x: colA, y: rowA });
  }

  return points;
}


// ================================================================
// РИСОВАНИЕ ЛИНИЙ В SHAPE LAYER
// ================================================================

function addLineToShapeLayer(contents, x1, y1, x2, y2, index) {
  var group         = contents.addProperty("ADBE Vector Group");
  group.name        = "Line_" + index;
  var gc            = group.property("Contents");

  var pathProp      = gc.addProperty("ADBE Vector Shape - Group");
  var shape         = new Shape();
  shape.vertices    = [[x1, y1], [x2, y2]];
  shape.inTangents  = [[0, 0], [0, 0]];
  shape.outTangents = [[0, 0], [0, 0]];
  shape.closed      = false;
  pathProp.property("Path").setValue(shape);

  var stroke = gc.addProperty("ADBE Vector Graphic - Stroke");
  stroke.property("Color").setValue([1.0, 1.0, 1.0]);
  stroke.property("Stroke Width").setValue(2);

  group.property("Transform").property("Opacity").setValue(70);
}

function addPointToShapeLayer(contents, x, y, index) {
  var group  = contents.addProperty("ADBE Vector Group");
  group.name = "Point_" + index;
  var gc     = group.property("Contents");

  var ellipse = gc.addProperty("ADBE Vector Shape - Ellipse");
  ellipse.property("Size").setValue([12, 12]);
  ellipse.property("Position").setValue([x, y]);

  var fill = gc.addProperty("ADBE Vector Graphic - Fill");
  fill.property("Color").setValue([1.0, 0.85, 0.0]);

  group.property("Transform").property("Opacity").setValue(90);
}


// ================================================================
// ОРИЕНТАЦИЯ КОМПОЗИЦИИ
// ================================================================

function getCompOrientation() {
  var comp = getActiveComp();
  if (!comp) {
    alert("getActiveComp вернул null"); // временно
    return "none";
  }
  if (comp.height > comp.width) return "portrait";
  return "landscape";
}
