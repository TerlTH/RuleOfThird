// ================================================================
// ИНИЦИАЛИЗАЦИЯ
// ================================================================

var csInterface = new CSInterface();

var canvas = document.getElementById("gridCanvas");
var ctx    = canvas.getContext("2d");

var LANDSCAPE_W = 360;
var LANDSCAPE_H = 200;
var PORTRAIT_W  = 200;
var PORTRAIT_H  = 360;

var orientation = "landscape";
var W = LANDSCAPE_W;
var H = LANDSCAPE_H;

var currentGrid = "thirds";
var currentCols = 3;
var currentRows = 3;

var colWeights = [1, 1, 1];
var rowWeights = [1, 1, 1];

// Хранилище занятых ячеек
var zoneFiles = {};

// Hover и drag
var hoverZone    = null;
var isDragging   = false;
var dragStartZone = null;
var dragEndZone   = null;
var selectedRange = null;


// ================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ================================================================

function setStatus(text) {
  document.getElementById("statusBar").textContent = text;
}

function redrawCurrent() {
  if (currentGrid === "thirds") {
    drawRuleOfThirds();
  } else if (currentGrid === "golden") {
    drawGoldenRatio();
  } else {
    drawCustomGrid(currentCols, currentRows);
  }
}

function getCanvasCoords(event) {
  var rect   = canvas.getBoundingClientRect();
  var scaleX = W / rect.width;
  var scaleY = H / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top)  * scaleY
  };
}

function getZoneFromCoords(canvasX, canvasY) {
  if (currentGrid === "custom") {
    var colZones = weightsToZones(colWeights, W);
    var rowZones = weightsToZones(rowWeights, H);
    var col = 0, row = 0;
    for (var c = 0; c < colZones.length; c++) {
      if (canvasX >= colZones[c].start) col = c;
    }
    for (var r = 0; r < rowZones.length; r++) {
      if (canvasY >= rowZones[r].start) row = r;
    }
    return { col: col, row: row };
  }

  if (currentGrid === "golden") {
    var phi  = 1.618;
    var col1 = W / (1 + phi);
    var col2 = W - col1;
    var row1 = H / (1 + phi);
    var row2 = H - row1;
    var col = canvasX < col1 ? 0 : canvasX < col2 ? 1 : 2;
    var row = canvasY < row1 ? 0 : canvasY < row2 ? 1 : 2;
    return { col: col, row: row };
  }

  var colStep = W / currentCols;
  var rowStep = H / currentRows;
  return {
    col: Math.min(Math.floor(canvasX / colStep), currentCols - 1),
    row: Math.min(Math.floor(canvasY / rowStep), currentRows - 1)
  };
}

function getZoneRect(col, row) {
  if (currentGrid === "custom") {
    var colZones = weightsToZones(colWeights, W);
    var rowZones = weightsToZones(rowWeights, H);
    return {
      x: colZones[col].start,
      y: rowZones[row].start,
      w: colZones[col].size,
      h: rowZones[row].size
    };
  }

  if (currentGrid === "golden") {
    var phi  = 1.618;
    var col1 = W / (1 + phi);
    var col2 = W - col1;
    var row1 = H / (1 + phi);
    var row2 = H - row1;
    var colStarts = [0, col1, col2];
    var colSizes  = [col1, col2 - col1, W - col2];
    var rowStarts = [0, row1, row2];
    var rowSizes  = [row1, row2 - row1, H - row2];
    return {
      x: colStarts[col],
      y: rowStarts[row],
      w: colSizes[col],
      h: rowSizes[row]
    };
  }

  var colStep = W / currentCols;
  var rowStep = H / currentRows;
  return {
    x: col * colStep,
    y: row * rowStep,
    w: colStep,
    h: rowStep
  };
}

function zoneKey(col, row) {
  return currentGrid + "_" + col + "_" + row;
}

function getDragRange() {
  return {
    colMin: Math.min(dragStartZone.col, dragEndZone.col),
    colMax: Math.max(dragStartZone.col, dragEndZone.col),
    rowMin: Math.min(dragStartZone.row, dragEndZone.row),
    rowMax: Math.max(dragStartZone.row, dragEndZone.row)
  };
}


// ================================================================
// ФУНКЦИИ ВЕСОВ
// ================================================================

