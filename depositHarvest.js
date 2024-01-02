"use strict";

const Mission = require('missionBase')

var util = require('util');
var safeRoute = require('safeRoute');
var pathCache = require('pathCache');
var roomIntel = require('roomIntel');
var constants = require('constants');
var creepCreator = require('creepCreator');
var intelAI = require('intelAI');
const mapVisuals = require("mapVisuals")
var DepositBase = require("depositBase")

const MODE_STATIC = 0;
const MODE_ROAMING = 1;

// There are many deposits. At the start we want a team dedicated to a depsoit.
// After the cooldown rises we start wanting to wander if the deposits are close
/*function calcCooldown(harvested) {
	return Math.ceil(DEPOSIT_EXHAUST_MULTIPLY * Math.pow(harvested, DEPOSIT_EXHAUST_POW))
}

function test(hpt, ticks) {
	let harvested = 0
	let cooldown = 0
	for (let i = 0; i < ticks; i++) {
		if (cooldown == 0) {
			harvested += hpt
			cooldown = calcCooldown(harvested);
		}
		else {
			cooldown--
		}
	}
}*/
	

class DepositHarvestMission extends DepositBase {
	constructor(memory, targetRoomName, depositInfo, createNew, priority) {
		memory.type = memory.type || MISSION_DEPOSIT_HARVEST;

		memory.fRefreshRate = 50000;
		// Do this before we make our mission active.
		super(memory, targetRoomName, createNew, priority);

		if (createNew && this.isActive()) {
			memory.targetRoomName = memory.targetRoomName || targetRoomName;
			memory.depositInfo = memory.depositInfo || depositInfo;
			memory.depositType = memory.depositInfo.r;

			memory.bestDropRoom = this.getBestHaulerDropRoom(depositInfo.roomName)

			this.memory.lastLaunchTick = Game.time
			this.memory.numHaulers = 0
			this.memory.numMiners = 0

			this.memory.nearestRoomRange = Infinity

			for (let room of Game.myRooms) {
				this.memory.nearestRoomRange = Math.min(this.memory.nearestRoomRange, Game.map.getRoomLinearDistance(room.name, memory.targetRoomName))				
			}
		}
	}


