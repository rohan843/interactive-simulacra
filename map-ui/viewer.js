const MAP_URL = "map-assets/the_ville_jan7-2.json";
const LOCATION_METADATA_URL = "map-assets/location-metadata.json";
const UI_STATE_URL = `ui-state.json?v=${Date.now()}`;
const ASSET_ROOT = "map-assets/";
const AGENT_NAMES = [
  "latoya williams",
  "rajiv patel",
  "abigail chen",
  "francisco lopez",
  "hailey johnson",
  "arthur burton",
  "ryan park",
  "isabella rodriguez",
  "giorgio rossi",
  "carlos gomez",
  "klaus mueller",
  "maria lopez",
  "ayesha khan",
  "wolfgang schulz",
  "mei lin",
  "john lin",
  "eddy lin",
  "tom moreno",
  "jane moreno",
  "tamara taylor",
  "carmen ortiz",
  "sam moore",
  "jennifer moore",
  "yuriko yamamoto",
  "adam smith"
];
const TILESETS = [
  ["CuteRPG_Field_B", "cute_rpg_word_VXAce/tilesets/CuteRPG_Field_B.png"],
  ["CuteRPG_Field_C", "cute_rpg_word_VXAce/tilesets/CuteRPG_Field_C.png"],
  ["CuteRPG_Harbor_C", "cute_rpg_word_VXAce/tilesets/CuteRPG_Harbor_C.png"],
  ["Room_Builder_32x32", "v1/Room_Builder_32x32.png"],
  ["CuteRPG_Village_B", "cute_rpg_word_VXAce/tilesets/CuteRPG_Village_B.png"],
  ["CuteRPG_Forest_B", "cute_rpg_word_VXAce/tilesets/CuteRPG_Forest_B.png"],
  ["CuteRPG_Desert_C", "cute_rpg_word_VXAce/tilesets/CuteRPG_Desert_C.png"],
  ["CuteRPG_Mountains_B", "cute_rpg_word_VXAce/tilesets/CuteRPG_Mountains_B.png"],
  ["CuteRPG_Desert_B", "cute_rpg_word_VXAce/tilesets/CuteRPG_Desert_B.png"],
  ["CuteRPG_Forest_C", "cute_rpg_word_VXAce/tilesets/CuteRPG_Forest_C.png"],
  ["interiors_pt1", "v1/interiors_pt1.png"],
  ["interiors_pt2", "v1/interiors_pt2.png"],
  ["interiors_pt3", "v1/interiors_pt3.png"],
  ["interiors_pt4", "v1/interiors_pt4.png"],
  ["interiors_pt5", "v1/interiors_pt5.png"],
  ["blocks", "blocks/blocks_1.png"],
  ["blocks_2", "blocks/blocks_2.png"],
  ["blocks_3", "blocks/blocks_3.png"]
];

const statusElement = document.getElementById("status");
const statusIndicator = document.querySelector(".live-indicator");
const gameContainer = document.getElementById("game-container");
const overlayOptions = document.getElementById("overlay-options");
const locationTree = document.getElementById("location-tree");
const locationSearch = document.getElementById("location-search");
const locationEmpty = document.getElementById("location-empty");
const workbench = document.querySelector(".workbench");
const locationsSidebar = document.querySelector(".location-sidebar");
const layersSidebar = document.querySelector(".layers-sidebar");
const locationsToggle = document.getElementById("locations-toggle");
const layersToggle = document.getElementById("layers-toggle");
const locationsResizer = document.getElementById("locations-resizer");
const layersResizer = document.getElementById("layers-resizer");
const locationToggle = document.getElementById("location-toggle");
const locationPanel = document.getElementById("map-hover-info");
const locationClose = document.getElementById("location-close");
const locationSummary = document.getElementById("location-summary");
const VISUAL_LAYER_NAMES = new Set([
  "Bottom Ground",
  "Exterior Ground",
  "Exterior Decoration L1",
  "Exterior Decoration L2",
  "Interior Ground",
  "Wall",
  "Interior Furniture L1",
  "Interior Furniture L2 ",
  "Foreground L1",
  "Foreground L2"
]);

