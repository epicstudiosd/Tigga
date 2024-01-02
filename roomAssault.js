"use strict";

const FormationAssaultMission = require('formationAssault')
const HeavyControllerAttackMission = require('heavyControllerAttack')
const RoomAssaultPowerSupport = require('roomAssaultPowerSupport')
const RoomHeavyCreepClear = require('roomHeavyCreepClear')
const WeakRoomAttack = require("weakRoomAttack")

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');
const intelAI = require('intelAI');
const roomIntel = require('roomIntel');
const creepCreator = require('creepCreator');

const utf15 = require('./utf15');
const Codec = utf15.Codec;


class RoomAssaultMission extends FormationAssaultMission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_ROOM_ASSAULT;
		super(memory, sourceRoomName, targetRoomName, createNew, priority);


		if (createNew && this.isActive()) {
			if (memory.type == MISSION_MEGA_ASSAULT && Game.time < (Memory.rooms[targetRoomName].nxtMegaPoll || 0)) {
				this.ID = 0
				return
			}

			memory.targetRoomName = memory.targetRoomName || targetRoomName;

			memory.externalTowers = 0;
			memory.externalSpawns = 0;
			memory.externalTowers2 = 0;
			memory.externalSpawns2 = 0;
			memory.fRefreshRate = memory.fRefreshRate || 20000;

			let tmem = Memory.rooms[targetRoomName]

			if (this.memory.type != MISSION_FORMATION_REMOTE_DECON && 
				this.memory.type != MISSION_ROOM_HEAVY_FORMATION_HOLD) {
			  	for (var towerIdx in tmem.twrX) {
					if (tmem.twrExtern[towerIdx] || !tmem.twrInside[towerIdx]) {
						memory.externalTowers = 1;
						memory.externalTowers2 = memory.externalTowers2 || !tmem.twrInside[towerIdx]
						break;
					}
				}

			  	for (var spawnIdx in tmem.spwnX) {
					if (tmem.spwnExtern[spawnIdx] || !tmem.spwnInside[spawnIdx]) {
						memory.externalSpawns = 1;
						memory.externalSpawns2 = memory.externalSpawns2 || !tmem.spwnInside[spawnIdx]						
						break;
					}
				}
			}


			// Lets be sure.
			delete this.memory.targets;
			delete this.memory.target;
			delete this.memory.bestSetupRoom;
			delete this.memory.setupPos;


			var exits = Game.map.describeExits(this.memory.targetRoomName);
			let exculdedExits = [];

			let anyBlockedExits = 0;

			function resetNavigation() {
	 			// Well this ain't cheap.
	 			let activeMissions = false
				for (let type of ASSAULT_MISSION_TYPES) {
					for (var mission of Memory.combatManager.currentMissions[type]) {
						if (mission.targetRoomName == targetRoomName && mission.ID && mission.ID != memory.ID) {
							activeMissions = mission;
							break;
						}
					}
					if (activeMissions) break
				}

				// Clear the navigation data. This will force it to try a new entrance
				if (!activeMissions) {
					console.log("Clearing blocked entrances")
					delete Memory.rooms[targetRoomName].blockedEntrances[JSON.stringify(memory.mask)]
				}
				else {
					console.log("Can't clear blocked entrances - activeMissions", JSON.stringify(activeMissions))
				}
			}

		 	var bestSetupRoom;
		 	var bestExitDir;
			var bestScore;
			while (exculdedExits.length < Object.keys(exits).length)  {
				bestSetupRoom = undefined;
				bestExitDir = undefined;
				bestScore = Infinity
				for (var exitDir in exits) {

					var exitRoom = exits[exitDir];
					if (exculdedExits.indexOf(exitRoom) != -1) continue;

					if (!Memory.rooms[exitRoom]) {
						exculdedExits.push(exitRoom);
						if (Memory.debugRoomAssault) {
							console.log("No mem", exitRoom)
						}
						continue;
					}

					if (tmem.blockedEntrances && tmem.blockedEntrances[JSON.stringify(this.memory.mask)] &&
						tmem.blockedEntrances[JSON.stringify(this.memory.mask)][exitDir]) {
						exculdedExits.push(exitRoom);
						anyBlockedExits = 1;
						if (Memory.debugRoomAssault) {
							console.log("blockedEntrances", exitRoom)
						}

						continue;
					}


					// if (!roomAI.isTerrainNavigableByMask(exitRoom, [[0,0],[0,1],[1,0],[1,1]])) {
					// 	continue;
					// }
					if (Memory.rooms[exitRoom].owner && Memory.rooms[exitRoom].owner != util.getMyName() && (Memory.rooms[exitRoom].safeMode || (Memory.rooms[exitRoom].twrX && Memory.rooms[exitRoom].twrX.length > 0))) {
						// if (!Memory.swc) {
							exculdedExits.push(exitRoom);
							if (Memory.debugRoomAssault) {
								console.log("onwer", exitRoom)
							}
							continue;
						// }
						// else {						
						// 	console.log("Emergency override in roomAssault to allow owned attack rooms")
						// }
					}

					if (Memory.rooms[exitRoom].fullyConnected === 0) {
						exculdedExits.push(exitRoom);
						if (Memory.debugRoomAssault) {
							console.log("fullyConnected", exitRoom)
						}
						continue;
					}

					let score = 0;

					if (exitDir == LEFT && tmem.eWallsL) {
						score += 2;
						if (this.memory.squadSize == 9) {
							exculdedExits.push(exitRoom);
							continue;
						}
					}
					else if (exitDir == RIGHT && tmem.eWallsR) {
						score += 2;
						if (this.memory.squadSize == 9) {
							exculdedExits.push(exitRoom);
							continue;
						}
					}
					else if (exitDir == BOTTOM && tmem.eWallsB) {
						score += 2;
						if (this.memory.squadSize == 9) {
							exculdedExits.push(exitRoom);
							continue;
						}
					}
					else if (exitDir == TOP && tmem.eWallsT) {
						score += 2;
						if (this.memory.squadSize == 9) {
							exculdedExits.push(exitRoom);
							continue;
						}
					}

					if (!missionInfo.canLaunchNewAssault(this.memory.targetRoomName, exitRoom)) {
						if (Memory.debugRoomAssault) {
							console.log("canLaunchNewAssault", exitRoom)
						}

						exculdedExits.push(exitRoom);
						continue;
					}

					let edgeIdx = Math.round((parseInt(exitDir) - 1) / 2)

					// Go for edges with low walls (<1, smaller is better)
					if (tmem.lowestOuterWallByEdge) {
						score += 3 * tmem.lowestOuterWallByEdge[edgeIdx] / (_.max(tmem.lowestOuterWallByEdge) + 1)
					}
					// Go for edges with low tower damage (<1, smaller is better)
					if (tmem.maxTowerDamageAtOuterWallByEdge) {
						score += 2 * tmem.maxTowerDamageAtOuterWallByEdge[edgeIdx] / (_.max(tmem.maxTowerDamageAtOuterWallByEdge) + 1)
					}
					// Go for edges with exposed controllers
					if (tmem.controllerExposedToEdge) {
						score -= 1 * tmem.controllerExposedToEdge[edgeIdx]
					}
					// Go for edges with lots of walls (<1, higher is better)
					if (tmem.boundaryWallCountByEdge) {
						score -= tmem.boundaryWallCountByEdge[edgeIdx] / (_.max(tmem.boundaryWallCountByEdge) + 1)
					}

					// Quick swamp analysis. Um. This is pretty specific...
					let terrain = Game.map.getRoomTerrain(exitRoom)

					let exitTiles = 0;
					let plainTiles = 0;
					for (let i = 1; i < 49; i++) {
						switch (exitDir) {
							case (LEFT):
								if (!(roomTerrain.get(0, i) & TERRAIN_MASK_WALL)) {
									exitTiles++;
									plainTiles += (roomTerrain.get(1, i) == 0) ? 1 : 0;
								}
								break;
							case (TOP):
								if (!(roomTerrain.get(i, 0) & TERRAIN_MASK_WALL)) {
									exitTiles++;
									plainTiles += (roomTerrain.get(i, 1) == 0) ? 1 : 0;
								}
								break;
							case (RIGHT):
								if (!(roomTerrain.get(49, i) & TERRAIN_MASK_WALL)) {
									exitTiles++;
									plainTiles += (roomTerrain.get(48, i) == 0) ? 1 : 0;
								}
								break;
							case (BOTTOM):
								if (!(roomTerrain.get(i, 49) & TERRAIN_MASK_WALL)) {
									exitTiles++;
									plainTiles += (roomTerrain.get(i, 48) == 0) ? 1 : 0;
								}
								break;
						}

						if (exitTiles - plainTiles >= 2) {
							break;
						}
					}

					if (exitTiles - plainTiles < 2) {
						score += 2;
					}


					score += 2 * roomIntel.getRealSwampRatio(exitRoom)


					var pathCost = safeRoute.getSafeRouteCost(this.memory.sourceRoomName, exitRoom, true, false, undefined, false, true);

					if (pathCost > 15) {
						exculdedExits.push(exitRoom);
						continue;
					}

					score += pathCost + Math.random() * 3;


					if (this.memory.type != MISSION_FORMATION_REMOTE_DECON &&
						this.memory.type != MISSION_ROOM_HEAVY_FORMATION_HOLD &&
						tmem.twrX) {
						for (let towerIdx = 0; towerIdx < tmem.twrX.length; towerIdx++) {
							let x = tmem.twrX[towerIdx];
							let y = tmem.twrY[towerIdx];

							if (exitDir == LEFT && x <= 7) {
								score++;
							}
							else if (exitDir == RIGHT && x >= 43) {
								score++;
							}
							else if (exitDir == TOP && y <= 7) {
								score++;
							}
							else if (exitDir == BOTTOM && y >= 43) {
								score++;
							}
						}
					}

					if (score < bestScore) {
						bestScore = score;
						bestSetupRoom = exitRoom;
						bestExitDir = parseInt(exitDir);
					}
				}

				if (!bestSetupRoom) {
	 				// if (Math.random() < 0.01 || this.memory.type == MISSION_STRONGHOLD_MEGA_ASSAULT) c
	 				console.log("No setup room for", memory.type, sourceRoomName, targetRoomName, JSON.stringify(exculdedExits), bestScore, bestExitDir)

	 				// That's annoying. Nuke it.
	 				Memory.combatManager.requestedNukes = Memory.combatManager.requestedNukes || {}
	 				Memory.combatManager.requestedNukes[targetRoomName] = Game.time

					this.ID = 0;
					return;
				}

				this.memory.bestExitDir = bestExitDir;
				this.memory.bestSetupRoom = bestSetupRoom;

		 		var bestTarget = this.getBestTarget();

				if (!bestTarget) {
					console.log("Invalid target pos (!bestTarget) as setup pos for", memory.type, sourceRoomName, targetRoomName, bestExitDir, JSON.stringify(bestTarget), bestSetupRoom)

					exculdedExits.push(bestSetupRoom);
					continue;
				}

				this.memory.target = bestTarget;

				// Find a setup location
				var setupExitDir = ((bestExitDir - 1 + 4)) % 8 + 1;

				var setupPos = this.getSetupPos(setupExitDir, bestTarget, bestSetupRoom);

				if (!setupPos) {
					console.log("Room invalid as setup pos for", memory.type, sourceRoomName, targetRoomName, setupExitDir, JSON.stringify(bestTarget), bestSetupRoom)

					exculdedExits.push(bestSetupRoom);
					continue;
				}
				else {
					this.memory.setupPos = setupPos;
					break;
				}
			}

			if (!bestTarget) {
 				console.log("No target for room assault", memory.type, sourceRoomName, targetRoomName, setupExitDir, JSON.stringify(this.memory.target))

				if (anyBlockedExits) {
					resetNavigation();
				}

				this.ID = 0;
				return;
			}
			// if (!this.memory.target) {
 		// 		console.log("No target for room assault", memory.type, sourceRoomName, targetRoomName, setupExitDir, JSON.stringify(this.memory.target))

			// 	this.ID = 0;
			// 	return;
			// }
			if (!this.memory.bestSetupRoom) {
 				console.log("No setup room for room assault", memory.type, sourceRoomName, targetRoomName, setupExitDir, JSON.stringify(this.memory.target))

				if (anyBlockedExits) {
					resetNavigation();
				}

				this.ID = 0;
				return;
			}
			if (!this.memory.setupPos) {
 				console.log("No setup pos for room assault", memory.type, sourceRoomName, targetRoomName, setupExitDir, this.memory.bestSetupRoom)

				if (anyBlockedExits) {
					resetNavigation();
				}

				this.ID = 0;
				return;
			}

			delete this.memory.startWallHP
			delete this.memory.startRampHP

			if (this.selectCloseCombat()) {
 				console.log("selectCloseCombat failed for room assault", memory.type, sourceRoomName, targetRoomName, setupExitDir, this.memory.bestSetupRoom)

				this.ID = 0;
				return;
			}

			/*if (memory.externalTowers || memory.externalSpawns) {
				// Co-opt a whole bunch of idle creeps. Lets tear this thing down.
				for (var idleCreep of _.clone(Memory.combatManager.idlePool)) {
					if (Game.creeps[idleCreep] && Game.creeps[idleCreep].ticksToLive > 500) {
						if (!idleCreepManager.canPullIdleCreep(Game.creeps[idleCreep], sourceRoomName)) {
							continue;
						}

						var pathCost = safeRoute.getSafeRouteCost(Game.creeps[idleCreep].room.name, this.memory.targetRoomName);

						if (pathCost > 10) continue;

						this.assignCreep(Game.creeps[idleCreep]);
						_.pull(Memory.combatManager.idlePool, idleCreep)
					}
				}
			}
			else {
				// Grab those that can work on their own.
				for (var idleCreep of _.clone(Memory.combatManager.idlePool)) {
					if (Game.creeps[idleCreep] && Game.creeps[idleCreep].ticksToLive > 500) {
						if (Game.creeps[idleCreep].hasActiveBodypart(HEAL) && Game.creeps[idleCreep].hasActiveBodypart(RANGED_ATTACK)) {
							if (!idleCreepManager.canPullIdleCreep(Game.creeps[idleCreep], sourceRoomName)) {
								continue;
							}

							var pathCost = safeRoute.getSafeRouteCost(Game.creeps[idleCreep].room.name, this.memory.targetRoomName);

							if (pathCost > 10) continue;

							this.assignCreep(Game.creeps[idleCreep]);
							_.pull(Memory.combatManager.idlePool, idleCreep)
						}
					}
				}
			}*/
		}
	}

	getBestTarget(squadHeal, formationIdx) {
		if (Game.time - (this.memory.bestTargetFailTick || 0) < 10) {
			console.log("New target, recently failed", Game.time - (this.memory.bestTargetFailTick || 0))
			return undefined
		}

		squadHeal = squadHeal || 0


		// Base heuristic on distance and expected damage. Path finding will find a reasonable way through the walls.
		// Returns an object with x and y properties.
		var bestScore = Infinity;
		var bestTarget;

		let targetRoomName = this.memory.targetRoomName
		let rm = Memory.rooms[targetRoomName]

		// Clearly out squad heal ain't enough
		if ((rm.withdrawTick || 0) < 100) {
			squadHeal /= 2;
		}

		if (!rm.navigationByMask) {
			roomIntel.calcNavigableByMask(targetRoomName, this.memory.mask, true);
		}

		let mask = JSON.stringify(this.memory.mask);
		let maskNavigation = rm.navigationByMask[mask];

		function doesXYFail(x, y, squadSize) {
			const depth = 1;
			const codec = new Codec({ depth, array:1 });

			if (squadSize == 4) {
				if ((x >= 2 && codec.decode(maskNavigation[x - 2])[y] != 1) &&
					(x >= 2 && codec.decode(maskNavigation[x - 2])[y - 1] != 1) &&
					(y >= 2 && codec.decode(maskNavigation[x - 1])[y - 2] != 1) &&
					(y >= 2 && codec.decode(maskNavigation[x])[y - 2] != 1) &&
					codec.decode(maskNavigation[x + 1])[y - 1] != 1 &&
					codec.decode(maskNavigation[x + 1])[y] != 1 &&
					codec.decode(maskNavigation[x])[y + 1] != 1 &&
					codec.decode(maskNavigation[x - 1])[y + 1] != 1
					) {
					return true;
				}
			}
			else if (squadSize == 9) {
				if ((x >= 3 && codec.decode(maskNavigation[x - 3])[y - 1] != 1) &&
					codec.decode(maskNavigation[x + 1])[y - 1] != 1 &&
					(y >= 3 && codec.decode(maskNavigation[x - 1])[y - 3] != 1) &&
					codec.decode(maskNavigation[x - 1])[y + 1] != 1
					) {
					return true;
				}
			}
			return false;
		}

		let targetPositions = [];
		let backupPositions = []
		if (Game.rooms[targetRoomName]) {
			var room = Game.rooms[targetRoomName];

			// First target is a soft terminal
			if (room.terminal && room.memory.killTerminal && !room.memory.terminalInsideWalls && !room.memory.terminalOnExternalRampart) {
				let fail = false;

				if (Game.shard.name != "AppleCrumble") {
					fail = doesXYFail(room.terminal.pos.x, room.terminal.pos.y, this.memory.squadSize)
				}
				else {
					if (maskNavigation[room.terminal.pos.x][room.terminal.pos.y] != 1) {
						fail = true;
					}
				}
				if (!fail) {
					targetPositions.push({"x": room.terminal.pos.x, "y": room.terminal.pos.y})
				}
			}

			// Then towers. If we've died recently skip
			if (targetPositions.length == 0 && (Math.random() < 0.5 || Game.time - (room.memory.lastFormationKilled || 0) >= 500)) {
				let avgRampart = 0;
				let idx = 0;
				if (this.memory.externalTowers) {
					for (var tower of room.towers) {
						avgRampart += rm.twrR[idx] || 0
						idx++;
					}
				}

				avgRampart /= room.towers.length

				idx = 0;
				for (var tower of room.towers) {
					if (Game.shard.name != "AppleCrumble") {
						// console.log(tower.pos, this.memory.squadSize, doesXYFail(tower.pos.x, tower.pos.y, this.memory.squadSize))
						if (doesXYFail(tower.pos.x, tower.pos.y, this.memory.squadSize)) {
							continue;
						}
					}
					else {
						if (maskNavigation[tower.pos.x][tower.pos.y] != 1) {
							continue;
						}
					}

					let extraScore = 0;
					extraScore += rm.twrExtern[idx] ? -20 * rm.twrX.length : 0;
					extraScore += !rm.twrInside[idx] ? -100 * rm.twrX.length : 0;

					if (rm.twrExtern[idx]) {
						extraScore -= 200 * (1 - (rm.twrR[idx] || 0) / avgRampart)
					}

					targetPositions.push({x: tower.pos.x, y: tower.pos.y, extraScore: extraScore})

					idx++;
				}
			}

			// console.log(JSON.stringify(targetPositions))

			// Then spawns
			if (targetPositions.length == 0) {
				var spawns = room.find(FIND_HOSTILE_SPAWNS);
				let avgRampart = 0;
				let idx = 0;
				if (this.memory.externalSpawns) {					
					for (var tower of spawns) {
						avgRampart += rm.spwnR[idx] || 0
						idx++;
					}
				}

				avgRampart /= spawns.length

				idx = 0;
				for (var spawn of spawns) {
					if (Game.shard.name != "AppleCrumble") {
						if (doesXYFail(spawn.pos.x, spawn.pos.y, this.memory.squadSize)) {
							continue;
						}
					}
					else {
						if (maskNavigation[spawn.pos.x][spawn.pos.y] != 1) {
							continue;
						}
					}

					let extraScore = 0;
					extraScore += rm.spwnExtern[idx] ? -20 * rm.spwnX.length : 0;
					extraScore += !rm.spwnInside[idx] ? -100 * rm.spwnX.length : 0;

					if (rm.spwnExtern[idx]) {
						extraScore -= 200 * (1 - (rm.spwnR[idx] || 0) / avgRampart)
					}

					targetPositions.push({x: spawn.pos.x, y: spawn.pos.y, extraScore: extraScore})
				}
			}

			let onlyController = targetPositions.length == 0

			// Controller protection
			if (rm.rcl >= 7 && ((this.memory.routeLength * 50 < CREEP_CLAIM_LIFE_TIME * 0.75) || !rm.powerEnabled)) {
				let exits = Game.map.describeExits(targetRoomName);
				for (let exitDir in exits) {
					if (exits[exitDir] == this.memory.bestSetupRoom) {
						let idx = Math.round((parseInt(exitDir) - 1) / 2);

						// Hit any building next to the controll if this is the case.
						if (((this.memory.routeLength * 50 < CREEP_CLAIM_LIFE_TIME * 0.75) && rm.controllerExposedToEdge[idx]) || (rm.controllerNearlyExposedToEdge[idx] && !rm.controllerExposedToEdge[idx])) {
							let avgDefenseHits = (rm.wallHP + rm.rampHP) / (rm.numWalls + rm.numRamps + 1e-6)


							var hostileStructures = room.controller.pos.findInRange(FIND_STRUCTURES, 1, {
								filter: function(object) {
									return object.structureType != STRUCTURE_CONTROLLER && object.structureType != STRUCTURE_CONTAINER && object.structureType != STRUCTURE_ROAD;
								}
							});

							for (var structure of hostileStructures) {
								if (Game.shard.name != "AppleCrumble") {
									if (doesXYFail(structure.pos.x, structure.pos.y, this.memory.squadSize)) {
										continue;
									}
								}
								else {
									if (maskNavigation[structure.pos.x][structure.pos.y] != 1) {
										continue;
									}
								}
								// Bias against this. If it's far from towers it'll be biased back toward.
								// Idea is we don't want to go after controller if we can pop towers/spawns.
								let extraScore = ((rm.controllerExposedToEdge[idx] ? 200 : 100) + 100 * ((structure.hits / avgDefenseHits) - 1) + (8 - room.controller.level) * 100) * rm.twrX.length;

								// Try not to mob the controller.


								targetPositions.push({x: structure.pos.x, y: structure.pos.y, extraScore: extraScore, controllerTarget: 1})
							}
						}
					}
				}
			}


			// If we've still got nothing, add everything else
			if (targetPositions.length == 0 || onlyController) {
				var hostileStructures = room.find2(FIND_HOSTILE_STRUCTURES, {
					filter: function(object) {
						return object.structureType != STRUCTURE_RAMPART &&
							   object.structureType != STRUCTURE_CONTROLLER &&
							   (object.structureType != STRUCTURE_STORAGE || room.memory.killStorage) &&
							   (object.structureType != STRUCTURE_TERMINAL || room.memory.killTerminal) &&
							   object.structureType != STRUCTURE_KEEPER_LAIR;
					}
				});
				for (var structure of hostileStructures) {
					if (Game.shard.name != "AppleCrumble") {
						if (doesXYFail(structure.pos.x, structure.pos.y, this.memory.squadSize)) {
							continue;
						}
					}
					else {
						if (maskNavigation[structure.pos.x][structure.pos.y] != 1) {
							continue;
						}
					}

					if (onlyController) {
						backupPositions.push({"x": structure.pos.x, "y": structure.pos.y})
					}
					else {
						targetPositions.push({"x": structure.pos.x, "y": structure.pos.y})
					}
				}
			}
		}
		// Same with no visibility
		else {
			// First target is a soft terminal
			if (rm.trmX && rm.trmY && rm.killTerminal && !rm.terminalInsideWalls && !rm.terminalOnExternalRampart) {
				let fail = false;

				if (Game.shard.name != "AppleCrumble") {
					fail = doesXYFail(rm.trmX, rm.trmY, this.memory.squadSize);
				}
				else {
					if (maskNavigation[rm.trmX][rm.trmY] != 1) {
						fail = true;
					}
				}
				if (!fail) {
					targetPositions.push({"x": rm.trmX, "y": rm.trmY})
				}
			}

			// Then towers
			if (targetPositions.length == 0 && (Math.random() < 0.5 || Game.time - (rm.lastFormationKilled || 0) >= 500) && rm.twrX) {
				for (let towerIdx = 0; towerIdx < rm.twrX.length; towerIdx++) {
					let x = rm.twrX[towerIdx];
					let y = rm.twrY[towerIdx];

					if (Game.shard.name != "AppleCrumble") {
						if (doesXYFail(x, y, this.memory.squadSize)) continue;
					}
					else {
						if (maskNavigation[x][y] != 1) {
							continue;
						}
					}

					targetPositions.push({"x": x, "y": y})
				}
			}

			// Then spawns
			if (targetPositions.length == 0 && rm.spwnX) {
				for (let spawnIdx = 0; spawnIdx < rm.spwnX.length; spawnIdx++) {
					let x = rm.spwnX[spawnIdx];
					let y = rm.spwnY[spawnIdx];

					if (Game.shard.name != "AppleCrumble") {
						if (doesXYFail(x, y, this.memory.squadSize)) continue;

					}
					else {
						if (maskNavigation[x][y] != 1) {
							continue;
						}
					}

					targetPositions.push({"x": x, "y": y})
				}
			}
		}


		let dangerousCreeps = [];
		if (Game.rooms[targetRoomName]) {
			let room = Game.rooms[targetRoomName];
			dangerousCreeps = room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK]);
		}

		let addedBackup = false;

		for (var targetPosition of targetPositions) {
			var rangeToEdge;
			if 		(this.memory.bestExitDir == TOP)	 rangeToEdge = targetPosition.y;
			else if (this.memory.bestExitDir == LEFT)	 rangeToEdge = targetPosition.x;
			else if (this.memory.bestExitDir == BOTTOM)	 rangeToEdge = 49 - targetPosition.y;
			else if (this.memory.bestExitDir == RIGHT)	 rangeToEdge = 49 - targetPosition.x;

			var incomingDamage = 0;

			// If they're going to shoot at all...
			if (rm.towerShootsAttack > 1e-30) {			
				for (var towerIdx = 0; towerIdx < rm.twrX.length; towerIdx++) {
					var towerX = rm.twrX[towerIdx];
					var towerY = rm.twrY[towerIdx];

					var towerDist = Math.max(Math.abs(targetPosition.x - towerX), Math.abs(targetPosition.y - towerY));

					incomingDamage += util.getTowerDamageForDist(towerDist)
				}
			}

			// Minimize the score.
			var score = 0;

			// Scale based on potential
			for (let dangerCreep of dangerousCreeps) {
				if (dangerCreep.pos.getRangeTo(targetPosition.x, targetPosition.y) < 3) {
					let hostileParts = dangerCreep.getBoostModifiedCombatParts(true);

					incomingDamage += hostileParts.numAttack * 30;
					incomingDamage += hostileParts.numRanged * 40;
				}
			}

			// We lose a bunch of healing in this case
			if (rangeToEdge < 2) {
				incomingDamage += 200 * rm.twrX.length;
			}

			let anyAdjacent = false;

			if (Game.rooms[targetRoomName]) {
				let pos = new RoomPosition(targetPosition.x, targetPosition.y, targetRoomName);
				let myCreeps = pos.findInRange(FIND_MY_CREEPS, 1);

				for (let creep of myCreeps) {
					if (formationIdx !== undefined) {
						let inThisMission = false;
						for (let formation of this.memory.formations) {
							for (let formationCreepName of formation) {
								if (formationCreepName == creep.name) {
									inThisMission = true;
									break;
								}
							}
							if (inThisMission) {
								break;
							}
						}
						if (!inThisMission) {
							score += 100;
						}
						anyAdjacent = true;
					}
					// else {
					// 	if (!this.memory.assignedCreeps.includes(creep.name) || creep.memory.formationId !== formationIdx) {
					// 		score += 100;	
					// 	}
					// }
				}
			}


			score += (targetPosition.extraScore || 0)
			score += rangeToEdge * 10;

			let numCurrentlyTargeted = 0;
			if (anyAdjacent) {				
				for (let formationIdx2 in this.memory.formations) {
					if (formationIdx == formationIdx2) continue
					if (!this.memory.targets[formationIdx2]) continue

					let formation = this.memory.formations[formationIdx2];
					if (formation.length == 0) continue;
					let numCreepsAlive = 0;
					for (let creepName of formation) {
						let creep = Game.creeps[creepName];
						if (creep) {
							numCreepsAlive++
						}
					}

					if (!numCreepsAlive) continue

					if (this.memory.targets[formationIdx2].x == targetPosition.x && this.memory.targets[formationIdx2].y == targetPosition.y) {
						numCurrentlyTargeted++;
					}
				}
			}

			if (numCurrentlyTargeted && targetPosition.controllerTarget && !addedBackup) {
				addedBackup = true
				for (let backupPosition of backupPositions) {
					targetPositions.push(backupPosition)
				}
			}

			score += 50 * numCurrentlyTargeted

			// Double negative
			if (rm.formationBravery < 0) {
				incomingDamage *= 1 - rm.formationBravery / 10
			}

			// If we can massively outheal it don't worry about it.
			score += Math.max(0, incomingDamage - squadHeal * 0.5);

			score *= (0.9 + Math.random() * 0.2);

			if (score < bestScore) {
				bestScore = score;
				targetPosition.s = score
				targetPosition.sh = squadHeal
				targetPosition.fIdxTest = formationIdx
				bestTarget = targetPosition;
			}
		}

		if (formationIdx !== undefined)  {
			console.log("New target:", this.memory.targetRoomName, JSON.stringify(bestTarget), formationIdx)
			if (bestTarget === undefined) {
				this.memory.bestTargetFailTick = Game.time
				console.log(squadHeal, targetPositions.length, JSON.stringify(this.memory.formations[formationIdx]))
			}
		}

		return bestTarget;
	}


	tick() {
		let cpu = Game.cpu.getUsed()
		super.tick();
		Memory.stats.profiler["combatManagerTickFormationAssault"] += Game.cpu.getUsed() - cpu;

		if (this.isActive()) {
			let targetMem = Memory.rooms[this.memory.targetRoomName];

			cpu = Game.cpu.getUsed()

			if (!this.memory.pending) {
				// Do we need a new target?
				if (Game.rooms[this.memory.targetRoomName]) {
					if (this.memory.type != MISSION_MEGA_ASSAULT && this.memory.type != MISSION_STRONGHOLD_MEGA_ASSAULT) {
						if (this.memory.keepFormation) {
							for (let formationIdx in this.memory.formations) {
								let formation = this.memory.formations[formationIdx];
								if (formation.length == 0) continue;

								let forcedNewTarget = this.checkNeedNewTargetForced(formationIdx);
								// console.log(formationIdx, JSON.stringify(this.memory.targets[formationIdx]), forcedNewTarget)
								// console.log(this.checkNeedNewTargetKilled(parseInt(formationIdx)))
								let newTarget = !this.memory.targets[formationIdx] || this.checkNeedNewTargetKilled(formationIdx);


								if (newTarget || forcedNewTarget) {
									var newBestTarget = this.getBestTarget(this.memory.squadHeal, formationIdx);
									// console.log(newTarget, forcedNewTarget, newBestTarget, this.memory.squadHeal, formationIdx)
									// console.log(this.memory.ID, this.memory.target, newBestTarget)
									if (newBestTarget) {
										this.memory.target = newBestTarget;
										this.memory.targets[formationIdx] = newBestTarget;

										for (let creepName of formation) {
											var creep = Game.creeps[creepName];
											if (creep && !creep.memory.nibbler) {
												if (newTarget || creep.memory.forceNewTarget == Game.time - 1) {
													creep.mem.target = newBestTarget;
												}
											}
										}
									}
									else {
										this.memory.keepFormation = 0;
									}
								}
							}
							if (this.memory.type != MISSION_STRONGHOLD_ASSAULT) {
								this.reTargetRoamingCreepDanger()
							}
						}

					}

					if (this.memory.startWallHP === undefined || this.memory.startRampHP === undefined) {
						let defensiveStructures = Game.rooms[this.memory.targetRoomName].find2(FIND_STRUCTURES, {
							filter: (structure) => {
								return (structure.structureType == STRUCTURE_WALL || structure.structureType == STRUCTURE_RAMPART) && structure.hits;
							}
						});

						this.memory.startWallHP = 0;
						this.memory.startRampHP = 0;
						for (var structure of defensiveStructures) {
							if 		(structure.structureType == STRUCTURE_WALL)	   this.memory.startWallHP += structure.hits;
							else if (structure.structureType == STRUCTURE_RAMPART) this.memory.startRampHP += structure.hits;
						}

						this.memory.realStartWallHP = this.memory.startWallHP
						this.memory.realStartRampHP = this.memory.startRampHP;
					}

					if (this.memory.startEnergy === undefined) {
						let totalEnergy = 0;
						for (var towerIdx in Memory.rooms[this.memory.targetRoomName].twrX) {
							totalEnergy += Memory.rooms[this.memory.targetRoomName].twrE[towerIdx];
						}
						totalEnergy += Memory.rooms[this.memory.targetRoomName].storE || 0;
						totalEnergy += Memory.rooms[this.memory.targetRoomName].trmE || 0;

						this.memory.startEnergy = totalEnergy
					}

				}

				if (this.memory.type != MISSION_FORMATION_REMOTE_DECON && 
					this.memory.type != MISSION_ROOM_HEAVY_FORMATION_HOLD && 
					this.memory.type != MISSION_STRONGHOLD_ASSAULT && 
					this.memory.type != MISSION_MEGA_ASSAULT && 
					this.memory.type != MISSION_STRONGHOLD_MEGA_ASSAULT) {
					if (Game.time % 26 == 1) {
						if (!this.memory.externalTowers && !this.memory.externalSpawns && Game.time - this.memory.lastLaunchTick > 500) {
							let exposed = false;
						  	for (let towerIdx in targetMem.twrX) {
								if (targetMem.twrExtern[towerIdx] || !targetMem.twrInside[towerIdx]) {
									this.memory.externalTowers = 1;
									this.memory.externalTowers2 = this.memory.externalTowers2 || !targetMem.twrInside[towerIdx];
									exposed = true
									break;
								}
							}

						  	for (let spawnIdx in targetMem.spwnX) {
								if (targetMem.spwnExtern[spawnIdx] || !targetMem.spwnInside[spawnIdx]) {
									this.memory.externalSpawns = 1;
									this.memory.externalSpawns2 = this.memory.externalSpawns2 || !targetMem.spwnInside[spawnIdx];
									exposed = true
									break;
								}
							}

							// Ok, we've made a hole. Lets push!
							// This can be a but weird. Assumes perimeter wall not bunker, and hence extensions and guff to kill
							// If it's a bunker this does the wrong thing. But it only does it once.
							if (exposed) {
								// Co-opt a whole bunch of idle creeps. Lets tear this thing down.
								for (var idleCreep of _.clone(Memory.combatManager.idlePool)) {
									if (Game.creeps[idleCreep]) {
										if (!idleCreepManager.canPullIdleCreep(Game.creeps[idleCreep], this.memory.sourceRoomName)) {
											continue;
										}

										var pathCost = safeRoute.getSafeRouteCost(Game.creeps[idleCreep].room.name, this.memory.targetRoomName, true);

										if (pathCost > 10) continue;

										this.assignCreep(Game.creeps[idleCreep]);
										_.pull(Memory.combatManager.idlePool, idleCreep)
									}
								}

								if (Game.rooms[this.memory.targetRoomName] && !Game.rooms[this.memory.targetRoomName].controller.safeMode && Game.rooms[this.memory.targetRoomName].towers.length) {
									this.requestRambo();
								}


								this.memory.effectiveNumLaunches -= 3;

								// this.memory.lastLaunchTick = Game.time;
								// this.memory.numLaunches += 1;
								// this.requestSpawns(this.memory.restrictBoosts, true);
							}
						}
						else if ((this.memory.externalTowers || this.memory.externalSpawns) && Game.time - this.memory.lastLaunchTick > 500) {
							this.memory.externalTowers = 0;
						  	for (let towerIdx in targetMem.twrX) {
								if (targetMem.twrExtern[towerIdx] || !targetMem.twrInside[towerIdx]) {
									this.memory.externalTowers = 1;
									this.memory.externalTowers2 = this.memory.externalTowers2 || !targetMem.twrInside[towerIdx];
									break;
								}
							}

							this.memory.externalSpawns = 0;
						  	for (let spawnIdx in targetMem.spwnX) {
								if (targetMem.spwnExtern[spawnIdx] || !targetMem.spwnInside[spawnIdx]) {
									this.memory.externalSpawns = 1;
									this.memory.externalSpawns2 = this.memory.externalSpawns2 || !targetMem.spwnInside[spawnIdx];									
									break;
								}
							}
						}
						if (!this.memory.externalTowers2 && !this.memory.externalSpawns2) {
							if (this.memory.allowBonusAttack && Game.time > this.memory.allowBonusAttack && Game.time < this.memory.allowBonusAttack + 1500 && this.memory.keepFormation) {
								// Find me a bonus attack.
								try {
									let minHealPerTower = this.getMinHealPerTowerNeeded(this.memory.restrictBoosts);
									let maxHealPerTower = this.getMaxHealPerTowerNeeded();
									if (this.launchBonusAttack(minHealPerTower, maxHealPerTower)) {
										delete this.memory.allowBonusAttack;
									}
									else {
										this.memory.allowBonusAttack += 1500;
									}
								}
								catch(e) {
									console.log("Error on bonus attack launch!");
									console.log(e);
									Game.notify(e.stack)
									console.log(e.stack);
								}
							}
						}
					}

				}
			}

			Memory.stats.profiler["roomAssaultTick1" + this.memory.sourceRoomName + "_" + this.memory.targetRoomName] = Game.cpu.getUsed() - cpu;
			cpu = Game.cpu.getUsed()

			// console.log(this.memory.targetRoomName, JSON.stringify(this.memory.target))

			// This was designed to have one squad on target at once. Screw that. Trust in missionInfo.canLaunchNewAssault.
			let relaunchCooldown
			let minCooldown = 400;
			let nothingToHurt = false;
			let forbidRespawn = false;

			let targetRoomName = this.memory.targetRoomName;

			// We only run on % 10 = 2
			if (Game.time % 10 == 2) {			
				relaunchCooldown = 1500 - (this.memory.preSpawnOffset || 0) - (this.memory.routeLength || 10) * 50 - 300;

				let roomIsQuiet = false;

				if (this.memory.type != MISSION_FORMATION_REMOTE_DECON && 
					(this.memory.type !== MISSION_STRONGHOLD_ASSAULT || Memory.rooms[targetRoomName].invCL >= 4) && 
					this.memory.keepFormation && 
					!this.memory.tryingLowControllerPush) {

					let bestPCLevel = 0
					for (let assignedPowerCreepName of (Memory.rooms[this.memory.sourceRoomName].assignedPowerCreeps || [])) {
						let powerCreep = Game.powerCreeps[assignedPowerCreepName];

						if (!powerCreep || !powerCreep.room || !powerCreep.powers[PWR_OPERATE_SPAWN] || powerCreep.room.name != this.memory.sourceRoomName) continue

						// POWAH
						// Assume we get half the speedup.
						bestPCLevel = Math.max(bestPCLevel, powerCreep.powers[PWR_OPERATE_SPAWN].level)
					}
					if (bestPCLevel) {
						minCooldown *= 1 - (1 - POWER_INFO[PWR_OPERATE_SPAWN].effect[bestPCLevel - 1]) * 0.5;
					}

					let sourceRoom = Game.rooms[this.memory.sourceRoomName]

					roomIsQuiet = sourceRoom.energyCapacityAvailable == sourceRoom.energyAvailable
					if (roomIsQuiet) {
						for (let spawn of Game.rooms[this.memory.sourceRoomName].find(FIND_MY_SPAWNS)) {
							if (spawn.spawning) {
								roomIsQuiet = false;
								break;
							}
						}
					}
					if (roomIsQuiet && _.sum(Memory.rooms[this.memory.sourceRoomName].priorityBuilds)) {
						roomIsQuiet = false
					}

					if (roomIsQuiet || Memory.rooms[this.memory.sourceRoomName].spawnUtilization < 0.9) {
						// relaunchCooldown is designed to land one squad every 1500 ticks.
						// If we can launch a new assault though... just throw it out there.
						if (this.memory.type == MISSION_MEGA_ASSAULT || this.memory.type == MISSION_STRONGHOLD_MEGA_ASSAULT || (this.memory.type == MISSION_STRONGHOLD_ASSAULT && Memory.rooms[targetRoomName].invCL >= 4)) {
							relaunchCooldown = minCooldown;
						}
						else {		
							// Mob the feckers
							if ((targetMem.invCL || 0) >= 4) {
								relaunchCooldown = minCooldown
							}
							else {								
								relaunchCooldown -= 250
								// If we're using PCs it's expensive to fuck about
								if (this.memory.expectedMaxPowerCreepDisruptTowerLevel) {
									relaunchCooldown -= 250
								}

								if (roomIsQuiet) {
									relaunchCooldown -= 100;
								}
								if (Memory.rooms[this.memory.sourceRoomName].spawnUtilization < 0.85) {
									relaunchCooldown -= 100;
								}

								relaunchCooldown -= Math.max(0, -(this.memory.p || 0) * 10)
								relaunchCooldown -= (Memory.rooms[targetRoomName].enemyFullyConnected ? 100 : 0)
								relaunchCooldown -= (Memory.rooms[targetRoomName].numAttacksFizzled || 0) * 200
								relaunchCooldown -= (Memory.rooms[targetRoomName].numAttacksFailed || 0) * 200
								relaunchCooldown -= (Memory.rooms[targetRoomName].hostileBoostedCreeps ? 200 : 0)
								relaunchCooldown -= (Memory.rooms[targetRoomName].repairPerTick || 0) / 30 // 6000 -> 200
								relaunchCooldown -= (Memory.rooms[targetRoomName].advBlkDmg || 0) * 100

								// relaunchCooldown -= this.memory.numLaunches * 10


								if (this.memory.type != MISSION_STRONGHOLD_ASSAULT && this.memory.type != MISSION_STRONGHOLD_MEGA_ASSAULT) {	
									relaunchCooldown -= intelAI.strugglingToKillRooms(Memory.rooms[targetRoomName].owner) * 50;
								}
							}
						}
					}

					if (this.memory.type != MISSION_STRONGHOLD_ASSAULT && this.memory.type != MISSION_STRONGHOLD_MEGA_ASSAULT) {					
						if (this.memory.boosted >= 3 && _.sum(targetMem.controllerExposedToEdge) && targetMem.twrX.length > 0) {
							console.log("Request HCA A")
							HeavyControllerAttackMission.requestHeavyControllerAttackers(targetRoomName);
						}
					}
					
				}

				relaunchCooldown += (Memory.rooms[this.memory.sourceRoomName].boostFailed || 0);

				relaunchCooldown += (10000 - Game.cpu.bucket) / 100
				relaunchCooldown += (10000 - Memory.stats.avgBucket) / 100

				if (relaunchCooldown < minCooldown && !roomIsQuiet) {
					relaunchCooldown = minCooldown;
				}
				else if (relaunchCooldown > 1200) {
					relaunchCooldown = 1200;
				}

				if (this.memory.type == MISSION_FORMATION_REMOTE_DECON) {
					if ((targetMem.wallHP == 0 && targetMem.rampHP == 0) ||
						 !targetMem.unexposedController) {
						nothingToHurt = true;
					}
				}
				else if (this.memory.type == MISSION_STRONGHOLD_ASSAULT || this.memory.type == MISSION_STRONGHOLD_MEGA_ASSAULT) {
					nothingToHurt = false;
				}
				else if (targetMem.wallHP == 0 &&
						targetMem.rampHP == 0 &&
						targetMem.spwnX.length == 0 &&
						targetMem.twrX.length == 0) {
					nothingToHurt = true;			
				}

				// Send in a holding team
				// if (nothingToHurt && this.memory.type !== MISSION_STRONGHOLD_ASSAULT && this.memory.type !== MISSION_STRONGHOLD_MEGA_ASSAULT) {
				// Just contantly request it. If we've spent effort to do an assault we want to pin it down if a weak room is allowed 
				if (this.memory.type !== MISSION_STRONGHOLD_ASSAULT && 
					this.memory.type != MISSION_ROOM_HEAVY_FORMATION_HOLD && 
					this.memory.type !== MISSION_STRONGHOLD_MEGA_ASSAULT && 
					this.memory.type !== MISSION_FORMATION_REMOTE_DECON) {
					try {						
						let totalTowerEnergy = 0;
						for (let energy of targetMem.twrE) {
							totalTowerEnergy += energy;
						}

						if (totalTowerEnergy < 30 || !targetMem.twrX.length) {
							WeakRoomAttack.requestWeakRoomAttack(this.memory.targetRoomName, (this.memory.p || 0) - 10)
						}
						else {
							// Spam it, 'cos we'll want it
							Memory.combatManager.requestedMissions[MISSION_WEAK_ROOM_ATTACK][this.memory.targetRoomName] = Game.time
						}

						// console.log("roomAssault weak room attack poking didn't fail")
					}
					catch(e) {
						console.log(e)
						console.log(e.stack)
					}

				}

				if (this.memory.type == MISSION_MEGA_ASSAULT || this.memory.type == MISSION_STRONGHOLD_MEGA_ASSAULT) {
					if (global.roomAssaultCounts[targetRoomName].activeFormations >= this.memory.targetTiles.length) {
						forbidRespawn = true
					}
				}

				if (Math.random() < 0.01 || Memory.debugRelaunch) {
					console.log(this.memory.sourceRoomName, "to", this.memory.targetRoomName, "relaunchCooldown", relaunchCooldown, "time", Game.time - this.memory.lastLaunchTick)
					console.log("Real damage done", this.memory.realStartRampHP + this.memory.realStartWallHP - targetMem.wallHP - targetMem.rampHP, "spawning creeps num", this.memory.spawningCreeps.length);
					console.log("Nothing to hurt:", nothingToHurt, "forbid respawn:", forbidRespawn, "target:", JSON.stringify(this.memory.target), "canLaunchNewAssault:", missionInfo.canLaunchNewAssault(targetRoomName, this.memory.bestSetupRoom));
				}
			}

			// if (this.memory.type === MISSION_STRONGHOLD_ASSAULT && Memory.rooms[this.memory.targetRoomName].invCL === 5 && this.memory.numLaunches < 4) {
			// 	console.log("Stronghold relaunch cooldown", this.memory.sourceRoomName, this.memory.targetRoomName, relaunchCooldown)
			// 	console.log("Stronghold relaunch cooldown", Game.time - this.memory.lastLaunchTick > relaunchCooldown, missionInfo.canLaunchNewAssault(targetRoomName, this.memory.bestSetupRoom), !!this.memory.target, this.memory.spawningCreeps.length)
			// }


			let minNumCreeps = (this.memory.type == MISSION_STRONGHOLD_ASSAULT || this.memory.type == MISSION_STRONGHOLD_MEGA_ASSAULT) ? 1 : this.memory.squadSize;

			if ((this.memory.assignedCreeps.length + this.memory.spawningCreeps.length < minNumCreeps || Game.time - this.memory.lastLaunchTick > 3000)) {
				let damageDone = 0;
				if (this.memory.startWallHP !== undefined || this.memory.startRampHP !== undefined) {
					damageDone = (this.memory.startWallHP + this.memory.startRampHP - targetMem.wallHP - targetMem.rampHP);
				}

				let energyDrained = 0;
				if (this.memory.startEnergy !== undefined) {
					var totalEnergy = 0;
					for (var towerIdx in targetMem.twrX) {
						totalEnergy += targetMem.twrE[towerIdx];
					}
					totalEnergy += targetMem.storE || 0;
					totalEnergy += targetMem.trmE || 0;

					energyDrained = this.memory.startEnergy - totalEnergy;
				}


				console.log(this.memory.sourceRoomName, "mission complete", this.memory.targetRoomName)
				console.log("Damage done", damageDone, "ticks", Game.time - this.memory.lastLaunchTick)
				console.log("Energy delta", energyDrained, "ticks", Game.time - this.memory.lastLaunchTick)
				console.log("Num launches " + this.memory.numLaunches)

				if (Game.time - this.memory.lastLaunchTick == 1) {
					console.log("Crapped out on launch?")
					this.missionComplete(false);
					return;
				}

				if (Game.time - this.memory.lastLaunchTick < 900) {
					if (this.getSuccessRate() < 0.5) {
						this.memory.e++;
					}
					this.memory.e++;
				}
				else if (Math.random() < 0.1) {
					this.memory.e--;
				}

				// Getting terminal food
				if (targetMem.trmX && (targetMem.termEnergyInPerTick || 1) >= 1) {
					if ((Memory.gclEstimates[targetMem.owner] || 1) >= 10) {
						damageDone += Math.max(0, energyDrained * 5);
					}
					else if ((Memory.gclEstimates[targetMem.owner] || 1) >= 5) {
						damageDone += Math.max(0, energyDrained * 10);
					}
					else {
						damageDone += Math.max(0, energyDrained * 25);
					}
				}
				else {
					damageDone += Math.max(0, energyDrained * 100);
				}

				// If we've broken formation then we've killed the stuff we set out to, so it must be unbroken to fail
				if ((damageDone || 0) <= 75000 * ((this.memory.peakBoosted || 0) + 1) * Math.sqrt((this.memory.boosted || 0) + 1) * (this.memory.effectiveNumLaunches || this.memory.numLaunches) &&
					this.memory.keepFormation == 1) {
					this.memory.f++;

					this.memory.fRefreshRate = 10000 * ((this.memory.peakBoosted || 0) + 1);
					this.memory.fRefreshRate *= (1.5 - this.getSuccessRate());
					this.memory.fRefreshRate *= 1 + (targetMem.numAttacksFailed || 0) * 0.2;

					if (Memory.stats.avgBucket < 3000)  {
						this.memory.fRefreshRate *= 1.25;
					}

					if (targetMem.nukeLandTime &&
						this.memory.fRefreshRate > targetMem.nukeLandTime - Game.time &&
						this.memory.fRefreshRate / 2 < targetMem.nukeLandTime - Game.time) {
						this.memory.fRefreshRate /= 2;
					}

					if (Memory.maxRoomLevel < 7) {
						this.memory.fRefreshRate *= 3
					}

					this.memory.fTick = Game.time;

					targetMem.numAttacksFailed = (targetMem.numAttacksFailed || 0) + 1;
					if (this.memory.closeCombat) {
						targetMem.numAttacksFailedClose = (targetMem.numAttacksFailedClose || 0) + 1;
					}
					else {
						targetMem.numAttacksFailedRanged = (targetMem.numAttacksFailedRanged || 0) + 1;
					}

					targetMem.failedAtBoostLevel = Math.max((targetMem.failedAtBoostLevel || 0), this.memory.peakBoosted)


					this.missionComplete(false);
				}
				else {
					// if ((targetMem.numAttacksFailed || 0) > 0) {
					// 	targetMem.numAttacksFailed--;
					// }
					// if (this.memory.closeCombat) {
					// 	if ((targetMem.numAttacksFailedClose || 0) > 0) {
					// 		targetMem.numAttacksFailedClose--;
					// 	}
					// }
					// else {
					// 	if ((targetMem.numAttacksFailedRanged || 0) > 0) {
					// 		targetMem.numAttacksFailedRanged--;
					// 	}
					// }
					if (targetMem.wallHP == 0 &&
						targetMem.rampHP == 0 &&
						targetMem.spwnX.length == 0 &&
						targetMem.twrX.length == 0) {
						nothingToHurt = true;
					}

					if (!nothingToHurt) {
						// Have we actually fizzled?
						if (!forbidRespawn &&
							missionInfo.canLaunchNewAssault(targetRoomName, this.memory.bestSetupRoom) &&
							this.memory.target && 
							!this.renewRestricted()) {							
							targetMem.numAttacksFizzled = (targetMem.numAttacksFizzled || 0) + 1
							targetMem.fizzledAtBoostLevel = Math.max((targetMem.fizzledAtBoostLevel || 0), this.memory.peakBoosted)
						}

						// We've not failed, but ideally we'd be respawning until we kill.
						// Have a bit of a break.
						this.memory.fRefreshRate = 1000 * ((this.memory.peakBoosted || 0) + 1) * Math.sqrt((this.memory.boosted || 0) + 1);
						this.memory.fTick = Game.time;

						if (Memory.maxRoomLevel < 7) {
							this.memory.fRefreshRate *= 3
						}						
					}

					this.memory.s++;
					return this.missionComplete(true);
				}
			}
			else if (Game.time % 10 == 2 && !forbidRespawn && !nothingToHurt && Game.time - this.memory.lastLaunchTick > relaunchCooldown && 
					this.memory.type != MISSION_ROOM_HEAVY_FORMATION_HOLD &&
					 missionInfo.canLaunchNewAssault(targetRoomName, this.memory.bestSetupRoom) && 
					 this.memory.target && 
					 this.memory.spawningCreeps.length == 0) {
				let damageDone;
				if (this.memory.type == MISSION_STRONGHOLD_ASSAULT || this.memory.type == MISSION_STRONGHOLD_MEGA_ASSAULT) {
					if (Game.rooms[this.memory.targetRoomName]) {
						let rampHP = 0
						for (let rampart of Game.rooms[this.memory.targetRoomName].ramparts) {
							if (!rampart.my && rampart.hits) {
								rampHP += rampart.hits;
							}
						}
						damageDone = (this.memory.startWallHP + this.memory.startRampHP - rampHP);	
					}
					else {
						// Hmm
						damageDone = 0;
					}
				}
				else {
					damageDone = (this.memory.startWallHP + this.memory.startRampHP - targetMem.wallHP - targetMem.rampHP);	
				} 

				// Nukes are complicated
				if (Game.rooms[this.memory.targetRoomName]) {
					for (let nuke of Game.rooms[this.memory.targetRoomName].find(FIND_NUKES)) {
						for (let x = nuke.pos.x - 2; x <= nuke.pos.x + 2; x++) {
							for (let y = nuke.pos.y - 2; y <= nuke.pos.y + 2; y++) {
								if (x <= 1 || y <= 1 || x >= 48 || y >= 48) continue;

								let structs = Game.rooms[this.memory.targetRoomName].lookForAt(LOOK_STRUCTURES, x, y)
								for (let struct of structs) {
									if (struct.structureType == STRUCTURE_RAMPART || struct.structureType == STRUCTURE_WALL) {
										damageDone += Math.min(struct.hits, (x == 0 && y == 0) ? NUKE_DAMAGE[0] : NUKE_DAMAGE[2])
										break;
									}
								}
							}
						}
					}
				}


				let energyDrained = 0;
				if (this.memory.startEnergy !== undefined) {
					var totalEnergy = 0;
					for (var towerIdx in targetMem.twrX) {
						totalEnergy += targetMem.twrE[towerIdx];
					}
					totalEnergy += targetMem.storE || 0;
					totalEnergy += targetMem.trmE || 0;

					energyDrained = this.memory.startEnergy - totalEnergy;
				}

				// Getting terminal food
				if (targetMem.trmX && (targetMem.termEnergyInPerTick || 1) >= 1) {
					if ((Memory.gclEstimates[targetMem.owner] || 1) >= 10) {
						damageDone += Math.max(0, energyDrained * 5);
					}
					else if ((Memory.gclEstimates[targetMem.owner] || 1) >= 5) {
						damageDone += Math.max(0, energyDrained * 10);
					}
					else {
						damageDone += Math.max(0, energyDrained * 25);
					}
				}
				else {
					damageDone += Math.max(0, energyDrained * 100);
				}

				// Mostly aimed at T3 wars. Can't go negative. If they're spending a lot then we're doing alright.
				damageDone += 1000 * Math.max(0, (targetMem.defenseBoostCost || 0) - this.memory.squadSize * MAX_CREEP_SIZE * this.memory.boosted)

				let cheapRenew = !this.memory.boosted && !Game.rooms[this.memory.sourceRoomName].restrictOffensiveMissions(this.memory.targetRoomName, false, true, false) && this.memory.squadSize == 4


				// console.log(this.memory.sourceRoomName, this.memory.targetRoomName, damageDone, cheapRenew, nothingToHurt)
				// console.log((cheapRenew ? 50000 : 100000) * this.memory.numLaunches * ((this.memory.boosted || 0) + 1) * Math.sqrt((this.memory.boosted || 0) + 1))
				// console.log(missionInfo.isRoomSpawningMission(Game.rooms[this.memory.sourceRoomName]), Game.rooms[this.memory.sourceRoomName].restrictOffensiveMissions(true))
				global.roomAssaultCounts[this.memory.targetRoomName] = global.roomAssaultCounts[this.memory.targetRoomName] || {}
				if (global.roomAssaultCounts[this.memory.targetRoomName].assaultCount) {
					damageDone /= Math.max(1, global.roomAssaultCounts[this.memory.targetRoomName].assaultCount);
				}

				// if (Memory.swc) {
				// 	if (Math.random() < 0.001) console.log("Banzai mode in combatManager for swc")
				// 	cheapRenew = 1;
				// 	damageDone += 1e5
				// }

				// Should be initialized on create, but this is needed to grandfather old missions for a bit.
				this.memory.effectiveNumLaunches = this.memory.effectiveNumLaunches || this.memory.numLaunches

				let targetDamage = (cheapRenew ? 50000 : 100000) * this.memory.effectiveNumLaunches * ((this.memory.boosted || 0) + 1) * Math.sqrt((this.memory.boosted || 0) + 1) * this.memory.squadSize / 4

				if (this.memory.type == MISSION_STRONGHOLD_MEGA_ASSAULT) {
					targetDamage /= 50;
				}

				let iAmRich = (global.creditLimit || 0) > 10e6;

				if (iAmRich) {
					targetDamage /= 2;
				}

				if (this.memory.type === MISSION_STRONGHOLD_ASSAULT) {
					// Cleanup crew
					if (!Memory.rooms[this.memory.targetRoomName].invCL) {
						targetDamage /= 10
					}
					else {
						targetDamage /= 4
					}
				}

				let enoughDamage = damageDone > targetDamage

				// Well, this ain't working. Try to be braver, but walk it around a bit
				if (!enoughDamage && Game.time - this.memory.lastLaunchTick > 1000) {
					targetMem.formationBravery = (targetMem.formationBravery || 0) + (Math.random() - 0.45);
				}

				// Fuck this shit up
				if (this.memory.numLaunches < 6 && ((this.memory.type === MISSION_STRONGHOLD_ASSAULT && Memory.rooms[this.memory.targetRoomName].invCL === 5) || this.memory.type == MISSION_MEGA_ASSAULT || this.memory.type == MISSION_STRONGHOLD_MEGA_ASSAULT)) {					
					enoughDamage = true;
				}
				else if (this.memory.numLaunches < 4 && (this.memory.type === MISSION_STRONGHOLD_ASSAULT && Memory.rooms[this.memory.targetRoomName].invCL === 4)) {					
					enoughDamage = true;
				}

				if (Math.random() < 0.01 || Memory.debugRelaunch) {
					console.log("Damage done", damageDone, "target damage", targetDamage, "nothingToHurt?", nothingToHurt, "enough?", enoughDamage, "renewRestricted", this.renewRestricted());
				}


				// This is going well enough. Respawn
				if (!nothingToHurt &&
					enoughDamage &&
					// (this.memory.type === MISSION_STRONGHOLD_ASSAULT || !missionInfo.isRoomSpawningMission(Game.rooms[this.memory.sourceRoomName])) &&
					!this.renewRestricted()) {
					console.log(this.memory.sourceRoomName + " relaunching " +  this.memory.type + " against " + this.memory.targetRoomName)

					let realDamageDone = (this.memory.realStartRampHP + this.memory.realStartWallHP - targetMem.wallHP - targetMem.rampHP);

					console.log("Real damage done " + realDamageDone)
					console.log("Energy drained " + energyDrained)
					console.log("Num launches " + this.memory.numLaunches)

					console.log("Renew check damage done: " + damageDone)
					console.log("Renew check Num launches: " + this.memory.effectiveNumLaunches)

					// Stop the boosts. It's dead.
					let restrictBoosts = this.memory.restrictBoosts
					if (targetMem.spwnX && targetMem.twrX && targetMem.hostileCreepOwners && targetMem.spwnX.length == 0 && targetMem.twrX.length == 0 && targetMem.hostileCreepOwners.length == 0) {
						restrictBoosts = 1;
					}

					// Game.notify(this.memory.targetRoomName + " Real damage done " + realDamageDone)
					// Game.notify(this.memory.targetRoomName + " Num launches " + this.memory.numLaunches)

					// Game.notify(this.memory.targetRoomName + " Renew check damage done: " + damageDone)
					// Game.notify(this.memory.targetRoomName + " Renew check Num launches: " + this.memory.effectiveNumLaunches)
					if (this.requestSpawns(restrictBoosts, true)) {
						// Decay so that damage done a long time ago doesn't matter so much.
						const alpha = Math.exp(-(1/8.));
						this.memory.startWallHP = alpha * this.memory.startWallHP + (1 - alpha) * targetMem.wallHP
						this.memory.startRampHP = alpha * this.memory.startRampHP + (1 - alpha) * targetMem.rampHP
						this.memory.effectiveNumLaunches = alpha * (this.memory.effectiveNumLaunches + 1)


						// if (this.memory.numLaunches == 1) {

						// }

						// if (targetMem && targetMem.owner) {
						// 	Memory.attackFocus[targetMem.owner] = (Memory.attackFocus[targetMem.owner] || 0) + 1;
						// }


						// def test():
						// 	w = 100e6
						// 	w2 = w
						//  w -= 1e6
						// 	e = 1
						// 	for i in range(20):
						// 		w -= 1e6
						// 		w2 = alpha * w2 + (1 - alpha) * w;
						// 		e = alpha * (e+1)
						// 		d = w2 - w
						// 		print(d, e, d / e)

						if (Math.random() < 0.2) {
							this.memory.e--;
						}

						this.memory.lastLaunchTick = Game.time;
						this.memory.numLaunches += 1;

						// Bonus attacks! Push it a bit later so we can clear this spawn first.
						this.memory.allowBonusAttack = Game.time + 300;

						// Regress toward zero
						// if (targetMem.formationBravery < 0) {
						// 	targetMem.formationBravery = (targetMem.formationBravery || 0) / 2;
						// }
					}
				}
			}

			Memory.stats.profiler["roomAssaultTick2" + this.memory.sourceRoomName + "_" + this.memory.targetRoomName] = Game.cpu.getUsed() - cpu;
		}
	}

	getMinHealPerTowerNeeded(restrictBoosts) {
		let baseHealPerTower = restrictBoosts ? ROOM_ASSAULT_MIN_HEAL_PER_TOWER : ROOM_ASSAULT_MIN_HEAL_PER_TOWER_BOOSTED;

		if (this.memory.squadSize == 9) {
			baseHealPerTower = ROOM_ASSAULT_MIN_HEAL_PER_TOWER_LARGE;
		}

		let mem = Memory.rooms[this.memory.targetRoomName];

		// Well
		if (mem.invCL && (mem.invCL <= 1 || (mem.invCL < 5 && mem.twrX.length <= 1))) {
			console.log("getMinHealPerTowerNeeded: stronghold with one tower", this.memory.targetRoomName)
			return TOWER_POWER_ATTACK + 8 * HEAL_POWER;
		}


		// if ((mem.rcl || 0) < 8 && Game.rooms[this.memory.sourceRoomName].effectiveLevel == 8 && !restrictBoosts) {
		// 	baseHealPerTower *= 1.125;
		// }

		// Heal is much easier to whack
		if (this.memory.closeCombat) {
			baseHealPerTower *= 1.1
		}

		// We have RCL 8 rooms that can do things. Defer to them unless we can crush.
		if (Memory.maxRoomLevel == 8 && Game.rooms[this.memory.sourceRoomName].effectiveLevel < 8 && !mem.invCL) {
			baseHealPerTower *= 1.5;
		}

		if (mem.opTowerLevel) {
			baseHealPerTower *= 1 + (POWER_INFO[PWR_OPERATE_TOWER].effect[mem.opTowerLevel - 1] - 1) / 10
		}


		if (Game.time - (mem.lastFormationKilled || 0) < 1500) {
			baseHealPerTower += 50;
		}

		/*if (mem.formationBravery < 0) {
			// Double negative.
			baseHealPerTower += -(mem.formationBravery || 0) * 50
		}*/
		if (mem.formationBravery < 0) {
			// Double negative.
			baseHealPerTower += -(mem.formationBravery || 0) * 10
		}
		else if (mem.formationBravery > 5) {
			baseHealPerTower -= ((mem.formationBravery || 0) - 5) * 5
		}



		// No boosts means we can cut it a lot tighter
		if (!mem.hostileBoostedCreeps && !mem.hasLabs && !mem.invCH) {
			baseHealPerTower -= 30;
		}

		if (!mem.invCH) {			
			// They can't spawn active defense
			if (mem.energyCapacityAvailable < (MAX_CREEP_SIZE / 4) * (BODYPART_COST[ATTACK] + BODYPART_COST[MOVE])) {
				baseHealPerTower -= 20;
			}
			else if (mem.energyCapacityAvailable < (MAX_CREEP_SIZE / 2) * (BODYPART_COST[ATTACK] + BODYPART_COST[MOVE])) {
				baseHealPerTower -= 10;
			}
			if (mem.energyCapacityAvailable < (MAX_CREEP_SIZE / 4) * (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE])) {
				baseHealPerTower -= 20;
			}
			else if (mem.energyCapacityAvailable < (MAX_CREEP_SIZE / 2) * (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE])) {
				baseHealPerTower -= 10;
			}
		}


		// Dead room?
		if ((mem.hostileCreepOwners || []).length == 0) {
			baseHealPerTower -= 10;
		}
		if (mem.DT < 0.5) {
			baseHealPerTower -= 10;
		}


		// No attack intents have gone out in a while
		if ((mem.roomIsDefending || 1) < 1e-6) {
			baseHealPerTower -= 100;
		}

		// No walls???
		if ((mem.numRamps || 0) + (mem.numWalls || 0) == 0) {
			// Give it a go at least
			if (!mem.numAttacksFailed && !mem.numAttacksFizzled) {
				baseHealPerTower -= 100;
			}
		}

		// No energy???
		if ((mem.trmE || 0) + (mem.storE || 0) == 0) {
			// Give it a go at least
			if (!mem.numAttacksFailed && !mem.numAttacksFizzled) {
				baseHealPerTower -= 100;
			}
		}

		let towersShotRecently = (Game.time - (mem.towerLastShot || 0) < 1500)
		let towersShotSemiRecently = (Game.time - (mem.towerLastShot || 0) < 3000)
		let towersShotSemiSemiRecently = (Game.time - (mem.towerLastShot || 0) < 6000)

		// No towers...
		if ((mem.towerShootsAttack < 1e-30 && !mem.creepCombatPartsRanged && !mem.creepCombatPartsAttack && mem.DT < 1e-30 && !towersShotSemiSemiRecently) || !mem.twrX || !mem.twrX.length) {
			baseHealPerTower -= 400;
		}
		else {
			if (!towersShotRecently) {
				let anyHostileCreeps = (mem.hostileCreepOwners || []).length 

				let numEmpty = 0;
				for (let towerIdx in mem.twrX.length) {
					if (mem.twrE[towerIdx] < 10) {
						numEmpty++;
					}
					else if (!anyHostileCreeps) {
						// Eh, kinda empty if they can't fill.
						numEmpty += 0.5
					}
				}

				let mod = towersShotSemiRecently ? 0.5 : (towersShotSemiSemiRecently ? 0.75 : 1);

				if (!anyHostileCreeps) {
					if (numEmpty == mem.twrX.length) {
						baseHealPerTower -= 200 * mod;
					}
					else {
						baseHealPerTower -= 100 * mod * numEmpty / mem.twrX.length;
					}
				}
				else {
					if (numEmpty == mem.twrX.length) {
						baseHealPerTower -= 80 * mod;
					}
					else {
						baseHealPerTower -= 40 * mod * numEmpty / mem.twrX.length;
					}
				}
			}

			// Easier to deal with as they're predictable. 
			if (mem.towerShootsWithFocus > 0.999) {
				baseHealPerTower -= 2.5;
			}

			// Even easier if we can predict who they shoot, it's gameable (ie. we can just retreat), and we have a lot of squads
			let scale = 1;

			if (global.roomAssaultCounts[this.memory.targetRoomName]) {
				scale += (global.roomAssaultCounts[this.memory.targetRoomName].assaultCount || 0);
			}
			if (mem.towerShootsAtClosest > 0.999) {
				baseHealPerTower -= 2.5 * scale;
			}
			if (mem.towerShootsAtStrongholdMax > 0.999) {
				baseHealPerTower -= 2.5 * scale;	
			}

			
			let exits = Game.map.describeExits(this.memory.targetRoomName);
			let maxTowerDamage = mem.maxTowerDamage;

			for (let exitDir in exits) {
				if (exits[exitDir] == this.memory.bestSetupRoom) {
					let idx = Math.round((parseInt(exitDir) - 1) / 2);

					if (mem.maxTowerDamageAtOuterWallByEdge && mem.lowestOuterWallByEdge) {
						let t1 = 5e6 / ((mem.advBlkDmg || 0) * 3 + 1)
						let t2 = 3e6 / ((mem.advBlkDmg || 0) * 3 + 1)
						// Not going to break through this wave.
						if (mem.lowestOuterWallByEdge[idx] > t1) {
							maxTowerDamage = mem.maxTowerDamageAtOuterWallByEdge[idx];
						}
						else if (mem.lowestOuterWallByEdge[idx] > t2) {
							maxTowerDamage = 0.5 * (mem.maxTowerDamage + mem.maxTowerDamageAtOuterWallByEdge[idx]);
						}
					}
					else {
						if (mem.lowestOuterWall !== undefined && mem.maxTowerDamageAtOuterWall !== undefined) {
							// Not going to break through this wave.
							if (mem.lowestOuterWall > 5e6) {
								maxTowerDamage = mem.maxTowerDamageAtOuterWall;
							}
							else if (mem.lowestOuterWall > 3e6) {
								maxTowerDamage = 0.5 * (mem.maxTowerDamage + mem.maxTowerDamageAtOuterWall);
							}
						}
					}
				}
			}

			if (maxTowerDamage > 2000) {
				baseHealPerTower += (maxTowerDamage - 2000) / 40
			}
		}

		if (!mem.invCH) {			
			if (!mem.trmX) {
				if ((mem.storE || 0) < 1000) {
					baseHealPerTower -= 10;
				}
			}
			if ((mem.storE || 0) + (mem.trmE || 0) < 1000) {
				baseHealPerTower -= 10;
			}
			if ((mem.storE || 0) + (mem.trmE || 0) === 0) {
				baseHealPerTower -= 10;
			}
		}

		if (mem.towerShootsAttack < 0.001)  {
			baseHealPerTower -= 20;
		}
		else if (mem.towerShootsAttack < 0.01)  {
			baseHealPerTower -= 10;
		}




		// if (this.memory.squadSize == 9) {
		// 	if (baseHealPerTower > ROOM_ASSAULT_MIN_HEAL_PER_TOWER_LARGE) {
		// 		baseHealPerTower = ROOM_ASSAULT_MIN_HEAL_PER_TOWER_LARGE;
		// 	}
		// }
		// else {
		// 	if (baseHealPerTower > (restrictBoosts ? ROOM_ASSAULT_MIN_HEAL_PER_TOWER : ROOM_ASSAULT_MIN_HEAL_PER_TOWER_BOOSTED)) {
		// 		baseHealPerTower = (restrictBoosts ? ROOM_ASSAULT_MIN_HEAL_PER_TOWER : ROOM_ASSAULT_MIN_HEAL_PER_TOWER_BOOSTED);
		// 	}
		// }

		if (mem.invCL) {
			baseHealPerTower = Math.max(TOWER_POWER_ATTACK + 4 * HEAL_POWER, baseHealPerTower)
			console.log("getMinHealPerTowerNeeded", mem.invCL, this.memory.targetRoomName, baseHealPerTower)
		}

		if (Memory.optimisticMinHealPerTower) {
			baseHealPerTower = Math.min(baseHealPerTower, TOWER_POWER_ATTACK + 4 * HEAL_POWER)
		}


		return Math.max(0, baseHealPerTower);
	}

	// MAX. Reducing this means more damage less healing.
	// Default is 900. That's meant for attacking against boosted defenses.
	// If they can't defend themselves actively 600 should do.
	getMaxHealPerTowerNeeded() {
		let baseHealPerTower = ROOM_ASSAULT_MAX_HEAL_PER_TOWER;

		let mem = Memory.rooms[this.memory.targetRoomName];

		// Well
		if (mem.invCL && (mem.invCL <= 1 || (mem.invCL < 5 && mem.twrX.length <= 1))) {
			console.log("getMaxHealPerTowerNeeded: stronghold with one tower", this.memory.targetRoomName)
			return TOWER_POWER_ATTACK + 4 * HEAL_POWER;
		}

		// Don't mess about, just kill them.
		if ((mem.rcl || 0) < 8 && Game.rooms[this.memory.sourceRoomName].effectiveLevel == 8) {
			baseHealPerTower *= 1.25;
		}

		// Heal is much easier to whack
		if (this.memory.closeCombat) {
			baseHealPerTower *= 1.1
		}

		if (mem.opTowerLevel) {
			baseHealPerTower *= 1 + (POWER_INFO[PWR_OPERATE_TOWER].effect[mem.opTowerLevel - 1] - 1) / 5
		}

		if (Game.time - (mem.lastFormationKilled || 0) < 1500) {
			baseHealPerTower += 100;
		}

		if (mem.formationBravery < 0) {
			// Double negative.
			baseHealPerTower += -(mem.formationBravery || 0) * 20
		}
		else if (mem.formationBravery > 5) {
			baseHealPerTower -= ((mem.formationBravery || 0) - 5) * 10
		}

		// These aren't used in minHealPerTower...
		// No boosts means we can cut it a lot tighter
		if (!mem.hostileBoostedCreeps && !mem.hasLabs && !mem.invCH) {
			baseHealPerTower -= 150;
		}
		// Don't have creeps doing attacks, and I'm not blocked on damage
		else if (mem.roomIsCreepDefending < 1e-3 && mem.advBlkDmg < 1e-3) {
			baseHealPerTower -= 150;
		}
		else if (!mem.hostileBoostedCreeps && mem.hasLabs) {
			if (mem.totalBoosts[2] < LAB_MINERAL_CAPACITY / 2) {
				baseHealPerTower -= 40;
				if (mem.totalBoosts[1] < LAB_MINERAL_CAPACITY / 2) {
					baseHealPerTower -= 40;
					if (mem.totalBoosts[0] < LAB_MINERAL_CAPACITY / 2) {
						baseHealPerTower -= 40;
					}
				}
			}
		}
		



		// They can't spawn active defense
		if (!mem.invCH) {			
			if (mem.energyCapacityAvailable < (MAX_CREEP_SIZE / 4) * (BODYPART_COST[ATTACK] + BODYPART_COST[MOVE])) {
				baseHealPerTower -= 100;
			}
			else if (mem.energyCapacityAvailable < (MAX_CREEP_SIZE / 2) * (BODYPART_COST[ATTACK] + BODYPART_COST[MOVE])) {
				baseHealPerTower -= 50;
			}
			if (mem.energyCapacityAvailable < (MAX_CREEP_SIZE / 4) * (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE])) {
				baseHealPerTower -= 100;
			}
			else if (mem.energyCapacityAvailable < (MAX_CREEP_SIZE / 2) * (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE])) {
				baseHealPerTower -= 50;
			}
		}

		// Dead room?
		if ((mem.hostileCreepOwners || []).length == 0) {
			baseHealPerTower -= 50;
		}
		if (mem.DT < 0.5) {
			baseHealPerTower -= 50;
		}

		// No attack intents have gone out in a while
		if ((mem.roomIsDefending || 1) < 1e-6) {
			baseHealPerTower -= 100;
		}
		// No walls???
		if ((mem.numRamps || 0) + (mem.numWalls || 0) == 0) {
			baseHealPerTower -= 100;
			// Give it a go at least
			if (!mem.numAttacksFailed && !mem.numAttacksFizzled) {
				baseHealPerTower -= 100;
			}
		}

		// No energy???
		if ((mem.trmE || 0) + (mem.storE || 0) == 0) {
			baseHealPerTower -= 100;
			// Give it a go at least
			if (!mem.numAttacksFailed && !mem.numAttacksFizzled) {
				baseHealPerTower -= 100;
			}
		}


		let towersShotRecently = (Game.time - (mem.towerLastShot || 0) < 1500)
		let towersShotSemiRecently = (Game.time - (mem.towerLastShot || 0) < 3000)
		let towersShotSemiSemiRecently = (Game.time - (mem.towerLastShot || 0) < 6000)



		// No towers...
		if ((mem.towerShootsAttack < 1e-30 && !mem.creepCombatPartsRanged && !mem.creepCombatPartsAttack && mem.DT < 1e-30 && !towersShotRecently) || !mem.twrX || !mem.twrX.length) {
			baseHealPerTower -= 400;
		}
		else {
			if (!towersShotRecently) {		
				let anyHostileCreeps = (mem.hostileCreepOwners || []).length 

				let numEmpty = 0;
				for (let towerIdx in mem.twrX.length) {
					if (mem.twrE[towerIdx] < 10) {
						numEmpty++;
					}
					else if (!anyHostileCreeps) {
						numEmpty += 0.5
					}
				}

				let mod = towersShotSemiRecently ? 0.5 : (towersShotSemiSemiRecently ? 0.75 : 1);

				if (!anyHostileCreeps) {
					if (numEmpty == mem.twrX.length) {
						baseHealPerTower -= 200 * mod;
					}
					else {
						baseHealPerTower -= 100 * mod * numEmpty / mem.twrX.length;
					}
				}
				else {
					if (numEmpty == mem.twrX.length) {
						baseHealPerTower -= 80 * mod;
					}
					else {
						baseHealPerTower -= 40 * mod * numEmpty / mem.twrX.length;
					}
				}
			}


			// Easier to deal with as they're predictable. 
			if (mem.towerShootsWithFocus > 0.999) {
				baseHealPerTower -= 10;
			}

			// Even easier if we can predict who they shoot, it's gameable (ie. we can just retreat), and we have a lot of squads
			let scale = 1;

			if (global.roomAssaultCounts[this.memory.targetRoomName]) {
				scale += (global.roomAssaultCounts[this.memory.targetRoomName].assaultCount || 0);
			}
			if (mem.towerShootsAtClosest > 0.999) {
				baseHealPerTower -= 10 * scale;
			}
			if (mem.towerShootsAtStrongholdMax > 0.999) {
				baseHealPerTower -= 10 * scale;	
			}

			let exits = Game.map.describeExits(this.memory.targetRoomName);
			let maxTowerDamage = mem.maxTowerDamage;

			for (let exitDir in exits) {
				if (exits[exitDir] == this.memory.bestSetupRoom) {
					let idx = Math.round((parseInt(exitDir) - 1) / 2);

					if (mem.maxTowerDamageAtOuterWallByEdge && mem.lowestOuterWallByEdge) {
						let t1 = 5e6 / ((mem.advBlkDmg || 0) * 3 + 1)
						let t2 = 3e6 / ((mem.advBlkDmg || 0) * 3 + 1)
						// Not going to break through this wave.
						if (mem.lowestOuterWallByEdge[idx] > t1) {
							maxTowerDamage = mem.maxTowerDamageAtOuterWallByEdge[idx];
						}
						else if (mem.lowestOuterWallByEdge[idx] > t2) {
							maxTowerDamage = 0.5 * (mem.maxTowerDamage + mem.maxTowerDamageAtOuterWallByEdge[idx]);
						}
					}
					else {
						if (mem.lowestOuterWall !== undefined && mem.maxTowerDamageAtOuterWall !== undefined) {
							// Not going to break through this wave.
							if (mem.lowestOuterWall > 5e6) {
								maxTowerDamage = mem.maxTowerDamageAtOuterWall;
							}
							else if (mem.lowestOuterWall > 3e6) {
								maxTowerDamage = 0.5 * (mem.maxTowerDamage + mem.maxTowerDamageAtOuterWall);
							}
						}
					}
				}
			}

			if (maxTowerDamage > 2000) {
				baseHealPerTower += (maxTowerDamage - 2000) / 20
			}
		}


		if (!mem.invCH) {			
			if (!mem.trmX) {
				if ((mem.storE || 0) < 1000) {
					baseHealPerTower -= 20;
				}
				else {
					baseHealPerTower -= 10;
				}
			}
			if ((mem.storE || 0) + (mem.trmE || 0) < 1000) {
				baseHealPerTower -= 20;
			}
			if ((mem.storE || 0) + (mem.trmE || 0) === 0) {
				baseHealPerTower -= 20;
			}
		}

		if (mem.towerShootsAttack < 0.001)  {
			baseHealPerTower -= 20;
		}
		else if (mem.towerShootsAttack < 0.01)  {
			baseHealPerTower -= 10;
		}


		// if (baseHealPerTower > ROOM_ASSAULT_MAX_HEAL_PER_TOWER) {
		// 	baseHealPerTower = ROOM_ASSAULT_MAX_HEAL_PER_TOWER;
		// }

		if (mem.invCL) {
			console.log("getMaxHealPerTowerNeeded", mem.invCL, this.memory.targetRoomName, baseHealPerTower)
		}

		return Math.max(0, baseHealPerTower);
	}


	requestRambo() {
		let parentRoom = Game.rooms[this.memory.sourceRoomName]

		let spawns = parentRoom.find2(FIND_MY_SPAWNS);

		// Oh. Crap.
		if (spawns.length == 0) return;

		let spawn = spawns[0];

		// parentRoom, targetRooms, useBoosts, useToughBoost, overrideRangedParts, overrideHealParts, forceMaxSize, escalation
		// 29/03/20, testing this, accidently had boosts not working
		let ret = creepCreator.createRambo(parentRoom, [this.memory.targetRoomName], !this.memory.restrictBoosts, this.memory.boosted >= 3, undefined, undefined, true)

		if (ret.body.length > 0) {
			console.log(this.memory.type, "RAMBO spawning for", this.memory.targetRoomName)
			this.spawnCreep("ranged", ret.body, ret.boosts, -1, spawn, false, {})
			return true
		}
		else {
			console.log("No RAMBO for", this.memory.targetRoomName)

		}
	}


	requestSpawns(restrictBoosts, refresh) {
		// this.memory.restrictBoosts = restrictBoosts;
		if (Memory.season && Memory.rooms[this.memory.targetRoomName].rcl == 8 && 
			Memory.rooms[this.memory.targetRoomName].twrX.length == 6 && 
			// (this.memory.targetRoomName != "W9S2" || (Memory.rooms[this.memory.targetRoomName].safeModeCooldown || 0) < 5000) && 
			Memory.rooms[this.memory.targetRoomName].hasTerminal) {


			this.memory.fTick = Game.time
			this.memory.fRefreshRate = 1000
			Memory.rooms[this.memory.targetRoomName].missionFailList[this.memory.type] = Game.time;
			console.log("Assaults disabled")
			return false
		}
		// if (Memory.season) {
		// 	if (Memory.rooms[this.memory.targetRoomName].owner == "QzarSTB" && )
		// }


		global.roomAssaultCounts = global.roomAssaultCounts || {};
		global.roomAssaultCounts[this.memory.targetRoomName] = global.roomAssaultCounts[this.memory.targetRoomName] || {};

		let assaultCount = (global.roomAssaultCounts[this.memory.targetRoomName].assaultCount || 0);

		// They're bringing in stuff from elsewhere. The more guys we have the more we care. 
		if (this.memory.type != MISSION_FORMATION_REMOTE_DECON && 
			this.memory.type != MISSION_STRONGHOLD_ASSAULT && 
			this.memory.type != MISSION_ROOM_HEAVY_FORMATION_HOLD && 
			this.memory.type != MISSION_STRONGHOLD_MEGA_ASSAULT) {
			if (Memory.rooms[this.memory.targetRoomName].DT > 0.0001 && (Memory.rooms[this.memory.targetRoomName].roomIsDefending || 1) > 0.0001 && (Memory.rooms[this.memory.targetRoomName].percentLocalDefense || 1) < Math.min(0.9, 0.4 + 0.1 * assaultCount)) {
				RoomHeavyCreepClear.requestHeavyCreepBorderClear(this.memory.targetRoomName);
			}
		}

		let allowedPCs = (this.memory.type != MISSION_FORMATION_REMOTE_DECON && 
						  this.memory.type != MISSION_ROOM_HEAVY_FORMATION_HOLD && 
						  !restrictBoosts && 
						  Memory.rooms[this.memory.targetRoomName].DT > 0.0001 && (Memory.rooms[this.memory.targetRoomName].roomIsDefending || 1) > 0.0001 && 
						  (Memory.rooms[this.memory.targetRoomName].invCL >= 4 || Memory.rooms[this.memory.targetRoomName].powerEnabled || Memory.rooms[this.memory.targetRoomName].controllerExposedToEdge[Math.round((parseInt(this.memory.bestExitDir) - 1) / 2)]))

		if (!Memory.rooms[this.memory.targetRoomName].twrX || Memory.rooms[this.memory.targetRoomName].twrX.length == 0) {
			allowedPCs = false;
		}


		if (allowedPCs) {
			let validPowerCreeps = [];

			this.memory.expectedMaxPowerCreepDisruptTowerLevel = 0

			// Can we get a power creep involved?
			if ((this.memory.maxPowerCreepDisruptTowerLevel || 0) == 0) {				
				if (Game.rooms[this.memory.sourceRoomName].effectiveLevel == 8 && Game.rooms[this.memory.sourceRoomName].powerSpawn && (this.memory.routeLength || 10) < 10) {
					// Can we get power creeps
					for (let powerCreepName in Game.powerCreeps) {
						let powerCreep = Game.powerCreeps[powerCreepName]
						if (powerCreep && 
							powerCreep.room && 
							powerCreep.memory.aggressive && 
							powerCreep.memory.ID && 
							powerCreep.memory.targetRoom == this.memory.targetRoomName && 
							powerCreep.powers[PWR_DISRUPT_TOWER]) {
							validPowerCreeps.push(powerCreep)
							this.memory.expectedMaxPowerCreepDisruptTowerLevel = Math.max(this.memory.expectedMaxPowerCreepDisruptTowerLevel, powerCreep.powers[PWR_DISRUPT_TOWER].level)
							continue
						}

						if (!powerCreep || !powerCreep.room || !powerCreep.memory.aggressive || powerCreep.level == 0 || powerCreep.memory.ID) {
							continue;
						}

						// Nice
						if (powerCreep.memory.homeRoom === this.memory.sourceRoomName && powerCreep.powers[PWR_DISRUPT_TOWER]) {
							let dist = safeRoute.getSafeRouteCost(powerCreep.room.name, this.memory.sourceRoomName, true)

							if (dist < 4) {
								validPowerCreeps.push(powerCreep)
								this.memory.expectedMaxPowerCreepDisruptTowerLevel = Math.max(this.memory.expectedMaxPowerCreepDisruptTowerLevel, powerCreep.powers[PWR_DISRUPT_TOWER].level)								
							}
						}
					}

					if (validPowerCreeps.length == 0 || this.memory.expectedMaxPowerCreepDisruptTowerLevel == 0) {
						if ((this.memory.routeLength || 10) < 10) {							
							Memory.combatManager.requestedPowerCreeps = Memory.combatManager.requestedPowerCreeps || {}
							Memory.combatManager.requestedPowerCreeps[this.memory.sourceRoomName] = Game.time
						}
					}
				}
			}
		}

		// Against strong players with power enabled, don't go in unless I have PCs (MMO only)
		if (!refresh && 
			allowedPCs &&
			!Memory.rooms[this.memory.targetRoomName].invCL &&
			!this.memory.expectedMaxPowerCreepDisruptTowerLevel &&
			Memory.rooms[this.memory.targetRoomName].powerEnabled && 
			intelAI.strugglingToKillRooms(Memory.rooms[this.memory.targetRoomName].owner) > 10 && 
			!Memory.privateServer && 
			!Memory.swc && 
			!Memory.botArena && 
			!Memory.timedRound && 
			!Memory.season) {
			return false
		}

		// Level 5 strongholds are beasts. Just don't try without PCs. It's just not worth it.
		if (!refresh && (this.memory.type === MISSION_STRONGHOLD_ASSAULT || this.memory.type === MISSION_STRONGHOLD_MEGA_ASSAULT) && Memory.rooms[this.memory.targetRoomName].invCL == 5 && !this.memory.expectedMaxPowerCreepDisruptTowerLevel) {
			console.log("Won't take level 5s without PCs")
			return false;
		}

		let ret = super.requestSpawns(this.getMaxHealPerTowerNeeded(), restrictBoosts ? false : true, restrictBoosts, refresh);

		//
		if (ret) {
			if (Memory.rooms[this.memory.targetRoomName] && Memory.rooms[this.memory.targetRoomName].owner) {
				Memory.attackFocus[Memory.rooms[this.memory.targetRoomName].owner] += 4 * Math.sqrt((this.memory.boosted || 0) + 1) * ((this.memory.boosted || 0) + 1)
			}

			// Want to kill anyone trying to get to the controller
			let doneRambo = false
			if (this.memory.tryingLowControllerPush) {
				doneRambo = this.requestRambo()
			}

			this.memory.maxPowerCreepDisruptTowerLevel = 0

			if (allowedPCs) {
				this.memory.powerCreepMissionID = RoomAssaultPowerSupport.requestPowerCreepSupport(this, ((this.memory.type === MISSION_STRONGHOLD_ASSAULT || this.memory.type === MISSION_STRONGHOLD_MEGA_ASSAULT) && Memory.rooms[this.memory.targetRoomName].invCL < 5) ? 1 : Infinity) || 0;


				if (this.memory.powerCreepMissionID) {
					let powerCreepMission = missionInfo.findMissionForID(this.memory.powerCreepMissionID, MISSION_ROOM_POWER_ASSAULT);

					if (powerCreepMission) {					
						for (let powerCreepName of powerCreepMission.assignedPowerCreeps) {
							let powerCreep = Game.powerCreeps[powerCreepName]

							if (powerCreep.powers[PWR_DISRUPT_TOWER]) {
								this.memory.maxPowerCreepDisruptTowerLevel = Math.max(this.memory.maxPowerCreepDisruptTowerLevel, powerCreep.powers[PWR_DISRUPT_TOWER].level)
							}
						}
					}
				}
				// Maybe somebody else is doing it
				else {
					for (let powerCreepName in Game.powerCreeps) {
						let powerCreep = Game.powerCreeps[powerCreepName]
						if (!powerCreep || !powerCreep.room || !powerCreep.memory.ID || !powerCreep.memory.aggressive || powerCreep.level == 0 || (powerCreep.memory.ID && powerCreep.memory.targetRoom != this.memory.targetRoomName)) {
							continue;
						}
						if (powerCreep.powers[PWR_DISRUPT_TOWER]) {
							this.memory.maxPowerCreepDisruptTowerLevel = Math.max(this.memory.maxPowerCreepDisruptTowerLevel, powerCreep.powers[PWR_DISRUPT_TOWER].level)
						}
					}	
				}
			}
			if (this.memory.type != MISSION_FORMATION_REMOTE_DECON && 
				this.memory.type != MISSION_STRONGHOLD_ASSAULT && 
				this.memory.type != MISSION_ROOM_HEAVY_FORMATION_HOLD && 
				this.memory.type != MISSION_STRONGHOLD_MEGA_ASSAULT) {
				if (this.memory.type != MISSION_MEGA_ASSAULT && (this.memory.externalTowers2 || this.memory.externalSpawns2) && Game.rooms[this.memory.targetRoomName] && Game.rooms[this.memory.targetRoomName].towers.length) {
					if (!doneRambo) doneRambo = this.requestRambo();	
				}
				// Send out the combat engineers
				if (this.memory.maxBoostLevel >= 3) {
					Memory.rooms[this.memory.sourceRoomName].roadRequests = Memory.rooms[this.memory.sourceRoomName].roadRequests || [];
					Memory.rooms[this.memory.sourceRoomName].roadRequests.push({pos: this.memory.setupPos, t: Game.time})
				}
			}


			if (this.memory.type == MISSION_ROOM_ASSAULT && !this.memory.keepFormation && Game.rooms[this.memory.targetRoomName]) {
				let room = Game.rooms[this.memory.targetRoomName];
				let parentRoom = Game.rooms[this.memory.sourceRoomName];
				let loot = 0;
				if (room.storage && !Memory.rooms[this.memory.targetRoomName].storR) {
					loot += room.storage.store.getUsedCapacity()
					loot -= room.storage.store[RESOURCE_ENERGY]
				}
				if (room.terminal && !Memory.rooms[this.memory.targetRoomName].trmR) {
					loot += room.terminal.store.getUsedCapacity()
					loot -= room.terminal.store[RESOURCE_ENERGY]
				}

				for (let ruin of room.find(FIND_RUINS)) {
					if (ruin.store) {
						loot += ruin.store.getUsedCapacity()
						loot -= ruin.store[RESOURCE_ENERGY]
					}
				}
				for (let resource of room.find(FIND_DROPPED_RESOURCES)) {
					if (resource.resourceType != RESOURCE_ENERGY) {
						loot += resource.amount
					}
				}

				Memory.rooms[this.memory.targetRoomName].loot = Math.max((Memory.rooms[this.memory.targetRoomName].loot || 0), loot);
				let spawns = parentRoom.find2(FIND_MY_SPAWNS);
				let spawn = spawns[0];		

				if (spawn && loot) {
					let numLooters = Math.min(6, Math.ceil(Math.ceil(loot / (25 * CARRY_CAPACITY)) / Math.ceil(1500 / (6 * this.memory.routeLength * 50))))

					for (let i = 0; i < numLooters; i++) {
						spawn.addPrioritySpawn("lootFetcher", {targetRoom: this.memory.targetRoomName});
					}
				}
			}
		}

		return ret;
	}


	spawnCreep(role, body, boosts, formationPos, spawn, inFormation, extraMemory) {
		Memory.lastBoostedAssaultInfo = Memory.lastBoostedAssaultInfo || {}
		Memory.lastBoostedAssaultInfo[Math.ceil(this.memory.boosted)] = Game.time;

		return super.spawnCreep(role, body, boosts, formationPos, spawn, inFormation, extraMemory)
	}

	get targetRoomName() {
		return this.memory.targetRoomName;
	}
}


module.exports = RoomAssaultMission