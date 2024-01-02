"use strict";

var util = require('util');
var safeRoute = require('safeRoute');
const segments = require('segments');
const customCostMatrix = require('customCostMatrix');
var roomIntel = require('roomIntel');
var constants = require('constants');

const moveResolver = require("moveResolver")

const utf15 = require('./utf15');
const Codec = utf15.Codec;
const MAX_DEPTH = utf15.MAX_DEPTH;


function compressPath(path) {
	if (Game.shard.name != "AppleCrumble") {
		const depth = 3;

		const dir_codec = new Codec({ depth, array:1 });

		var arr = [];
		for (var i = 0; i < path.length; i++) {
			arr.push(path[i] - 1);
		}

		return dir_codec.encode(arr);
	}
	else {
		return path;
	}
}

function decompressPath(pathStr) {
	if (Game.shard.name != "AppleCrumble") {
		const depth = 3;

		const dir_codec = new Codec({ depth, array:1 });

		var res = dir_codec.decode(pathStr);

		var str = ""
		for (var i = 0; i < res.length; i++) {
			str += (res[i] + 1).toString()
		}

		return str;
	}
	else {
		return pathStr
	}
}

const shortRangeThreshold = 3
const segementSquareWidth = 3;


//
function getCacheSegmentIDForPos(pos1, pos2) {
	var x = (pos1.x + pos2.x) % segementSquareWidth
	var y = (pos1.y + pos2.y) % segementSquareWidth

	return y * segementSquareWidth + x;
}