let mapCamera;
let tilemap;
let locationMetadata;
let locationLayers;
let renderedLayers = [];
let locationEntries = [];
let selectedLocation;
let isDragging = false;
let dragPosition;
let lastHoveredTile = null;
let loadFailed = false;

const config = {
  type: Phaser.AUTO,
  parent: "game-container",
  width: 1200,
  height: 800,
  backgroundColor: "#202a35",
  pixelArt: true,
  antialias: false,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: {
    preload,
    create
  }
};

const game = new Phaser.Game(config);

function preload() {
  this.load.on("loaderror", (file) => {
    loadFailed = true;
    showError(`Could not load ${file.key}: ${file.src}`);
  });

  TILESETS.forEach(([key, path]) => {
    this.load.image(key, `${ASSET_ROOT}${path}`);
  });
  AGENT_NAMES.forEach((name) => {
    const filename = name.split(" ").map((word) =>
      word[0].toUpperCase() + word.slice(1)
    ).join("_");
    this.load.spritesheet(`agent:${name}`, `characters/${filename}.png`, {
      frameWidth: 32,
      frameHeight: 32
    });
  });
  this.load.tilemapTiledJSON("ville-map", MAP_URL);
  this.load.json("location-metadata", LOCATION_METADATA_URL);
  this.load.json("ui-state", UI_STATE_URL);
}

function create() {
  if (loadFailed) {
    return;
  }

  tilemap = this.make.tilemap({ key: "ville-map" });
  const agents = this.cache.json.get("ui-state");
  for (const [name, agent] of Object.entries(agents)) {
    const tile = agent?.tile;
    if (!tile || !Number.isInteger(tile.x) || !Number.isInteger(tile.y) ||
        tile.x < 0 || tile.y < 0 || tile.x >= tilemap.width || tile.y >= tilemap.height) {
      showError(`Invalid tile coordinates for ${name} in ui-state.json`);
      return;
    }
  }
  locationMetadata = this.cache.json.get("location-metadata");
  locationLayers = {
    sector: getMapLayerData("Sector Blocks"),
    arena: getMapLayerData("Arena Blocks"),
    object: getMapLayerData("Object Interaction Blocks")
  };

  const tilesets = tilemap.tilesets.map((tileset) => {
    const imageTileset = tilemap.addTilesetImage(tileset.name, tileset.name);
    if (!imageTileset) {
      throw new Error(`Could not connect tileset image "${tileset.name}"`);
    }
    return imageTileset;
  });

  renderedLayers = tilemap.layers.map((layerData) => {
    const layer = tilemap.createLayer(layerData.name, tilesets, 0, 0);
    if (!layer) {
      throw new Error(`Could not create map layer "${layerData.name}"`);
    }
    const isTechnical = !VISUAL_LAYER_NAMES.has(layerData.name);
    layer.setAlpha(isTechnical ? 0.6 : (layerData.opacity ?? 1));
    return {
      layer,
      layerData,
      isTechnical,
      overlayCheckbox: isTechnical ? createOverlayOption(layerData.name) : null
    };
  });
  updateLayerVisibility();

  Object.entries(agents).forEach(([name, { tile }]) => {
    this.add.sprite(
      (tile.x + 0.5) * tilemap.tileWidth,
      (tile.y + 0.5) * tilemap.tileHeight,
      `agent:${name}`,
      1
    ).setScale(1.25).setDepth(1000);
  });

  mapCamera = this.cameras.main;
  createLocationTree();
  fitMap();
  enableControls();
  setStatus(
    `Loaded ${tilemap.width} × ${tilemap.height} tiles · ${tilemap.layers.length} layers · ${tilemap.tilesets.length} tilesets`
  );

  this.input.on("pointerdown", (pointer) => {
    isDragging = true;
    gameContainer.classList.add("is-dragging");
    dragPosition = { x: pointer.x, y: pointer.y };
  });

  this.input.on("pointerup", (pointer) => {
    isDragging = false;
    gameContainer.classList.remove("is-dragging");
    updateHoverInfo(pointer);
  });

  this.input.on("pointermove", (pointer) => {
    if (isDragging && pointer.isDown) {
      mapCamera.scrollX -= (pointer.x - dragPosition.x) / mapCamera.zoom;
      mapCamera.scrollY -= (pointer.y - dragPosition.y) / mapCamera.zoom;
      dragPosition = { x: pointer.x, y: pointer.y };
    }
    updateHoverInfo(pointer);
  });

  this.input.on("gameout", () => {
    isDragging = false;
    gameContainer.classList.remove("is-dragging");
  });

  this.input.on("wheel", (_pointer, _objects, _deltaX, deltaY) => {
    setZoom(mapCamera.zoom * (deltaY > 0 ? 0.9 : 1.1));
  });

}

