"use strict";

var util = require('util');
var constants = require('constants');
const segments = require('segments');
var roomIntel = require('roomIntel');
var intelAI = require('intelAI');

const customCostMatrix = require('customCostMatrix');


// Rampart strategies
const RAMPART_BUNKER = -1;
const RAMPART_BUNKER_SIMPLE_FUSION = -1;
const RAMPART_BUNKER_COMPLEX_FUSION = -1;

// Build a graph connecting islands.
const RAMPART_BOTTLENECK_GRAPH = 0;

const NUM_RAMPART_STRATEGIES = 1;

const NUM_DESIGN_STAGES = 5;

global.ROOM_DESIGN_NUM_STAGES = NUM_DESIGN_STAGES;


function buildRoads(room, pathPlan, maxSites, targetPos, skipContainer = false, ownRoomContainer = false) {
	let builtRoads = 0;

	let path = pathPlan.path;

	for (var pos of path) {
		if (Game.rooms[pos.roomName]) {
			if (Game.rooms[pos.roomName].controller && Game.rooms[pos.roomName].controller.owner && Game.rooms[pos.roomName].controller.owner.username != util.getMyName()) {
				continue
			}
			if (!room.buildRooms.includes(pos.roomName)) {
				room.buildRooms.push(pos.roomName);
			}
			if (Game.rooms[pos.roomName].find(FIND_MY_CONSTRUCTION_SITES).length >= 10) {
				break;
			}
			// Ignore the last one
			if (pos != path[path.length - 1]) {
				if (pos.x == 0 || pos.x == 49 || pos.y == 0 || pos.y == 49) {
					continue
				}
				if (Game.rooms[pos.roomName].createConstructionSite(pos.x, pos.y, STRUCTURE_ROAD) == OK) {
					builtRoads += 1;
					if (builtRoads >= maxSites) {
						break;
					}
				}
				else if (Game.rooms[pos.roomName].lookForAt(LOOK_CONSTRUCTION_SITES, pos.x, pos.y).length) {
					builtRoads += 1;
					if (builtRoads >= maxSites) {
						break;
					}
				}
			}
			// Takes a bit of a hit to energy income when I make these. Make sure we have a bit stored up
			else if (!skipContainer && room.effectiveLevel >= 4 && room.storage && room.storage.store[RESOURCE_ENERGY] > 20000 && (ownRoomContainer || !Game.rooms[pos.roomName].isMyRoom())) {
				var hasContainer = false;
				for (var i = -1; i <= 1; i++) {
					for (var j = -1; j <= 1; j++) {
						if (targetPos.x + i < 0 || targetPos.x + i > 49 || targetPos.y + j < 0 || targetPos.y + j > 49) continue
						// Assume it has one for now
						if (!Game.rooms[targetPos.roomName]) {
							hasContainer = true;
							break
						}
						var structs = Game.rooms[targetPos.roomName].lookForAt(LOOK_STRUCTURES, targetPos.x + i, targetPos.y + j);
						for (var struct of structs) {
							if (struct.structureType == STRUCTURE_CONTAINER) {
								hasContainer = true;
								break;
							}
						}
						if (!hasContainer) {							
							var sites = Game.rooms[targetPos.roomName].lookForAt(LOOK_CONSTRUCTION_SITES, targetPos.x + i, targetPos.y + j);
							for (var site of sites) {
								if (site.my && site.structureType == STRUCTURE_CONTAINER) {
									hasContainer = true;
									break;
								}
							}
						}
						if (hasContainer) {
							break;
						}
					}
					if (hasContainer) {
						break;
					}
				}
				if (!hasContainer) {
					Game.rooms[pos.roomName].createConstructionSite(pos.x, pos.y, STRUCTURE_CONTAINER);
				}
			}
		}
	}

	return builtRoads;
}

