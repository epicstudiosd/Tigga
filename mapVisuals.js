"use strict";

let baseVisualStr


var mapVisuals = {
	startTick() {
		// Update the base visual
		if (!baseVisualStr || (Game.time % 128 == 0 && Game.cpu.bucket > 1000 && Game.cpu.getUsed() < 100)) {
			global.inTickObject.mapVisual = Game.map.visual;
			baseVisualStr = Game.map.visual.export()
		}
	},

	get() {
		if (!global.inTickObject.mapVisual) {
			if (baseVisualStr) {
				global.inTickObject.mapVisual = Game.map.visual.import(baseVisualStr)
			}
			else {
				global.inTickObject.mapVisual = Game.map.visual
			}
		}
		return global.inTickObject.mapVisual;
	},

	clear() {
		Game.map.visual.clear()
	},

	endTick() {
	},
}

module.exports = mapVisuals;