function getMapLayerData(name) {
  const layer = tilemap.layers.find((item) => item.name === name);
  if (!layer) {
    throw new Error(`Could not find map layer "${name}"`);
  }
  return layer.data;
}

function createLocationTree() {
  if (!Array.isArray(locationMetadata.locations)) {
    throw new Error("Location metadata does not contain a locations list");
  }

  locationTree.replaceChildren();
  locationEntries = locationMetadata.locations.map((sector) => {
    const sectorEntry = createLocationBranch(
      sector.name,
      sector.bounds,
      "sector-node",
      `${sector.arenas.length} ${sector.arenas.length === 1 ? "area" : "areas"}`
    );
    sectorEntry.arenas = sector.arenas.map((arena) => {
      const arenaEntry = createLocationBranch(
        arena.name,
        arena.bounds,
        "arena-node",
        arena.objects.length
          ? `${arena.objects.length} ${arena.objects.length === 1 ? "object" : "objects"}`
          : ""
      );
      arenaEntry.objects = arena.objects.map((object) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "location-object";
        button.textContent = object.name;
        button.title = object.name;
        button.addEventListener("click", () => {
          selectLocation(button, object.bounds);
        });
        arenaEntry.children.append(button);
        return { name: object.name, element: button };
      });
      sectorEntry.children.append(arenaEntry.details);
      return arenaEntry;
    });
    locationTree.append(sectorEntry.details);
    return sectorEntry;
  });
}

function createLocationBranch(name, bounds, className, count) {
  const details = document.createElement("details");
  details.className = `location-branch ${className}`;

  const summary = document.createElement("summary");
  summary.setAttribute("role", "treeitem");
  summary.title = name;

  const caret = document.createElement("span");
  caret.className = "tree-caret";
  caret.setAttribute("aria-hidden", "true");
  caret.textContent = "›";

  const label = document.createElement("span");
  label.className = "tree-name";
  label.textContent = name;

  summary.append(caret, label);
  if (count) {
    const countLabel = document.createElement("span");
    countLabel.className = "tree-count";
    countLabel.textContent = count;
    summary.append(countLabel);
  }
  summary.addEventListener("click", () => {
    selectLocation(summary, bounds);
  });

  const children = document.createElement("div");
  children.className = "tree-children";
  details.append(summary, children);
  return { name, bounds, details, summary, children, arenas: [], objects: [] };
}

function filterLocationTree() {
  const query = locationSearch.value.trim().toLocaleLowerCase();
  let visibleCount = 0;

  locationEntries.forEach((sector) => {
    const sectorMatches = sector.name.toLocaleLowerCase().includes(query);
    let sectorVisible = !query || sectorMatches;

    sector.arenas.forEach((arena) => {
      const arenaMatches = arena.name.toLocaleLowerCase().includes(query);
      const objectMatches = arena.objects.filter((object) =>
        object.name.toLocaleLowerCase().includes(query)
      );
      const arenaVisible = !query || sectorMatches || arenaMatches || objectMatches.length > 0;
      arena.details.hidden = !arenaVisible;
      sectorVisible = sectorVisible || arenaVisible;

      arena.objects.forEach((object) => {
        const objectVisible = !query || sectorMatches || arenaMatches ||
          object.name.toLocaleLowerCase().includes(query);
        object.element.hidden = !objectVisible;
      });

      if (query && (objectMatches.length > 0 || arenaMatches)) {
        sector.details.open = true;
        arena.details.open = true;
      }
    });

    sector.details.hidden = !sectorVisible;
    if (query && sectorMatches) {
      sector.details.open = true;
    }
  });

  visibleCount = locationEntries.filter((sector) => !sector.details.hidden).length;
  locationEmpty.hidden = visibleCount > 0;
  locationTree.hidden = visibleCount === 0;
}