var roomDesignAI = {
	lockCostMatrix : function(roomName) {
		roomDesignAI.costMatrices = roomDesignAI.costMatrices || {}
		roomDesignAI.costMatrices[roomName] = null;
		roomDesignAI.costMatrixLocked[roomName] = true;
	},

	unlockCostMatrix : function(roomName) {
		roomDesignAI.costMatrixLocked[roomName] = false;
	},

	setCostMatrix : function(costMatrix, roomName) {
		roomDesignAI.costMatrices = roomDesignAI.costMatrices || {}
		roomDesignAI.costMatrices[roomName] = costMatrix;
	},

	getCostMatrix : function(roomName) {
		if (roomDesignAI.costMatrixLocked && roomDesignAI.costMatrixLocked[roomName] && roomDesignAI.costMatrices[roomName]) {
			return roomDesignAI.costMatrices[roomName];
		}
		return undefined
	},

	getDesignRoadPath : function(fromPos, toPos, targetRange, terrain, expensiveSwamps, noTunnels, ignoreChar) {
		let existingRoadCost_ = 8;
		let tunnelCost = noTunnels ? 0xFF : 180; // Hmm. 20x plains
		let plainCost = 9;
		let swampCost = expensiveSwamps ? 20 : 10;

		let path = PathFinder.search(fromPos, {pos: toPos, range: targetRange}, {
			plainCost: plainCost,
			swampCost: swampCost,
			maxOps: fromPos.roomName == toPos.roomName ? 8000 : 50000,
			roomCallback: function(roomName) {
				// Oh man, I should cache these!!!

				// if (coords.x >= 4 && coords.x <= 6 && coords.y >= 4 && coords.y <= 6 && !(toCoords.x >= 4 && toCoords.x <= 6 && toCoords.y >= 4 && toCoords.y <= 6)) {
				// 	return false;
				// }
				// Terrain is set for room design. Not set for rebuilding remote roads
				global.inTickObject.roadDesignCMs = global.inTickObject.roadDesignCMs || {}
				if (global.inTickObject.roadDesignCMs[roomName] !== undefined && !terrain && !noTunnels) {
					return global.inTickObject.roadDesignCMs[roomName]
				}

				// If we're doing roads I'd really hope we have it in memory if it's a stronghold.
				// Ideally we'd use the includes but perf is worse. Maybe need strongholdRoomSet.
				if (roomName != toPos.roomName && roomName != fromPos.roomName && (intelAI.getEnemyRoomSet().has(roomName) || (Memory.rooms[roomName] && Memory.rooms[roomName].invCL))) {
				// if (intelAI.getEnemyRoomSet().has(roomName) || Memory.strongholdRooms.includes(roomName)) {
					if (!terrain) global.inTickObject.roadDesignCMs[roomName] = false;
					return false;
				}



				let toCoords = util.getSectorCoords(toPos.roomName);
				var coords = util.getSectorCoords(roomName);


				let roomTerrain = Game.map.getRoomTerrain(roomName)


				let room = Game.rooms[roomName];

				let existingRoadCost
				// if (room && room.memory.designed == 4 && roomName == "W4S47") {
				// 	existingRoadCost = existingRoadCost_ - 6;
				// }
				// else {
					existingRoadCost = existingRoadCost_;
				// }

				// var costs = new PathFinder.CostMatrix;
				var costs;

				if (roomName == fromPos.roomName && terrain) {
					costs = roomDesignAI.getCostMatrix(roomName);
					if (!costs) {
						console.log("new CM", roomName)
						costs = new PathFinder.CostMatrix()
						for (let i = 0; i < 50; i++) {
							for (let j = 0; j < 50; j++) {
								if (terrain[i][j] == "r") {
									costs.set(i, j, existingRoadCost);
								}
								else if (terrain[i][j] == "b") {
									costs.set(i, j, 255);
								}
								else if (terrain[i][j] == "d") {
									costs.set(i, j, 250);
								}
								else if (terrain[i][j] == "k") {
									costs.set(i, j, 90);
								}
								else if (terrain[i][j] == "s") {
									costs.set(i, j, 60);
								}
								else if (terrain[i][j] == "m") {
									costs.set(i, j, 30);
								}
								else if (terrain[i][j] == "c") {
									costs.set(i, j, 60);
								}
							}
						}
						// Don't walk through the storage battery chap
						if (Memory.rooms[roomName].storageBatteryX) {
							costs.set(Memory.rooms[roomName].storageBatteryX, Memory.rooms[roomName].storageBatteryY, 255)
						}

						roomDesignAI.setCostMatrix(costs, roomName);
					}
				}
				else if (room) {
					costs = new customCostMatrix();
					room.find2(FIND_STRUCTURES).forEach(function(structure) {
						if (structure.structureType === STRUCTURE_ROAD) {
							if (room.memory.designed == NUM_DESIGN_STAGES && room.memory.ID !== undefined) {
								// Favor roads over plain tiles
								let segementData = segments.loadSegmentData(50 + room.memory.ID % 45);
								if (segementData) {
									let floodedDesign = segementData[roomName].floodedDesign;
									if (parseInt(floodedDesign[structure.pos.x][structure.pos.y]) !== 0) {
										costs.set(structure.pos.x, structure.pos.y, existingRoadCost - 6);
									}
									else {
										costs.set(structure.pos.x, structure.pos.y, existingRoadCost);
									}
								}
								else {
									costs.set(structure.pos.x, structure.pos.y, existingRoadCost);
								}
							}
							else {
								costs.set(structure.pos.x, structure.pos.y, existingRoadCost);
							}
						}
						else if (structure.structureType == STRUCTURE_CONTAINER && !(structure.pos.roomName == toPos.roomName && structure.pos.getRangeTo(toPos) <= targetRange)) {
							// If there's a container, it's probably there for a reason? Build a road around it!
							costs.set(structure.pos.x, structure.pos.y, 250);
						}
						else if (structure.structureType !== STRUCTURE_CONTAINER &&
								(structure.structureType !== STRUCTURE_RAMPART || !structure.my)) {
							// Can't walk through non-walkable buildings
							costs.set(structure.pos.x, structure.pos.y, 255);
						}
					});

					room.find2(FIND_MY_CONSTRUCTION_SITES).forEach(function(site) {
						if (site.structureType != STRUCTURE_RAMPART && OBSTACLE_OBJECT_TYPES.includes(site.structureType)) {
							costs.set(site.pos.x, site.pos.y, 0xff);
						}
						else if (site.structureType == STRUCTURE_ROAD) {
							if (room.memory.designed == NUM_DESIGN_STAGES && room.memory.ID !== undefined) {
								// Favor roads over plain tiles
								let segementData = segments.loadSegmentData(50 + room.memory.ID % 45);
								if (segementData) {
									let floodedDesign = segementData[roomName].floodedDesign;
									if (parseInt(floodedDesign[site.pos.x][site.pos.y]) !== 0) {
										costs.set(site.pos.x, site.pos.y, existingRoadCost - 6);
									}
									else {
										costs.set(site.pos.x, site.pos.y, existingRoadCost);
									}
								}
								else {
									costs.set(site.pos.x, site.pos.y, existingRoadCost);
								}
							}
							else {
								costs.set(site.pos.x, site.pos.y, existingRoadCost);
							}
						}
					});

					room.find2(FIND_FLAGS).forEach(function(flag) {
						var splitResult = flag.name.split("_");

						if (OBSTACLE_OBJECT_TYPES.includes(splitResult[0])) {
							costs.set(flag.pos.x, flag.pos.y, 0xff);
						}
					});

					// This will be expensive the first time after a global reset and then cheap.

					(roomDesignAI.getBuildings(room.name) || []).forEach(function(building) {
						var splitResult = building.name.split("_");

						let x = building.x || building.pos.x;
						let y = building.y || building.pos.y;
						if (OBSTACLE_OBJECT_TYPES.includes(splitResult[0])) {
							costs.set(x, y, 0xff);
						}
						else if (splitResult[0] == STRUCTURE_ROAD) {
							if (room.memory.designed == NUM_DESIGN_STAGES && room.memory.ID !== undefined) {
								// Favor roads over plain tiles
								let segementData = segments.loadSegmentData(50 + room.memory.ID % 45);
								if (segementData) {
									let floodedDesign = segementData[roomName].floodedDesign;
									if (parseInt(floodedDesign[x][y]) !== 0) {
										costs.set(x, y, existingRoadCost - 6);
									}
									else {
										costs.set(x, y, existingRoadCost);
									}
								}
								else {
									costs.set(x, y, existingRoadCost);
								}
							}
							else {
								costs.set(x, y, existingRoadCost);
							}
						}
					});
				}
				else {
					costs = new customCostMatrix();
				}

				// Avoid the controller a bit or we keep bumping reservers
				if (Memory.rooms[roomName] && Memory.rooms[roomName].conX) {
					let conX = Memory.rooms[roomName].conX
					let conY = Memory.rooms[roomName].conY

					for (let i = -1; i <= 1; i++) {
						for (let j = -1; j <= 1; j++) {
							let x = conX + i;
							let y = conY + j;

							if (costs.get(x, y)) {
								costs.set(x, y, Math.min(255, costs.get(x, y) + 1));
								continue
							}
							if (roomTerrain.get(x, y) & TERRAIN_MASK_WALL) {
								continue
							}

							if (roomTerrain.get(x, y) & TERRAIN_MASK_SWAMP) {
								costs.set(x, y, Math.min(255, swampCost + 1));
							}
							else {
								costs.set(x, y, Math.min(255, plainCost + 1));	
							}
						}					
					}
				}

				if (toPos.roomName != roomName && 
					Memory.rooms[roomName] && (Memory.rooms[roomName].skLairsX || []).length > 0 && 
					!Memory.keeperHarvestRooms.includes(roomName)) {
					let mX = roomIntel.getMineralX(roomName)
					let mY = roomIntel.getMineralY(roomName)
					for (let i = -constants.SK_DANGER_RANGE; i <= constants.SK_DANGER_RANGE; i++) {
						for (let j = -constants.SK_DANGER_RANGE; j <= constants.SK_DANGER_RANGE; j++) {
							for (let lairIdx in Memory.rooms[roomName].skLairsX) {
								let x = Memory.rooms[roomName].skLairsX[lairIdx] + i;
								let y = Memory.rooms[roomName].skLairsY[lairIdx] + j;
								if (x >= 0 && x <= 49 && y >= 0 && y <= 49) {
									costs.set(x, y, 255);
								}
							}
							for (let srcIdx in roomIntel.getNumSources(roomName)) {
								let x = roomIntel.getSourceX(roomName, srcIdx) + i;
								let y = roomIntel.getSourceY(roomName, srcIdx) + j;
								if (x >= 0 && x <= 49 && y >= 0 && y <= 49) {
									costs.set(x, y, 255);
								}
							}

							let x = mX + i;
							let y = mY + j;
							if (x >= 0 && x <= 49 && y >= 0 && y <= 49) {
								costs.set(x, y, 255);
							}
						}
					}
				}

				if (!room || !room.controller || !room.controller.my) {
					for (let i = 1; i < 49; i++) {
						for (let j = 1; j < 49; j++) {
							if (roomTerrain.get(i, j) & TERRAIN_MASK_WALL) {
								if (toPos.getRangeTo(i, j) > targetRange + 1) {
									costs.set(i, j, Math.max(costs.get(i,j), tunnelCost))
								}
							}
						}
					}
				}
				else if (room && room.mem.designed == NUM_DESIGN_STAGES) {
					// console.log("W4S47")
					// Only allow tunnels between interior positions
					let segementData = segments.loadSegmentData(50 + room.memory.ID % 45);
					// console.log(segementData)
					if (segementData) {
						let floodedDesign = segementData[roomName].floodedDesign;
						for (let i = 2; i < 48; i++) {
							for (let j = 2; j < 48; j++) {
								let terrain = roomTerrain.get(i, j)
								if (terrain & TERRAIN_MASK_WALL) {
									let exterior = 0;
									for (let i2 = i - 1; i2 <= i + 1; i2++) {
										for (let j2 = j - 1; j2 <= j + 1; j2++) {
											if (!(roomTerrain.get(i2, j2) & TERRAIN_MASK_WALL)) {
												if (parseInt(floodedDesign[i2][j2]) === 0) {
													exterior = 1;
													break;
												}
											}
										}
									}
									if (!exterior) {
										if (toPos.getRangeTo(i, j) > targetRange + 1) {
											costs.set(i, j, Math.max(costs.get(i,j), tunnelCost == 0xFF ? 0xFF : Math.round(2 * tunnelCost / 5)))
										}
										else {
											costs.set(i, j, 0xFF)	
										}
									}
								}
								else if (parseInt(floodedDesign[i][j]) !== 0) {
									if (terrain & TERRAIN_MASK_SWAMP) {
										costs.set(i, j, Math.max(costs.get(i,j), Math.min(costs.get(i,j), swampCost - (expensiveSwamps ? 12 : 6))))
									}
									else {
										costs.set(i, j, Math.max(costs.get(i,j), Math.min(costs.get(i,j), plainCost - 6)))
									}
								}
							}
						}
					}
				}



				if (!terrain && !noTunnels) global.inTickObject.roadDesignCMs[roomName] = costs;

				// if (roomName == "W4S47") {
				// 	let vis = new RoomVisual(roomName);
				// 	for (let i = 2; i < 48; i++) {
				// 		for (let j = 2; j < 48; j++) {
				// 			vis.text(costs.get(i,j), i, j)
				// 		}
				// 	}
				// }

				return costs;
			}
		});

		if (noTunnels) {
			return path
		}

		let lastStep = path.path[path.path.length - 1]
		if (!lastStep) {
			console.log("No last step on path???")
			return path
		}
		let roomTerrain = Game.map.getRoomTerrain(lastStep.roomName)

		if (roomTerrain.get(lastStep.x, lastStep.y) & TERRAIN_MASK_WALL) {
			return this.getDesignRoadPath(fromPos, toPos, targetRange, terrain, expensiveSwamps, true, ignoreChar)
		}
		else {
			return path
		}
	},

	createBuilding(roomMemory, xPos, yPos, name) {
		if (xPos >= 1 && xPos <= 48 && yPos >= 1 && yPos <= 48) {
			roomMemory.buildings.push({x:xPos, y:yPos, name: name});
		}	
	},

	generateRoomMap(roomName, useFlags) {
		let roomMap = [];
		let roomMemory = Memory.rooms[roomName];

		let roomTerrain = Game.map.getRoomTerrain(roomName)

		for (var i = 0; i < 50; i++) {
			roomMap[i] = [];
			for (var j = 0; j < 50; j++) {
				if (i == 0 || i == 49 || j == 0 || j == 49) {
					roomMap[i][j] = "w";
				}
				else if (i < 2 || i > 47 || j < 2 || j > 47) {
					roomMap[i][j] = (roomTerrain.get(i, j) & TERRAIN_MASK_WALL) ? "w" : " ";

					for (var i2 = -1; i2 <= 1; i2++) {
						for (var j2 = -1; j2 <= 1; j2++) {
							if (i + i2 == 0 || i + i2 == 49 || j + j2 == 0 || j + j2 == 49) {
								if (!(roomTerrain.get(i + i2, j + j2) & TERRAIN_MASK_WALL)) {
									roomMap[i][j] = "w";
									break;
								}
							}
						}
					}
				}
				else {
					roomMap[i][j] = (roomTerrain.get(i, j) & TERRAIN_MASK_WALL) ? "w" : " ";
				}
			}
		}

		// Place exclusion zones around sources. No building within 2 tiles.
		for (var sourceIdx = 0; sourceIdx < roomIntel.getNumSources(roomName); sourceIdx++) {
			for (var i = -2; i <= 2; i++) {
				for (var j = -2; j <= 2; j++) {
					var xPos = roomIntel.getSourceX(roomName, sourceIdx) + i;
					var yPos = roomIntel.getSourceY(roomName, sourceIdx) + j;

					if (xPos >= 48 || xPos <= 1 || yPos >= 48 || yPos <= 1) continue;

					if (roomMap[xPos][yPos] != "w") roomMap[xPos][yPos] = "s"
				}
			}
		}

		// Place exclusion zone around resource. No building within 2 tiles.
		// console.log("Mineral exclusion zone disabled in room design")
		let mX = roomIntel.getMineralX(roomName)
		let mY = roomIntel.getMineralY(roomName)

		for (var i = -2; i <= 2; i++) {
			for (var j = -2; j <= 2; j++) {

				var xPos = mX + i;
				var yPos = mY + j;

				if (xPos >= 48 || xPos <= 1 || yPos >= 48 || yPos <= 1) continue;

				if (roomMap[xPos][yPos] != "w") {
					if (roomMap[xPos][yPos] == "s") {
						roomMap[xPos][yPos] = "k"
					}
				}
			}
		}

		// Place exclusion zone around controller. No building (except storage) within 2 tiles. Also do optional ramparts
		for (var i = -2; i <= 2; i++) {
			for (var j = -2; j <= 2; j++) {
				if (i == 0 && j == 0) continue;
				var xPos = roomMemory.conX + i;
				var yPos = roomMemory.conY + j;

				if (xPos >= 48 || xPos <= 1 || yPos >= 48 || yPos <= 1) continue;

				// Source and mineral are stronger
				if (roomMap[xPos][yPos] != "s" && roomMap[xPos][yPos] != "m" && roomMap[xPos][yPos] != "w") roomMap[xPos][yPos] = "c"
			}
		}

		if (useFlags) {
			let room = Game.rooms[roomName];

			let buildings = roomDesignAI.getBuildings(room.name);
			for (let building of buildings) {
				if (building.name.startsWith(STRUCTURE_ROAD)) {
					roomMap[building.x || building.pos.x][building.y || building.pos.y] = "r";
				}
				else if (building.name.includes(STRUCTURE_CONTAINER)) {
					roomMap[building.x || building.pos.x][building.y || building.pos.y] = "d";
				}
				else if (!building.name.startsWith(STRUCTURE_RAMPART)) {
					roomMap[building.x || building.pos.x][building.y || building.pos.y] = "b";
				}
			}
		}

		return roomMap;
	},

	// clearFailedDesign : function(roomName) {
	// 	let roomMemory = Memory.rooms[roomName];

	// 	delete roomMemory.ID
	// 	delete roomMemory.rampartDesignConfig
	// 	delete roomMemory.buildings
	// 	delete roomMemory.spawnBatteryCentreX
	// 	delete roomMemory.spawnBatteryCentreY
	// 	delete roomMemory.storageBatteryX
	// 	delete roomMemory.storageBatteryY
	// 	delete roomMemory.storageX
	// 	delete roomMemory.storageY
	// 	delete roomMemory.storageControllerLinkDist
	// 	delete roomMemory.harvestPointsX
	// 	delete roomMemory.harvestPointsY
	// 	delete roomMemory.extenstionStarsX
	// 	delete roomMemory.extenstionStarsY
	// 	delete roomMemory.meanExtensionStorageDist
	// },

	designRoom : function(roomName, force) {
		// if (Game.cpu.bucket < 1000) {
		// 	return
		// }

		var room = Game.rooms[roomName];

		Memory.rooms[roomName] = Memory.rooms[roomName] || {}
		let roomMemory = Memory.rooms[roomName];

		if (!roomMemory.conX || (room && room.controller && (room.controller.owner || !force) && !room.controller.my)) {
			return;
		}
		if (!room && roomMemory.designFailed !== undefined) {
			return;
		}

		if (roomMemory.clearRoomClaim) {
			if (room && !room.effectiveLevel && room.getAllHostileCreepsAndPowerCreeps().length == 0) {
				let cnt = 0;
				for (let wall of room.constructedWalls) {
					wall.destroy()
					cnt++;
				}
				for (let rampart of room.ramparts) {
					if (!rampart.my) {
						cnt++
						rampart.destroy()
					}
				}
				for (let road of room.roads) {
					cnt++
					road.destroy()
				}

				for (let container of room.containers) {
					cnt++
					container.destroy()
				}

				if (cnt == 0) {
					delete roomMemory.fullyConnected;
					delete roomMemory.iP;
					room.controller.unclaim();
				}
			}

			return;
		}


		roomDesignAI.costMatrixLocked = roomDesignAI.costMatrixLocked || {};

		if (Memory.rooms[roomName].redesignRamparts && roomMemory.designed == NUM_DESIGN_STAGES) {
			if (global.roomBuildings && global.roomBuildings[roomName]) {
				roomMemory.buildings = _.clone(global.roomBuildings[roomName]);
				delete global.roomBuildings[roomName]
				delete Memory.rooms[roomName].compressedBuildings
			}
			else if (Memory.rooms[roomName].compressedBuildings && Game.shard.name != "AppleCrumble") {
				if (global.wasm_module && global.wasm_module.lzw_decode) {
					Memory.rooms[roomName].buildings = JSON.parse(global.wasm_module.lzw_decode(Memory.rooms[roomName].compressedBuildings));
					delete global.roomBuildings[roomName]
					delete Memory.rooms[roomName].compressedBuildings
				}
			}
			else {
				return;
			}
			roomMemory.designed = 3;
		}

		if (roomMemory.designed == NUM_DESIGN_STAGES) {
			return
		}

		let segmentData;
		Memory.roomIDCount = Memory.roomIDCount || 0
		roomMemory.ID = roomMemory.ID || (Memory.roomIDCount++);

		let segmentID = 50 + roomMemory.ID % 45;
		let hasSegment = segmentID in RawMemory.segments;

		if (!hasSegment) {
			segments.forceSegmentActive(segmentID);
			if (room && roomMemory.designFailed === false) {
				return
			}
		}

		if (isNaN(segmentID)) {
			console.log("Room has nan id", room, room.memory.ID)
		}
		else {
			segmentData = segments.loadSegmentData(segmentID);
		}



		roomMemory.rampartDesignConfig = {};

		if (Memory.rooms[roomName].redesignRamparts === true) {
			// These matter a bit
			roomMemory.rampartDesignConfig.spawnStorageMod = 15 + (15 * (Math.random() + Math.random()));
			roomMemory.rampartDesignConfig.storageLabMod = 15 + (15 * (Math.random() + Math.random()));
			roomMemory.rampartDesignConfig.storageConMod = 20 + (10 * (Math.random() + Math.random()));
			roomMemory.rampartDesignConfig.spawnConMod = 20 + (10 * (Math.random() + Math.random()));
			roomMemory.rampartDesignConfig.srcStorageMod = 5 + (5 * (Math.random() + Math.random()));
			roomMemory.rampartDesignConfig.srcSpawnMod = 5 + (5 * (Math.random() + Math.random()));
			roomMemory.rampartDesignConfig.storageMineralMod = 2 + (2 * (Math.random() + Math.random()));
			roomMemory.rampartDesignConfig.storageExtensionMod = 5 + (5 * (Math.random() + Math.random()));

			// These next ones are probably the one that matters most
			roomMemory.rampartDesignConfig.borderCost2 = (0.5 * (Math.random() + Math.random()));

			// Randomly favour edge walls
			if (Math.random() < 0.2) {
				roomMemory.rampartDesignConfig.borderCost2 = -roomMemory.rampartDesignConfig.borderCost2;
			}

			roomMemory.rampartDesignConfig.borderCost3 = (2 * (Math.random() + Math.random()));
			roomMemory.rampartDesignConfig.borderCost4 = (1 * (Math.random() + Math.random()));
			roomMemory.rampartDesignConfig.borderCost5 = (0.5 * (Math.random() + Math.random()));

			roomMemory.rampartDesignConfig.swampCost = (0.5 * (Math.random() + Math.random()));

			roomMemory.rampartDesignConfig.cornerPenalty = (1 * (Math.random() + Math.random()));

			roomMemory.rampartDesignConfig.normalizedTowerDamageModifierFinal = 0.05 + (0.15 * (Math.random() + Math.random()));
			roomMemory.rampartDesignConfig.normalizedTowerDamageModifierFirst = 0.1 + (0.2 * (Math.random() + Math.random()));

			// Doesn't really change with SM
			roomMemory.rampartDesignConfig.buildingOnRampartCost = 1. + (0.5 * (Math.random() + Math.random()));
			roomMemory.rampartDesignConfig.buildinginRangeCostExtension = 0.125 + (0.125 * (Math.random() + Math.random()));
			roomMemory.rampartDesignConfig.buildinginRangeCostNonExtensionMod = 2 + (2 * (Math.random() + Math.random()));
			roomMemory.rampartDesignConfig.buildinginRangeCostRepeatPenaltyMod = 0.125 + (0.125 * (Math.random() + Math.random()));
		}
		else {
			roomMemory.rampartDesignConfig.spawnStorageMod = 30;
			roomMemory.rampartDesignConfig.storageLabMod = 30;
			roomMemory.rampartDesignConfig.storageConMod = 30;
			roomMemory.rampartDesignConfig.spawnConMod = 30;
			roomMemory.rampartDesignConfig.srcStorageMod = 10;
			roomMemory.rampartDesignConfig.srcSpawnMod = 10;
			roomMemory.rampartDesignConfig.storageMineralMod = 4;
			roomMemory.rampartDesignConfig.storageExtensionMod = 10;

			roomMemory.rampartDesignConfig.borderCost2 = 0.25;
			roomMemory.rampartDesignConfig.borderCost3 = 2;
			roomMemory.rampartDesignConfig.borderCost4 = 1;
			roomMemory.rampartDesignConfig.borderCost5 = 0.5;

			roomMemory.rampartDesignConfig.swampCost = 0.5;

			roomMemory.rampartDesignConfig.cornerPenalty = 1;

			roomMemory.rampartDesignConfig.normalizedTowerDamageModifierFinal = 0.2;
			roomMemory.rampartDesignConfig.normalizedTowerDamageModifierFirst = 0.3;

			roomMemory.rampartDesignConfig.buildingOnRampartCost = 1.5;
			roomMemory.rampartDesignConfig.buildinginRangeCostExtension = 0.25;
			roomMemory.rampartDesignConfig.buildinginRangeCostNonExtensionMod = 4;
			roomMemory.rampartDesignConfig.buildinginRangeCostRepeatPenaltyMod = 0.25;
		}

		console.log(room, roomMemory.designed)

		if (Memory.tick > 5 &&
			!roomMemory.designed &&
			(roomMemory.designFailed === undefined || (room && room.controller.my)) &&
			(Game.time % NUM_DESIGN_STAGES == 0 || force)) {
			// roomMemory.designFailed = roomMemory.designFailed || true;
			var totalExtensionCount = 15;

			roomMemory.buildings = [];
			delete roomMemory.compressedBuildings

			if (room) {
				var flags = room.find(FIND_FLAGS);
				for (var flag of flags) flag.remove()

				var hostileStructs = room.find(FIND_HOSTILE_STRUCTURES);
				for (var struct of hostileStructs) struct.destroy();
				var hostileSpawns = room.find(FIND_HOSTILE_SPAWNS);
				for (var spawn of hostileSpawns) console.log("Spawn destroy", spawn.destroy());
				var hostileSites = room.find(FIND_HOSTILE_CONSTRUCTION_SITES);
				for (var site of hostileSites) site.remove();
				var structs = room.find(FIND_STRUCTURES);
				for (var struct of structs) {
					if (struct.structureType === STRUCTURE_CONTAINER || struct.structureType === STRUCTURE_WALL) struct.destroy();
				}
			}


			Memory.flagCount = Memory.flagCount || 0;

			let roomMap = this.generateRoomMap(roomName, false);
			let placed;

			let numSources = roomIntel.getNumSources(roomName);

			let exitTop = false;
			let exitBottom = false;
			let exitLeft = false;
			let exitRight = false;

			let exitTopPos = 0;
			let exitBottomPos = 0;
			let exitLeftPos = 0;
			let exitRightPos = 0;

			let exitTopCount = 0;
			let exitBottomCount = 0;
			let exitLeftCount = 0;
			let exitRightCount = 0;

			let roomTerrain = Game.map.getRoomTerrain(roomName)

			for (let i = 1; i < 49; i++) {
				if (!(roomTerrain.get(i, 0) & TERRAIN_MASK_WALL)) {
					exitTopPos += i;
					exitTop = true;
					exitTopCount++;
				}
				if (!(roomTerrain.get(i, 49) & TERRAIN_MASK_WALL)) {
					exitBottomPos += i;
					exitBottom = true;
					exitBottomCount++;
				}
				if (!(roomTerrain.get(0, i) & TERRAIN_MASK_WALL)) {
					exitLeftPos += i;
					exitLeft = true;
					exitLeftCount++;
				}
				if (!(roomTerrain.get(49, i) & TERRAIN_MASK_WALL)) {
					exitRightPos += i;
					exitRight = true;
					exitRightCount++;
				}
			}

			exitTopPos /= exitTopCount;
			exitBottomPos /= exitBottomCount;
			exitLeftPos /= exitLeftCount;
			exitRightPos /= exitRightCount;

			let numExits = (exitTop || 0) + (exitBottom || 0) + (exitLeft || 0) + (exitRight || 0);


			// Create range maps for the controller and sources
			let sourceRangeMaps = []
			let controllerRangeMap = []

			for (let sourceIdx = 0; sourceIdx < roomIntel.getNumSources(roomName); sourceIdx++) {
				sourceRangeMaps.push([])
				for (let i = 0; i < 50; i++) {
					sourceRangeMaps[sourceIdx].push([])
					for (let j = 0; j < 50; j++) {
						sourceRangeMaps[sourceIdx][i].push(9999);
					}
				}
			}

			for (let i = 0; i < 50; i++) {
				controllerRangeMap.push([])
				for (let j = 0; j < 50; j++) {
					controllerRangeMap[i].push(9999);
				}
			}


			// function createRangeMap(rangeMap, i, j, value) {
			// 	if (rangeMap[i][j] > value && (value == 0 || !(roomTerrain.get(i, j) & TERRAIN_MASK_WALL))) {
			// 		rangeMap[i][j] = value;
			// 		value += 1

			// 		// I think this is more efficient if we go around in a circle
			// 		if (i - 1 >= 0)  createRangeMap(rangeMap, i-1, j, value);
			// 		if (i - 1 >= 0 && j - 1 >= 0)  createRangeMap(rangeMap, i-1, j-1, value);
			// 		if (j - 1 >= 0)  createRangeMap(rangeMap, i, j-1, value);
			// 		if (i + 1 <= 49 && j - 1 >= 0) createRangeMap(rangeMap, i+1, j-1, value);
			// 		if (i + 1 <= 49) createRangeMap(rangeMap, i+1, j, value);
			// 		if (i + 1 <= 49 && j + 1 <= 49) createRangeMap(rangeMap, i+1, j+1, value);
			// 		if (j + 1 <= 49) createRangeMap(rangeMap, i, j+1, value);
			// 		if (i - 1 >= 0 && j + 1 <= 49)  createRangeMap(rangeMap, i-1, j+1, value);				
			// 	}
			// }


			function createRangeMap(rangeMap, startX, startY) {
				rangeMap[startX][startY] = 0
				let queue = [startX * 50 + startY]

				while (queue.length) {
					let val = queue.shift();

					let x = Math.floor(val / 50);
					let y = val % 50;

					for (let i = x - 1; i <= x + 1; i++) {
						if (i <= 0 || i >= 49) continue
						for (let j = y - 1; j <= y + 1; j++) {
							if (j <= 0 || j >= 49) continue

							if (rangeMap[i][j] > rangeMap[x][y] + 1) {
								if (!(roomTerrain.get(i, j) & TERRAIN_MASK_WALL)) {
									rangeMap[i][j] = rangeMap[x][y] + 1
									queue.push(i * 50 + j)
								}
							}
						}
					}
				}
				// let vis = new RoomVisual(roomName)
				// for (let i = 0; i < 50; i++) {
				// 	for (let j = 0; j < 50; j++) {
				// 		vis.text(rangeMap[i][j], i, j)
				// 	}
				// }
			}



			let finalMap = []

			for (let sourceIdx = 0; sourceIdx < roomIntel.getNumSources(roomName); sourceIdx++) {
				createRangeMap(sourceRangeMaps[sourceIdx], roomIntel.getSourceX(roomName, sourceIdx), roomIntel.getSourceY(roomName, sourceIdx));
				// return
			}

			createRangeMap(controllerRangeMap, roomMemory.conX, roomMemory.conY);

			for (let i = 0; i < 50; i++) {
				finalMap.push([])
				for (let j = 0; j < 50; j++) {
					finalMap[i].push(0)
					for (let sourceIdx = 0; sourceIdx < roomIntel.getNumSources(roomName); sourceIdx++) {
						finalMap[i][j] += 2 * (sourceRangeMaps[sourceIdx][i][j]);
					}
					finalMap[i][j] += 6 * (controllerRangeMap[i][j]);

					if (controllerRangeMap[i][j] < 7) {
						finalMap[i][j] += 6 * 2 * (7 - controllerRangeMap[i][j]);
					}

					if (numExits != 4) {
						if (exitTop) {
							finalMap[i][j] += j;
						}
						if (exitBottom) {
							finalMap[i][j] -= j;
						}
						if (exitLeft) {
							finalMap[i][j] += i;
						}
						if (exitRight) {
							finalMap[i][j] -= i;
						}
					}
				}
			}


			// Find a good place to put the spawn battery. (3xSpawns, 1xLink, 2xContainers, 15xExtensions)
			// Strategy:
			//	7x7 block excluding corners (border for movement)
			//	Place at the centroid of the energy points. Nudge toward controller a bit.
			//	Spiral out until a place can be found
			placed = false;

			let cnt = 0;

			while (cnt < 42 * 42) {
				cnt++;		
				let targetX = -1;
				let targetY = -1;
				let minScore = 999999

				for (let i = 5; i < 45; i++) {
					for (let j = 5; j < 45; j++) {
						// console.log(i, j, finalMap[i][j], minScore)
						if (finalMap[i][j] < minScore) {
							minScore = finalMap[i][j]
							targetX = i;
							targetY = j;
						}						
					}
				}

				// console.log(cnt, targetX, targetY)

				if (targetX < 0 || targetY < 0)  {
					console.log(roomName, "Spawn placement failed:", targetX, targetY)
					roomMemory.designFailed = true
					return
				}

				finalMap[targetX][targetY] = 999999

				var valid = true;

				for (var innerX = -3; innerX <= 3; innerX++) {
					for (var innerY = -3; innerY <= 3; innerY++) {
						if (Math.abs(innerX) == 3 && Math.abs(innerY) == 3) continue;

						if (targetX + innerX >= 47 || targetX + innerX < 3 || targetY + innerY >= 47 || targetY + innerY < 3) {
							valid = false;
							break;
						}

						var terrain = roomMap[targetX + innerX][targetY + innerY]

						if (terrain !== " ") {
							if (!(terrain === "r" && (Math.abs(innerX) == 3 || Math.abs(innerY) == 3))) {
								valid = false;
								break;
							}
						}
					}
					if (!valid) {
						break;
					}
				}

				if (valid) {
					console.log(roomName, "placing spawn at", targetX, targetY)
					// throw(new Error())
					placed = true;

					var xPos;
					var yPos;

					// Putting this in the middle of the large loop is an awful hack
					if (room && room.find(FIND_MY_SPAWNS).length > 0) {
					// if (!Memory.firstRoomSetUp) {
						Memory.firstRoomSetUp = true;
						// var spawn = Game.spawns.Spawn1
						var spawn = room.find(FIND_MY_SPAWNS)[0];
						// xPos = spawn.pos.x;
						// yPos = spawn.pos.y - 2;
						xPos = spawn.pos.x + 2;
						yPos = spawn.pos.y + 1;
					}
					else {
						xPos = targetX;
						yPos = targetY;
					}


					roomMemory.spawnBatteryCentreX = xPos;
					roomMemory.spawnBatteryCentreY = yPos;

					this.createBuilding(roomMemory, xPos - 2, yPos - 1, STRUCTURE_SPAWN + "_" + (Game.gcl.level == 1 ? 1 : 2));
					if (Memory.season3) {
						this.createBuilding(roomMemory, xPos, yPos + 2, STRUCTURE_EXTENSION + "_" + 3);
						this.createBuilding(roomMemory, xPos + 2, yPos - 1, STRUCTURE_EXTENSION + "_" + 3);
					}
					else {						
						this.createBuilding(roomMemory, xPos, yPos + 2, STRUCTURE_SPAWN + "_" + 8);
						this.createBuilding(roomMemory, xPos + 2, yPos - 1, STRUCTURE_SPAWN + "_" + 7);
					}

					// Get one container down first
					this.createBuilding(roomMemory, xPos + 2, yPos, "dropContainer" + "_" + 2);
					if (room) room.createFlag(xPos + 2, yPos, "dropContainer" + "_" + 2 + "_" + Memory.flagCount, COLOR_GREEN);
					if (room) Memory.flagCount++;

					this.createBuilding(roomMemory, xPos - 1, yPos, STRUCTURE_EXTENSION + "_" + 2);
					this.createBuilding(roomMemory, xPos - 1, yPos - 2, STRUCTURE_EXTENSION + "_" + 2);
					this.createBuilding(roomMemory, xPos - 2, yPos - 2, STRUCTURE_EXTENSION + "_" + 2);
					this.createBuilding(roomMemory, xPos - 2, yPos + 1, STRUCTURE_EXTENSION + "_" + 2);
					this.createBuilding(roomMemory, xPos - 1, yPos + 2, STRUCTURE_EXTENSION + "_" + 2);
					this.createBuilding(roomMemory, xPos - 2, yPos + 2, STRUCTURE_EXTENSION + "_" + 2);

					this.createBuilding(roomMemory, xPos, yPos - 2, STRUCTURE_EXTENSION + "_" + 2);
					this.createBuilding(roomMemory, xPos, yPos - 1, STRUCTURE_EXTENSION + "_" + 2);
					this.createBuilding(roomMemory, xPos, yPos + 1, STRUCTURE_EXTENSION + "_" + 2);

					this.createBuilding(roomMemory, xPos + 1, yPos + 2, STRUCTURE_EXTENSION + "_" + 2);
					this.createBuilding(roomMemory, xPos + 1, yPos, STRUCTURE_EXTENSION + "_" + 2);
					this.createBuilding(roomMemory, xPos + 2, yPos + 1, STRUCTURE_EXTENSION + "_" + 2);
					this.createBuilding(roomMemory, xPos + 2, yPos + 2, STRUCTURE_EXTENSION + "_" + 2);
					this.createBuilding(roomMemory, xPos + 1, yPos - 2, STRUCTURE_EXTENSION + "_" + 2);
					this.createBuilding(roomMemory, xPos + 2, yPos - 2, STRUCTURE_EXTENSION + "_" + 2);

					this.createBuilding(roomMemory, xPos - 2, yPos, "dropContainer" + "_" + 2);
					if (room) room.createFlag(xPos - 2, yPos, "dropContainer" + "_" + 2 + "_" + Memory.flagCount, COLOR_GREEN);
					if (room) Memory.flagCount++;

					this.createBuilding(roomMemory, xPos, yPos, STRUCTURE_LINK + "_" + 5);


					for (var i2 = -2; i2 <= 2; i2++) {
						for (var j2 = -2; j2 <= 2; j2++) {
							roomMap[xPos + i2][yPos + j2] = "b"
						}
					}

					for (var i2 = -2; i2 <= 2; i2++) {
						if (roomMap[xPos + i2][yPos + 3] != "w") {
							this.createBuilding(roomMemory, xPos + i2, yPos + 3, STRUCTURE_ROAD + "_" + 3);
							roomMap[xPos + i2][yPos + 3] = "r"
						}
						if (roomMap[xPos + i2][yPos - 3] != "w") {
							this.createBuilding(roomMemory, xPos + i2, yPos - 3, STRUCTURE_ROAD + "_" + 3);
							roomMap[xPos + i2][yPos - 3] = "r"
						}
					}
					for (var j2 = -2; j2 <= 2; j2++) {
						if (roomMap[xPos + 3][yPos + j2] != "w") {
							this.createBuilding(roomMemory, xPos + 3, yPos + j2, STRUCTURE_ROAD + "_" + 3);
							roomMap[xPos + 3][yPos + j2] = "r"
						}

						if (roomMap[xPos - 3][yPos + j2] != "w") {
							this.createBuilding(roomMemory, xPos - 3, yPos + j2, STRUCTURE_ROAD + "_" + 3);
							roomMap[xPos - 3][yPos + j2] = "r"
						}
					}
				}
				if (placed) {
					break;
				}
			}

			/*var targetX = 3 * roomMemory.conX;
			var targetY = 3 * roomMemory.conY;
			for (var sourceIdx = 0; sourceIdx < roomIntel.getNumSources(roomName); sourceIdx++) {
				targetX += roomIntel.getSourceX(roomName, sourceIdx);
				targetY += roomIntel.getSourceY(roomName, sourceIdx);
			}

			// If we have all exits there's not much we can do with limited info.
			if (numExits != 4) {
				if (exitTop) {
					targetX += exitTopPos;
					targetY += 0;
				}
				if (exitBottom) {
					targetX += exitBottomPos;
					targetY += 49;
				}
				if (exitLeft) {
					targetX += 0;
					targetY += exitLeftPos;
				}
				if (exitRight) {
					targetX += 49;
					targetY += exitRightPos;
				}
			}


			targetX = Math.round(targetX / (3 + numSources + (numExits != 4 ? numExits : 0)))
			targetY = Math.round(targetY / (3 + numSources + (numExits != 4 ? numExits : 0)))


			for (var radius = 0; radius < 50; radius++) {
				var limit = radius * 8;
				for (var iter = 0; iter < limit; iter++) {
					if (placed) break;

					var direction = iter % 4;
					var offsetDirection = Math.floor(iter / 4) % 2;
					var offsetAmount = Math.floor((iter + 4) / 8);

					var i;
					var j;

					if (direction == 0) {
						i = offsetAmount * (offsetDirection == 1 ? 1 : -1)
						j = -radius;
					}
					else if (direction == 2) {
						i = offsetAmount * (offsetDirection == 1 ? -1 : 1)
						j = radius;
					}
					else if (direction == 1) {
						i = radius;
						j = offsetAmount * (offsetDirection == 1 ? 1 : -1)
					}
					else if (direction == 3) {
						i = -radius;
						j = offsetAmount * (offsetDirection == 1 ? -1 : 1)
					}

					var valid = true;

					for (var innerX = -3; innerX <= 3; innerX++) {
						for (var innerY = -3; innerY <= 3; innerY++) {
							if (Math.abs(innerX) == 3 && Math.abs(innerY) == 3) continue;


							if (targetX + i + innerX >= 47 || targetX + i + innerX < 3 || targetY + j + innerY >= 47 || targetY + j + innerY < 3) {
								valid = false;
								break;
							}

							var terrain = roomMap[targetX + i + innerX][targetY + j + innerY]

							if (terrain !== " ") {
								if (!(terrain === "r" && (Math.abs(innerX) == 3 || Math.abs(innerY) == 3))) {
									valid = false;
									break;
								}
							}
						}
						if (!valid) {
							break;
						}
					}

					if (valid) {
						placed = true;

						var xPos;
						var yPos;

						// Putting this in the middle of the large loop is an awful hack
						if (room && room.find2(FIND_MY_SPAWNS).length > 0) {
						// if (!Memory.firstRoomSetUp) {
							Memory.firstRoomSetUp = true;
							// var spawn = Game.spawns.Spawn1
							var spawn = room.find2(FIND_MY_SPAWNS)[0];
							xPos = spawn.pos.x;
							yPos = spawn.pos.y - 2;
						}
						else {
							xPos = targetX + i;
							yPos = targetY + j;
						}


						roomMemory.spawnBatteryCentreX = xPos;
						roomMemory.spawnBatteryCentreY = yPos;

						this.createBuilding(roomMemory, xPos, yPos + 2, STRUCTURE_SPAWN + "_" + (Game.gcl.level == 1 ? 1 : 2));
						this.createBuilding(roomMemory, xPos - 2, yPos - 1, STRUCTURE_SPAWN + "_" + 7);
						this.createBuilding(roomMemory, xPos + 2, yPos - 1, STRUCTURE_SPAWN + "_" + 8);


						this.createBuilding(roomMemory, xPos - 1, yPos + 2, STRUCTURE_EXTENSION + "_" + 2);
						this.createBuilding(roomMemory, xPos - 1, yPos, STRUCTURE_EXTENSION + "_" + 2);
						this.createBuilding(roomMemory, xPos - 2, yPos + 1, STRUCTURE_EXTENSION + "_" + 2);
						this.createBuilding(roomMemory, xPos - 2, yPos + 2, STRUCTURE_EXTENSION + "_" + 2);
						this.createBuilding(roomMemory, xPos - 1, yPos - 2, STRUCTURE_EXTENSION + "_" + 2);
						this.createBuilding(roomMemory, xPos - 2, yPos - 2, STRUCTURE_EXTENSION + "_" + 2);

						this.createBuilding(roomMemory, xPos, yPos - 2, STRUCTURE_EXTENSION + "_" + 2);
						this.createBuilding(roomMemory, xPos, yPos - 1, STRUCTURE_EXTENSION + "_" + 2);
						this.createBuilding(roomMemory, xPos, yPos + 1, STRUCTURE_EXTENSION + "_" + 2);

						this.createBuilding(roomMemory, xPos + 1, yPos + 2, STRUCTURE_EXTENSION + "_" + 2);
						this.createBuilding(roomMemory, xPos + 1, yPos, STRUCTURE_EXTENSION + "_" + 2);
						this.createBuilding(roomMemory, xPos + 2, yPos + 1, STRUCTURE_EXTENSION + "_" + 2);
						this.createBuilding(roomMemory, xPos + 2, yPos + 2, STRUCTURE_EXTENSION + "_" + 2);
						this.createBuilding(roomMemory, xPos + 1, yPos - 2, STRUCTURE_EXTENSION + "_" + 2);
						this.createBuilding(roomMemory, xPos + 2, yPos - 2, STRUCTURE_EXTENSION + "_" + 2);

						this.createBuilding(roomMemory, xPos + 2, yPos, "dropContainer" + "_" + 2);
						this.createBuilding(roomMemory, xPos - 2, yPos, "dropContainer" + "_" + 2);
						if (room) room.createFlag(xPos + 2, yPos, "dropContainer" + "_" + 2 + "_" + Memory.flagCount, COLOR_GREEN);
						if (room) Memory.flagCount++;
						if (room) room.createFlag(xPos - 2, yPos, "dropContainer" + "_" + 2 + "_" + Memory.flagCount, COLOR_GREEN);
						if (room) Memory.flagCount++;

						this.createBuilding(roomMemory, xPos, yPos, STRUCTURE_LINK + "_" + 5);


						for (var i2 = -2; i2 <= 2; i2++) {
							for (var j2 = -2; j2 <= 2; j2++) {
								roomMap[xPos + i2][yPos + j2] = "b"
							}
						}

						for (var i2 = -2; i2 <= 2; i2++) {
							if (roomMap[xPos + i2][yPos + 3] != "w") {
								this.createBuilding(roomMemory, xPos + i2, yPos + 3, STRUCTURE_ROAD + "_" + 3);
								roomMap[xPos + i2][yPos + 3] = "r"
							}
							if (roomMap[xPos + i2][yPos - 3] != "w") {
								this.createBuilding(roomMemory, xPos + i2, yPos - 3, STRUCTURE_ROAD + "_" + 3);
								roomMap[xPos + i2][yPos - 3] = "r"
							}
						}
						for (var j2 = -2; j2 <= 2; j2++) {
							if (roomMap[xPos + 3][yPos + j2] != "w") {
								this.createBuilding(roomMemory, xPos + 3, yPos + j2, STRUCTURE_ROAD + "_" + 3);
								roomMap[xPos + 3][yPos + j2] = "r"
							}

							if (roomMap[xPos - 3][yPos + j2] != "w") {
								this.createBuilding(roomMemory, xPos - 3, yPos + j2, STRUCTURE_ROAD + "_" + 3);
								roomMap[xPos - 3][yPos + j2] = "r"
							}
						}
					}
				}
				if (placed) {
					break;
				}
			}*/

			if (!placed) {
				console.log("Design failed, can't place spawn area")
				roomMemory.designFailed = true;
				return;
			}


			let spawnBatteryRangeMap = []
			for (let i = 0; i < 50; i++) {
				spawnBatteryRangeMap.push([])
				for (let j = 0; j < 50; j++) {
					spawnBatteryRangeMap[i].push(9999);
				}
			}

			createRangeMap(spawnBatteryRangeMap, roomMemory.spawnBatteryCentreX, roomMemory.spawnBatteryCentreY);

			finalMap = []

			// Same as last time but with spawn battery
			for (let i = 0; i < 50; i++) {
				finalMap.push([])
				for (let j = 0; j < 50; j++) {
					finalMap[i].push(0)
					for (let sourceIdx = 0; sourceIdx < roomIntel.getNumSources(roomName); sourceIdx++) {
						finalMap[i][j] += Math.pow(sourceRangeMaps[sourceIdx][i][j], 1.001);
					}
					finalMap[i][j] += 3 * Math.pow(controllerRangeMap[i][j], 1.001);

					// Don't get too close to the controller
					if (controllerRangeMap[i][j] < 6) {
						finalMap[i][j] += 3 * 2 * (6 - controllerRangeMap[i][j]);
					}

					if (roomMemory.claimToUnclaimRoom) {
						finalMap[i][j] += 30 * Math.pow(controllerRangeMap[i][j], 1.001);
						if (controllerRangeMap[i][j] < 6) {
							finalMap[i][j] += 30 * 2 * (6 - controllerRangeMap[i][j]);
						}
					}


					if (numExits != 4) {
						if (exitTop) {
							finalMap[i][j] += j;
						}
						if (exitBottom) {
							finalMap[i][j] -= j;
						}
						if (exitLeft) {
							finalMap[i][j] += i;
						}
						if (exitRight) {
							finalMap[i][j] -= i;
						}
					}

					finalMap[i][j] += Math.pow(spawnBatteryRangeMap[i][j], 1.001);
				}
			}


			// Find a good place to put storage battery. (1xStorage, 1xTerminal, 1xLink, 4xExtensions)
			// Strategy:
			//   5x5 block excluding corners (border for movement)
			//   Wants to be near the source centroid, nudge toward the controller a bit
			//   If that falls near the controller, bump it.
			placed = false;


			cnt = 0;

			while (cnt < 42 * 42) {
				cnt++;		
				let targetX = -1;
				let targetY = -1;
				let minScore = 999999

				for (let i = 5; i < 45; i++) {
					for (let j = 5; j < 45; j++) {
						// console.log(i, j, finalMap[i][j], minScore)
						if (finalMap[i][j] < minScore) {
							minScore = finalMap[i][j]
							targetX = i;
							targetY = j;
						}						
					}
				}

				// console.log(cnt, targetX, targetY)

				if (targetX < 0 || targetY < 0)  {
					roomMemory.designFailed = true;
					console.log(roomName, "Storage placement failed:", targetX, targetY)
					return
				}

				finalMap[targetX][targetY] = 999999

				if (spawnBatteryRangeMap[targetX][targetY] > 15) {
					// console.log("Design failed, storage too far from spawn")
					// roomMemory.designFailed = true;
					continue;
				}


				var valid = true;


				for (var innerX = -2; innerX <= 2; innerX++) {
					for (var innerY = -2; innerY <= 2; innerY++) {
						if (Math.abs(innerX) == 2 && Math.abs(innerY) == 2) continue;

						if (targetX + innerX >= 48 || targetX + innerX < 2 || targetY + innerY >= 48 || targetY + innerY < 2) {
							valid = false;
							break;
						}

						var terrain = roomMap[targetX + innerX][targetY + innerY]

						if (terrain !== " ") {
							if (!(terrain === "r" && (Math.abs(innerX) == 2 || Math.abs(innerY) == 2))) {
								valid = false;
								break;
							}
						}
					}
					if (!valid) {
						break;
					}
				}

				if (valid) {
					placed = true;

					var xPos = targetX;
					var yPos = targetY;

					var placedStorage = false;
					var placedTerminal = Memory.noTerminals ? true : false;
					// Don't bother if we have no terminals.
					var placedNuker = Memory.noTerminals ? true : false;
					var placedFactory = false;
					var placedLink = false;
					var extensionCount = 0;

					if (Memory.season5 && roomMemory.claimToUnclaimRoom)  {
						placedNuker = true
						placedFactory = true
					}

					roomMemory.storageBatteryX = xPos;
					roomMemory.storageBatteryY = yPos;
					this.createBuilding(roomMemory, xPos, yPos, "optionalRampart" + "_" + 4);

					for (var i2 = -1; i2 <= 1; i2++) {
						for (var j2 = -1; j2 <= 1; j2++) {
							roomMap[xPos + i2][yPos + j2] = "b"

							if (i2 == 0 && j2 == 0) continue;
							if (!placedStorage) {
								this.createBuilding(roomMemory, xPos + i2, yPos + j2, STRUCTURE_STORAGE + "_" + 4);

								roomMemory.storageX = xPos + i2;
								roomMemory.storageY = yPos + j2;

								placedStorage = true;

							}
							else if (!placedTerminal) {
								this.createBuilding(roomMemory, xPos + i2, yPos + j2, STRUCTURE_TERMINAL + "_" + 6);
								placedTerminal = true;
							}
							else if (!placedLink) {
								this.createBuilding(roomMemory, xPos + i2, yPos + j2, STRUCTURE_LINK + "_" + 5);
								placedLink = true;
							}
							else if (!placedNuker) {
								this.createBuilding(roomMemory, xPos + i2, yPos + j2, STRUCTURE_NUKER + "_" + 8);
								placedNuker = true;
							}
							else if (!placedFactory) {
								this.createBuilding(roomMemory, xPos + i2, yPos + j2, STRUCTURE_FACTORY + "_" + 7);
								placedFactory = true;
							}
							else if (extensionCount < 2 + (Memory.noTerminals ? 1 : 0)) {
								this.createBuilding(roomMemory, xPos + i2, yPos + j2, STRUCTURE_EXTENSION + "_" + 2);
								extensionCount += 1;
								totalExtensionCount += 1;
							}
						}
					}

					for (var i2 = -1; i2 <= 1; i2++) {
						for (var j2 = -1; j2 <= 1; j2++) {
							if (i2 == 0 && j2 == 0) continue;
							if (roomMemory.storageX + i2 == xPos && roomMemory.storageY + j2 == yPos) continue;
							if (roomMap[roomMemory.storageX + i2][roomMemory.storageY + j2] === " ") {
								this.createBuilding(roomMemory, roomMemory.storageX + i2, roomMemory.storageY + j2, STRUCTURE_ROAD + "_" + 3);
								roomMap[roomMemory.storageX + i2][roomMemory.storageY + j2] = "r"
							}

						}
					}

				}

				if (placed) {
					break;
				}

			}

			/*var targetX = 3 * roomMemory.conX + roomMemory.spawnBatteryCentreX;
			var targetY = 3 * roomMemory.conY + roomMemory.spawnBatteryCentreY;

			for (var sourceIdx = 0; sourceIdx < roomIntel.getNumSources(roomName); sourceIdx++) {
				targetX += roomIntel.getSourceX(roomName, sourceIdx);
				targetY += roomIntel.getSourceY(roomName, sourceIdx);
			}

			// If we have all exits there's not much we can do with limited info.
			if (numExits != 4) {
				if (exitTop) {
					targetX += exitTopPos;
					targetY += 0;
				}
				if (exitBottom) {
					targetX += exitBottomPos;
					targetY += 49;
				}
				if (exitLeft) {
					targetX += 0;
					targetY += exitLeftPos;
				}
				if (exitRight) {
					targetX += 49;
					targetY += exitRightPos;
				}
			}


			targetX = Math.round(targetX / (4 + numSources + (numExits != 4 ? numExits : 0)))
			targetY = Math.round(targetY / (4 + numSources + (numExits != 4 ? numExits : 0)))

			// Place in the target position
			for (var radius = 0; radius <= 50; radius++) {
				var limit = radius * 8;
				for (var iter = 0; iter < limit; iter++) {
					if (placed) break;

					var direction = iter % 4;
					var offsetDirection = Math.floor(iter / 4) % 2;
					var offsetAmount = Math.floor((iter + 4) / 8);

					var i;
					var j;

					if (direction == 0) {
						i = offsetAmount * (offsetDirection == 1 ? 1 : -1)
						j = -radius;
					}
					else if (direction == 2) {
						i = offsetAmount * (offsetDirection == 1 ? -1 : 1)
						j = radius;
					}
					else if (direction == 1) {
						i = radius;
						j = offsetAmount * (offsetDirection == 1 ? 1 : -1)
					}
					else if (direction == 3) {
						i = -radius;
						j = offsetAmount * (offsetDirection == 1 ? -1 : 1)
					}

					var valid = true;


					for (var innerX = -2; innerX <= 2; innerX++) {
						for (var innerY = -2; innerY <= 2; innerY++) {
							if (Math.abs(innerX) == 2 && Math.abs(innerY) == 2) continue;

							if (targetX + i + innerX >= 48 || targetX + i + innerX < 2 || targetY + j + innerY >= 48 || targetY + j + innerY < 2) {
								valid = false;
								break;
							}

							var terrain = roomMap[targetX + i + innerX][targetY + j + innerY]

							if (terrain !== " ") {
								if (!(terrain === "r" && (Math.abs(innerX) == 2 || Math.abs(innerY) == 2))) {
									valid = false;
									break;
								}
							}
						}
						if (!valid) {
							break;
						}
					}

					if (valid) {
						placed = true;

						var xPos = targetX + i;
						var yPos = targetY + j;

						var placedStorage= false;
						var placedTerminal = false;
						var placedNuker = false;
						var placedFactory = false;
						var placedLink = false;
						var extensionCount = 0;

						roomMemory.storageBatteryX = xPos;
						roomMemory.storageBatteryY = yPos;
						this.createBuilding(roomMemory, xPos, yPos, "optionalRampart" + "_" + 4);

						for (var i2 = -1; i2 <= 1; i2++) {
							for (var j2 = -1; j2 <= 1; j2++) {
								roomMap[xPos + i2][yPos + j2] = "b"

								if (i2 == 0 && j2 == 0) continue;
								if (!placedStorage) {
									this.createBuilding(roomMemory, xPos + i2, yPos + j2, STRUCTURE_STORAGE + "_" + 4);

									roomMemory.storageX = xPos + i2;
									roomMemory.storageY = yPos + j2;

									placedStorage = true;

								}
								else if (!placedTerminal) {
									this.createBuilding(roomMemory, xPos + i2, yPos + j2, STRUCTURE_TERMINAL + "_" + 6);
									placedTerminal = true;
								}
								else if (!placedLink) {
									this.createBuilding(roomMemory, xPos + i2, yPos + j2, STRUCTURE_LINK + "_" + 5);
									placedLink = true;
								}
								else if (!placedNuker) {
									this.createBuilding(roomMemory, xPos + i2, yPos + j2, STRUCTURE_NUKER + "_" + 8);
									placedNuker = true;
								}
								else if (!placedFactory) {
									this.createBuilding(roomMemory, xPos + i2, yPos + j2, STRUCTURE_FACTORY + "_" + (Memory.timedRound ? 8 : 7));
									placedFactory = true;
								}
								else if (extensionCount < 2) {
									this.createBuilding(roomMemory, xPos + i2, yPos + j2, STRUCTURE_EXTENSION + "_" + 2);
									extensionCount += 1;
									totalExtensionCount += 1;
								}
							}
						}

						for (var i2 = -1; i2 <= 1; i2++) {
							for (var j2 = -1; j2 <= 1; j2++) {
								if (i2 == 0 && j2 == 0) continue;
								if (roomMemory.storageX + i2 == xPos && roomMemory.storageY + j2 == yPos) continue;
								if (roomMap[roomMemory.storageX + i2][roomMemory.storageY + j2] === " ") {
									this.createBuilding(roomMemory, roomMemory.storageX + i2, roomMemory.storageY + j2, STRUCTURE_ROAD + "_" + 3);
									roomMap[roomMemory.storageX + i2][roomMemory.storageY + j2] = "r"
								}

							}
						}

					}
				}

				if (placed) {
					break;
				}
			}			*/


			if (!placed) {
				console.log("Design failed, can't place storage")
				roomMemory.designFailed = true;
				return;
			}

			placed = false
			var controllerResourcePosX;
			var controllerResourcePosY;

			// Controller resources. Link and storage
			roomDesignAI.lockCostMatrix(roomName);

			var minDistance = 1e9;
			var maxAdjacency = 0;
			var bestX = -1;
			var bestY = -1;
			for (var radius = 2; radius <= 4; radius++) {

				var limit = radius * 8;
				for (var iter = 0; iter < limit; iter++) {
					var direction = iter % 4;
					var offsetDirection = Math.floor(iter / 4) % 2;
					var offsetAmount = Math.floor((iter + 4) / 8);

					var i;
					var j;

					if (direction == 0) {
						i = offsetAmount * (offsetDirection == 1 ? 1 : -1)
						j = -radius;
					}
					else if (direction == 2) {
						i = offsetAmount * (offsetDirection == 1 ? -1 : 1)
						j = radius;
					}
					else if (direction == 1) {
						i = radius;
						j = offsetAmount * (offsetDirection == 1 ? 1 : -1)
					}
					else if (direction == 3) {
						i = -radius;
						j = offsetAmount * (offsetDirection == 1 ? -1 : 1)
					}

					var xPos = roomMemory.conX + i;
					var yPos = roomMemory.conY + j;

					if (roomMap[xPos][yPos] != "w" && roomMap[xPos][yPos] != "b") {
						var moveCloseToX = (roomMemory.spawnBatteryCentreX + roomMemory.storageX) / 2;
						var moveCloseToY = (roomMemory.spawnBatteryCentreY + roomMemory.storageY) / 2;

						var adjacency = 0;
						for (var innerX = -1; innerX <= 1; innerX++) {
							for (var innerY = -1; innerY <= 1; innerY++) {
								if (roomMap[xPos + innerX][yPos + innerY] != "w" && roomMap[xPos + innerX][yPos + innerY] != "b") {
									var controllerPos = new RoomPosition(roomMemory.conX, roomMemory.conY, roomName);
									if (controllerPos.getRangeTo(xPos + innerX, yPos + innerY) <= 3) {
									// if (room.controller.pos.getRangeTo(xPos + innerX, yPos + innerY) < 3) {
										adjacency++;
									}
								}
							}
						}

						if (adjacency >= maxAdjacency) {
							var lengthController = this.getDesignRoadPath(new RoomPosition(xPos, yPos, roomName),
															new RoomPosition(roomMemory.conX, roomMemory.conY, roomName),
															1,
															roomMap
															).path.length;
							if (lengthController < 3) {
								var lengthNearTo = this.getDesignRoadPath(new RoomPosition(xPos, yPos, roomName),
																	new RoomPosition(moveCloseToX, moveCloseToY, roomName),
																	3,
																	roomMap
																	).path.length;
								if (lengthNearTo <= minDistance && adjacency >= maxAdjacency) {
									minDistance = lengthNearTo;
									maxAdjacency = adjacency;
									bestX = xPos;
									bestY = yPos;
									placed = true;
								}
							}
						}
					}
				}
			}

			if (!placed) {
				roomMemory.designFailed = true;
				return;
			}


			if (minDistance < 1e9) {
				this.createBuilding(roomMemory, bestX, bestY, "endLink" + "_" + 6);
				if (room) room.createFlag(bestX, bestY, "endLink" + "_" + 6 + "_" + Memory.flagCount, COLOR_BROWN);
				roomMap[bestX][bestY] = "b"
				if (room) Memory.flagCount++;

				this.createBuilding(roomMemory, bestX, bestY, "dropContainer" + "_" + 2);
				if (room) room.createFlag(bestX, bestY, "dropContainer" + "_" + 2 + "_" + Memory.flagCount, COLOR_GREEN);
				roomMap[bestX][bestY] = "b"
				if (room) Memory.flagCount++;

				controllerResourcePosX = bestX;
				controllerResourcePosY = bestY;

				this.createBuilding(roomMemory, bestX, bestY, "optionalRampart" + "_" + 4);

				roomMemory.storageControllerLinkDist = new RoomPosition(bestX, bestY, roomName).getRangeTo(roomMemory.storageBatteryX - 1, roomMemory.storageBatteryY + 1, roomName);
			}


			// Ok, now a road from spawn battery to controller
			var path1 = this.getDesignRoadPath(new RoomPosition(controllerResourcePosX, controllerResourcePosY, roomName),
										  new RoomPosition(roomMemory.spawnBatteryCentreX, roomMemory.spawnBatteryCentreY, roomName),
										  1,
										  roomMap).path;

			roomDesignAI.unlockCostMatrix(roomName);


			for (var pos of path1) {
				if (roomMap[pos.x][pos.y] != "b" && roomMap[pos.x][pos.y] !== "r") {
					this.createBuilding(roomMemory, pos.x, pos.y, STRUCTURE_ROAD + "_" + 3);
					roomMap[pos.x][pos.y] = "r"
				}
			}

			// Ok, now a road from storage to controller link
			var path2 = this.getDesignRoadPath(new RoomPosition(controllerResourcePosX, controllerResourcePosY, roomName),
										  new RoomPosition(roomMemory.storageX, roomMemory.storageY, roomName),
										  1,
										  roomMap).path;

			for (var pos of path2) {
				if (roomMap[pos.x][pos.y] != "b" && roomMap[pos.x][pos.y] !== "r") {
					this.createBuilding(roomMemory, pos.x, pos.y, STRUCTURE_ROAD + "_" + 3);
					roomMap[pos.x][pos.y] = "r"
				}
			}


			if (true) {
				var miningPoint;
				var minDistance = 1e9;
				var bestX = -1;
				var bestY = -1;
				var candidatePoints = 0;

				let mX = roomIntel.getMineralX(roomName)
				let mY = roomIntel.getMineralY(roomName)

				for (var i = -1; i <= 1; i++) {
					for (var j = -1; j <= 1; j++) {
						var xPos = mX + i;
						var yPos = mY + j;

						if (roomMap[xPos][yPos] != "w" && roomMap[xPos][yPos] != "b") {
							candidatePoints += 0;

							var length = this.getDesignRoadPath(new RoomPosition(xPos, yPos, roomName),
														  new RoomPosition(roomMemory.storageX, roomMemory.storageY, roomName),
														  1,
														  roomMap).path.length;

							for (var sourceIdx = 0; sourceIdx < roomIntel.getNumSources(roomName); sourceIdx++) {
								let srcXPos = roomIntel.getSourceX(roomName, sourceIdx);
								let srcYPos = roomIntel.getSourceY(roomName, sourceIdx);

								if (Math.max(Math.abs(srcXPos - xPos), Math.abs(srcYPos - yPos)) <= 1) {
									length += 5
								}
							}

							if (length < minDistance) {
								minDistance = length;
								bestX = xPos;
								bestY = yPos;
							}
						}
					}
				}

				if (bestX == - 1 || bestY == -1) {
					roomMemory.designFailed = true;
					return;
				}

				this.createBuilding(roomMemory, mX, mY, STRUCTURE_EXTRACTOR + "_" + 6);

				// Container to drop into at mining point. Build at RCL 6.
				this.createBuilding(roomMemory, bestX, bestY, "sourceContainer" + "_" + 6, COLOR_GREEN);
				if (room) room.createFlag(bestX, bestY, "sourceContainer" + "_" + 6 + "_" + mX + "_" + mY + "_" + Memory.flagCount, COLOR_GREEN);
				roomMap[bestX][bestY] = "d"; // Block it off completely
				if (room) Memory.flagCount++;

				// this.createBuilding(roomMemory, bestX, bestY, "optionalRampart" + "_" + 6);


				// Place roads from harvest->storage
				var path = this.getDesignRoadPath(new RoomPosition(bestX, bestY, roomName),
											  new RoomPosition(roomMemory.storageX, roomMemory.storageY, roomName),
											  1,
											  roomMap).path;


				for (var pos of path) {
					if (roomMap[pos.x][pos.y] !== "b") {
						this.createBuilding(roomMemory, pos.x, pos.y, STRUCTURE_ROAD + "_" + 6);
						roomMap[pos.x][pos.y] = "r"
					}
				}


				if (!placed) {
					roomMemory.designFailed = true;
					return;
				}
			}


			// Select harvest points to minimize distance to storage.
			// var harvestPoints = [];
			if (room) {
				roomMemory.harvestPointsX = []
				roomMemory.harvestPointsY = []
			}
			for (var sourceIdx = 0; sourceIdx < roomIntel.getNumSources(roomName); sourceIdx++) {

				var minDistance = 1e9;
				var bestX = -1;
				var bestY = -1;
				var candidatePoints = 0;

				let srcX = roomIntel.getSourceX(roomName, sourceIdx);
				let srcY = roomIntel.getSourceY(roomName, sourceIdx);

				for (var i = -1; i <= 1; i++) {
					for (var j = -1; j <= 1; j++) {
						let xPos = srcX + i;
						let yPos = srcY + j;

						if (!(roomTerrain.get(xPos, yPos) & TERRAIN_MASK_WALL) && roomMap[xPos][yPos] != "b") {
							candidatePoints += 0;

							var length = this.getDesignRoadPath(new RoomPosition(xPos, yPos, roomName),
														  new RoomPosition(roomMemory.storageX, roomMemory.storageY, roomName),
														  1,
														  roomMap).path.length;

							if (length < minDistance) {
								minDistance = length;
								bestX = xPos;
								bestY = yPos;
							}
						}
					}
				}

				if (bestX == - 1 || bestY == -1) {
					roomMemory.designFailed = true;
					return;
				}

				// harvestPoints.push(new RoomPosition(bestX, bestY, roomName));
				if (room) {
					roomMemory.harvestPointsX.push(bestX)
					roomMemory.harvestPointsY.push(bestY)
				}

				/*if (bestX < 0 || bestY < 0) {
					continue;
					// console.log("Design failed, can't place source stuff")
					// roomMemory.designFailed = true;
					// return;
				}
*/

				// Container to drop into at harvestPoint. Build at RCL 3.
				this.createBuilding(roomMemory, bestX, bestY, "sourceContainer" + "_" + 3);
				if (room) room.createFlag(bestX, bestY, "sourceContainer" + "_" + 3 + "_" + srcX + "_" + srcY + "_" + Memory.flagCount, COLOR_GREEN);
				roomMap[bestX][bestY] = "d"; // Block it off completely
				if (room) Memory.flagCount++;

				this.createBuilding(roomMemory, bestX, bestY, "optionalRampart" + "_" + 4);


				// Place roads from harvest->storage and harvest->spawn
				var path1 = this.getDesignRoadPath(new RoomPosition(bestX, bestY, roomName),
											  new RoomPosition(roomMemory.spawnBatteryCentreX, roomMemory.spawnBatteryCentreY, roomName),
											  1,
											  roomMap).path;

				for (var pos of path1) {
					if (roomMap[pos.x][pos.y] != "b") {
						this.createBuilding(roomMemory, pos.x, pos.y, STRUCTURE_ROAD + "_" + 3);
						roomMap[pos.x][pos.y] = "r"
					}
				}

				var path2 = this.getDesignRoadPath(new RoomPosition(bestX, bestY, roomName),
											  new RoomPosition(roomMemory.storageX, roomMemory.storageY, roomName),
											  1,
											  roomMap).path;


				for (var pos of path2) {
					if (roomMap[pos.x][pos.y] != "b") {
						this.createBuilding(roomMemory, pos.x, pos.y, STRUCTURE_ROAD + "_" + 3);
						roomMap[pos.x][pos.y] = "r"
					}
				}

				// Prep for link
				var hasLink = false;

				for (var i = -1; i <= 1; i++) {
					for (var j = -1; j <= 1; j++) {
						if (i == 0 && j == 0) continue;
						var xPos = bestX + i;
						var yPos = bestY + j;

						if (roomMap[xPos][yPos] != "w" && roomMap[xPos][yPos] !== "r" && roomMap[xPos][yPos] !== "b" && roomMap[xPos][yPos] !== "d") {
							if (!hasLink) {
								this.createBuilding(roomMemory, xPos, yPos, "harvestLink" + "_" + 7);
								if (room) room.createFlag(xPos, yPos, "harvestLink" + "_" + 7 + "_" + Memory.flagCount, COLOR_BROWN);
								roomMap[xPos][yPos] = "b"
								if (room) Memory.flagCount++;
								hasLink = true;
							}
							else {
								this.createBuilding(roomMemory, xPos, yPos, STRUCTURE_EXTENSION + "_" + 2);
								roomMap[xPos][yPos] = "b"
								totalExtensionCount += 1;
							}
						}
					}
				}
			}
			if (!placed) {
				console.log("Design failed, can't place source stuff")
				roomMemory.designFailed = true;
				return;
			}

			if (Memory.season2 && roomMemory.decoderX && roomMemory.decoderY) {
				var path2 = this.getDesignRoadPath(new RoomPosition(roomMemory.decoderX, roomMemory.decoderY, roomName),
												   new RoomPosition(roomMemory.storageX, roomMemory.storageY, roomName),
											 	   1,
												   roomMap).path;


				for (var pos of path2) {
					if (roomMap[pos.x][pos.y] != "b") {
						this.createBuilding(roomMemory, pos.x, pos.y, STRUCTURE_ROAD + "_" + 8);
						roomMap[pos.x][pos.y] = "r"
					}
				}
			}


			// Find a good place to put labs (Regular lab layout)
			// Strategy:
			//   6x6 block excluding corners (border for movement)
			//   Sprial from storage/spawn mean.

			let storageRangeMap = []
			for (let i = 0; i < 50; i++) {
				storageRangeMap.push([])
				for (let j = 0; j < 50; j++) {
					storageRangeMap[i].push(9999);
				}
			}

			createRangeMap(storageRangeMap, roomMemory.storageX, roomMemory.storageY);

			finalMap = []

			// Same as last time but with spawn battery
			for (let i = 0; i < 50; i++) {
				finalMap.push([])
				for (let j = 0; j < 50; j++) {
					finalMap[i].push(0)
					finalMap[i][j] += storageRangeMap[i][j];
					finalMap[i][j] += spawnBatteryRangeMap[i][j];
				}
			}


			placed = false;

			cnt = 0;

			while (cnt < 42 * 42) {
				cnt++;		
				let targetX = -1;
				let targetY = -1;
				let minScore = 999999

				for (let i = 5; i < 45; i++) {
					for (let j = 5; j < 45; j++) {
						// console.log(i, j, finalMap[i][j], minScore)
						if (finalMap[i][j] < minScore) {
							minScore = finalMap[i][j]
							targetX = i;
							targetY = j;
						}						
					}
				}

				// console.log(cnt, targetX, targetY)

				if (targetX < 0 || targetY < 0)  {
					roomMemory.designFailed = true;
					console.log(roomName, "Lab placement failed:", targetX, targetY)
					// throw(new Error())
					return
				}

				finalMap[targetX][targetY] = 999999

				if (storageRangeMap[targetX][targetY] > 15) {
					// console.log("Design failed, labs too far from storage")
					// roomMemory.designFailed = true;
					continue;
				}

				if (spawnBatteryRangeMap[targetX][targetY] > 15) {
					// console.log("Design failed, labs too far from spawn")
					// roomMemory.designFailed = true;
					continue;
				}




			// targetX = Math.round((roomMemory.storageX + roomMemory.spawnBatteryCentreX) / 2);
			// targetY = Math.round((roomMemory.storageY + roomMemory.spawnBatteryCentreY) / 2);

			// for (var radius = 0; radius <= 50; radius++) {
			// 	var limit = radius * 8;
			// 	for (var iter = 0; iter < limit; iter++) {
			// 		if (placed) break;

			// 		var direction = iter % 4;
			// 		var offsetDirection = Math.floor(iter / 4) % 2;
			// 		var offsetAmount = Math.floor((iter + 4) / 8);

			// 		var i;
			// 		var j;

			// 		if (direction == 0) {
			// 			i = offsetAmount * (offsetDirection == 1 ? 1 : -1)
			// 			j = -radius;
			// 		}
			// 		else if (direction == 2) {
			// 			i = offsetAmount * (offsetDirection == 1 ? -1 : 1)
			// 			j = radius;
			// 		}
			// 		else if (direction == 1) {
			// 			i = radius;
			// 			j = offsetAmount * (offsetDirection == 1 ? 1 : -1)
			// 		}
			// 		else if (direction == 3) {
			// 			i = -radius;
			// 			j = offsetAmount * (offsetDirection == 1 ? -1 : 1)
			// 		}


					// if (placed) break;

					// if (Math.max(Math.abs(i), Math.abs(j)) < radius) continue;
				var valid = true;


				for (var innerX = -3; innerX <= 2; innerX++) {
					for (var innerY = -3; innerY <= 2; innerY++) {
						if (Math.abs(innerX) >= 2 && Math.abs(innerY) >= 2) continue;

						if (targetX + innerX >= 49 || targetX + innerX < 1 || targetY + innerY >= 49 || targetY + innerY < 1) {
							valid = false;
							break;
						}

						var terrain = roomMap[targetX + innerX][targetY + innerY]
						// if (targetX + i + innerX >= 49 || targetX + i + innerX < 1 || targetY + j + innerY >= 49 || targetY + j + innerY < 1) {
						// 	valid = false;
						// 	break;
						// }

						// var terrain = roomMap[targetX + i + innerX][targetY + j + innerY]

						if (terrain !== " ") {
							if (!(terrain === "r" && (innerX == -3 || innerY == -3 || innerX == 2 || innerY == 2 || (innerX == -2 && innerY == 1) || (innerX == 1 && innerY == -2)))) {
								valid = false;
								break;
							}
						}
					}
					if (!valid) {
						break;
					}
				}

				if (valid) {
					placed = true;

					var xPos = targetX;
					var yPos = targetY;
					// var xPos = targetX + i;
					// var yPos = targetY + j;

					roomMemory.labPositionX = xPos;
					roomMemory.labPositionY = yPos;

					if (!Memory.season5 || !roomMemory.claimToUnclaimRoom) {
						this.createBuilding(roomMemory, xPos, yPos, STRUCTURE_LAB + "_" + 6);
						roomMap[xPos][yPos] = "b"

						this.createBuilding(roomMemory, xPos - 1, yPos - 1, STRUCTURE_LAB + "_" + 6);
						roomMap[xPos - 1][yPos - 1] = "b"

						this.createBuilding(roomMemory, xPos - 1, yPos + 1, STRUCTURE_LAB + "_" + 6);
						roomMap[xPos - 1][yPos + 1] = "b"

						this.createBuilding(roomMemory, xPos, yPos + 1, STRUCTURE_LAB + "_" + 7);
						roomMap[xPos][yPos + 1] = "b"

						this.createBuilding(roomMemory, xPos + 1, yPos, STRUCTURE_LAB + "_" + 7);
						roomMap[xPos + 1][yPos] = "b"

						this.createBuilding(roomMemory, xPos + 1, yPos - 1, STRUCTURE_LAB + "_" + 7);
						roomMap[xPos + 1][yPos - 1] = "b"

						this.createBuilding(roomMemory, xPos, yPos - 2, STRUCTURE_LAB + "_" + 7);
						roomMap[xPos][yPos - 2] = "b"

						this.createBuilding(roomMemory, xPos - 1, yPos - 2, STRUCTURE_LAB + "_" + 7);
						roomMap[xPos - 1][yPos - 2] = "b"

						this.createBuilding(roomMemory, xPos - 2, yPos - 1, STRUCTURE_LAB + "_" + 7);
						roomMap[xPos - 2][yPos - 1] = "b"

						this.createBuilding(roomMemory, xPos - 2, yPos, STRUCTURE_LAB + "_" + 7);
						roomMap[xPos - 2][yPos] = "b"

						this.createBuilding(roomMemory, xPos - 1, yPos, STRUCTURE_ROAD + "_" + 7);
						roomMap[xPos - 1][yPos] = "r"

						this.createBuilding(roomMemory, xPos, yPos - 1, STRUCTURE_ROAD + "_" + 7);
						roomMap[xPos][yPos - 1] = "r"

						if (roomMap[xPos - 2][yPos + 1] !== "r") {
							this.createBuilding(roomMemory, xPos - 2, yPos + 1, STRUCTURE_ROAD + "_" + 7);
							roomMap[xPos - 2][yPos + 1] = "r"
						}
						if (roomMap[xPos + 1][yPos - 2] !== "r") {
							this.createBuilding(roomMemory, xPos + 1, yPos - 2, STRUCTURE_ROAD + "_" + 7);
							roomMap[xPos + 1][yPos - 2] = "r"
						}


						// if (roomMap[xPos - 3][yPos] === " ") {
						// 	this.createBuilding(roomMemory, xPos -3, yPos, STRUCTURE_ROAD + "_" + 8);
						// 	roomMap[xPos - 3][yPos] = "r"
						// }

						var path = this.getDesignRoadPath(new RoomPosition(xPos - 2, yPos + 1, roomName),
														  new RoomPosition(roomMemory.storageX, roomMemory.storageY, roomName),
														  1,
														  roomMap).path;
						for (var pos of path) {
							if (roomMap[pos.x][pos.y] != "b") {
								this.createBuilding(roomMemory, pos.x, pos.y, STRUCTURE_ROAD + "_" + 7);
								roomMap[pos.x][pos.y] = "r"
							}
						}

						var path = this.getDesignRoadPath(new RoomPosition(xPos + 1, yPos - 2, roomName),
														  new RoomPosition(roomMemory.storageX, roomMemory.storageY, roomName),
														  1,
														  roomMap).path;
						for (var pos of path) {
							if (roomMap[pos.x][pos.y] != "b") {
								this.createBuilding(roomMemory, pos.x, pos.y, STRUCTURE_ROAD + "_" + 7);
								roomMap[pos.x][pos.y] = "r"
							}
						}
					}
				}
				if (placed) {
					break;
				}
			}

			if (!placed && (!Memory.season5 || !roomMemory.claimToUnclaimRoom)) {
				console.log("Design failed, can't place labs")
				roomMemory.designFailed = true;
				return;
			}

			// Extensions.
			// Strategy:
			//   00-00
			//   0-x-0
			//   -xxx-
			//   0-x-0
			//	 00-00
			//   Spiral out from storage with a bit of skew toward sbc, and more skew toward the centre of the map. Plan enough so that total extensions + 5 <= 60.
			// var first = true;

			roomMemory.extenstionStarsX = [];
			roomMemory.extenstionStarsY = [];


			let targetX = Math.round((3 * roomMemory.storageX + 25 + 2 * roomMemory.spawnBatteryCentreX) / 6.);
			let targetY = Math.round((3 * roomMemory.storageY + 25 + 2 * roomMemory.spawnBatteryCentreY) / 6.);

			let targetExtensions = 60

			if (Memory.season5 && roomMemory.claimToUnclaimRoom) {
				targetExtensions = 40
			}


			let overflowGuard = 0;
			while (totalExtensionCount + 5 < targetExtensions && overflowGuard < 100) {
				overflowGuard++;
				placed = false;
				for (var radius = 0; radius <= 50; radius++) {
					var limit = radius * 8;
					for (var iter = 0; iter < limit; iter++) {
						if (placed) break;

						var direction = iter % 4;
						var offsetDirection = Math.floor(iter / 4) % 2;
						var offsetAmount = Math.floor((iter + 4) / 8);

						var i;
						var j;

						if (direction == 0) {
							i = offsetAmount * (offsetDirection == 1 ? 1 : -1)
							j = -radius;
						}
						else if (direction == 2) {
							i = offsetAmount * (offsetDirection == 1 ? -1 : 1)
							j = radius;
						}
						else if (direction == 1) {
							i = radius;
							j = offsetAmount * (offsetDirection == 1 ? 1 : -1)
						}
						else if (direction == 3) {
							i = -radius;
							j = offsetAmount * (offsetDirection == 1 ? -1 : 1)
						}

						if (Math.max(Math.abs(i), Math.abs(j)) < radius) continue;
						var valid = true;

						for (var innerX = -2; innerX <= 2; innerX++) {
							for (var innerY = -2; innerY <= 2; innerY++) {
								if (Math.abs(innerX) + Math.abs(innerY) >= 3) continue;

								if (targetX + i + innerX >= 49 || targetX + i + innerX < 1 || targetY + j + innerY >= 49 || targetY + j + innerY < 1) {
									valid = false;
									break;
								}

								var terrain = roomMap[targetX + i + innerX][targetY + j + innerY]

								if (terrain !== " " && (Math.abs(innerX) + Math.abs(innerY) < 2 || terrain !== "r")) {
									valid = false;
									break;
								}
							}
							if (!valid) {
								break;
							}
						}

						if (valid) {
							placed = true;


							var xPos = targetX + i;
							var yPos = targetY + j;

							roomMemory.extenstionStarsX.push(xPos)
							roomMemory.extenstionStarsY.push(yPos)

							// CLustering. Bias the next one to build near the last one.
							// if (first) {
								targetX = Math.round((3 * targetX + xPos) / 4);
								targetY = Math.round((3 * targetY + yPos) / 4);
								// first = false;
							// }

							totalExtensionCount += 5;

							// Don't actualy build. We'll save that for post-ramparts
							roomMap[xPos][yPos] = "b"
							roomMap[xPos + 1][yPos] = "b"
							roomMap[xPos - 1][yPos] = "b"
							roomMap[xPos][yPos + 1] = "b"
							roomMap[xPos][yPos - 1] = "b"
						}
						if (placed) {
							break;
						}
					}

					if (placed) break;
				}
				if (!placed) {
					break;
				}
			}

			if (!placed) {
				console.log("Design failed, can't place extensions?")
				roomMemory.designFailed = true;
				return;
			}

			roomMemory.designFailed = false;
			if (room) {
				roomMemory.designed = 1;
				roomMemory.roomMap = roomMap;
			}
		}


		if (!segmentData) {
			return;
		}

		// Ok, so we have the design and the ramparts. Now refine the design.
		// "Refine" just means "pull the extension stars inside the ramparts if possible" for now
		if (room && roomMemory.designed == 2 && Memory.tick > 5 && Game.time % NUM_DESIGN_STAGES == 2) {
			if (!segmentData) return;
			let floodedDesign = segmentData[roomName].floodedDesign;

			if (!floodedDesign) return;

			let exitTop = false;
			let exitBottom = false;
			let exitLeft = false;
			let exitRight = false;

			let exitTopPos = 0;
			let exitBottomPos = 0;
			let exitLeftPos = 0;
			let exitRightPos = 0;

			let exitTopCount = 0;
			let exitBottomCount = 0;
			let exitLeftCount = 0;
			let exitRightCount = 0;

			let roomTerrain = Game.map.getRoomTerrain(roomName)

			for (let i = 1; i < 49; i++) {
				if (!(roomTerrain.get(i, 0) & TERRAIN_MASK_WALL)) {
					exitTopPos += i;
					exitTop = true;
					exitTopCount++;
				}
				if (!(roomTerrain.get(i, 49) & TERRAIN_MASK_WALL)) {
					exitBottomPos += i;
					exitBottom = true;
					exitBottomCount++;
				}
				if (!(roomTerrain.get(0, i) & TERRAIN_MASK_WALL)) {
					exitLeftPos += i;
					exitLeft = true;
					exitLeftCount++;
				}
				if (!(roomTerrain.get(49, i) & TERRAIN_MASK_WALL)) {
					exitRightPos += i;
					exitRight = true;
					exitRightCount++;
				}
			}

			exitTopPos /= exitTopCount;
			exitBottomPos /= exitBottomCount;
			exitLeftPos /= exitLeftCount;
			exitRightPos /= exitRightCount;

			let numExits = (exitTop || 0) + (exitBottom || 0) + (exitLeft || 0) + (exitRight || 0);


			// let roomMap = this.generateRoomMap(roomName, true);
			let roomMap = room.memory.roomMap;

			function placeExtensionStar(xPos, yPos) {
				roomDesignAI.createBuilding(roomMemory, xPos, yPos, STRUCTURE_EXTENSION + "_" + 2);
				roomMap[xPos][yPos] = "b"

				roomDesignAI.createBuilding(roomMemory, xPos + 1, yPos, STRUCTURE_EXTENSION + "_" + 2);
				roomMap[xPos + 1][yPos] = "b"

				roomDesignAI.createBuilding(roomMemory, xPos - 1, yPos, STRUCTURE_EXTENSION + "_" + 2);
				roomMap[xPos - 1][yPos] = "b"

				roomDesignAI.createBuilding(roomMemory, xPos, yPos + 1, STRUCTURE_EXTENSION + "_" + 2);
				roomMap[xPos][yPos + 1] = "b"

				roomDesignAI.createBuilding(roomMemory, xPos, yPos - 1, STRUCTURE_EXTENSION + "_" + 2);
				roomMap[xPos][yPos - 1] = "b"

				roomDesignAI.createBuilding(roomMemory, xPos + 2, yPos, STRUCTURE_ROAD + "_" + 5);
				roomMap[xPos + 2][yPos] = "r"

				roomDesignAI.createBuilding(roomMemory, xPos - 2, yPos, STRUCTURE_ROAD + "_" + 5);
				roomMap[xPos - 2][yPos] = "r"


				roomDesignAI.createBuilding(roomMemory, xPos + 1, yPos + 1, STRUCTURE_ROAD + "_" + 5);
				roomMap[xPos + 1][yPos + 1] = "r"

				roomDesignAI.createBuilding(roomMemory, xPos + 1, yPos - 1, STRUCTURE_ROAD + "_" + 5);
				roomMap[xPos + 1][yPos - 1] = "r"


				roomDesignAI.createBuilding(roomMemory, xPos - 1, yPos + 1, STRUCTURE_ROAD + "_" + 5);
				roomMap[xPos - 1][yPos + 1] = "r"

				roomDesignAI.createBuilding(roomMemory, xPos - 1, yPos - 1, STRUCTURE_ROAD + "_" + 5);
				roomMap[xPos - 1][yPos - 1] = "r"

				roomDesignAI.createBuilding(roomMemory, xPos, yPos + 2, STRUCTURE_ROAD + "_" + 5);
				roomMap[xPos][yPos + 2] = "r"

				roomDesignAI.createBuilding(roomMemory, xPos, yPos - 2, STRUCTURE_ROAD + "_" + 5);
				roomMap[xPos][yPos - 2] = "r"

				var path = roomDesignAI.getDesignRoadPath(new RoomPosition(xPos, yPos, roomName),
														  new RoomPosition(roomMemory.storageX, roomMemory.storageY, roomName),
														  1,
														  roomMap).path;


				for (var pos of path) {
					if (roomMap[pos.x][pos.y] != "b") {
						roomDesignAI.createBuilding(roomMemory, pos.x, pos.y, STRUCTURE_ROAD + "_" + 5);
						roomMap[pos.x][pos.y] = "r"
					}
				}

			}

			var extensionCount = 0;

			for (let building of roomMemory.buildings) {
				// console.log(JSON.stringify(building))
				if (building.name.startsWith(STRUCTURE_EXTENSION)) {
					extensionCount++;
				}
			}

			let targetX
			let targetY



			for (var extensionStarIdx in roomMemory.extenstionStarsX) {
				// Is it outside the walls? -1 means outside.
				var currentX = roomMemory.extenstionStarsX[extensionStarIdx]
				var currentY = roomMemory.extenstionStarsY[extensionStarIdx]

				if (parseInt(floodedDesign[currentX][currentY]) === 1) {
					placeExtensionStar(currentX, currentY)
					extensionCount += 5;
				}
				// Move our extensions if they're outside of the walls to inside the walls.
				else {
					targetX = Math.round((3 * roomMemory.storageX + 2 * 25 + roomMemory.spawnBatteryCentreX) / 6.);
					targetY = Math.round((3 * roomMemory.storageY + 2 * 25 + roomMemory.spawnBatteryCentreY) / 6.);

					var placed = false;
					for (var radius = 0; radius <= 50; radius++) {
						var limit = radius * 8;
						for (var iter = 0; iter < limit; iter++) {
							if (placed) break;

							var direction = iter % 4;
							var offsetDirection = Math.floor(iter / 4) % 2;
							var offsetAmount = Math.floor((iter + 4) / 8);

							var i;
							var j;

							if (direction == 0) {
								i = offsetAmount * (offsetDirection == 1 ? 1 : -1)
								j = -radius;
							}
							else if (direction == 2) {
								i = offsetAmount * (offsetDirection == 1 ? -1 : 1)
								j = radius;
							}
							else if (direction == 1) {
								i = radius;
								j = offsetAmount * (offsetDirection == 1 ? 1 : -1)
							}
							else if (direction == 3) {
								i = -radius;
								j = offsetAmount * (offsetDirection == 1 ? -1 : 1)
							}

							if (targetX + i >= 49 || targetX + i < 1 || targetY + j >= 49 || targetY + j < 1 || i >= 49 || i < 1 || j >= 49 || j < 1) continue;

							if (Math.max(Math.abs(i), Math.abs(j)) < radius) continue;

							var valid = true;

							for (var innerX = -2; innerX <= 2; innerX++) {
								for (var innerY = -2; innerY <= 2; innerY++) {
									if (Math.abs(innerX) + Math.abs(innerY) >= 3) continue;

									if (targetX + i + innerX >= 49 || targetX + i + innerX < 1 || targetY + j + innerY >= 49 || targetY + j + innerY < 1) {
										valid = false;
										break;
									}

									// Only move stuff inside.
									if (Math.abs(innerX) + Math.abs(innerY) <= 1 && parseInt(floodedDesign[targetX + i + innerX][targetY + j + innerY]) !== 1) {
										valid = false;
										break;
									}

									var terrain = roomMap[targetX + i + innerX][targetY + j + innerY]

									if (terrain !== " " && (Math.abs(innerX) + Math.abs(innerY) < 2 || terrain !== "r")) {
										valid = false;
										break;
									}
								}
								if (!valid) {
									break;
								}
							}
							if (valid) {
								placed = true;

								for (var innerX = -1; innerX <= 1; innerX++) {
									for (var innerY = -1; innerY <= 1; innerY++) {
										if (Math.abs(innerX) + Math.abs(innerY) >= 2) continue
										roomMap[i][j] = (roomTerrain.get(currentX + innerX, currentY + innerY) & TERRAIN_MASK_WALL) ? "w" : " ";
									}
								}

								var xPos = targetX + i;
								var yPos = targetY + j;

								roomMemory.extenstionStarsX[extensionStarIdx] = xPos
								roomMemory.extenstionStarsY[extensionStarIdx] = yPos

								placeExtensionStar(xPos, yPos);
								extensionCount += 5;
							}
						}

						if (placed) {
							break;
						}
					}
					if (!placed) {
						break;
					}
				}
			}


			let sumExtensionStorageDist = 0;

			for (var extensionStarIdx in roomMemory.extenstionStarsX) {
				sumExtensionStorageDist += Math.max(Math.abs(roomMemory.extenstionStarsX[extensionStarIdx] - roomMemory.storageX), Math.abs(roomMemory.extenstionStarsY[extensionStarIdx] - roomMemory.storageY));
			}

			roomMemory.meanExtensionStorageDist = Math.round(sumExtensionStorageDist / roomMemory.extenstionStarsX.length);


			// Towers (6xtower):
			// Strategy:
			//   5x5 block excluding corners (border for movement)
			//   Sprial from storage/spawn/controller mean.
			placed = false;
			let towerCount = 0;

			if (numExits == 1) {
				// Move 4 "inland" from mean exit position.
				if (exitTop) {
					targetX = Math.round(exitTopPos);
					targetY = 4;
				}
				else if (exitBottom) {
					targetX = Math.round(exitBottomPos);
					targetY = 49 - 4;
				}
				else if (exitLeft) {
					targetX = 4;
					targetY = Math.round(exitLeftPos);
				}
				else if (exitRight) {
					targetX = 49 - 4;
					targetY = Math.round(exitRightPos);
				}
			}
			else {
				targetX = Math.round((roomMemory.storageX + roomMemory.spawnBatteryCentreX) / 2);
				targetY = Math.round((roomMemory.storageY + roomMemory.spawnBatteryCentreY) / 2);
			}

			for (var tower = 0; tower < CONTROLLER_STRUCTURES[STRUCTURE_TOWER][Memory.season5 && roomMemory.claimToUnclaimRoom ? 6 : 8]; tower++) {
				var towerPlaced = false;
				for (var radius = 0; radius <= 50; radius++) {
					if (towerPlaced) break;
					var limit = radius * 8;
					for (var iter = 0; iter < limit; iter++) {
						if (towerPlaced) break;
						var direction = iter % 4;
						var offsetDirection = Math.floor(iter / 4) % 2;
						var offsetAmount = Math.floor((iter + 4) / 8);

						var i;
						var j;

						if (direction == 0) {
							i = offsetAmount * (offsetDirection == 1 ? 1 : -1)
							j = -radius;
						}
						else if (direction == 2) {
							i = offsetAmount * (offsetDirection == 1 ? -1 : 1)
							j = radius;
						}
						else if (direction == 1) {
							i = radius;
							j = offsetAmount * (offsetDirection == 1 ? 1 : -1)
						}
						else if (direction == 3) {
							i = -radius;
							j = offsetAmount * (offsetDirection == 1 ? -1 : 1)
						}

						if (targetX + i >= 49 || targetX + i < 1 || targetY + j >= 49 || targetY + j < 1) continue;

						// Don't place towers outside the walls
						if (parseInt(floodedDesign[targetX + i][targetY + j]) !== 1) {
							continue;
						}

						var valid = true;
						var wallCount = 0;

						for (var innerX = -1; innerX <= 1; innerX++) {
							for (var innerY = -1; innerY <= 1; innerY++) {
								if (Math.abs(innerX) + Math.abs(innerY) > 1) continue;
								if (targetX + i + innerX >= 49 || targetX + i + innerX < 1 || targetY + j + innerY >= 49 || targetY + j + innerY < 1) {
									valid = false;
									break;
								}

								var terrain = roomMap[targetX + i + innerX][targetY + j + innerY]

								if (terrain !== " ") {
									if (!(terrain === "r" && (Math.abs(innerX) == 1 || Math.abs(innerY) == 1))) {
										if (innerX == 0 && innerY == 0) {
											valid = false;
											break;
										}
										else {
											wallCount++;
										}
										if (wallCount > 1) {
											valid = false;
											break;
										}
									}
								}
							}
							if (!valid) {
								break;
							}
						}

						if (valid) {
							var xPos = targetX + i;
							var yPos = targetY + j;

							this.createBuilding(roomMemory, xPos, yPos, STRUCTURE_TOWER + "_" + 0);
							roomMap[xPos][yPos] = "b"

							towerCount++;
							towerPlaced = true;
						}
					}
				}
			}
			if (towerCount == CONTROLLER_STRUCTURES[STRUCTURE_TOWER][Memory.season5 && roomMemory.claimToUnclaimRoom ? 6 : 8]) {
				placed = true;
			}

			if (towerCount < CONTROLLER_STRUCTURES[STRUCTURE_TOWER][Memory.season5 && roomMemory.claimToUnclaimRoom ? 6 : 8]) {
				console.log("Design failed, can't place towers", towerCount)
				roomMemory.designFailed = true;
				if (roomMemory.designed == 2) {
					roomMemory.forceOuterWalls = 1;
					roomMemory.designed = 1;
				}
				return;
			}


			if (!placed) {
				console.log("Design failed, can't place towers 2")
				roomMemory.designFailed = true;
				return;
			}




			// Find a good place to put "high GCL stuff" (1xObserver, 1xNuker. No power spawn)
			// Strategy:
			//   Spiral individually from storage/spawn mean. Treat as 3x3 block excluding corners.
			var objects = []; //[STRUCTURE_OBSERVER];
			if (Memory.swc || Memory.noTerminals || Memory.season1) {
				objects = [STRUCTURE_OBSERVER];
				console.log("Power spawn disabled in room planning")
			}
			else {
				objects = [STRUCTURE_OBSERVER, STRUCTURE_POWER_SPAWN];
			}

			targetX = Math.round(roomMemory.storageX);
			targetY = Math.round(roomMemory.storageY);

			for (var object of objects) {
				placed = false;
				for (var radius = 0; radius <= 50; radius++) {
					var limit = radius * 8;
					for (var iter = 0; iter < limit; iter++) {
						if (placed) break;

						var direction = iter % 4;
						var offsetDirection = Math.floor(iter / 4) % 2;
						var offsetAmount = Math.floor((iter + 4) / 8);

						var i;
						var j;

						if (direction == 0) {
							i = offsetAmount * (offsetDirection == 1 ? 1 : -1)
							j = -radius;
						}
						else if (direction == 2) {
							i = offsetAmount * (offsetDirection == 1 ? -1 : 1)
							j = radius;
						}
						else if (direction == 1) {
							i = radius;
							j = offsetAmount * (offsetDirection == 1 ? 1 : -1)
						}
						else if (direction == 3) {
							i = -radius;
							j = offsetAmount * (offsetDirection == 1 ? -1 : 1)
						}

						if (targetX + i >= 49 || targetX + i < 1 || targetY + j >= 49 || targetY + j < 1) continue;

						if (parseInt(floodedDesign[targetX + i][targetY + j]) !== 1) continue

						var valid = true;

						var wallCount = 0;

						for (var innerX = -1; innerX <= 1; innerX++) {
							for (var innerY = -1; innerY <= 1; innerY++) {
								if (Math.abs(innerX) + Math.abs(innerY) > 1) continue;
								if (targetX + i + innerX >= 49 || targetX + i + innerX < 1 || targetY + j + innerY >= 49 || targetY + j + innerY < 1) {
									valid = false;
									break;
								}

								var terrain = roomMap[targetX + i + innerX][targetY + j + innerY]

								if (terrain !== " ") {
									if (innerX == 0 && innerY == 0) {
										valid = false;
										break;
									}
									else if (!(terrain === "r" && (Math.abs(innerX) == 1 || Math.abs(innerY) == 1))) {
										if (innerX != 0 || innerY != 0) {
											wallCount++;
										}
										else {
											valid = false;
										}
										if (wallCount > 1) {
											valid = false;
											break;
										}
									}
								}
							}
							if (!valid) {
								break;
							}
						}

						if (valid) {
							placed = true;

							var xPos = targetX + i;
							var yPos = targetY + j;

							this.createBuilding(roomMemory, xPos, yPos, object + "_" + 0);
							roomMap[xPos][yPos] = "b"
						}

					}
					if (placed) {
						break;
					}
				}
			}

			if (!placed) {
				console.log("Design failed, can't place extra objects")
				roomMemory.designFailed = true;
				return;
			}


			// Do a fallback point for my troops.
			var placed = false;
			targetX = Math.round((roomMemory.storageX + roomMemory.spawnBatteryCentreX) / 2);
			targetY = Math.round((roomMemory.storageY + roomMemory.spawnBatteryCentreY) / 2);

			for (var fallbackRadius = 3; fallbackRadius >= 0; fallbackRadius--) {
				for (var radius = 0; radius <= 50; radius++) {
					var limit = radius * 8;
					for (var iter = 0; iter < limit; iter++) {
						var direction = iter % 4;
						var offsetDirection = Math.floor(iter / 4) % 2;
						var offsetAmount = Math.floor((iter + 4) / 8);

						var i;
						var j;

						if (direction == 0) {
							i = offsetAmount * (offsetDirection == 1 ? 1 : -1)
							j = -radius;
						}
						else if (direction == 2) {
							i = offsetAmount * (offsetDirection == 1 ? -1 : 1)
							j = radius;
						}
						else if (direction == 1) {
							i = radius;
							j = offsetAmount * (offsetDirection == 1 ? 1 : -1)
						}
						else if (direction == 3) {
							i = -radius;
							j = offsetAmount * (offsetDirection == 1 ? -1 : 1)
						}

						var valid = true;


						for (var innerX = -fallbackRadius; innerX <= fallbackRadius; innerX++) {
							for (var innerY = -fallbackRadius; innerY <= fallbackRadius; innerY++) {

								if (targetX + i + innerX >= 48 || targetX + i + innerX < 2 || targetY + j + innerY >= 48 || targetY + j + innerY < 2) {
									valid = false;
									break;
								}

								var terrain = roomMap[targetX + i + innerX][targetY + j + innerY]

								if (terrain !== " ") {
									valid = false;
									break;
								}
							}
							if (!valid) {
								break;
							}
						}

						if (valid) {
							placed = true;

							roomMemory.fallbackX = targetX + i;
							roomMemory.fallbackY = targetY + j;
							break;
						}
					}
					if (placed) {
						break;
					}

				}

				if (placed) {
					break;
				}
			}

			if (!placed) {
				console.log("Design failed, can't place fallback pos")
				roomMemory.designFailed = true;
				return;
			}


			targetX = Math.round((roomMemory.storageX + roomMemory.spawnBatteryCentreX) / 2);
			targetY = Math.round((roomMemory.storageY + roomMemory.spawnBatteryCentreY) / 2);

			// Pass == 0 - internal by a road
			// Pass == 1 - internal not by a road
			// Pass == 2 - external by a road
			// Pass == 3 - external not by a road
			for (let pass = 0; pass < 4; pass++) {
				let neededExtensions = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][Memory.season5 && roomMemory.claimToUnclaimRoom ? 6 : 8] - extensionCount;
				for (var extId = 0; extId < neededExtensions; extId++) {
					placed = false;
					for (var radius = 0; radius <= 50; radius++) {
						var limit = radius * 8;
						for (var iter = 0; iter < limit; iter++) {
							if (placed) break;

							var direction = iter % 4;
							var offsetDirection = Math.floor(iter / 4) % 2;
							var offsetAmount = Math.floor((iter + 4) / 8);

							var i;
							var j;

							if (direction == 0) {
								i = offsetAmount * (offsetDirection == 1 ? 1 : -1)
								j = -radius;
							}
							else if (direction == 2) {
								i = offsetAmount * (offsetDirection == 1 ? -1 : 1)
								j = radius;
							}
							else if (direction == 1) {
								i = radius;
								j = offsetAmount * (offsetDirection == 1 ? 1 : -1)
							}
							else if (direction == 3) {
								i = -radius;
								j = offsetAmount * (offsetDirection == 1 ? -1 : 1)
							}

							if (Math.max(Math.abs(i), Math.abs(j)) < radius) continue;
							if (targetX + i >= 49 || targetX + i < 1 || targetY + j >= 49 || targetY + j < 1) continue

							if (pass <= 1 && parseInt(floodedDesign[targetX + i][targetY + j]) !== 1) continue

							var valid = true;

							var wallCount = 0;
							var hasRoad = false;

							for (var innerX = -1; innerX <= 1; innerX++) {
								for (var innerY = -1; innerY <= 1; innerY++) {
									// Place next to a road
									if (roomMap[targetX + i + innerX][targetY + j + innerY] === "r") {
										hasRoad = true;
									}

									if (Math.abs(innerX) + Math.abs(innerY) > 1) continue;
									if (targetX + i + innerX >= 49 || targetX + i + innerX < 1 || targetY + j + innerY >= 49 || targetY + j + innerY < 1) {
										valid = false;
										break;
									}

									var terrain = roomMap[targetX + i + innerX][targetY + j + innerY]

									if (terrain !== " ") {
										if (innerX == 0 && innerY == 0) {
											valid = false;
											break;
										}
										else if (terrain !== "r" || (Math.abs(innerX) == 0 && Math.abs(innerY) == 0)) {
											if (innerX != 0 || innerY != 0) {
												wallCount++;
											}
											else {
												valid = false;
												break;
											}
											if (wallCount > 1) {
												valid = false;
												break;
											}
										}
									}
								}
								if (!valid) {
									break;
								}
							}


							if ((hasRoad || pass % 2 == 1) && valid) {
								placed = true;

								var xPos = targetX + i;
								var yPos = targetY + j;

								extensionCount++;
								let level;
								for (level = 1; level <= (Memory.season5 && roomMemory.claimToUnclaimRoom ? 6 : 8); level++) {
									if (CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][level] > extensionCount) {
										break;
									}
								}

								this.createBuilding(roomMemory, xPos, yPos, STRUCTURE_EXTENSION + "_" + (level - 1));
								roomMap[xPos][yPos] = "b"
							}

						}
						if (placed) {
							break;
						}
					}
					if (!placed) {
						break;
					}
				}

			}

			roomMemory.designFailed = false;
			roomMemory.designed = 3;

			room.memory.roomMap = roomMap;
		}


		// if (Memory.tick > 5 && room.name == "W5N8" && Game.time % 10 == 2) {
		// Don't do this on the same tick as the main design
		if ((Memory.tick > 5 && roomMemory.designed == 1 && Game.time % NUM_DESIGN_STAGES == 1) ||
			(Memory.tick > 5 && roomMemory.designed == 3 && Game.time % NUM_DESIGN_STAGES == 3)) {

			if (!room.mem.roomMap) {
				room.mem.roomMap = this.generateRoomMap(roomName, true);
			}


			// Redesign after extensions have moved.
			if (Game.time % NUM_DESIGN_STAGES == 3) {
				if (room) {
					var buildings = roomMemory.buildings;
					for (var building of _.clone(buildings)) {
						if (building.name.startsWith(STRUCTURE_RAMPART)) {
							_.pull(buildings, building);
						}

						// Cull extra road flags from the last step.
						if (building.name.startsWith(STRUCTURE_ROAD)) {
							var splitResult = building.name.split("_");
							var minRCL = parseInt(splitResult[1]);

							let count = 0;

							for (var building2 of _.clone(buildings)) {
								if (building2.name.startsWith(STRUCTURE_ROAD)) {
									count++;
									if (count == 1) {
										continue;
									}
									var splitResult2 = building2.name.split("_");
									var minRCL2 = parseInt(splitResult[1]);

									if (minRCL == minRCL2) {
										// _.pull(buildings, building2);
									}
								}
							}
						}
					}
				}
			}

			var rampartMap;
			var bestRampartCount = 2500;

			// Ok, we've designed. Now to do ramparts.
			// We want the strategy that minimizes rampart count.

			// Ramparts can't cause us to fail, so don't do them if we can't see the room - we only need them
			// if we're ready to flag.
			if (room) {
				for (var rampartMode = 0; rampartMode < NUM_RAMPART_STRATEGIES; rampartMode++) {
					if (segmentData) {
						var result = this.designRamparts(roomName, room.memory.roomMap, rampartMode);

						console.log(roomName, rampartMode, result.rampartCount, Game.cpu.getUsed())

						if (result.rampartCount < bestRampartCount) {
							bestRampartCount = result.rampartCount;
							room.memory.rampartCount = bestRampartCount;

							rampartMap = result.rampartMap;

							segmentData[roomName] = segmentData[roomName] || {}
							segmentData[roomName].floodedDesign = util.compressFloodArray(result.floodFill);
							segments.writeAndLockSegment(segmentID, segmentData);
						}
					}
					else {
						return;
					}
				}
			}


			if (room && rampartMap) {
				for (var i = 0; i < 50; i++) {
					for (var j = 0; j < 50; j++) {
						if (rampartMap[i][j]) {
							this.createBuilding(roomMemory, i, j, STRUCTURE_RAMPART + "_" + 3);

							/*for (let oldRampartPosition of _.clone(oldRampartPositions)) {
								if (oldRampartPosition.getRangeTo(i, j) < 3) {
									_.pull(oldRampartPositions, oldRampartPosition);
								}
							}*/
						}
					}
				}
				/*for (let position of oldRampartPositions) {
					this.createBuilding(roomMemory, position.x, position.y, STRUCTURE_RAMPART + "_" + 3, COLOR_RED);
					Memory.flagCount++;
				}*/
			}
			if (Game.time % NUM_DESIGN_STAGES == 1) {
				roomMemory.designed = 2;
			}
			if (Game.time % NUM_DESIGN_STAGES == 3) {
				// No idea why I need room to be defeined
				if (room) {
					delete room.memory.roomMap;
				}
				roomMemory.designed = 4;
				if (Memory.rooms[roomName].redesignRamparts) {
					Memory.rooms[roomName].redesignRamparts = false;
				}
				delete roomMemory.rampartDesignConfig;
			}
		}


		// Optimize towers
		if (Memory.tick > 5 && roomMemory.designed == 4 && Game.time % NUM_DESIGN_STAGES == 4 && Game.cpu.bucket > 1000 && (!room || !room.dangerous)) {
			// This isn't neccessarily on the back of a regular build as was added later.
			if (!roomMemory.buildings) {				
				if (global.roomBuildings && global.roomBuildings[roomName]) {
					roomMemory.buildings = _.clone(global.roomBuildings[roomName]);
					delete global.roomBuildings[roomName]
					delete Memory.rooms[roomName].compressedBuildings
				}
				else if (Memory.rooms[roomName].compressedBuildings && Game.shard.name != "AppleCrumble") {
					if (global.wasm_module && global.wasm_module.lzw_decode) {
						roomMemory.buildings = JSON.parse(global.wasm_module.lzw_decode(roomMemory.compressedBuildings));
						if (global.roomBuildings && global.roomBuildings[roomName]) {
							delete global.roomBuildings[roomName]
						}
						delete Memory.rooms[roomName].compressedBuildings
					}
				}
				if (!roomMemory.buildings) {
					console.log(roomName, "no roomBuildings to redesign towers")
					return;
				}
			}

			if (global.roomBuildings) {
				delete global.roomBuildings[roomName]
			}

			let segementData = segments.loadSegmentData(50 + roomMemory.ID % 45);

			if (!segementData) {
				console.log(roomName, "waiting for segment to redesign towers")
				return
			}
			let floodedDesign = segementData[roomName].floodedDesign;

			// If we fail just fall back to this
			let backupBuildings = _.clone(roomMemory.buildings)

			if (!room.mem.roomMap) {
				room.mem.roomMap = this.generateRoomMap(roomName, true);
			}

			let allRamparts = []

			// Clear current towers
			for (let building of _.clone(roomMemory.buildings)) {
				let structureType = building.name.split("_")[0]
				if (structureType == STRUCTURE_TOWER) {
					_.pull(roomMemory.buildings, building)
					room.mem.roomMap[building.x || building.pos.x][building.y || building.pos.y] = " "

					console.log("Old tower at ", (building.x || building.pos.x), (building.y || building.pos.y))
				}
				else if (structureType == STRUCTURE_RAMPART) {
					allRamparts.push(building)
				}
			}

			// Two things are important
			// 1) Getting a large sum
			// 2) Having a large min
			let towerDamageMap
			// let towerDamageMapMax

			let currentTowerPos = []

			towerDamageMap = []			
			// towerDamageMapMax = []			
			for (let i = 1; i < 49; i++) {
				towerDamageMap[i] = []
				// towerDamageMapMax[i] = []
				for (let j = 1; j < 49; j++) {
					if (parseInt(floodedDesign[i][j]) !== 1) continue

					let valid = true;
					let hasRoad = false
					let wallCount = 0;
					for (var innerX = -1; innerX <= 1; innerX++) {
						for (var innerY = -1; innerY <= 1; innerY++) {
							if (Math.abs(innerX) + Math.abs(innerY) > 1) continue;
							// Place next to a road
							if (room.mem.roomMap[i + innerX][j + innerY] === "r") {
								hasRoad = true;
							}

							if (i + innerX >= 49 || i + innerX < 1 || j + innerY >= 49 || j + innerY < 1) {
								valid = false;
								break;
							}

							var terrain = room.mem.roomMap[i + innerX][j + innerY]

							if (terrain !== " ") {
								if (!(terrain === "r" && (Math.abs(innerX) == 1 || Math.abs(innerY) == 1))) {
									if (innerX == 0 && innerY == 0) {
										valid = false;
										break;
									}
									else {
										wallCount++;
									}
									if (wallCount > 1) {
										valid = false;
										break;
									}
								}
							}
						}
						if (!valid) {
							break;
						}
					}

					if (!valid || !hasRoad) {
						towerDamageMap[i][j] = -Infinity
						continue
					}


					towerDamageMap[i][j] = 0
					// towerDamageMapMax[i][j] = 0

					let range1 = 0
					let range2 = 0

					for (let rampart of allRamparts) {
						let range = new RoomPosition(rampart.x || rampart.pos.x, rampart.y || rampart.pos.y, roomName).getRangeToXY(i, j)
						let damage = util.getTowerDamageForDist(range + 1)


						// Make sure I can fill them safely
						if (range == 1) {
							range1 = 1
						}
						else if (range == 2) {
							range2 = 1
						}

						// if (damage < 0) {
						// 	damage = 0
						// }

						towerDamageMap[i][j] += damage
						// towerDamageMapMax[i][j] = Math.max(towerDamageMapMax[i][j], damage)
					}

					if (range1) {
						towerDamageMap[i][j] *= 0.25
					}
					else if (range2) {
						towerDamageMap[i][j] *= 0.5	
					}

					// Range is 900->3600
					towerDamageMap[i][j] *= CONTROLLER_STRUCTURES[STRUCTURE_TOWER][Memory.season5 && roomMemory.claimToUnclaimRoom ? 6 : 8] / allRamparts.length

					// Tiebreak is distance to storage
					towerDamageMap[i][j] += 50 - (new RoomPosition(i, j, roomName).getRangeToXY(roomMemory.storageX, roomMemory.storageY))
				}
			}

			// let currentDamageAtRampart = new Map()

			let towerCount = 0
			let lowestRampartPos
			while (towerCount < CONTROLLER_STRUCTURES[STRUCTURE_TOWER][Memory.season5 && roomMemory.claimToUnclaimRoom ? 6 : 8]) {
				let targetX = -1
				let targetY = -1
				let bestScore = -Infinity

				// Find the rampart with the lowest damage on it and create a map for that
				if (towerCount && !lowestRampartPos) {
					let lowestRampartPosDamage = Infinity
					for (let rampart of allRamparts) {
						let damage = 0
						for (let towerPos of currentTowerPos) {
							let range = new RoomPosition(rampart.x || rampart.pos.x, rampart.y || rampart.pos.y, roomName).getRangeToXY(towerPos.x, towerPos.y)
							damage += util.getTowerDamageForDist(range + 1)
						}
						if (damage < lowestRampartPosDamage) {
							lowestRampartPosDamage = damage
							lowestRampartPos = rampart
						}
					}
				}

				for (let i = 1; i <= 49; i++) {
					for (let j = 1; j <= 49; j++) {
						if (parseInt(floodedDesign[i][j]) !== 1) continue

						let score = towerDamageMap[i][j] 

						if (lowestRampartPos) {
							score += util.getTowerDamageForDist(new RoomPosition(i, j, roomName).getRangeToXY(lowestRampartPos.x, lowestRampartPos.y) + 1)
						}

						if (score > bestScore) {
							bestScore = score
							targetX = i
							targetY = j
						}
					}
				}


				if (targetX == -1 || targetY == -1) {
					console.log("No target found", bestScore)
					break
				}

				// Don't check this one again
				towerDamageMap[targetX][targetY] = -Infinity


				if (targetX >= 49 || targetX < 1 || targetY >= 49 || targetY < 1) continue;

				// Don't place towers outside the walls
				if (parseInt(floodedDesign[targetX][targetY]) !== 1) {
					console.log("Somehow failing the second floodedDesign check")
					continue;
				}

				var valid = true;
				let hasRoad = false
				var wallCount = 0;

				for (var innerX = -1; innerX <= 1; innerX++) {
					for (var innerY = -1; innerY <= 1; innerY++) {
						if (Math.abs(innerX) + Math.abs(innerY) > 1) continue;
						// Place next to a road
						if (room.mem.roomMap[targetX + innerX][targetY + innerY] === "r") {
							hasRoad = true;
						}

						if (targetX + innerX >= 49 || targetX + innerX < 1 || targetY + innerY >= 49 || targetY + innerY < 1) {
							valid = false;
							break;
						}

						var terrain = room.mem.roomMap[targetX + innerX][targetY + innerY]

						if (terrain !== " ") {
							if (!(terrain === "r" && (Math.abs(innerX) == 1 || Math.abs(innerY) == 1))) {
								if (innerX == 0 && innerY == 0) {
									valid = false;
									break;
								}
								else {
									wallCount++;
								}
								if (wallCount > 1) {
									valid = false;
									break;
								}
							}
						}
					}
					if (!valid) {
						break;
					}
				}

				if (valid && hasRoad) {
					towerCount++;

					currentTowerPos.push({x: targetX, y: targetY})
					lowestRampartPos = undefined

					this.createBuilding(roomMemory, targetX, targetY, STRUCTURE_TOWER + "_" + 0);
					room.mem.roomMap[targetX][targetY] = "b"

					if (towerCount < CONTROLLER_STRUCTURES[STRUCTURE_TOWER][Memory.season5 && roomMemory.claimToUnclaimRoom ? 6 : 8]) {						
						for (let i = 1; i < 49; i++) {
							for (let j = 1; j < 49; j++) {
								if (parseInt(floodedDesign[i][j]) !== 1) continue


								for (let rampart of allRamparts) {
									// Remove our current contribution
									let range = new RoomPosition(rampart.x || rampart.pos.x, rampart.y || rampart.pos.y, roomName).getRangeToXY(i, j)
									let damage = util.getTowerDamageForDist(range + 1)

									towerDamageMap[i][j] -= damage / allRamparts.length
								}

								// let damage = util.getTowerDamageForDist(new RoomPosition(targetX, targetY, roomName).getRangeToXY(i, j))

								// By moving to this range we slightly counteract the fact that 
								// damage is biased toward large blocks of ramparts over small entrances
								// I don't think it can go negative as that would start bringing up
								// places that were actively worse.
								// 0-600
								// let reRanged = Math.max(0, 600 * (damage - 300) / (600 - 300))

								// towerDamageMap[i][j] -= reRanged
							}
						}
					}

					/*for (let rampart of allRamparts) {
						// Change in contribution due to new tower
						let currentTowerRange = new RoomPosition(rampart.x || rampart.pos.x, rampart.y || rampart.pos.y, roomName).getRangeToXY(targetX, targetY)
						let currentTowerDamage = util.getTowerDamageForDist(currentTowerRange + 1)

						currentTowerDamage = 600 * (currentTowerDamage - 150) / 450

						let difference = (600 - currentTowerDamage) / allRamparts.length

						for (let i = 1; i < 49; i++) {
							for (let j = 1; j < 49; j++) {
								if (parseInt(floodedDesign[i][j]) !== 1) continue

								towerDamageMap[i][j] += difference
							}
						}
					}*/

					// if (towerCount == 4) {
					// 	let vis = new RoomVisual(roomName);
					// 	for (let i = 2; i < 48; i++) {
					// 		for (let j = 2; j < 48; j++) {
					// 			if (parseInt(floodedDesign[i][j]) !== 1) continue
					// 			vis.text(Math.round(towerDamageMap[i][j] / 100), i, j)
					// 		}
					// 	}
					// }


					console.log("New tower at ", targetX, targetY)
				}
				else {
					console.log("Invaid after valid pre-check")
				}
			}

			// Restore from backup
			if (towerCount != CONTROLLER_STRUCTURES[STRUCTURE_TOWER][Memory.season5 && roomMemory.claimToUnclaimRoom ? 6 : 8]) {
				console.log("Failed to redesign towers, going to backup", towerCount)
				roomMemory.buildings = backupBuildings
			}

			if (room) {
				for (let tower of room.towers) {
					let found = false;
					for (let towerPos of currentTowerPos) {
						if (tower.pos.x == towerPos.x && tower.pos.y == towerPos.y)  {
							found = true;
							break
						}
					}
					if (!found) {
						tower.destroy()
					}
				}
			}

			delete room.mem.roomMap
			roomMemory.designed = 5;

		}
	},

	designRamparts : function(roomName, roomMap, rampartMode) {
		// require('minCut').test('W8N9')

		// return
		var roomMemory = Memory.rooms[roomName];

		// If a we include additonal stuff inside the ramparts we get a bonus.
		var costReduction = 0;

		var costs = new customCostMatrix(new Float32Array(2500));
		var rampartMap = new customCostMatrix();

		let roomTerrain = Game.map.getRoomTerrain(roomName)

		// Traversing a non-wall edge has a cost.
		for (var i = 0; i < 50; i++) {
			for (var j = 0; j < 50; j++) {
				if (!(roomTerrain.get(i, j) & TERRAIN_MASK_WALL)) {
					costs.set(i, j, 1);
				}
			}
		}

		let wallMap = [];
		let floodArray = []

		for (var i = 0; i < 50; i++) {
			wallMap[i] = [];
			floodArray[i] = [];
			for (var j = 0; j < 50; j++) {
				wallMap[i][j] = (roomTerrain.get(i, j) & TERRAIN_MASK_WALL) ? 1 : 0;
				floodArray[i][j] = 0;
			}
		}

		// Exits
		let exitTop = false;
		let exitBottom = false;
		let exitLeft = false;
		let exitRight = false;

		let exitTopPos = 0;
		let exitBottomPos = 0;
		let exitLeftPos = 0;
		let exitRightPos = 0;

		let exitTopCount = 0;
		let exitBottomCount = 0;
		let exitLeftCount = 0;
		let exitRightCount = 0;

		// 255 == sink
		function setSink(i, j) {
			costs.set(i, j, 255)
		}

		for (let i = 1; i < 49; i++) {
			if (!(roomTerrain.get(i, 0) & TERRAIN_MASK_WALL)) {
				exitTopPos += i;
				exitTop = true;
				exitTopCount++;

				setSink(i, 1);
				if (!(roomTerrain.get(i+1, 1) & TERRAIN_MASK_WALL)) setSink(i+1, 1);
				if (!(roomTerrain.get(i-1, 1) & TERRAIN_MASK_WALL)) setSink(i-1, 1);
			}
			if (!(roomTerrain.get(i, 49) & TERRAIN_MASK_WALL)) {
				exitBottomPos += i;
				exitBottom = true;
				exitBottomCount++;

				setSink(i, 48);
				if (!(roomTerrain.get(i+1, 48) & TERRAIN_MASK_WALL)) setSink(i+1, 48);
				if (!(roomTerrain.get(i-1, 48) & TERRAIN_MASK_WALL)) setSink(i-1, 48);
			}
			if (!(roomTerrain.get(0, i) & TERRAIN_MASK_WALL)) {
				exitLeftPos += i;
				exitLeft = true;
				exitLeftCount++;

				setSink(1, i);
				if (!(roomTerrain.get(1, i+1) & TERRAIN_MASK_WALL))setSink(1, i+1);
				if (!(roomTerrain.get(1, i-1) & TERRAIN_MASK_WALL))setSink(1, i-1);
			}
			if (!(roomTerrain.get(49, i) & TERRAIN_MASK_WALL)) {
				exitRightPos += i;
				exitRight = true;
				exitRightCount++;

				setSink(48, i);
				if (!(roomTerrain.get(48, i+1) & TERRAIN_MASK_WALL)) setSink(48, i+1);
				if (!(roomTerrain.get(48, i-1) & TERRAIN_MASK_WALL))setSink(48, i-1);
			}
		}

		// 2 on rampart map means "must have"
		// 1 on rampart map means perimeter wall

		// Tunnels
		for (var i = 1; i < 49; i++) {
			for (var j = 1; j < 49; j++) {
				if ((roomTerrain.get(i, j) & TERRAIN_MASK_WALL) && roomMap[i][j] == "r") {
					for (let i2 = -1; i2 <= 1; i2++) {
						for (let j2 = -1; j2 <= 1; j2++) {
							// Not wall
							if (!(roomTerrain.get(i + i2, j + j2) & TERRAIN_MASK_WALL)) {
								rampartMap.set(i + i2, j + j2, 1);
							}
						}
					}
				}
			}
		}

		var xPos = roomMemory.spawnBatteryCentreX;
		var yPos = roomMemory.spawnBatteryCentreY;

		// Spawn battery
		for (var i2 = -3; i2 <= 3; i2++) {
			rampartMap.set(xPos + i2, yPos + 4, 1)
			rampartMap.set(xPos + i2, yPos - 4, 1)
		}
		for (var j2 = -3; j2 <= 3; j2++) {
			rampartMap.set(xPos + 4, yPos + j2, 1);
			rampartMap.set(xPos - 4, yPos + j2, 1);
		}

		rampartMap.set(xPos + 3, yPos + 3, 1);
		rampartMap.set(xPos + 3, yPos - 3, 1);
		rampartMap.set(xPos - 3, yPos - 3, 1);
		rampartMap.set(xPos + 3, yPos + 3, 1);


		// 1 == spawn battery sitters, 2 is outer wall
		// for (var i2 = -1; i2 <= 1; i2++) {
		// 	rampartMap[xPos + i2][yPos + i2] = i2 == 1 ? 2 : 1;
		// 	rampartMap[xPos + i2][yPos - i2] = i2 == 1 ? 2 : 1;
		// 	rampartMap[xPos - i2][yPos + i2] = i2 == 1 ? 2 : 1;
		// 	rampartMap[xPos - i2][yPos - i2] = i2 == 1 ? 2 : 1;
		// }

		// Storage battery
		xPos = roomMemory.storageBatteryX;
		yPos = roomMemory.storageBatteryY;

		for (var i2 = -1; i2 <= 1; i2++) {
			rampartMap.set(xPos + i2, yPos + 2, 1);
			rampartMap.set(xPos + i2, yPos - 2, 1);
		}
		for (var j2 = -1; j2 <= 1; j2++) {
			rampartMap.set(xPos + 2, yPos + j2, 1);
			rampartMap.set(xPos - 2, yPos + j2, 1);
		}

		rampartMap.set(xPos + 1, yPos + 1, 1);
		rampartMap.set(xPos + 1, yPos - 1, 1);
		rampartMap.set(xPos - 1, yPos + 1, 1);
		rampartMap.set(xPos - 1, yPos - 1, 1);

		// rampartMap[xPos][yPos] = 2;

		// Labs
		// console.log("Lab ramparts disabled")
		xPos = roomMemory.labPositionX;
		yPos = roomMemory.labPositionY;

		// Walk around anti-clockwise
		rampartMap.set(xPos + 1, yPos + 1, 1);
		rampartMap.set(xPos + 1, yPos, 1);
		rampartMap.set(xPos + 2, yPos, 1);
		rampartMap.set(xPos + 2, yPos - 1, 1);
		rampartMap.set(xPos + 1, yPos - 1, 1);
		rampartMap.set(xPos + 1, yPos - 2, 1);
		rampartMap.set(xPos, yPos - 2, 1);
		rampartMap.set(xPos, yPos - 3, 1);
		rampartMap.set(xPos-1, yPos - 3, 1);
		rampartMap.set(xPos-1, yPos - 2, 1);
		rampartMap.set(xPos-2, yPos - 2, 1);
		rampartMap.set(xPos-2, yPos - 1, 1);
		rampartMap.set(xPos-3, yPos - 1, 1);
		rampartMap.set(xPos-3, yPos, 1);
		rampartMap.set(xPos-2, yPos, 1);
		rampartMap.set(xPos-1, yPos, 1);
		rampartMap.set(xPos-1, yPos+1, 1);
		rampartMap.set(xPos-1, yPos+2, 1);
		rampartMap.set(xPos, yPos+2, 1);
		rampartMap.set(xPos, yPos+1, 1);

		// Controller
		let controllerExtraRamparts = 0;
		for (var i = -1; i <= 1; i++) {
			for (var j = -1; j <= 1; j++) {
				if (i == 0 && j == 0) continue
				if (roomTerrain.get(roomMemory.conX + i, roomMemory.conY + j) & TERRAIN_MASK_WALL) continue;

				rampartMap.set(roomMemory.conX + i, roomMemory.conY + j, 1);
				controllerExtraRamparts += 1;
			}
		}



		exitTopPos /= exitTopCount;
		exitBottomPos /= exitBottomCount;
		exitLeftPos /= exitLeftCount;
		exitRightPos /= exitRightCount;

		let numExits = (exitTop || 0) + (exitBottom || 0) + (exitLeft || 0) + (exitRight || 0);

		function floodFill(_floodArray, _wallMap, _rampartMap, i, j, value) {
			if (_floodArray[i][j] != value && (!_wallMap || !_wallMap[i][j]) && (!_rampartMap || !_rampartMap.get(i, j))) {
				_floodArray[i][j] = value;
				if (i - 1 >= 0)  floodFill(_floodArray, _wallMap, _rampartMap, i-1, j, value);
				if (i + 1 <= 49) floodFill(_floodArray, _wallMap, _rampartMap, i+1, j, value);
				if (j - 1 >= 0)  floodFill(_floodArray, _wallMap, _rampartMap, i, j-1, value);
				if (j + 1 <= 49) floodFill(_floodArray, _wallMap, _rampartMap, i, j+1, value);

				if (i - 1 >= 0 && j - 1 >= 0)  floodFill(_floodArray, _wallMap, _rampartMap, i-1, j-1, value);
				if (i + 1 <= 49 && j - 1 >= 0) floodFill(_floodArray, _wallMap, _rampartMap, i+1, j-1, value);
				if (i - 1 >= 0 && j + 1 <= 49)  floodFill(_floodArray, _wallMap, _rampartMap, i-1, j+1, value);
				if (i + 1 <= 49 && j + 1 <= 49) floodFill(_floodArray, _wallMap, _rampartMap, i+1, j+1, value);
			}
		}

		function floodFillWithTunnels(_floodArray, _wallMap, _rampartMap, _roomMap, i, j, value) {
			if (_floodArray[i][j] != value && (!_wallMap || !_wallMap[i][j] || _roomMap[i][j] == "r") && (!_rampartMap || !_rampartMap.get(i, j))) {
				_floodArray[i][j] = value;
				if (i - 1 >= 0)  floodFillWithTunnels(_floodArray, _wallMap, _rampartMap, _roomMap, i-1, j, value);
				if (i + 1 <= 49) floodFillWithTunnels(_floodArray, _wallMap, _rampartMap, _roomMap, i+1, j, value);
				if (j - 1 >= 0)  floodFillWithTunnels(_floodArray, _wallMap, _rampartMap, _roomMap, i, j-1, value);
				if (j + 1 <= 49) floodFillWithTunnels(_floodArray, _wallMap, _rampartMap, _roomMap, i, j+1, value);

				if (i - 1 >= 0 && j - 1 >= 0)  floodFillWithTunnels(_floodArray, _wallMap, _rampartMap, _roomMap, i-1, j-1, value);
				if (i + 1 <= 49 && j - 1 >= 0) floodFillWithTunnels(_floodArray, _wallMap, _rampartMap, _roomMap, i+1, j-1, value);
				if (i - 1 >= 0 && j + 1 <= 49)  floodFillWithTunnels(_floodArray, _wallMap, _rampartMap, _roomMap, i-1, j+1, value);
				if (i + 1 <= 49 && j + 1 <= 49) floodFillWithTunnels(_floodArray, _wallMap, _rampartMap, _roomMap, i+1, j+1, value);
			}
		}

		if (rampartMode == RAMPART_BOTTLENECK_GRAPH && !roomMemory.forceOuterWalls) {

			function modifiyTileCost(x, y, costModifier) {
				if (costs.get(x, y) < 255) {
					costs.set(x, y, Math.min(254, costs.get(x, y) + costModifier))
				}
			}

			function modifiyPathTileCost(x, y, costModifier) {
				if (costs.get(x, y) < 255) {
					costs.set(x, y, Math.max(costs.get(x, y), costModifier + 1))
				}
			}

			// Reduce the effective cost of anything going to controller, sources or mineral.
			// The "costModifier" should equal "how many extra ramparts am I willing to pay for this"
			function modifyEdgesOnPath(path, costModifier) {
				console.log(path, costModifier)
				for (var step of path) {
					modifiyPathTileCost(step.x, step.y, costModifier)
				}
			}

			// TODO: Cache cost matrices
			// We've generated a bunch of cost matrices, we're not changing them here, so reuse.
			roomDesignAI.lockCostMatrix(roomName);
			var path;
			path = this.getDesignRoadPath(new RoomPosition(roomMemory.storageX, roomMemory.storageY, roomName),
										  new RoomPosition(roomMemory.spawnBatteryCentreX, roomMemory.spawnBatteryCentreY, roomName),
										  3,
										  roomMap
										  ).path;

			modifyEdgesOnPath(path, roomMemory.rampartDesignConfig.spawnStorageMod);

			// console.log("Lab edge modifiers disabled")
			path = this.getDesignRoadPath(new RoomPosition(roomMemory.storageX, roomMemory.storageY, roomName),
										  new RoomPosition(roomMemory.labPositionX, roomMemory.labPositionY, roomName),
										  1,
										  roomMap
										  ).path;

			modifyEdgesOnPath(path, roomMemory.rampartDesignConfig.storageLabMod);


			path = this.getDesignRoadPath(new RoomPosition(roomMemory.storageX, roomMemory.storageY, roomName),
										  new RoomPosition(roomMemory.conX, roomMemory.conY, roomName),
										  1,
										  roomMap
										  ).path;

			modifyEdgesOnPath(path, roomMemory.rampartDesignConfig.storageConMod + controllerExtraRamparts / 2);

			path = this.getDesignRoadPath(new RoomPosition(roomMemory.conX, roomMemory.conY, roomName),
										  new RoomPosition(roomMemory.spawnBatteryCentreX, roomMemory.spawnBatteryCentreY, roomName),
										  3,
										  roomMap
										  ).path;

			modifyEdgesOnPath(path, roomMemory.rampartDesignConfig.spawnConMod + controllerExtraRamparts / 2);

			for (var sourceIdx = 0; sourceIdx < roomIntel.getNumSources(roomName); sourceIdx++) {
				let sourceX = roomIntel.getSourceX(roomName, sourceIdx);
				let sourceY = roomIntel.getSourceY(roomName, sourceIdx);
				path = this.getDesignRoadPath(new RoomPosition(roomMemory.storageX, roomMemory.storageY, roomName),
											  new RoomPosition(sourceX, sourceY, roomName),
											  1,
											  roomMap
											  ).path;

				modifyEdgesOnPath(path, roomMemory.rampartDesignConfig.srcStorageMod);

				path = this.getDesignRoadPath(new RoomPosition(sourceX, sourceY, roomName),
											  new RoomPosition(roomMemory.spawnBatteryCentreX, roomMemory.spawnBatteryCentreY, roomName),
											  3,
											  roomMap
											  ).path;

				modifyEdgesOnPath(path, roomMemory.rampartDesignConfig.srcSpawnMod);
			}

			// Not worth the effort tbh
			// let mX = roomIntel.getMineralX(roomName)
			// let mY = roomIntel.getMineralY(roomName)

			// path = this.getDesignRoadPath(new RoomPosition(roomMemory.storageX, roomMemory.storageY, roomName),
			// 							  new RoomPosition(mX, mY, roomName),
			// 							  1,
			// 							  roomMap
			// 							  ).path;

			modifyEdgesOnPath(path, roomMemory.rampartDesignConfig.storageMineralMod);


			for (var extenstionStarIdx in roomMemory.extenstionStarsX) {
				path = this.getDesignRoadPath(new RoomPosition(roomMemory.storageX, roomMemory.storageY, roomName),
											  new RoomPosition(roomMemory.extenstionStarsX[extenstionStarIdx], roomMemory.extenstionStarsY[extenstionStarIdx], roomName),
											  1,
											  roomMap
											  ).path;

				modifyEdgesOnPath(path, roomMemory.rampartDesignConfig.storageExtensionMod);
			}



			roomDesignAI.costMatrixLocked[roomName] = false;

			for (var i = 1; i < 49; i++) {
				for (var j = 1; j < 49; j++) {
					if ((i == 2 || i == 47 || j == 2 || j == 47) && !(roomTerrain.get(i, j) & TERRAIN_MASK_WALL)) {
						modifiyTileCost(i, j, roomMemory.rampartDesignConfig.borderCost2)
					}
					else if ((i == 3 || i == 46 || j == 3 || j == 46) && !(roomTerrain.get(i, j) & TERRAIN_MASK_WALL)) {
						modifiyTileCost(i, j, roomMemory.rampartDesignConfig.borderCost3)
					}
					else if ((i == 4 || i == 45 || j == 4 || j == 45) && !(roomTerrain.get(i, j) & TERRAIN_MASK_WALL)) {
						modifiyTileCost(i, j, roomMemory.rampartDesignConfig.borderCost4)
					}
					else if ((i == 5 || i == 44 || j == 5 || j == 44) && !(roomTerrain.get(i, j) & TERRAIN_MASK_WALL)) {
						modifiyTileCost(i, j, roomMemory.rampartDesignConfig.borderCost5)
					}

					if (roomTerrain.get(i, j) & TERRAIN_MASK_SWAMP) {
						modifiyTileCost(i, j, roomMemory.rampartDesignConfig.swampCost)
					}
				}
			}

			// TODO. Just doing towers right now. There was some fancy thing that tried to push it away from other buildings but that's been cut for now
			if (Game.rooms[roomName]) {
				let buildings = roomMemory.buildings;

				let normalizedTowerDamageModifier = roomMemory.rampartDesignConfig.normalizedTowerDamageModifierFinal;

				for (let building of buildings) {
					// In general we want to be 3 or more tiles away from everything.
					// Ignore obvious stuff and stuff that is already ramparted.
					if (building.name.startsWith(STRUCTURE_TOWER)) {
						for (var i = 1; i < 49; i++) {
							for (var j = 1; j < 49; j++) {
								let range = Math.max(Math.abs(i - (building.x || building.pos.x)), Math.abs(j - (building.y || building.pos.y)));
								if (roomMemory.designed == 3) {
									// From 0->1
									let normalizedDamage = (600 - util.getTowerDamageForDist(range)) / 450;
									modifiyTileCost(i, j, normalizedDamage * normalizedTowerDamageModifier);
								}

								// Really don't want useful stuff on my outer walls.
								if (range == 0) {
									modifiyTileCost(i, j, roomMemory.rampartDesignConfig.buildingOnRampartCost * (roomMemory.designed == 1 ? 2 : 1))
								}
							}
						}
					}
					else if (!building.name.startsWith(STRUCTURE_ROAD) &&
							!building.name.startsWith(STRUCTURE_RAMPART) &&
							!building.name.startsWith(STRUCTURE_SPAWN) &&
							!building.name.startsWith(STRUCTURE_STORAGE) &&
							!building.name.startsWith(STRUCTURE_TERMINAL)) {
						let isExtension = building.name.startsWith(STRUCTURE_EXTENSION)
						let isContainer = building.name.startsWith(STRUCTURE_CONTAINER)

						let buildingX = (building.x || building.pos.x)
						let buildingY = (building.y || building.pos.y)

						for (let dx = -2; dx <= 2; dx++) {
							for (let dy = -2; dy <= 2; dy++) {
								let delta;
								if (dx == 0 && dy == 0) {
									delta = roomMemory.rampartDesignConfig.buildingOnRampartCost * (roomMemory.designed == 1 ? 2 : 1);
								}
								else {
									delta = roomMemory.rampartDesignConfig.buildinginRangeCostExtension * (roomMemory.designed == 1 ? 2 : 1) * (isExtension ? 1 : roomMemory.rampartDesignConfig.buildinginRangeCostNonExtensionMod);

									delta *= 4;
									delta /= (Math.abs(dx) + Math.abs(dy))
								}

								if (isContainer) {
									delta /= 4;
								}

								modifiyTileCost(buildingX + dx, buildingY + dy, delta)
							}
						}

					}
				}
				// Don't have towers yet. Assume they're on the storage/spawn centroid
				if (roomMemory.designed == 1) {
					let towerCentroidX;
					let towerCentroidY;
					if (numExits == 1) {
						if (exitTop) {
							towerCentroidX = Math.round(exitTopPos);
							towerCentroidY = 4;
						}
						else if (exitBottom) {
							towerCentroidX = Math.round(exitBottomPos);
							towerCentroidY = 49 - 4;
						}
						else if (exitLeft) {
							towerCentroidX = 4;
							towerCentroidY = Math.round(exitLeftPos);
						}
						else if (exitRight) {
							towerCentroidX = 49 - 4;
							towerCentroidY = Math.round(exitRightPos);
						}
					}
					else {
						towerCentroidX = Math.round((roomMemory.storageX + roomMemory.spawnBatteryCentreX) / 2);
						towerCentroidY = Math.round((roomMemory.storageY + roomMemory.spawnBatteryCentreY) / 2);
					}

					// Bring the walls in tight, then the next phase may push them out.
					normalizedTowerDamageModifier = roomMemory.rampartDesignConfig.normalizedTowerDamageModifierFirst;
					for (var i = 1; i < 49; i++) {
						for (var j = 1; j < 49; j++) {
							let range = Math.max(Math.abs(i - towerCentroidX), Math.abs(j - towerCentroidY));

							let normalizedDamage = (600 - util.getTowerDamageForDist(range)) / 450;
							modifiyTileCost(i, j, 6 * normalizedDamage * normalizedTowerDamageModifier)
						}
					}
				}
			}

			console.log(Game.cpu.getUsed())

			// https://www.geeksforgeeks.org/minimum-cut-in-a-directed-graph/
			var V = 5002;

			// Returns true if there is a path from source 's' to sink 't' in
			//  residual graph. Also fills parent[] to store the path
			function bfs(rGraph, s, t, parent) {
				// Create a visited array and mark all vertices as not visited
				var visited = new Int8Array(V);
				// for (var i = 0; i < V; i++) {
				// 	visited[i] = false;
				// }

				// Create a queue, enqueue source vertex and mark source vertex
				// as visited
				var q = [];
				q.push(s);
				visited[s] = 1;
				parent[s] = -1;

				// Standard BFS Loop
				while (q.length) {
					var u = q.pop();

					for (var _v in rGraph[u]) {
						let v = parseInt(_v)
						if (visited[v] === 0 && rGraph[u][v] > 0) {
							q.push(v);
							parent[v] = u;
							visited[v] = 1;

							if (v === t) {
								return true;
							}
						}
					}
				}

				// console.log(JSON.stringify(visited))

				// If we reached sink in BFS starting from source, then return
				// true, else false
				return (visited[t] == 1);
			}

			// A DFS based function to find all reachable vertices from s.  The function
			// marks visited[i] as true if i is reachable from s.  The initial values in
			// visited[] must be false. We can also use BFS to find reachable vertices
			function dfs(rGraph, s, visited) {
				visited[s] = true;
				for (var _i in rGraph[s]) {
					let i = parseInt(_i)
					if (rGraph[s][i] && !visited[i]) {
					   dfs(rGraph, i, visited);
				    }
				}
			}

			// Prints the minimum s-t cut
			function minCut(graph, s, t) {
				var u;
				var v;

				// Create a residual graph and fill the residual graph with
				// given capacities in the original graph as residual capacities
				// in residual graph
				// rGraph[i][j] indicates residual capacity of edge i-j

				let rGraph = JSON.parse(JSON.stringify(graph))

				var parent = [];  // This array is filled by BFS and to store path

			 	var max_flow = 0;  // There is no flow initially
				// Augment the flow while tere is path from source to sink
				while (bfs(rGraph, s, t, parent)) {
					// Find minimum residual capacity of the edges along the
					// path filled by BFS. Or we can say find the maximum flow
					// through the path found.
					var path_flow = 10000000;
					for (v = t; v != s; v = parent[v]) {
						u = parent[v];
						path_flow = Math.min(path_flow, (rGraph[u][v] || 0));
					}

					// update residual capacities of the edges and reverse edges
					// along the path
					for (v = t; v != s; v = parent[v]) {
						u = parent[v];
						if (rGraph[u][v] !== undefined) {
							rGraph[u][v] -= path_flow;
						}
						if (rGraph[v][u] !== undefined) {
							rGraph[v][u] += path_flow;
						}
					}

					max_flow += path_flow;
				}

				// console.log(JSON.stringify(rGraph))

				// Flow is maximum now, find vertices reachable from s
				var visited = [];
				for (var i = 0; i < V; i++) {
					visited[i] = false;
				}
				dfs(rGraph, s, visited);

			 	// var liveEdges = []
			 	var edgeVertices = []
				// Print all edges that are from a reachable vertex to
				// non-reachable vertex in the original graph
				for (var i = 0; i < V; i++) {
					if (!visited[i]) continue;
					for (let j in graph[i]) {
						if (/*visited[i] && */!visited[j] && graph[i][j]) {
							edgeVertices.push(i)
							// liveEdges.push([i, parseInt(j)])
						}
					}
				}

				return edgeVertices;
			}

			var graph = [];
			let x 
			let y 

			for (var v = 0; v < 5002; v++) {
				graph.push({})
			}

			// Adding a rampart is going from "top" to "bottom"
			// We then have high flow to all neighbours
			// Top is 0->2500
			// Bottom is 2500->5000
			// Source is 5000
			// Sink is 5001
			let vis = new RoomVisual(roomName)

			for (var v = 0; v < 2500; v++) {
				x = v % 50;
				y = Math.floor(v / 50);

				if ((roomTerrain.get(x, y) & TERRAIN_MASK_WALL)) continue;

				vis.text(costs.get(x, y), x, y)

				graph[v][v+2500] = Math.max(1, Math.round(costs.get(x, y)))
				graph[v+2500][v] = 0

				for (let dx = -1; dx <= 1; dx++) {
					if (x + dx < 0 || x + dx > 49) continue
					for (let dy = -1; dy <= 1; dy++) {
						if (dx == 0 && dy == 0) continue;
						if (y + dy < 0 || y + dy > 49) continue

						graph[v+2500][v + dx + dy * 50] = 100000
						graph[v + dx + dy * 50][v+2500] = 0
					}
				}

				// Sources
				if (x >= roomMemory.spawnBatteryCentreX - 3 && 
					x <= roomMemory.spawnBatteryCentreX + 3 &&
					y >= roomMemory.spawnBatteryCentreY - 3 &&
					y <= roomMemory.spawnBatteryCentreY + 3) {
					graph[v][5000] = 0;
					graph[5000][v] = 100000;
				}
				if (x >= roomMemory.storageBatteryX - 2 && 
					x <= roomMemory.storageBatteryX + 2 &&
					y >= roomMemory.storageBatteryY - 2 &&
					y <= roomMemory.storageBatteryY + 2) {
					graph[v][5000] = 0;
					graph[5000][v] = 100000;
				}
				if (x >= roomMemory.labPositionX - 2 && 
					x <= roomMemory.labPositionX + 2 &&
					y >= roomMemory.labPositionY - 2 &&
					y <= roomMemory.labPositionY + 2) {
					graph[v][5000] = 0;
					graph[5000][v] = 100000;
				}
				if (x >= roomMemory.conX - 1 && 
					x <= roomMemory.conX + 1 &&
					y >= roomMemory.conY - 1 &&
					y <= roomMemory.conY + 1) {
					graph[v][5000] = 0;
					graph[5000][v] = 100000;
				}

				// Sinks
				if (costs.get(x, y) == 255) {
					graph[v][5001] = 100000;
					graph[5001][v] = 0;
				}
			}

			console.log(Game.cpu.getUsed())

			var edgeVertices = minCut(graph, 5000, 5001);

			console.log(Game.cpu.getUsed())
			console.log(edgeVertices.length)

			for (var edgeVertex of edgeVertices) {
				let vertex = {x: edgeVertex % 50, y: Math.floor(edgeVertex / 50)}

				rampartMap.set(vertex.x, vertex.y, 1);
				vis.circle(vertex.x, vertex.y, {radius: 0.5})
			}

		}

		if ((rampartMode == RAMPART_BUNKER_SIMPLE_FUSION || rampartMode == RAMPART_BUNKER_COMPLEX_FUSION || rampartMode == RAMPART_BOTTLENECK_GRAPH) && !roomMemory.forceOuterWalls) {
			// Remove "interior" perimeters

			var exits = [];

			for (var i = 0; i < 50; i++) {
				if (!(roomTerrain.get(i, 0) & TERRAIN_MASK_WALL)) exits.push(new RoomPosition(i, 0, roomName))
				if (!(roomTerrain.get(0, i) & TERRAIN_MASK_WALL)) exits.push(new RoomPosition(0, i, roomName))
				if (!(roomTerrain.get(i, 49) & TERRAIN_MASK_WALL)) exits.push(new RoomPosition(i, 49, roomName))
				if (!(roomTerrain.get(49, i) & TERRAIN_MASK_WALL)) exits.push(new RoomPosition(49, i, roomName))
			}

			// Now do a flood fill and remove any full inside
			for (var i = 0; i < 50; i++) {
				for (var j = 0; j < 50; j++) {
					floodArray[i][j] = 0;
				}
			}


			for (var exit of exits) {
				if (!floodArray[exit.x][exit.y]) {
					floodFillWithTunnels(floodArray, wallMap, rampartMap, roomMap, exit.x, exit.y, 1)
				}
			}

			// Removes encircled "perimeter" ramparts
			for (var i = 1; i < 49; i++) {
				for (var j = 1; j < 49; j++) {
					if (rampartMap.get(i, j) == 1) {
						// Everything is 0
						if (!floodArray[i-1][j-1] && !floodArray[i][j-1] && !floodArray[i+1][j-1] &&
							!floodArray[i-1][j  ] &&						!floodArray[i+1][j  ] &&
							!floodArray[i-1][j+1] && !floodArray[i][j+1] && !floodArray[i+1][j+1]) {
							rampartMap.set(i, j, 0)
						}
						// 1s
						if (						floodArray[i][j-1] &&
							floodArray[i-1][j  ] &&						  floodArray[i+1][j  ] &&
													floodArray[i][j+1]) {
							rampartMap.set(i, j, 0)
						}
					}
				}
			}
		}

		// Flood fill on home areas and check for bonuses!
		for (var i = 0; i < 50; i++) {
			for (var j = 0; j < 50; j++) {
				if (rampartMap.get(i, j)) {
					floodArray[i][j] = 2;
				}
				else {
					floodArray[i][j] = 0;
				}
			}
		}

		floodFill(floodArray, wallMap, rampartMap, roomMemory.spawnBatteryCentreX, roomMemory.spawnBatteryCentreY, 1);

		function isExternallyVisible() {
			for (var i = 0; i < 50; i++) {
				if (floodArray[i][0] == 1 && !(roomTerrain.get(i, 0) & TERRAIN_MASK_WALL)) {
					return 1
				}
				if (floodArray[i][49] == 1 && !(roomTerrain.get(i, 49) & TERRAIN_MASK_WALL)) {
					return 1
				}
				if (floodArray[0][i] == 1 && !(roomTerrain.get(0, i) & TERRAIN_MASK_WALL)) {
					return 1
				}
				if (floodArray[49][i] == 1 && !(roomTerrain.get(49, i) & TERRAIN_MASK_WALL)) {
					return 1
				}
			}
			return 0;
		}

		let stuffExternallyVisible = isExternallyVisible();

		if (stuffExternallyVisible) {
			console.log("Spawn externally visible!")
		}

		if (floodArray[roomMemory.storageBatteryX][roomMemory.storageBatteryY] != 1) {
			floodFill(floodArray, wallMap, rampartMap, roomMemory.storageBatteryX, roomMemory.storageBatteryY, 1);
		}
		// Storage and spawn are connected!
		else {
			// console.log("Spawn and storage")
			costReduction += 3;
		}

		if (!stuffExternallyVisible) {
			stuffExternallyVisible = isExternallyVisible();
			if (stuffExternallyVisible) {
				console.log("Storage externally visible!")
			}
		}

		if (stuffExternallyVisible || roomMemory.forceOuterWalls) {
			// Fook. Build edge walls.
			for (var i = 0; i < 50; i++) {
				rampartMap[i] = [];
				for (var j = 0; j < 50; j++) {
					rampartMap[i][j] = 0;
				}
			}

			function rampartSquare(x, y) {
				for (let i = -2; i <= 2; i++) {
					if (x + i < 1 || x + i > 48) continue
					for (let j = -2; j <= 2; j++) {
						if (y + j < 1 || y + j > 48) continue

						rampartMap[x+i][y+j] = 1;
					}
				}
			}

			for (var i = 0; i < 50; i++) {
				if (!roomTerrain.get(i, 0) & TERRAIN_MASK_WALL) {
					rampartSquare(i, 0);
				}
				if (!roomTerrain.get(i, 49) & TERRAIN_MASK_WALL) {
					rampartSquare(i, 49);
				}
				if (!roomTerrain.get(0, i) & TERRAIN_MASK_WALL) {
					rampartSquare(0, i);
				}
				if (!roomTerrain.get(49, i) & TERRAIN_MASK_WALL) {
					rampartSquare(49, i);
				}
			}
			for (var i = 0; i < 50; i++) {
				if (!roomTerrain.get(i, 0) & TERRAIN_MASK_WALL) {
					rampartMap[i][1] = 0;
				}
				if (!roomTerrain.get(i, 49) & TERRAIN_MASK_WALL) {
					rampartMap[i][48] = 0;
				}
				if (!roomTerrain.get(0, i) & TERRAIN_MASK_WALL) {
					rampartMap[1][i] = 0;
				}
				if (!roomTerrain.get(49, i) & TERRAIN_MASK_WALL) {
					rampartMap[48][i] = 0;
				}
			}

			for (var i = 0; i < 50; i++) {
				for (var j = 0; j < 50; j++) {
					if (rampartMap[i][j]) {
						floodArray[i][j] = 2;
					}
					else {
						floodArray[i][j] = 0;
					}
				}
			}

			floodFill(floodArray, wallMap, rampartMap, roomMemory.storageBatteryX, roomMemory.storageBatteryY, 1);

			// Removes encircled "perimeter" ramparts
			/*for (var i = 1; i < 49; i++) {
				for (var j = 1; j < 49; j++) {
					if (rampartMap[i][j] == 1) {
						// Everything is 0
						if (!floodArray[i-1][j-1] && !floodArray[i][j-1] && !floodArray[i+1][j-1] &&
							!floodArray[i-1][j  ] &&						!floodArray[i+1][j  ] &&
							!floodArray[i-1][j+1] && !floodArray[i][j+1] && !floodArray[i+1][j+1]) {
							rampartMap[i][j] = 0;
						}
						// 1s
						if (						floodArray[i][j-1] &&
							floodArray[i-1][j  ] &&						  floodArray[i+1][j  ] &&
													floodArray[i][j+1]) {
							rampartMap[i][j] = 0;
						}

						if (wallMap[i][j]) {
							rampartMap[i][j] = 0;
						}
					}
				}
			}*/
		}

		let rampartArray = [];

		var rampartCount = 0;
		for (var i = 0; i < 50; i++) {
			rampartArray[i] = [];
			for (var j = 0; j < 50; j++) {
				rampartArray[i][j] = rampartMap.get(i, j);
				if (rampartMap.get(i, j) >= 1) {
					rampartCount++;
				}
			}
		}

		var result = {};
		result.rampartCount = rampartCount;
		result.rampartMap = rampartArray;
		result.floodFill = floodArray;


		return result;
	},

	factoryRetroFit : function(roomName) {	
		if (!Game.rooms[roomName]) {
			console.log("Trying to do a refit on an unseen room???")
			return;
		}
		if (Game.rooms[roomName].factory) {
			console.log(roomName, "has factory")
			return;
		}

		if (!global.roomBuildings[roomName]) {
			console.log("No global roomBuildings on", roomName)
			return;

		}
		let roomMemory = Memory.rooms[roomName];

		let segementData = segments.loadSegmentData(50 + roomMemory.ID % 45);

		if (!segementData) {
			console.log("No segment data for", roomName)
			return;
		}

		let floodedDesign = segementData[roomName].floodedDesign;

		roomMemory.buildings = global.roomBuildings[roomName];
		delete roomMemory.compressedBuildings;

		let hasFactory = false;
		for (let building of roomMemory.buildings) {
			if (building.name.startsWith(STRUCTURE_FACTORY)) {
				hasFactory = true;
				break;
			}
		}
		if (hasFactory) {
			console.log(roomName, "has factory plan")
			return
		}

		let x = roomMemory.storageBatteryX;
		let y = roomMemory.storageBatteryY + 1;

		for (let building of roomMemory.buildings) {
			if (building.x == x && building.y == y) {
				building.name = "factory_7"
				break;
			}
		}
		for (let extension of Game.rooms[roomName].extensions) {
			if (extension.pos.x == x && extension.pos.y == y) {
				extension.destroy()
			}
		}

		let targetX = Math.round((roomMemory.storageX + roomMemory.spawnBatteryCentreX) / 2);
		let targetY = Math.round((roomMemory.storageY + roomMemory.spawnBatteryCentreY) / 2);

		let roomMap = this.generateRoomMap(roomName, false)

		let room = Game.rooms[roomName];

		for (let building of roomMemory.buildings) {
			if (building.name.startsWith(STRUCTURE_ROAD)) {
				roomMap[building.x || building.pos.x][building.y || building.pos.y] = "r";
			}
			else if (building.name.includes(STRUCTURE_CONTAINER)) {
				roomMap[building.x || building.pos.x][building.y || building.pos.y] = "d";
			}
			else if (!building.name.startsWith(STRUCTURE_RAMPART)) {
				roomMap[building.x || building.pos.x][building.y || building.pos.y] = "b";
			}
		}

		let neededExtensions = 1;
		let placed = false;
		for (var radius = 0; radius <= 50; radius++) {
			var limit = radius * 8;
			for (var iter = 0; iter < limit; iter++) {
				if (placed) break;

				var direction = iter % 4;
				var offsetDirection = Math.floor(iter / 4) % 2;
				var offsetAmount = Math.floor((iter + 4) / 8);

				var i;
				var j;

				if (direction == 0) {
					i = offsetAmount * (offsetDirection == 1 ? 1 : -1)
					j = -radius;
				}
				else if (direction == 2) {
					i = offsetAmount * (offsetDirection == 1 ? -1 : 1)
					j = radius;
				}
				else if (direction == 1) {
					i = radius;
					j = offsetAmount * (offsetDirection == 1 ? 1 : -1)
				}
				else if (direction == 3) {
					i = -radius;
					j = offsetAmount * (offsetDirection == 1 ? -1 : 1)
				}

				if (Math.max(Math.abs(i), Math.abs(j)) < radius) continue;
				if (targetX + i >= 49 || targetX + i < 1 || targetY + j >= 49 || targetY + j < 1) continue

				if (parseInt(floodedDesign[targetX + i][targetY + j]) !== 1) continue

				var valid = true;

				var wallCount = 0;
				var hasRoad = false;

				for (var innerX = -1; innerX <= 1; innerX++) {
					for (var innerY = -1; innerY <= 1; innerY++) {
						// Place next to a road
						if (roomMap[targetX + i + innerX][targetY + j + innerY] === "r") {
							hasRoad = true;
						}

						if (Math.abs(innerX) + Math.abs(innerY) > 1) continue;
						if (targetX + i + innerX >= 49 || targetX + i + innerX < 1 || targetY + j + innerY >= 49 || targetY + j + innerY < 1) {
							valid = false;
							break;
						}

						var terrain = roomMap[targetX + i + innerX][targetY + j + innerY]

						if (terrain !== " ") {
							if (innerX == 0 && innerY == 0) {
								valid = false;
								break;
							}
							else if (terrain !== "r" || (Math.abs(innerX) == 0 && Math.abs(innerY) == 0)) {
								if (innerX != 0 || innerY != 0) {
									wallCount++;
								}
								else {
									valid = false;
									break;
								}
								if (wallCount > 1) {
									valid = false;
									break;
								}
							}
						}
					}
					if (!valid) {
						break;
					}
				}


				if (hasRoad && valid) {
					placed = true;

					var xPos = targetX + i;
					var yPos = targetY + j;

					roomMemory.buildings.push({x:xPos, y:yPos, name: STRUCTURE_EXTENSION + "_" + 8});
				}

			}
			if (placed) {
				break;
			}
		}

		console.log("Factory retrofit complete?", roomName)
	},


	seasonExtensionRedesign : function(roomName) {	
		if (!Game.rooms[roomName]) {
			console.log("Trying to do a refit on an unseen room???")
			return;
		}

		if (!global.roomBuildings[roomName]) {
			console.log("No global roomBuildings on", roomName)
			return;

		}
		let roomMemory = Memory.rooms[roomName];

		let segementData = segments.loadSegmentData(50 + roomMemory.ID % 45);

		if (!segementData) {
			console.log("No segment data for", roomName)
			return;
		}

		let floodedDesign = segementData[roomName].floodedDesign;

		roomMemory.buildings = global.roomBuildings[roomName];
		delete roomMemory.compressedBuildings;

		let x = roomMemory.storageBatteryX + 1;
		let y = roomMemory.storageBatteryY + 1;

		let pulled = false

		for (let building of _.clone(roomMemory.buildings)) {
			if (building.x == x && building.y == y) {
				// console.log("Want to pull", JSON.stringify(building))
				// return
				_.pull(roomMemory.buildings, building)
				pulled = true
				break;
			}
		}

		if (!pulled) {
			console.log("Pulled failed not destroyed")
			return
		}

		// console.log("abc")
		// return

		let destroyed = false

		for (let extension of Game.rooms[roomName].extensions) {
			if (extension.pos.x == x && extension.pos.y == y) {
				extension.destroy()
				destroyed = true
			}
		}

		if (!destroyed) {
			console.log("Redesign failed not destroyed")
			return
		}

		let targetX = Math.round((roomMemory.storageX + roomMemory.spawnBatteryCentreX) / 2);
		let targetY = Math.round((roomMemory.storageY + roomMemory.spawnBatteryCentreY) / 2);

		let roomMap = this.generateRoomMap(roomName, false)

		let room = Game.rooms[roomName];

		for (let building of roomMemory.buildings) {
			if (building.name.startsWith(STRUCTURE_ROAD)) {
				roomMap[building.x || building.pos.x][building.y || building.pos.y] = "r";
			}
			else if (building.name.includes(STRUCTURE_CONTAINER)) {
				roomMap[building.x || building.pos.x][building.y || building.pos.y] = "d";
			}
			else if (!building.name.startsWith(STRUCTURE_RAMPART)) {
				roomMap[building.x || building.pos.x][building.y || building.pos.y] = "b";
			}
		}

		let neededExtensions = 1;
		let placed = false;
		for (var radius = 0; radius <= 50; radius++) {
			var limit = radius * 8;
			for (var iter = 0; iter < limit; iter++) {
				if (placed) break;

				var direction = iter % 4;
				var offsetDirection = Math.floor(iter / 4) % 2;
				var offsetAmount = Math.floor((iter + 4) / 8);

				var i;
				var j;

				if (direction == 0) {
					i = offsetAmount * (offsetDirection == 1 ? 1 : -1)
					j = -radius;
				}
				else if (direction == 2) {
					i = offsetAmount * (offsetDirection == 1 ? -1 : 1)
					j = radius;
				}
				else if (direction == 1) {
					i = radius;
					j = offsetAmount * (offsetDirection == 1 ? 1 : -1)
				}
				else if (direction == 3) {
					i = -radius;
					j = offsetAmount * (offsetDirection == 1 ? -1 : 1)
				}

				if (Math.max(Math.abs(i), Math.abs(j)) < radius) continue;
				if (targetX + i >= 49 || targetX + i < 1 || targetY + j >= 49 || targetY + j < 1) continue

				if (parseInt(floodedDesign[targetX + i][targetY + j]) !== 1) continue

				var valid = true;

				var wallCount = 0;
				var hasRoad = false;

				for (var innerX = -1; innerX <= 1; innerX++) {
					for (var innerY = -1; innerY <= 1; innerY++) {
						// Place next to a road
						if (roomMap[targetX + i + innerX][targetY + j + innerY] === "r") {
							hasRoad = true;
						}

						if (Math.abs(innerX) + Math.abs(innerY) > 1) continue;
						if (targetX + i + innerX >= 49 || targetX + i + innerX < 1 || targetY + j + innerY >= 49 || targetY + j + innerY < 1) {
							valid = false;
							break;
						}

						var terrain = roomMap[targetX + i + innerX][targetY + j + innerY]

						if (terrain !== " ") {
							if (innerX == 0 && innerY == 0) {
								valid = false;
								break;
							}
							else if (terrain !== "r" || (Math.abs(innerX) == 0 && Math.abs(innerY) == 0)) {
								if (innerX != 0 || innerY != 0) {
									wallCount++;
								}
								else {
									valid = false;
									break;
								}
								if (wallCount > 1) {
									valid = false;
									break;
								}
							}
						}
					}
					if (!valid) {
						break;
					}
				}


				if (hasRoad && valid) {
					placed = true;

					var xPos = targetX + i;
					var yPos = targetY + j;

					roomMemory.buildings.push({x:xPos, y:yPos, name: STRUCTURE_EXTENSION + "_" + 8});
				}

			}
			if (placed) {
				break;
			}
		}

		console.log("Extension retrofit complete?", roomName)
	},


	updateDesignAndBuild : function(roomName) {
		var room = Game.rooms[roomName];

		if (!room || !room.controller || !room.controller.my) return;

		// if (Math.random() < 0.001) {
		// 	this.factoryRetroFit(roomName)
		// }
	
		if (room.name == Memory.visRoomDesign) {
			require("roomVisualExtensions")
			let buildings = roomDesignAI.getBuildings(room.name) || [];
			buildings = buildings.concat(Memory.rooms[roomName].tmpBuildings || []).concat(Memory.rooms[roomName].pressureBuildings || []);
			for (let building of buildings) {
				if (building.name.split("_")[0].includes("link") || building.name.split("_")[0].includes("Link")) {
					room.visual.structure(building.x || building.pos.x, building.y || building.pos.y, "link", {opacity: 0.5})
				}
				else if (building.name.split("_")[0].includes("container") || building.name.split("_")[0].includes("Container")) {
					room.visual.structure(building.x || building.pos.x, building.y || building.pos.y, "container", {opacity: 0.5})
				}
				else {
					room.visual.structure(building.x || building.pos.x, building.y || building.pos.y, building.name.split("_")[0], {opacity: 0.5})
				}
			}
			room.visual.connectRoads()
		}
		// }

		// Prevent it from pinging triggerRebuild every tick
		Memory.stats.profiler["updateDesignRoads" + roomName] = 0;
		if (room.mem.triggerRebuildCooldown) {
			if (Game.time - room.mem.triggerRebuildCooldown < (10000 - Game.cpu.bucket) / ((100 - room.effectiveLevel * 10) * (room.mem.reRoadWithBuilders ? 2 : 1))) {
			// if (Game.time - room.mem.triggerRebuildCooldown < 200 && Game.cpu.bucket < 9990) {
				return;
			}
			room.mem.triggerRebuildCooldown = undefined;
		}

		let t;
		t = Game.cpu.getUsed();

		let built = false

		// Build roads to remotes. Get a lot of them at RCL 3 so ping more frequently then
		if (((room.effectiveLevel == 3 && Math.random() < (1. / (50 * (room.mem.noBuiltRoads ? 5 : 1)))) ||
			(Math.random() < (1. / (500 * (room.mem.noBuiltRoads ? 10 : 1))) && room.effectiveLevel >= 3) ||
			(room.effectiveLevel >= 3 && room.mem.triggerRebuild && (!room.mem.noBuiltRoads || Math.random() < (1. / 1000))) || 
			(room.mem.reRoadWithBuilders && (room.mem.ownedCreeps["builder"] || []).length) &&
			(!room.mem.reRoadWithBuilders || (room.mem.ownedCreeps["builder"] || []).length)) &&
			util.getNumConstructionSites() < MAX_CONSTRUCTION_SITES - 30 && Game.cpu.getUsed() < 350) {

			built = true

			var remoteRooms = room.goodRooms;

			delete room.mem.reRoadWithBuilders

			let availableSites = MAX_CONSTRUCTION_SITES - util.getNumConstructionSites();
			let maxSites

			if ((room.mem.ownedCreeps["builder"] || []).length) {
				maxSites = Math.min(60, Math.round(availableSites) / 2);				
			}
			else {
				room.mem.reRoadWithBuilders = 1
				maxSites = 1;
			}

			let builtRoads = 0;			
			room.buildRooms = [room.name];
			room.mem.incompleteHarvestPathRooms = [];

			let anyConstructionSites = false

			if (Memory.season2 && room.name == "W18N7") {
				let target = Memory.rooms["W17N6"].terminalPos
				let pathPlan = this.getDesignRoadPath(new RoomPosition(room.mem.storageX, room.mem.storageY + 1, roomName),
													  new RoomPosition(target.x, target.y, target.roomName),
													  1,
													  null);

				builtRoads += buildRoads(room, pathPlan, maxSites, new RoomPosition(target.x, target.y, target.roomName));
			}
			if (Memory.season5 && room.mem.claimToUnclaimRoom && room.effectiveLevel >= 6) {
				let thorium = room.find(FIND_MINERALS).filter(m => m.mineralType == RESOURCE_THORIUM)[0]
				if (thorium) {
					let pathPlan = this.getDesignRoadPath(new RoomPosition(room.mem.storageX, room.mem.storageY, roomName),
														  thorium.pos,
														  1,
														  null);

					if (!anyConstructionSites && !builtRoads) {
						for (let pos of pathPlan.path) {
							if (!Game.rooms[pos.roomName]) continue

							for (let site of Game.rooms[pos.roomName].find(FIND_MY_CONSTRUCTION_SITES)) {
								if (site.structureType == STRUCTURE_ROAD) {
									anyConstructionSites = true
									break
								}
							}
							if (anyConstructionSites) {
								break
							}
						}
					}

					builtRoads += buildRoads(room, pathPlan, maxSites, thorium.pos);
				}
			}


			if (Memory.season5) {
				for (let otherRoom of Game.myRooms) {
					if (otherRoom.mem.supportFrom == room.name) {
						let target
						if (otherRoom.effectiveLevel >= 4) {
							target = new RoomPosition(otherRoom.mem.storageX, otherRoom.mem.storageY, otherRoom.name)
						}
						else {
							target = otherRoom.controller.pos
						}

						let pathPlan = this.getDesignRoadPath(new RoomPosition(room.mem.storageX, room.mem.storageY, roomName),
															  target,
															  1,
															  null);
						if (!anyConstructionSites && !builtRoads) {
							for (let pos of pathPlan.path) {
								if (!Game.rooms[pos.roomName]) continue

								for (let site of Game.rooms[pos.roomName].find(FIND_MY_CONSTRUCTION_SITES)) {
									if (site.structureType == STRUCTURE_ROAD) {
										anyConstructionSites = true
										break
									}
								}
								if (anyConstructionSites) {
									break
								}
							}
						}

						builtRoads += buildRoads(room, pathPlan, maxSites, target, true);
					}
				}
			}



			// console.log("Test build roads", maxSites, room.goodRooms)
			let anyRoadBuildAttempts = false
			for (var remoteRoomName of _.shuffle(remoteRooms)) {
				if (remoteRoomName == roomName) continue;

				if (Game.cpu.getUsed() > 400) {
					break;
				}

				if (builtRoads >= maxSites) {
					break;
				}						

				// console.log("Test build roads", remoteRoomName)


				if (!room.keeperMineRooms.includes(remoteRoomName)) {
					let numSources = roomIntel.getNumSources(remoteRoomName);
					for (var sourceIdx = 0; sourceIdx < numSources; sourceIdx++) {
						let sourceX = roomIntel.getSourceX(remoteRoomName, sourceIdx);
						let sourceY = roomIntel.getSourceY(remoteRoomName, sourceIdx);
						let pathPlan = this.getDesignRoadPath(new RoomPosition(room.mem.storageX, room.mem.storageY, roomName),
															  new RoomPosition(sourceX, sourceY, remoteRoomName),
															  1,
															  null);

						if (!anyConstructionSites && !builtRoads) {
							for (let pos of pathPlan.path) {
								if (!Game.rooms[pos.roomName]) continue

								for (let site of Game.rooms[pos.roomName].find(FIND_MY_CONSTRUCTION_SITES)) {
									if (site.structureType == STRUCTURE_ROAD) {
										anyConstructionSites = true
										break
									}
								}
								if (anyConstructionSites) {
									break
								}
							}
						}
						// console.log("Test build roads", sourceIdx, JSON.stringify(pathPlan))

						if (pathPlan.incomplete) {
							if (pathPlan.path.length > 0) {
								console.log("Incomplete road plan from", room.name, "to", remoteRoomName, "Terminates in", pathPlan.path[pathPlan.path.length-1].roomName)
								if (pathPlan.path[pathPlan.path.length-1].roomName != remoteRoomName) {
									room.mem.incompleteHarvestPathRooms.push(remoteRoomName);
									if (room.goodRooms.indexOf(remoteRoomName) >= 0) {
										_.pull(room.goodRooms, remoteRoomName)
									}
									if (room.keeperHarvestRooms.indexOf(remoteRoomName) >= 0) {
										_.pull(room.keeperHarvestRooms, remoteRoomName)
									}
									if (room.centreHarvestRooms.indexOf(remoteRoomName) >= 0) {
										_.pull(room.centreHarvestRooms, remoteRoomName)
									}
									if (room.keeperMineRooms.indexOf(remoteRoomName) >= 0) {
										_.pull(room.keeperMineRooms, remoteRoomName)
									}
								}
							}
						}
						if (!pathPlan.incomplete || pathPlan.path[pathPlan.path.length-1].roomName == remoteRoomName) {
							builtRoads += buildRoads(room, pathPlan, maxSites, new RoomPosition(sourceX, sourceY, remoteRoomName));
							if (builtRoads >= maxSites) {
								break;
							}
						}
					}
					if (builtRoads >= maxSites) {
						break;
					}
				}

				let sectorCoords = util.getSectorCoords(remoteRoomName);
				if (sectorCoords.x >= 4 && sectorCoords.y >= 4 && sectorCoords.x <= 6 && sectorCoords.y <= 6) {
					let mX = roomIntel.getMineralX(remoteRoomName)
					let mY = roomIntel.getMineralY(remoteRoomName)

					let pathPlan = this.getDesignRoadPath(new RoomPosition(room.mem.storageX, room.mem.storageY, roomName),
														  new RoomPosition(mX, mY, remoteRoomName),
														  1,
														  null);

					if (pathPlan.incomplete) {
						if (pathPlan.path.length > 0) {
							console.log("Incomplete road plan to", remoteRoomName, "Terminates in", pathPlan.path[pathPlan.path.length-1].roomName)
							if (pathPlan.path[pathPlan.path.length-1].roomName != remoteRoomName) {
								room.mem.incompleteHarvestPathRooms.push(remoteRoomName);
								if (room.goodRooms.indexOf(remoteRoomName) >= 0) {
									_.pull(room.goodRooms, remoteRoomName)
								}
								if (room.keeperHarvestRooms.indexOf(remoteRoomName) >= 0) {
									_.pull(room.keeperHarvestRooms, remoteRoomName)
								}
								if (room.centreHarvestRooms.indexOf(remoteRoomName) >= 0) {
									_.pull(room.centreHarvestRooms, remoteRoomName)
								}								
								if (room.keeperMineRooms.indexOf(remoteRoomName) >= 0) {
									_.pull(room.keeperMineRooms, remoteRoomName)
								}
							}
						}
					}
					if (!pathPlan.incomplete || pathPlan.path[pathPlan.path.length-1].roomName == remoteRoomName) {
						// console.log("build roads", room, pathPlan, maxSites, mX, mY, remoteRoomName, Memory.rooms[remoteRoomName] && !Memory.rooms[remoteRoomName].mineralAmount)
						let builtRoads = buildRoads(room, 
													pathPlan, 
													maxSites, 
													new RoomPosition(mX, mY, remoteRoomName), 
													Memory.rooms[remoteRoomName] && !Memory.rooms[remoteRoomName].mineralAmount);
						if (builtRoads >= maxSites) {
							// room.mem.reRoadWithBuilders = 1
							break;
						}						
					}
				}

				anyRoadBuildAttempts = true
			}

			if (builtRoads == 0) {
				if (maxSites > 0 && anyRoadBuildAttempts && !anyConstructionSites) {					
					room.mem.noBuiltRoads = 1;
					delete room.mem.reRoadWithBuilders
				}
			}
			else if (global.inTickObject.numConstructionSites !== undefined) {
				delete room.mem.noBuiltRoads
				global.inTickObject.numConstructionSites += builtRoads
			}


			// I'm not convinced this was ever a good idea.
			/*if (builtRoads < maxSites && room.memory.roadRequests) {
				for (var roadRequest of _.shuffle(room.memory.roadRequests)) {
					if (Game.time - roadRequest.t > 1500) {
						_.pull(room.memory.roadRequests, roadRequest)
					}
					else {
						let pathPlan = this.getDesignRoadPath(new RoomPosition(room.memory.labPositionX, room.memory.labPositionY, roomName),
															  new RoomPosition(roadRequest.pos.x, roadRequest.pos.y, roadRequest.pos.roomName),
															  5,
															  null);

						if (pathPlan.incomplete) {
							if (pathPlan.path.length > 0) {
								console.log("Incomplete requested road plan to", roadRequest.pos.roomName, "Terminates in", pathPlan.path[pathPlan.path.length-1].roomName)
								if (pathPlan.path[pathPlan.path.length-1].roomName != roadRequest.pos.roomName) {
									room.memory.incompleteHarvestPathRooms.push(roadRequest.pos.roomName);
									if (room.goodRooms.indexOf(roadRequest.pos.roomName) >= 0) {
										_.pull(room.goodRooms, roadRequest.pos.roomName)
									}
									if (room.keeperHarvestRooms.indexOf(roadRequest.pos.roomName) >= 0) {
										_.pull(room.keeperHarvestRooms, roadRequest.pos.roomName)
									}
								}
							}
						}
						else {
							builtRoads += buildRoads(room, pathPlan);
							if (builtRoads > maxSites) {
								break;
							}
						}
					}
				}
			}*/
		}


		Memory.stats.profiler["updateDesignRoads" + roomName] = Game.cpu.getUsed() - t
		Memory.stats.profiler["updateDesignRoads"] += Game.cpu.getUsed() - t

		let retriggerRebuild = false;
		// We tend to whack triggerRebuild pretty hard when repairers turn to builders
		// Hence checking against danger metrics at high RCL
		if ((Math.random() < (1. / 100) ||
			Memory.tick < 1000 || 
			room.mem.triggerRebuild ||
			(Game.cpu.bucket == 10000 && Math.random() < (1. / 20)) ||
			(room.effectiveLevel == 1 && Math.random() < (1 / 20.)) ||
			(room.effectiveLevel < room.controller.level && Math.random() < (1 / 100.))) &&
			(room.effectiveLevel < 8 || room.defcon <= 3 ||
				(room.mem.lastBreached && Game.time - room.mem.lastBreached < 100000) ||
				(Memory.roomPressurePoints && Memory.roomPressurePoints[room.name] && Memory.roomPressurePoints[room.name].length > 0) ||
				Math.random() < (1. / 100))
			) {

			built = true

			t = Game.cpu.getUsed();

			var buildings = (roomDesignAI.getBuildings(room.name) || []).concat(room.find(FIND_FLAGS));

			// console.log(room, room.effectiveLevel > 3 && room.storage && room.mem.lastBreached && Game.time - room.mem.lastBreached < 100000);
			if (room.effectiveLevel > 3 && room.storage && ((room.mem.lastBreached && Game.time - (room.mem.lastBreached || -1e6) < 100000) || room.defcon <= 3 || Memory.preEmptiveDefense || Memory.rampartTwoLayer)) {
				if (!room.mem.tmpBuildings || room.mem.tmpBuildings.length == 0) {
					let segementData = segments.loadSegmentData(50 + room.mem.ID % 45);

					if (segementData) {
						room.mem.tmpBuildings = []
						let floodedDesign = segementData[room.name].floodedDesign;
						let i;
						let j;
						let i2;
						let j2;
						for (i = 1; i < 49; i++) {
							for (j = 1; j < 49; j++) {
								if (parseInt(floodedDesign[i][j]) !== 1) continue;

								let ramparted = false;
								for (i2 = -1; i2 <= 1; i2++) {
									for (j2 = -1; j2 <= 1; j2++) {
										if (parseInt(floodedDesign[i + i2][j + j2]) === 2) {
											room.mem.tmpBuildings.push({x:i, y:j, name: STRUCTURE_RAMPART})
											ramparted = true;
											break;
										}
									}
									if (ramparted) {
										break;
									}
								}
							}
						}
					}
					// Try again next tick.
					else {
						retriggerRebuild = 1;
					}
				}

				if (room.mem.tmpBuildings) {
					buildings = buildings.concat(room.mem.tmpBuildings);
					// Force update so we get the new buildings
					if (room.mem.tmpBuildings.length && global.repairTargets && global.repairTargets[room.name]) {
						delete global.repairTargets[room.name];
					}
				}
			}
			else {
				room.memory.tmpBuildings = []
			}



			if (Memory.roomPressurePoints && Memory.roomPressurePoints[room.name]) {
				let segementData = segments.loadSegmentData(50 + room.memory.ID % 45);

				if (segementData) {
					room.memory.pressureBuildings = [];
					let floodedDesign = segementData[room.name].floodedDesign;

					for (let rampartId in _.clone(Memory.roomPressurePoints[room.name])) {

						let pressureTime = Memory.roomPressurePoints[room.name][rampartId].t;
						let pressureDamage = Memory.roomPressurePoints[room.name][rampartId].d;
						if (Game.time - pressureTime < 10000 + pressureDamage / 1e3 && pressureDamage > 50000) {
							let rampart = Game.getObjectById(rampartId);
							if (rampart) {
								if (parseInt(floodedDesign[rampart.pos.x][rampart.pos.y]) === 0) {
									continue
								}
								let i = rampart.pos.x;
								let j = rampart.pos.y;

								let ramparted = false;
								// Add ramparts to all neighbouring tiles
								for (let i2 = -1; i2 <= 1; i2++) {
									if (i + i2 == 0) continue;
									for (let j2 = -1; j2 <= 1; j2++) {
										if (j + j2 == 0) continue;
										if (parseInt(floodedDesign[i + i2][j + j2]) === 1 || parseInt(floodedDesign[i + i2][j + j2]) === 0) {
											room.mem.pressureBuildings.push({x:i + i2, y:j + j2, name: STRUCTURE_RAMPART})
											// Force update so we get the new buildings
											if (global.repairTargets && global.repairTargets[room.name]) {
												delete global.repairTargets[room.name];
											}
										}
									}
								}
							}
						}
						else {
							delete Memory.roomPressurePoints[room.name][rampartId];
						}
					}
				}

				if (room.memory.pressureBuildings && room.memory.pressureBuildings.length > 0) {
					buildings = buildings.concat((room.memory.pressureBuildings || []));

					if (room.find2(FIND_MY_CONSTRUCTION_SITES).length < 10) {
						let building = _.sample(room.memory.pressureBuildings)
						let x;
						let y;
						if (Math.random() < 0.5) {
							x = room.memory.storageX;
							y = room.memory.storageY;
						}
						else {
							x = room.memory.spawnBatteryCentreX;
							y = room.memory.spawnBatteryCentreY;
						}

						let pathPlan = this.getDesignRoadPath(new RoomPosition(building.x, building.y, room.name),
															  new RoomPosition(x, y, room.name),
															  2,
															  null,
															  false,
															  true);
						for (var pos of pathPlan.path) {
							if (pos.x == 0 || pos.x == 49 || pos.y == 0 || pos.y == 49) {
								continue
							}
							if (Game.rooms[pos.roomName]) {
								Game.rooms[pos.roomName].createConstructionSite(pos.x, pos.y, STRUCTURE_ROAD);
							}
						}
					}
				}
			}


			if (room.memory.nukeLandTime - Game.time > 0) {
				// quite an expensive op.
				if (Math.random() < 0.1 || Memory.drawNukeRamparts) {
					let segementData = segments.loadSegmentData(50 + room.memory.ID % 45);

					if (segementData) {
						room.memory.nukeRamparts = [];
						let floodedDesign = segementData[room.name].floodedDesign;
						// Being nuked build a containment around the nukes combining current ramparts that aren't under nukes
						// 1) Take current ramparts
						// 2) Add a perimeter around all nukes
						// 3) Subtract nuke effected ramparts (>1 nuke)
						// 4) Flood from exits
						// 5) Keep all ramparts touched.

						let numNukesToDodge = room.effectiveLevel > 6 ? 2 : 1

						// 1)
						let rampartMap = [];
						for (let i = 0; i < 50; i++) {
							rampartMap.push([]);
							for (let j = 0; j < 50; j++) {
								rampartMap[i][j] = parseInt(floodedDesign[i][j]) == 2 ? numNukesToDodge : 0;
							}
						}

						let roomTerrain = Game.map.getRoomTerrain(roomName)

						function addNukeRampart(i, j) {

							for (let ii = i-1; ii <= i+1; ii++) {
								for (let jj = j-1; jj <= j+1; jj++) {
									if (ii != 0 && ii != 49 && jj != 0 && jj != 49) continue

									if (!(roomTerrain.get(ii, jj) & TERRAIN_MASK_WALL)) {
										return
									}
								}
							}

							rampartMap[i][j] = numNukesToDodge
						}

						// 2)
						for (let nuke of room.find(FIND_NUKES)) {
							for (let i = -3; i <= 3; i++) {
								if (nuke.pos.x + i < 1 || nuke.pos.x + i > 48) continue;
								// Top
								if (nuke.pos.y - 3 >= 1) {
									addNukeRampart(nuke.pos.x + i, nuke.pos.y - 3)
								}
								// Bottom
								if (nuke.pos.y + 3 <= 48) {
									addNukeRampart(nuke.pos.x + i, nuke.pos.y + 3)
								}
							}
							for (let j = -3; j <= 3; j++) {
								if (nuke.pos.y + j < 1 || nuke.pos.y + j > 48) continue;

								// Left
								if (nuke.pos.x - 3 >= 1) {
									addNukeRampart(nuke.pos.x - 3, nuke.pos.y + j)
								}

								// Right
								if (nuke.pos.x + 3 <= 48) {
									addNukeRampart(nuke.pos.x + 3, nuke.pos.y + j)
								}
							}
						}

						// 3
						for (let nuke of room.find(FIND_NUKES)) {
							for (let i = -2; i <= 2; i++) {
								if (nuke.pos.x + i < 1 || nuke.pos.x + i > 48) continue;
								for (let j = -2; j <= 2; j++) {
									if (nuke.pos.y + j < 1 || nuke.pos.y + j > 48) continue;
									rampartMap[nuke.pos.x + i][nuke.pos.y + j]--;
								}
							}
						}

						// 4

						let roomMap = [];
						for (let i = 0; i < 50; i++) {
							roomMap.push([]);
							for (let j = 0; j < 50; j++) {
								let wall = roomTerrain.get(i, j) & TERRAIN_MASK_WALL;

								if (wall) {
									let tunnel = 0;
									let structs = room.lookForAt(LOOK_STRUCTURES, i, j);
									for (let struct of structs) {
										if (struct.structureType == STRUCTURE_ROAD) {
											tunnel = 1;
											break;
										}
									}

									roomMap[i][j] = tunnel ? 0 : 1;
								}
								else {
									roomMap[i][j] = 0;
								}
							}
						}

						function floodFill(roomMap, i, j) {
							if (roomMap[i][j] == 0) {
								roomMap[i][j] = 2;
								if (rampartMap[i][j] > 0) {
									rampartMap[i][j] = 999;
								}
								else {
									if (i - 1 >= 0)  floodFill(roomMap, i-1, j);
									if (i + 1 <= 49) floodFill(roomMap, i+1, j);
									if (j - 1 >= 0)  floodFill(roomMap, i, j-1);
									if (j + 1 <= 49) floodFill(roomMap, i, j+1);

									if (i - 1 >= 0 && j - 1 >= 0)  floodFill(roomMap, i-1, j-1);
									if (i + 1 <= 49 && j - 1 >= 0) floodFill(roomMap, i+1, j-1);
									if (i - 1 >= 0 && j + 1 <= 49)  floodFill(roomMap, i-1, j+1);
									if (i + 1 <= 49 && j + 1 <= 49) floodFill(roomMap, i+1, j+1);
								}
							}
						}

						for (var i = 0; i < 50; i++) {
							if (roomMap[i][0] == 0) floodFill(roomMap, i, 0)
							if (roomMap[i][49] == 0) floodFill(roomMap, i, 49)
							if (roomMap[0][i] == 0) floodFill(roomMap, 0, i)
							if (roomMap[49][i] == 0) floodFill(roomMap, 49, i)
						}

						let vis = new RoomVisual(roomName)

						// 5
						for (let i = 1; i < 49; i++) {
							for (let j = 1; j < 49; j++) {
								if (rampartMap[i][j] == 999) {
									if (parseInt(floodedDesign[i][j]) === 1) {
										room.mem.nukeRampartsInternal = 1;
									}
									room.mem.nukeRamparts.push(j * 50 + i)
									if (Memory.drawNukeRamparts) {
										vis.circle(i, j, {radius: 0.25, fill: "#00ff00", opacity: 0.75})
									}
								}
								else if (rampartMap[i][j] > 0) {
									if (Memory.drawNukeRamparts) {
										vis.circle(i, j, {radius: 0.25, fill: "#ffff00", opacity: 0.75})
									}
								}
							}
						}
						// Force update so we get the new buildings
						if (global.repairTargets && global.repairTargets[room.name]) {
							delete global.repairTargets[room.name];
						}
					}
				}

			}
			else if (Game.time - (room.mem.lastNukeLand || -50000) > 50000) {
				delete room.mem.nukeRampartsInternal
				delete room.mem.nukeRamparts
			}

			if (room.mem.nukeRamparts && room.mem.nukeLandTime - Game.time > 0) {
				for (let nukeRampartXy of room.mem.nukeRamparts) {
					let building = {x: nukeRampartXy % 50, y: Math.floor(nukeRampartXy / 50) % 50, name: STRUCTURE_RAMPART};
					buildings.push(building)
				}
			}

			// console.log(room, room.memory.tmpBuildings);
			//console.log(room, Game.cpu.getUsed(), buildings.length)
			//return;

			let siteEnergy = 0;

			for (let site of room.find(FIND_MY_CONSTRUCTION_SITES)) {
				if (site.structureType != STRUCTURE_ROAD) {
					siteEnergy += site.progressTotal - site.progress;
				}
			}

			Memory.stats.profiler["updateDesignSpecial"] += Game.cpu.getUsed() - t
			t = Game.cpu.getUsed()


			let minPass;
			let maxPass;

			if (room.effectiveLevel == 8 && room.defcon == 5) {
				minPass = 3;
			}
			else {
				minPass = 0;
			}

			if (room.towers.length == 0 && 
				room.controller.level > 3 &&
				(room.controller.safeMode || 0) < (room.controller.safeModeCooldown ? 20000 : 6000)) {
				// Build towers if we need to build towers!
				maxPass = 1;
			}
			else if (room.spawns.length == 0 && Game.gcl.level > 1) {
				maxPass = 2;
			}
			else {
				maxPass = 4;
			}


			if (Memory.debugRoomBuilding) {
				console.log("Room design building", minPass, maxPass)
			}

			// Guard the controller from rogue claimers
			if (Game.gcl.level > 1 && room.controller.level == 2 && !room.controller.safeMode) {
				let roomTerrain = Game.map.getRoomTerrain(roomName)

				for (let i = -1; i <= 1; i++) {
					for (let j = -1; j <= 1; j++) {
						if (!(roomTerrain.get(room.controller.pos.x + i, room.controller.pos.y + j) & TERRAIN_MASK_WALL)) {
							room.createConstructionSite(room.controller.pos.x + i, room.controller.pos.y + j, STRUCTURE_RAMPART)
						}
					}
				}
			}

			let effectveEnergy = room.calcEffectiveEnergy();

			let maxHate = intelAI.getMaxHate()

			if (Memory.season5 && room.mem.claimToUnclaimRoom && room.effectiveLevel >= 6) {
				if (room.extractor && 
					room.extractor.pos.findFirstInRange(FIND_MINERALS, 0) && 
					room.extractor.pos.findFirstInRange(FIND_MINERALS, 0).mineralType == RESOURCE_THORIUM) {

					let flags = room.extractor.pos.findInRange(FIND_FLAGS, 2).filter(f => f.name.startsWith("sourceContainer_DROP_ROOM"));

					if (flags.length) {
						let building = {x: flags[0].pos.x, y: flags[0].pos.y, name: STRUCTURE_CONTAINER};
						buildings.push(building)
					}
					else {
						let roomTerrain = Game.map.getRoomTerrain(roomName)
						let bestTile
						let bestTileScore = -Infinity
						for (let i = -2; i <= 2; i++) {
							if (room.extractor.pos.x + i <= 1 || room.extractor.pos.x + i >= 48) {
								continue
							}
							for (let j = -2; j <= 2; j++) {
								if (Math.abs(i) <= 1 && Math.abs(j) <= 1) {
									continue
								}
								if (room.extractor.pos.y + j <= 1 || room.extractor.pos.y + j >= 48) {
									continue
								}
								if (roomTerrain.get(room.extractor.pos.x + i, room.extractor.pos.y + j) & TERRAIN_MASK_WALL) {
									continue
								}

								let pos = new RoomPosition(room.extractor.pos.x + i, room.extractor.pos.y + j, room.name)


								let score = 0;

								// From countAccesibleTiles
								for (let i = pos.x - 1; i <= pos.x + 1; i++) {
									if (i <= 1 || i >= 48) {
										continue
									}

									for (let j = pos.y - 1; j <= pos.y + 1; j++) {
										if (j <= 1 || j >= 48) {
											continue
										}

										if (roomTerrain.get(i, j) & TERRAIN_MASK_WALL) continue;

										let newPos = new RoomPosition(i, j, roomName) 


										if (!newPos.inRangeToPos(room.extractor.pos, 1)) {
											continue;
										}

										let open = true;
										let structs = Game.rooms[pos.roomName].lookForAt(LOOK_STRUCTURES, i, j);
										for (let struct of structs) {
											if (struct.structureType != STRUCTURE_ROAD && 
												struct.structureType != STRUCTURE_CONTAINER &&
												(struct.structureType != STRUCTURE_RAMPART || !struct.my)) {
												open = false;
												break;
											}
										}

										if (open) {
											score++;
										}
									}
								}
								if (score >= bestTileScore) {
									bestTileScore = score
									bestTile = pos
								}
							}
						}

						if (bestTile) {
							room.createFlag(bestTile, "sourceContainer_DROP_ROOM" + room.name)
							let building = {x: bestTile.x, y: bestTile.y, name: STRUCTURE_CONTAINER};
							buildings.push(building)
						}
					}
				}
			}

			for (let pass = minPass; pass < maxPass; pass++) {
				// if (Memory.season1 && Game.gcl.level < 4) continue
				for (var building of buildings) {
					if (pass == 0 || pass == 1 || pass == 3) {
						let e;
						if (pass == 0 || pass == 1) {
							e = Math.max(1000, effectveEnergy);
						}
						else {
							e = Math.max(room.effectiveLevel == 1 ? 0 : 3000, effectveEnergy);
						}

						if (!room.storage && siteEnergy > e) {
							pass = maxPass;
							break;
						}
						else if (room.storage && effectveEnergy - siteEnergy < 0) {
							pass = maxPass;
							break;
						}
					}
					// if (Memory.debugRoomBuilding) {
						// console.log(pass, JSON.stringify(building))
					// }

					var splitResult = building.name.split("_");
					var minRCL = parseInt(splitResult[1]);
					var structType = splitResult[0];

					if (structType == "dropContainer") structType = STRUCTURE_CONTAINER;
					if (structType == "sourceContainer") structType = STRUCTURE_CONTAINER;

					if (structType == "harvestLink") structType = STRUCTURE_LINK;
					if (structType == "endLink") structType = STRUCTURE_LINK;

					if (Memory.season3 && structType == STRUCTURE_ROAD && minRCL == 3) {
						let roomTerrain = Game.map.getRoomTerrain(roomName)
						if (!building.pos || !building.pos.roomName) {
							building = JSON.parse(JSON.stringify(building));
							building.pos = new RoomPosition(building.x || building.pos.x, building.y || building.pos.y, room.name)
						}

						if (roomTerrain.get(building.pos.x, building.pos.y) & TERRAIN_MASK_SWAMP) {
							minRCL--
						}
					}

					if (room.effectiveLevel < minRCL && structType != STRUCTURE_TOWER && (structType != STRUCTURE_SPAWN || room.effectiveLevel != 1 || minRCL > 2) && structType != STRUCTURE_STORAGE) continue;
					if (room.effectiveLevel == 1 && structType != STRUCTURE_TOWER && structType != STRUCTURE_SPAWN) continue;
					if (structType == STRUCTURE_RAMPART && room.towers.length == 0) continue;

					if ((structType == STRUCTURE_TERMINAL || structType == STRUCTURE_LAB) && (Memory.numRCL6Plus < 2 || Game.gcl.level < 3)) continue;
					// Do GCL before building two terminals!
					if ((structType == STRUCTURE_TERMINAL || structType == STRUCTURE_LAB) && Memory.numRCL6Plus == 2 && Game.gcl.progress / Game.gcl.progressTotal > 0.8 && Game.gcl.level < 3) {
						continue;
					}

					if (structType == STRUCTURE_LAB && Memory.season5 && Game.gcl.level < 5 && maxHate <= 10000 && (Memory.numRCL6PlusTerminal || 0) < 4 && Memory.numRCL7Plus < 3) {
						continue;
					}

					if (Memory.season5 && room.mem.claimToUnclaimRoom) {
						//if ((room.defcon == 5 || maxHate <= 10000) && (room.mem.attackScore || 0) <= 0 && structType == STRUCTURE_RAMPART) {
						//	continue
						//}


						if (structType == STRUCTURE_LAB) {
							continue
						}		
						if (structType == STRUCTURE_TERMINAL) {
							let nearbyFriends = false
							for (let otherRoom of Game.myRooms) {
								if (otherRoom == room) {
									continue
								}
								if ((room.mem.avgTransporterRoomDist || 0) < 5) {
									nearbyFriends = true
									break
								}
								//if (Game.map.getRoomLinearDistance(room.name, otherRoom.name) < 3) {
								//	nearbyFriends = true
								//	break
								//}
							}
							if (nearbyFriends) {
								continue
							}
						}
						if (structType == STRUCTURE_LINK && room.effectiveLevel == 6) {
							if (splitResult[0] == "endLink") {
								building.pos = new RoomPosition(building.x || building.pos.x, building.y || building.pos.y, room.name)

								let currentBuildings = room.lookForAt(LOOK_STRUCTURES, building.pos);
								for (let currentBuilding of currentBuildings) {
									if (currentBuilding.structureType == STRUCTURE_CONTAINER) {
										currentBuilding.destroy()
										break;								
									}
								}
							}
							continue
						}		

						if (room.effectiveLevel == 6 && !room.extractor) {
							continue
						}
						if (room.effectiveLevel == 6 && !room.extractor.findFirstInRange(room.containers, 2)) {
							continue
						}						
					}


					if (structType == STRUCTURE_LAB && !Memory.forceNoLowRamparts) {
						if (maxHate <= 10000 && !room.labs.length && (Memory.terminalNetworkFreeEnergy < 1.5e6 || Math.random() < 0.999)) {
							// Don't need them unless labs are stressed
							let numLabs = 0
							for (let testRoom of Game.myRooms) {
								if (testRoom.effectiveLevel != testRoom.controller.level) {
									continue
								}
								let localCount = testRoom.labs.length
								for (let constructionSite of testRoom.find(FIND_MY_CONSTRUCTION_SITES)) {
									if (constructionSite.structureType == STRUCTURE_LAB) {
										localCount++
									}
								}
								numLabs += Math.max(0, localCount - 3)
							}
							// console.log("labs", numLabs, Memory.stats.labUpTime / Memory.stats.ticksLong)
							// All but one labs running at 90%
							if (Memory.stats.labUpTime / Memory.stats.ticksLong < numLabs * .9 && numLabs) {
								continue
							}
						}
						// if (Memory.season2 && Game.gcl.level < 6 && !room.labs.length) {
						// 	console.log("Artificial restriction of lab building for season 2", maxHate, Memory.stats.labUpTime / Memory.stats.ticksLong)
						// 	continue
						// }

						// Cheeky. If we just crossed the threshold this puts us just under it again.
						// Should stop everyone building labs on a hair trigger on the same tick
						if (maxHate <= 10000 && !room.labs.length && room.effectiveLevel > 6) {
							Memory.stats.labUpTime *= 0.999
						}
					}
					if (structType == STRUCTURE_FACTORY && Memory.numRCL7Plus < 2) {
						continue
					}
					if (structType == STRUCTURE_FACTORY && Memory.season2 && Game.gcl.level < 4) {
						continue
					}
					if (structType == STRUCTURE_NUKER && (maxHate < 10000 || (Memory.season && !(Memory.enabledNukers || []).includes(room.name)))) {
						continue
					}

					if (Memory.season5 && room.mem.claimToUnclaimRoom && room.controller.level >= 6) {
						if (structType == STRUCTURE_EXTRACTOR) {
							// Handled by season5 code.
							continue;
						}
						if (structType == STRUCTURE_CONTAINER && splitResult[0] == "dropContainer") {
							building.pos = new RoomPosition(building.x || building.pos.x, building.y || building.pos.y, room.name)

							if (building.pos.inRangeToPos(room.controller.pos, 2)) {
								continue
							}

						}

						if (structType == STRUCTURE_CONTAINER && splitResult[0] == "sourceContainer") {
							// Make sure it's room position
							building.pos = new RoomPosition(building.x || building.pos.x, building.y || building.pos.y, room.name)

							let thorium = room.find(FIND_MINERALS).filter(m => m.mineralType == RESOURCE_THORIUM)
							let other = room.find(FIND_MINERALS).filter(m => m.mineralType != RESOURCE_THORIUM)

							if (!room.extractor && (building.pos.findFirstInRange(thorium, 2) || building.pos.findFirstInRange(other, 1))) {
								continue
							}
							else if (room.extractor) {
								if (!building.pos.inRangeToPos(room.extractor.pos, 2) && !building.pos.findFirstInRange(FIND_SOURCES, 1)) {
									let currentBuildings = room.lookForAt(LOOK_STRUCTURES, building.pos);
									for (let currentBuilding of currentBuildings) {
										if (currentBuilding.structureType == STRUCTURE_CONTAINER) {
											currentBuilding.destroy()
											break;
										}
									}
									continue
								}
								if (!building.pos.inRangeToPos(room.extractor.pos, 1) && building.pos.findFirstInRange(other, 1)) {
									let currentBuildings = room.lookForAt(LOOK_STRUCTURES, building.pos);
									for (let currentBuilding of currentBuildings) {
										if (currentBuilding.structureType == STRUCTURE_CONTAINER) {
											currentBuilding.destroy()
											break;
										}
									}
									continue
								}
							}
						}
					}

					if (structType == STRUCTURE_POWER_SPAWN && (Memory.tick < 37500 || (Memory.season && !room.hasAtLeastXOfResource(RESOURCE_POWER, 1) && Memory.stats.globalResources[RESOURCE_POWER] < 10000))) {
						continue;
					}



					if (pass == 0 && structType != STRUCTURE_TOWER) {
						continue;
					}
					if (pass == 1 && structType != STRUCTURE_SPAWN) {
						continue;
					}
					else if (pass == 2 && structType != STRUCTURE_RAMPART) {
						continue;
					}
					else if (structType == STRUCTURE_NUKER && Memory.economyArena) {
						continue;
					}


					if (!building.pos || !building.pos.roomName) {
						building = JSON.parse(JSON.stringify(building));
						building.pos = new RoomPosition(building.x || building.pos.x, building.y || building.pos.y, room.name)
					}

					// Quick hack for misplaced staring spawn
					if (Memory.disableDesignedTunnels && structType == STRUCTURE_ROAD) {
						let roomTerrain = Game.map.getRoomTerrain(roomName)
						if (roomTerrain.get(building.pos.x, building.pos.y) & TERRAIN_MASK_WALL) {
							continue
						}
					}


					// Don't build external extensions if under attack
					if (structType == STRUCTURE_EXTENSION && (room.mem.attackScore || 0) > 0) {
						let segementData = segments.loadSegmentData(50 + room.mem.ID % 45);

						if (segementData) {
							let floodedDesign = segementData[room.name].floodedDesign;
							if (parseInt(floodedDesign[building.pos.x][building.pos.y]) === 0) {
								continue;
							}
						}
					}

					// Don't build extensions over roads near sources.
					// This is kinda a hack to avoid source extensions from blocking.
					// Doesn't really solve it though :(
					if ((structType == STRUCTURE_EXTENSION || structType == STRUCTURE_LINK) && (new RoomPosition(building.pos.x, building.pos.y, room.name).findFirstInRange(FIND_SOURCES, 2))) {
						let skip = false;
						for (let otherBuilding of room.lookForAt(LOOK_STRUCTURES, building.pos.x, building.pos.y)) {
							if (otherBuilding.structureType == STRUCTURE_ROAD) {
								skip = true;
								break
							}
						}
						if (skip) {
							continue
						}
					}

					// else if (structType == STRUCTURE_FACTORY && Memory.swc) {
					// 	continue;
					// }

					// If we can build the same structure type outside of nuke radius, do so. Ignore minRCL for
					if (room.mem.nukeLandTime && structType != STRUCTURE_CONTAINER && structType != STRUCTURE_LINK) {
						for (let nuke of room.find(FIND_NUKES)) {
							if (building.pos.inRangeToPos(nuke.pos, 2)) {
								let buildingMoved = false;
								for (let building2 of buildings) {
									let splitResult2 = building2.name.split("_");
									let minRCL2 = parseInt(splitResult2[1]);
									let structType2 = splitResult2[0];

									if (structType != STRUCTURE_SPAWN && structType != STRUCTURE_TOWER && structType != STRUCTURE_LAB && room.effectiveLevel < minRCL2) {
										continue
									}


									if (structType2 != structType) continue

									if (!building2.pos || !building2.pos.roomName) {
										building2 = JSON.parse(JSON.stringify(building2));
										building2.pos = new RoomPosition(building2.x || building2.pos.x, building2.y || building2.pos.y, room.name)
									}
									let nukeFree = true;
									for (let nuke2 of room.find(FIND_NUKES)) {
										if (building2.pos.inRangeToPos(nuke2.pos, 2)) {
											nukeFree = false;
											break;
										}
									}
									if (nukeFree) {
										building = building2;
										buildingMoved = true;
										break
									}
								}
								if (!buildingMoved && nuke.timeToLand < 90000 - 10000 * room.effectiveLevel) {
									building = undefined
								}
								break;
							}
						}
					}

					if (!building) {
						continue
					}


					// var numAllowed = CONTROLLER_STRUCTURES[structType][room.controller.level];

					// Only build labs at RCL 6 if we have been breached before or we're rich
					if (room.controller.level == 6 && structType == STRUCTURE_LAB) {
						if ((Memory.terminalNetworkFreeEnergy || 0) < 1e6 || !room.terminal) {
							// if (room.labs.length > 0) {
							// 	continue;
							// }
							if ((!room.memory.lastBreached || Game.time - room.memory.lastBreached >= 100000) && room.defcon > 3) {
								continue;
							}
						}
					}

					// if (numAllowed > 0) {
						var currentBuildings = room.lookForAt(LOOK_STRUCTURES, building.pos);
						var needBuilding = true;
						for (var building of currentBuildings) {
							if (building.structureType == structType) {
								needBuilding = false;
								break;
							}
							if (structType == STRUCTURE_LINK && building.structureType == STRUCTURE_CONTAINER) {
								building.destroy();

								// Slight issue if we lose the link and go down RCL
								// var lookFlags = room.lookForAt(LOOK_FLAGS, building);
								// for (let flag2 of lookFlags) {
								// 	if (flag2.name.startsWith("dropContainer")) {
								// 		flag2.remove();
								// 		break;
								// 	}
								// }

								break;
							}
						}

						if (needBuilding) {
							// I could put a timer on this. Maybe in rep priorities?
							var shouldBuildTower = room.controller.level > 4 || (room.controller.safeMode || 0) < (room.controller.safeModeCooldown ? 20000 : 6000);
							var shouldBuildOuterRamparts = room.controller.level > 4 || 
														  (room.controller.safeMode || 0) < (room.controller.safeModeCooldown ? 20000 : 5000) || 
														  (room.mem.tmpBuildings && room.mem.tmpBuildings.length);

							if (structType != "optionalRampart" && (structType != STRUCTURE_RAMPART || shouldBuildOuterRamparts) && (structType != STRUCTURE_TOWER || shouldBuildTower)) {
								// let energy = 0;
								// if (room.storage)  energy += (room.storage.store[RESOURCE_ENERGY] || 0);
								// if (room.terminal) energy += (room.terminal.store[RESOURCE_ENERGY] || 0);

								if (room.effectiveLevel < 4 ||
									!room.storage ||
									effectveEnergy - siteEnergy >= CONSTRUCTION_COST[structType] ||
									structType == STRUCTURE_TERMINAL ||
									(structType == STRUCTURE_RAMPART && room.towers.length > 0) ||
									structType == STRUCTURE_TOWER ||
									(structType == STRUCTURE_LAB && room.labs.length == 0 && effectveEnergy - siteEnergy >= CONSTRUCTION_COST[structType] / 5)) {
									if (!room.terminal) {
										// Don't build labs while the terminal is down.
										if (structType != STRUCTURE_LAB) {
											if (structType == STRUCTURE_SPAWN && currentBuildings.length == 0 && room.spawns.length == 0 && Game.gcl.level > 1 && minRCL < 3) {
												if (room.createConstructionSite(building.pos, STRUCTURE_RAMPART) == OK) {
													siteEnergy += 1000;
												}
											}
											else {
												if (room.createConstructionSite(building.pos, structType) == OK) {
													siteEnergy += CONSTRUCTION_COST[structType];
												}
											}
										}
									}
									else {
										if (room.createConstructionSite(building.pos, structType) == OK) {
											siteEnergy += CONSTRUCTION_COST[structType];
										}
									}
								}
							}
						}
						if ((room.controller.safeMode || 0) < 5000 && currentBuildings.length > 0 && pass >= 2 &&
							(structType == STRUCTURE_SPAWN ||
							 structType == STRUCTURE_STORAGE ||
							 structType == STRUCTURE_FACTORY ||
							 structType == STRUCTURE_TERMINAL ||
							 structType == STRUCTURE_TOWER)) {

							if (room.createConstructionSite(building.pos, STRUCTURE_RAMPART) == OK) {
								siteEnergy += 1000;
							}
						}
						if ((room.controller.safeMode || 0) < 5000 && (currentBuildings.length > 0 || structType == "optionalRampart") && pass >= 2 &&
							(structType == STRUCTURE_LINK ||
							 structType == STRUCTURE_LAB ||
							 structType == STRUCTURE_OBSERVER ||
							 structType == STRUCTURE_NUKER ||
							 structType == STRUCTURE_POWER_SPAWN ||
							 structType == "optionalRampart")) {

							var ramparted = false;
							if ((room.memory.nukeLandTime || 0) - Game.time > 0 && structType !== STRUCTURE_LINK && structType !== "optionalRampart") {
								let nukes = room.find(FIND_NUKES);
								for (let nuke of nukes) {
									if (nuke.pos.getRangeTo(building.pos) <= 2) {
										if (room.createConstructionSite(building.pos, STRUCTURE_RAMPART) == OK) {
											siteEnergy += 1000;
											ramparted = true;
										}
									}
								}
							}

							if (!ramparted) {
								let segmentID = 50 + room.memory.ID % 45;
								let segmentData = segments.loadSegmentData(segmentID);

								if (segmentData) {
									let floodedDesign = segmentData[roomName].floodedDesign;

									if (floodedDesign) {
										let roomTerrain = Game.map.getRoomTerrain(roomName)
										// These guys get optional ramparts. Use the ponding to see if they have external within 3 tiles
										for (var i = -3; i <= 3; i++) {
											for (var j = -3; j <= 3; j++) {
												if (building.pos.x + i < 0 || building.pos.x + i > 49 || building.pos.y + j < 0 || building.pos.y + j > 49) continue
												if (parseInt(floodedDesign[building.pos.x + i][building.pos.y + j]) === 0 && !(roomTerrain.get(building.pos.x + i, building.pos.y + j) & TERRAIN_MASK_WALL)) {
													if (room.createConstructionSite(building.pos, STRUCTURE_RAMPART) == OK) {
														siteEnergy += 1000;
														ramparted = true;
													}
													break;
												}
											}
											if (ramparted) {
												break;
											}
										}
									}
								}
							}
						}
					// }
				}
			}
			Memory.stats.profiler["updateDesignBuildings"] += Game.cpu.getUsed() - t

		}

		if (built && room.mem.triggerRebuild) {
			room.mem.triggerRebuild = undefined;
			if (room.effectiveLevel > 1 && Game.cpu.bucket < 9900) {
				room.mem.triggerRebuildCooldown = Game.time;
			}
		}


		// Clean up roads under buildings
		if (Math.random() > 0.9999) {
			var buildings = room.find(FIND_MY_STRUCTURES);

			for (var building of buildings) {
				if (building.structureType == STRUCTURE_RAMPART) continue;

				var otherBuildings = building.pos.lookFor(LOOK_STRUCTURES);

				for (var building2 of otherBuildings) {
					if (building2.structureType == STRUCTURE_ROAD) {
						building2.destroy();
					}
				}
			}

		}


		if (retriggerRebuild) {
			room.memory.triggerRebuild = 1;
		}
	},

	// If we're near the max, just kill a bunch of unbuilt ones. They can always be replaced.
	cleanupConstructionSites : function() {
		if (Game.time % 901 == 145 || Memory.debugCleanConstructionSites) {
			delete Memory.debugCleanConstructionSites
			var sites = Game.constructionSites;

			let allBuildRooms = []
			for (let room of Game.myRooms) {
				allBuildRooms = allBuildRooms.concat(room.mem.buildRooms)
			}

			let currentNumSites = util.getNumConstructionSites()

			if (currentNumSites >= MAX_CONSTRUCTION_SITES - 30) {
				let removed = 0 ;
				for (var siteId in sites) {
					var site = sites[siteId];
					if (site && !allBuildRooms.includes(site.pos.roomName) && site.progress == 0) {
						site.remove();
						removed++;
					}
				}
				if (currentNumSites - removed >= MAX_CONSTRUCTION_SITES - 30) {
					for (var siteId in sites) {
						var site = sites[siteId];
						if (site && !site.room && site.progress == 0) {
							site.remove();
							removed++;
						}
						if (currentNumSites - removed < MAX_CONSTRUCTION_SITES - 30) {
							break;
						}
					}
				}
				if (currentNumSites - removed >= MAX_CONSTRUCTION_SITES - 30) {					
					for (var siteId in sites) {
						var site = sites[siteId];
						if (site && site.progress == 0) {
							site.remove();
							removed++;
						}
						if (currentNumSites - removed < MAX_CONSTRUCTION_SITES - 30) {
							break;
						}
					}
				}
				// if (removed <= 30) {					
				// 	for (var siteId in sites) {
				// 		var site = sites[siteId];
				// 		if (site) {
				// 			site.remove();
				// 			removed++;
				// 		}
				// 		if (removed > 30) {
				// 			break;
				// 		}
				// 	}
				// }
			}
		}
	},

	getBuildings : function(roomName) {
		if (Memory.rooms[roomName].designed < NUM_DESIGN_STAGES) {
			if (Memory.rooms[roomName].buildings) {
				return Memory.rooms[roomName].buildings;
			}
			else {
				return [];
			}
		}
		global.roomBuildings = global.roomBuildings || {};

		// Push buildings to global backed up by compressed memory.
		if (!global.roomBuildings[roomName] || global.roomBuildings[roomName].length == 0) {
			if (Memory.rooms[roomName].compressedBuildings && Game.shard.name != "AppleCrumble") {
				global.roomBuildings[roomName] = [];
				if (global.wasm_module && global.wasm_module.lzw_decode) {
					global.roomBuildings[roomName] = JSON.parse(global.wasm_module.lzw_decode(Memory.rooms[roomName].compressedBuildings));
					delete Memory.rooms[roomName].buildings
				}
			}
			else if (Memory.rooms[roomName].buildings) {
				global.roomBuildings[roomName] = _.clone(Memory.rooms[roomName].buildings);
				if (global.wasm_module && global.wasm_module.lzw_encode && Game.shard.name != "AppleCrumble") {
					Memory.rooms[roomName].compressedBuildings = global.wasm_module.lzw_encode(JSON.stringify(Memory.rooms[roomName].buildings));
					delete Memory.rooms[roomName].buildings
				}
			}
		}

		return global.roomBuildings[roomName] || [];
	},
};

module.exports = roomDesignAI;