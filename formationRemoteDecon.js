"use strict";

const RoomAssaultMission = require('roomAssault')

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');
const intelAI = require('intelAI');
const roomIntel = require('roomIntel');
const formationCreator = require('formationCreator');

const utf15 = require('./utf15');
const Codec = utf15.Codec;


class FormationRemoteDecon extends RoomAssaultMission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.squadSize = 4;
		memory.mask = [[0,0],[1,0],[0,1],[1,1]];

		memory.type = memory.type || MISSION_FORMATION_REMOTE_DECON;

		super(memory, sourceRoomName, targetRoomName, createNew, priority);

	}

	tick() {
		// Not tracked by roomIntel
		let mem = Memory.rooms[this.memory.targetRoomName];
		if (Game.rooms[this.memory.targetRoomName]) {
			let room = Game.rooms[this.memory.targetRoomName];
			mem.wallHP = 0;
			mem.rampHP = 0;

			let defensiveStructures = room.ramparts.concat(room.constructedWalls);

			for (let structure of defensiveStructures) {
				if (structure.structureType == STRUCTURE_WALL && structure.hits) {
					mem.wallHP += structure.hits;
				}
				else if (structure.structureType == STRUCTURE_RAMPART) {
					mem.rampHP += structure.hits;
				}
			}
		}

		super.tick();
	}

	getBestTarget() {
		// Base heuristic on distance and expected damage. Path finding will find a reasonable way through the walls.
		// Returns an object with x and y properties.
		var bestScore = Infinity;
		var bestTarget;

		if (!Memory.rooms[this.memory.targetRoomName].navigationByMask) {
			roomIntel.calcNavigableByMask(this.memory.targetRoomName, this.memory.mask, true);
		}

		let mask = JSON.stringify(this.memory.mask);
		let maskNavigation = Memory.rooms[this.memory.targetRoomName].navigationByMask[mask];

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


		var targetPositions = [];
		if (Game.rooms[this.memory.targetRoomName]) {
			var room = Game.rooms[this.memory.targetRoomName];
			let hostileStructures = room.controller.pos.findInRange(FIND_STRUCTURES, 1, {
				filter: function(object) {
					return object.structureType != STRUCTURE_ROAD && object.structureType != STRUCTURE_CONTAINER && object.structureType != STRUCTURE_CONTROLLER;
				}
			});

			for (var structure of hostileStructures) {
				let mask = JSON.stringify(this.memory.mask);
				let maskNavigation = Memory.rooms[this.memory.targetRoomName].navigationByMask[mask];

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

				targetPositions.push({"x": structure.pos.x, "y": structure.pos.y})
			}

			// Kill them all
			if (targetPositions.length == 0) {
				let hostileStructures = room.find(FIND_STRUCTURES, {
					filter: function(object) {
						return object.structureType != STRUCTURE_ROAD && object.structureType != STRUCTURE_CONTAINER && object.structureType != STRUCTURE_CONTROLLER;
					}
				});

				for (var structure of hostileStructures) {
					let mask = JSON.stringify(this.memory.mask);
					let maskNavigation = Memory.rooms[this.memory.targetRoomName].navigationByMask[mask];

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

					targetPositions.push({"x": structure.pos.x, "y": structure.pos.y})
				}
			}
		}


		let dangerousCreeps = [];
		if (Game.rooms[this.memory.targetRoomName]) {
			let room = Game.rooms[this.memory.targetRoomName];
			dangerousCreeps = room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK]);
		}

		for (var targetPosition of targetPositions) {
			var rangeToEdge;
			if 		(this.memory.bestExitDir == TOP)	 rangeToEdge = targetPosition.y;
			else if (this.memory.bestExitDir == LEFT)	 rangeToEdge = targetPosition.x;
			else if (this.memory.bestExitDir == BOTTOM)	 rangeToEdge = 49 - targetPosition.y;
			else if (this.memory.bestExitDir == RIGHT)	 rangeToEdge = 49 - targetPosition.x;

			// Score is based on tower damage and how far we have to move.
			// Minimize the score.
			var score = 0;


			// Scale based on potential
			for (let dangerCreep of dangerousCreeps) {
				if (dangerCreep.pos.getRangeTo(targetPosition.x, targetPosition.y) < 3) {
					let hostileParts = dangerCreep.getBoostModifiedCombatParts(true);

					score += hostileParts.numAttack * 30;
					score += hostileParts.numRanged * 40;
				}
			}

			if (Game.rooms[this.memory.targetRoomName]) {
				let pos = new RoomPosition(targetPosition.x, targetPosition.y, this.memory.targetRoomName);
				let myCreeps = pos.findInRange(FIND_MY_CREEPS, 1);

				for (let creep of myCreeps) {
					let inThisMission = false;
					for (let formation of this.memory.formations) {
						for (let formationCreepName of formation) {
							if (formationCreepName == creep.name) {
								inThisMission = true;
								continue;
							}
						}
						if (inThisMission) {
							break;
						}
					}
					if (!inThisMission) {
						score += 10;
					}

				}
			}

			// We lose a bunch of healing in this case
			if (rangeToEdge < 2) {
				score += 200;
			}

			score *= (0.9 + Math.random() * 0.2);

			if (score < bestScore) {
				bestScore = score;
				bestTarget = targetPosition;
			}
		}

		return bestTarget;
	}


	// Doesn't need a complex plan
	requestSpawns(refresh) {
		var parentRoom = Game.rooms[this.memory.sourceRoomName]
		var spawns = parentRoom.find2(FIND_MY_SPAWNS);
		// Oh. Crap.
		if (spawns.length == 0) return;

		this.memory.closeCombat = 1;
		this.memory.directional = 1;

		var spawn = spawns[0];

		let danger = formationCreator.getRoomRouteDangerous(this.memory.sourceRoomName, this.memory.bestSetupRoom, Memory.rooms[this.memory.targetRoomName], 0)

		let eCap = parentRoom.energyCapacityAvailable;

		let deconCount = Math.min(Math.floor(eCap / (4 * BODYPART_COST[WORK] + BODYPART_COST[RANGED_ATTACK] + 5 * BODYPART_COST[MOVE])), Math.floor(MAX_CREEP_SIZE / 10));
		let attackCount = Math.min(Math.floor(eCap / (4 * BODYPART_COST[ATTACK] + BODYPART_COST[RANGED_ATTACK] + 5 * BODYPART_COST[MOVE])), Math.floor(MAX_CREEP_SIZE / 10));
		let healCount = Math.min(Math.floor(eCap / (4 * BODYPART_COST[HEAL] + BODYPART_COST[RANGED_ATTACK] + 5 * BODYPART_COST[MOVE])), Math.floor(MAX_CREEP_SIZE / 10));

		let bodyA = [];
		let bodyD = [];
		let bodyH = [];

		if (danger.roomIsDangerous || danger.routeIsDangerous) {
			for (var i = 0; i < deconCount * 4; i++) {
				bodyA.push(ATTACK)
			}
			for (var i = 0; i < deconCount; i++) {
				bodyA.push(RANGED_ATTACK)
			}
			for (var i = 0; i < deconCount * 5; i++) {
				bodyA.push(MOVE)
			}
		}
		else {
			for (var i = 0; i < deconCount * 4; i++) {
				bodyD.push(WORK)
			}
			for (var i = 0; i < deconCount; i++) {
				bodyD.push(RANGED_ATTACK)
			}
			for (var i = 0; i < deconCount * 5; i++) {
				bodyD.push(MOVE)
			}
		}

		for (var i = 0; i < healCount; i++) {
			bodyH.push(RANGED_ATTACK)
		}
		for (var i = 0; i < Math.floor(healCount * 5 / 2); i++) {
			bodyH.push(MOVE)
		}
		for (var i = 0; i < healCount * 4; i++) {
			bodyH.push(HEAL)
		}
		for (var i = 0; i < Math.ceil(healCount * 5 / 2); i++) {
			bodyH.push(MOVE)
		}


		let formationCreepNames = []
		for (let i =0 ; i< 2; i++) {
			formationCreepNames.push(this.spawnCreep("ranged", bodyH, {}, i, spawn, true))
		}

		if (danger.roomIsDangerous || danger.routeIsDangerous) {
			for (let i =0 ; i< 2; i++) {
				formationCreepNames.push(this.spawnCreep("tank", bodyA, {}, i+2, spawn, true))
			}
		}
		else {
			for (let i =0 ; i< 2; i++) {
				formationCreepNames.push(this.spawnCreep("deconstructor", bodyD, {}, i+2, spawn, true))
			}
		}

		this.memory.formations.push(formationCreepNames);
		this.memory.formationTypes = this.memory.formationTypes || [];
		this.memory.formationTypes.push("d");

		let countR = Math.min(Math.floor(parentRoom.energyCapacityAvailable / (2 * 150 + 3 * 50 + 1 * 250)), Math.floor(MAX_CREEP_SIZE / 6));
		let bodyR = [];

		for (var i = 0; i < countR * 2; i++) {
			bodyR.push(RANGED_ATTACK)
		}
		for (var i = 0; i < countR * 3 - 1; i++) {
			bodyR.push(MOVE)
		}

		if (countR == 8 && parentRoom.energyCapacityAvailable >= 8 * (2 * 150 + 3 * 50 + 250) + 300) {
			bodyR.push(MOVE);
			bodyR.push(HEAL);
		}

		for (var i = 0; i < countR; i++) {
			bodyR.push(HEAL)
		}

		bodyR.push(MOVE)

		let guardCount = 0;

		if (danger.roomIsDangerous) {
			guardCount++;
		}
		if (danger.routeIsDangerous) {
			guardCount++;
		}
		if (danger.routeIsVeryDangerous) {
			guardCount++;
		}

		for (var i = 0; i < guardCount; i++) {
			this.spawnCreep("ranged", bodyR, {}, undefined, spawn, false);
		}

		// Game.notify("Claimer formation remote decon " + this.memory.sourceRoomName + " " + this.memory.targetRoomName + " " + safeRoute.getSafeRouteCost(this.memory.sourceRoomName, this.memory.targetRoomName, true))

		if (!Memory.rooms[this.memory.targetRoomName].unexposedController &&
			Game.myRooms.length < Game.gcl.level &&
			parentRoom.effectiveLevel == 8 &&
			safeRoute.getSafeRouteCost(this.memory.sourceRoomName, this.memory.targetRoomName) * 50 < 0.8 * CREEP_CLAIM_LIFE_TIME) {
			// Game.notify("Claimer spawning")
			Memory.rooms[this.memory.targetRoomName].clearRoomClaim = Game.time;
			this.spawnCreep("claimer", [CLAIM, MOVE, MOVE, MOVE, MOVE, MOVE], {}, spawn)
		}


		return true
	}

	get targetRoomName() {
		return this.memory.targetRoomName;
	}
}


module.exports = FormationRemoteDecon