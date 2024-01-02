"use strict";

const Mission = require('missionBase')

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');




class RoomSwarmMission extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_ROOM_SWARM;

		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		// If we fail, don't go again for a while. These are expensive and melt my CPU.
		memory.fRefreshRate = 50000;


		if (createNew && this.isActive()) {
			memory.targetRoomName = memory.targetRoomName || targetRoomName;
		}
	}

	tick() {
		if (this.isActive() && this.memory.setupRoomLocs && this.memory.assignedCreeps) {
			// if (this.memory.pending) {
			// 	Game.rooms[this.memory.sourceRoomName].spawningSwarm = true;
			// }
			// Well, crap, this has taken longer to spawn than expected. Go with what we've got.
			if (this.memory.pending && Game.time - this.memory.startTick > 1100) {
				this.memory.pending = false;
				for (var creepName of this.memory.assignedCreeps) {
					if (Game.creeps[creepName]) {
						Game.creeps[creepName].memory.retreat = false;
					}
				}
			}

			if (this.memory.launchCountdown <= 0) {
				this.memory.launchedAttack = true;
			}
			else if (!this.memory.pending) {
				var count = 0;
				// If 90% of creeps are withing 5 tiles of the exit direction, hit it
				for (var creepName of this.memory.assignedCreeps) {
					if (this.memory.exitDir == TOP && Game.creeps[creepName] && Game.creeps[creepName].room.name == this.memory.setupRoom && Game.creeps[creepName].pos.y < 5) {
						count++;
					}
					else if (this.memory.exitDir == LEFT && Game.creeps[creepName] && Game.creeps[creepName].room.name == this.memory.setupRoom && Game.creeps[creepName].pos.x < 5) {
						count++;
					}
					else if (this.memory.exitDir == BOTTOM && Game.creeps[creepName] && Game.creeps[creepName].room.name == this.memory.setupRoom && Game.creeps[creepName].pos.y >= 5) {
						count++;
					}
					else if (this.memory.exitDir == RIGHT && Game.creeps[creepName] && Game.creeps[creepName].room.name == this.memory.setupRoom && Game.creeps[creepName].pos.x >= 5) {
						count++;
					}
				}

				// console.log(count, this.memory.assignedCreeps.length, this.memory.setupRoomLocs.length)

				if (count > this.memory.assignedCreeps.length * .8 || count > this.memory.setupRoomLocs.length * .8) {
					this.memory.launchedAttack = true;
				}
			}

			var countdownTicked = false;
			var setupPositions = JSON.parse(JSON.stringify(this.memory.setupRoomLocs))

			for (var creepName of this.memory.assignedCreeps) {
				if (Game.creeps[creepName]) {
					Game.creeps[creepName].swarmer = true;
					Game.creeps[creepName].setupRoom = this.memory.setupRoom;
					Game.creeps[creepName].launchedAttack = this.memory.launchedAttack;
					Game.creeps[creepName].setupRoomLocs = setupPositions;

					Game.creeps[creepName].memory.targetRoom = this.memory.launchedAttack ? this.memory.targetRoomName : this.memory.setupRoom;

					if (Game.creeps[creepName].room.name == this.memory.setupRoom && !countdownTicked) {
						if (Game.creeps[creepName].room.dangerous) {
							this.memory.launchCountdown -= 4;
						}
						else {
							this.memory.launchCountdown --;
						}
						countdownTicked = true;
					}
				}
			}

			//ded
			if (this.memory.assignedCreeps.length == 0 && this.memory.spawningCreeps.length == 0) {
				this.memory.fTick = Game.time;
				this.memory.f++;
				this.missionComplete(false);
			}
			else if (Game.rooms[this.memory.targetRoomName]) {
				// They safe moded
				if (Game.rooms[this.memory.targetRoomName].controller.safeMode && Game.time - this.memory.startTick > 500) {
					this.memory.fTick = Game.time;
					this.memory.f++;
					this.missionComplete(false);
				}

				else {
					let room = Game.rooms[this.memory.targetRoomName]
					let threats = room.find2(FIND_HOSTILE_CREEPS, {
						filter: function(object) {
							return (object.owner.username != "Source Keeper");
						}
					});
					let buildings = room.find2(FIND_HOSTILE_STRUCTURES, {
						filter: function(structure) {
							return (structure.structureType != STRUCTURE_CONTROLLER);
						}
					});
					let sites = room.find2(FIND_HOSTILE_CONSTRUCTION_SITES, {
						filter: function(site) {
							return site.progress > 0;
						}
					});

					threats = threats.concat(room.find(FIND_HOSTILE_POWER_CREEPS))


					if (threats.length == 0 && buildings.length == 0 && sites.length == 0) {
						// Ok, we completed
						if (Game.time - this.memory.startTick < 500) {
							// Oh, that was quick. Not sure how this can happen tbh
							console.log("Weird fail in room swarm", this.memory.targetRoomName, Game.time, this.memory.startTick)
							this.memory.fTick = Game.time;
							this.missionComplete(false);
						}
						// Mission complete!
						else if (Game.time - this.memory.startTick > 2000) {
							this.memory.s++;
							this.missionComplete(true);
						}
					}
				}

			}
		}
		super.tick();
	}

	setupCreepPositions(numCreeps) {
		this.memory.creepCount = numCreeps;

		// Well, we'd really like to set up in a non-pain-in-the-ass place. We will have 50+ creeps.
		// Default to the room's fallback position
		this.memory.fallbackX = Memory.rooms[this.memory.sourceRoomName].fallbackX;
		this.memory.fallbackY = Memory.rooms[this.memory.sourceRoomName].fallbackY;

		var valid;

		let roomTerrain = Game.map.getRoomTerrain(this.memory.sourceRoomName);

		for (var radius = 0; radius < 20; radius++) {
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
					i = radius;
					j = offsetAmount * (offsetDirection == 1 ? -1 : 1)
				}

				valid = true;
				var blockageCount = 0;

				for (var innerX = -3; innerX <= 3; innerX++) {
					for (var innerY = -3; innerY <= 3; innerY++) {
						if (Math.abs(innerX) == 3 && Math.abs(innerY) == 3) continue;


						if (25 + i + innerX >= 48 || 25 + i + innerX < 2 || 25 + j + innerY >= 48 || 25 + j + innerY < 2) {
							valid = false;
							break;
						}

						var terrain = roomTerrain.get(25 + i + innerX, 25 + j + innerY);

						if (terrain & TERRAIN_MASK_WALL) {
							blockageCount ++;
						}
						else {
							var structs = Game.rooms[this.memory.sourceRoomName].lookForAt(LOOK_STRUCTURES, 25 + i + innerX, 25 + j + innerY);
							if (structs.length > 0) {
								for (var struct of structs) {
									if (struct.structureType != STRUCTURE_ROAD && struct.structureType != STRUCTURE_RAMPART) {
										blockageCount++;
										break;
									}
								}
							}
						}
						if (blockageCount >= 10) {
							valid = false;
							break;
						}
					}
					if (!valid) {
						break;
					}
				}

				if (valid) {
					this.memory.fallbackX = 25 + i;
					this.memory.fallbackY = 25 + j;
					break;
				}
			}
			if (valid) {
				break;
			}
		}



		// Ok, find a room to set up in.
 		var bestSetupRoom;
		var bestScore = Infinity;


		var exits = Game.map.describeExits(this.memory.targetRoomName);
		for (var exitDir in exits) {
			var exitRoom = exits[exitDir];

			let coords = util.getSectorCoords(exitRoom);

			// Don't set up in SK rooms
			if (coords.x >= 4 && coords.y >= 4 && coords.x <= 6 && coords.y <= 6) continue;
			if (Memory.rooms[exitRoom] && Memory.rooms[exitRoom].fullyConnected === 0) continue;

			var routeLength = safeRoute.getSafeRouteCost(this.memory.sourceRoomName, exitRoom, true);

			var apatureSize = 0;
			var meanPos = 0;

			let roomTerrain = Game.map.getRoomTerrain(exitRoom);

			for (var i = 1; i < 49; i++) {
				if (exitDir == TOP) {
					if (!(roomTerrain.get(i, 0) & TERRAIN_MASK_WALL)) {
						apatureSize++;
						meanPos += i;
					}
				}
				else if (exitDir == BOTTOM) {
					if (!(roomTerrain.get(i, 49) & TERRAIN_MASK_WALL)) {
						apatureSize++;
						meanPos += i;
					}
				}
				else if (exitDir == LEFT) {
					if (!(roomTerrain.get(0, i) & TERRAIN_MASK_WALL)) {
						apatureSize++;
						meanPos += i;
					}
				}
				else if (exitDir == RIGHT) {
					if (!(roomTerrain.get(49, i) & TERRAIN_MASK_WALL)) {
						apatureSize++;
						meanPos += i;
					}
				}
			}

			meanPos /= 48;

			var meanRangeToTower = 0;

			for (var towerIdx = 0; towerIdx < Memory.rooms[this.memory.targetRoomName].twrX.length; towerIdx++) {
				var towerX = Memory.rooms[this.memory.targetRoomName].twrX[towerIdx];
				var towerY = Memory.rooms[this.memory.targetRoomName].twrY[towerIdx];

				if (exitDir == TOP) {
					meanRangeToTower += Math.max(Math.abs(meanPos - towerX), towerY)
				}
				else if (exitDir == BOTTOM) {
					meanRangeToTower += Math.max(Math.abs(meanPos - towerX), 49 - towerY)
				}
				else if (exitDir == LEFT) {
					meanRangeToTower += Math.max(towerX, Math.abs(meanPos - towerY))
				}
				else if (exitDir == RIGHT) {
					meanRangeToTower += Math.max(49 - towerX, Math.abs(meanPos - towerY))
				}

			}

			meanRangeToTower /= Memory.rooms[this.memory.targetRoomName].twrX.length;

			// Ok, we have route length, length to tower and apature size.

			// Minimize the score. Who knows if this score makes any sense at all.
			var score = meanRangeToTower * 10 + (48 / apatureSize) * 10 + routeLength * 40;

			if (Memory.rooms[exitRoom] && Memory.rooms[exitRoom].reservedBy == util.getMyName()) {
				score *= 0.7;
			}
			else if (Memory.rooms[exitRoom] && Memory.rooms[exitRoom].reservedBy) {
				score *= 1.5;
			}

			let swampRatio = roomIntel.getSwampRatio(exitRoom)
			let wallRatio = roomIntel.getWallRatio(exitRoom)

			if (Memory.rooms[exitRoom]) score *= 1 + swampRatio
			if (Memory.rooms[exitRoom]) score *= 1 + wallRatio

			score *= (0.9 + Math.random() * 0.2);

			if (score < bestScore) {
				bestScore = score;
				bestSetupRoom = exitRoom;
			}
		}

		if (!bestSetupRoom) {
			this.ID = 0;
			return;
		}

		this.memory.setupRoom = bestSetupRoom;
		this.memory.launchedAttack = false;

		this.memory.setupRoomLocs = [];
		var exitDir = Game.map.findExit(bestSetupRoom, this.memory.targetRoomName);
		this.memory.exitDir = exitDir;

		roomTerrain = Game.map.getRoomTerrain(bestSetupRoom);

		var creepPositions = 0;
		for (var i = 1; i < 49; i++) {
			for (var j = 2; j < 8; j++) {
				var positionOk = true;

				for (var k = 0; k <= j; k++) {
					if (exitDir == TOP) {
						if (roomTerrain.get(i, k) & TERRAIN_MASK_WALL) {
							positionOk = false;
							break;
						}
					}
					else if (exitDir == BOTTOM) {
						if (roomTerrain.get(i, 49 - k) & TERRAIN_MASK_WALL) {
							positionOk = false;
							break;
						}
					}
					else if (exitDir == LEFT) {
						if (roomTerrain.get(k, i) & TERRAIN_MASK_WALL) {
							positionOk = false;
							break;
						}
					}
					else if (exitDir == RIGHT) {
						if (roomTerrain.get(49 - k, i) & TERRAIN_MASK_WALL) {
							positionOk = false;
							break;
						}
					}
				}

				if (positionOk) {
					if (exitDir == TOP) {
						this.memory.setupRoomLocs.push(new RoomPosition(i, j, bestSetupRoom));
					}
					else if (exitDir == BOTTOM) {
						this.memory.setupRoomLocs.push(new RoomPosition(i, 49 - j, bestSetupRoom));
					}
					else if (exitDir == LEFT) {
						this.memory.setupRoomLocs.push(new RoomPosition(j, i, bestSetupRoom));
					}
					else if (exitDir == RIGHT) {
						this.memory.setupRoomLocs.push(new RoomPosition(49 - j, i, bestSetupRoom));
					}
					creepPositions++;
				}


				if (creepPositions >= this.memory.numCreeps) break;
			}
			if (creepPositions >= this.memory.numCreeps) break;
		}

		this.memory.launchCountdown = 300;
	}

	missionComplete(success) {
		delete this.memory.setupRoomLocs;
		super.missionComplete(success);
	}

	spawnCreep(role, body, boosts, spawn) {
		super.spawnCreep(role, body, boosts, spawn, {targetRoom : this.memory.targetRoomName, fallbackRoom: this.memory.sourceRoomName, fallbackX: this.memory.fallbackX, fallbackY: this.memory.fallbackY})
	}

	assignCreep(creep) {
		super.assignCreep(creep);
		creep.memory.targetRoom = this.memory.targetRoomName
	}

	get targetRoomName() {
		return this.memory.targetRoomName;
	}
}


module.exports = RoomSwarmMission