function selectLocation(element, bounds) {
  if (selectedLocation) {
    selectedLocation.classList.remove("selected");
  }
  selectedLocation = element;
  selectedLocation.classList.add("selected");
  navigateToBounds(bounds);
}

function navigateToBounds(bounds) {
  if (!bounds || !mapCamera || !tilemap) {
    return;
  }

  const tileWidth = tilemap.tileWidth;
  const tileHeight = tilemap.tileHeight;
  const paddingTiles = 4;
  const targetWidth = (bounds.width + paddingTiles * 2) * tileWidth;
  const targetHeight = (bounds.height + paddingTiles * 2) * tileHeight;
  const zoom = Math.min(
    (mapCamera.width - 48) / targetWidth,
    (mapCamera.height - 48) / targetHeight
  );
  setZoom(zoom);
  mapCamera.centerOn(
    (bounds.x + bounds.width / 2) * tileWidth,
    (bounds.y + bounds.height / 2) * tileHeight
  );
}

function updateHoverInfo(pointer) {
  const worldPoint = mapCamera.getWorldPoint(pointer.x, pointer.y);
  const tileX = Math.floor(worldPoint.x / tilemap.tileWidth);
  const tileY = Math.floor(worldPoint.y / tilemap.tileHeight);
  if (tileX < 0 || tileY < 0 || tileX >= tilemap.width || tileY >= tilemap.height) {
    resetHoverInfo();
    return;
  }

  const tileKey = `${tileX},${tileY}`;
  if (tileKey === lastHoveredTile) {
    return;
  }
  lastHoveredTile = tileKey;

  const getName = (layer, lookup) => {
    const tile = layer[tileY][tileX];
    return lookup[String(tile.index)] || "—";
  };

  const sector = getName(locationLayers.sector, locationMetadata.sector);
  const arena = getName(locationLayers.arena, locationMetadata.arena);
  const object = getName(locationLayers.object, locationMetadata.object);
  document.getElementById("hover-tile").textContent = `${tileX + 1}, ${tileY + 1}`;
  document.getElementById("hover-sector").textContent = sector;
  document.getElementById("hover-arena").textContent = arena;
  document.getElementById("hover-object").textContent = object;
  const path = [sector, arena, object].filter((name) => name !== "—").join(" › ");
  locationSummary.textContent = path || "No named location";
  locationToggle.title = path || "No named location";
}

function resetHoverInfo() {
  lastHoveredTile = null;
  document.getElementById("hover-tile").textContent = "—";
  ["sector", "arena", "object"].forEach((field) => {
    document.getElementById(`hover-${field}`).textContent = "—";
  });
  locationSummary.textContent = "Move cursor over map";
  locationToggle.title = "Location details";
}

function enableControls() {
  document.getElementById("zoom-in").addEventListener("click", () => {
    setZoom(mapCamera.zoom * 1.25);
  });
  document.getElementById("zoom-out").addEventListener("click", () => {
    setZoom(mapCamera.zoom / 1.25);
  });
  document.getElementById("fit-map").addEventListener("click", fitMap);
  locationsToggle.addEventListener("click", () => {
    setPaneCollapsed("left", locationsSidebar, locationsToggle, "locations");
  });
  layersToggle.addEventListener("click", () => {
    setPaneCollapsed("right", layersSidebar, layersToggle, "layers");
  });
  enablePaneResizing(locationsResizer, "left", locationsSidebar, 190, 360);
  enablePaneResizing(layersResizer, "right", layersSidebar, 220, 420);
  locationToggle.addEventListener("click", () => {
    setLocationPanelOpen(locationPanel.hidden);
  });
  locationClose.addEventListener("click", () => {
    setLocationPanelOpen(false);
  });
  locationSearch.addEventListener("input", filterLocationTree);
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement !== locationSearch) {
      event.preventDefault();
      locationSearch.focus();
    }
  });
}

