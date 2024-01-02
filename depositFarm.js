"use strict";

var DepositBase = require("depositBase")

var util = require('util');
var safeRoute = require('safeRoute');
var pathCache = require('pathCache');
var roomIntel = require('roomIntel');
var constants = require('constants');
var creepCreator = require('creepCreator');
var intelAI = require('intelAI');


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

// numDeposits = floor(average cooldown / 8)
	
// const throughput = _.sum(sectorDeposits, deposit => 20/Math.max(1,(DEPOSIT_EXHAUST_MULTIPLY*Math.pow(deposit.harvested,DEPOSIT_EXHAUST_POW))))

class DepositFarmMission extends DepositBase {
	constructor(memory, centreRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_DEPOSIT_FARM;
		memory.fRefreshRate = 1;
		// Do this before we make our mission active.
		super(memory, centreRoomName, createNew, priority);

		if (createNew && this.isActive()) {
			memory.targetRoomName = memory.centreRoomName || centreRoomName;

			memory.teams = [];

			let sectorMem = Memory.commoditiesManager.sectors[memory.targetRoomName]
			for (let depositId in sectorMem.deposits) {
				let depositInfo = sectorMem.deposits[depositId];
				memory.depositType = depositInfo.r;
				break;
			}
		}
	}


	tick() {
		if (this.isActive()) {
			let sectorMem = Memory.commoditiesManager.sectors[this.memory.targetRoomName]


			let allowRespawnsGlobal = global.depositFarmingSectors && global.depositFarmingSectors.includes(this.memory.targetRoomName);
			// let numDeposits = 0

			if (Math.random() < 0.1 && allowRespawnsGlobal) {				
				for (let depositId in sectorMem.deposits) {
					let depositInfo = sectorMem.deposits[depositId];

					this.memory.depositType = depositInfo.r;

					if (sectorMem.walls[depositInfo.roomName]) {
						allowRespawnsGlobal = false;
						continue;
					}

					// numDeposits++;

					// Spawn a fresh team
					if (depositInfo.lc == 0 || depositInfo.lc <= sectorMem.meanCooldown) {
						let already = 0;
						// _any_ farm can claim it
						for (let otherDepositFarm of Memory.combatManager.currentMissions[MISSION_DEPOSIT_FARM]) {	
							if (!otherDepositFarm.teams) continue
							for (let currentTeam of otherDepositFarm.teams) {
								if (currentTeam.depositId === depositId) {
									already = 1;
									break;
								}
							}
							if (already) {
								break;
							}
						}

						if (already) continue

						let disallowed = false;
						// A bit of CPU smoothing
						let baseLCThreshold = 10 - 0.5 * ((10000 - Memory.stats.avgBucket) / 1000 + (10000 - Game.cpu.bucket) / 1000)
						if (depositInfo.lc > baseLCThreshold) {
							if (Game.cpu.bucket < 2000 + Math.random() * 8000 || Memory.stats.avgBucket < 3000 + Math.random() * 7000) {
								disallowed = true;
							}
							else if (Game.time - (Memory.commoditiesManager.depositStats.tooExpensive[this.memory.depositType] || 0) < 1000 && !Memory.season4) {
								disallowed = true;
							}
							// We've kinda got loads.
							else if (!Memory.privateServer && !Memory.season4 && 
										(Memory.stats.globalResources[this.memory.depositType] / Game.myRooms.length > 30000 ||
			  							Memory.stats.globalResources[util.getNextTierForCommoditiy(this.memory.depositType)] / Game.myRooms.length > 30000)) {
								Memory.commoditiesManager.depositStats.tooExpensive[this.memory.depositType] = Game.time;
								disallowed = true;
							}
							else {
								let lcThreshold = sectorMem.meanCooldown + baseLCThreshold - (DEPOSIT_DECAY_TIME - depositInfo.ttd) / 1000

								// Just run them to 50 on seasonal as we can't reason about too expensive
								if (Memory.season4 && lcThreshold > (Memory.farmLCThresh || 50)) {
									lcThreshold = (Memory.farmLCThresh || 50)
								}

								if (depositInfo.lc >= lcThreshold) {
									disallowed = true;
								}
							}
						}

						if (disallowed) continue

						this.requestSpawns(depositId, depositInfo, true);
					}
				}
			}

			for (let team of this.memory.teams) {
				// Which mode are we in? Roaming or static. 
				// Should we change?
				// let currentMode = team.mode;
				let depositInfo = sectorMem.deposits[team.depositId];

				// If it TTLed out
				if (!depositInfo) continue

				let numTiles = depositInfo.t;
				let lastCooldown = depositInfo.lc;

				let harvesterWork = 48;

				if (team.harvestBoost) {
					harvesterWork = 44
					harvesterWork *= BOOSTS[WORK][team.harvestBoost]["harvest"]
				}

				let haulerCarry = 25 * CARRY_CAPACITY

				if (!team.haulerPeriod || Math.random() < 0.1) {					
					let dropDist = 50 * safeRoute.getSafeRouteCost(team.haulerDropRoom, depositInfo.roomName, false, true)
					let numTrips = Math.floor(CREEP_LIFE_TIME / (2.2 * dropDist))

					team.haulerPeriod = Math.min(CREEP_LIFE_TIME - 2.2 * dropDist, (numTrips * haulerCarry * Math.max(lastCooldown + 5, 20)) / (numTiles * harvesterWork * HARVEST_DEPOSIT_POWER));
				}

				let haulerPeriod = team.haulerPeriod

				let aliveMiners = 0;
				let aliveCreeps = 0;
				let spawningCreeps = 0;
				for (let creepName of _.clone(team.creepNames)) {
					let creep = Game.creeps[creepName]
					if (creep) {
						if (creep.mem.role == "depositMiner") {
							aliveMiners++;
							if (!creep.mem.maxRenewTime) {
								creep.mem.maxRenewTime = Game.time + 400
							}
						}
						aliveCreeps++
					}
					else if (this.memory.spawningCreeps.includes(creepName)) {
						spawningCreeps++;
					}
					// Not sure how this can be not true
					else if (!this.memory.assignedCreeps.includes(creepName)) {
						// Not alive, not queued for spawning, must be dead
						_.pull(team.creepNames, creepName)
					}
					else {
						// Hit this quite often. Why?
						// console.log("Weirdness in creep check", team.creepNames, creepName)
					}
				}

				if (aliveCreeps > 0 && team.working && Game.time > team.lastHaulerSpawnedTick + haulerPeriod) {
					this.configureAndSpawnHauler(team)
				}

				// 20 / x gives ~2x when meanCooldown == 20 and ~1.1x when meanCooldown == 200

				let allowRespawnsLocal = true
				// if (Memory.season4 && depositInfo.lc > 20 && (Game.cpu.bucket < 2000 || Memory.stats.avgBucket < 3000 || (Game.time - (Memory.commoditiesManager.depositStats.tooExpensive[this.memory.depositType] || 0) < 1000 || depositInfo.lc >= sectorMem.meanCooldown + 20 - (DEPOSIT_DECAY_TIME - depositInfo.ttd) / 1000))) {
				// 	allowRespawnsLocal = false;
				// }

				// This is pretty much copied from above
				let baseLCThreshold = 10 - 0.5 * ((10000 - Memory.stats.avgBucket) / 1000 + (10000 - Game.cpu.bucket) / 1000)
				if (depositInfo.lc > baseLCThreshold) {
					if (Game.cpu.bucket < 2000 + Math.random() * 8000 || Memory.stats.avgBucket < 3000 + Math.random() * 7000) {
						allowRespawnsLocal = false;
					}
					else if (Game.time - (Memory.commoditiesManager.depositStats.tooExpensive[this.memory.depositType] || 0) < 1000 && !Memory.season4) {
						allowRespawnsLocal = false;
					}
					else {
						let lcThreshold = sectorMem.meanCooldown + baseLCThreshold - (DEPOSIT_DECAY_TIME - depositInfo.ttd) / 1000

						// Just run them to 50 on seasonal as we can't reason about too expensive
						if (Memory.season4 && lcThreshold > (Memory.farmLCThresh || 50)) {
							lcThreshold = (Memory.farmLCThresh || 50)
						}


						if (depositInfo.lc >= lcThreshold) {
							allowRespawnsLocal = false;
						}
					}
				}


				// Sent our haulers home if we have no miners
				if (aliveMiners + spawningCreeps == 0 && !allowRespawnsLocal) {
					for (let creepName of this.memory.assignedCreeps) {
						let creep = Game.creeps[creepName]
						if (creep && creep.mem.role == "depositFetcher" && creep.mem.target.x === depositInfo.x && creep.mem.target.y == depositInfo.y && creep.mem.target.roomName == depositInfo.roomName) {
							creep.mem.role = "fetcher"
						}
					}
				}

				let workingCount = 0;

				for (let creepName of team.creepNames) {
					let creep = Game.creeps[creepName]
					if (creep) {
						// Somebody has mined something, start the hauler train
						if (!creep.spawning && creep.room.name == depositInfo.roomName) {
							workingCount++;
						}
						if (creep.mem.pairIdx !== undefined && !creep.mem.pairedName) {
							if (this.memory.pairNames[creep.mem.pairIdx]) {
								creep.mem.pairedName = this.memory.pairNames[creep.mem.pairIdx][0] == creep.name ? this.memory.pairNames[creep.mem.pairIdx][1] : this.memory.pairNames[creep.mem.pairIdx][0]
							}
							else {
								console.log(creep, "has bad pairIdx", creep.mem.pairIdx, this.memory.pairNames.length)
							}
						}

						creep.mem.teamCreepNames = _.clone(team.creepNames);

						// This will hit up all the miners asking if they want to respawn
						if (creep.mem.role === "depositMiner" && allowRespawnsGlobal && allowRespawnsLocal) {
							this.testRespawn(team, creep)
						}
					}
				}

				if (workingCount >= depositInfo.t) {
					team.working = 1
				}


				if (aliveMiners + spawningCreeps < depositInfo.t && allowRespawnsGlobal && allowRespawnsLocal) {
					this.testRespawn(team)
				}

				// Cleanup
				// Can't do this as I'm spawning creeps or creeps have a nonsense pairIdx above when setting paired name
				// We can end up with rouge spawning creeps. This happens if we ask for a spawn and it falls out of the spawn's queue for whatever reason
				// The mission doesn't let go and doesn't track spawning time, so it sits there forever. This then messes with the cleanup code above
				// This is a pain in the ass as it makes for some very big arrays.
				// Hacky workaround - when we have a stupid amount of pairs just ignore the spawningCreeps lock. This may cause other issues (if the lock was doing something!)
				// but on the whole they're recoverable.
				if (Math.random() < 0.01 * (global.stringifyError || 1) && (this.memory.spawningCreeps.length == 0 || this.memory.pairNames.length > 1000)) {
					for (let pair of _.clone(this.memory.pairNames)) {
						let creep1 = Game.creeps[pair[0]]
						let creep2 = Game.creeps[pair[1]]
						if (!creep1 && !creep2) {
							_.pull(this.memory.pairNames, pair)
							this.memory.pairIdx--;
						}

					}				
				}

			}
		}


		super.tick()
	}

