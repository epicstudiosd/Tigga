"use strict";

const Mission = require('missionBase')

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');

const creepCreator = require('creepCreator');
const mapVisuals = require("mapVisuals")

class PowerHarvestMission extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_POWER_HARVEST;

		memory.fRefreshRate = 10000;
		// Do this before we make our mission active.
		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		if (createNew && this.isActive()) {
			if (!Game.rooms[targetRoomName]) {
				console.log("PowerHarvestMission with no target room visible???")
				this.ID = 0;
				return;
			}

			memory.targetRoomName = memory.targetRoomName || targetRoomName;
			memory.sourceRoomName = memory.sourceRoomName || sourceRoomName;
			memory.routeLength = safeRoute.getSafeRouteCost(sourceRoomName, targetRoomName, false);

			memory.assignedCreeps = [];

			let powerBank = Game.rooms[targetRoomName].powerBanks[0];

			memory.targetX = powerBank.pos.x;
			memory.targetY = powerBank.pos.y;
			memory.powerAmount = powerBank.power;
			memory.powerPopped = false;

			memory.formations = [];


			let spawn = Game.rooms[sourceRoomName].spawns[0]

			var pathToSpawn = PathFinder.search(
				spawn.pos, {pos: new RoomPosition(memory.targetX, memory.targetY, targetRoomName), range: 2}, {
					plainCost: 1,
					swampCost: 5,
					maxOps: 50000,

					roomCallback: function(roomName) {
						let room = Game.rooms[roomName];
						let costs = new PathFinder.CostMatrix;

						if (room) {
							room.find(FIND_STRUCTURES).forEach(function(structure) {
								if (structure.structureType == STRUCTURE_ROAD) {
									costs.set(structure.pos.x, structure.pos.y, 1);
								}
								else if (structure.structureType !== STRUCTURE_CONTAINER &&
										   (structure.structureType !== STRUCTURE_RAMPART ||
											!structure.my)) {
									costs.set(structure.pos.x, structure.pos.y, 0xff);
								}
							});
						}

						return costs;
					},
				}
			);

			memory.pathCostToSpawn = pathToSpawn.cost
			if (pathToSpawn.incomplete == true) {
				console.log("Incomplete power path", pathToSpawn.cost, spawn.pos, new RoomPosition(memory.targetX, memory.targetY, targetRoomName))

				memory.pathCostToSpawn = 300;
			}

			memory.spawnedFetchers = 0
			memory.numLaunches = 0
		}
	}

	requestSpawns(ticksToGoAtLastCreepDeath = Infinity) {
		let parentRoom = Game.rooms[this.memory.sourceRoomName]
		let spawns = parentRoom.find(FIND_MY_SPAWNS);

		// Oh. Crap.
		if (spawns.length == 0) return;

		let spawn = spawns[0];
			
		let mem = Memory.rooms[this.memory.targetRoomName];
		let target = {x: this.memory.targetX, y: this.memory.targetY, roomName: this.memory.targetRoomName}

		let spawned = 0;

		let beClever = parentRoom.energyCapacityAvailable >= Math.max(17 * BODYPART_COST[HEAL] + 31 * BODYPART_COST[MOVE], 44 * BODYPART_COST[ATTACK] + 4 * BODYPART_COST[TOUGH] + 2 * BODYPART_COST[MOVE])

		if (Memory.season3) {
			beClever = false
		}

		beClever = beClever && parentRoom.getAvailableBoost(function (b) {return b == "XGHO2"}, 8 * LAB_BOOST_MINERAL);
		beClever = beClever && parentRoom.getAvailableBoost(function (b) {return b == "UH"}, 88 * LAB_BOOST_MINERAL);
		beClever = beClever && parentRoom.getAvailableBoost(function (b) {return b == "LO"}, 34 * LAB_BOOST_MINERAL);

		// if (Memory.seaosn1) {
		// 	beClever = false;
		// }

		let cleverEnergySaving = 2 * (32 * (BODYPART_COST[HEAL] + BODYPART_COST[MOVE]) + 25 * (BODYPART_COST[ATTACK] + BODYPART_COST[MOVE]))
		cleverEnergySaving -= 17 * BODYPART_COST[HEAL] + 33 * BODYPART_COST[MOVE] + 44 * BODYPART_COST[ATTACK] + 4 * BODYPART_COST[TOUGH] 

		cleverEnergySaving += 6000 * global.INTENT_CPU_COST * Memory.stats.yieldPerCPU


		let boostCost;

		if (beClever && parentRoom.mem.avgImportValues) {
			boostCost = parentRoom.mem.avgImportValues[RESOURCE_CATALYZED_GHODIUM_ALKALIDE] * 4 * LAB_BOOST_MINERAL + 
						parentRoom.mem.avgImportValues["UH"] * 44 * LAB_BOOST_MINERAL + 
						parentRoom.mem.avgImportValues["LO"] * 17 * LAB_BOOST_MINERAL +
						parentRoom.mem.energyPrice * (4 + 44 + 17) * LAB_BOOST_ENERGY
		}

		if (beClever && cleverEnergySaving * parentRoom.mem.energyPrice < 2 * boostCost) {
			let tankBody = []
			let tankBoosts = {"XGHO2": 4, "UH": 44}
			let healerBody = []
			let healerBoosts = {"LO": 17}
			for (let i = 0; i < 4; i++) {
				tankBody.push(TOUGH)
			}
			for (let i = 0; i < 2; i++) {
				tankBody.push(MOVE)
			}
			for (let i = 0; i < 44; i++) {
				tankBody.push(ATTACK)
			}

			for (let i = 0; i < 17; i++) {
				healerBody.push(HEAL)
			}
			for (let i = 0; i < 31; i++) {
				healerBody.push(MOVE)
			}

			console.log("If you implemented the T1 boost stuff power harvesting would be cheaper that way")

			/*let formationCreepNames = []
			formationCreepNames.push(this.spawnCreep("pairedPowerTank", tankBody, tankBoosts, spawn, {target: _.clone(target)}));
			formationCreepNames.push(this.spawnCreep("pairedPowerHealer", healerBody, healerBoosts, spawn, {target: _.clone(target)}));
			this.memory.formations.push(formationCreepNames);

			this.memory.maxLaunches = 1
			spawned = 1*/

		}

		if (!spawned) {
			// Only boost tough
			let beClever = parentRoom.energyCapacityAvailable >= Math.max(13 * BODYPART_COST[HEAL] + 36 * BODYPART_COST[MOVE], 13 * BODYPART_COST[MOVE] + 34 * BODYPART_COST[ATTACK] + 2 * BODYPART_COST[TOUGH])
			beClever = beClever && parentRoom.getAvailableBoost(function (b) {return b == "XGHO2"}, 4 * LAB_BOOST_MINERAL);

			let cleverEnergySaving = 2 * (32 * (BODYPART_COST[HEAL] + BODYPART_COST[MOVE]) + 25 * (BODYPART_COST[ATTACK] + BODYPART_COST[MOVE]))
			cleverEnergySaving -= 2 * (13 * BODYPART_COST[HEAL] + 49 * BODYPART_COST[MOVE] + 34 * BODYPART_COST[ATTACK] + 2 * BODYPART_COST[TOUGH])

			// Saves one heal per tick, does ~1.36x damage/tick, so takes less time and intents as well
			cleverEnergySaving += 4000 * global.INTENT_CPU_COST * Memory.stats.yieldPerCPU - 4 * LAB_BOOST_ENERGY

			// Drawback: we use a lab and we can't repurpose so easily.
			if (beClever && parentRoom.mem.avgImportValues && cleverEnergySaving * parentRoom.mem.energyPrice < 1.5 * (parentRoom.mem.avgImportValues[RESOURCE_CATALYZED_GHODIUM_ALKALIDE] * 4 * LAB_BOOST_MINERAL)) {
				let tankBody = []
				let tankBoosts = {"XGHO2": 2}
				let healerBody = []
				for (let i = 0; i < 2; i++) {
					tankBody.push(TOUGH)
				}
				for (let i = 0; i < 13; i++) {
					tankBody.push(MOVE)
				}
				for (let i = 0; i < 34; i++) {
					tankBody.push(ATTACK)
				}

				for (let i = 0; i < 13; i++) {
					healerBody.push(HEAL)
				}
				for (let i = 0; i < 36; i++) {
					healerBody.push(MOVE)
				}

				let formationCreepNames = []
				formationCreepNames.push(this.spawnCreep("pairedPowerTank", tankBody, tankBoosts, spawn, {target: _.clone(target), alwaysPulled: 1}));
				formationCreepNames.push(this.spawnCreep("pairedPowerHealer", healerBody, undefined, spawn, {target: _.clone(target)}));
				this.memory.formations.push(formationCreepNames);

				this.memory.maxLaunches = 2
				spawned = 1
			}
		}

		if (!spawned) {
			let small = 0;
			let numTargetLocs = 1

			let targetRoom = Game.rooms[this.memory.targetRoomName]
			if (targetRoom) {
				let minHits = Infinity
				for (let powerBank of targetRoom.powerBanks) {
					minHits = Math.min(powerBank.hits, minHits)
					if (powerBank.pos.x == target.x && powerBank.pos.y == target.y) {
						numTargetLocs = powerBank.pos.countAccessibleTiles()
					}
				}
				if (minHits < (1300 - this.memory.pathCostToSpawn) * 10 * ATTACK_POWER) {
					small = 1
				}
				if (ticksToGoAtLastCreepDeath < 50) {
					small = 1
				}
			}
			else {

			}

			if (parentRoom.effectiveLevel < 7 && numTargetLocs == 1) {
				return false
			}

			let veryVeryFat = 0
			let veryFat = 0
			let fat = 0
			let limitAttack = Infinity
			if (Memory.season3) {				
				if (this.memory.pathCostToSpawn < 100) {
					veryVeryFat = 1
					// Should do 1056000 damage per creep
					limitAttack = 32
				}
				else if (this.memory.pathCostToSpawn < 225) {
					fat = 1
				}
			}

			this.memory.numTargetLocs = numTargetLocs;

			let tankBody = creepCreator.getDesignForEnergyCap("newPowerTank", parentRoom.energyCapacityAvailable, 0, 0, 0, {small: small, veryVeryFat: veryVeryFat, fat: fat, limitAttack: limitAttack})
			let healerBody = creepCreator.getDesignForEnergyCap("newPowerHealer", parentRoom.energyCapacityAvailable, 0, 0, 0, {small: small, veryVeryFat: veryVeryFat, fat: fat, limitAttack: limitAttack})

			this.spawnCreep("newPowerTank", tankBody, undefined, spawn, {target: _.clone(target), targetRoom: target.roomName})

			this.memory.doubled = 0
			if (Memory.season3 && !small && parentRoom.energyCapacityAvailable < 3250) {
				if (numTargetLocs > 1) {
					this.memory.doubled = 1
				}
				let medium = (this.memory.pathCostToSpawn || 300) < 300 && parentRoom.energyCapacityAvailable >= 2210 && parentRoom.energyCapacityAvailable < 3250
				let tankBody2 = creepCreator.getDesignForEnergyCap("newPowerTank", parentRoom.energyCapacityAvailable, 0, 0, 0, {medium: medium, veryVeryFat: veryVeryFat, fat: fat, limitAttack: limitAttack})
				this.spawnCreep("newPowerTank", tankBody2, undefined, spawn, {target: _.clone(target), targetRoom: target.roomName})
			}
			else if (!Memory.season3) {				
				this.spawnCreep("newPowerHealer", healerBody, undefined, spawn, {target: _.clone(target)})
				this.spawnCreep("newPowerHealer", healerBody, undefined, spawn, {target: _.clone(target)})
			}


			let hostileRangedParts = 0;
			let hostileHealParts = 0;
			let hostileAttackParts = 0;

			if (Game.rooms[this.memory.targetRoomName]) {
				let hostileCreeps = Game.rooms[this.memory.targetRoomName].getAllHostileCreepsWithBodyParts([RANGED_ATTACK, HEAL], false);
				hostileCreeps = hostileCreeps.filter(h => h.owner.username != "Screeps")

				for (let creep of hostileCreeps) {
					let bmcp = creep.getBoostModifiedCombatParts(false)
					hostileRangedParts += bmcp.numRanged;
					hostileHealParts += bmcp.numHeal;
					hostileAttackParts += bmcp.numAttack;
				}
			}
			else {
				hostileRangedParts = mem.creepCombatPartsRanged || 0
				hostileHealParts = mem.creepCombatPartsHeal || 0
				hostileAttackParts = mem.creepCombatPartsAttack || 0
			}

			if (hostileAttackParts || hostileHealParts || hostileRangedParts) {				
				let rambo = creepCreator.createRambo(parentRoom, [this.memory.targetRoomName])

				if (rambo.body.length > 0) {
					console.log("RAMBO spawning for power harvest", this.memory.targetRoomName)
					// role, body, boosts, spawn, extraMemory
					this.spawnCreep("ranged", rambo.body, rambo.boosts, spawn, {attackPower: 1, targetRoom: this.memory.targetRoomName})
					this.memory.spawnedRamboTick = Game.time
				}
			}

			this.memory.maxLaunches = 3

			spawned = 1
		}

		if (spawned) {
			this.memory.lastLaunchTick = Game.time
			this.memory.numLaunches += 1

			return true
		}
		else {
			return false
		}
	}


	tick() {
		super.tick();

		let targetRoom = Game.rooms[this.memory.targetRoomName];

		let maxAttack = 0
		let maxAttackTTL = 0

		if (Game.map.visual) mapVisuals.get().text("⚡", new RoomPosition(10, 25, this.memory.targetRoomName), {fontSize: 10})


		for (var creepName of this.memory.assignedCreeps) {
			let creep = Game.creeps[creepName];
			if (!creep) continue;
			// creep.mem.targetRoom = this.memory.targetRoomName

			if (creep.ticksToLive && creep.hasBodyPart(ATTACK)) {
				maxAttack = Math.max(maxAttack, creep.getActiveBoostModifiedAttack() * ATTACK_POWER)
				maxAttackTTL = Math.max(maxAttackTTL, creep.ticksToLive)
			}
		}

		for (let formationIdx in this.memory.formations) {
			let formation = this.memory.formations[formationIdx];

			for (let formationCreepName of formation) {
				let formationCreep = Game.creeps[formationCreepName]
				if (!formationCreep) continue;
				for (let otherFormationCreepName of formation) {
					if (formationCreepName == otherFormationCreepName) continue
					formationCreep.mem.pairedName = otherFormationCreepName
				}
			}
		}

		if (!this.memory.powerPopped && (this.memory.ticksToGo || Infinity) >= 2 * this.memory.pathCostToSpawn) {
			for (var creepName of this.memory.assignedCreeps) {
				let creep = Game.creeps[creepName];
				if (!creep || creep.spawning) continue;
				if (creep.hasBodypart(CARRY)) {
					creep.mem.role = "fetcher"
					// if (Game.time % 5 == 0) console.log(creep, "as fetcher for power")
				}
			}
		}
		else {
			for (var creepName of this.memory.assignedCreeps) {
				let creep = Game.creeps[creepName];
				if (!creep || creep.spawning) continue;
				if (creep.hasBodypart(CARRY)) {
					if (creep.ticksToLive < this.memory.pathCostToSpawn || (!this.memory.powerPopped && creep.getStoreUsedCapacity())) {
						if (creep.getStoreUsedCapacity()) {
							creep.mem.f = 0
						}
						creep.mem.role = "fetcher"
						// if (Game.time % 5 == 0) console.log(creep, "as fetcher for power")
					}
					else {						
						creep.mem.role = "powerFetcher"
						creep.mem.targetX = this.memory.targetX
						creep.mem.targetY = this.memory.targetY
						creep.mem.targetRoom = this.memory.targetRoomName
						// if (Game.time % 5 == 0) console.log(creep, "as powerFetcher for power")
					}
				}
			}
		}


		if (targetRoom) {
			if (Game.time - (this.memory.spawnedRamboTick || 0) > 500) {				
				let hostileCreeps = targetRoom.getAllHostileCreepsWithBodyParts([RANGED_ATTACK, HEAL, ATTACK], false);
				hostileCreeps = hostileCreeps.filter(h => h.owner.username != "Screeps")

				if (hostileCreeps.length) {	
					let parentRoom = Game.rooms[this.memory.sourceRoomName]
					let spawns = parentRoom.find(FIND_MY_SPAWNS);

					let spawn = spawns[0];
					let rambo = creepCreator.createRambo(parentRoom, [this.memory.targetRoomName])

					console.log("Want rambo for", targetRoom, hostileCreeps.length)

					if (rambo.body.length > 0) {
						console.log("RAMBO spawning for power harvest", this.memory.targetRoomName)
						// role, body, boosts, spawn, extraMemory
						this.spawnCreep("ranged", rambo.body, rambo.boosts, spawn, {attackPower: 1, targetRoom: this.memory.targetRoomName})
						this.memory.spawnedRamboTick = Game.time
					}
				}
			}



			let powerBank = targetRoom.powerBanks[0];

			if (powerBank) {
				if (powerBank.pos.findFirstInRange(FIND_MY_CREEPS, 1)) {					
					let ticksToGo = powerBank.hits / maxAttack


					if (this.memory.doubled) {
						ticksToGo /= 2
					}


					if (ticksToGo < 20) {
						console.log("Power harvest ticks to go", ticksToGo, this.memory.targetRoomName)
					}

					this.memory.ticksToGo = ticksToGo

					// Implement this when I can test it
					let spawnRoom = Game.rooms[this.memory.sourceRoomName]

					let powerMod = 1;
					for (let powerCreepName of (spawnRoom.mem.assignedPowerCreeps || [])) {
						if (Game.powerCreeps[powerCreepName].room && Game.powerCreeps[powerCreepName].powers[PWR_OPERATE_SPAWN]) {
							powerMod = Math.min(powerMod, POWER_INFO[PWR_OPERATE_SPAWN].effect[Game.powerCreeps[powerCreepName].powers[PWR_OPERATE_SPAWN].level - 1])
						}
					}

					let spawnPower = spawnRoom.spawns.length / powerMod


					if (ticksToGo < 300 * Math.pow(3 / spawnPower, 0.7) + this.memory.pathCostToSpawn * 1.25) {


					// if (ticksToGo < 300 * Math.pow(4 - Game.rooms[this.memory.sourceRoomName].spawns.length, 0.25) + this.memory.pathCostToSpawn * 1.5) {
						// let neededFetcherCarry = powerBank.power / CARRY_CAPACITY
						if (!this.memory.spawnedFetchers) {	
							let parentRoom = Game.rooms[this.memory.sourceRoomName]

							let spawn = parentRoom.find(FIND_MY_SPAWNS)[0];	

							let extraMem = {targetX: this.memory.targetX, targetY: this.memory.targetY, targetRoom: this.memory.targetRoomName, f: 1}

							let targetNumCarry
							if (parentRoom.energyCapacityAvailable < 1500) {
								targetNumCarry = 10
							}
							else if (parentRoom.energyCapacityAvailable < 3000) {
								if (parentRoom.mem.verySmallHaulers) {
									targetNumCarry = 10
								}
								else {
									targetNumCarry = 15
								}
							}
							else {
								if (parentRoom.mem.verySmallHaulers) {
									targetNumCarry = 10
								}
								else if (parentRoom.mem.smallHaulers) {
									targetNumCarry = 15
								}
								else if (parentRoom.mem.mediumHaulers) {
									targetNumCarry = 20
								}
								else {
									targetNumCarry = 25
								}
							}

							let amountPerFetcher = targetNumCarry * 50

							let targetFetchers = Math.ceil(powerBank.power / amountPerFetcher)

							this.memory.targetFetchers = targetFetchers

							let assignedCarry = 0

							for (let creepName of parentRoom.mem.ownedCreeps["fetcher"] || []) {
								let creep = Game.creeps[creepName];
								if (!creep) continue
								if (creep.mem.ID) continue
								if (creep.ticksToLive > 500 && creep.ticksToLive > ticksToGo + 3 * this.memory.pathCostToSpawn && creep.getStoreUsedCapacity() == 0 && creep.getNumOfBodyPart(MOVE) == creep.getNumOfBodyPart(CARRY)) {
									this.assignCreep(creep)
									creep.mem.role = "powerFetcher"
									creep.mem.targetX = this.memory.targetX
									creep.mem.targetY = this.memory.targetY
									creep.mem.targetRoom = this.memory.targetRoomName
									creep.mem.f = 1
									assignedCarry += creep.getNumOfBodyPart(CARRY) * CARRY_CAPACITY
								}								
							}

							targetFetchers = Math.ceil((powerBank.power - assignedCarry) / amountPerFetcher)

							// Scatter these among spawn rooms?
							for (let i = 0; i < targetFetchers; i++) {
								this.spawnCreep("powerFetcher", 
												creepCreator.getDesignForEnergyCap("powerFetcher", Math.min(amountPerFetcher * 2, parentRoom.energyCapacityAvailable), 0, 0, 0),
												{}, 
												spawn, 
												_.clone(extraMem))
								// spawn.addPrioritySpawn("powerFetcher", _.clone(extraMem))
							}
							this.memory.spawnedFetchers = 1
						}
						else if (Math.random() < 0.1) {
							let parentRoom = Game.rooms[this.memory.sourceRoomName]
							let spawn = parentRoom.find(FIND_MY_SPAWNS)[0];

							for (let creepName of parentRoom.mem.ownedCreeps["fetcher"] || []) {
								if (!this.memory.spawningCreeps.length) break

								let creep = Game.creeps[creepName];
								if (!creep) continue
								if (creep.mem.ID) continue

								if (creep.getNumOfBodyPart(MOVE) != creep.getNumOfBodyPart(CARRY)) continue

								// console.log("reassign check", creepName, creep.ticksToLive, ticksToGo, this.memory.pathCostToSpawn, creep.getStoreUsedCapacity())

								if (creep.ticksToLive > 500 && creep.ticksToLive > ticksToGo + 3 * this.memory.pathCostToSpawn && creep.getStoreUsedCapacity() == 0) {
									this.assignCreep(creep)
									creep.mem.role = "powerFetcher"
									creep.mem.targetX = this.memory.targetX
									creep.mem.targetY = this.memory.targetY
									creep.mem.targetRoom = this.memory.targetRoomName
									creep.mem.f = 1
									console.log("Reassigning", creepName)
									if (spawn) {
										let creepName = this.memory.spawningCreeps[0]
										spawn.removePrioritySpawnByName(creepName);
										_.pull(this.memory.spawningCreeps, creepName);
										delete this.memory.spawningBodies[creepName];
										delete this.memory.spawningCreepBoosts[creepName];
									}
								}								
							}

						}
					}

					if (ticksToGo > maxAttackTTL && 
						this.memory.numLaunches < this.memory.maxLaunches && 
						(maxAttackTTL < this.memory.pathCostToSpawn + (this.memory.numTargetLocs >= (this.memory.doubled ? 4 : 2) ? 300 : 200) * (1 + powerMod) * 0.5) && 
						Game.time - this.memory.lastLaunchTick > 500) {


						this.requestSpawns(ticksToGo - maxAttackTTL);
					}
					// We're not going to do it in time, try beefing up for a burst
					else if (this.memory.numLaunches < this.memory.maxLaunches && 
							 ticksToGo > powerBank.ticksToDecay && 
							 ticksToGo < 1.5 * powerBank.ticksToDecay && 
							 this.memory.numTargetLocs >= (this.memory.doubled ? 3 : 1) && 
							 !this.memory.spawnedLastGaspCreep) {
						if (this.requestSpawns()) {
							this.memory.spawnedLastGaspCreep = 1	
						}
					}

				}
			}
			else {
				let droppedPower = targetRoom.find(FIND_RUINS, {
					filter: (ruin) => {
						return ruin.store[RESOURCE_POWER];
					}
				})[0];

				if (!this.memory.powerPopped) {
					this.memory.powerPopped = true

					let currentNumHaulers = 0
					for (var creepName of this.memory.assignedCreeps) {
						let creep = Game.creeps[creepName];
						if (!creep) continue

						if (creep.mem.role == "powerFetcher") {
							currentNumHaulers++
						}
					}

					let numNotRemoved = 0
					let parentRoom = Game.rooms[this.memory.sourceRoomName];
					if (parentRoom) {
						let spawn = parentRoom.find(FIND_MY_SPAWNS)[0];
						if (spawn) {
							for (let creepName of _.clone(this.memory.spawningCreeps)) {
								if (this.memory.targetFetchers - currentNumHaulers - numNotRemoved > this.memory.targetFetchers / 2) {
									numNotRemoved++
								}
								else {
									spawn.removePrioritySpawnByName(creepName);
									_.pull(this.memory.spawningCreeps, creepName);
									delete this.memory.spawningBodies[creepName];
									delete this.memory.spawningCreepBoosts[creepName];
								}
							}
						}
					}
				}

				if (droppedPower) {
					for (var creepName of this.memory.assignedCreeps) {
						let creep = Game.creeps[creepName];
						if (!creep || creep.room.dangerous || creep.mem.targetRoom != creep.room.name) continue;

						if (creep.mem.role == "newPowerTank" || creep.mem.role == "tank" || creep.mem.role == "newPowerHealer" || creep.mem.role == "healer") {
							creep.uncachedMoveTo(droppedPower, 10, {flee: 1})						
						}
					}
				}

				if (!droppedPower) {		
					droppedPower = targetRoom.find(FIND_DROPPED_RESOURCES, {
						filter: (resource) => {
							return resource.resourceType == RESOURCE_POWER;
						}
					})[0];
				}

				for (var creepName of this.memory.assignedCreeps) {
					let creep = Game.creeps[creepName];
					if (!creep) continue;

					if (creep.mem.role == "newPowerTank") {
						creep.mem.role = "tank"
						creep.mem.targetRoom = creep.room.name
					}
					if (creep.mem.role == "newPowerHealer") {
						creep.mem.role = "healer"
						creep.mem.targetRoom = creep.room.name
					}
					if (creep.mem.role == "pairedPowerTank") {
						creep.mem.role = "recycler"
						creep.mem.targetRoom = creep.room.name
					}
					if (creep.mem.role == "pairedPowerHealer") {
						creep.mem.role = "healer"
						creep.mem.targetRoom = creep.room.name
					}
				}
				if (!droppedPower) {
					console.log("No power on the floor", this.memory.targetRoomName)
					this.memory.s++
					this.missionComplete(true);
					return
				}

			}



		}

		if (this.memory.assignedCreeps.length == 0 && this.memory.spawningCreeps.length == 0) {
			this.memory.f++
			this.missionComplete(false);
		}
	}

	cleanMemory() {
		delete this.memory.routeLength 
		delete this.memory.targetX;
		delete this.memory.targetY;
		delete this.memory.powerAmount;

		delete this.memory.formations;

		delete this.memory.pathCostToSpawn
		delete this.memory.spawnedFetchers		
		delete this.memory.maxLaunches

		delete this.memory.powerPopped		
		delete this.memory.targetFetchers
		delete this.memory.ticksToGo

		delete this.memory.spawnedRamboTick
		super.cleanMemory();
	}

}


module.exports = PowerHarvestMission