	tick() {
		if (this.isActive()) {


			for (let creepName of this.memory.assignedCreeps) {
				let creep = Game.creeps[creepName]
				if (creep) {
					if (creep.mem.pairIdx !== undefined) {
						creep.mem.pairedName = this.memory.pairNames[creep.mem.pairIdx][0] == creep.name ? this.memory.pairNames[creep.mem.pairIdx][1] : this.memory.pairNames[creep.mem.pairIdx][0]
					}
				}
			}

			// Which mode are we in? Roaming or static. 
			// Should we change?
			// let currentMode = team.mode;
			// let depositInfo = this.memory.depositInfo

			// let numTiles = depositInfo.t;
			// let lastCooldown = depositInfo.lc;

			// let harvesterWork = 48;

			// let haulerCarry = 25 * CARRY_CAPACITY

			// if (!this.memory.haulerPeriod || Math.random() < 0.1) {					
			// 	let dropDist = 50 * safeRoute.getSafeRouteCost(this.memory.haulerDropRoom, depositInfo.roomName, false, true)
			// 	let numTrips = Math.floor(CREEP_LIFE_TIME / (2.2 * dropDist))

			// 	this.memory.haulerPeriod = Math.min(1500 - 4 * dropDist, (numTrips * haulerCarry * Math.max(lastCooldown + 5, 20)) / (numTiles * harvesterWork * HARVEST_DEPOSIT_POWER));
			// }

			// let haulerPeriod = this.memory.haulerPeriod
			// let aliveMiners = 0;

			let depositInfo = this.memory.depositInfo;

			if (Game.map.visual) mapVisuals.get().text("⛏️", new RoomPosition(10, 25, depositInfo.roomName), {fontSize: 10})


			if (Game.rooms[depositInfo.roomName]) {
				for (let deposit of Game.rooms[depositInfo.roomName].find(FIND_DEPOSITS)) {
					if (deposit.pos.x == depositInfo.x && deposit.pos.y == depositInfo.y) {
						depositInfo.lc = deposit.lastCooldown
						depositInfo.ttd = deposit.ticksToDecay
						break
					}
				}
			}

			let teamNames = []
			for (let creepName of this.memory.assignedCreeps) {
				let creep = Game.creeps[creepName]
				if (creep && creep.mem.role === "depositMiner") {
					teamNames.push(creep.name)
					if (!creep.mem.maxRenewTime) {
						creep.mem.maxRenewTime = Game.time + 400
					}
				}
			}
			for (let creepName of this.memory.assignedCreeps) {
				let creep = Game.creeps[creepName]
				if (creep && creep.mem.role === "depositMiner") {
					creep.mem.teamCreepNames = teamNames
				}
			}

			// Want 0 haulers until 1 miner, then 2 haulers, then at least as many haulers as miners
			let roomRangeMod = Math.max(3, (this.memory.nearestRoomRange || 3)) / 3

			// Never spawn hauler as first creep
			if (this.memory.assignedCreeps.length) {				
				if (this.memory.numMiners && Math.random() < 0.1 && Math.max(this.memory.numMiners ? 2 : 0, this.memory.numMiners) > (this.memory.numHaulers || 0) / roomRangeMod) {				
					if ((this.memory.numHaulers || 0) < 3 * roomRangeMod) {
						this.configureAndSpawnHauler()
					}
				}
			}

			if (Math.random() < 0.1) {
				if ((this.memory.numMiners || 0) < depositInfo.t) {
					if ((depositInfo.lc || 0) <= (Memory.stats.yieldPerSpawnTick != 0 ? 0 : 20)) {
						this.configureAndSpawnMiner()	
					}					
				}
			}

			if (Game.time - (this.memory.spawnedRamboTick || 0) > 750 && this.memory.nearestRoomRange < 7 && depositInfo.lc < 20) {

				let hostileRangedParts = 0;
				let hostileHealParts = 0;
				let hostileAttackParts = 0;


				if (Game.rooms[depositInfo.roomName]) {
					let hostileCreeps = Game.rooms[depositInfo.roomName].getAllHostileCreepsWithBodyParts([RANGED_ATTACK, HEAL], false);
					hostileCreeps = hostileCreeps.filter(h => h.owner.username != "Screeps")
					for (let creep of hostileCreeps) {
						let bmcp = creep.getBoostModifiedCombatParts(false)
						hostileRangedParts += bmcp.numRanged;
						hostileHealParts += bmcp.numHeal;
						hostileAttackParts += bmcp.numAttack;
					}
				}
				else if (Memory.rooms[depositInfo.roomName]) {
					hostileRangedParts = Memory.rooms[depositInfo.roomName].creepCombatPartsRanged || 0
					hostileHealParts = Memory.rooms[depositInfo.roomName].creepCombatPartsHeal || 0
					hostileAttackParts = Memory.rooms[depositInfo.roomName].creepCombatPartsAttack || 0
				}

				if (hostileAttackParts || hostileHealParts || hostileRangedParts) {		
					let room = this.getBestSpawnRoom(depositInfo.roomName)
					if (room) {
						let spawn = room.spawns[0];

						let rambo = creepCreator.createRambo(room, [depositInfo.roomName])

						if (rambo.body.length > 0) {
							console.log("RAMBO spawning for deposit harvest", depositInfo.roomName)
							// role, body, boosts, spawn, extraMemory
							this.spawnCombatCreep("ranged", rambo.body, rambo.boosts, spawn, {targetRoom: depositInfo.roomName})
							this.memory.spawnedRamboTick = Game.time
						}
					}
				}
				else if (Memory.rooms[depositInfo.roomName].DT > 0.01 && intelAI.getMaxHate() > 10000) {
					let room = this.getBestSpawnRoom(depositInfo.roomName)
					if (room) {
						let spawn = room.spawns[0];

						let threat = Memory.rooms[depositInfo.roomName].DT + this.memory.f * 0.5	
						let body = creepCreator.getDesignForEnergyCap("ranged", room.energyCapacityAvailable * Math.min(1, threat), false, false, false)
						this.spawnCombatCreep("ranged", body, undefined, spawn, {targetRoom: depositInfo.roomName})
						if (threat > 1) {
							this.spawnCombatCreep("ranged", body, undefined, spawn, {targetRoom: depositInfo.roomName})
						}					
						this.memory.spawnedRamboTick = Game.time
					}
				}
			}


			// else if (aliveMiners == 0 && this.memory.spawningCreeps.length == 0) {
			// 	return this.missionComplete()
			// }
		}

		super.tick()
	}

	configureAndSpawnHauler() {
		let roomName = this.memory.depositInfo.roomName;

		let bestRoom = this.getBestSpawnRoom(roomName)

		if (bestRoom) {
			this.spawnHauler(bestRoom, {x: this.memory.depositInfo.x, y: this.memory.depositInfo.y, roomName: this.memory.depositInfo.roomName}, this.memory.bestDropRoom)
			this.memory.numHaulers = (this.memory.numHaulers || 0) + 1
		}
	}