	testRespawn(team, creep) {
		// console.log("--------------- DEPOSIT FARM DISABLED")
		// return
		if (Game.time % 16 == 7) {
			if (creep) {			
				if (creep.spawning) {
					return;
				}
				if (creep.mem.replacementSpawned) {
					return;
				}
				if (!creep.mem.harvested) {
					return;
				}
			}

			let depositInfo = Memory.commoditiesManager.sectors[this.memory.targetRoomName].deposits[team.depositId];
			let pos = {x: depositInfo.x, y: depositInfo.y, roomName: depositInfo.roomName}

			if (!Memory.rooms[pos.roomName]) {
				return
			}
			if (Memory.rooms[pos.roomName].DT > 1) {
				return
			}

			let bestRoom = this.getBestSpawnRoom(pos.roomName)

			if (!bestRoom) return

			let anyFree = false;
			for (let spawn of bestRoom.spawns) {
				if (!spawn.spawning) {
					anyFree = true
					break
				}
			}

			if (!anyFree) {
				return;
			}

			let routeCost = creep ? safeRoute.getSafeRouteCost(bestRoom.name, pos.roomName, false, true) : 0;

			if (!creep || (routeCost < Infinity && creep.ticksToLive < routeCost * 50 + 200)) {



				this.memory.pairNames[this.memory.pairIdx] = [];
				let spawn = bestRoom.spawns[0];

				team.harvestBoost = undefined

				let minerBoosts = {}
				let harvestBoost;
				if (global.useHarvestBoost) {
					harvestBoost = bestRoom.getAvailableBoost(util.isHarvestBoost, 44 * LAB_BOOST_MINERAL * depositInfo.t)
					if (harvestBoost) {
						team.harvestBoost = harvestBoost
					}
				}
				let body = creepCreator.getDesignForEnergyCap("depositMiner", bestRoom.energyCapacityAvailable, false, false, false, {boost: harvestBoost, lc: depositInfo.lc})

				if (harvestBoost) {
					let numBoosts = 0
					for (let part of body) {
						if (part == WORK) {
							numBoosts++;
						}
					}
					minerBoosts = {[harvestBoost]: numBoosts}
				}

				let minerName = this.spawnCreep("depositMiner", body, minerBoosts, spawn, pos)
				this.memory.pairNames[this.memory.pairIdx].push(minerName)
				team.creepNames.push(minerName)

				let numWork = 0
				for (let part of body) {
					if (part == WORK) {
						numWork++
					}
				}

				body = creepCreator.getDesignForEnergyCap("depositTug", bestRoom.energyCapacityAvailable, false, false, false, {maxCount: numWork})

				let tugName = this.spawnCreep("depositTug", body, {}, spawn, pos);
				this.memory.pairNames[this.memory.pairIdx].push(tugName)
				team.creepNames.push(tugName)

				this.memory.pairIdx++

				this.memory.lastLaunchTick = Game.time
				if (creep) {
					creep.mem.replacementSpawned = 1;
				}

				// if (bestRoom.memory)
			}
		}
	}