function enablePaneResizing(handle, side, pane, minimum, maximum) {
  const setWidth = (width) => {
    const availableMaximum = side === "left"
      ? workbench.clientWidth - 320
      : workbench.clientWidth * 0.45;
    const effectiveMaximum = Math.max(minimum, Math.min(maximum, availableMaximum));
    const boundedWidth = Phaser.Math.Clamp(width, minimum, effectiveMaximum);
    workbench.style.setProperty(`--${side}-pane-width`, `${boundedWidth}px`);
    handle.setAttribute("aria-valuenow", String(Math.round(boundedWidth)));
    handle.setAttribute("aria-valuetext", `${Math.round(boundedWidth)} pixels`);
  };

  const currentWidth = () => pane.getBoundingClientRect().width;
  setWidth(currentWidth());

  handle.addEventListener("pointerdown", (event) => {
    if (pane.classList.contains("is-collapsed")) {
      return;
    }

    event.preventDefault();
    handle.focus();
    const startX = event.clientX;
    const startWidth = currentWidth();
    const direction = side === "left" ? 1 : -1;
    handle.classList.add("is-resizing");
    handle.setPointerCapture(event.pointerId);

    const resize = (pointerEvent) => {
      setWidth(startWidth + (pointerEvent.clientX - startX) * direction);
    };
    const finish = (pointerEvent) => {
      handle.classList.remove("is-resizing");
      if (handle.hasPointerCapture(pointerEvent.pointerId)) {
        handle.releasePointerCapture(pointerEvent.pointerId);
      }
      handle.removeEventListener("pointermove", resize);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
    };

    handle.addEventListener("pointermove", resize);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  });

  handle.addEventListener("keydown", (event) => {
    const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (event.key === "Home") {
      event.preventDefault();
      setWidth(minimum);
    } else if (event.key === "End") {
      event.preventDefault();
      setWidth(maximum);
    } else if (direction) {
      event.preventDefault();
      setWidth(currentWidth() + direction * (side === "left" ? 1 : -1) * 10);
    }
  });
}

function setPaneCollapsed(side, pane, button, label) {
  const isCollapsed = !pane.classList.contains("is-collapsed");
  pane.classList.toggle("is-collapsed", isCollapsed);
  workbench.classList.toggle(`${side}-collapsed`, isCollapsed);

  const action = isCollapsed ? "Expand" : "Collapse";
  button.setAttribute("aria-label", `${action} ${label} pane`);
  button.setAttribute("title", `${action} ${label} pane`);
  button.setAttribute("aria-expanded", String(!isCollapsed));
}

function setLocationPanelOpen(isOpen) {
  locationPanel.hidden = !isOpen;
  const label = `${isOpen ? "Hide" : "Show"} location details`;
  locationToggle.setAttribute("aria-label", label);
  locationToggle.title = label;
  locationToggle.setAttribute("aria-expanded", String(isOpen));
}

function createOverlayOption(layerName) {
  const label = document.createElement("label");
  label.className = "overlay-option";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.setAttribute("aria-label", `Show ${layerName.trim()}`);
  checkbox.addEventListener("change", updateLayerVisibility);

  const name = document.createElement("span");
  name.textContent = layerName.trim();

  label.append(checkbox, name);
  overlayOptions.append(label);
  return checkbox;
}

function updateLayerVisibility() {
  renderedLayers.forEach(({ layer, layerData, isTechnical, overlayCheckbox }) => {
    const visible = isTechnical
      ? overlayCheckbox.checked
      : layerData.visible !== false;
    layer.setVisible(visible);
  });
}

function fitMap() {
  if (!mapCamera || !tilemap) {
    return;
  }

  const padding = 48;
  const zoom = Math.min(
    (mapCamera.width - padding) / tilemap.widthInPixels,
    (mapCamera.height - padding) / tilemap.heightInPixels
  );
  setZoom(zoom);
  mapCamera.centerOn(tilemap.widthInPixels / 2, tilemap.heightInPixels / 2);
}

function setZoom(zoom) {
  mapCamera.setZoom(Phaser.Math.Clamp(zoom, 0.05, 8));
}

function setStatus(message) {
  statusElement.textContent = message;
  statusElement.classList.remove("error");
  statusIndicator.classList.add("is-ready");
}

function showError(message) {
  statusElement.textContent = `Unable to load the map: ${message}`;
  statusElement.classList.add("error");
  statusIndicator.classList.remove("is-ready");
}