function weightsToPositions(weights, total) {
  var totalWeight = 0;
  for (var i = 0; i < weights.length; i++) totalWeight += weights[i];
  var positions = [], accumulated = 0;
  for (var i = 0; i < weights.length - 1; i++) {
    accumulated += weights[i];
    positions.push(Math.round(accumulated / totalWeight * total));
  }
  return positions;
}

function weightsToZones(weights, total) {
  var positions = weightsToPositions(weights, total);
  var zones = [], prev = 0;
  for (var i = 0; i < weights.length; i++) {
    var next = (i < positions.length) ? positions[i] : total;
    zones.push({ start: prev, size: next - prev });
    prev = next;
  }
  return zones;
}


// ================================================================
// РИСОВАНИЕ
// ================================================================

function clearCanvas() {
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, W, H);
}

function drawLine(x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawZoneContents(cols, rows) {
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      var rect = getZoneRect(c, r);
      var key  = zoneKey(c, r);
      var file = zoneFiles[key];

      if (file) {
        ctx.fillStyle = "rgba(74, 144, 217, 0.35)";
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.font = "bold 9px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("\u2713", rect.x + rect.w / 2, rect.y + rect.h / 2 - 7);

        var name = file.name;
        if (name.length > 14) name = name.substring(0, 12) + "\u2026";
        ctx.font = "9px Arial";
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillText(name, rect.x + rect.w / 2, rect.y + rect.h / 2 + 6);
      }

      if (!isDragging && hoverZone &&
          hoverZone.col === c && hoverZone.row === r) {
        ctx.fillStyle = "rgba(74, 144, 217, 0.2)";
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx.strokeStyle = "rgba(74, 144, 217, 1)";
        ctx.lineWidth = 2;
        ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
      }

      if (isDragging && dragStartZone && dragEndZone) {
        var range = getDragRange();
        if (c >= range.colMin && c <= range.colMax &&
            r >= range.rowMin && r <= range.rowMax) {
          ctx.fillStyle = "rgba(74, 214, 144, 0.25)";
          ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
          ctx.strokeStyle = "rgba(74, 214, 144, 0.9)";
          ctx.lineWidth = 2;
          ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
        }
      }

      if (!isDragging && selectedRange) {
        if (c >= selectedRange.colMin && c <= selectedRange.colMax &&
            r >= selectedRange.rowMin && r <= selectedRange.rowMax) {
          ctx.fillStyle = "rgba(74, 214, 144, 0.2)";
          ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
          ctx.strokeStyle = "rgba(74, 214, 144, 1)";
          ctx.lineWidth = 2;
          ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
        }
      }
    }
  }
}