var pathCache = {
	serializePath: function(startPos, path, moveSpeed, trimToRoom) {
		var out = "";
		var x = startPos.x;
		var y = startPos.y;
		var firstStep = true;



		for (var step of path) {

			// If we don't have a cost matrix for this room, figure out what we're doing when we get there.
			// Comment this out if things seem fecked.
			// if (!Game.rooms[step.roomName] && (!global.costMatrices || !global.costMatrices[step.roomName] || !global.costMatrices[step.roomName][moveSpeed])) break
			// console.log(step.roomName)
			// Delta from current position to next
			var dx = step.x - x
			var dy = step.y - y

			if (trimToRoom && (dx == -49 || dx == 49 || dy == -49 || dy == 49)) {
				return out;
			}

			let lastStep = step == path[path.length-1];

			let firstStepFromNonEdge = (firstStep && x != 0 && x != 49 && y != 0 && y != 49)

			// Removed first step which fixed some pathing problems. Added it back with "not on edge" to try and fix others.
			if ((dx != -49 && dx != 49 && dy != -49 && dy != 49) || lastStep || firstStepFromNonEdge) {
			// if ((dx != -49 && dx != 49 && dy != -49 && dy != 49) || firstStep || lastStep) {
				if ((firstStepFromNonEdge || lastStep) && dx == -49) {
					out += RIGHT;
				}
				else if ((firstStepFromNonEdge || lastStep) && dx == 49) {
					out += LEFT;
				}
				else if ((firstStepFromNonEdge || lastStep) && dy == -49) {
					out += BOTTOM;
				}
				else if ((firstStepFromNonEdge || lastStep) && dy == 49) {
					out += TOP;
				}
				else if (dx == 1) {
					out += (3 + dy).toString()
				}
				else if (dx == 0) {
					out += (3 + 2 * dy).toString()
				}
				else if (dx == -1) {
					out += (7 - dy).toString()
				}
			}
			x = step.x
			y = step.y

			firstStep = false;
		}

		// console.log(startPos, path, out)

		return out
	},

	deserializePathSINGLEROOM: function(startPos, path) {
		var out = [];
		var x = startPos.x;
		var y = startPos.y;
		var firstStep = true;

		for (var step of path) {
			let dx = 0;
			let dy = 0;
			switch (parseInt(step)) {
				case TOP:
					dy = -1;
					break;
				case TOP_RIGHT:
					dx = 1;
					dy = -1;
					break;
				case RIGHT:
					dx = 1;
					break;
				case BOTTOM_RIGHT:
					dx = 1;
					dy = 1;
					break;
				case BOTTOM:
					dy = 1;
					break;
				case BOTTOM_LEFT:
					dx = -1;
					dy = 1;
					break;
				case LEFT:
					dx = -1;
					break;
				case TOP_LEFT:
					dx = -1;
					dy = -1;
					break;
			}
			x = x + dx;
			y = y + dy;

			out.push(new RoomPosition(x, y, startPos.roomName));
		}

		return out
	},

	runPathFinder : function(fromPos, toPos, targetRange, moveSpeed, options, approxRoute) {
		let plains
		if (options.plainsCost) {
			plains = options.plainsCost
		}
		else {
			plains = moveSpeed > 0 ? 1 : 2
		}

		let swamps;
		if (options.swampCost) {
			swamps = options.swampCost
		}
		else {			
			if 		(moveSpeed == 0) swamps = 10
			else if (moveSpeed == 1) swamps = 5
			else if (moveSpeed == 5) swamps = 1
			else if (moveSpeed == 2) swamps = 4
			else if (moveSpeed == 3) swamps = 3
			else if (moveSpeed == 4) swamps = 2
				
			// Swamps are dangerous. Can't run easily.
			if (options.movementMask) {
				swamps *= 3;
			}
			if (options.avoidHostiles && swamps >= 5) {
				swamps *= 2;
			}
		}

		if (options.swampMod) {
			swamps = Math.round(swamps * options.swampMod)
		}


		if (!global.costMatrices) {
			global.costMatrices = {}
		}
		if (!global.costMatricesStructure) {
			global.costMatricesStructure = {}
		}

		let isMultiTarget = _.isArray(toPos);


		// This is invalid
		if (!isMultiTarget && options.avoidCombatEdges && (fromPos.roomName != toPos.roomName || options.maxRooms != 1) && fromPos.getWorldRangeToPos(toPos) > targetRange) {
			console.log("options.avoidCombatEdges set but we're trying to inter-room", JSON.stringify(fromPos), JSON.stringify(toPos), JSON.stringify(options))
			var err = new Error();
			console.log(err.stack);
		}

		if (!isMultiTarget && options.avoidCombatEdges && util.isEdgeOfRoom(fromPos)) {
			options.avoidCombatEdges = 0
			options.maxRooms = 1
		}

		// if (fromPos.roomName == "E16S40") { 
		// 	console.log(approxRoute, JSON.stringify(options))
		// }

		let allowLowOps = !isMultiTarget && fromPos.roomName == toPos.roomName && !options.swampMod && (!Game.rooms[fromPos.roomName] || !Game.rooms[fromPos.roomName].dangerous)


		let maxRooms = options.avoidCombatEdges ? 1 : (options.maxRooms || 16);

		if (!isMultiTarget && Memory.season2 && !options.maxRooms && !options.avoidCombatEdges) {
			if (util.getCentreRoomForRoomPos(fromPos) != util.getCentreRoomForRoomPos(toPos)) {
				options.maxRooms = 64
			}
		}

		let maxOps = options.maxOps || Math.round(((allowLowOps ? 5000 : (50000 * maxRooms / 16)) * (options.movementMask ? 2 : 1)) * (options.maxOptsMod || 1) * (Game.cpu.bucket / 5000))

		let targetObject = isMultiTarget ? toPos : {pos: toPos, range: targetRange}



		return PathFinder.search(fromPos, targetObject, {
			plainCost: plains,
			swampCost: swamps,
			maxOps: maxOps,
			heuristicWeight: options.heuristicWeight || 1.0,
			maxCost: options.maxCost || Infinity,
			maxRooms: maxRooms,
			flee: options.flee || false,
			roomCallback: function(roomName) {
				let startCPU = Game.cpu.getUsed()
				Memory.stats.cmCalls = (Memory.stats.cmCalls || 0) + 1

				// if (fromPos.roomName == "E16S40") { 
				// 	console.log(roomName, util.isRoomAccessible(roomName))
				// }


				if (!util.isRoomAccessible(roomName)) {
					Memory.stats.cmHits = (Memory.stats.cmHits || 0) + 1
					Memory.stats.cmCPU = (Memory.stats.cmCPU || 0) + Game.cpu.getUsed() - startCPU;
					return false
				}

				let mem = Memory.rooms[roomName];
				var hostileRoom = mem && ((mem.owner && mem.owner != util.getMyName()) || mem.invCL);

				if (Memory.season2 && hostileRoom && mem.owner == "Cub") {
					hostileRoom = false
				}

				// Enemy has claimed this room. Maybe this isn't for us!
				if (hostileRoom && options.avoidEnemyRooms && (isMultiTarget || toPos.roomName != roomName) && fromPos.roomName != roomName) {
					let hasTowers = ((mem.twrX && mem.twrX.length != 0) || mem.invCL) || !mem.enemyFullyConnected;
					if (hasTowers || (mem.safeMode || 0) > 0) {
						Memory.stats.cmHits = (Memory.stats.cmHits || 0) + 1
						Memory.stats.cmCPU = (Memory.stats.cmCPU || 0) + Game.cpu.getUsed() - startCPU;
						// console.log("CM Enemy room", Game.cpu.getUsed() - startCPU)
						return false;
					}
				}

				if (roomName != fromPos.roomName && (isMultiTarget || roomName != toPos.roomName)) {
					let room = Game.rooms[roomName];
					if (approxRoute && !approxRoute.includes(roomName)) {
						Memory.stats.cmHits = (Memory.stats.cmHits || 0) + 1
						Memory.stats.cmCPU = (Memory.stats.cmCPU || 0) + Game.cpu.getUsed() - startCPU;
						// console.log("CM approxroute", Game.cpu.getUsed() - startCPU)
						return false;
					}
					if (!options.ignoreNukes && mem && mem.nukeLandTime !== undefined && mem.nukeLandTime - Game.time < 100) {
						Memory.stats.cmHits = (Memory.stats.cmHits || 0) + 1
						Memory.stats.cmCPU = (Memory.stats.cmCPU || 0) + Game.cpu.getUsed() - startCPU;
						// console.log("CM nukes", Game.cpu.getUsed() - startCPU)
						return false;
					}
					if ((!room || room.dangerous) && options.maxDT !== undefined && mem && mem.DT > options.maxDT) {
						Memory.stats.cmHits = (Memory.stats.cmHits || 0) + 1
						Memory.stats.cmCPU = (Memory.stats.cmCPU || 0) + Game.cpu.getUsed() - startCPU;
						// console.log("CM maxDT", Game.cpu.getUsed() - startCPU)
						return false;
					}
					if ((!room || room.dangerous) && options.minKD !== undefined && mem && (mem.kd || 0) < options.minKD) {
						Memory.stats.cmHits = (Memory.stats.cmHits || 0) + 1
						Memory.stats.cmCPU = (Memory.stats.cmCPU || 0) + Game.cpu.getUsed() - startCPU;
						// console.log("CM minkd", Game.cpu.getUsed() - startCPU)
						return false;
					}
				}

				// Only allow pathing in rooms or exit rooms
				if (options.movementMask && !isMultiTarget) {
					let toRoom = toPos.roomName;

					if (roomName != toRoom) {
						let exits = Game.map.describeExits(toRoom);

						let found = false;
						for (let exitDir in exits) {
							if (exits[exitDir] == roomName) {
								found = true;
								break;
							}
						}
						if (!found) {
							console.log("Not allowing formation pathing in", roomName, "toRoom", toRoom)
							Memory.stats.cmHits = (Memory.stats.cmHits || 0) + 1
							Memory.stats.cmCPU = (Memory.stats.cmCPU || 0) + Game.cpu.getUsed() - startCPU;
							// console.log("CM mask too far", Game.cpu.getUsed() - startCPU)
							return false;
						}
					}
				}

				let globalHash = roomName + "_" + (options.avoidEnemyRooms ? "1" : "") + "_" + (options.avoidCombatEdges ? "1" : "") + "_" + moveSpeed;

				if (!mem && !global.costMatrices[globalHash]) {
					global.defaultCostMatrix = global.defaultCostMatrix || (new customCostMatrix());
					Memory.stats.cmHits = (Memory.stats.cmHits || 0) + 1
					Memory.stats.cmCPU = (Memory.stats.cmCPU || 0) + Game.cpu.getUsed() - startCPU;
					// console.log("CM default 1", Game.cpu.getUsed() - startCPU)

					if (options.visMatrix) {
						console.log("default cm", roomName)
					}

					if (Memory.season2) {
						let costs = new customCostMatrix();

						let coords = util.getSectorCoords(roomName)
						if (coords.x == 0 && coords.y == 0) {
							costs.fillColumn(24, 0, 49, 0xff);
							costs.fillColumn(25, 0, 49, 0xff);
							costs.fillColumn(26, 0, 49, 0xff);
							for (i = 0; i < 50; i++) {
								costs.set2(i, 24, 0xff)
								costs.set2(i, 25, 0xff)
								costs.set2(i, 26, 0xff)
							}
						}
						else if (!mem || (mem.seasonWallsToRemove || ["noMem"]).length) {
							if (coords.x == 0) {
								// if (roomName == "W10S1" || roomName == "W10S2") {
								// 	costs.fillColumn(23, 0, 49, 0xff);
								// }
								// else {								
									costs.fillColumn(25, 0, 49, 0xff);
								// }
							}
							else if (coords.y == 0) {
								for (i = 0; i < 50; i++) {
									costs.set2(i, 25, 0xff)
								}
							}

							// if ((mem.seasonWallsToRemove || []).length) {
							// 	if (util.getCentreRoomForRoomPos(fromPos) != util.getCentreRoomForRoomPos(toPos)) {
									
							// 	}
							// }
						}

						return costs
					}
					else {
						return global.defaultCostMatrix;
					}


				}

				let useGlobal = true;

				let moveResolverState
				if (mem) {					
					if ((isMultiTarget || toPos.roomName != roomName) &&
						fromPos.roomName != roomName &&
						(mem.exitCampedL > 100 || mem.exitCampedR > 100 || mem.exitCampedT > 100 || mem.exitCampedB > 100)) {
						useGlobal = false;
					}

					// Don't let lairs block us if we're going to and from. Cached matrix has lairs
					if (mem &&
						(mem.skLairsX || []).length > 0 /*&&
						 // Memory.keeperHarvestRooms.indexOf(roomName) == -1 &&
						 (toPos.roomName == roomName || fromPos.roomName == roomName)*/) {
						useGlobal = false;
					}

					// Global for enemy room avoidance assumes we are not moving to the other room.
					if (!isMultiTarget && options.avoidEnemyRooms && Game.map.getRoomLinearDistance(roomName, toPos.roomName) <= 1) {
						if (Memory.rooms[toPos.roomName] && Memory.rooms[toPos.roomName].owner && Memory.rooms[toPos.roomName].owner != util.getMyName()) {
							useGlobal = false;
						}
					}
					if (options.avoidEnemyRooms && Game.map.getRoomLinearDistance(roomName, fromPos.roomName) <= 1) {
						if (Memory.rooms[fromPos.roomName] && Memory.rooms[fromPos.roomName].owner && Memory.rooms[fromPos.roomName].owner != util.getMyName()) {
							useGlobal = false;
						}
					}

					moveResolverState = moveResolver.getState(roomName)

					if (moveResolverState && Game.cpu.bucket > 1000) {
						useGlobal = false
					}

				}

				// Want to make sure we have a clean cost matrix for dangerous rooms. Only likely to be important if we can see them at the moment
				// if (Game.rooms[roomName] && mem && mem.longTermDanger > 1) {
				// 	useGlobal = false;
				// }

				// Better than nothing.
				// if (!mem) {
				// 	useGlobal = true;
				// }

				let room = Game.rooms[roomName];

				let avoidLocalCreeps = options.avoidLocalCreeps && roomName == fromPos.roomName;
				let avoidHostiles;
				if (room && room.dangerous) {
					avoidHostiles = options.avoidHostiles
				}
				else {
					avoidHostiles = 0
				}

				if (useGlobal && global.costMatrices[globalHash] &&
					(!room || !avoidLocalCreeps) &&
					(!room || !options.avoidAllCreeps) &&
					(!room || !options.avoidOtherFormations) &&
					(!room || !options.creepsBlockMovement) &&
					!options.ignoreKeepers &&
					(!room || !avoidHostiles) &&
					(!options.excludedPositions) &&
					(!room || !options.avoidAllEnemies) &&
					(!room || !options.avoidRamparts) &&
					!options.avoidStronghold &&
					!options.goThroughStructures &&
					!options.movementMask &&
					!options.noiseMap &&
					!options.forceMoveRooms &&
					(!options.portalPath || isMultiTarget || roomName != toPos.roomName) &&
					(!room || !options.rampartForced) &&
					(!room || !options.rampartFocus)) {

					// If we're in a hostile room then refresh frequently
					if (room && (hostileRoom || room.keeperRoom) && Game.time - global.costMatrices[globalHash].t > 10) {
						delete global.costMatrices[globalHash];
					}
					else if (Game.time - global.costMatrices[globalHash].t < ((room || hostileRoom) ? 1000 : (mem ? 2000 : 4000)))  {
						Memory.stats.cmHits = (Memory.stats.cmHits || 0) + 1
						Memory.stats.cmCPU = (Memory.stats.cmCPU || 0) + Game.cpu.getUsed() - startCPU;
						// console.log("hit", globalHash, JSON.stringify(options))
						// let costs = new PathFinder.CostMatrix;
						// costs._bits = global.costMatrices[globalHash].c;
						// console.log("CM hit 1", Game.cpu.getUsed() - startCPU)

						// if (options.visMatrix) {
						// 	let costs = new customCostMatrix(global.costMatrices[globalHash].c)
						// 	var vis = new RoomVisual(roomName)
						// 	for (var i = 0; i < 50; i++) {
						// 		for (var j = 0; j < 50; j++) {
						// 			vis.text(costs.get(i,j), i, j, {font: 0.5})
						// 		}
						// 	}
						// }



						return {_bits: global.costMatrices[globalHash].c};
					}
					else {
						// console.log("reset2", globalHash, JSON.stringify(options))
						delete global.costMatrices[globalHash];
					}

					// return global.costMatrices[globalHash].c
				}


				if (!mem) {
					global.defaultCostMatrix = global.defaultCostMatrix || (new customCostMatrix());
					Memory.stats.cmHits = (Memory.stats.cmHits || 0) + 1
					Memory.stats.cmCPU = (Memory.stats.cmCPU || 0) + Game.cpu.getUsed() - startCPU;
					// console.log("CM default 2", Game.cpu.getUsed() - startCPU)
					return global.defaultCostMatrix;
				}

				let avoidStronghold = options.avoidStronghold && mem.invCL;

				Memory.stats.cmCacheMiss = (Memory.stats.cmCacheMiss || 0) + 1

				// If two hit the same cost matrix in the same tick, just use that.
				/*if (!options.noiseMap && !mem || (mem.skLairsX || []).length == 0) {
					Game.costMatrices = Game.costMatrices || {};
					let localHash = roomName + JSON.stringify(options);
					if (Game.costMatrices[localHash]) {
						return Game.costMatrices[localHash];
					}
				}*/

				// let start = Game.cpu.getUsed()
				// let oldHeap = Game.cpu.getHeapStatistics ? Game.cpu.getHeapStatistics() : {};

				let costs;
				// try {
					// console.log(roomName, JSON.stringify(options))
					costs = new customCostMatrix();
				// }
				// catch (e) {
				// 	console.log("Cost matrix new failed. Calling gc")
				// 	console.log("Num cost matrices ", Object.keys(global.costMatrices || {}).length);
				// 	gc();
				// 	costs = new customCostMatrix();
				// 	console.log("Old ", JSON.stringify(oldHeap));
				// 	console.log("New ", JSON.stringify(Game.cpu.getHeapStatistics()));
				// 	console.log(e);
				// 	console.log(e.stack);
				// }
				let modified = false;

				// if (Game.cpu.getUsed() > 400) console.log("pre getRoomTerrain in patchCache", roomName, Game.cpu.getUsed());
				let roomTerrain = Game.map.getRoomTerrain(roomName)
				// console.log("post getRoomTerrain in patchCache", roomName, Game.cpu.getUsed());

				// Random noise to jiggle up paths a little. Useful for swarms
				if (options.noiseMap) {
					for (var i = 0; i < 50; i++) {
						for (var j = 0; j < 50; j++) {
							let terrain = roomTerrain.get(i, j);

							if 		(terrain & TERRAIN_MASK_WALL)  costs.set2(i, j, 255); // 0, 1, 2
							else if (terrain & TERRAIN_MASK_SWAMP) costs.set2(i, j, Math.floor(5 + Math.random() * 3)); // 0, 1, 2
							else 								   costs.set2(i, j, Math.floor(1 + Math.random() * 3)); // 0, 1, 2
						}
					}
					modified = true;
				}

				// We're trying to through an SK room (not to). Make lair region unwalkable if we're not harvesting it.
				// Ignore this all if we're in formation

				// Ranges are REALLY IMPORTANT. If they flee at range 4 and we don't mark them blocked at range 4 we flee-return-flee-return.
				// Need to be careful here.

				// Thingies go next to the areas I'm marking danger.
				const skRangeSource = constants.SK_DANGER_RANGE + 1;
				const skRangeLair = constants.SK_DANGER_RANGE;

				if (!options.ignoreKeepers && !options.movementMask && mem && (mem.skLairsX || []).length > 0 && !Memory.keeperHarvestRooms.includes(roomName)) {
					if (room && (fromPos.roomName == room.name || isMultiTarget || toPos.roomName == room.name)) {
						avoidHostiles = avoidHostiles || 4
					}
					else {
						for (let lairIdx in mem.skLairsX) {
							if (!isMultiTarget && toPos.roomName == roomName && toPos.getRangeTo(new RoomPosition(mem.skLairsX[lairIdx], mem.skLairsY[lairIdx], roomName)) < 5) {
								continue;
							}
							let fromSK = fromPos.roomName == roomName && fromPos.getRangeTo(new RoomPosition(mem.skLairsX[lairIdx], mem.skLairsY[lairIdx], roomName)) < 5

							// if (room && (fromPos.roomName == room.name || toPos.roomName == room.name)) {
							// 	let lair = room.lookForAt(LOOK_STRUCTURES, mem.skLairsX[lairIdx], mem.skLairsY[lairIdx])[0];
							// 	if (lair && (lair.ticksToSpawn || 0) > 100) {
							// 		continue;
							// 	}
							// }
							modified = true;

							let minY = Math.max(1, mem.skLairsY[lairIdx] - skRangeLair);
							let maxY = Math.min(49, mem.skLairsY[lairIdx] + skRangeLair);

							// They don't camp the lair, pull it in a bit
							for (let i = -skRangeLair; i <= skRangeLair; i++) {
								let x = mem.skLairsX[lairIdx] + i;
								if (x < 1 || x > 48) continue;
								if (fromSK) {
									for (let j = -skRangeLair; j <= skRangeLair; j++) {

										let y = mem.skLairsY[lairIdx] + j;
										if (y < 1 || y > 48) continue;

										let xyCost = 0;
										let xyTerrain = roomTerrain.get(x, y);
										if 	(xyTerrain & TERRAIN_MASK_WALL)  xyCost = 0xff
										costs.set2(x, y, Math.max(xyCost, Math.max(0xfe, costs.get(x, y))));
									}
								}
								else {
									costs.fillColumn(x, minY, maxY, 0xFF);
								}

								// for (let j = -4; j <= 4; j++) {
								// 	let y = mem.skLairsY[lairIdx] + j;
								// 	if (x >= 1 && x <= 48 && y >= 1 && y <= 48) {
								// 		costs.set2(x, y, 255);
								// 	}
								// }
							}
							for (let i = -skRangeLair - 1; i <= skRangeLair + 1; i++) {
								let x = mem.skLairsX[lairIdx] + i;
								if (x < 1 || x > 48) continue;

								for (let j = -skRangeLair - 1; j <= skRangeLair + 1; j++) {
									if (Math.abs(i) <= skRangeLair && Math.abs(j) <= skRangeLair) continue;

									let y = mem.skLairsY[lairIdx] + j;
									if (y < 1 || y > 48)  continue;
									let xyCost = 0;
									let xyTerrain = roomTerrain.get(x, y);
									if 		(xyTerrain & TERRAIN_MASK_WALL)  xyCost = 0xff
									else if (xyTerrain & TERRAIN_MASK_SWAMP) xyCost = swamps * 3;
									else 									 xyCost = plains * 3;

									costs.set2(x, y, Math.max(xyCost, Math.max(16, costs.get(x, y))));
								}
							}
						}

						for (let srcIdx = 0; srcIdx < roomIntel.getNumSources(roomName); srcIdx++) {
							let srcX = roomIntel.getSourceX(roomName, srcIdx);
							let srcY = roomIntel.getSourceY(roomName, srcIdx);
							if (!isMultiTarget && toPos.roomName == roomName && toPos.getRangeTo(new RoomPosition(srcX, srcY, roomName)) < skRangeSource) {
								continue;
							}
							let fromSK = fromPos.roomName == roomName && fromPos.getRangeTo(new RoomPosition(srcX, srcY, roomName)) < skRangeSource

							modified = true;

							let minY = Math.max(1, srcY - skRangeSource);
							let maxY = Math.min(49, srcY + skRangeSource);

							for (let i = -skRangeSource; i <= skRangeSource; i++) {
								let x = srcX + i;
								if (x < 1 || x > 48) continue;
								if (fromSK) {
									for (let j = -skRangeLair; j <= skRangeLair; j++) {
										let y = srcY + j;
										if (y < 1 || y > 48) continue;

										let xyCost = 0;
										let xyTerrain = roomTerrain.get(x, y);
										if 	(xyTerrain & TERRAIN_MASK_WALL)  xyCost = 0xff
										costs.set2(x, y, Math.max(xyCost, Math.max(0xfe, costs.get(x, y))));
									}
								}
								else {
									costs.fillColumn(x, minY, maxY, 0xFF);
								}
							}

							for (let i = -skRangeSource - 1; i <= skRangeSource + 1; i++) {
								let x = srcX + i;
								if (x < 1 || x > 48) continue;
								for (let j = -skRangeSource - 1; j <= skRangeSource + 1; j++) {
									if (Math.abs(i) <= skRangeSource && Math.abs(j) <= skRangeSource) continue;

									let y = srcY + j;
									if (y < 1 || y > 48)  continue;
									let xyCost = 0;
									let xyTerrain = roomTerrain.get(x, y);
									if 		(xyTerrain & TERRAIN_MASK_WALL)  xyCost = 0xff
									else if (xyTerrain & TERRAIN_MASK_SWAMP) xyCost = swamps * 3;
									else 									 xyCost = plains * 3;

									costs.set2(x, y, Math.max(xyCost, Math.max(16, costs.get(x, y))));
								}
							}
						}

						let mX = roomIntel.getMineralX(roomName);
						let mY = roomIntel.getMineralY(roomName);


						if ((isMultiTarget || toPos.roomName != roomName || toPos.getRangeTo(new RoomPosition(mX, mY, roomName)) >= skRangeSource) &&
						    (fromPos.roomName != roomName || fromPos.getRangeTo(new RoomPosition(mX, mY, roomName)) >= skRangeSource)) {
							let minY = Math.max(1, mY - skRangeSource);
							let maxY = Math.min(49, mY + skRangeSource);
							modified = true;
							for (let i = -skRangeSource; i <= skRangeSource; i++) {
								let x = mX + i;

								if (x < 1 || x > 48) continue;
								costs.fillColumn(x, minY, maxY, 0xFF);
							}

							for (let i = -skRangeSource - 1; i <= skRangeSource + 1; i++) {
								let x = mX + i;
								if (x < 1 || x > 48) continue;

								for (let j = -skRangeSource - 1; j <= skRangeSource + 1; j++) {
									if (Math.abs(i) <= skRangeSource && Math.abs(j) <= skRangeSource) continue;
									let y = mY + j;
									if (y < 1 || y > 48)  continue;
									let xyCost = 0;
									let xyTerrain = roomTerrain.get(x, y);
									if 		(xyTerrain & TERRAIN_MASK_WALL)  xyCost = 0xff
									else if (xyTerrain & TERRAIN_MASK_SWAMP) xyCost = swamps * 3;
									else 									 xyCost = plains * 3;

									costs.set2(x, y, Math.max(xyCost, Math.max(16, costs.get(x, y))));
								}
							}
						}
					}

				}


				if ((isMultiTarget || toPos.roomName != roomName) &&
					fromPos.roomName != roomName) {

					if (mem.exitCampedL > 100) {
						for (var i = 1; i < 49; i++) {
							let ijCost = 0;
							let ijTerrain = roomTerrain.get(0, i);
							if 		(ijTerrain & TERRAIN_MASK_WALL)  ijCost = 0xff
							else if (ijTerrain & TERRAIN_MASK_SWAMP) ijCost = swamps;
							else 									 ijCost = plains;

							let diff = mem.exitCampedL / 100;
							if (mem.exitCampedLPos && i > mem.exitCampedLPos - 10 && i < mem.exitCampedLPos + 10) {
								diff *= 1 + (0.1 * (10 - Math.abs(mem.exitCampedLPos - i)));
							}

							costs.set2(0, i, Math.max(ijCost, Math.min(254, costs.get(0, i) + Math.floor(diff))));
						}
						modified = true;
					}

					if (mem.exitCampedR > 100) {
						for (var i = 1; i < 49; i++) {
							let ijCost = 0;
							let ijTerrain = roomTerrain.get(49, i);
							if 		(ijTerrain & TERRAIN_MASK_WALL)  ijCost = 0xff
							else if (ijTerrain & TERRAIN_MASK_SWAMP) ijCost = swamps;
							else 									 ijCost = plains;

							let diff = mem.exitCampedR / 100;
							if (mem.exitCampedRPos && i > mem.exitCampedRPos - 10 && i < mem.exitCampedRPos + 10) {
								diff *= 1 + (0.1 * (10 - Math.abs(mem.exitCampedRPos - i)));
							}

							costs.set2(49, i, Math.max(ijCost, Math.min(254, costs.get(49, i) + Math.floor(diff))));
						}
						modified = true;
					}

					if (mem.exitCampedT > 100) {
						for (var i = 1; i < 49; i++) {
							let ijCost = 0;
							let ijTerrain = roomTerrain.get(i, 0);
							if 		(ijTerrain & TERRAIN_MASK_WALL)  ijCost = 0xff
							else if (ijTerrain & TERRAIN_MASK_SWAMP) ijCost = swamps;
							else 									 ijCost = plains;

							let diff = mem.exitCampedT / 100;
							if (mem.exitCampedTPos && i > mem.exitCampedTPos - 10 && i < mem.exitCampedTPos + 10) {
								diff *= 1 + (0.1 * (10 - Math.abs(mem.exitCampedTPos - i)));
							}

							costs.set2(i, 0, Math.max(ijCost, Math.min(254, costs.get(i, 0) + Math.floor(diff))));
						}
						modified = true;
					}

					if (mem.exitCampedB > 100) {
						for (var i = 1; i < 49; i++) {
							let ijCost = 0;
							let ijTerrain = roomTerrain.get(i, 49);
							if 		(ijTerrain & TERRAIN_MASK_WALL)  ijCost = 0xff
							else if (ijTerrain & TERRAIN_MASK_SWAMP) ijCost = swamps;
							else 									 ijCost = plains;

							let diff = mem.exitCampedB / 100;
							if (mem.exitCampedBPos && i > mem.exitCampedBPos - 10 && i < mem.exitCampedBPos + 10) {
								diff *= 1 + (0.1 * (10 - Math.abs(mem.exitCampedBPos - i)));
							}

							costs.set2(i, 49, Math.max(ijCost, Math.min(254, costs.get(i, 49) + Math.floor(diff))));
						}
						modified = true;
					}
				}


				if (!room) {
					if (options.excludedPositions) {
						// JSON.stringify(options.excludedPositions)
						// var visual = new RoomVisual(roomName)

						for (let position of options.excludedPositions) {
							if (position.roomName == roomName) {
								// JSON.stringify(position)
								if (isMultiTarget || toPos.x != position.x || toPos.y != position.y) {
									costs.set2(position.x, position.y, 255);
								}
							}
						}
						modified = true;
					}

					// Try to avoid this room. It has nasty connectivity
					if (mem && mem.fullyConnected === 0 && (isMultiTarget || toPos.roomName != roomName) && fromPos.roomName != roomName) {
						let coords = util.getSectorCoords(roomName);

						if (coords.x != 0 && coords.y != 0) {							
							if (mem.iP > 100 && (isMultiTarget || toPos.roomName != roomName) && fromPos.roomName != roomName) {
								return false;
							}

							// if (fromPos.roomName != roomName) {
								let i
								for (i = 1; i < 49; i++) {
									if (!(roomTerrain.get(i, 0) & TERRAIN_MASK_WALL)) {
										costs.set2(i, 0, 0x80)
									}
									if (!(roomTerrain.get(i, 49) & TERRAIN_MASK_WALL)) {
										costs.set2(i, 49, 0x80)
									}
									if (!(roomTerrain.get(0, i) & TERRAIN_MASK_WALL)) {
										costs.set2(0, i, 0x80)
									}
									if (!(roomTerrain.get(49, i) & TERRAIN_MASK_WALL)) {
										costs.set2(49, i, 0x80)
									}
								}
							// }
							modified = true;
						}
					}

					if (options.movementMask) {
						for (var maskDir of options.movementMask) {
							let i
							let j
							let x
							let y
							for (i = 0; i < 50; i++) {
								// Don't walk along edges, go through them or don't. Only works with positive masks...
								// costs.set2(maskDir[0], i, Math.max(costs.get(maskDir[0], i), 10))
								// costs.set2(49 - maskDir[0], i, Math.max(costs.get(49 - maskDir[0], i), 10))

								// costs.set2(i, maskDir[1], Math.max(costs.get(i, maskDir[1]), 10))
								// costs.set2(i, 49 - maskDir[1], Math.max(costs.get(i, 49 - maskDir[1]), 10))

								x = i + maskDir[0];
								if (x < 0 || x > 49) continue;
								for (j = 0; j < 50; j++) {
									y = j + maskDir[1];
									if (y < 0 || y > 49) continue;

									let xyCost = 0;
									let xyTerrain = roomTerrain.get(x, y);
									if 		(xyTerrain & TERRAIN_MASK_WALL)  xyCost = 0xff
									else if (xyTerrain & TERRAIN_MASK_SWAMP) xyCost = swamps;
									else 									 xyCost = plains;

									let ijCost = 0;
									let ijTerrain = roomTerrain.get(i, j);
									if 		(ijTerrain & TERRAIN_MASK_WALL)  ijCost = 0xff
									else if (ijTerrain & TERRAIN_MASK_SWAMP) ijCost = swamps;
									else 									 ijCost = plains;

									costs.set2(i, j, Math.max(costs.get(i, j), xyCost, ijCost))
								}
							}
						}
						for (let maskDir of options.movementMask) {
							for (let i = 0; i < 50; i++) {
								// Don't walk along edges, go through them or don't. Only works with positive masks...
								costs.set(49 - maskDir[0], i, Math.max(costs.get(49 - maskDir[0], i), 40))
								costs.set(i, 49 - maskDir[1], Math.max(costs.get(i, 49 - maskDir[1]), 40))
							}

							for (let i = 0; i < 50; i++) {
								costs.set(0, i, Math.max(costs.get(0, i), costs.get(maskDir[0], i), 40))
								costs.set(i, 0, Math.max(costs.get(i, 0), costs.get(i, maskDir[1]), 40))
							}
						}

						// if (roomName == "E1S19" && (options.movementMask || options.rampartForced)) {
						// 	console.log(fromPos, toPos, JSON.stringify(options))
						// 	var vis = new RoomVisual(roomName)
						// 	for (var i = 0; i < 50; i++) {
						// 		for (var j = 0; j < 50; j++) {
						// 			vis.text(costs.get(i,j), i, j, {font: 0.5})
						// 		}
						// 	}
						// }


						modified = true;
					}

					if (targetRange == 0 && !isMultiTarget && toPos.roomName == roomName && costs.get2(toPos.x, toPos.y)) {
						costs.set2(toPos.x, toPos.y, 0)
						modified = true;
					}

					if (Memory.season2) {
						let coords = util.getSectorCoords(roomName)
						if (coords.x == 0 && coords.y == 0) {
							if (!mem || !mem.seasonWalkable || !mem.seasonWalkable[0]) {
								costs.fillColumn(24, 0, 25, 0xff);
								costs.fillColumn(25, 0, 25, 0xff);
								costs.fillColumn(26, 0, 25, 0xff);
								modified = true
							}
							if (!mem || !mem.seasonWalkable || !mem.seasonWalkable[2]) {
								costs.fillColumn(24, 25, 49, 0xff);
								costs.fillColumn(25, 25, 49, 0xff);
								costs.fillColumn(26, 25, 49, 0xff);
								modified = true
							}

							if (!mem || !mem.seasonWalkable || !mem.seasonWalkable[1]) {
								for (i = 25; i < 49; i++) {
									costs.set2(i, 24, 0xff)
									costs.set2(i, 25, 0xff)
									costs.set2(i, 26, 0xff)
								}
								modified = true
							}
							if (!mem || !mem.seasonWalkable || !mem.seasonWalkable[3]) {
								for (i = 0; i < 25; i++) {
									costs.set2(i, 24, 0xff)
									costs.set2(i, 25, 0xff)
									costs.set2(i, 26, 0xff)
								}
								modified = true
							}
						}
						else if (!mem || (mem.seasonWallsToRemove || ["noMem"]).length) {
							if (coords.x == 0) {
								// if (roomName == "W10S1" || roomName == "W10S2") {
								// 	costs.fillColumn(23, 0, 49, 0xff);
								// }
								// else {
									costs.fillColumn(25, 0, 49, 0xff);
								// }

							}
							else if (coords.y == 0) {
								for (i = 0; i < 50; i++) {
									costs.set2(i, 25, 0xff)
								}
							}
							modified = true

							// if ((mem.seasonWallsToRemove || []).length) {
							// 	if (util.getCentreRoomForRoomPos(fromPos) != util.getCentreRoomForRoomPos(toPos)) {

							// 	}
							// }
						}
					}


					// For probably two years I was caching cost matrices based off rooms we can't see...
					/*if (useGlobal &&
						!avoidLocalCreeps &&
						!options.avoidAllCreeps &&
						!options.avoidOtherFormations &&
						!options.creepsBlockMovement &&
						!options.ignoreKeepers &&
						!avoidHostiles &&
						!options.excludedPositions &&
						!options.avoidAllEnemies &&
						!options.avoidRamparts &&
						!avoidStronghold &&
						!options.goThroughStructures &&
						!options.movementMask &&
						!options.noiseMap &&
						!options.forceMoveRooms &&
						!options.rampartForced &&
						!options.rampartFocus) {
						global.costMatrices[globalHash] = modified ? {t: Game.time, c: costs._bits} : ({t: Game.time, c: (global.defaultCostMatrix || costs)._bits});
						// global.costMatrices[globalHash] = modified ? {t: Game.time, c: costs} : ({t: Game.time, c: global.defaultCostMatrix || costs});
					}*/

					// if (options.visMatrix) {
					// 	var vis = new RoomVisual(roomName)
					// 	for (var i = 0; i < 50; i++) {
					// 		for (var j = 0; j < 50; j++) {
					// 			vis.text(costs.get(i,j), i, j, {font: 0.5})
					// 		}
					// 	}
					// }


					Memory.stats.cmCPU = (Memory.stats.cmCPU || 0) + Game.cpu.getUsed() - startCPU;
					// console.log("CM final no-vis", Game.cpu.getUsed() - startCPU, JSON.stringify(options))

					return costs;

				}


				// console.log(roomName, Game.cpu.getUsed() - start)
				let enemyRoom = room.isEnemyRoom()
				let roomMap;
				if (enemyRoom) {
					roomMap = roomIntel.getEnemyRoomMap(roomName);
				}

				if (options.excludedPositions) {
					// var visual = new RoomVisual(roomName)
					for (let position of options.excludedPositions) {
						if (position.roomName == roomName) {
							if (isMultiTarget || toPos.x != position.x || toPos.y != position.y) {
								costs.set2(position.x, position.y, 255);
								modified = true;
								// let colour = "#ff0000"
								// visual.rect(position.x - 0.5, position.y - 0.5, 1, 1, {fill: colour, opacity: 0.2})
							}
						}
					}
				}

				if (avoidStronghold) {
					let invCX = mem.invCX
					let invCY = mem.invCY
					let level = mem.invCL

					if (level == 5) {
						// Don't go anywhere fucking near it
						let minY = Math.max(0, mem.invCY - 6);
						let maxY = Math.min(49, mem.invCY + 6);
						for (let i = invCX - 6; i <= invCX + 6; i++) {
							if (i >= 0 && i <= 49) {
								costs.fillColumn(i, minY, maxY, 0xff);
							}
						}
						modified = true;
					}
					else if (level == 4) {
						let minY = Math.max(0, mem.invCY - 3);
						let maxY = Math.min(49, mem.invCY + 3);
						for (let i = invCX - 3; i <= invCX + 3; i++) {
							if (i >= 0 && i <= 49) {
								costs.fillColumn( i, minY, maxY, 0xff);
							}
						}
						modified = true;
					}
					else if (level == 3) {
						let minY = Math.max(0, mem.invCY - 2);
						let maxY = Math.min(49, mem.invCY + 3);
						for (let i = invCX - 3; i <= invCX + 2; i++) {
							if (i >= 0 && i <= 49) {
								costs.fillColumn(i, minY, maxY, 0xff);
							}
						}
						modified = true;
					}
					else if (level == 2) {
						let minY = Math.max(0, mem.invCY - 2);
						let maxY = Math.min(49, mem.invCY + 2);
						for (let i = invCX - 2; i <= invCX + 2; i++) {
							if (i >= 0 && i <= 49) {
								costs.fillColumn(i, minY, maxY, 0xff);
							}
						}
						modified = true;
					}
				}

				if (options.avoidRamparts && roomMap) {
					room.ramparts.forEach(function(structure) {
						// Only avoid the boundary ramparts
						if (!structure.my && parseInt(roomMap[structure.pos.x][structure.pos.y]) == 3) {
							for (var i = -3; i <= 3; i++) {
								if (structure.pos.x + i < 0 || structure.pos.x + i > 49) continue;
								for (var j = -3; j <= 3; j++) {
									if (structure.pos.y + j < 0 || structure.pos.y + j > 49) continue;

									let avoidHeuristic = 0.8 * Math.max(Math.abs(i), Math.abs(j)) + 0.2 * Math.min(Math.abs(i), Math.abs(j));

									let ijTerrain = roomTerrain.get(structure.pos.x + i, structure.pos.y + j);
									let ijCost;
									if 		(ijTerrain & TERRAIN_MASK_WALL)  ijCost = 0xff
									else if (ijTerrain & TERRAIN_MASK_SWAMP) ijCost = swamps;
									else 									 ijCost = plains;

									if (ijCost != 0xff) {
										costs.set2(structure.pos.x + i, structure.pos.y + j, Math.min(254, Math.max(costs.get(structure.pos.x + i, structure.pos.y + j), ijCost + Math.round((8 - avoidHeuristic * 2) * options.avoidRamparts))));
									}
								}
							}
							modified = true;
						}
					});
				}

				if (options.goThroughStructures && !options.movementMask) {
					let maxHits = Math.min(WALL_HITS_MAX, Math.max(10e6, mem.highestWall));

					room.find(FIND_STRUCTURES).forEach(function(structure) {
						if (structure.structureType === STRUCTURE_ROAD) {
							costs.set2(structure.pos.x, structure.pos.y, Math.max(1, costs.get(structure.pos.x, structure.pos.y)));
						}
						else if (structure.my && structure.structureType !== STRUCTURE_RAMPART) {
							costs.set2(structure.pos.x, structure.pos.y, 0xff);
						}
						// Movement mask comes later as we need to sum the walls for that
						else if (structure.structureType !== STRUCTURE_CONTAINER &&
								(structure.structureType !== STRUCTURE_RAMPART || !structure.my) &&
								structure.hits !== undefined) {

							// Close combat wants to avoid ramparts, ranged wants to target them.
							var hits = structure.hits;
							if (!options.closeCombatFormation && structure.structureType === STRUCTURE_RAMPART) {
								hits = Math.round(hits / 2);
							}
							else if (options.closeCombatFormation && structure.structureType !== STRUCTURE_RAMPART) {
								hits = Math.round(hits * 0.9);
							}


							// aaaw crap, this gets hard with 300 million walls
							// Well. They probably won't exist!
							if (hits > maxHits) {
								hits = maxHits;
							}

							// This isn't ideal. If there's only one wall it kinda works
							// But if there's multiple it favours the big wall over two small ones.
							var hitCosts = Math.round(120 * Math.sqrt(hits / maxHits))

							// not a pushover.
							if (hits > 10000) {
								hitCosts += 5;
							}

							costs.set2(structure.pos.x, structure.pos.y, Math.max(hitCosts, costs.get(structure.pos.x, structure.pos.y)));
						}
					});
					modified = true;
				}
				else if (!options.goThroughStructures) {
					let usedStructureCache = false;
					if (!modified && useGlobal && global.costMatricesStructure[globalHash]) {
						if (room && (hostileRoom || room.keeperRoom) && Game.time - global.costMatricesStructure[globalHash].t > 10) {
							delete global.costMatricesStructure[globalHash];
						}
						else if (Game.time - global.costMatricesStructure[globalHash].t < ((room || hostileRoom) ? 10 : (mem ? 2000 : 4000)))  {
							costs._bits.set(global.costMatricesStructure[globalHash].c, 0)
							usedStructureCache = true;
							modified = true
						}
						else {
							// console.log("reset2", globalHash, JSON.stringify(options))
							delete global.costMatricesStructure[globalHash];
						}
					}

					if (!usedStructureCache) {
						let preModified = modified
						function doDefaultStructures(costs) {
							let modified = false
							for (let structure of room.find(FIND_STRUCTURES)) {
								if (structure.structureType === STRUCTURE_ROAD) {
									// Favor roads over plain tiles
									/*if (options.rampartFocus && moveSpeed == 0) {
										if (costs.get(structure.pos.x, structure.pos.y) < 0xff) {
											costs.set(structure.pos.x, structure.pos.y, Math.max(1, costs.get(structure.pos.x, structure.pos.y) / 2));
										}
									}
									else {*/
										costs.set2(structure.pos.x, structure.pos.y, Math.max(1, costs.get2(structure.pos.x, structure.pos.y)));
									// }
									modified = true;
								}
								else if (structure.structureType !== STRUCTURE_CONTAINER &&
										 structure.structureType !== STRUCTURE_CONTROLLER &&
										(structure.structureType !== STRUCTURE_RAMPART || (!structure.my && (!structure.isPublic || structure.owner.username != "Screeps")))) {
									// Can't walk through non-walkable buildings
									// We shouldn't call it with range = 0 but if we make it unwalkable it'll go tits up.
									if (Memory.season2 && structure.structureType === STRUCTURE_RAMPART && 
										(structure.owner.username == "Cub" || structure.owner.username == "Montblanc" || structure.owner.username == "psy372")) {
										if (structure.isPublic || structure.owner.username == "psy372") {
											continue
										}
									}
									else if (Memory.season3 && structure.structureType === STRUCTURE_RAMPART && 
										(structure.owner.username == "PythonBeatJava")) {
										if (structure.isPublic || structure.owner.username == "psy372") {
											continue
										}
									}

									costs.set2(structure.pos.x, structure.pos.y, 0xff);
									modified = true;
								}
								// else if (structure.structureType == STRUCTURE_RAMPART && structure.my) {
									// if (!options.rampartFocus) {
										// Ramparts are often bottlenecks and gates, don't prefer to path through them over staying our side.
										// costs.set2(structure.pos.x, structure.pos.y, Math.max(2, costs.get(structure.pos.x, structure.pos.y)));
									// }
								// }
							}
							return modified;
						}

						modified = doDefaultStructures(costs) || modified;

						if (!preModified && useGlobal) {
							let cachedCM = new customCostMatrix();
							cachedCM.copyFrom(costs)
							global.costMatricesStructure[globalHash] = {t: Game.time, c: cachedCM._bits}
						}
					}
				}

				// if (roomName == "E17S23") {
				// 	console.log("a", costs.get(9, 40))
				// }


				let segementData
				let floodedDesign

				if ((options.rampartFocus || options.rampartForced) && mem.ID !== undefined) {
					segementData = segments.loadSegmentData(50 + mem.ID % 45);
					if (segementData) {
						floodedDesign = segementData[roomName].floodedDesign;
					}
				}

				// 1 is inside, 0 is outside. Ramparts are 2
				// NOTE: This is cached across ramparters in a room with JSON.stringify(options) as the hash. If
				// there is fromPos/toPos depending shit it needs to go up there ^^^^ into the hash.
				// Right now we just have fromOutside.
				if ((options.rampartFocus || options.rampartForced) && mem.ID !== undefined) {
					if (options.maxRooms == 1) {
						costs.fillColumn(0, 1, 48, 0xff);
						costs.fillColumn(49, 1, 48, 0xff);
						for (var i = 1; i < 49; i++) {
							costs.set2(i, 0, 0xff)
							costs.set2(i, 49, 0xff)
						}
						modified = true;
					}

					if (floodedDesign) {
						let extraCost;

						// 0 is outside, 
						let fromOutside = parseInt(floodedDesign[fromPos.x][fromPos.y]) === 0

						if (fromOutside) {							
							let currentStructs = room.lookForAt(LOOK_STRUCTURES, fromPos.x, fromPos.y);
							for (let struct of currentStructs) {
								if (struct.structureType == STRUCTURE_RAMPART && struct.hits > 10000) {
									fromOutside = 0;
									break;
								}
							}
						}

						let ramparterGlobalHash;
						let cacheHit = false;
						// This should be fucking set.
						// if (global.creepRamparterPhase) {
							ramparterGlobalHash = roomName + "_" + JSON.stringify(options) + "_" + fromOutside;
							global.creepRamparterData.costMatrices = global.creepRamparterData.costMatrices || {};
							if (global.creepRamparterData.costMatrices[ramparterGlobalHash]) {
								costs.copyFrom(global.creepRamparterData.costMatrices[ramparterGlobalHash])
								cacheHit = true;
							}

						// }
						// else {
						// 	console.log("global.creepRamparterPhase not set for ramparter", fromPos, toPos, JSON.stringify(options))
						// }

						if (!cacheHit) {
							let extraCostForcedInside = 2;

							if (fromOutside) {
								extraCost = 1 * (options.rampartForced ? 2 : 1);
							}
							else if (options.rampartForced && !fromOutside) {
								extraCost = 3 * (options.rampartForced ? 2 : 1);
							}
							else {
								extraCost = 10 * (options.rampartForced ? 2 : 1);
							}

							for (var i = 1; i < 49; i++) {
								for (var j = 1; j < 49; j++) {
									let hasRampart = 1;
									let des = parseInt(floodedDesign[i][j])

									// Rampart, check it exists
									let structs = room.lookForAt(LOOK_STRUCTURES, i, j);
									for (let struct of structs) {
										if (struct.structureType == STRUCTURE_RAMPART && struct.hits > 10000) {
											hasRampart = 1;
											break;
										}
									}

									if (hasRampart) {
										continue
									}

									if (options.rampartForced && !fromOutside) {
										// Outside, no rampart
										if (des == 0 || des == 2) {
											costs.set2(i, j, 0xff)
										}
										// Inside, no rampart
										else if (des == 1) {												
											let ijCost;
											let ijTerrain = roomTerrain.get(i, j);
											if 		(ijTerrain & TERRAIN_MASK_WALL)  ijCost = 0xff
											else if (ijTerrain & TERRAIN_MASK_SWAMP) ijCost = swamps * extraCostForcedInside;
											else 									 ijCost = plains * extraCostForcedInside;

											if (ijCost < 0xff) {
												costs.set2(i, j, Math.min(254, costs.get2(i, j) + ijCost))
											}
										}
									}
									else if (options.rampartFocus || (options.rampartForced && fromOutside)) {
										let ijCost;

										if (des === 0 || des === 2) {
											let ijTerrain = roomTerrain.get(i, j);
											if 		(ijTerrain & TERRAIN_MASK_WALL)  ijCost = 0xff
											else if (ijTerrain & TERRAIN_MASK_SWAMP) ijCost = swamps * extraCost;
											else 									 ijCost = plains * extraCost;
											if (ijCost < 0xff) {
												costs.set2(i, j, Math.min(254, (costs.get2(i, j) || 1) + ijCost))
											}
										}
										else if (room && room.breached && des == 1) {
											let ijTerrain = roomTerrain.get(i, j);
											if 		(ijTerrain & TERRAIN_MASK_WALL)  ijCost = 0xff
											else if (ijTerrain & TERRAIN_MASK_SWAMP) ijCost = swamps * Math.round(extraCost / 2);
											else 									 ijCost = plains * Math.round(extraCost / 2);

											if (ijCost < 0xff) {
												costs.set2(i, j, Math.min(254, (costs.get2(i, j) || 1) + ijCost))
											}
										}
									}

									/*let missingRampart = 1;
									let des = parseInt(floodedDesign[i][j])

									// Rampart, check it exists
									if (des == 2) {
										let structs = room.lookForAt(LOOK_STRUCTURES, i, j);
										for (let struct of structs) {
											if (struct.structureType == STRUCTURE_RAMPART && struct.hits > 10000) {
												missingRampart = 0;
												break;
											}
										}
									}
									// Inside or outside
									else {
										missingRampart = 0;
									}

									if (options.rampartForced && !fromOutside) {
										// Inside or on the border which should be a rampart
										if (des === 0 || missingRampart) {
											costs.set2(i, j, 0xff)
										}
										else if (des == 1) {
											let hasRampart = 0
											let structs = room.lookForAt(LOOK_STRUCTURES, i, j);
											for (let struct of structs) {
												if (struct.structureType == STRUCTURE_RAMPART && struct.hits > 10000) {
													hasRampart = 1;
													break;
												}
											}

											if (!hasRampart) {												
												let ijCost;
												let ijTerrain = roomTerrain.get(i, j);
												if 		(ijTerrain & TERRAIN_MASK_WALL)  ijCost = 0xff
												else if (ijTerrain & TERRAIN_MASK_SWAMP) ijCost = swamps * extraCost;
												else 									 ijCost = plains * extraCost;

												if (ijCost < 0xff) {
													costs.set2(i, j, Math.min(254, costs.get2(i, j) + ijCost))
												}
											}
										}
									}
									else if (options.rampartFocus || (options.rampartForced && fromOutside)) {
										let ijCost;

										if (des === 0 || missingRampart) {
											let ijTerrain = roomTerrain.get(i, j);
											if 		(ijTerrain & TERRAIN_MASK_WALL)  ijCost = 0xff
											else if (ijTerrain & TERRAIN_MASK_SWAMP) ijCost = swamps * extraCost;
											else 									 ijCost = plains * extraCost;
											if (ijCost < 0xff) {
												costs.set2(i, j, Math.min(254, (costs.get2(i, j) || 1) + ijCost))
											}
										}
										else if (room && room.breached && des == 1) {
											let ijTerrain = roomTerrain.get(i, j);
											if 		(ijTerrain & TERRAIN_MASK_WALL)  ijCost = 0xff
											else if (ijTerrain & TERRAIN_MASK_SWAMP) ijCost = swamps * Math.round(extraCost / 2);
											else 									 ijCost = plains * Math.round(extraCost / 2);

											if (ijCost < 0xff) {
												costs.set2(i, j, Math.min(254, (costs.get2(i, j) || 1) + ijCost))
											}
										}
									}*/
								}
							}


							// if (global.creepRamparterPhase) {
								if (!global.creepRamparterData.costMatrices[ramparterGlobalHash]) {
									global.creepRamparterData.costMatrices[ramparterGlobalHash] = costs.clone();
								}
							// }
						}

						modified = true;
					}
				}




				room.find(FIND_MY_CONSTRUCTION_SITES).forEach(function(site) {
					if (OBSTACLE_OBJECT_TYPES.includes(site.structureType)) {
						costs.set2(site.pos.x, site.pos.y, 0xff);
						modified = true;
					}
				});

				if (Memory.season2) {
					room.find(FIND_HOSTILE_CONSTRUCTION_SITES).forEach(function(site) {
						if (site.owner.username == "Cub") {							
							costs.set(site.pos.x, site.pos.y, 0xfe);
							modified = true;
						}
					});
				}

				// console.log(roomName, Game.cpu.getUsed() - start)

				// var vis = new RoomVisual(roomName)
				// if (roomName == "E18S8") {
				// 	console.log("b", costs.get(11, 10))
				// }




				let anyRamparts = room.ramparts.length
				let anyContainers = room.containers.length
				for (var creep of room.find(FIND_CREEPS).concat(room.find(FIND_POWER_CREEPS))) {
					if (!creep.my && (options.avoidAllEnemies || (avoidHostiles && creep.hasDamagingBodypart(false)))) {
						if (Memory.swc && global.whiteList.includes(creep.owner.username)) continue

						let rangeToFinalPos = isMultiTarget ? Infinity : toPos.getRangeTo(creep.pos)
						// Don't avoid them if we're going to them
						if (rangeToFinalPos > 1 || options.flee) {
							let creepDamage;
							let hostileRamparts;

							let mod = avoidHostiles ? avoidHostiles : 5
							let enemyRange = 3;
							let limit = 4;
							let damageFactor;

							if (options.movementMask) {
								let parts = creep.getBoostModifiedCombatParts(true, true);
								creepDamage = parts.numAttack * ATTACK_POWER + parts.numRanged * RANGED_ATTACK_POWER * 2;

								hostileRamparts = room.lookForAt(LOOK_STRUCTURES, creep.pos.x, creep.pos.y);

								hostileRamparts = _.filter(hostileRamparts, (structure) => (structure.structureType == STRUCTURE_RAMPART && !structure.my));

								if (parts.numRanged) {
									limit = 5;
								}
								else if (parts.numAttack) {
									limit = 3;
								}

								damageFactor = 1 / (options.closeCombatFormation ? 0.05 : 0.15);

								// Lots of formations => ignore defenders more
								if (hostileRamparts.length) {									
									let formationCountMod = 1;
									if (global.roomAssaultCounts && global.roomAssaultCounts[roomName]) {
										formationCountMod = 1 / (global.roomAssaultCounts[roomName].assaultCount || 1)
									}

									mod *= formationCountMod;
								}

								if (!options.closeCombatFormation) {
									mod *= (1 - (mem.undamagingFormation || 0.5)) * (mem.notOnWall || 0.5);
								}
							}

							if ((options.rampartFocus || options.rampartForced) && mem.ID !== undefined) {
								limit = 5;
								if (floodedDesign) {
									if (parseInt(floodedDesign[fromPos.x][fromPos.y]) !== 0) {
										if (creep.hasBodypart(RANGED_ATTACK)) {
											enemyRange = 3;
										}
										else {
											enemyRange = 1;
										}
									}
								}
							}

							if (Game.cpu.bucket < 1000) {
								limit -= 1
							}
							if (Game.cpu.bucket < 750) {
								limit -= 1
							}

							let posX = creep.pos.x;
							let posY = creep.pos.y;

							let i
							let j

							// Avoid them if possible
							for (i = -limit; i <= limit; i++) {
								if (posX + i < 0 || posX + i > 49) continue;
								for (j = -limit; j <= limit; j++) {
									if (posY + j < 0 || posY + j > 49) continue;

									if (costs.get2(posX + i, posY + j) == 0xff) {
										continue
									}

									const ijTerrain = roomTerrain.get(posX + i, posY + j);
									let ijCost;
									if 		(ijTerrain & TERRAIN_MASK_WALL)  ijCost = 0xff
									else if (ijTerrain & TERRAIN_MASK_SWAMP) ijCost = swamps;
									else 									 ijCost = plains;

									if (ijCost != 0xff) {
										const avoidHeuristic = (0.8 * Math.max(Math.abs(i), Math.abs(j)) + 0.2 * Math.min(Math.abs(i), Math.abs(j)));

										let hasMyRampart = 0;
										if (anyRamparts) {										
											var myRamparts = room.lookForAt(LOOK_STRUCTURES, posX + i, posY + j);

											for (let structure of myRamparts) {
												if (structure.structureType == STRUCTURE_RAMPART && structure.my) {
													hasMyRampart = 1;
													break;
												}
											}
										}

										if (hasMyRampart) continue

										// myRamparts = _.filter(myRamparts, (structure) => (structure.structureType == STRUCTURE_RAMPART && structure.my));

										// console.log(myRamparts)

										// 1 is inside. Don't give inside a malus if the enemy range is one and we're not breached.
										if (enemyRange == 1 && (options.rampartFocus || options.rampartForced) && !room.breached && mem.ID !== undefined) {
											// let segementData = segments.loadSegmentData(50 + mem.ID % 45);
											if (!segementData || !segementData[roomName].floodedDesign || parseInt(segementData[roomName].floodedDesign[creep.pos.x + i][creep.pos.y + j]) !== 1) {
												costs.set2(creep.pos.x + i, creep.pos.y + j, Math.min(254, Math.max(costs.get(creep.pos.x + i, creep.pos.y + j), ijCost + Math.round((20 - avoidHeuristic * 4) * mod))));
											}
										}
										else {
											if (options.movementMask) {
												let extraCost = 0
												if (hostileRamparts.length == 0) {
													if (roomMap && fromPos.roomName == roomName) {
														if (parseInt(roomMap[fromPos.x][fromPos.y]) == parseInt(roomMap[posX][posY])) {
															extraCost = Math.round(Math.max(0, (Math.round(creepDamage * mod / (0.1 * options.avoidTowers) - avoidHeuristic * 5))));
														}
														else {
															extraCost = Math.round(Math.max(0, (Math.round(creepDamage * mod / (0.03 * options.avoidTowers) - avoidHeuristic * 5))));
														}
													}
													else {
														extraCost = Math.round(Math.max(0, (Math.round(creepDamage * mod / (0.03 * options.avoidTowers) - avoidHeuristic * 5))));
													}
												}
												else if (Game.time - (mem.withdrawTick || 0) < 100 || mem.advBlkDmg > 0.2) {
													if (options.closeCombatFormation) {
														// Don't sit back.
														damageFactor *= (1 + 0.5 * (Memory.rooms[creep.pos.roomName].advBlkDmg || 0))
													}
													else {
														// Don't be afraid to sit back
														damageFactor *= (1 - 0.25 * (Memory.rooms[creep.pos.roomName].advBlkDmg || 0))	
													}
													// Unless we're not even in range of any creeps, then really move around.
													damageFactor *= (1 + 5 * (Memory.rooms[creep.pos.roomName].advBlkDmgTowersOnly || 0))

													extraCost = Math.round(Math.max(0, (Math.round(creepDamage * damageFactor * mod / options.avoidTowers - avoidHeuristic * 10))));
												}

												// if (creep.id == "5f5df6baba82cad2a2e9b7f1") {
												// 	console.log(creep.pos.x + i, creep.pos.y + j, extraCost)
												// }


												costs.set2(posX + i, posY + j, Math.min(253, Math.max(costs.get(posX + i, posY + j), ijCost + extraCost)));
											}
											else {
												// vis.text(costs.get(creep.pos.x + i, creep.pos.y + j), creep.pos.x + i, creep.pos.y + j, {font: 0.5})
												costs.set2(posX + i, posY + j, Math.min(253, Math.max(costs.get(posX + i, posY + j), ijCost + Math.round((20 - avoidHeuristic * 4) * mod))));

												// vis.text(costs.get(creep.pos.x + i, creep.pos.y + j), creep.pos.x + i, creep.pos.y + j, {font: 0.5})
											}
										}
									}
								}
							}

							if (!options.movementMask || creepDamage > options.avoidTowers) {
								costs.set2(posX, posY, Math.max(costs.get(posX, posY), 254));
							}
							modified = true;
						}
					}

					if (options.creepsBlockMovement) {
						costs.set2(creep.pos.x, creep.pos.y, Math.max(costs.get2(creep.pos.x, creep.pos.y), options.rampartForced ? 20 : 200));
						modified = true;
					}
					else if (options.avoidAllCreeps || options.avoidFormations) {
						if (costs.get(creep.pos.x, creep.pos.y) < 0xff) {
							if (creep.assaulter && options.avoidFormations) {
								if (creep.memory.formationCreeps) {
									let zeroCreep = Game.creeps[creep.memory.formationCreeps[0]];

									if (creep == zeroCreep && zeroCreep.pos.getRangeTo(fromPos) != 0) {
										for (let creep2Name of zeroCreep.memory.formationCreeps) {
											if (Game.creeps[creep2Name]) {
												costs.set2(Game.creeps[creep2Name].pos.x, Game.creeps[creep2Name].pos.y, Math.min(254, costs.get(Game.creeps[creep2Name].pos.x, Game.creeps[creep2Name].pos.y) + options.avoidFormations));
											}
										}
									}
								}
							}
							else {
								costs.set2(creep.pos.x, creep.pos.y, Math.min(254, costs.get(creep.pos.x, creep.pos.y) + 5));
							}
						}
						modified = true;
					}
					else if (avoidLocalCreeps && creep.pos.getRangeTo(fromPos) <= 3) {
						if (costs.get(creep.pos.x, creep.pos.y) < 0xff) {
							if (options.movementMask) {
								if (costs.get(creep.pos.x, creep.pos.y) < 100) {
									costs.set2(creep.pos.x, creep.pos.y, Math.min(254, costs.get(creep.pos.x, creep.pos.y) + Math.round((options.rampartFocus ? 3 : 1) * 20 * avoidLocalCreeps)));
								}
								else {
									costs.set2(creep.pos.x, creep.pos.y, Math.min(254, costs.get(creep.pos.x, creep.pos.y) + Math.round((options.rampartFocus ? 3 : 1) * 40 * avoidLocalCreeps)));
								}
							}
							else {
								let mod = (creep.mem.path && creep.mem.path.length > 1) ? 0.5 : 1

								if (creep.mem.pairIdx !== undefined) {
									mod *= 2;
								}

								// let mod = ((creep.mem.mS && creep.mem.mS < 3) || (creep.mem.path && creep.mem.path.length > 1)) ? 0.1 : 1
								costs.set2(creep.pos.x, creep.pos.y, Math.min(254, costs.get(creep.pos.x, creep.pos.y) + Math.round(mod * (options.rampartFocus ? 3 : 1) * 40 * avoidLocalCreeps)));
							}
						}
						modified = true;
					}
					// A bit of a hack, but harvesters don't tend to move much. Considering them as
					// static is a fair approximation.					
					else if (anyContainers && creep.my && creep.mem.role &&
							(creep.mem.role == "harvester" ||
							creep.mem.role == "bHarvester" ||
							creep.mem.role == "keeperMiner" ||
							creep.mem.role == "keeperHarvester" ||
							creep.mem.role == "centralHarvester" ||
							creep.mem.role == "keeperHarvester2" ||
							 creep.mem.role == "miner" || 
							 creep.mem.role == "upgrader")) {
						if (creep.mem.role == "upgrader") {
							if (creep.pos.getRangeTo(creep.room.controller) <= 3) {								
								let container = creep.pos.findFirstInRange(creep.room.containers, 1) || creep.pos.findFirstInRange(creep.room.links, 1)

								if (container && container.pos.inRangeTo(creep.room.controller, 2)) {
									costs.set2(creep.pos.x, creep.pos.y, Math.max(costs.get2(creep.pos.x, creep.pos.y), 10));
									modified = true;
								}
							}
						}
						else {							
							var containers = room.lookForAt(LOOK_STRUCTURES, creep.pos);

							containers = _.filter(containers, (structure) => (structure.structureType == STRUCTURE_CONTAINER));

							if (containers.length > 0 && !isMultiTarget && !toPos.isNearToRoomObject(creep)) {
								// Want to avoid harvesters and miners who are parked on containers
								costs.set2(creep.pos.x, creep.pos.y, Math.max(costs.get2(creep.pos.x, creep.pos.y), 10));
								modified = true;
							}
						}
					}
					else if (room.isMyRoom() && creep.my && creep.mem.role &&
							(creep.mem.role == "sbs" ||
							creep.mem.role == "ss")) {
						costs.set2(creep.pos.x, creep.pos.y, Math.max(costs.get2(creep.pos.x, creep.pos.y), 20));
						modified = true;
					}
					else if (creep.my && creep.mem.mS && creep.mem.mS > 100) {
						costs.set2(creep.pos.x, creep.pos.y, Math.max(costs.get2(creep.pos.x, creep.pos.y), 20));
						modified = true;
					}

					// if (roomName == "E17S23") {
					// 	console.log(creep, costs.get(9, 40))
					// }
				};

				// if (roomName == "E18S8") {
				// 	console.log("c", costs.get(11, 10))
				// }

				// if (roomName == "E4S44") {
				// 	console.log(fromPos, toPos, JSON.stringify(options))
				// 	console.log(roomName, Game.cpu.getUsed() - startCPU)
				// 	for (var i = 0; i < 50; i++) {
				// 		for (var j = 0; j < 50; j++) {
				// 			if (costs.get(i,j)) vis.text(costs.get(i,j), i, j, {font: 0.5})
				// 		}
				// 	}
				// }


				if (options.avoidCombatEdges && !util.isEdgeOfRoom(fromPos)) {
					// Corners are out, saves a smidgen
					costs.fillColumn(0, 1, 48, 0xff);
					costs.fillColumn(49, 1, 48, 0xff);
					for (var i = 1; i < 49; i++) {
						costs.set2(i, 0, 0xff)
						costs.set2(i, 49, 0xff)
					}
					modified = true;
				}

				// This might get expensive if we've got a lot of enemy rooms
				if (options.avoidEnemyRooms) {
					var exits = Game.map.describeExits(roomName);
					for (var enemyRoomName of Memory.enemyRooms) {						
						if (!Memory.rooms[enemyRoomName]) continue;
						if (Game.map.getRoomLinearDistance(roomName, enemyRoomName) > 1) continue
						if ((!isMultiTarget && toPos.roomName == enemyRoomName) || fromPos.roomName == enemyRoomName) continue

						if (exits[FIND_EXIT_TOP] == enemyRoomName) {
							let hasTowers = (Memory.rooms[enemyRoomName].twrX && Memory.rooms[enemyRoomName].twrX.length != 0) || !Memory.rooms[enemyRoomName].enemyFullyConnected;
							if (hasTowers || (Memory.rooms[enemyRoomName].safeMode || 0) > 0) {
								for (var i = 1; i < 49; i++) {
									costs.set2(i, 0, 0xff)
								}
							}
							modified = true;

						}
						else if (exits[FIND_EXIT_RIGHT] == enemyRoomName) {
							let hasTowers = (Memory.rooms[enemyRoomName].twrX && Memory.rooms[enemyRoomName].twrX.length != 0) || !Memory.rooms[enemyRoomName].enemyFullyConnected;;
							if (hasTowers || (Memory.rooms[enemyRoomName].safeMode || 0) > 0) {
								costs.fillColumn(49, 1, 48, 0xff);
							}
							modified = true;
							// for (var i = 1; i < 49; i++) {
							// 	costs.set2(49, i, 0xff)
							// }
						}
						else if (exits[FIND_EXIT_BOTTOM] == enemyRoomName) {
							let hasTowers = (Memory.rooms[enemyRoomName].twrX && Memory.rooms[enemyRoomName].twrX.length != 0) || !Memory.rooms[enemyRoomName].enemyFullyConnected;;
							if (hasTowers || (Memory.rooms[enemyRoomName].safeMode || 0) > 0) {
								for (var i = 1; i < 49; i++) {
									costs.set2(i, 49, 0xff)
								}
							}
							modified = true;
						}
						else if (exits[FIND_EXIT_LEFT] == enemyRoomName) {
							let hasTowers = (Memory.rooms[enemyRoomName].twrX && Memory.rooms[enemyRoomName].twrX.length != 0) || !Memory.rooms[enemyRoomName].enemyFullyConnected;;
							if (hasTowers || (Memory.rooms[enemyRoomName].safeMode || 0) > 0) {
								costs.fillColumn(0, 1, 48, 0xff);
							}
							modified = true;
							// for (var i = 1; i < 49; i++) {
								// costs.set2(0, i, 0xff)
							// }
						}
					}
				}

				// console.log(roomName, Game.cpu.getUsed() - start)
				// if (roomName == "E18S8") {
				// 	console.log("e", costs.get(11, 10))
				// }


				if (options.avoidTowers && room.towers.length > 0 && (mem.maxTowerDamageAtOuterWall || (room.towers.length * TOWER_POWER_ATTACK)) > options.avoidTowers && (!room.controller || !room.controller.my)) {
					let zone = roomMap ? parseInt(roomMap[fromPos.x][fromPos.y]) : -1;

					let enemyTowers = room.towers;

					enemyTowers = _.filter(enemyTowers, (tower) => (!tower.my && tower.isActive()));

					let avoidTowers
					// Don't create a uniform field at max range.
					if (options.avoidTowers < enemyTowers.length * TOWER_POWER_ATTACK * (1 - TOWER_FALLOFF)) {
						avoidTowers = enemyTowers.length * TOWER_POWER_ATTACK * (1 - TOWER_FALLOFF)
					}
					else {
						avoidTowers = options.avoidTowers
					}
						
					if (global.costMatrixTowerDamange &&
						global.costMatrixTowerDamange[roomName] &&
						global.costMatrixTowerDamange[roomName][avoidTowers] &&
						global.costMatrixTowerDamange[roomName][avoidTowers][zone] &&
						global.costMatrixTowerDamange[roomName][avoidTowers][zone][0] !== undefined &&
						Math.random() < 0.95) {
						for (let i = 0; i < 50; i++) {
							for (let j = 0; j < 50; j++) {
								let roundedDamage = global.costMatrixTowerDamange[roomName][avoidTowers][zone][i][j]
								if (roundedDamage) {
									if (roundedDamage == 0xff) {
										costs.set2(i, j, 0xff);
									}
									else {
										costs.set2(i, j, Math.min(0xfe, costs.get(i, j) + roundedDamage));
									}
								}
							}
						}
					}
					else {
						global.costMatrixTowerDamange = global.costMatrixTowerDamange || {}
						global.costMatrixTowerDamange[roomName] = global.costMatrixTowerDamange[roomName] || {}
						global.costMatrixTowerDamange[roomName][avoidTowers] = global.costMatrixTowerDamange[roomName][avoidTowers] || {}
						global.costMatrixTowerDamange[roomName][avoidTowers][zone] = global.costMatrixTowerDamange[roomName][avoidTowers][zone] || []


						for (let i = 0; i < 50; i++) {
							global.costMatrixTowerDamange[roomName][avoidTowers][zone][i] = []
							for (let j = 0; j < 50; j++) {
								if (roomMap && parseInt(roomMap[i][j]) != zone) {
									global.costMatrixTowerDamange[roomName][avoidTowers][zone][i][j] = 0;
									continue;
								}

								let currentCost = costs.get(i, j)
								if (currentCost == 0xff) {
									global.costMatrixTowerDamange[roomName][avoidTowers][zone][i][j] = 0xff
									continue;
								}

								let ijCost = 0;
								let ijTerrain = roomTerrain.get(i, j);
								if 		(ijTerrain & TERRAIN_MASK_WALL)  ijCost = 0xff
								else if (ijTerrain & TERRAIN_MASK_SWAMP) ijCost = swamps;
								else 									 ijCost = plains;

								if (ijCost == 0xff) {
									global.costMatrixTowerDamange[roomName][avoidTowers][zone][i][j] = 0xff
									continue;
								}

								// Ignore max range damage. Not like I can do anything about it and it skews other things.
								let damage = 0;
								for (let tower of enemyTowers) {
									damage += util.getTowerDamageForDist(tower.pos.getRangeToXY(i, j));
								}

								let expectedDamage = Math.max(0, damage - avoidTowers);
								let roundedDamage = Math.round(expectedDamage / 20);

								// Round to 4s, makes the pathfinding a bit easer.
								// Rounding is done later on final matrix.
								// if (Game.cpu.bucket < 2000) {
								// 	// 16
								// 	roundedDamage = roundedDamage & 0xF0;
								// }
								// else if (Game.cpu.bucket < 3000) {
								// 	// 8
								// 	roundedDamage = roundedDamage & 0xF8;
								// }
								// else if (Game.cpu.bucket < 5000) {
								// 	// 4
								// 	roundedDamage = roundedDamage & 0xFC;
								// }
								// else if (Game.cpu.bucket < 10000) {
								// 	// 2
								// 	roundedDamage = roundedDamage & 0xFE;
								// }


								global.costMatrixTowerDamange[roomName][avoidTowers][zone][i][j] = Math.min(254, ijCost + roundedDamage);

								if (roundedDamage > 0) {
									costs.set2(i, j, Math.min(254, currentCost + ijCost + roundedDamage));
								}
							}
						}
					}
					modified = true;
				}

				// if (roomName == "E18S8") {
				// 	console.log("f", costs.get(11, 10))
				// }


				if (options.forceMoveRooms && roomName == fromPos.roomName) {
					for (let i = 0; i < 50; i++) {
						for (let j = 0; j < 50; j++) {
							let ijCost = costs.get(i, j);
							let ijTerrain = roomTerrain.get(i, j);
							if 		(ijTerrain & TERRAIN_MASK_WALL)  ijCost = 0xff
							else if (ijTerrain & TERRAIN_MASK_SWAMP) ijCost = Math.max(swamps, ijCost);
							else 									 ijCost = Math.max(plains, ijCost);

							// If we're switching rooms, then fookin switch rooms.
							if (!isMultiTarget && fromPos.roomName != toPos.roomName && roomName == fromPos.roomName && ijCost < 0xff) {
								ijCost = Math.min(254, ijCost + 200);
							}

							costs.set2(i, j, ijCost)
						}
					}
				}
				// console.log(roomName, Game.cpu.getUsed() - start)


				// Model us as a mega-creep given by the mask.
				if (options.movementMask) {
					if (mem.withdrawLocs && !Memory.disableWithdrawLocs) {
						for (let loc of mem.withdrawLocs) {
							let i = loc.x;
							let j = loc.y;

							let t = Game.time - loc.t

							let ijCost = costs.get(i, j);
							let ijTerrain = roomTerrain.get(i, j);
							if 		(ijTerrain & TERRAIN_MASK_WALL)  continue
							else if (ijTerrain & TERRAIN_MASK_SWAMP) ijCost = Math.max(swamps, ijCost);
							else 									 ijCost = Math.max(plains, ijCost);


							let mod = Math.max(0, Math.round(0.05 * (5 - t / 60) * fromPos.getRangeToXY(i, j)))

							costs.set2(i, j, Math.min(254, ijCost + mod))
						}
					}

					// if (roomName == "E17S23") {
					// 	console.log("b", costs.get(9, 40))
					// }

					if (mem.deathLocs && !Memory.disableDeathLocs) {
						for (let loc of mem.deathLocs) {
							let i = loc.x;
							let j = loc.y;

							if (!Memory.disableCMVis) {
								var vis = new RoomVisual(roomName)
								if (Game.rooms[roomName] && !Game.rooms[roomName].doneDethLocsVis) {
									vis.text("💀", i, j)

									Game.rooms[roomName].doneDethLocsVis = 1;
								}
							}

							let t = Game.time - loc.t

							let ijCost = costs.get(i, j);
							let ijTerrain = roomTerrain.get(i, j);
							if 		(ijTerrain & TERRAIN_MASK_WALL)  continue
							else if (ijTerrain & TERRAIN_MASK_SWAMP) ijCost = Math.max(swamps, ijCost);
							else 									 ijCost = Math.max(plains, ijCost);

							costs.set2(i, j, Math.min(254, ijCost + Math.max(0, Math.round(3 - t / 600))))
						}
					}

					// if (roomName == "E17S23") {
					// 	console.log("g", costs.get(9, 40))
					// }

					// console.log(roomName, Game.cpu.getUsed() - startCPU)
					if (plains != swamps) {
						global.costMatrixTerrain = global.costMatrixTerrain || {}
						if (!global.costMatrixTerrain[roomName]) {
							global.costMatrixTerrain[roomName] = new customCostMatrix();
							for (let i = 0; i < 50; i++) {
								for (let j = 0; j < 50; j++) {
									let ijCost;
									let ijTerrain = roomTerrain.get(i, j);
									if 		(ijTerrain & TERRAIN_MASK_WALL)  ijCost = 0xff
									else if (ijTerrain & TERRAIN_MASK_SWAMP) ijCost = swamps
									else 									 ijCost = plains

									global.costMatrixTerrain[roomName].set2(i, j, ijCost)
								}
							}
						}
						if (!isMultiTarget && fromPos.roomName != toPos.roomName && roomName == fromPos.roomName) {
							for (let i = 0; i < 2500; i++) {
								let ijCost = Math.max(global.costMatrixTerrain[roomName]._bits[i], costs._bits[i]);
									
								// If we're switching rooms, then fookin switch rooms.
								if (ijCost < 0xff) {
									ijCost = Math.min(254, ijCost + 4);
									// ijCost = Math.min(254, ijCost + 40);
								}

								costs._bits[i] = ijCost
							}
						}
						else {
							for (let i = 0; i < 2500; i++) {
								let terrainCost = global.costMatrixTerrain[roomName]._bits[i];
								if (terrainCost > costs._bits[i]) {								
									costs._bits[i] = terrainCost
								}
							}
						}
					}


					// if (roomName == "E17S23") {
					// 	console.log("h", costs.get(9, 40))
					// }


					for (let i = 0; i < 50; i++) {
						if (costs.get2(0, i) < 0xff) {
							costs.set2(0, i, Math.min(254, costs.get2(0, i) + 40));
						}
						if (costs.get2(49, i) < 0xff) {
							costs.set2(49, i, Math.min(254, costs.get2(49, i) + 20));
						}
						if (costs.get2(i, 0) < 0xff) {
							costs.set2(i, 0, Math.min(254, costs.get2(i, 0) + 40));
						}
						if (costs.get2(i, 49) < 0xff) {
							costs.set2(i, 49, Math.min(254, costs.get2(i, 49) + 20));
						}
					}
					// if (roomName == "E17S23") {
					// 	console.log("i", costs.get(9, 40))
					// 	costs.set(36, 28, 40)
					// }




					// console.log(roomName, Game.cpu.getUsed() - startCPU)

					// This section is 1-2 CPU.
					let newCosts = costs.clone();

					for (let maskDir of options.movementMask) {
						if (maskDir[0] == 0 && maskDir[1] == 0) continue;

						if (maskDir[1] != 0) {
							for (let i = 0; i < 50; i++) {
								let x = i + maskDir[0];
								if (x < 0 || x > 49) continue;

								let i50 = i * 50;
								let x50 = x * 50;

								for (let j = 0; j < 50; j++) {
									let y = j + maskDir[1];
									if (y < 0 || y > 49) continue;

									let xy = costs._bits[x50 + y];

									if (newCosts._bits[i50 + j] < xy) {
										newCosts._bits[i50 + j] = xy
									}
								}
							}
						}
						else {							
							for (let i = 0; i < 50; i++) {
								let x = i + maskDir[0];
								if (x < 0 || x > 49) continue;

								let i50 = i * 50;
								let x50 = x * 50;

								for (let y = 0; y < 50; y++) {
									let xy = costs._bits[x50 + y];

									if (newCosts._bits[i50 + y] < xy) {
										newCosts._bits[i50 + y] = xy
									}
								}
							}
						}
					}

					// if (roomName == "E17S23") {
					// 	console.log("j", newCosts.get(9, 40))
					// }



					// This section is 2-5 CPU.
					// let newCosts = new customCostMatrix();

					// for (let maskDir of options.movementMask) {
					// 	if (maskDir[0] == 0 && maskDir[1] == 0) continue;
					// 	for (let i = 0; i < 50; i++) {
					// 		let x = i + maskDir[0];
					// 		if (x < 0 || x > 49) continue;
					// 		for (let j = 0; j < 50; j++) {
					// 			let y = j + maskDir[1];
					// 			if (y < 0 || y > 49) continue;

					// 			let max = Math.max(currentCosts.get2(x, y), currentCosts.get2(i, j))

					// 			if (newCosts.get2(i, j) < max) {
					// 				newCosts.set2(i, j, max)
					// 			}
					// 		}
					// 	}
					// }



					// console.log(roomName, Game.cpu.getUsed() - startCPU)

					let mod = 1;
					// if (fromPos.roomName != toPos.roomName && roomName == fromPos.roomName) {
					// 	mod *= 2;
					// }
					if (roomName != fromPos.roomName && !isMultiTarget && roomName != toPos.roomName) {
						mod *= 2;
					}
					let modL = mem.eWallsL ? 0.5 : 1;
					let modR = mem.eWallsR ? 0.5 : 1;
					let modT = mem.eWallsT ? 0.5 : 1;
					let modB = mem.eWallsB ? 0.5 : 1;

					let exits = Game.map.describeExits(room.name);

					if (exits[RIGHT]) {
						for (let i = 0; i < 50; i++) {
							for (let maskDir of options.movementMask) {
								// Don't walk along edges, go through them or don't. Only works with positive masks...
								newCosts.set2(49 - maskDir[0], i, Math.max(costs.get2(49 - maskDir[0], i), newCosts.get2(49 - maskDir[0], i), Math.round(20 * mod * modR)))
							}
						}
					}

					if (exits[BOTTOM]) {
						for (let i = 0; i < 50; i++) {
							for (let maskDir of options.movementMask) {
								newCosts.set2(i, 49 - maskDir[1], Math.max(costs.get2(i, 49 - maskDir[1]), newCosts.get2(i, 49 - maskDir[1]), Math.round(20 * mod * modB)))
							}
						}
					}

					if (exits[LEFT]) {
						for (let i = 0; i < 50; i++) {
							for (let maskDir of options.movementMask) {
								newCosts.set2(0, i, Math.max(costs.get2(0, i), costs.get2(maskDir[0], i), newCosts.get2(0, i), newCosts.get2(maskDir[0], i), Math.round(40 * mod * modL)))
							}
						}
					}

					if (exits[TOP]) {
						for (let i = 0; i < 50; i++) {
							for (let maskDir of options.movementMask) {
								newCosts.set2(i, 0, Math.max(costs.get2(i, 0), costs.get2(i, maskDir[1]), newCosts.get2(i, 0), newCosts.get2(i, maskDir[1]), Math.round(40 * mod * modT)))
							}
						}
					}
					costs = newCosts;
					// if (roomName == "E17S23") {
					// 	console.log("k", costs.get(9, 40))
					// }

					// console.log(roomName, Game.cpu.getUsed() - startCPU)
					modified = true;
				}

				// if (roomName == "E17S23") {
				// 	console.log("l", costs.get(9, 40))
				// }


				// We need to do this later as the default behaviour gives the
				// max of the walls in the mask. We want the mean.
				if (options.goThroughStructures && options.movementMask) {
					// console.log(roomName, Game.cpu.getUsed() - startCPU)
					let maxHits = Math.round(Math.min(300e6, Math.max(10e6, (mem.highestWall || 0))) * 1.05);

					let boundaryWallScores = roomIntel.getBoundaryWallScores(roomName);

					// Want a modifier to prevent too much movement in actively defended rooms. In these cases "closest" is often better than "thinnest"					
					// I don't much care for this logic in here rather than in formation AI.
					let mod = options.goThroughStructures;

					if (Game.time - (mem.withdrawTick || 0) < 20) {
						mod *= 0.25;
					}

					let formationCountMod = 1;
					if (global.roomAssaultCounts && global.roomAssaultCounts[roomName]) {
						formationCountMod = 1 / (global.roomAssaultCounts[roomName].assaultCount || 1)
					}

					if (!options.closeCombatFormation) {
						// If we're not damaging anything, move around less
						// If we're on a wall, move around less

						// We achieve "not moving around" by making walls and defense heat maps transparent.
						// Don't make this too small...
						let modMod = Math.max(0.1, (1 - (mem.undamagingFormation || 0.5))) * Math.max(0.1, (mem.notOnWall || 0.5))

					 	mod *= modMod;
						formationCountMod *= modMod;
					}



					room.find(FIND_STRUCTURES).forEach(function(structure) {
						if (structure.structureType !== STRUCTURE_ROAD &&
							structure.structureType !== STRUCTURE_CONTAINER &&
							structure.structureType !== STRUCTURE_CONTROLLER &&
							!structure.my &&
							(structure.structureType !== STRUCTURE_RAMPART || !structure.my) &&
							structure.hits !== undefined) {

							if (!isMultiTarget && structure.pos.x == toPos.x && structure.pos.y == toPos.y) {
								return
							}


							// Just go straight through them. Early exits are nice and there are likely
							// to be quite a few extensions/links/observers/labs we'd actually rather path through then around!
							if (structure.hits && structure.hits < 2000) return;

							// let zone = roomMap ? parseInt(roomMap[structure.pos.x][structure.pos.y]) : 9999;

							// Close combat wants to avoid ramparts, ranged wants to target them.
							var hits = structure.hits;
							if (!options.closeCombatFormation) {
								if (structure.structureType === STRUCTURE_RAMPART) {
									hits /= 2;
								}
								else if (structure.structureType !== STRUCTURE_WALL) {
									hits *= .8;
								}
							}
							else if (options.closeCombatFormation && structure.structureType !== STRUCTURE_RAMPART) {
								hits *= 0.9;
							}

							// Mods. It's only a few percent
							if (boundaryWallScores && boundaryWallScores[structure.pos.x] && boundaryWallScores[structure.pos.x][structure.pos.y]) {
								// -ve score is worse
								hits *= 1 - 0.01 * boundaryWallScores[structure.pos.x][structure.pos.y]
							}

							// Bit of a hack.
							if (mem.defenseHeatMap && (Game.time - (mem.withdrawTick || 0) < 100 || mem.advBlkDmg > 0.2)) {
								let towerDamageAtRampart = 0;
								for (let tower of room.towers) {
									if (tower.energy < TOWER_ENERGY_COST || !tower.isActive()) continue;

									towerDamageAtRampart += util.getTowerDamageForDist(tower.pos.getRangeTo(structure.pos));
								}

								hits *= 1 + formationCountMod * Math.max(0, (mem.defenseHeatMap[structure.pos.x][structure.pos.y] || 0) + towerDamageAtRampart - (options.avoidTowers || 0)) / 2000;
							}

							// Ramparts over things we probably want to kill count less
							let otherStructs = structure.pos.lookFor(LOOK_STRUCTURES);
							for (let otherStruct of otherStructs) {
								if (otherStruct.structureType == STRUCTURE_LAB ||
									(otherStruct.structureType == STRUCTURE_STORAGE && mem.killStorage) ||
									(otherStruct.structureType == STRUCTURE_TERMINAL && mem.killTerminal)) {
									hits = hits * .9;
								}
								else if (otherStruct.structureType == STRUCTURE_SPAWN) {
									hits = hits / 2;
								}
								else if (otherStruct.structureType == STRUCTURE_TOWER) {
									hits = hits / 4;
								}
							}

							// These are annoying to deal with
							if (structure.pos.x <= 2 || structure.pos.x >= 47 || structure.pos.y <= 2 || structure.pos.y >= 47) {
								hits *= 2;
							}

							// aaaw crap, this gets hard with 300 million walls
							// Well. They probably won't exist!
							if (hits > maxHits) {
								hits = maxHits;
							}

							// This isn't ideal. If there's only one wall it kinda works
							// But if there's multiple it favours the big wall over two small ones.
							let hitCosts = (200 / options.movementMask.length) * Math.sqrt(hits / maxHits) * mod

							// not a pushover.
							if (hits > 50000) {
								hitCosts += 10 * mod;
								hitCosts = Math.max(5, hitCosts)
							}

							hitCosts = Math.round(hitCosts)

							// console.log(structure.pos, hits, hitCosts, mod, formationCountMod)

							// 1000 = 2
							// 10000 = 6
							// 100000 = 18
							// 1000000 = 56
							// 10000000 = 177
							for (let maskDir of options.movementMask) {
								// Negative offsets. Normally we do (i, j) = max(masks) which needs positive
								// But in this case we're changing all points an object influences
								let x = structure.pos.x - maskDir[0];
								let y = structure.pos.y - maskDir[1];

								if (x >= 0 && y >= 0 && x <= 49 && y <= 49) {
									costs.set2(x, y, Math.max(costs.get2(x, y), Math.min(254, costs.get2(x, y) + hitCosts)));
								}
							}
						}
					});
					modified = true;
				}

				// if (roomName == "E17S23") {
				// 	console.log("m", costs.get(9, 40))
				// }

				// Always free
				if (targetRange == 0 && !isMultiTarget && roomName == toPos.roomName && costs.get2(toPos.x, toPos.y)) {
					costs.set2(toPos.x, toPos.y, 0)
					modified = true;
				}

				// We're close. Put a few hints in there to avoid collisions.
				if (moveResolverState) {
					/*if (targetRange > 0 && fromPos.getRangeTo(toPos) < targetRange + 2) {
						useGlobal = false;

						for (let key in moveResolverState) {
							key = +key;

							let x = Math.floor(key / 100);
							let y = key % 100 - 25;

							if (x < 0 || x > 49 || y < 0 || y > 49) continue

							// Someone else is moving there. Make a tiny malus. Got to be small or we'll repath the long way around
							// and this is very temporary data.
							costs.set(x,y, Math.min(254, costs.get(x,y) + 1));
						}
					}*/
					// useGlobal = false;
					for (let key in moveResolverState) {
						key = +key;

						let x = Math.floor(key / 100);
						let y = key % 100 - 25;

						if (x < 0 || x > 49 || y < 0 || y > 49) continue

						if (fromPos.isNearToPos(new RoomPosition(x, y, roomName))) {
							let currentCost = costs.get(x,y)

							if (currentCost) {
								if (currentCost < 0xff) {
									costs.set(x, y, Math.min(254, currentCost + 1));
									useGlobal = false;
								}
							}
							else {
								let ijTerrain = roomTerrain.get(x, y);
								let ijCost
								if 		(ijTerrain & TERRAIN_MASK_WALL)  ijCost = 0xff
								else if (ijTerrain & TERRAIN_MASK_SWAMP) ijCost = swamps;
								else 									 ijCost = plains;

								if (ijCost < 0xff) {
									costs.set(x, y, Math.min(254, Math.max(currentCost, ijCost) + (options.snaking ? 5: 1)));
									useGlobal = false;
								}
							}

						}
					}
				}


				// Do a rounding pass
				if (!useGlobal && modified && (options.movementMask || options.goThroughStructures || options.avoidAllEnemies || options.avoidTowers || avoidHostiles) && Game.cpu.bucket < 9000) {
					let roundTo
					if (Game.cpu.bucket < 1000) {
						roundTo = 16;
					}
					else if (Game.cpu.bucket < 2000) {
						roundTo = 8;
					}
					else if (Game.cpu.bucket < 3000) {
						roundTo = 4;
					}
					else {
						roundTo = 2;
					}

					for (var i = 0; i < 50; i++) {
						for (var j = 0; j < 50; j++) {
							let cost = costs.get(i, j)

							if (cost > 16 && cost < 255) {
								cost = Math.min(255, Math.max(10, Math.round(cost / roundTo) * roundTo))
							}
						}
					}
				}


				if (roomName == Memory.visCMInRoom) {
					options.visMatrix = 1
				}
				// if ((roomName != "W10S30" && roomName != "W10S31") || Math.random() < 0.9) {
				// 	options.visMatrix = 0
				// }
				// if (!options.flee) {
				// 	options.visMatrix = 0
				// }

				if (options.visMatrix && !Memory.disableCMVis && !isMultiTarget) {
					var vis = new RoomVisual(roomName)
					if (Game.rooms[roomName] && !Game.rooms[roomName].donePathVis) {

						console.log(fromPos, toPos, JSON.stringify(options))

						vis.circle(fromPos.x, fromPos.y, {fill: "#20ff20", radius: 0.5})
						vis.circle(toPos.x, toPos.y, {fill: "#2020ff", radius: 0.5})
						vis.line(fromPos, toPos, {color: "#2020ff", width: 0.25})

						for (var i = 0; i < 50; i++) {
							for (var j = 0; j < 50; j++) {
								if (costs.get(i,j) > 1) {
									vis.text(costs.get(i,j), i, j, {font: 0.5})
								}
							}
						}
						Game.rooms[roomName].donePathVis = 1;
					}
				}


				if (useGlobal &&
					!avoidLocalCreeps &&
					!options.avoidAllCreeps &&
					!options.avoidOtherFormations &&
					!options.creepsBlockMovement &&
					!options.ignoreKeepers &&
					!avoidHostiles &&
					!options.excludedPositions &&
					!options.avoidAllEnemies &&
					!options.avoidRamparts &&
					!avoidStronghold &&
					!options.goThroughStructures &&
					!options.movementMask &&
					!options.noiseMap &&
					!options.forceMoveRooms &&
					(!options.portalPath || roomName != toPos.roomName) &&
					!options.rampartForced &&
					!options.rampartFocus) {

					if (!modified && Math.random() < 0.0001) {
						for (let i = 0; i < 50; i++) {
							for (let j = 0; j < 50; j++) {
								if (costs.get(i, j) != 0) {
									console.log("------------------------------------- CM marked as non-modified but has been modified", roomName)
									modified = true
									break
								}
							}
						}
					}

					global.costMatrices[globalHash] = modified ? {t: Game.time, c: costs._bits} : ({t: Game.time, c: (global.defaultCostMatrix || costs)._bits});
				}

				// console.log(roomName, fromPos, toPos, JSON.stringify(options))
				Memory.stats.cmCPU = (Memory.stats.cmCPU || 0) + Game.cpu.getUsed() - startCPU;
				// console.log("CM final", Game.cpu.getUsed() - startCPU, JSON.stringify(options))
				return costs;

			}
		});
	},

	getPathSpawn : function(fromPos, toPos, targetRange, moveSpeed, avoidLocalCreeps, useCache, options) {
		let res = this.getPath(fromPos, toPos, targetRange, moveSpeed, avoidLocalCreeps, useCache, options);
		Memory.stats.pathSpawnCalls = (Memory.stats.pathSpawnCalls + 1) || 1;
		if (res.hit) {
			Memory.stats.pathSpawnHits = (Memory.stats.pathSpawnHits + 1) || 1;
		}
		return res;
	},

	getPathForRole: function(fromPos, toPos, targetRange, moveSpeed, avoidLocalCreeps, useCache, options, role) {
		let cpuStart = Game.cpu.getUsed();
		let res = this.getPath(fromPos, toPos, targetRange, moveSpeed, avoidLocalCreeps, useCache, options);
		Memory.stats.rolePathCalls[role] = (Memory.stats.rolePathCalls[role] + 1) || 1;
		if (res.hit) {
			Memory.stats.rolePathHits[role] = (Memory.stats.rolePathHits[role] + 1) || 1;
		}
		// else if (role == "fetcher") {
		// 	console.log("miss", fromPos, toPos)
		// }
		Memory.stats.rolePathCPUs[role]= (Memory.stats.rolePathCPUs[role] || 0) + (Game.cpu.getUsed() - cpuStart);
		return res;
	},

	getPathAnalyseRooms : function(fromPos, toPos, targetRange, moveSpeed, avoidLocalCreeps, useCache, options) {
		let cpuStart = Game.cpu.getUsed();
		let res = this.getPath(fromPos, toPos, targetRange, moveSpeed, avoidLocalCreeps, useCache, options);
		Memory.stats.pathAnalyseCalls = (Memory.stats.pathAnalyseCalls + 1) || 1;
		if (res.hit) {
			Memory.stats.pathAnalyseHits = (Memory.stats.pathAnalyseHits + 1) || 1;
		}
		Memory.stats.pathAnalyseCPU = (Memory.stats.pathAnalyseCPU || 0) + (Game.cpu.getUsed() - cpuStart);
		return res;
	},



	getPath : function(fromPos, toPos, targetRange, moveSpeed, avoidLocalCreeps, useCache, options) {
		let cpuStart = Game.cpu.getUsed();

		// useCache = useCache && Memory.ticksSinceThisSignWasLastReset > 25;

		options = _.clone(options) || {}

		toPos = toPos.pos || toPos;

		// Can get an generic object not a RoomPosition
		if (!toPos.getRangeTo) {
			toPos = new RoomPosition(toPos.x, toPos.y, toPos.roomName);
		}

		// if (options.movementMask) {
		// 	console.log(fromPos, toPos, JSON.stringify(options), Game.time)
		// }

		let hash;

		// const reset2 = false;

		options.avoidLocalCreeps = options.avoidLocalCreeps || avoidLocalCreeps;

		if (Memory.resetPathCache) {
			global.costMatrices = {}
			global.pathCache = []
			for (var i = 0; i < segementSquareWidth * segementSquareWidth; i++) {
				RawMemory.segments[i] = "{}"
			}			
		}

		if (!global.pathCache) global.pathCache = []


		var segmentID = getCacheSegmentIDForPos(fromPos, toPos);

		Memory.stats.pathHits = Memory.stats.pathHits || 0;
		Memory.stats.pathCalls = (Memory.stats.pathCalls || 0) + 1;

		// If we're short range, don't bother caching

		// useCache = false;

		useCache = useCache &&
				   !options.avoidLocalCreeps &&
				   !options.avoidAllCreeps &&
				   !options.avoidOtherFormations &&
				   !options.avoidHostiles &&
				   !options.excludedPositions &&
				   !options.avoidAllEnemies &&
				   !options.avoidRamparts &&
				   !options.avoidStronghold &&
				   !options.forceMoveRooms &&
				   !options.rampartFocus &&
				   !options.rampartForced &&
				   !options.creepsBlockMovement &&
				   !options.flee;

		let pathCache;
		useCache = useCache && !(fromPos.roomName == toPos.roomName && fromPos.inRangeToPos(toPos, shortRangeThreshold))

		// These rooms tend to be building roads
		if (Game.cpu.bucket > 9000 && 
			((Game.rooms[fromPos.roomName] && Game.rooms[fromPos.roomName].effectiveLevel >= 3 && Game.rooms[fromPos.roomName].effectiveLevel <= 4) || 
			(Game.rooms[toPos.roomName] && Game.rooms[toPos.roomName].effectiveLevel >= 3 && Game.rooms[toPos.roomName].effectiveLevel <= 4))) {
			useCache = false;
		}

		if (useCache) {
			hash = fromPos.x.toString() + "_" + fromPos.y.toString() + fromPos.roomName
			hash += "_" + toPos.x.toString() + "_" + toPos.y.toString() + toPos.roomName
			hash += "_" + targetRange.toString() + "_" + moveSpeed.toString()
			hash += "_" + (options.maxRooms ? options.maxRooms.toString() : "");

			let mask = (options.avoidEnemyRooms ? 1 : 0) + (options.ignoreKeepers ? 2 : 0) + (options.saveRoomNames ? 4 : 0)

			hash += "_" + mask.toString();

			if (global.pathCache[segmentID]) {
				// console.log("global hit")
				pathCache = global.pathCache[segmentID]
			}
			else {
				pathCache = JSON.parse(RawMemory.segments[segmentID] || "{}")
				global.pathCache[segmentID] = pathCache;
			}
			if (pathCache[hash]) {
				// Cache hit
				// console.log("hit", fromPos, toPos, decompressPath(pathCache[hash].p))
				pathCache[hash].h = (pathCache[hash].h || 0) + 1;
				global.pathCache[segmentID] = pathCache;
				Memory.stats.pathHits++;
				Memory.stats.pathCPU = (Memory.stats.pathCPU || 0) + (Game.cpu.getUsed() - cpuStart);
				return {"hit": true, "incomplete": false, "path": decompressPath(pathCache[hash].p), "r": pathCache[hash].r, "cost": pathCache[hash].c};
			}
		}
		// if (!shortRange && !avoidLocalCreeps && useCache) console.log("miss", fromPos, toPos)


		// Nope, don't path to rooms with nukes about to land.
		// This might freeze up a bunch of creeps for 100 ticks. Meh, better than being nuked!
		if (!options.ignoreNukes && toPos.roomName != fromPos.roomName && Memory.rooms[toPos.roomName] && Memory.rooms[toPos.roomName].nukeLandTime !== undefined && Memory.rooms[toPos.roomName].nukeLandTime - Game.time < 100) {
			return {"hit": false, "incomplete": true, "path": ""};
		}


		// var s = Game.cpu.getUsed()
		// http://support.screeps.com/hc/en-us/articles/207023879
		// console.log(fromPos, toPos)
		let targetPath;
		let usedFindRoute;

		let avoidHostilesInFindRoute = options.maxDT || options.minKD;

		// If we are starting and finishing in a highway room, we can bump the heuristic a bit
		// Sometimes creates a tile or two extra, but can save quite a bit of CPU
		if (!options.heuristicWeight && Game.cpu.bucket < 9000) {			
			let sectorCoordsFrom = util.getSectorCoords(fromPos.roomName);

			if (sectorCoordsFrom.x == 0 || sectorCoordsFrom.y == 0) {				
				let roomCoordsFrom = util.getRoomCoords(fromPos.roomName);
				let roomCoordsTo = util.getRoomCoords(toPos.roomName);

				// let sectorCoordsTo = util.getSectorCoords(toPos.roomName);
				if ((roomCoordsFrom.x == roomCoordsTo.x || roomCoordsFrom.y == roomCoordsTo.y)) {
					options.heuristicWeight = 1.2
				}
			}
		}


		let pathfinderRoomLimit = 8

		if (Memory.season2) {
			// let sectorCoordsFrom = util.getSectorCoords(fromPos.roomName)
			// let sectorCoordsTo = util.getSectorCoords(toPos.roomName)

			let multiSectorPath = util.getCentreRoomForRoomPos(fromPos) != util.getCentreRoomForRoomPos(toPos) // || sectorCoordsFrom.x == 0 || sectorCoordsTo.x == 0 || sectorCoordsFrom.y == 0 || sectorCoordsTo.y == 0

			if (multiSectorPath) {
				pathfinderRoomLimit = 32
			}
			else {
				pathfinderRoomLimit = 16
			}

		}

		// if (toPos.roomName == "W11N12") {
		// 	console.log(fromPos.roomName, toPos.roomName, pathfinderRoomLimit, safeRoute.getSafeRouteCost(fromPos.roomName, toPos.roomName, false, true, pathfinderRoomLimit, false, options.ignoreKeepers))
		// }


		// Don't use portals
		// fromRoom, toRoom, allowPortals, force, maxRange, avoidKeepers, ignoreKeepers
		if (fromPos.roomName == toPos.roomName || safeRoute.getSafeRouteCost(fromPos.roomName, toPos.roomName, false, true, pathfinderRoomLimit, false, options.ignoreKeepers) < pathfinderRoomLimit) {
			usedFindRoute = false;
			targetPath = this.runPathFinder(fromPos, toPos, targetRange, moveSpeed, options)
		}
		else {
			usedFindRoute = true;
			// Try portals
			// fromRoom, toRoom, useNoise, swampMod, allowPortals, maxRange, avoidKeepers, ignoreKeepers
			let route = safeRoute.findSafeRoute(toPos.roomName, fromPos.roomName, false, options.swampMod, true, undefined, false, options.ignoreKeepers, avoidHostilesInFindRoute);
			let routeRoomNames = [];
			if (route == ERR_NO_PATH || !route) {
				// Craaap
				usedFindRoute = false;
				targetPath = this.runPathFinder(fromPos, toPos, targetRange, moveSpeed, options)
			}
			else {
				let maxRooms = (options.maxRooms - 1) || 15

				route.reverse();
				// Starting room isn't in there but does count toward maxRooms
				if (route.length >= maxRooms) {
					toPos = new RoomPosition(25, 25, route[maxRooms - 1].room);
					targetRange = 23;
				}

				let usePortal = 0;
				let portalEntry;

				for (var i = 0; i < Math.min(maxRooms, route.length); i++) {
					routeRoomNames.push(route[i].room)
					if (route[i].exit == "portal") {
						usePortal = 1;
						portalEntry = route[i].room;
						if (Math.random() < 0.1) console.log("Path through portal!!!", fromPos, toPos, portalEntry)
						// Game.notify("Path through portal!!!")
						break;
					}
				}

				if (usePortal) {
					let portalPos = Memory.rooms[portalEntry].portalPos;
					if (portalPos) {						
						toPos = new RoomPosition(portalPos.x, portalPos.y, portalEntry)
						targetRange = 0;
						options.portalPath = 1;
					}
				}

				// Put a bit of noise in the path so we can try to find rooms that are slightly off predicted
				if (routeRoomNames.length < maxRooms) {
					let noiseRoute = safeRoute.findSafeRoute(toPos.roomName, fromPos.roomName, true, options.swampMod, false, undefined, false, options.ignoreKeepers, avoidHostilesInFindRoute);
					if (noiseRoute != ERR_NO_PATH && noiseRoute.length) {
						noiseRoute.reverse();
						let cnt = 0;
						while (routeRoomNames.length < maxRooms && cnt < 10) {
							cnt++
							let testRoom = _.sample(noiseRoute).room
							if (!routeRoomNames.includes(testRoom)) {
								routeRoomNames.push(testRoom)
							}
						}
					}
				}

				if (routeRoomNames.length) {
					targetPath = this.runPathFinder(fromPos, toPos, targetRange, moveSpeed, options, routeRoomNames)
				}
				else {
					targetPath = this.runPathFinder(fromPos, toPos, targetRange, moveSpeed, options)
				}
			}
		}

		// var e = Game.cpu.getUsed();
		// if (e-s > 2.5) {
		// 	console.log(targetPath.ops, fromPos.getRangeTo(toPos), hash, e-s)
		// }

		let incomplete = targetPath.incomplete;

		if (incomplete) {
			Memory.rooms[fromPos.roomName].iP = (Memory.rooms[fromPos.roomName].iP || 0) + 1
		}

		if (incomplete && options.rampartForced) {
			return {"hit": false, "incomplete": incomplete, "usedFindRoute": false, "path": "", "r": []};
		}

		let skipFindRoute = false;
		if (Memory.season2 && incomplete && fromPos.roomName != toPos.roomName && !options.direct) {

			// Haaaacks. My creeps really want to go to the bottom half of these rooms. They really want to
			if ((toPos.roomName == "W9S10" || toPos.roomName == "W8S10") && toPos.x == 25 && toPos.y == 25) {
				toPos = new RoomPosition(toPos.x, 24, toPos.roomName)
			}

			// TODO: Long term solution


			let centreFrom = util.getCentreRoomForRoomPos(fromPos)
			let centreTo = util.getCentreRoomForRoomPos(toPos)

			if (centreFrom != centreTo) {
				let sectorCoordsFrom = util.getSectorCoords(fromPos.roomName)
				let sectorCoordsTo = util.getSectorCoords(toPos.roomName)

				let season2Map = require("season2Map")

				let mapResult = season2Map.getNextSector(fromPos, toPos) || {}

				let nextSector = mapResult.nextSector
				if (nextSector && nextSector != centreFrom) {
					centreTo = nextSector
				}

				let coordsFrom = util.getRoomCoords(fromPos.roomName)
				let coordsTo = util.getRoomCoords(toPos.roomName)
				let centreCoordsFrom = util.getRoomCoords(centreFrom)
				let centreCoordsTo = util.getRoomCoords(centreTo)

				let targetRoomName
				let bestCost = Infinity
				if (Game.map.getRoomLinearDistance(fromPos.roomName, toPos.roomName) < 8 && (centreCoordsFrom.x === null || centreCoordsFrom.y === null)) {					
					if ((coordsFrom.y === -1 || coordsFrom.y === 0) && ((coordsTo.y !== -1 && coordsTo.y !== 0) || (coordsTo.y != coordsFrom.y && ((fromPos.y > 25 && toPos.y < 25) || (fromPos.y < 25 && toPos.y > 25))))) {
						for (let i = 1; i <= 9; i++) {				
							let testRoomName = util.getRoomNameFromCoords({x: util.getCentreRoomXYForRoomName(fromPos.roomName).x - 5 + i, y: coordsFrom.y})
							if (Memory.rooms[testRoomName] && (Memory.rooms[testRoomName].seasonWallsToRemove || []).length == 0) {

								let cost = safeRoute.getSafeRouteCost(fromPos.roomName, testRoomName, false, true, undefined, false, options.ignoreKeepers)
								if (cost < bestCost) {
									targetRoomName = testRoomName
									bestCost = cost
								}
							}
						}
					}
					if ((coordsFrom.x === -1 || coordsFrom.x === 0) && ((coordsTo.x !== -1 && coordsTo.x !== 0) || (coordsTo.x != coordsFrom.x && ((fromPos.x > 25 && toPos.x < 25) || (fromPos.x < 25 && toPos.x > 25))))) {
						for (let i = 1; i <= 9; i++) {				
							let testRoomName = util.getRoomNameFromCoords({x: coordsFrom.x, y: util.getCentreRoomXYForRoomName(fromPos.roomName).y - 5 + i})
							if (Memory.rooms[testRoomName] && (Memory.rooms[testRoomName].seasonWallsToRemove || []).length == 0) {

								let cost = safeRoute.getSafeRouteCost(fromPos.roomName, testRoomName, false, true, undefined, false, options.ignoreKeepers)
								if (cost < bestCost) {
									targetRoomName = testRoomName
									bestCost = cost
								}
							}
						}
					}
				}

				// if (sectorCoordsTo.x != 0 && sectorCoordsTo.y != 0 && sectorCoordsFrom.x != 0 && sectorCoordsFrom.y != 0) {
					if (centreCoordsFrom.x == centreCoordsTo.x && Math.abs(centreCoordsFrom.y - centreCoordsTo.y) <= 11) {
						let step = centreCoordsFrom.y < centreCoordsTo.y ? 5 : -5				
						for (let i = 1; i <= 9; i++) {				
							let testRoomName = util.getRoomNameFromCoords({x: centreCoordsFrom.x - 5 + i, y: centreCoordsFrom.y + step})
							if (Memory.rooms[testRoomName] && (Memory.rooms[testRoomName].seasonWallsToRemove || []).length == 0) {

								let cost = safeRoute.getSafeRouteCost(fromPos.roomName, testRoomName, false, true, undefined, false, options.ignoreKeepers)
								if (cost < bestCost) {
									targetRoomName = testRoomName
									bestCost = cost
								}
							}
						}
						if (Math.abs(centreCoordsFrom.y - centreCoordsTo.y) == 11) {
							step = -step
							for (let i = 1; i <= 9; i++) {
								let testRoomName = util.getRoomNameFromCoords({x: centreCoordsFrom.x - 5 + i, y: centreCoordsTo.y + step})
								if (Memory.rooms[testRoomName] && (Memory.rooms[testRoomName].seasonWallsToRemove || []).length == 0) {

									let cost = safeRoute.getSafeRouteCost(fromPos.roomName, testRoomName, false, true, undefined, false, options.ignoreKeepers)
									if (cost < bestCost) {
										targetRoomName = testRoomName
										bestCost = cost
									}
								}
							}
						}
					}
					else if (centreCoordsFrom.y == centreCoordsTo.y && Math.abs(centreCoordsFrom.x - centreCoordsTo.x) <= 11) {
						let step = centreCoordsFrom.x < centreCoordsTo.x ? 5 : -5
						for (let i = 1; i <= 9; i++) {
							let testRoomName = util.getRoomNameFromCoords({x: centreCoordsFrom.x + step, y: centreCoordsFrom.y - 5 + i})
							if (Memory.rooms[testRoomName] && (Memory.rooms[testRoomName].seasonWallsToRemove || []).length == 0) {
								let cost = safeRoute.getSafeRouteCost(fromPos.roomName, testRoomName, false, true, undefined, false, options.ignoreKeepers)
								if (cost < bestCost) {
									targetRoomName = testRoomName
									bestCost = cost
								}
							}
						}
						if (Math.abs(centreCoordsFrom.x - centreCoordsTo.x) == 11) {
							step = -step
							for (let i = 1; i <= 9; i++) {
								let testRoomName = util.getRoomNameFromCoords({x: centreCoordsTo.x - step, y: centreCoordsFrom.y - 5 + i})
								if (Memory.rooms[testRoomName] && (Memory.rooms[testRoomName].seasonWallsToRemove || []).length == 0) {
									let cost = safeRoute.getSafeRouteCost(fromPos.roomName, testRoomName, false, true, undefined, false, options.ignoreKeepers)
									if (cost < bestCost) {
										targetRoomName = testRoomName
										bestCost = cost
									}
								}
							}
						}

					}

					if (targetRoomName) {
						if (targetRoomName != fromPos.roomName && targetRoomName != toPos.roomName) {
							console.log("Pathing v1 from", fromPos.roomName, "to", toPos.roomName, "via", targetRoomName)
							targetPath = this.runPathFinder(fromPos, new RoomPosition(25, 25, targetRoomName), 20, moveSpeed, options)
							incomplete = targetPath.incomplete
						}
						else if (targetRoomName == fromPos.roomName) {
							let x = 25;
							let y = 25;
							// west is high
							// Moving from west to east
							if (centreCoordsFrom.x > centreCoordsTo.x) {
								x = 40
								console.log("Pathing v2a from", fromPos.roomName, "to", toPos.roomName, "via", targetRoomName)
							}
							else if (centreCoordsFrom.x < centreCoordsTo.x) {
								x = 10
								console.log("Pathing v2b from", fromPos.roomName, "to", toPos.roomName, "via", targetRoomName)
							}
							if (centreCoordsFrom.y > centreCoordsTo.y) {
								y = 40
								console.log("Pathing v2c from", fromPos.roomName, "to", toPos.roomName, "via", targetRoomName)
							}
							else if (centreCoordsFrom.y < centreCoordsTo.y) {
								y = 10
								console.log("Pathing v2d from", fromPos.roomName, "to", toPos.roomName, "via", targetRoomName)
							}


							let safeRouteCost = safeRoute.getSafeRouteCost(fromPos.roomName, targetRoomName, false, true, pathfinderRoomLimit, false, options.ignoreKeepers)

							if (safeRouteCost > 10) {
								options.maxRooms = 64;
							}

							targetPath = this.runPathFinder(fromPos, new RoomPosition(x, y, targetRoomName), 12, moveSpeed, options)
							incomplete = targetPath.incomplete


						}
					}
				// }

				//
				skipFindRoute = true
			}
			else {
				let sectorCoordsFrom = util.getSectorCoords(fromPos.roomName)
				let sectorCoordsTo = util.getSectorCoords(toPos.roomName)

				if (sectorCoordsTo.x == 0 || sectorCoordsTo.y == 0 || sectorCoordsFrom.x == 0 || sectorCoordsFrom.y == 0) {
					skipFindRoute = true
				}
			}
		}


		if (incomplete && fromPos.roomName != toPos.roomName && !skipFindRoute) {
			// Something has gone wrong. Maybe it's because our safeRouteCost is out of date. Delete it just in case.
			if (global.safeRouteCosts) {				
				if (global.safeRouteCosts[fromPos.roomName + toPos.roomName] !== undefined) {
					delete global.safeRouteCosts[fromPos.roomName + toPos.roomName];
				}
				if (global.safeRouteCosts[toPos.roomName + fromPos.roomName] !== undefined) {
					delete global.safeRouteCosts[toPos.roomName + fromPos.roomName];
				}
			}

			if (!usedFindRoute) {
				// Aaa shit, maybe try this?
				var route = safeRoute.findSafeRoute(fromPos.roomName, toPos.roomName, false, options.swampMod, false, undefined, false, options.ignoreKeepers, avoidHostilesInFindRoute)
				// console.log("incomplete path 1", hash, targetPath.ops, route.length)

				if (route && route != ERR_NO_PATH) {
					var routeRoomNames = []
					for (var i = 0; i < route.length; i++) {
						routeRoomNames.push(route[i].room)
					}

					targetPath = this.runPathFinder(fromPos, toPos, targetRange, moveSpeed, options, routeRoomNames)


					// Gah, try avoiding SKs. They seem to cause a lot of issues.
					if (targetPath.incomplete && !options.ignoreKeepers && !options.movementMask) {
						// console.log("incomplete path 2", hash, targetPath.ops, route.length, routeRoomNames)
						route = safeRoute.findSafeRoute(fromPos.roomName, toPos.roomName, false, options.swampMod, false, 30, true)
						if (route != ERR_NO_PATH) {
							routeRoomNames = []
							for (var i = 0; i < route.length; i++) {
								routeRoomNames.push(route[i].room)
							}

							// console.log("incomplete path 2", hash, targetPath.ops, route.length, routeRoomNames)
							targetPath = this.runPathFinder(fromPos, toPos, targetRange, moveSpeed, options, routeRoomNames)
						}
					}


					// Wtf, why is it incomplete. Usually this caused by findSafeRoute giving rooms around the target room, so path half way there.
					if (targetPath.incomplete && route.length > 2) {
						// console.log("incomplete path 3", hash, targetPath.ops, route.length, routeRoomNames, route[Math.floor(route.length / 2)].room)
						targetPath = this.runPathFinder(fromPos, new RoomPosition(25, 25, route[Math.floor(route.length / 2)].room), 20, moveSpeed, options, routeRoomNames)
					}

					/*while (targetPath.incomplete && routeRoomNames.length >= 2) {
						routeRoomNames = routeRoomNames.splice(0, Math.floor(routeRoomNames.length / 2)); // Two rooms. We'll move to the next one then recalculate, I guess
						targetPath = this.runPathFinder(fromPos, new RoomPosition(25, 25, routeRoomNames[routeRoomNames.length - 1]), targetRange, moveSpeed, options, routeRoomNames)
						// console.log("incomplete path2", hash, targetPath.ops, routeRoomNames)
					}*/
				}
			}
		}

		// console.log("miss", targetPath.ops, hash, e-s)
		let serializedPath = this.serializePath(fromPos, targetPath.path, moveSpeed, options.trimPathToRoom || false);

		let pathRooms = []

		if (options.saveRoomNames) {
			for (var step of targetPath.path) {
				if (!pathRooms.includes(step.roomName)) {
					pathRooms.push(step.roomName)
				}
			}
 		}

		if (!incomplete && targetPath.path.length >= 2 && useCache) {
			pathCache[hash] = {p: compressPath(serializedPath), t : Game.time, c: targetPath.cost};

			if (options.saveRoomNames) {
				pathCache[hash].r = pathRooms
			}


			global.lastPathCacheUpdateTick = Game.time;

			// Store to global.
			global.pathCache[segmentID] = pathCache
			Memory.stats.pathCPU = (Memory.stats.pathCPU || 0) + (Game.cpu.getUsed() - cpuStart);
			return {"hit": false, "incomplete": false, "usedFindRoute": usedFindRoute, "path": serializedPath, "r": pathRooms, "cost": targetPath.cost};
		}
		// else if (targetPath.path.length >= 2) { // Not quite sure why this appears to be needed
			Memory.stats.pathCPU = (Memory.stats.pathCPU || 0) + (Game.cpu.getUsed() - cpuStart);
			return {"hit": false, "incomplete": incomplete, "usedFindRoute": usedFindRoute, "path": serializedPath, "r": pathRooms, "cost": targetPath.cost};
		// }
		// else {
		// 	return ""
		// }
	},

	purgePaths : function(mod) {
		if (!global.pathCache) global.pathCache = []

		let pathCache;
		for (var segmentID = 0; segmentID < segementSquareWidth * segementSquareWidth; segmentID++) {
			// If global isn't in date and we've not deserialized this segmentID, do so
			if (global.pathCache[segmentID]) {
				// console.log("global hit")
				pathCache = global.pathCache[segmentID];
			}
			else {
				pathCache = JSON.parse(RawMemory.segments[segmentID] || "{}")
			}

			for (var hash in pathCache) {
				// if (pathCache[hash] && Game.time - pathCache[hash].t >= (aggressive ? 2500 : 5000)) {
				// 	if (pathCache[hash].h && pathCache[hash].h > 0 && Game.time - pathCache[hash].t < (aggressive ? 5000 : 15000)) {
				if (pathCache[hash] && Game.time - pathCache[hash].t >= 5000 / mod) {
					if (pathCache[hash].h && pathCache[hash].h > 0 && Game.time - pathCache[hash].t < 15000 / mod) {

						pathCache[hash].h--;
						if (pathCache[hash].h == 0) {
							delete pathCache[hash].h
						}
					}
					else {
						delete pathCache[hash];
					}
					global.lastPathCacheUpdateTick = Game.time;
				}
			}

			global.pathCache[segmentID] = pathCache;
		}
	},


	purgeCostMatrices : function(mod) {
		for (let key in _.clone(global.costMatrices)) {
			if (Game.time - global.costMatrices[key].t > 4000 / mod) {
				delete global.costMatrices[key]
			}
		}
	},

	finalizeTick : function() {
		if (!global.pathCache) global.pathCache = []

		let pathCache;
		// Any updates to a segmentID get pushed out here.
		let timeMod128 = Game.time % 256

		for (var segmentID = 0; segmentID < segementSquareWidth * segementSquareWidth; segmentID++) {
			if (timeMod128 == segmentID * 20) {
				if (global.pathCache[segmentID] && global.lastPathCacheUpdateTick > Game.time - 256) {
					var segmentString = JSON.stringify(global.pathCache[segmentID])
					if (segmentString.length >= 100000) {
						console.log("Path cache >100kb, clearing!")
						this.purgePaths(2);
						segmentString = JSON.stringify(global.pathCache[segmentID])
					}
					RawMemory.segments[segmentID] = segmentString.length < 100000 ? segmentString : ""
				}
			}
		}
	}
}

module.exports = pathCache;