	configureAndSpawnHauler(team, room) {
		let depositId = team.depositId;
		let depositInfo = Memory.commoditiesManager.sectors[this.memory.targetRoomName].deposits[depositId]
		let roomName = depositInfo.roomName;

		let bestRoom = this.getBestSpawnRoom(roomName)
		if (room && !bestRoom) {
			bestRoom = room;
		}

		if (bestRoom) {
			this.spawnHauler(bestRoom, {x: depositInfo.x, y: depositInfo.y, roomName: depositInfo.roomName}, team.haulerDropRoom)
			team.lastHaulerSpawnedTick = Game.time
			this.memory.lastLaunchTick = Game.time
		}
	}


	requestSpawns(depositId, depositInfo, newTeam) {
		// console.log("--------------- DEPOSIT FARM DISABLED")
		// return
		if (newTeam) {
			let creepNames = [];

			let pos = {x: depositInfo.x, y: depositInfo.y, roomName: depositInfo.roomName}

			if (!Memory.rooms[pos.roomName]) {
				return
			}
			if (Memory.rooms[pos.roomName].DT > 1) {
				return
			}


			let spawn;
			let body;
			let room = this.getBestSpawnRoom(depositInfo.roomName)
			if (room) {				
				let haulerDropRoom = this.getBestHaulerDropRoom(depositInfo.roomName)
				let team = {depositId: depositId, creepNames: creepNames, mode: MODE_STATIC, lastHaulerSpawnedTick: Game.time, working: 0, haulerDropRoom: haulerDropRoom, targetRoom: depositInfo.roomName}

				let harvestBoost;
				if (global.useHarvestBoost) {
					harvestBoost = room.getAvailableBoost(util.isHarvestBoost, 44 * LAB_BOOST_MINERAL * depositInfo.t)
					if (harvestBoost) {
						team.harvestBoost = harvestBoost						
					}
				}

				// We used to spawn them all. Now only spawn 1 and get going on the haulers.
				// The rest should get caught above
				// for (let i = 0; i < depositInfo.t; i++) {			
				for (let i = 0; i < 1; i++) {
					this.memory.pairNames[this.memory.pairIdx] = [];

					let newRoom = this.getBestSpawnRoom(depositInfo.roomName)
					if (newRoom) {
						room = newRoom
					}


					spawn = room.spawns[0];

					if (Memory.privateServer && i == 0 && Memory.rooms[depositInfo.roomName].DT > 0.01 && intelAI.getMaxHate() > 10000) {
						body = creepCreator.getDesignForEnergyCap("ranged", room.energyCapacityAvailable * Math.min(1, Memory.rooms[depositInfo.roomName].DT), false, false, false)
						this.spawnCombatCreep("ranged", body, undefined, spawn, {targetRoom: depositInfo.roomName})
						// if (Memory.rooms[depositInfo.roomName].DT > 1) {
						// 	this.spawnCombatCreep("ranged", body, undefined, spawn, {targetRoom: depositInfo.roomName})	
						// }
					}

					let minerBoosts = {}
					body = creepCreator.getDesignForEnergyCap("depositMiner", room.energyCapacityAvailable, false, false, false, {boost: harvestBoost, lc: depositInfo.lc})
					// body = creepCreator.getDesignForEnergyCap("depositMiner", room.energyCapacityAvailable, false, false, false, {boost: harvestBoost})

					if (harvestBoost) {
						let numBoosts = 0
						for (let part of body) {
							if (part == WORK) {
								numBoosts++;
							}
						}
						minerBoosts = {[harvestBoost]: numBoosts}
					}

					let minerName = this.spawnCreep("depositMiner", body, minerBoosts, spawn, pos)

					this.memory.pairNames[this.memory.pairIdx].push(minerName)
					creepNames.push(minerName)

					let numWork = 0
					for (let part of body) {
						if (part == WORK) {
							numWork++
						}
					}


					body = creepCreator.getDesignForEnergyCap("depositTug", room.energyCapacityAvailable, false, false, false, {maxCount: numWork})

					let tugName = this.spawnCreep("depositTug", body, {}, spawn, pos);

					this.memory.pairNames[this.memory.pairIdx].push(tugName)
					creepNames.push(tugName)

					this.memory.pairIdx++
					if (i == 0) this.configureAndSpawnHauler(team, room);
				}


				this.memory.teams.push(team);



				let dropDist = 50 * safeRoute.getSafeRouteCost(team.haulerDropRoom, depositInfo.roomName, false, true)

				for (let fi = 0; fi < (harvestBoost ? 2 : 1); fi++) {
					if (depositInfo.lc <= 2 * depositInfo.t) {
						this.configureAndSpawnHauler(team, room);
					}
					if (dropDist > 100 && depositInfo.lc <= 4 * depositInfo.t) {
						this.configureAndSpawnHauler(team, room);
					}
					if (dropDist > 200 && depositInfo.lc <= 6 * depositInfo.t) {
						this.configureAndSpawnHauler(team, room);
					}
				}
			}
		}
	}

	cleanMemory() {
		delete this.memory.teams
		super.cleanMemory();
	}


	missionComplete(success) {
		this.cleanMemory();
		
		return super.missionComplete(success)
	}
}

module.exports = DepositFarmMission