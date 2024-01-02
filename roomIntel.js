"use strict";
let util = require('util');

const utf15 = require('./utf15');
const constants = require('constants');
const Codec = utf15.Codec;
const MAX_DEPTH = utf15.MAX_DEPTH;


var roomIntel = {
	// If this returns true we can formation path through the room.
	// I'm pretty sure something calls these with activeMissions set incorrectly.
	isTerrainNavigableByMask(roomName, mask, activeMissions) {
		Memory.rooms[roomName] = Memory.rooms[roomName] || {};
		let mem = Memory.rooms[roomName];
		mem.navigableByMask =  mem.navigableByMask || {};
		mem.navigationByMask = mem.navigationByMask || {};
		mem.blockedEntrances = mem.blockedEntrances || {};

		// Might be the randomly selected exit is not navigable but another may be, so randomize again from time to time. Don't do that if we have a mission active though.
		if (mem.navigableByMask[JSON.stringify(mask)] !== undefined &&
			mem.navigationByMask[JSON.stringify(mask)] !== undefined &&
			mem.blockedEntrances[JSON.stringify(mask)] !== undefined &&
			(Math.random() > 0.001 || activeMissions)) {
			return mem.navigableByMask[JSON.stringify(mask)];
		}
		else {
			return this.calcNavigableByMask(roomName, mask, activeMissions);
		}
	},

	calcNavigableByMask(roomName, mask, activeMissions) {
		Memory.rooms[roomName] = Memory.rooms[roomName] || {};
		let mem = Memory.rooms[roomName];
		mem.navigableByMask =  mem.navigableByMask || {};
		mem.navigationByMask = mem.navigationByMask || {};
		mem.blockedEntrances = mem.blockedEntrances || {};

		let roomTerrain = Game.map.getRoomTerrain(roomName)

		// Strategy: blur walls by mask->floodfill on one exit->check exits (post blur) are filled.
		var roomArray = []
		for (var i = 0; i < 50; i++) {
			roomArray[i] = roomArray[i] || [];
			for (var maskDir of mask) {
				var x = i + maskDir[0];
				for (var j = 0; j < 50; j++) {
					var y = j + maskDir[1];

					roomArray[i][j] = Math.max((roomArray[i][j] || 0), (roomTerrain.get(i, j) & TERRAIN_MASK_WALL) ? 1 : 0);
					if (x >= 0 && x <= 49 && y >= 0 && y <= 49) {
						roomArray[i][j] = Math.max(roomArray[i][j], (roomTerrain.get(x, y) & TERRAIN_MASK_WALL) ? 1 : 0);
					}
				}
			}
		}

		var exitPointX;
		var exitPointY;

		function f1() {
			for (let i = 0; i < 50; i++) {
				if (roomArray[i][0] == 0) {
					return [i, 0];
				}
			}
			return undefined;
		}
		function f2() {
			for (let i = 0; i < 50; i++) {
				if (roomArray[i][49] == 0) {
					return [i, 49];
				}
			}
			return undefined;
		}
		function f3() {
			for (let i = 0; i < 50; i++) {
				if (roomArray[0][i] == 0) {
					return [0, i];
				}
			}
			return undefined;
		}
		function f4() {
			for (let i = 0; i < 50; i++) {
				if (roomArray[49][i] == 0) {
					return [49, i];
				}
			}
			return undefined;
		}

		let funcs = _.shuffle([f1, f2, f3, f4]);

		for (let func of funcs) {
			let res = func();
			if (res) {
				exitPointX = res[0];
				exitPointY = res[1];
				break;
			}
		}

		if (!exitPointX && !exitPointY) {
			mem.navigableByMask[JSON.stringify(mask)] = 0;
			mem.blockedEntrances[JSON.stringify(mask)] = [1, 1, 1, 1, 1, 1, 1, 1, 1];
			return mem.navigableByMask[JSON.stringify(mask)];
		}


		function floodFill(_floodArray, _roomArray, i, j) {
			if (_floodArray[i][j] == 0 && _roomArray[i][j] == 0) {
				_floodArray[i][j] = 1
				if (i - 1 >= 0)  floodFill(_floodArray, _roomArray, i-1, j);
				if (i + 1 <= 49) floodFill(_floodArray, _roomArray, i+1, j);
				if (j - 1 >= 0)  floodFill(_floodArray, _roomArray, i, j-1);
				if (j + 1 <= 49) floodFill(_floodArray, _roomArray, i, j+1);

				if (i - 1 >= 0 && j - 1 >= 0)  floodFill(_floodArray, _roomArray, i-1, j-1);
				if (i + 1 <= 49 && j - 1 >= 0) floodFill(_floodArray, _roomArray, i+1, j-1);
				if (i - 1 >= 0 && j + 1 <= 49)  floodFill(_floodArray, _roomArray, i-1, j+1);
				if (i + 1 <= 49 && j + 1 <= 49) floodFill(_floodArray, _roomArray, i+1, j+1);
			}
		}

		let floodArray = [];
		for (var i = 0; i < 50; i++) {
			floodArray[i] = floodArray[i] || [];
			for (var j = 0; j < 50; j++) {
				floodArray[i][j] = 0;
			}
		}

		floodFill(floodArray, roomArray, exitPointX, exitPointY);

		/*if (roomName == "W19S27" && mask.length == 4 && mask[1][0] == -1) {
			var vis = new RoomVisual(roomName);
			for (var i = 0; i < 50; i++) {
				for (var j = 0; j < 50; j++) {
					// Game.rooms[roomName].visual.text(distanceArray[i][j].toString(), i, j)
					vis.text(floodArray[i][j].toString(), i, j)
				}
			}
		}*/

		let blockedTop = 0;
		let blockedBottom = 0;
		let blockedLeft = 0;
		let blockedRight = 0;

		var fail = false;
		for (var i = 0; i < 50; i++) {
			if (roomArray[i][0] == 0 && floodArray[i][0] != 1) {
				fail = true;
				blockedTop = 1;
			}
			if (roomArray[i][49] == 0 && floodArray[i][49] != 1) {
				fail = true;
				blockedBottom = 1;
			}
			if (roomArray[0][i] == 0 && floodArray[0][i] != 1) {
				fail = true;
				blockedLeft = 1;
			}
			if (roomArray[49][i] == 0 && floodArray[49][i] != 1) {
				fail = true;
				blockedRight = 1;
			}
		}

		mem.navigableByMask[JSON.stringify(mask)] = fail ? 1 : 2;
		mem.blockedEntrances[JSON.stringify(mask)] = [1, blockedTop, 1, blockedRight, 1, blockedBottom, 1, blockedLeft, 1];

		if (Game.shard.name != "AppleCrumble") {
			mem.navigationByMask[JSON.stringify(mask)] = [];
			for (var i = 0; i < 50; i++) {
				const depth = 1;
				const codec = new Codec({ depth, array:1 });
				mem.navigationByMask[JSON.stringify(mask)][i] = codec.encode(floodArray[i]);
			}
		}
		else {
			mem.navigationByMask[JSON.stringify(mask)] = floodArray
		}

		return mem.navigableByMask[JSON.stringify(mask)];
	},


	isSKRoomNavigable(roomName) {
		let roomTerrain = Game.map.getRoomTerrain(roomName)

		var roomArray = []
		for (var i = 0; i < 50; i++) {
			roomArray[i] = roomArray[i] || [];
			for (var j = 0; j < 50; j++) {
				roomArray[i][j] = (roomTerrain.get(i, j) & TERRAIN_MASK_WALL) ? 1 : 0;
			}
		}

		const skRange = constants.SK_DANGER_RANGE + 1;

		for (let i = -skRange; i <= skRange; i++) {
			for (let j = -skRange; j <= skRange; j++) {
				for (let lairIdx in (Memory.rooms[roomName].skLairsX || [])) {
					let x = Memory.rooms[roomName].skLairsX[lairIdx] + i;
					let y = Memory.rooms[roomName].skLairsY[lairIdx] + j;
					if (x >= 0 && x <= 49 && y >= 0 && y <= 49) {
						roomArray[x][y] = 1;
					}
				}
				for (var sourceIdx = 0; sourceIdx < roomIntel.getNumSources(roomName); sourceIdx++) {
					let x = roomIntel.getSourceX(roomName, sourceIdx) + i;
					let y = roomIntel.getSourceY(roomName, sourceIdx) + j;
					if (x >= 0 && x <= 49 && y >= 0 && y <= 49) {
						roomArray[x][y] = 1;
					}
				}
				let mX = this.getMineralX(roomName)
				let mY = this.getMineralY(roomName)

				let x = mX + i;
				let y = mY + j;
				if (x >= 0 && x <= 49 && y >= 0 && y <= 49) {
					roomArray[x][y] = 1;
				}
			}
		}



		function floodFill(_floodArray, _roomArray, i, j) {
			if (_floodArray[i][j] == 0 && _roomArray[i][j] == 0) {
				_floodArray[i][j] = 1
				if (i - 1 >= 0)  floodFill(_floodArray, _roomArray, i-1, j);
				if (i + 1 <= 49) floodFill(_floodArray, _roomArray, i+1, j);
				if (j - 1 >= 0)  floodFill(_floodArray, _roomArray, i, j-1);
				if (j + 1 <= 49) floodFill(_floodArray, _roomArray, i, j+1);

				if (i - 1 >= 0 && j - 1 >= 0)  floodFill(_floodArray, _roomArray, i-1, j-1);
				if (i + 1 <= 49 && j - 1 >= 0) floodFill(_floodArray, _roomArray, i+1, j-1);
				if (i - 1 >= 0 && j + 1 <= 49)  floodFill(_floodArray, _roomArray, i-1, j+1);
				if (i + 1 <= 49 && j + 1 <= 49) floodFill(_floodArray, _roomArray, i+1, j+1);
			}
		}

		let floodArray = [];
		for (let i = 0; i < 50; i++) {
			floodArray[i] = floodArray[i] || [];
			for (let j = 0; j < 50; j++) {
				floodArray[i][j] = 0;
			}
		}

		// Pick one edge and flood from it.
		for (let i = 0; i < 50; i++) {
			if (roomArray[i][0] == 0 && floodArray[i][0] == 0) {
				floodFill(floodArray, roomArray, i, 0);
			}
		}

		// var vis = new RoomVisual(roomName)
		// for (var i = 0; i < 50; i++) {
		// 	for (var j = 0; j < 50; j++) {
		// 		vis.text(floodArray[i][j], i, j, {font: 0.5})
		// 	}
		// }

		var passTop = false;
		var passRight = false;
		var passBottom = false;
		var passLeft = false;
		// Exits that have found the 1.
		for (var i = 0; i < 50; i++) {
			if (roomArray[i][0] == 0 && floodArray[i][0] == 1) {
				passTop = true;
			}
			if (roomArray[i][49] == 0 && floodArray[i][49] == 1) {
				passBottom = true;
			}
			if (roomArray[0][i] == 0 && floodArray[0][i] == 1) {
				passLeft = true;
			}
			if (roomArray[49][i] == 0 && floodArray[49][i] == 1) {
				passRight = true;
			}
		}

		let pass = passTop && passRight && passBottom && passLeft;

		return pass ? 1 : 0;
	},

	getEnemyRoomMap(roomName) {
		if (Memory.rooms[roomName].floodFill) {
			return Memory.rooms[roomName].floodFill;
		}
		else if (!Memory.rooms[roomName].floodFill && Memory.rooms[roomName].compressedFloodFill) {
			global.enemyRoomMaps = global.enemyRoomMaps || {};
			if (global.enemyRoomMaps[roomName]) {
				return global.enemyRoomMaps[roomName];
			}

			if (global.wasm_module && global.wasm_module.lzw_decode) {
				Memory.rooms[roomName].floodFill = JSON.parse(global.wasm_module.lzw_decode(Memory.rooms[roomName].compressedFloodFill))
				global.enemyRoomMaps[roomName] = _.clone(Memory.rooms[roomName].floodFill);
			}

			return Memory.rooms[roomName].floodFill;
		}
	},


	compressEnemyRoomMap(roomName) {
		if (Memory.rooms[roomName].floodFill && Game.shard.name != "AppleCrumble") {
			global.enemyRoomMaps = global.enemyRoomMaps || {};
			global.enemyRoomMaps[roomName] = _.clone(Memory.rooms[roomName].floodFill);

			if (global.wasm_module && global.wasm_module.lzw_encode) {
				Memory.rooms[roomName].compressedFloodFill = global.wasm_module.lzw_encode(JSON.stringify(Memory.rooms[roomName].floodFill))
				delete Memory.rooms[roomName].floodFill
			}
		}
	},

	getNibblerPositionsWithVisibility(roomName, mask, maskShape, returnFirst) {
		global.roomPossiblePositions = global.roomPossiblePositions || {}
		global.roomPossiblePositions[roomName] = global.roomPossiblePositions[roomName] || {}

		let stringMask = JSON.stringify(mask);

		if (global.roomPossiblePositions[roomName][stringMask] && Math.random() > 0.1) {
			return global.roomPossiblePositions[roomName][stringMask]
		}

		let mem = Memory.rooms[roomName];

		if (!mem.navigationByMask) {
			this.calcNavigableByMask(roomName, mask, true);
		}

		if (!this.isTerrainNavigableByMask(roomName, mask, true)) {
			return []
		}

		let maskNavigation = mem.navigationByMask[stringMask];

		let roomMap = roomIntel.getEnemyRoomMap(roomName);

		const depth = 1;
		const codec = new Codec({ depth, array:1 });

		function checkPos(x, y, mask) {
			if (x <= 0 || x >= 49 || y <= 0 || y >= 49) return false;

			let zone = parseInt(roomMap[x][y])

			// if (x == 27 && y == 42) console.log(zone)

			// Interior position.
			if (zone < 4) return false;

			// if (x == 27 && y == 42) console.log(codec.decode(maskNavigation[x])[y])

			// Unpathable
			if (codec.decode(maskNavigation[x])[y] == 0) return false;

			let neighbourRampartCount = 0;
			// Must be the same zone and within the map
			for (let offset of mask) {
				// if (x == 27 && y == 42) console.log(x + offset[0], y + offset[1])
				if (x + offset[0] <= 0 || x + offset[0] >= 49 || y + offset[1] <= 0 || y + offset[1] >= 49) return false;
				// Can this ever be false?
				// if (x == 27 && y == 42) console.log(parseInt(roomMap[x + offset[0]][y + offset[1]]))
				if (parseInt(roomMap[x + offset[0]][y + offset[1]]) != zone) return false;

				for (let i = x-1; i <= x+1; i++) {
					for (let j = y-1; j <= y+1; j++) {
						let pos = new RoomPosition(i + offset[0], j + offset[1], roomName);
						let structs = pos.lookFor(LOOK_STRUCTURES);

						for (let struct of structs) {
							if (struct.structureType == STRUCTURE_RAMPART) {
								neighbourRampartCount++
								break;
							}
						}
						// if (x == 27 && y == 42) console.log(neighbourRampartCount)
						if (neighbourRampartCount >= 2) return false;
					}
				}
			}

			// console.log("checkPos " + x + " " + y + " " + JSON.stringify(mask) + "passed")
			// Game.notify("checkPos " + x + " " + y + " " + JSON.stringify(mask) + "passed")

			return true;
		}

		let possiblePositions = [];
		let markedBuildings = mem.markedBuildings;

		for (let markedBuilding in markedBuildings) {
			let building = Game.getObjectById(markedBuilding);
			if (!building) continue;
			if (markedBuildings[markedBuilding].c < 100 || Game.time - markedBuildings[markedBuilding].t > 10000) continue;

			let x = building.pos.x;
			let y = building.pos.y;

			let zones = [];

			// Position has to be the edge of a graph. That means I need at least two different "non-boundary-wall" zones around it
			for (let i = x-1; i <= x+1; i++) {
				for (let j = y-1; j <= y+1; j++) {
					let zone = parseInt(roomMap[i][j])
					if (zone != 3 && !zones.includes(zone)) {
						zones.push(zone);
						if (zones.length >= 2) {
							break;
						}
					}
				}
			}

			// console.log(building, zones, maskShape)

			if (zones.length < 2) continue;

			// console.log(building, zones, maskShape)

			// I don't know how to do this generally.
			// The T has 8 contant points. The 2x2 has more.
			if (maskShape == constants.MASK_SHAPE_2x2) {
				if (checkPos(x - 2, y + 1, mask)) {
					possiblePositions.push({x: x-2, y: y+1, b: building.id, d: markedBuildings[markedBuilding]})
					if (returnFirst) return possiblePositions
				}
				if (checkPos(x - 2, y - 2, mask)) {
					possiblePositions.push({x: x-2, y: y-2, b: building.id, d: markedBuildings[markedBuilding]})
					if (returnFirst) return possiblePositions
				}
				if (checkPos(x + 1, y - 2, mask)) {
					possiblePositions.push({x: x+1, y: y-2, b: building.id, d: markedBuildings[markedBuilding]})
					if (returnFirst) return possiblePositions
				}
				if (checkPos(x + 1, y + 1, mask)) {
					possiblePositions.push({x: x+1, y: y+1, b: building.id, d: markedBuildings[markedBuilding]})
					if (returnFirst) return possiblePositions
				}
			}
			else if (maskShape == constants.MASK_SHAPE_TT || maskShape == constants.MASK_SHAPE_TR || maskShape == constants.MASK_SHAPE_TB || maskShape == constants.MASK_SHAPE_TL || maskShape == constants.MASK_SHAPE_X) {
				for (let i = -1; i <= 1; i++) {
					for (let j = -1; j <= 1; j++) {
						if (i == 0 && j == 0) continue;
						// if (x > 20 && y > 35) {
						// 	console.log(x + i, y + j, checkPos(x + i, y + j, mask))
						// }
						if (checkPos(x + i, y + j, mask)) {
							possiblePositions.push({x: x+i, y: y+j, b: building.id, d: markedBuildings[markedBuilding]})
							if (returnFirst) return possiblePositions
						}
					}
				}
			}
		}

		global.roomPossiblePositions[roomName][stringMask] = possiblePositions;

		return possiblePositions;
	},


	getNumSources: function(roomName) {
		if (Memory.rooms[roomName]) {
			if (!Memory.rooms[roomName].sP) return 0
			return Math.round(Memory.rooms[roomName].sP.length / 4);
		}
	},


	getEffectiveNumSources: function(roomName) {
		let numSources = this.getNumSources(roomName)

		if (Memory.season3 && numSources == 1) {
			return 2
		}
		return numSources
	},

	getSourceX: function(roomName, idx) {
		if (Memory.rooms[roomName]) {
			return parseInt(Math.round(Memory.rooms[roomName].sP.substr(idx*4, 2)));
		}
	},

	getSourceY: function(roomName, idx) {
		if (Memory.rooms[roomName]) {
			return parseInt(Math.round(Memory.rooms[roomName].sP.substr(idx*4 + 2, 2)));
		}
	},

	getSourceTiles: function(roomName, idx) {
		if (Memory.rooms[roomName] && Memory.rooms[roomName].sT) {
			return parseInt(Math.round(Memory.rooms[roomName].sT.substr(idx, 1)));
		}
	},

	getControllerX: function(roomName) {
		if (Memory.rooms[roomName]) {
			return parseInt(Math.round(Memory.rooms[roomName].cP.substr(0, 2)));
		}
	},

	getControllerY: function(roomName) {
		if (Memory.rooms[roomName]) {
			return parseInt(Math.round(Memory.rooms[roomName].cP.substr(2, 2)));
		}
	},

	getMineralX: function(roomName) {
		if (Memory.rooms[roomName] && Memory.rooms[roomName].m) {
			return parseInt(Math.round(Memory.rooms[roomName].m.substr(0, 2)));
		}
		return 25;
	},

	getMineralY: function(roomName) {
		if (Memory.rooms[roomName] && Memory.rooms[roomName].m) {
			return parseInt(Math.round(Memory.rooms[roomName].m.substr(2, 2)));
		}
		return 25;
	},

	getMineralType: function(roomName) {
		if (Memory.rooms[roomName] && Memory.rooms[roomName].m) {
			return Memory.rooms[roomName].m.substr(4, 1);
		}
		return ""
	},

	getSwampRatio: function(roomName) {
		global.roomsRatios = global.roomsRatios || {};

		if (global.roomsRatios[roomName] === undefined) {
			global.roomsRatios[roomName] = global.roomsRatios[roomName] || {}

			let sR = 0;
			let wR = 0;

			let roomTerrain = Game.map.getRoomTerrain(roomName);

			for (var i = 1; i < 49; i++) {
				for (var j = 1; j < 49; j++) {
					let terrain = roomTerrain.get(i, j);
					if 		(terrain & TERRAIN_MASK_WALL)  wR += 1;
					else if (terrain & TERRAIN_MASK_SWAMP) sR += 1;
				}
			}

			global.roomsRatios[roomName].wR = (wR / (48 * 48));
			global.roomsRatios[roomName].sR = (sR / (48 * 48));
		}
		
		return global.roomsRatios[roomName].sR
		// return Memory.rooms[roomName].sR
	},	

	getWallRatio: function(roomName) {
		global.roomsRatios = global.roomsRatios || {};

		if (global.roomsRatios[roomName] === undefined) {
			global.roomsRatios[roomName] = global.roomsRatios[roomName] || {}

			let sR = 0;
			let wR = 0;

			let roomTerrain = Game.map.getRoomTerrain(roomName);

			for (var i = 1; i < 49; i++) {
				for (var j = 1; j < 49; j++) {
					let terrain = roomTerrain.get(i, j);
					if 		(terrain & TERRAIN_MASK_WALL)  wR += 1;
					else if (terrain & TERRAIN_MASK_SWAMP) sR += 1;
				}
			}

			global.roomsRatios[roomName].wR = (wR / (48 * 48));
			global.roomsRatios[roomName].sR = (sR / (48 * 48));
		}

		return global.roomsRatios[roomName].wR
		// return Memory.rooms[roomName].wR
	},


	getRealSwampRatio: function(roomName) {
		return this.getSwampRatio(roomName) / (1 - this.getWallRatio(roomName))
	},	


	getBoundaryWallScores(roomName) {
		let rm = Memory.rooms[roomName]
		if (!rm.boundaryWallScores || !global.wasm_module.lzw_decode) {
			return []
		}

		global.roomBoundaryWallScores = global.roomBoundaryWallScores || {};
		if (!global.roomBoundaryWallScores[roomName]) {
			global.roomBoundaryWallScores[roomName] = JSON.parse(global.wasm_module.lzw_decode(rm.boundaryWallScores));
		}

		return global.roomBoundaryWallScores[roomName];
	},
};

module.exports = roomIntel;