	configureAndSpawnMiner() {
		let depositInfo = this.memory.depositInfo
		let pos = {x: depositInfo.x, y: depositInfo.y, roomName: depositInfo.roomName}
		let roomName = depositInfo.roomName;

		let room = this.getBestSpawnRoom(roomName)

		if (room) {
			if (room.spawns[0].hasPrioritySpawn("depositTug") || room.spawns[0].hasPrioritySpawn("depositMiner") || room.spawns[0].hasPrioritySpawn("depositFetcher")) {
				return;
			}

			let anyFreeSpawns = false
			
			for (let spawn of room.spawns) {
				if (!spawn.spawning || spawn.spawning.remainingTime < 10) {
					anyFreeSpawns = true;
					break
				}
			}

			if (!anyFreeSpawns) return


			this.memory.pairNames[this.memory.pairIdx] = [];
			let spawn = room.spawns[0];

			if (Memory.privateServer && (this.memory.numMiners || 0) == 0 && Memory.rooms[depositInfo.roomName].DT > 0.1) {				
				let hostileRangedParts = 0;
				let hostileHealParts = 0;
				let hostileAttackParts = 0;

				if (Game.rooms[depositInfo.roomName]) {
					let hostileCreeps = Game.rooms[depositInfo.roomName].getAllHostileCreepsWithBodyParts([RANGED_ATTACK, HEAL], false);
					for (let creep of hostileCreeps) {
						let bmcp = creep.getBoostModifiedCombatParts(false)
						hostileRangedParts += bmcp.numRanged;
						hostileHealParts += bmcp.numHeal;
						hostileAttackParts += bmcp.numAttack;
					}
				}
				else if (Memory.rooms[depositInfo.roomName]) {
					hostileRangedParts = Memory.rooms[depositInfo.roomName].creepCombatPartsRanged || 0
					hostileHealParts = Memory.rooms[depositInfo.roomName].creepCombatPartsHeal || 0
					hostileAttackParts = Memory.rooms[depositInfo.roomName].creepCombatPartsAttack || 0
				}

				if (hostileAttackParts || hostileHealParts || hostileRangedParts) {				
					let rambo = creepCreator.createRambo(room, [depositInfo.roomName])

					if (rambo.body.length > 0) {
						console.log("RAMBO spawning for deposit harvest", depositInfo.roomName)
						// role, body, boosts, spawn, extraMemory
						this.spawnCombatCreep("ranged", rambo.body, rambo.boosts, spawn, {targetRoom: depositInfo.roomName})
						this.memory.spawnedRamboTick = Game.time
					}
				}
				else if (Memory.rooms[depositInfo.roomName].DT > 0.01 && intelAI.getMaxHate() > 10000) {
					let threat = Memory.rooms[depositInfo.roomName].DT + this.memory.f * 0.5	
					let body = creepCreator.getDesignForEnergyCap("ranged", room.energyCapacityAvailable * Math.min(1, threat), false, false, false)
					this.spawnCombatCreep("ranged", body, undefined, spawn, {targetRoom: depositInfo.roomName})
					if (threat > 1) {
						this.spawnCombatCreep("ranged", body, undefined, spawn, {targetRoom: depositInfo.roomName})
					}					
					this.memory.spawnedRamboTick = Game.time
				}
			}


			// if (Memory.privateServer && (this.memory.numMiners || 0) == 0 && Memory.rooms[depositInfo.roomName].DT > 0.1) {
			// 	let body = creepCreator.getDesignForEnergyCap("ranged", room.energyCapacityAvailable * Math.min(1, Memory.rooms[depositInfo.roomName].DT), false, false, false)
			// 	this.spawnCombatCreep("ranged", body, undefined, spawn, {targetRoom: depositInfo.roomName})
			// }


			let body = creepCreator.getDesignForEnergyCap("depositMiner", room.energyCapacityAvailable, false, false, false, {lc: depositInfo.lc})

			// let minerBoosts = {}
			// let harvestBoost;
			// if (global.useHarvestBoost) {
			// 	harvestBoost = room.getAvailableBoost(util.isHarvestBoost, 44 * LAB_BOOST_MINERAL * depositInfo.t)
			// 	if (harvestBoost) {
			// 		team.harvestBoost = harvestBoost
			// 		minerBoosts = {harvestBoost: -1}
			// 	}
			// }


			let minerName = this.spawnCreep("depositMiner", body, {}, spawn, pos)

			this.memory.pairNames[this.memory.pairIdx].push(minerName)

			let reusedTug = 0
			for (let creepName of this.memory.assignedCreeps) {
				let creep = Game.creeps[creepName]
				if (!creep) continue

				if ((creep.mem.role == "recycler" || (creep.mem.tugJobDone && creep.mem.travelRoom == depositInfo.roomName)) && 
					creep.ticksToLive > creep.mem.travelTime * 3 / (creep.mem.readyToTug ? 2 : 1) + 150 &&  // 3 to be safe
					creep.hasBodyPart(MOVE) && 
					!creep.hasBodyPart(CARRY) && 
					!creep.hasBodyPart(WORK)) {
					delete creep.mem.tugJobDone
					delete creep.mem.haveSnaked

					console.log("Deposit harvest reusing tug", creep)

					creep.mem.role = "depositTug"
					this.memory.pairNames[this.memory.pairIdx].push(creep.name)
					creep.mem.pairIdx = this.memory.pairIdx
					creep.mem.pairedName = minerName
					reusedTug = 1
					break
				}
			}

			if (!reusedTug) {
				let numWork = 0
				for (let part of body) {
					if (part == WORK) {
						numWork++
					}
				}

				body = creepCreator.getDesignForEnergyCap("depositTug", room.energyCapacityAvailable, false, false, false, {maxCount: numWork})
				let tugName = this.spawnCreep("depositTug", body, {}, spawn, pos);
				this.memory.pairNames[this.memory.pairIdx].push(tugName)
			}

			this.memory.pairIdx++

			this.memory.numMiners = (this.memory.numMiners || 0) + 1
		}
	}