function drawRuleOfThirds() {
  currentCols = 3; currentRows = 3;
  clearCanvas();
  drawZoneContents(3, 3);

  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 1;
  var cs = W / 3, rs = H / 3;
  for (var i = 1; i < 3; i++) drawLine(cs * i, 0, cs * i, H);
  for (var j = 1; j < 3; j++) drawLine(0, rs * j, W, rs * j);

  ctx.fillStyle = "rgba(255,200,0,0.9)";
  for (var r = 1; r < 3; r++) {
    for (var c = 1; c < 3; c++) {
      ctx.beginPath();
      ctx.arc(cs * c, rs * r, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawGoldenRatio() {
  currentCols = 3; currentRows = 3;
  clearCanvas();
  drawZoneContents(3, 3);

  var phi  = 1.618;
  var col1 = W / (1 + phi);
  var col2 = W - col1;
  var row1 = H / (1 + phi);
  var row2 = H - row1;

  ctx.strokeStyle = "rgba(255,200,50,0.8)";
  ctx.lineWidth = 1;
  drawLine(col1, 0, col1, H);
  drawLine(col2, 0, col2, H);
  drawLine(0, row1, W, row1);
  drawLine(0, row2, W, row2);

  ctx.fillStyle = "rgba(255,150,0,1)";
  [col1, col2].forEach(function(x) {
    [row1, row2].forEach(function(y) {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

function drawCustomGrid(cols, rows) {
  currentCols = cols; currentRows = rows;
  clearCanvas();
  drawZoneContents(cols, rows);

  var colPositions = weightsToPositions(colWeights, W);
  var rowPositions = weightsToPositions(rowWeights, H);

  ctx.strokeStyle = "rgba(100,200,255,0.8)";
  ctx.lineWidth = 1;
  colPositions.forEach(function(x) { drawLine(x, 0, x, H); });
  rowPositions.forEach(function(y) { drawLine(0, y, W, y); });

  ctx.fillStyle = "rgba(100,200,255,0.6)";
  ctx.font = "11px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(cols + " \xd7 " + rows, 6, H - 6);
}


// ================================================================
// ОБРАБОТЧИКИ МЫШИ
// ================================================================

canvas.addEventListener("mousedown", function(event) {
  var coords = getCanvasCoords(event);
  var zone   = getZoneFromCoords(coords.x, coords.y);
  isDragging    = true;
  dragStartZone = zone;
  dragEndZone   = zone;
  selectedRange = null;
  redrawCurrent();
});

canvas.addEventListener("mousemove", function(event) {
  var coords = getCanvasCoords(event);
  var zone   = getZoneFromCoords(coords.x, coords.y);

  if (isDragging) {
    dragEndZone = zone;
    redrawCurrent();
  } else {
    if (!hoverZone || hoverZone.col !== zone.col || hoverZone.row !== zone.row) {
      hoverZone = zone;
      redrawCurrent();
    }
  }
});

canvas.addEventListener("mouseup", function(event) {
  if (!isDragging) return;
  var coords    = getCanvasCoords(event);
  dragEndZone   = getZoneFromCoords(coords.x, coords.y);
  selectedRange = getDragRange();
  isDragging    = false;
  dragStartZone = null;
  dragEndZone   = null;

  var cellCount = (selectedRange.colMax - selectedRange.colMin + 1) *
                  (selectedRange.rowMax - selectedRange.rowMin + 1);

  if (cellCount === 1) {
    setStatus("Выделена 1 ячейка. Выдели файл в Project panel и нажми \u2193 Разместить файл.");
  } else {
    setStatus(
      "Выделено: " + cellCount + " ячеек (" +
      (selectedRange.colMax - selectedRange.colMin + 1) + "\xd7" +
      (selectedRange.rowMax - selectedRange.rowMin + 1) +
      "). Выдели файл в Project panel и нажми \u2193 Разместить файл."
    );
  }
  redrawCurrent();
});

canvas.addEventListener("mouseleave", function() {
  if (isDragging) {
    selectedRange = getDragRange();
    isDragging    = false;
    dragStartZone = null;
    dragEndZone   = null;
  }
  hoverZone = null;
  redrawCurrent();
});


// ================================================================
// ПРЕДУСТАНОВКИ СЕТКИ
// ================================================================

var btnThirds     = document.getElementById("btnThirds");
var btnGolden     = document.getElementById("btnGolden");
var btnCustom     = document.getElementById("btnCustom");
var customSection = document.getElementById("customSection");

btnThirds.addEventListener("click", function() {
  currentGrid = "thirds";
  btnThirds.classList.add("active");
  btnGolden.classList.remove("active");
  btnCustom.classList.remove("active");
  customSection.classList.add("hidden");
  selectedRange = null;
  drawRuleOfThirds();
});

btnGolden.addEventListener("click", function() {
  currentGrid = "golden";
  btnGolden.classList.add("active");
  btnThirds.classList.remove("active");
  btnCustom.classList.remove("active");
  customSection.classList.add("hidden");
  selectedRange = null;
  drawGoldenRatio();
});

btnCustom.addEventListener("click", function() {
  currentGrid = "custom";
  btnCustom.classList.add("active");
  btnThirds.classList.remove("active");
  btnGolden.classList.remove("active");
  customSection.classList.remove("hidden");
  selectedRange = null;
  var cols = parseInt(document.getElementById("inputCols").value);
  var rows = parseInt(document.getElementById("inputRows").value);
  drawCustomGrid(cols, rows);
});


// ================================================================
// КАСТОМНАЯ СЕТКА — ПОЛЗУНКИ ВЕСОВ
// ================================================================

function buildWeightControls(cols, rows) {
  var colContainer = document.getElementById("colWeights");
  var rowContainer = document.getElementById("rowWeights");
  colContainer.innerHTML = "";
  rowContainer.innerHTML = "";

  while (colWeights.length < cols) colWeights.push(1);
  colWeights = colWeights.slice(0, cols);
  while (rowWeights.length < rows) rowWeights.push(1);
  rowWeights = rowWeights.slice(0, rows);

  function makeSlider(container, labelText, weightsArr, index) {
    var item = document.createElement("div");
    item.className = "weight-item";

    var lbl = document.createElement("span");
    lbl.textContent = labelText;

    var slider = document.createElement("input");
    slider.type  = "range";
    slider.min   = 1;
    slider.max   = 5;
    slider.value = weightsArr[index];

    var val = document.createElement("span");
    val.textContent = weightsArr[index];

    slider.addEventListener("input", function() {
      weightsArr[index] = parseInt(slider.value);
      val.textContent   = slider.value;
      drawCustomGrid(currentCols, currentRows);
    });

    item.appendChild(lbl);
    item.appendChild(slider);
    item.appendChild(val);
    container.appendChild(item);
  }

  for (var c = 0; c < cols; c++) makeSlider(colContainer, "\u041a" + (c + 1), colWeights, c);
  for (var r = 0; r < rows; r++) makeSlider(rowContainer, "\u0421" + (r + 1), rowWeights, r);

  document.getElementById("weightControls").classList.remove("hidden");
}

document.getElementById("btnApply").addEventListener("click", function() {
  var cols = parseInt(document.getElementById("inputCols").value);
  var rows = parseInt(document.getElementById("inputRows").value);
  if (isNaN(cols) || cols < 1) cols = 1;
  if (isNaN(rows) || rows < 1) rows = 1;
  if (cols > 8) cols = 8;
  if (rows > 8) rows = 8;
  document.getElementById("inputCols").value = cols;
  document.getElementById("inputRows").value = rows;

  colWeights = [];
  rowWeights = [];
  for (var c = 0; c < cols; c++) colWeights.push(1);
  for (var r = 0; r < rows; r++) rowWeights.push(1);

  Object.keys(zoneFiles).forEach(function(k) {
    if (k.indexOf("custom_") === 0) delete zoneFiles[k];
  });

  selectedRange = null;
  buildWeightControls(cols, rows);
  drawCustomGrid(cols, rows);
});


// ================================================================
// РАЗМЕЩЕНИЕ ФАЙЛА
// ================================================================

document.getElementById("btnPlaceFile").addEventListener("click", function() {
  if (!selectedRange) {
    setStatus("Сначала выдели ячейки на сетке.");
    return;
  }

  var rectStart = getZoneRect(selectedRange.colMin, selectedRange.rowMin);
  var rectEnd   = getZoneRect(selectedRange.colMax, selectedRange.rowMax);

  var totalX = rectStart.x;
  var totalY = rectStart.y;
  var totalW = rectEnd.x + rectEnd.w - rectStart.x;
  var totalH = rectEnd.y + rectEnd.h - rectStart.y;

  var zoneData = JSON.stringify({
    colMin: selectedRange.colMin,
    colMax: selectedRange.colMax,
    rowMin: selectedRange.rowMin,
    rowMax: selectedRange.rowMax,
    xPct:   totalX / W,
    yPct:   totalY / H,
    wPct:   totalW / W,
    hPct:   totalH / H
  });

  setStatus("\u0420\u0430\u0437\u043c\u0435\u0449\u0430\u044e...");

  csInterface.evalScript(
    'placeSelectedItemToZone(' + "'" + zoneData + "'" + ')',
    function(result) {
      setStatus(result);

      if (result && result.indexOf("\u041e\u0448\u0438\u0431\u043a\u0430") === -1) {
        var nameMatch = result.match(/\u0420\u0430\u0437\u043c\u0435\u0449\u0435\u043d\u043e:\s*(.+?)\s*\u2192/);
        var name = nameMatch ? nameMatch[1] : "\u0444\u0430\u0439\u043b";

        for (var r = selectedRange.rowMin; r <= selectedRange.rowMax; r++) {
          for (var c = selectedRange.colMin; c <= selectedRange.colMax; c++) {
            zoneFiles[zoneKey(c, r)] = { name: name };
          }
        }
        selectedRange = null;
        redrawCurrent();
      }
    }
  );
});


// ================================================================
// ОЧИСТКА ЯЧЕЕК
// ================================================================

document.getElementById("btnClearZones").addEventListener("click", function() {
  Object.keys(zoneFiles).forEach(function(key) {
    if (key.indexOf(currentGrid + "_") === 0) delete zoneFiles[key];
  });
  selectedRange = null;
  redrawCurrent();
  setStatus("\u042f\u0447\u0435\u0439\u043a\u0438 \u043e\u0447\u0438\u0449\u0435\u043d\u044b.");
});


// ================================================================
// СОХРАНЕНИЕ И ЗАГРУЗКА КАСТОМНЫХ СЕТОК
// ================================================================

var STORAGE_KEY = "ruleofthird_saved_grids";

// Загружает все сохранённые сетки из localStorage
function loadSavedGrids() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

// Сохраняет массив сеток в localStorage
function saveGridsToStorage(grids) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(grids));
  } catch (e) {
    setStatus("Ошибка сохранения.");
  }
}

// Обновляет выпадающий список сохранённых сеток
function refreshSavedGridSelect() {
  var select = document.getElementById("savedGridSelect");
  var grids  = loadSavedGrids();

  // Оставляем первый пустой option
  select.innerHTML = '<option value="">— выбрать —</option>';

  grids.forEach(function(grid, index) {
    var option = document.createElement("option");
    option.value = index;

    // Добавляем пометку ориентации к названию
    var orientLabel = grid.orientation === "portrait" ? " [Портрет]" : " [Альбом]";
    option.textContent = grid.name + orientLabel;

    // Если ориентация не совпадает с текущей — помечаем визуально
    if (grid.orientation !== orientation) {
      option.style.color = "#888888";
    }

    select.appendChild(option);
  });
}

// Обновляет бейдж ориентации в поле сохранения
function updateOrientationBadge() {
  var badge = document.getElementById("orientationBadge");
  if (orientation === "portrait") {
    badge.textContent  = "▯ Портретная";
    badge.className    = "badge portrait";
  } else {
    badge.textContent  = "⬛ Альбомная";
    badge.className    = "badge landscape";
  }
}

// Кнопка «Сохранить сетку» — показывает поле ввода названия
document.getElementById("btnSaveGrid").addEventListener("click", function() {
  var saveSection = document.getElementById("saveNameSection");

  // Показываем только если сетка уже настроена (нажат Применить)
  if (document.getElementById("weightControls").classList.contains("hidden")) {
    setStatus("Сначала настрой сетку — нажми Применить.");
    return;
  }

  updateOrientationBadge();
  saveSection.classList.remove("hidden");
  document.getElementById("inputGridName").focus();
});

// Кнопка «Отмена»
document.getElementById("btnCancelSave").addEventListener("click", function() {
  document.getElementById("saveNameSection").classList.add("hidden");
  document.getElementById("inputGridName").value = "";
});

// Кнопка «Сохранить» — фиксирует сетку
document.getElementById("btnConfirmSave").addEventListener("click", function() {
  var name = document.getElementById("inputGridName").value.trim();

  if (!name) {
    setStatus("Введи название сетки.");
    document.getElementById("inputGridName").focus();
    return;
  }

  var grids = loadSavedGrids();

  // Проверяем на дублирование имени
  var duplicate = false;
  for (var i = 0; i < grids.length; i++) {
    if (grids[i].name === name) {
      duplicate = true;
      break;
    }
  }

  if (duplicate) {
    setStatus("Сетка с таким названием уже существует.");
    return;
  }

  // Сохраняем текущие параметры сетки
  var newGrid = {
    name:        name,
    orientation: orientation,
    cols:        currentCols,
    rows:        currentRows,
    colWeights:  colWeights.slice(), // копируем массив
    rowWeights:  rowWeights.slice()
  };

  grids.push(newGrid);
  saveGridsToStorage(grids);
  refreshSavedGridSelect();

  // Скрываем поле ввода
  document.getElementById("saveNameSection").classList.add("hidden");
  document.getElementById("inputGridName").value = "";

  setStatus("Сетка \"" + name + "\" сохранена.");
});

// Кнопка «Загрузить» — применяет выбранную сетку
document.getElementById("btnLoadGrid").addEventListener("click", function() {
  var select = document.getElementById("savedGridSelect");
  var index  = select.value;

  if (index === "") {
    setStatus("Выбери сетку из списка.");
    return;
  }

  var grids = loadSavedGrids();
  var grid  = grids[parseInt(index)];

  if (!grid) {
    setStatus("Сетка не найдена.");
    return;
  }

  // Предупреждаем если ориентация не совпадает
  if (grid.orientation !== orientation) {
    var orientName = grid.orientation === "portrait" ? "портретной" : "альбомной";
    setStatus(
      "Внимание: сетка \"" + grid.name + "\" создана для " +
      orientName + " ориентации."
    );
  } else {
    setStatus("Загружена сетка: " + grid.name);
  }

  // Применяем параметры сетки
  currentCols = grid.cols;
  currentRows = grid.rows;
  colWeights  = grid.colWeights.slice();
  rowWeights  = grid.rowWeights.slice();

  document.getElementById("inputCols").value = grid.cols;
  document.getElementById("inputRows").value = grid.rows;

  // Пересобираем ползунки с загруженными весами
  buildWeightControls(grid.cols, grid.rows);
  drawCustomGrid(grid.cols, grid.rows);
});

// Кнопка «✕» — удаляет выбранную сетку
document.getElementById("btnDeleteGrid").addEventListener("click", function() {
  var select = document.getElementById("savedGridSelect");
  var index  = select.value;

  if (index === "") {
    setStatus("Выбери сетку для удаления.");
    return;
  }

  var grids = loadSavedGrids();
  var name  = grids[parseInt(index)].name;

  grids.splice(parseInt(index), 1);
  saveGridsToStorage(grids);
  refreshSavedGridSelect();

  setStatus("Сетка \"" + name + "\" удалена.");
});

// Заполняем список при открытии секции кастомной сетки
var _origBtnCustomClick = btnCustom.onclick;
btnCustom.addEventListener("click", function() {
  refreshSavedGridSelect();
});


// ================================================================
// СЕТКА В КОМПОЗИЦИИ AE
// ================================================================

document.getElementById("btnShowGrid").addEventListener("click", function() {
  var gridData = JSON.stringify({
    type:       currentGrid,
    cols:       currentCols,
    rows:       currentRows,
    colWeights: currentGrid === "custom" ? colWeights : [],
    rowWeights: currentGrid === "custom" ? rowWeights : []
  });

  csInterface.evalScript(
    'showGridInComposition(' + "'" + gridData + "'" + ')',
    function(result) { setStatus(result); }
  );
});

document.getElementById("btnHideGrid").addEventListener("click", function() {
  csInterface.evalScript("hideGridInComposition()", function(result) {
    setStatus(result);
  });
});


// ================================================================
// АВТОСИНХРОНИЗАЦИЯ ОРИЕНТАЦИИ
// ================================================================

function applyOrientation(result) {
  if (!result || result === "none" || result === "undefined") return false;

  var newOrientation = (result === "portrait") ? "portrait" : "landscape";
  if (newOrientation === orientation) return false;

  orientation   = newOrientation;
  W             = (newOrientation === "portrait") ? PORTRAIT_W  : LANDSCAPE_W;
  H             = (newOrientation === "portrait") ? PORTRAIT_H  : LANDSCAPE_H;

  // Принудительно обновляем атрибуты canvas
  canvas.setAttribute("width",  W);
  canvas.setAttribute("height", H);

  hoverZone     = null;
  selectedRange = null;
  return true;
}

function syncOrientationWithComp() {
  csInterface.evalScript("getCompOrientation()", function(result) {
    if (applyOrientation(result)) {
      redrawCurrent();
      setStatus("Ориентация: " + result);
    }
  });
}

csInterface.addEventListener("afterEffectsDocumentChanged", function() {
  syncOrientationWithComp();
});

csInterface.addEventListener("com.adobe.csxs.events.WorkspaceChanged", function() {
  syncOrientationWithComp();
});


// ================================================================
// ЗАПУСК
// ================================================================

function initOrientation() {
  csInterface.evalScript("getCompOrientation()", function(result) {
    if (result && result !== "none" && result !== "undefined") {
      applyOrientation(result);
      drawRuleOfThirds();
    } else {
      // AE ещё не готов — пробуем снова через 500мс
      setTimeout(initOrientation, 500);
    }
  });
}

// Рисуем сетку сразу чтобы панель не была пустой
drawRuleOfThirds();

// Через 300мс запрашиваем ориентацию у AE
setTimeout(initOrientation, 300);