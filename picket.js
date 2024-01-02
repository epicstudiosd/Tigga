"use strict";

const idleCreepManager = require('idleCreepManager')
const Mission = require('missionBase')
const constants = require('constants')
const safeRoute = require('safeRoute');
const creepCreator = require('creepCreator');
const roomIntel = require('roomIntel');
const util  = require('util');

const mapVisuals = require("mapVisuals")


class Picket extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_PICKET;

		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		if (createNew && this.isActive()) {
			memory.fRefreshRate = 3000;
			memory.targetRoomName = targetRoomName;


			memory.routeCost = safeRoute.getSafeRouteCost(sourceRoomName, targetRoomName, true)
			memory.interestingCreepsSeen = []
			memory.interestingCreepsSeenCount = 0

			memory.clearTimer = 0;

			memory.targetEnemyA = 0;
			memory.targetEnemyR = 0;
			memory.targetEnemyH = 0;

			memory.hostileOwners = {}

			// Mean
			let sumTimeDiff = 0
			for (let harass of Memory.rooms[targetRoomName].harassTracking) {
				let timeDiff = Game.time - harass.t;

				let timeMod = (1 - timeDiff / constants.HARASS_FORGET_TIME)

				sumTimeDiff += timeMod;

				memory.targetEnemyA += harass.a * timeMod;
				memory.targetEnemyR += harass.r * timeMod;
				memory.targetEnemyH += harass.h * timeMod;

				if (harass.o) {
					memory.hostileOwners[harass.o] = (memory.hostileOwners[harass.o] || 0) + (harass.a + harass.r + harass.h) * timeMod
				}
			}

			memory.targetEnemyA /= sumTimeDiff;
			memory.targetEnemyR /= sumTimeDiff;
			memory.targetEnemyH /= sumTimeDiff;

			if (Memory.rooms[targetRoomName].harassTracking.length) {				
				for (let owner in memory.hostileOwners) {
					memory.hostileOwners[owner] /= Memory.rooms[targetRoomName].harassTracking.length
				}
			}

			// Max
			for (let harass of Memory.rooms[targetRoomName].harassTracking) {
				let timeDiff = Game.time - harass.t;
				let timeMod = (1 - timeDiff / constants.HARASS_FORGET_TIME)

				memory.targetEnemyA = Math.max(memory.targetEnemyA, harass.a * timeMod);
				memory.targetEnemyR = Math.max(memory.targetEnemyR, harass.r * timeMod);
				memory.targetEnemyH = Math.max(memory.targetEnemyH, harass.h * timeMod);
			}
		}
	}

	tick() {
		if (this.isActive()) {
			if (this.memory.assignedCreeps.length) {
				this.memory.pending = 0;
				for (let creepName of this.memory.assignedCreeps) {
					if (Memory.creeps[creepName]) {
						Memory.creeps[creepName].retreat = 0;
					}
				}
			}

			if (Game.map.visual) mapVisuals.get().text("🚧", new RoomPosition(40, 10, this.memory.targetRoomName), {fontSize: 10})

			if (Math.random() < 0.001) {
				if (Memory.rooms[this.memory.targetRoomName].harassTracking) {					
					this.memory.hostileOwners = this.memory.hostileOwners || {}
					for (let harass of Memory.rooms[this.memory.targetRoomName].harassTracking) {
						let timeDiff = Game.time - harass.t;

						let timeMod = (1 - timeDiff / constants.HARASS_FORGET_TIME)

						if (harass.o) {
							this.memory.hostileOwners[harass.o] = (this.memory.hostileOwners[harass.o] || 0) + (harass.a + harass.r + harass.h) * timeMod
						}
					}

					if (Memory.rooms[this.memory.targetRoomName].harassTracking.length) {				
						for (let owner in this.memory.hostileOwners) {
							this.memory.hostileOwners[owner] /= Memory.rooms[this.memory.targetRoomName].harassTracking.length
						}
					}
				}
			}


			let myCreepCostPerTick = 0 

			for (let creepName of this.memory.assignedCreeps) {
				let creep = Game.creeps[creepName]
				if (!creep || creep.spawning) continue

				myCreepCostPerTick += (creep.mem.bC || util.getECostForCreep(creep)) / CREEP_LIFE_TIME
			}

			for (let owner in (this.memory.hostileOwners || {})) {
				Memory.stats.globalHarassTracking[owner] = (Memory.stats.globalHarassTracking[owner] || 0) + this.memory.hostileOwners[owner] * myCreepCostPerTick
			}


			var room = Game.rooms[this.memory.targetRoomName];
			if (room) {
				// Combat creeps
				let interestingCreeps = room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true)

				let numA = 0
				let numR = 0
				let numH = 0

				let numSources = roomIntel.getEffectiveNumSources(this.memory.targetRoomName)

				for (let creep of interestingCreeps) {
					if (creep.owner.username == "Source Keeper") {
						continue
					}
					if (!this.memory.interestingCreepsSeen.includes(creep.id)) {
						// Oooh, that's interesting
						this.memory.interestingCreepsSeen.push(creep.id);
						this.memory.interestingCreepsSeenCount++;
					}

					numA += creep.getNumOfBodyPart(ATTACK)
					numR += creep.getNumOfBodyPart(RANGED_ATTACK)
					numH += creep.getNumOfBodyPart(HEAL)

					Memory.stats.globalHarassTracking[creep.owner.username] = (Memory.stats.globalHarassTracking[creep.owner.username] || 0) + numSources * 10 / interestingCreeps.length;

				}

				if (numA || numR || numH) {					
					this.memory.targetEnemyA = 0.999 * this.memory.targetEnemyA + 0.001 * numA
					this.memory.targetEnemyR = 0.999 * this.memory.targetEnemyR + 0.001 * numR
					this.memory.targetEnemyH = 0.999 * this.memory.targetEnemyH + 0.001 * numH
					this.memory.clearTimer = 0

					for (let creepName of this.memory.assignedCreeps) {
						let creep = Game.creeps[creepName]
						if (!creep) continue

						creep.mem.targetRoom = this.memory.targetRoomName
					}
				}
				else {
					this.memory.clearTimer = (this.memory.clearTimer || 0) + 1

					// Wander
					if (this.memory.clearTimer > 100 && Math.random() < 0.05) {
						let newTargetRoom = idleCreepManager.getNewRoomToProtect(undefined, this.memory.targetRoomName, true, [], 2)			

						for (let creepName of this.memory.assignedCreeps) {			
							let creep = Game.creeps[creepName]
							if (!creep) continue

							creep.mem.targetRoom = newTargetRoom || this.memory.targetRoomName
						}
					}
				}
			}

			// if (!this.memory.pending) {
				global.inTickObject.activePicketMissions = global.inTickObject.activePicketMissions || [];
				global.inTickObject.activePicketMissions.push(this.memory.targetRoomName)
			// }

			if (Memory.rooms[this.memory.targetRoomName] && Memory.rooms[this.memory.targetRoomName].meanHarvestYeild) {
				for (let creepName of this.memory.assignedCreeps) {
					let creep = Game.creeps[creepName]
					if (!creep || creep.spawning) continue

					Memory.rooms[this.memory.targetRoomName].meanHarvestYeild -= myCreepCostPerTick * (1 - Math.exp(-(1/3000.)))
				}
			}


			// Relaunch
			if (Game.time >= this.memory.nextLaunchTick && 
				Game.rooms[this.memory.targetRoomName] && 
				Game.rooms[this.memory.sourceRoomName]) {
				let sourceRoom = Game.rooms[this.memory.sourceRoomName]
				let protectRooms = global.defenseRooms[this.memory.sourceRoomName] || sourceRoom.goodRooms.concat(sourceRoom.protectRooms).concat(sourceRoom.buildRooms)
				if (protectRooms.includes(this.memory.targetRoomName)) {
					let totalTarget = this.memory.targetEnemyA + this.memory.targetEnemyR + this.memory.targetEnemyH

					let targetInterstingCreepsCount = Math.min(0.5, (totalTarget / 10)) * this.memory.effectiveNumLaunches


					if (this.memory.interestingCreepsSeenCount > targetInterstingCreepsCount) { // Try to see one creep every two launches.
						let effectiveTeam = false;
						for (var creepName of this.memory.assignedCreeps) {
							var creep = Game.creeps[creepName];
							if (creep) {
								if (creep.hasActiveBodypart(ATTACK) || creep.hasActiveBodypart(RANGED_ATTACK)) {
									effectiveTeam = true;
									break;
								}
							}
						}

						if (effectiveTeam && !this.renewRestricted()) {
							if (this.requestSpawns()) {
								const alpha = Math.exp(-(1/8.));
								this.memory.interestingCreepsSeenCount = alpha * this.memory.interestingCreepsSeenCount
								this.memory.effectiveNumLaunches = alpha * (this.memory.effectiveNumLaunches + 1)

								this.memory.numLaunches += 1;
								this.memory.lastLaunchTick = Game.time;
							}
						}
					}
				}
			}

			if (this.memory.assignedCreeps.length == 0 && this.memory.spawningCreeps.length == 0) {
				if (Game.time < this.memory.nextLaunchTick) {
					this.memory.fTick = Game.time;
					this.memory.f++;
					this.missionComplete(false);
				}
				else {
					this.memory.s++;
					this.missionComplete(true);
				}
				return;
			}
		}
		super.tick();
	}

	requestSpawns() {
		let parentRoom = Game.rooms[this.memory.sourceRoomName]

		let spawns = parentRoom.find2(FIND_MY_SPAWNS);

		// Oh. Crap.
		if (spawns.length == 0) return;

		let spawn = spawns[0];


		// Ranged + heal
		let numRangedRequired = Math.ceil(this.memory.targetEnemyR * 0.25 + this.memory.targetEnemyA * 0.25 + 1.25 * this.memory.targetEnemyH * (HEAL_POWER / RANGED_ATTACK_POWER))
		let numHealRequired = Math.ceil((this.memory.targetEnemyR + this.memory.targetEnemyA) * (RANGED_ATTACK_POWER / HEAL_POWER))

		let numRanged = numRangedRequired;
		let numHeal = numHealRequired;

		let cost = numRanged * (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE]) + numHeal * (BODYPART_COST[HEAL] + BODYPART_COST[MOVE])

		let numCreeps = Math.ceil(Math.max((numRangedRequired + numHealRequired) * 2 / MAX_CREEP_SIZE, cost / parentRoom.energyCapacityAvailable))

		while ((numRanged + numHeal) * 2 > MAX_CREEP_SIZE || cost > parentRoom.energyCapacityAvailable) {
			numRanged--;
			cost -= (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE])
			if ((numRanged + numHeal) * 2 <= MAX_CREEP_SIZE && cost <= parentRoom.energyCapacityAvailable) break;
			numRanged--;
			cost -= (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE])
			if ((numRanged + numHeal) * 2 <= MAX_CREEP_SIZE && cost <= parentRoom.energyCapacityAvailable) break;
			numHeal--;
			cost -= (BODYPART_COST[HEAL] + BODYPART_COST[MOVE])
		}

		if (numRanged <= 0 || numHeal <= 0) return false;

		if (cost * numCreeps > (Memory.usedRemotes.includes(this.memory.targetRoomName) ? 5 : 1) * CREEP_LIFE_TIME) return false;
		
		let body = [];

		for (var i = 0; i < numRanged; i++) {
			body.push(RANGED_ATTACK)
		}
		for (var i = 0; i < numRanged - 1; i++) {
			body.push(MOVE)
		}
		for (var i = 0; i < numHeal; i++) {
			body.push(MOVE)
		}
		for (var i = 0; i < numHeal; i++) {
			body.push(HEAL)
		}
		body.push(MOVE)

		var idleCreep = idleCreepManager.getIdleCreepForBody(body, parentRoom);
		if (idleCreep) {
			this.assignCreep(idleCreep);
			this.memory.lastLaunchTick = Game.time
			this.memory.nextLaunchTick = Game.time + idleCreep.ticksToLive - this.memory.routeCost * 50 - body.length * CREEP_SPAWN_TIME - 150
			return true
		}
		else {
			let ret = this.spawnCreep("ranged", body, {}, spawn)
			this.memory.lastLaunchTick = Game.time
			this.memory.nextLaunchTick = Game.time + 1500 - this.memory.routeCost * 50 - body.length * CREEP_SPAWN_TIME - 150
			return true
		}
	}

	cleanMemory() {
		delete this.memory.routeCost
		
		delete this.memory.interestingCreepsSeen
		delete this.memory.interestingCreepsSeenCount

		delete this.memory.numLaunches
		delete this.memory.effectiveNumLaunches

		delete this.memory.nextLaunchTick


		return super.cleanMemory();
	}

	missionComplete(success) {
		this.cleanMemory()

		return super.missionComplete(success)
	}

	spawnCreep(role, body, boosts, spawn) {
		// if (Memory.rooms[this.memory.targetRoomName].meanHarvestYeild) {
		// 	Memory.rooms[this.memory.targetRoomName].meanHarvestYeild -= util.getECostForDesign(body) * (1 - Math.exp(-(1/3000.)));
		// }

		/*if (spawn.room.memory.regularHarvestRooms.includes(this.memory.targetRoomName) ||
			spawn.room.memory.doubleHarvestRooms.includes(this.memory.targetRoomName) || 
			spawn.room.memory.keeperHarvestRooms.includes(this.memory.targetRoomName)) {
			if (Memory.rooms[this.memory.targetRoomName].meanHarvestYeild !== undefined) {
				Memory.rooms[this.memory.targetRoomName].meanHarvestYeild -= util.getECostForDesign(body) * (1 - Math.exp(-(1/1500.)));
			}
		}
		else if (spawn.room.memory.goodRooms.length) {
			let diff = util.getECostForDesign(body) * (1 - Math.exp(-(1/1500.))) / spawn.room.memory.goodRooms.length
			for (let roomName of spawn.room.memory.goodRooms) {
				if (Memory.rooms[roomName].meanHarvestYeild) {
					Memory.rooms[roomName].meanHarvestYeild -= diff;
				}
			}
		}*/

		return super.spawnCreep(role, body, boosts, spawn, {targetRoom : this.memory.targetRoomName, fallbackRoom: this.memory.sourceRoomName})
	}

	assignCreep(creep) {
		super.assignCreep(creep);
		creep.memory.targetRoom = this.memory.targetRoomName
	}

	get targetRoomName() {
		return this.memory.targetRoomName;
	}
}
module.exports = Picket