	requestSpawns() {
		let depositInfo = this.memory.depositInfo

		let pos = {x: depositInfo.x, y: depositInfo.y, roomName: depositInfo.roomName}

		if (!Memory.rooms[pos.roomName]) {
			return
		}
		if (Memory.rooms[pos.roomName].DT > 1) {
			return
		}

		let room = this.getBestSpawnRoom(pos.roomName, true)

		if (!room) {
			return false;
		}



		// let orderedRooms = [];

		// for (let room of Game.myRooms) {
		// 	if (room.effectiveLevel < 7) continue;
		// 	if (room.restrictDepositMissions()) continue;
		// 	if (!room.spawns.length) continue;

		// 	let score = this.getSpawnRoomScore(room, depositInfo.roomName)

		// 	if (score > 5) continue;

		// 	orderedRooms.push({name: room.name, score: score})
		// }

		// if (orderedRooms.length == 0) {
		// 	return false;
		// }

		// orderedRooms = _.sortBy(orderedRooms, function(obj) { return obj.score });

		// let spawnRoomIdx = 0;

		this.configureAndSpawnMiner();
		// this.configureAndSpawnHauler();

		// let spawn;
		// let body;
		// for (let i = 0; i < depositInfo.t; i++) {
		// 	this.memory.pairNames[this.memory.pairIdx] = [];

		// 	let room = Game.rooms[orderedRooms[spawnRoomIdx].name]

		// 	spawn = room.spawns[0];

		// 	if (Memory.privateServer && i == 0 && Memory.rooms[depositInfo.roomName].DT > 0.1) {
		// 		body = creepCreator.getDesignForEnergyCap("ranged", room.energyCapacityAvailable * Math.min(1, Memory.rooms[depositInfo.roomName].DT), false, false, false)
		// 		this.spawnCombatCreep("ranged", body, undefined, spawn, {targetRoom: depositInfo.roomName})
		// 	}


		// 	body = creepCreator.getDesignForEnergyCap("depositMiner", room.energyCapacityAvailable, false, false, false, {})

		// 	// let minerBoosts = {}
		// 	// let harvestBoost;
		// 	// if (global.useHarvestBoost) {
		// 	// 	harvestBoost = room.getAvailableBoost(util.isHarvestBoost, 44 * LAB_BOOST_MINERAL * depositInfo.t)
		// 	// 	if (harvestBoost) {
		// 	// 		team.harvestBoost = harvestBoost
		// 	// 		minerBoosts = {harvestBoost: -1}
		// 	// 	}
		// 	// }


		// 	let minerName = this.spawnCreep("depositMiner", body, {}, spawn, pos)

		// 	this.memory.pairNames[this.memory.pairIdx].push(minerName)

		// 	body = creepCreator.getDesignForEnergyCap("depositTug", room.energyCapacityAvailable, false, false, false, {})

		// 	let tugName = this.spawnCreep("depositTug", body, {}, spawn, pos);

		// 	this.memory.pairNames[this.memory.pairIdx].push(tugName)

		// 	spawnRoomIdx++
		// 	spawnRoomIdx %= orderedRooms.length

		// 	this.memory.pairIdx++
		// }

		return true
	}

	cleanMemory() {
		delete this.memory.depositInfo;
		delete this.memory.bestDropRoom;
		delete this.memory.spawnedRamboTick
		delete this.memory.nearestRoomRange
		delete this.memory.numMiners
		delete this.memory.numHaulers

		return super.cleanMemory();
	}


	missionComplete(success) {
		this.cleanMemory();

		return super.missionComplete(success)
	}
}

module.exports = DepositHarvestMission