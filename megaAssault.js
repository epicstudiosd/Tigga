"use strict";

const RoomAssault2x2 = require('roomAssault2x2')

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');
const intelAI = require('intelAI');
const roomIntel = require('roomIntel');
const creepCreator = require('creepCreator');

const customCostMatrix = require('customCostMatrix');
const pathCache = require('pathCache');


const utf15 = require('./utf15');
const Codec = utf15.Codec;


class MegaAssaultMission extends RoomAssault2x2 {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_MEGA_ASSAULT;
		memory.fRefreshRate = memory.fRefreshRate || 80000;

		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		if (!this.isActive()) {
			Memory.rooms[targetRoomName].nxtMegaPoll = Game.time + 100;
		}

		if (createNew && this.isActive()) {
			if (this.memory.targetTiles.length < 8) {
				console.log(memory.type, "activate failed due to not enough target tiles (mega)", memory.targetTiles.length)
				memory.fRefreshRate = 5000;
				this.memory.ID = 0;
				return;
			}
		}
	}

	requestSpawns(restrictBoosts, refresh) {
		// If any other mega assault to the room is struggling from lack of targets, don't launch
		for (let assault of Memory.combatManager.currentMissions[this.memory.type]) {
			if (assault.ID && assault.targetRoomName == this.memory.targetRoomName && assault.targets && assault.formations && assault.spawningCreeps && assault.targets.length < assault.formations.length && assault.spawningCreeps.length == 0) {
				return false;
			}
		}

		return super.requestSpawns(restrictBoosts, refresh)
	}

	getBestTarget(squadHeal, inFormationIdx, otherAssaults, forceChange) {
		let cpu = Game.cpu.getUsed();

		if (Game.time - (this.memory.lastTargetTilesCall || 0) > 30 && Game.time - (Memory.rooms[this.memory.targetRoomName].lastMegaTargetTilesTick || 0) > 10 && Game.cpu.getUsed() < Math.min(Game.cpu.limit, 200)) {
			this.memory.targetTiles = MegaAssaultMission.testRange3Positions(this.memory.targetRoomName, this.memory.mask, this.memory.bestExitDir, false)
			this.memory.lastTargetTilesCall = Game.time;
			Memory.rooms[this.memory.targetRoomName].lastMegaTargetTilesTick = Game.time
			console.log("Mega assault generate tiles")
		}

		otherAssaults = otherAssaults || []

		if (!this.memory.targetTiles || this.memory.targetTiles.length == 0) {
			console.log("Mega assault no target tiles", this.memory.targetTiles)
			Memory.stats.profiler["MegaAssaultTickBestTargetTile" + this.memory.sourceRoomName + "_" + this.memory.targetRoomName] = Game.cpu.getUsed() - cpu;
			return
		}

		let targetTiles = _.clone(this.memory.targetTiles)

		for (let targetTile of this.memory.targetTiles) {
			let pulled = false;
			// Find one not used by others.
			for (let otherFormationIdx in this.memory.formations) {
				if (!forceChange && otherFormationIdx == inFormationIdx) continue
				let formation = this.memory.formations[otherFormationIdx];
				let numCreepsAlive = 0;
				for (let creepName of formation) {
					let creep = Game.creeps[creepName];
					if (creep || this.memory.spawningCreeps.includes(creepName)) {
						numCreepsAlive++
					}
				}

				if (numCreepsAlive == this.memory.squadSize && this.memory.targets[otherFormationIdx]) {
					let otherTarget = this.memory.targets[otherFormationIdx]
					if (Math.abs(otherTarget.x - targetTile.x) <= 1  && Math.abs(otherTarget.y - targetTile.y) <= 1) {
						_.pull(targetTiles, targetTile)
						pulled = true;
						break;
					}
				}			
			}

			if (!pulled) {				
				for (let otherAssault of otherAssaults) {
					for (let otherFormationIdx in otherAssault.formations) {
						let formation = otherAssault.formations[otherFormationIdx];
						let numCreepsAlive = 0;
						for (let creepName of formation) {
							let creep = Game.creeps[creepName];
							if (creep || otherAssault.spawningCreeps.includes(creepName)) {
								numCreepsAlive++
							}
						}
						if (numCreepsAlive == otherAssault.squadSize && otherAssault.targets[otherFormationIdx]) {
							let otherTarget = otherAssault.targets[otherFormationIdx]
							if (Math.abs(otherTarget.x - targetTile.x) <= 1  && Math.abs(otherTarget.y - targetTile.y) <= 1) {
								_.pull(targetTiles, targetTile)
								pulled = true;
								break;
							}
						}			
					}
					if (pulled) {
						break;
					}
				}
			}
		}



		let bestScore = Infinity
		let bestTargetTile
		for (let targetTile of targetTiles) {
			let score = targetTile.score

			for (let formationIdx in this.memory.formations) {
				if (!forceChange && formationIdx == inFormationIdx) continue
				let formation = this.memory.formations[formationIdx];
				let numCreepsAlive = 0;
				for (let creepName of formation) {
					let creep = Game.creeps[creepName];
					if (creep) {
						numCreepsAlive++
					}
				}
				if (numCreepsAlive == this.memory.squadSize) {
					let currentTarget = this.memory.targets[formationIdx]

					if (currentTarget) {
						score -= Math.max(Math.abs(currentTarget.x - targetTile.x), Math.abs(currentTarget.y - targetTile.y));
					}
				}
			}

			for (let otherAssault of otherAssaults) {
				for (let formationIdx in otherAssault.formations) {
					let formation = otherAssault.formations[formationIdx];
					let numCreepsAlive = 0;
					for (let creepName of formation) {
						let creep = Game.creeps[creepName];
						if (creep) {
							numCreepsAlive++
						}
					}
					if (numCreepsAlive == otherAssault.squadSize) {
						let currentTarget = otherAssault.targets[formationIdx]

						if (currentTarget) {
							score -= Math.max(Math.abs(currentTarget.x - targetTile.x), Math.abs(currentTarget.y - targetTile.y));
						}
					}
				}
			}

			if (targetTile.score < bestScore) {
				bestScore = targetTile.score
				bestTargetTile = targetTile
			}
		}

		Memory.stats.profiler["MegaAssaultTickBestTargetTile" + this.memory.sourceRoomName + "_" + this.memory.targetRoomName] = Game.cpu.getUsed() - cpu;

		if (bestTargetTile) {
			return bestTargetTile
		}
		else {
			console.log("Err, no target for mega assault formation?")
		}
	}

	static testRange3Positions(targetRoomName, mask, bestExitDir, noPathTest) {
		let cpu = Game.cpu.getUsed();

		let roomMap = roomIntel.getEnemyRoomMap(targetRoomName);
		if (!roomMap) return;

		let terrain = Game.map.getRoomTerrain(targetRoomName)
		let mem = Memory.rooms[targetRoomName];

		if (!mem.navigationByMask) {
			roomIntel.calcNavigableByMask(targetRoomName, mask, true);
		}

		// Need to be able to path to it. These positions we can't path through due to enemy
		let excludedPathPositions = []

		let maskNavigation = mem.navigationByMask[JSON.stringify(mask)];

		// I don't actually use this code. Oops.
		/*let mapExitVal;
		switch (bestExitDir) {
			case TOP:
				for (let i = 1; i < 49; i++) {
					let v = parseInt(roomMap[i][0])
					if (v >= 4) {
						mapExitVal = v;
						break;
					}
				}
				break
			case RIGHT:
				for (let i = 1; i < 49; i++) {
					let v = parseInt(roomMap[49][i])
					if (v >= 4) {
						mapExitVal = v;
						break;
					}
				}
				break
			case BOTTOM:
				for (let i = 1; i < 49; i++) {
					let v = parseInt(roomMap[i][49])
					if (v >= 4) {
						mapExitVal = v;
						break;
					}
				}
				break
			case LEFT:
				for (let i = 1; i < 49; i++) {
					let v = parseInt(roomMap[0][i])
					if (v >= 4) {
						mapExitVal = v;
						break;
					}
				}
				break
			default:
				console.log("this.memory.bestExitDir not sensible", bestExitDir)
		}

		if (!mapExitVal) {
			throw(new Error("No map exit val??? " + targetRoomName + "_" + bestExitDir))
			return false;
		}*/


		// Want to find all points distance 3 from a rampart
		// Roommap 3 is outer wall
		// We've got the roomMap for the edge we're coming in from calculated above

		// The cost matrix will give the range to the nearest rampart. Actual range, not walking range
		let cm = new customCostMatrix();

		let maxSteps = 4;
		function floodOut(x, y, step) {
			if (x <= 0 || x >= 49 || y <= 0 || y >= 49) return
			// Internal wall
			if (parseInt(roomMap[x][y]) == 0) return
			let current = cm.get2(x, y)

			// Can we shortcut here? 
			if (parseInt(roomMap[x][y]) == 3) {
				return
			}

			if (!current || current > step) {
				cm.set2(x, y, step)
				if (step < maxSteps) {
					floodOut(x+1, y+1, step+1)
					floodOut(x+1, y, step+1)
					floodOut(x+1, y-1, step+1)
					floodOut(x, y+1, step+1)
					floodOut(x, y-1, step+1)
					floodOut(x-1, y+1, step+1)
					floodOut(x-1, y, step+1)
					floodOut(x-1, y-1, step+1)
				}
			}
		}

		// let cpu = Game.cpu.getUsed();

		let outerRamparts = []

		for (let i = 1; i < 49; i++) {
			for (let j = 1; j < 49; j++) {
				if (parseInt(roomMap[i][j]) == 3) {
					excludedPathPositions.push({x: i, y: j, roomName: targetRoomName})
					outerRamparts.push({x: i, y: j})

					floodOut(i+1, j+1, 1)
					floodOut(i+1, j, 1)
					floodOut(i+1, j-1, 1)
					floodOut(i, j+1, 1)
					floodOut(i, j-1, 1)
					floodOut(i-1, j+1, 1)
					floodOut(i-1, j, 1)
					floodOut(i-1, j-1, 1)
				}
			}
		}

		// console.log("floodOut cost", Game.cpu.getUsed() - cpu)

		function doesXYFail(x, y, retreatDir) {
			const depth = 1;
			const codec = new Codec({ depth, array:1 });

			if (parseInt(roomMap[x][y]) < 4) return true

			if (Game.rooms[targetRoomName]) {
				for (let i = 0; i < 2; i++) {
					for (let j = 0; j < 2; j++) {
						if (terrain.get(x + i, y + j) & TERRAIN_MASK_WALL) return true;
						if (terrain.get(x + i, y + j) & TERRAIN_MASK_SWAMP) {
							let hasRoad = false;
							let structs = Game.rooms[targetRoomName].lookForAt(LOOK_STRUCTURES, x + i, y + j);
							for (let struct of structs) {
								if (struct.structureType == STRUCTURE_ROAD) {
									hasRoad = true;
									break;
								}
							}
							if (!hasRoad) {
								return true;
							}
						}
					}
				}
			}
			else {				
				for (let i = 0; i < 2; i++) {
					for (let j = 0; j < 2; j++) {
						if (terrain.get(x + i, y + j) != 0) return true;
					}
				}
			}

			if (codec.decode(maskNavigation[x])[y] != 1) {
				return true;
			}

			switch (retreatDir) {			
				case TOP:
					if (y - 2 <= 0) return true

					if (cm.get2(x+1, y) != 4) return true
					if (cm.get2(x, y+1) != 3) return true
					if (cm.get2(x+1, y+1) != 3) return true



					if (terrain.get(x,	   y - 1) & TERRAIN_MASK_WALL) return true;
					if (terrain.get(x + 1, y - 1) & TERRAIN_MASK_WALL) return true;


					if (codec.decode(maskNavigation[x])[y - 1] != 1) {
						return true;
					}
					return false;
				case TOP_RIGHT:
					if (y - 2 <= 0) return true
					if (x + 2 >= 49) return true

					if (cm.get2(x+1, y) != 4) return true
					if (cm.get2(x, y+1) != 3) return true
					if (cm.get2(x+1, y+1) != 3) return true


					if (terrain.get(x + 1, y - 1) & TERRAIN_MASK_WALL) return true;
					if (terrain.get(x + 2, y - 1) & TERRAIN_MASK_WALL) return true;
					if (terrain.get(x + 1, y - 2) & TERRAIN_MASK_WALL) return true;

					if (codec.decode(maskNavigation[x + 1])[y - 1] != 1) {
						return true;
					}
					return false;
				case RIGHT:
					if (x + 2 >= 49) return true

					if (cm.get2(x, y+1) != 3)  return true
					if (cm.get2(x+1, y) != 4)  return true
					if (cm.get2(x+1, y+1) != 4)  return true

					if (terrain.get(x + 2, y    ) & TERRAIN_MASK_WALL) return true;
					if (terrain.get(x + 2, y + 1) & TERRAIN_MASK_WALL) return true;

					if (codec.decode(maskNavigation[x + 1])[y] != 1) {
						return true;
					}
					return false;
				case BOTTOM_RIGHT:
					if (y + 2 >= 49) return true
					if (x + 2 >= 49) return true

					if (cm.get2(x+1, y) != 3) return true
					if (cm.get2(x, y+1) != 3) return true
					if (cm.get2(x+1, y+1) != 4) return true

					if (terrain.get(x + 1, y + 2) & TERRAIN_MASK_WALL) return true;
					if (terrain.get(x + 2, y + 2) & TERRAIN_MASK_WALL) return true;
					if (terrain.get(x + 2, y + 1) & TERRAIN_MASK_WALL) return true;

					if (codec.decode(maskNavigation[x + 1])[y + 1] != 1) {
						return true;
					}
					return false;
				case BOTTOM:
					if (y + 2 >= 49) return true

					if (cm.get2(x+1, y) != 3)  return true
					if (cm.get2(x, y+1) != 4)  return true
					if (cm.get2(x+1, y+1) != 4)  return true

					if (terrain.get(x,	   y + 2) & TERRAIN_MASK_WALL) return true;
					if (terrain.get(x + 1, y + 2) & TERRAIN_MASK_WALL) return true;

					if (codec.decode(maskNavigation[x])[y + 1] != 1) {
						return true;
					}
					return false;
				case BOTTOM_LEFT:
					if (y + 2 >= 49) return true
					if (x - 2 <= 0) return true

					if (cm.get2(x+1, y) != 3) return true
					if (cm.get2(x, y+1) != 4) return true
					if (cm.get2(x+1, y+1) != 3) return true

					if (terrain.get(x - 1, y + 1) & TERRAIN_MASK_WALL) return true;
					if (terrain.get(x - 1, y + 2) & TERRAIN_MASK_WALL) return true;
					if (terrain.get(x, y + 2) & TERRAIN_MASK_WALL) return true;

					if (codec.decode(maskNavigation[x - 1])[y + 1] != 1) {
						return true;
					}
					return false;
				case LEFT:
					if (x - 2 <= 0) return true

					if (cm.get2(x, y+1) != 4)  return true
					if (cm.get2(x+1, y) != 3)  return true
					if (cm.get2(x+1, y+1) != 3)  return true

					if (terrain.get(x - 1, y    ) & TERRAIN_MASK_WALL) return true;
					if (terrain.get(x - 1, y + 1) & TERRAIN_MASK_WALL) return true;

					if (codec.decode(maskNavigation[x - 1])[y] != 1) {
						return true;
					}
					return false;
				case TOP_LEFT:
					if (y - 2 <= 0) return true
					if (x - 2 <= 0) return true

					if (cm.get2(x+1, y) != 3) return true
					if (cm.get2(x, y+1) != 3) return true
					if (cm.get2(x+1, y+1) != 3) return true

					if (terrain.get(x - 1, y) & TERRAIN_MASK_WALL) return true;
					if (terrain.get(x - 1, y - 1) & TERRAIN_MASK_WALL) return true;
					if (terrain.get(x, y - 1) & TERRAIN_MASK_WALL) return true;

					if (codec.decode(maskNavigation[x - 1])[y - 1] != 1) {
						return true;
					}
					return false;

			}

			return false;
		}


		cpu = Game.cpu.getUsed();

		let candidateTiles = [];

		for (let x = 1; x < 48; x++) {
			for (let y = 1; y < 48; y++) {
				let cost = cm.get2(x, y)

				if (cost && cost <= 3 && !(terrain.get(x, y) & TERRAIN_MASK_WALL)) {
					excludedPathPositions.push({x, y, roomName: targetRoomName})
				}

				if (cost == 3) {
					if (cm.get2(x+1, y) == 4) {
						if (!doesXYFail(x, y, RIGHT)) {
							candidateTiles.push({x, y, retreatDir: RIGHT, reachable: false, unreachable: false})
						}
					}
					if (cm.get2(x+1, y+1) == 4) {
						if (!doesXYFail(x, y, BOTTOM_RIGHT)) {
							candidateTiles.push({x, y, retreatDir: BOTTOM_RIGHT, reachable: false, unreachable: false})
						}
					}
					if (cm.get2(x, y+1) == 4) {
						if (!doesXYFail(x, y, BOTTOM)) {
							candidateTiles.push({x, y, retreatDir: BOTTOM, reachable: false, unreachable: false})
						}
					}	
					if (cm.get2(x-1, y+1) == 4) {
						if (!doesXYFail(x, y, BOTTOM_LEFT)) {
							candidateTiles.push({x, y, retreatDir: BOTTOM_LEFT, reachable: false, unreachable: false})
						}
					}
					if (cm.get2(x-1, y) == 4) {
						if (!doesXYFail(x - 1, y, LEFT)) {
							candidateTiles.push({x: x - 1, y, retreatDir: LEFT, reachable: false, unreachable: false})
						}
					}
					if (cm.get2(x - 1, y - 1) == 4) {
						if (!doesXYFail(x - 1, y - 1, TOP_LEFT)) {
							candidateTiles.push({x: x - 1, y: y - 1, retreatDir: TOP_LEFT, reachable: false, unreachable: false})
						}
					}
					if (cm.get2(x, y-1) == 4) {
						if (!doesXYFail(x, y - 1, TOP)) {
							candidateTiles.push({x, y: y - 1, retreatDir: TOP, reachable: false, unreachable: false})
						}
					}		
					if (cm.get2(x+1, y-1) == 4) {
						if (!doesXYFail(x, y, TOP_RIGHT)) {
							candidateTiles.push({x, y, retreatDir: TOP_RIGHT, reachable: false, unreachable: false})
						}
					}
				}
			}
		}

		// console.log("candidate cost", Game.cpu.getUsed() - cpu)

		let visual = new RoomVisual(targetRoomName)

		for (let tile of candidateTiles) {
			visual.text(tile.retreatDir, tile.x + Math.random() * 0.2 - 0.1, tile.y + Math.random() * 0.2 - 0.1);
		}
		/*for (let pos of excludedPathPositions) {
			let colour = "#ff0000"
			visual.rect(pos.x - 0.5, pos.y - 0.5, 1, 1, {fill: colour, opacity: 0.2})
		}*/

		cpu = Game.cpu.getUsed();

		let lastX
		let lastY

		// There's a few ways of doing this. I've gone for the most conservative.
		// First implementation (not what we have below) allowed reachable by any considering left of each exit.
		// This implementation does reacable by all, considering left and righ of each exit
		if (!noPathTest) {
			for (var i = 0; i < 50; i++) {
				let x;
				let y;

				switch (bestExitDir) {
					case TOP:
						x = i;
						y = 0;
						break;
					case RIGHT:
						x = 49;
						y = i;
						break;
					case BOTTOM:
						x = i;
						y = 49;
						break;
					case LEFT:
						x = 0;
						y = i;
						break;
				}
				if (lastX !== undefined && lastY !== undefined && (terrain.get(x, y) & TERRAIN_MASK_WALL) != (terrain.get(lastX, lastY) & TERRAIN_MASK_WALL)) {
					if (terrain.get(x, y) & TERRAIN_MASK_WALL) {
						x = lastX
						y = lastY
						// 2x2 squad, got can't do last before wall, got to step back another one
						if (x == 0) {
							y--
						}
						if (y == 0) {
							x--
						}
					}
					else {
						lastX = x;
						lastY = y;
					}
				}
				else {
					lastX = x;
					lastY = y;
					continue
				}

				for (let tile of candidateTiles) {
					tile.reachable = false;
				}

				let startPos = new RoomPosition(x, y, targetRoomName)
				for (let tile of candidateTiles) {
					if (tile.reachable || tile.unreachable) continue

					let targetPos = new RoomPosition(tile.x, tile.y, targetRoomName);

					let a =  Game.cpu.getUsed()

					let pathPlan = pathCache.runPathFinder(startPos,
														   targetPos,
														   0,
														   1,
														   {maxRooms: 1, movementMask: [[0,0],[1,0],[0,1],[1,1]], excludedPositions: excludedPathPositions, plainsCost: 1, swampCost: 1})

					// console.log(startPos, targetPos, Game.cpu.getUsed() - a)

					if (pathPlan.incomplete) {
						// console.log(startPos, "can't reach", targetPos)
						tile.unreachable = true;
						function connectTileChain(startTile) {
							for (let otherTile of candidateTiles) {
								if (otherTile.unreachable) continue
								if (startTile.x + 1 == otherTile.x && startTile.y == otherTile.y) {
									otherTile.unreachable = true;
									connectTileChain(otherTile)
								}
								else if (startTile.x - 1 == otherTile.x && startTile.y == otherTile.y) {
									otherTile.unreachable = true;
									connectTileChain(otherTile)
								}
								else if (startTile.x == otherTile.x && startTile.y + 1 == otherTile.y) {
									otherTile.unreachable = true;
									connectTileChain(otherTile)
								}
								else if (startTile.x == otherTile.x && startTile.y - 1 == otherTile.y) {
									otherTile.unreachable = true;
									connectTileChain(otherTile)
								}
							}
						}
						connectTileChain(tile)
					}
					else {
						tile.reachable = true;
						function connectTileChain(startTile) {
							for (let otherTile of candidateTiles) {
								if (otherTile.reachable) continue
								if (startTile.x + 1 == otherTile.x && startTile.y == otherTile.y) {
									otherTile.reachable = true;
									connectTileChain(otherTile)
								}
								else if (startTile.x - 1 == otherTile.x && startTile.y == otherTile.y) {
									otherTile.reachable = true;
									connectTileChain(otherTile)
								}
								else if (startTile.x == otherTile.x && startTile.y + 1 == otherTile.y) {
									otherTile.reachable = true;
									connectTileChain(otherTile)
								}
								else if (startTile.x == otherTile.x && startTile.y - 1 == otherTile.y) {
									otherTile.reachable = true;
									connectTileChain(otherTile)
								}
							}
						}
						connectTileChain(tile)
					}
				}

				switch (bestExitDir) {
					case TOP:
						lastX = i;
						lastY = 0;
						break;
					case RIGHT:
						lastX = 49;
						lastY = i;
						break;
					case BOTTOM:
						lastX = i;
						lastY = 49;
						break;
					case LEFT:
						lastX = 0;
						lastY = i;
						break;
				}


			}
		}


		let finalTiles = [];

		// console.log("path cost", Game.cpu.getUsed() - cpu)

		for (let tile of candidateTiles) {
			let colour

			if (tile.unreachable) {
				colour = "#ff0000"
			}
			else {
				colour = "#00ff00"
			}
			visual.circle(tile.x, tile.y, {fill: colour, opacity: 0.4})

			if (!tile.unreachable) {
				let score = 0;
				for (let dx = 0; dx < 2; dx++) {
					for (let dy = 0; dy < 2; dy++) {
						let x = tile.x + dx;
						let y = tile.y + dy;

						for (let spawnIdx in mem.spwnX) {
							score += Math.max(Math.abs(mem.spwnX[spawnIdx] - x), Math.abs(mem.spwnY[spawnIdx] - y))
						}
						for (let towerIdx in mem.twrX) {
							score += Math.max(Math.abs(mem.twrX[towerIdx] - x), Math.abs(mem.twrY[towerIdx] - y))
						}

						for (let outerRampart of outerRamparts) {
							if (Math.max(Math.abs(outerRampart.x - x), Math.abs(outerRampart.y - y)) <= 3) {
								score += 10;
							}
						}

						if (mem.invCL) {
							score += Math.max(Math.abs(mem.invCX - x), Math.abs(mem.invCY - y))	
						}
					}
				}

				let advX1 = -1
				let advY1 = -1
				let advX2 = -1
				let advY2 = -1
				for (let k = 1; k <= 2; k++) {
					let advX		
					let advY		
					let canAdvance = true;
					switch (tile.retreatDir) {
						case TOP:
							advX = tile.x;
							advY = tile.y + k;
							break;
						case TOP_RIGHT:
							advX = tile.x - k;
							advY = tile.y + k;
							break;
						case RIGHT:
							advX = tile.x - k;
							advY = tile.y;
							break;
						case BOTTOM_RIGHT:
							advX = tile.x - k;
							advY = tile.y - k;
							break;
						case BOTTOM:
							advX = tile.x;
							advY = tile.y - k;
							break;
						case BOTTOM_LEFT:
							advX = tile.x + k;
							advY = tile.y - k;
							break;
						case LEFT:
							advX = tile.x + k;
							advY = tile.y;
							break;
						case TOP_LEFT:
							advX = tile.x + k;
							advY = tile.y + k;
							break;
					}
					// Allow advance into swamps (trust the formation not to!)
					for (let dx = 0; dx < 2; dx++) {
						for (let dy = 0; dy < 2; dy++) {
							let x = advX + dx;
							let y = advY + dy;

							if (terrain.get(x, y) & TERRAIN_MASK_WALL) {
								canAdvance = false;
								break;
							}
						}
					}

					if (k == 1) {
						if (canAdvance) {							
							advX1 = advX;
							advY1 = advY;

							score -= 4
						}
						else {
							break;
						}
					}
					else if (canAdvance) {
						advX2 = advX;
						advY2 = advY;

						score -= 2
					}
				}

				finalTiles.push({x: tile.x, y: tile.y, retreatDir: tile.retreatDir, 
								 advX1: advX1, advY1: advY1, advX2: advX2, advY2: advY2, score: score})

			}
		}

		mem.numMegaTargetTiles = finalTiles.length
		Memory.stats.profiler["MegaAssaultTestRange3Positions" + targetRoomName + "_" + bestExitDir + "_" + noPathTest] = Game.cpu.getUsed() - cpu;

		return finalTiles
	}


	tick() {
		let otherAssaults = []
		for (let otherAssault of Memory.combatManager.currentMissions[this.memory.type]) {
			if (otherAssault.ID && otherAssault.ID != this.memory.ID && otherAssault.targetRoomName == this.memory.targetRoomName) {
				otherAssaults.push(otherAssault)
			}
		}


		super.tick();

		let cpu = Game.cpu.getUsed();


		if (this.isActive()) {
			let targetRoomName = this.memory.targetRoomName;

			let targetMem = Memory.rooms[targetRoomName];
			let room = Game.rooms[targetRoomName]

			for (let formationIdx in this.memory.formations) {
				let formation = this.memory.formations[formationIdx];
				let numCreepsAlive = 0;
				let lastIncomplete = 0;
				for (let creepName of formation) {
					let creep = Game.creeps[creepName];
					if (creep) {
						creep.mem.mega = 1
						numCreepsAlive++
						lastIncomplete = Math.max(lastIncomplete, creep.mem.pIncompleteTick || 0)
					}
				}
				if (numCreepsAlive == this.memory.squadSize) {
					let currentTarget = this.memory.targets[formationIdx]

					// Struggling to path. Get a new target.
					if (Game.time - lastIncomplete <= 1) {
						console.log("Changing target due to pathing issues", JSON.stringify(currentTarget), formation)
						currentTarget = this.getBestTarget(this.memory.squadHeal, formationIdx, otherAssaults, true)
						console.log(JSON.stringify(currentTarget))
					}
					if (!currentTarget) {
						currentTarget = this.getBestTarget(this.memory.squadHeal, formationIdx, otherAssaults, false)
					}

					// Check for stuff to kill
					if (currentTarget && room) {
						let inPos = false;
						let anyDamage = false;
						let zeroCreep = Game.creeps[Game.creeps[formation[0]].mem.formationCreeps[0]]
							
						if (zeroCreep.pos.x == currentTarget.x && zeroCreep.pos.y == currentTarget.y && zeroCreep.room.name == targetRoomName) {
							inPos = true;							
						}
						if (inPos) {
							for (let creepName of formation) {
								let creep = Game.creeps[creepName];
								let stuffToHurt = creep.pos.findInRange(FIND_STRUCTURES, 3);
								for (let struct of stuffToHurt) {
									if (struct.structureType != STRUCTURE_ROAD && 
										struct.structureType != STRUCTURE_CONTAINER && 
										struct.structureType != STRUCTURE_CONTROLLER && 
										struct.structureType != STRUCTURE_KEEPER_LAIR) {
										anyDamage = true;
										break;
									}
								}
								if (anyDamage) break;
							}
							if (!anyDamage) {
								currentTarget = this.getBestTarget(this.memory.squadHeal, formationIdx, otherAssaults, false)
								this.memory.targets[formationIdx] = currentTarget
							}
						}
					}

					if (currentTarget) {
						this.memory.targets[formationIdx] = currentTarget;
						for (let creepName of formation) {
							Memory.creeps[creepName].targetPos = currentTarget;
						}
					}
				}
			}
		}
		Memory.stats.profiler["MegaAssaultTick1" + this.memory.sourceRoomName + "_" + this.memory.targetRoomName] = Game.cpu.getUsed() - cpu;
	}


	cleanMemory() {
		delete this.memory.targetTiles
		delete this.memory.lastTargetTilesCall
		delete this.memory.lootersSpawned
		delete this.memory.otherAssaultCount


		return super.cleanMemory();
	}


	missionComplete(success) {
		this.cleanMemory()

		return super.missionComplete(success);
	}

}


module.exports = MegaAssaultMission