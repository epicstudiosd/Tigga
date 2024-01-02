"use strict";

const Mission = require('missionBase')

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');
const constants = require('constants');

const roomAI = require('roomAI');
const creepCreator = require('creepCreator');

// No formations here. Probably should move what we're calling out of formationCreator
const formationCreator = require('formationCreator');



class RoomEconSupportMission extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_ROOM_ECON_SUPPORT;

		// console.log("new RoomEconSupportMission", JSON.stringify(memory), sourceRoomName, targetRoomName, createNew, priority)

		memory.fRefreshRate = 10000;
		// Do this before we make our mission active.
		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		// console.log("new RoomEconSupportMission", JSON.stringify(memory), sourceRoomName, targetRoomName, createNew, priority)

		if (createNew && this.isActive()) {
			memory.targetRoomName = memory.targetRoomName || targetRoomName;

			this.memory.roomRange = safeRoute.getSafeRouteCost(sourceRoomName, targetRoomName, false);
		}
	}

	renewRestricted() {
		// I hate these walls
		// if (Memory.season2 && util.getCentreRoomForRoomName(this.memory.targetRoomName) != util.getCentreRoomForRoomName(this.memory.sourceRoomName)) {
		// 	return true
		// }
		if (super.renewRestricted()) {
			return true
		}
		if (Game.rooms[this.memory.sourceRoomName].effectiveLevel < 7) {
			return true
		}

		if (Memory.rooms[this.memory.targetRoomName].supportFrom == this.memory.sourceRoomName) {
			return Game.rooms[this.memory.sourceRoomName].restrictOffensiveMissions(this.memory.targetRoomName, true, false, false) 
		}
		else if (this.memory.highPriority) {
			return Game.rooms[this.memory.sourceRoomName].restrictOffensiveMissions(this.memory.targetRoomName, false, false, true) 
		}
		else if (this.memory.midPriority) {
			return Game.rooms[this.memory.sourceRoomName].restrictOffensiveMissions(this.memory.targetRoomName, false, false, false) 
		}

		return Game.rooms[this.memory.sourceRoomName].restrictOffensiveMissions(this.memory.targetRoomName, false, true, false)
	}

	tick() {
		if (this.isActive()) {
			this.memory.pending = 0;

			//if (Math.random() < 0.01) {
			//	console.log("TODO: HANDLE ECON SUPPORT FAILURE DUE TO RECYCLE")
			//}

			if ((this.memory.assignedCreeps.length == 0 && this.memory.spawningCreeps.length == 0 && !this.memory.creepArrived) || Game.time - this.memory.lastLaunchTick > 2000) {
				// Launch fail
				if (Game.time - this.memory.lastLaunchTick <= 1) {
					return this.missionComplete(true);
				}
				else if (Game.time - this.memory.lastLaunchTick > 1450) {
					this.memory.s++;
					return this.missionComplete(true);
				}
				else if (Game.time - this.memory.lastLaunchTick < 1000) {
					// This isn't actually a failure if they all recycled...
					this.memory.f++;
					this.memory.fTick = Game.time;
					return this.missionComplete(false);

				}
				return this.missionComplete(false);
			}

			// Release them to the idle pool once they've arrived
			for (let creepName of this.memory.assignedCreeps) {
				let creep = Game.creeps[creepName]
				if (creep && creep.room.name == this.memory.targetRoomName) {
					if (creep.memory.role == "ranged") {
						creep.memory.ID = 0;
						_.pull(this.memory.assignedCreeps, creepName);

						Memory.combatManager.idlePool.push(creepName)
					}
					else {
						this.memory.creepArrived = true
						delete creep.memory.ID
					}
				}
			}

			// if (Game.time - this.memory.lastLaunchTick > 300 + this.memory.roomRange * 50) {
			if (Game.time - this.memory.lastLaunchTick > 450 && Math.random() < 0.1) {
				// if (!Game.rooms[this.memory.targetRoomName].terminal) {

					if (!this.renewRestricted()) {
						if (this.requestSpawns()) {
							this.memory.creepArrived = false;
							this.memory.numLaunches++;
							this.memory.lastLaunchTick = Game.time;

							if (Game.rooms[this.memory.targetRoomName] && Game.rooms[this.memory.targetRoomName].effectiveLevel <= 4) {
								// This hammers quite a bit, but we want those roads
								Memory.rooms[this.memory.sourceRoomName].triggerRebuild = 1
								Memory.rooms[this.memory.sourceRoomName].noBuiltRoads = 0
							}
						}
					}
				// }

			}
		}

		super.tick();

	}

	requestSpawns() {
		// Need to be able to cover half the tower damage between two of us.
		let parentRoom = Game.rooms[this.memory.sourceRoomName]
		let spawns = parentRoom.find2(FIND_MY_SPAWNS);
		// Oh. Crap.
		if (spawns.length == 0) return;

		let spawn = spawns[0];

		let targetRoom = Game.rooms[this.memory.targetRoomName];


		// Probably should genericify this.
		let route = safeRoute.findSafeRoute(this.memory.sourceRoomName, this.memory.targetRoomName, false, undefined, true);

		let maxRanged = 0
		let maxAttack = 0

		let routeNames = []

		if (route != ERR_NO_PATH) {
			for (let step of route) {
				let roomName = step.room
				routeNames.push(roomName)
				if (!Memory.rooms[roomName]) continue

				maxRanged = Math.max(maxRanged, (Memory.rooms[roomName].creepCombatPartsRanged || 0))
				maxAttack = Math.max(maxAttack, (Memory.rooms[roomName].creepCombatPartsAttack || 0))
			}
		}


		let targetRoomEnergy = targetRoom.calcEffectiveEnergy(true)
		let storeCap = (targetRoom.storage ? targetRoom.storage.store.getFreeCapacity() : 500000 - targetRoomEnergy);

		// Transporters are used to moving from sR to targetRoom
		let transportMem = {targetRoom: this.memory.targetRoomName}
		let civilianMem = {targetRoom: this.memory.targetRoomName, sR: this.memory.targetRoomName}

		let anySpawned = false

		// Very similar to intershardSupport
		let effectiveEnergy = parentRoom.calcEffectiveEnergy(false) + Memory.terminalNetworkFreeEnergy / 3	
		if (!targetRoom.terminal) {	
			if (Memory.season5 && targetRoom.mem.claimToUnclaimRoom) {
				if (targetRoom.effectiveLevel == 6) {
					effectiveEnergy = 0
				} else {
					effectiveEnergy += 2 * Memory.terminalNetworkFreeEnergy / 3	
					storeCap = Math.min(200000, (targetRoom.storage ? targetRoom.storage.store.getFreeCapacity() : 500000 - targetRoomEnergy));
				}			
			}
			if (effectiveEnergy >= constants.ROOM_ENERGY_NO_TRANSPORTERS) {
				let bestPCLevel = 0
				let utilPerCreep = 0.033;

				//if (Memory.stats.globalResources[RESOURCE_OPS] > 1000) {
					for (let assignedPowerCreepName of (Memory.rooms[this.memory.sourceRoomName].assignedPowerCreeps || [])) {
						let powerCreep = Game.powerCreeps[assignedPowerCreepName];

						if (!powerCreep || !powerCreep.room || !powerCreep.powers[PWR_OPERATE_SPAWN] || powerCreep.room.name != this.memory.sourceRoomName) continue

						// POWAH
						// Assume we get half the speedup.
						bestPCLevel = Math.max(bestPCLevel, powerCreep.powers[PWR_OPERATE_SPAWN].level)
					}
					if (bestPCLevel) {
						utilPerCreep *= 1 - (1 - POWER_INFO[PWR_OPERATE_SPAWN].effect[bestPCLevel - 1]) * 0.5;
					}
				//}

				// TODO: Make more agressive on season 5
				if (Memory.season5 && targetRoom.mem.claimToUnclaimRoom && targetRoom.mem.supportFrom == this.memory.sourceRoomName) {
					for (let i = 0; i < 20; i++) {
						if (!targetRoom.storage || 
							targetRoom.controller.level != 5 ||
							(targetRoom.controller.level == 5 && targetRoom.controller.progressTotal - targetRoom.controller.progress > targetRoom.storage.store[RESOURCE_ENERGY])) {


							if (storeCap > 50000 + i * 2500 && 
								parentRoom.memory.spawnUtilization < 0.925 - utilPerCreep * i / parentRoom.spawns.length && 
								Memory.stats.avgBucket > 1000 + i * 125 &&
								Game.cpu.bucket > 1000 + i * 125 &&
								effectiveEnergy >= constants.ROOM_ENERGY_NO_TRANSPORTERS * (1 + i * 0.1)) {
								anySpawned = true
								let design = creepCreator.getDesignForEnergyCap("roadTransporter", parentRoom.energyCapacityAvailable, false, false, true, {})	
								targetRoomEnergy += CARRY_CAPACITY * design.length / 2
								this.spawnCreep("transporter", design, {}, spawn, transportMem)
								// Maybe conver this to route danger?
								/*if (portalDanger > 1.3) {
									i++;
								}
								if (portalDanger > 1.5) {
									i++;
								}
								if (portalDanger > 1.7) {
									i++;
								}
								if (portalDanger > 1.9) {
									i++;
								}*/
							}
							else {
								console.log(parentRoom, "spawning transporters up to", i)
								console.log(storeCap, 50000 + i * 2500)
								console.log(parentRoom.memory.spawnUtilization, 0.925 - utilPerCreep * i / parentRoom.spawns.length)
								console.log(Memory.stats.avgBucket, 1000 + i * 125)
								console.log(Game.cpu.bucket, 1000 + i * 125)
								console.log(effectiveEnergy, constants.ROOM_ENERGY_NO_TRANSPORTERS * (1 + i * 0.1))

								if (i > 6) {
									Memory.rooms[this.memory.sourceRoomName].spawningHeavyMission = Game.time
								}
								break;
							}
						}
					}
				} else {
					for (let i = 0; i < 20; i++) {
						if (storeCap > 100000 + i * 5000 && 
							parentRoom.memory.spawnUtilization < 0.925 - utilPerCreep * i && 
							Memory.stats.avgBucket > 1000 + i * 500 &&
							Game.cpu.bucket > 1000 + i * 500 &&
							effectiveEnergy >= constants.ROOM_ENERGY_NO_TRANSPORTERS * (1 + i * 0.2)) {
							anySpawned = true
							let design = creepCreator.getDesignForEnergyCap("transporter", parentRoom.energyCapacityAvailable, false, false, false, {})
							targetRoomEnergy += CARRY_CAPACITY * design.length / 2
							this.spawnCreep("transporter", design, {}, spawn, transportMem)
							// Maybe conver this to route danger?
							/*if (portalDanger > 1.3) {
								i++;
							}
							if (portalDanger > 1.5) {
								i++;
							}
							if (portalDanger > 1.7) {
								i++;
							}
							if (portalDanger > 1.9) {
								i++;
							}*/
						}
						else {
							console.log(parentRoom, "spawning transporters up to", i)
							if (i > 6) {
								Memory.rooms[this.memory.sourceRoomName].spawningHeavyMission = Game.time
							}
							break;
						}
					}
				}
			}
		}

		if (Memory.season5 && targetRoom.mem.claimToUnclaimRoom && targetRoom.effectiveLevel > 2 && targetRoom.find(FIND_MY_CONSTRUCTION_SITES).length && targetRoom.mem.supportFrom == this.memory.sourceRoomName) {
			let design = creepCreator.getDesignForEnergyCap("builder", parentRoom.energyCapacityAvailable, false, false, true, {})

			let boosts
			let buildMem = _.clone(civilianMem)
			if (targetRoom.effectiveLevel < 6) {
				if (!Memory.season4 && parentRoom.getAvailableBoost(util.isRepairBoost, 50 * LAB_BOOST_MINERAL)) {
					let numWork = 0
					for (let part of design) {
						if (part == WORK) {
							numWork++;
						}
					}
					boosts = {"LH": numWork}
				}
				else {
					boosts = {}
				}
				
				buildMem.boostOnDanger = 0
				buildMem.forceBoost = 1 
				buildMem.econSupport = 1
			}

			this.spawnCreep("builder", design, {}, spawn, buildMem)
			if (targetRoom.storage && targetRoom.storage.store[RESOURCE_ENERGY] > 20000) {
				this.spawnCreep("builder", design, {}, spawn, buildMem)	
			}
			anySpawned = true
		}

		if ((!Memory.season5 || targetRoom.controller.level < 6 || !targetRoom.mem.claimToUnclaimRoom) && (targetRoom.effectiveLevel < 4 || targetRoom.storage)) {
			// This is the only thing that can fire for an RCL 7. It firest for lower RCL too, but we can get spawn util bound RCL 7s that need help upgrading.
			if (targetRoom.dangerous == 0 && 
				(anySpawned || targetRoom.storage) && 
				(targetRoom.upgradeFocus || targetRoom.controller.level < 6) && 
				targetRoomEnergy > (targetRoom.storage || !targetRoom.containers.length ? (targetRoom.find(FIND_MY_CONSTRUCTION_SITES).length ? 50000 : 20000) : 4000) &&
				 targetRoom.effectiveLevel < 8 &&
				  ((!maxRanged && !maxAttack) || targetRoom.effectiveLevel < 7) &&
				   parentRoom.mem.spawnUtilization < (targetRoom.defcon <= 3 || targetRoom.mem.claimToUnclaimRoom ? 0.9 : 0.8)) {
				if ((targetRoom.effectiveLevel < 7 || (parentRoom.effectiveLevel == 8 && parentRoom.mem.spawnUtilization + 0.2 < targetRoom.mem.spawnUtilization)) && (!Memory.season3 || targetRoom.effectiveLevel < 6)) {
					if (Memory.season5 && targetRoom.mem.claimToUnclaimRoom) {
						if (targetRoom.mem.supportFrom == this.memory.sourceRoomName) {
							this.spawnCreep("upgrader", creepCreator.getDesignForEnergyCap("upgrader", parentRoom.energyCapacityAvailable, false, false, true, {quiteFast: 1}), {}, spawn, civilianMem)
							if (targetRoom.effectiveLevel >= 3) {
								this.spawnCreep("upgrader", creepCreator.getDesignForEnergyCap("upgrader", parentRoom.energyCapacityAvailable, false, false, true, {quiteFast: 1}), {}, spawn, civilianMem)	
							}							
						}
						else {
							this.spawnCreep("upgrader", creepCreator.getDesignForEnergyCap("upgrader", parentRoom.energyCapacityAvailable, false, false, false, {fast: 1}), {}, spawn, civilianMem)
							//this.spawnCreep("upgrader", creepCreator.getDesignForEnergyCap("upgrader", parentRoom.energyCapacityAvailable, false, false, false, {fast: 1}), {}, spawn, civilianMem)							
						}

					} 
					else {
						anySpawned = true						
						this.spawnCreep("upgrader", creepCreator.getDesignForEnergyCap("upgrader", parentRoom.energyCapacityAvailable, false, false, false, {fast: 1}), {}, spawn, civilianMem)
					}
					console.log(parentRoom, "spawning upgrader(s)")
				}
			}

			if (targetRoom.effectiveLevel > 2 && targetRoom.effectiveLevel < 7 && effectiveEnergy >= constants.ROOM_ENERGY_NO_P2_REPAIRERS && targetRoomEnergy >= constants.ROOM_ENERGY_NO_P2_REPAIRERS && (targetRoom.terminal || Math.random() < 0.5)) {
				if (!Memory.season3 || targetRoom.effectiveLevel < 6) {
					let priority = roomAI.getRepairPriority(targetRoom, true, false).priority;
					if (priority > 0) {
						let design = creepCreator.getDesignForEnergyCap("repairer", parentRoom.energyCapacityAvailable, false, false, false, {})
						let boosts
						if (!Memory.season4 && parentRoom.getAvailableBoost(util.isRepairBoost, 50 * LAB_BOOST_MINERAL)) {
							let numWork = 0
							for (let part of design) {
								if (part == WORK) {
									numWork++;
								}
							}
							boosts = {"LH": numWork}
						}
						else {
							boosts = {}
						}

						let repMem = _.clone(civilianMem)
						repMem.boostOnDanger = 0
						repMem.forceBoost = 1 
						repMem.econSupport = 1

						anySpawned = true
						this.spawnCreep("repairer", creepCreator.getDesignForEnergyCap("repairer", parentRoom.energyCapacityAvailable, false, false, false, {}), boosts, spawn, repMem)
					}
				}
			}



				/*if (targetRoom.storage) {
					let targetStoreSum = _.sum(targetRoom.storage.store)
					for (let i = 0; i < 5; i++) {				
						if (targetStoreSum < STORAGE_CAPACITY * (0.75 - i * 0.15)) {
							if (parentRoom.getStoredEnergy() > (i + 1) * targetRoom.getStoredEnergy()) {
								this.spawnCreep("transporter", undefined, undefined, spawn, {"targetRoom": this.memory.targetRoomName});
							}
							else {
								break;
							}
						}
						else {
							break
						}
					}
				}
				else {
					this.spawnCreep("transporter", undefined, undefined, spawn, {"targetRoom": this.memory.targetRoomName});
				}
			}*/

			/*if (parentRoom.energyCapacityAvailable >= 10 * BODYPART_COST[WORK] + 15 * BODYPART_COST[CARRY] + 25 * BODYPART_COST[MOVE]) {
				let body = [];

				let repairBoost 

				if (!Memory.botArena) {
					repairBoost = parentRoom.getAvailableBoost(util.isRepairBoost, 20 * LAB_BOOST_MINERAL)
				}

				let boosts = {};

				for (let i = 0; i < 10; i++) {
					body.push(WORK)
				}
				if (repairBoost) {
					boosts[repairBoost] = 10;
				}

				for (let i = 0; i < 15; i++) {
					body.push(CARRY)
				}
				for (let i = 0; i < 25; i++) {
					body.push(MOVE)
				}

				this.spawnCreep(Math.random() < 0.5 ? "repairer" : "builder", body, boosts, spawn, {"targetRoom": this.memory.targetRoomName, "sR": this.memory.targetRoomName});
			}
			else {
				this.spawnCreep("builder", undefined, undefined, spawn, {"targetRoom": this.memory.targetRoomName, "sR": this.memory.targetRoomName});
			}*/


			// let dangerous = formationCreator.getRoomRouteDangerous(this.memory.sourceRoomName, this.memory.targetRoomName, Memory.rooms[this.memory.sourceRoomName], 0).routeIsDangerous
			// let maxCreeps = Math.min(Memory.empireStrength / 2, 3)


			if (targetRoom.controller.level >= 3 && !targetRoom.terminal && targetRoom.controller.safeModeAvailable == 0 && parentRoom.energyCapacityAvailable >= 30 * 50) {
				let g = parentRoom.storage ? (parentRoom.storage.store[RESOURCE_GHODIUM] || 0) : 0

				if (g >= 1000) {					
					if (!spawn.hasPrioritySpawn("safeModeGenerator")) {
						spawn.addPrioritySpawn("safeModeGenerator", {targetRoom: this.memory.targetRoomName})
						anySpawned = true
					}
				}
			}
		}

		if (anySpawned && (maxRanged || maxAttack)) {
			let ret = creepCreator.createRambo(parentRoom, routeNames)

			if (ret.body.length > 0) {
				console.log("RAMBO spawning for", this.memory.targetRoomName)
				this.spawnCreep("ranged", ret.body, ret.boosts, spawn, {"targetRoom": this.memory.targetRoomName, "sR": this.memory.targetRoomName, "combatRooms": routeNames, "forceBoost": 1})
			}
		}

		if (!anySpawned) {
			return false
		}

		return true
	}
}




module.exports = RoomEconSupportMission