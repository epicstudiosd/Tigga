"use strict";

const Mission = require('missionBase')

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');
const constants = require('constants');

const interShardMemoryManager = require('interShardMemoryManager');

const creepCreator = require('creepCreator');


class InterShardSupportMission extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, portalRoomName, targetShard, createNew, priority) {
		memory.type = memory.type || MISSION_INTERSHARD_SUPPORT;

		// Do this before we make our mission active.
		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		if (createNew && this.isActive()) {
			memory.targetRoomName = targetRoomName;
			memory.sourceRoomName = sourceRoomName;
			memory.targetShard = targetShard;
			memory.portalRoomName = portalRoomName;
			memory.fRefreshRate = 0;
			// Don't want to form up before first wave going. That's handled already.
			memory.pending = 0;

			memory.routeCost = safeRoute.getSafeRouteCost(this.memory.sourceRoomName, this.memory.portalRoomName, false, true)

		}
	}

	preTick() {
		global.runningIntershardSupport = 1		
	}


	getAlternativePortalRoomNames() {
		let isMemory = interShardMemoryManager.getMem(this.memory.targetShard);
		let myPortalRoomPos = util.getRoomPos(this.memory.portalRoomName)


		let alternativePortalRoomNames = []

		for (let otherPortalRoomName of Memory.knownIntershardPortalRoomNames) {
			if (!Memory.rooms[otherPortalRoomName]) continue
			// Local DT
			if (Memory.rooms[otherPortalRoomName].DT > 1.2) continue

			let valid = false
			for (let room of Game.myRooms) {
				if (room.effectiveLevel == 8 && room.defcon == 5) {							
					if (safeRoute.getSafeRouteCost(otherPortalRoomName, room.name, false, true, 5) < 5) {
						valid = true
						break
					}
				}
			}

			let portalDests = Memory.rooms[otherPortalRoomName].portalDests
			for (let dest of portalDests) {
				if (dest.shard != this.memory.targetShard) {
					// console.log(JSON.stringify(dest), "not an alternative to", this.memory.portalRoomName, "due to wrong shard", dest.shard, this.memory.targetShard);
					continue
				}
				// If it's the "10/11" portals it'll bring me through the room we're trying to avoid anyway
				// But maybe this is better than just jelyporting right into a mob of creeps
				if (Game.map.getRoomLinearDistance(dest.room, this.memory.targetRoomName) >= 11) {
					// console(dest.JSON.stringify(dest), "not an alternative to", this.memory.portalRoomName, "due to getRoomLinearDistance", Game.map.getRoomLinearDistance(dest.room, this.memory.targetRoomName));
					continue
				}
				if (isMemory.portalStatus && isMemory.portalStatus[dest.room] && isMemory.portalStatus[dest.room].DT && isMemory.portalStatus[dest.room].DT > 1.4) {
					console.log(JSON.stringify(dest), "not an alternative to", this.memory.portalRoomName, "due to danger", isMemory.portalStatus[dest.room].DT);
					continue
				}

				let roomPos = util.getRoomPos(dest.room);

				if (roomPos.x != myPortalRoomPos.x && roomPos.y != myPortalRoomPos.y) {
					console.log(JSON.stringify(dest), "not an alternative to", this.memory.portalRoomName, "due to non-linear", JSON.stringify(roomPos), JSON.stringify(myPortalRoomPos));
					continue
				}

				alternativePortalRoomNames.push(otherPortalRoomName)
			}
		}

		console.log("IS support alternative room names:", alternativePortalRoomNames)

		return alternativePortalRoomNames
	}

	tick() {

		if (Math.random() < 0.01) {
			this.memory.routeCost = safeRoute.getSafeRouteCost(this.memory.sourceRoomName, this.memory.portalRoomName, false, true)
		}

		if (Math.random() < 0.01 * (global.stringifyError || 1)) {
			// Look, I don't know what's happening.
			// I suspect they're timing out in spawn and that
			// doesn't purge them from here.
			// No way we have 200.
			while (this.memory.spawningCreeps.length > 200) {
				let removedName = this.memory.spawningCreeps.shift()
				delete this.memory.spawningBodies[removedName]
				delete this.memory.spawningCreepBoosts[removedName]
			}
		}

		let aliveCreeps = []
		let noWait = false;
		for (let creepName of this.memory.assignedCreeps) {
			let creep = Game.creeps[creepName];
			if (creep) {
				aliveCreeps.push(creep)
				if (creep.ticksToLive < 750) {
					noWait = true;
				}
			}
		}

		// this.memory.pending = 0

		for (let creep of aliveCreeps) {
			creep.aliveMissionCreeps = aliveCreeps;
			creep.noWaitForOtherCreeps = noWait;
		}

		if (Math.random() < 0.2) {			
			let isMemory = interShardMemoryManager.getMem(this.memory.targetShard);
			// let portalDanger = (isMemory.portalStatus && isMemory.portalStatus[this.memory.portalRoomName] && isMemory.portalStatus[this.memory.portalRoomName].DT) ? isMemory.portalStatus[this.memory.portalRoomName].DT : 0

			// let portalRoomName = this.memory.portalRoomName

			// if (portalDanger > 1.4 || Memory.rooms[this.memory.portalRoomName].DT > 1.4) {
			let alternativePortalRoomNames = this.getAlternativePortalRoomNames();

			console.log("IS support alternativePortalRoomNames", alternativePortalRoomNames)

			if (alternativePortalRoomNames.length) {
				for (let creepName of this.memory.assignedCreeps) {
					let creep = Game.creeps[creepName]
					let cmem = Memory.creeps[creepName]
					if (!cmem || !creep) continue

					// TODO: Get these re-routing too

					if (creep.spawning || creep.ticksToLive > 1450) {
						let minScore = Infinity
						let bestRoomName 
						for (let alternativePortalRoomName of alternativePortalRoomNames) {
							let score = safeRoute.getSafeRouteCost(creep.room.name, alternativePortalRoomName, false, true, 10)
							score += isMemory.portalStatus[alternativePortalRoomName] ? (isMemory.portalStatus[alternativePortalRoomName].DT * 5) : 5;

							score += Game.map.getRoomLinearDistance(alternativePortalRoomName, this.memory.targetRoomName)

							if (score < minScore) {
								minScore = score;
								bestRoomName = alternativePortalRoomName
							}
						}
						if (bestRoomName) {
							creep.mem.portalTargetRoom = bestRoomName
							if (cmem.role == "intershardPairedHealer" || cmem.role == "intershardPairedTank") {
								for (let pairedCreepName of cmem.formationCreeps) {
									if (Memory.creeps[pairedCreepName]) {
										Memory.creeps[pairedCreepName].portalTargetRoom = bestRoomName
									}
								}
							}						
						}
					}
				}
			}
		}

		// We don't really have a failure case. Hmmph.
		super.tick();
	}


	requestSpawns() {
		let isMemory = interShardMemoryManager.getMem(this.memory.targetShard);

		if (!isMemory.myRooms[this.memory.targetRoomName]) {
			console.log("No target room memory")
			return;
		}

		// Not heard from them in 20 mins. Don't spawn
		if (Date.now() - isMemory.wallClock >= 20 * 60 * 1000) {
			console.log("Not heard in too long")
			return 
		}

		let portalDanger = (isMemory.portalStatus && isMemory.portalStatus[this.memory.portalRoomName] && isMemory.portalStatus[this.memory.portalRoomName].DT) ? isMemory.portalStatus[this.memory.portalRoomName].DT : 0

		let portalRoomName = this.memory.portalRoomName

		// Look for an alternative portal
		if (portalDanger > 1.4 || Memory.rooms[this.memory.portalRoomName].DT > 1.4) {
			let alternativePortalRoomNames = this.getAlternativePortalRoomNames();

			// console.log("IS support alternativePortalRoomNames", alternativePortalRoomNames)

			if (alternativePortalRoomNames.length) {
				let minCost = Infinity
				for (let alternativeRoomTest of alternativePortalRoomNames)	{			
					let cost
					if (isMemory.portalStatus && isMemory.portalStatus[alternativeRoomTest] && isMemory.portalStatus[alternativeRoomTest].DT && isMemory.portalStatus[alternativeRoomTest].DT) {
						cost = isMemory.portalStatus[alternativeRoomTest].DT
					}
					else {
						cost = 2
					}

					// Not ideal: forced to walk through the camped room
					if (Game.map.getRoomLinearDistance(alternativeRoomTest, this.memory.targetRoomName) > 9) {
						cost += 1
					}

					cost * (0.5 + Math.random())
					if (cost < minCost) {
						portalRoomName = alternativeRoomTest;
						minCost = cost;
					}
				}
			}
		}

		this.memory.usingAlternativePortal = 0

		if (portalRoomName != this.memory.portalRoomName) {
			this.memory.usingAlternativePortal = 1
			console.log("IS support using alternative portal", portalRoomName, "instead of", this.memory.portalRoomName)
		}
		else if (isMemory.portalStatus && isMemory.portalStatus[portalRoomName] && isMemory.portalStatus[portalRoomName].DT && isMemory.portalStatus[portalRoomName].DT > 1.9) {
			console.log("IS support portal too dangerous", portalRoomName, isMemory.portalStatus[portalRoomName].DT)	
			return
		}

		let noEconSecond = false
		let noEconThird = false;
		let noEconFourth = true;

		// Completely dynamic parent rooms
		let firstRoom
		let shortestDist = Infinity
		for (let room of Game.myRooms) {
			if (room.effectiveLevel == 8 && !room.restrictOffensiveMissions(undefined, true, false, false)) {							
				let dist = safeRoute.getSafeRouteCost(portalRoomName, room.name, false, true, 10) + room.memory.spawnUtilization * 10;
				if (dist < shortestDist) {
					firstRoom = room;
					shortestDist = dist;
				}
			}
		}

		// It's gone wrong due to portal being too fecking far away
		if (!firstRoom && portalRoomName != this.memory.portalRoomName) {
			portalRoomName = this.memory.portalRoomName

			for (let room of Game.myRooms) {
				if (room.effectiveLevel == 8 && !room.restrictOffensiveMissions(undefined, true, false, false)) {							
					let dist = safeRoute.getSafeRouteCost(portalRoomName, room.name, false, true, 10) + room.memory.spawnUtilization * 10;
					if (dist < shortestDist) {
						firstRoom = room;
						shortestDist = dist;
					}
				}
			}

		}

		if (!firstRoom) {
			console.log("No room")
			return
		}


		this.memory.launchType = ((this.memory.launchType || 0) + 1) % 2

		let firstSpawn = firstRoom.find2(FIND_MY_SPAWNS)[0];
		let secondRoom = firstRoom
		let thirdRoom = firstRoom
		let fourthRoom = firstRoom

		let firstPortal = portalRoomName
		let secondPortal = portalRoomName
		let thirdPortal = portalRoomName
		let fourthPortal = portalRoomName


		shortestDist = Infinity
		for (let room of Game.myRooms) {
			if (room == firstRoom) continue;
			if (room.effectiveLevel == 8 && !room.restrictOffensiveMissions(undefined, true, false, false)) {	
				let dist = safeRoute.getSafeRouteCost(portalRoomName, room.name, false, true, 10) + room.memory.spawnUtilization * 10;
				if (dist < shortestDist) {
					secondPortal = portalRoomName
					secondRoom = room;
					shortestDist = dist;
				}
			}
		}

		if (secondRoom == firstRoom && portalRoomName != this.memory.portalRoomName) {
			for (let room of Game.myRooms) {
				if (room == firstRoom) continue;
				if (room.effectiveLevel == 8 && !room.restrictOffensiveMissions(undefined, true, false, false)) {							
					let dist = safeRoute.getSafeRouteCost(this.memory.portalRoomName, room.name, false, true, 10) + room.memory.spawnUtilization * 10;
					if (dist < shortestDist) {
						secondPortal = this.memory.portalRoomName
						secondRoom = room;
						shortestDist = dist;
						noEconSecond = true
					}
				}
			}
		}

		let secondSpawn
		let thirdSpawn
		let fourthSpawn
		if (secondRoom == firstRoom) {
			secondSpawn = firstSpawn
		}
		else {
			secondSpawn = secondRoom.find(FIND_MY_SPAWNS)[0];

			shortestDist = Infinity
			for (let room of Game.myRooms) {
				if (room == firstRoom || room == secondRoom) continue;
				if (room.effectiveLevel == 8 && !room.restrictOffensiveMissions(undefined, true, false, false)) {							
					let dist = safeRoute.getSafeRouteCost(portalRoomName, room.name, false, true, 10) + room.memory.spawnUtilization * 10;
					if (dist < shortestDist) {
						thirdPortal = portalRoomName
						thirdRoom = room;
						shortestDist = dist;
					}
				}
			}

			if (thirdRoom == firstRoom && portalRoomName != this.memory.portalRoomName) {
				for (let room of Game.myRooms) {
					if (room == firstRoom || room == secondRoom) continue;
					if (room.effectiveLevel == 8 && !room.restrictOffensiveMissions(undefined, true, false, false)) {							
						let dist = safeRoute.getSafeRouteCost(this.memory.portalRoomName, room.name, false, true, 10) + room.memory.spawnUtilization * 10;
						if (dist < shortestDist) {
							thirdPortal = this.memory.portalRoomName;
							thirdRoom = room;
							shortestDist = dist;
							noEconThird = true
						}
					}
				}
			}


			if (thirdRoom != firstRoom && thirdRoom != secondRoom) {
				thirdSpawn = thirdRoom.find(FIND_MY_SPAWNS)[0];
			}


			// No military from #4
			shortestDist = Infinity
			for (let room of Game.myRooms) {
				if (room == firstRoom || room == secondRoom || room == thirdRoom) continue;
				if (room.effectiveLevel == 8 && !room.restrictOffensiveMissions(undefined, true, false, false)) {							
					let dist = safeRoute.getSafeRouteCost(portalRoomName, room.name, false, true, 10) + room.memory.spawnUtilization * 10;
					if (dist < shortestDist) {
						fourthPortal = portalRoomName
						fourthRoom = room;
						shortestDist = dist;
						noEconFourth = false
					}
				}
			}



			if (fourthRoom != firstRoom && fourthRoom != secondRoom && fourthRoom != thirdRoom) {
				fourthSpawn = fourthRoom.find(FIND_MY_SPAWNS)[0];
			}
		}

		let avgQueueLength = (_.sum(_.values(firstRoom.memory.priorityBuilds)) + _.sum(_.values(secondRoom.memory.priorityBuilds)) + _.sum(_.values(thirdRoom.memory.priorityBuilds))) / 3

		// let spawns = [firstSpawn]

		// if (secondSpawn != firstSpawn) {
		// 	spawns.push(secondSpawn)
		// }
		// if (thirdSpawn) {
		// 	spawns.push(thirdSpawn)
		// }

		Memory.intershardSupportRooms = [firstRoom.name, secondRoom.name, thirdRoom.name]

		let throttleEconomy = 0
		if (isMemory.isSupportData && isMemory.isSupportData[this.memory.targetRoomName]) {
			let otherMissionStatus = isMemory.isSupportData[this.memory.targetRoomName]
			// It's all gone pear shaped. 
			if (isMemory.isSupportData[this.memory.targetRoomName].dead) {
				throttleEconomy = 1000
			}
			else {
				throttleEconomy = Math.round(-(isMemory.isSupportData[this.memory.targetRoomName].spawnOffset || 0) / 100)
			}
		}

		let targetRoomMem = isMemory.myRooms[this.memory.targetRoomName]

		let anyCivilians = 0
		let spawned = 0

		if (isMemory.avgBucket > 2000 && targetRoomMem.el < 8) {
			let civilianSpawns = [firstSpawn]
			if (!noEconSecond) {
				civilianSpawns.push(secondSpawn)
			}
			if (!noEconThird && thirdSpawn) {
				civilianSpawns.push(thirdSpawn)
			}

			let civilianMem1 = {targetRoom : this.memory.targetRoomName, "shardTarget": this.memory.targetShard, "portalTargetRoom": portalRoomName}
			let civilianMem2 = {targetRoom : this.memory.targetRoomName, "shardTarget": this.memory.targetShard, "portalTargetRoom": portalRoomName}

			if (targetRoomMem.el < 3 && (!targetRoomMem.storeCap || targetRoomMem.el == 1)) {
				anyCivilians = 1
				spawned = 1
				let j = 0;
				// for (let i = 0; i < 2; i++) {					
					this.spawnCreep("intershardPioneer", creepCreator.getDesignForEnergyCap("intershardPioneer", firstRoom.energyCapacityAvailable, false, false, false, {}), {"LH": -1}, civilianSpawns[j % civilianSpawns.length], civilianMem1)
					j++
					this.spawnCreep("intershardPioneer", creepCreator.getDesignForEnergyCap("intershardPioneer", firstRoom.energyCapacityAvailable, false, false, false, {}), {"LH": -1}, civilianSpawns[j % civilianSpawns.length], civilianMem1)
					j++
					if (portalDanger < 1.2) {
						this.spawnCreep("intershardPioneer", creepCreator.getDesignForEnergyCap("intershardPioneer", firstRoom.energyCapacityAvailable, false, false, false, {}), {"LH": -1}, civilianSpawns[j % civilianSpawns.length], civilianMem2)		
						j++
						this.spawnCreep("intershardPioneer", creepCreator.getDesignForEnergyCap("intershardPioneer", firstRoom.energyCapacityAvailable, false, false, false, {}), {"LH": -1}, civilianSpawns[j % civilianSpawns.length], civilianMem1)
						j++
						if (portalDanger < 1) {
							this.spawnCreep("intershardPioneer", creepCreator.getDesignForEnergyCap("intershardPioneer", firstRoom.energyCapacityAvailable, false, false, false, {}), {"LH": -1}, civilianSpawns[j % civilianSpawns.length], civilianMem1)
							j++
							this.spawnCreep("intershardPioneer", creepCreator.getDesignForEnergyCap("intershardPioneer", firstRoom.energyCapacityAvailable, false, false, false, {}), {"LH": -1}, civilianSpawns[j % civilianSpawns.length], civilianMem2)
							j++
						}
					}
				// }
			}

			if (targetRoomMem.el < 6 && targetRoomMem.sma < targetRoomMem.l && Math.random() < 0.5) {
				anyCivilians = 1
				this.spawnCreep("intershardSMG", creepCreator.getDesignForEnergyCap("intershardSMG", firstRoom.energyCapacityAvailable, false, false, false, {}), {}, firstSpawn, civilianMem1)					
			}

			let effectiveEnergy = firstRoom.calcEffectiveEnergy(false) + Memory.terminalNetworkFreeEnergy / 3

			// TODO: Transport batteries when there's a factory

			if ((targetRoomMem.el >= 2 || ((targetRoomMem.storeCap || 0) > 800000 && (targetRoomMem.d != 1 || !targetRoomMem.attackScore)))) {
				if (effectiveEnergy >= constants.ROOM_ENERGY_NO_TRANSPORTERS && targetRoomMem.el < 8 && (targetRoomMem.el < 6 || (targetRoomMem.storeCap || 0) > 500000)) {
					for (let i = throttleEconomy * 4; i < 20; i++) {
						if ((targetRoomMem.storeCap || 0) > 100000 + i * 5000 && 
							firstRoom.mem.spawnUtilization < 0.95 - 0.033 * i && 
							(isMemory.avgBucket || 10000) > 1000 + i * 500 &&
							(isMemory.bucket || 10000) > 1000 + i * 500 &&
							effectiveEnergy >= constants.ROOM_ENERGY_NO_TRANSPORTERS * (1 + i * 0.2)) {
							anyCivilians = 1
							spawned = 1

							this.spawnCreep("isTransporter", creepCreator.getDesignForEnergyCap("isTransporter", firstRoom.energyCapacityAvailable, false, false, false, {}), {}, firstSpawn, civilianMem1)
							if (portalDanger > 1.3) {
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
							}
						}
						else {
							console.log(firstRoom, "spawning transporters up to", (i - throttleEconomy * 4))
							break;
						}
					}
				}
				if (targetRoomMem.el > 2 && targetRoomMem.el < 7 && throttleEconomy < 3 && effectiveEnergy >= constants.ROOM_ENERGY_NO_P2_REPAIRERS && Math.random() < 0.5) {
					let boosts = {"LH": -1}
					anyCivilians = 1
					spawned = 1
					this.spawnCreep("intershardRepairer", creepCreator.getDesignForEnergyCap("intershardRepairer", firstRoom.energyCapacityAvailable, false, false, false, {}), boosts, firstSpawn, civilianMem1)
				}
				if (targetRoomMem.e > 100000 && targetRoomMem.el < 7 && effectiveEnergy >= constants.ROOM_ENERGY_NO_P2_REPAIRERS) {
					anyCivilians = 1
					spawned = 1
					this.spawnCreep("isUpgrader", creepCreator.getDesignForEnergyCap("isUpgrader", firstRoom.energyCapacityAvailable, false, false, false, {}), {}, firstSpawn, civilianMem1)
				}
				if (secondRoom && secondSpawn && secondRoom != firstRoom && !noEconSecond) {
					if ((effectiveEnergy = secondRoom.calcEffectiveEnergy(false) + Memory.terminalNetworkFreeEnergy / 3) >= constants.ROOM_ENERGY_NO_TRANSPORTERS && targetRoomMem.el < 8 && (targetRoomMem.el < 6 || (targetRoomMem.storeCap || 0) > 600000)) {
						for (let i = throttleEconomy * 4; i < 20; i++) {
							if ((targetRoomMem.storeCap || 0) > 100000 + i * 5000 && 
								secondRoom.memory.spawnUtilization < 0.95 - 0.033 * i && 
								(isMemory.avgBucket || 10000) > 1000 + i * 500 &&
								(isMemory.bucket || 10000) > 1000 + i * 500 &&
								effectiveEnergy >= constants.ROOM_ENERGY_NO_TRANSPORTERS * (1 + i * 0.2)) {
								anyCivilians = 1
								spawned = 1
								this.spawnCreep("isTransporter", creepCreator.getDesignForEnergyCap("isTransporter", secondRoom.energyCapacityAvailable, false, false, false, {}), {}, secondSpawn, civilianMem1)		
								if (portalDanger > 1.3) {
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
								}
							}
							else {
								console.log(secondRoom, "spawning transporters up to", (i - throttleEconomy * 4))
								break;
							}
						}
					}
					if (targetRoomMem.el > 2 && targetRoomMem.el < 7 && throttleEconomy < 3 && effectiveEnergy >= constants.ROOM_ENERGY_NO_P2_REPAIRERS && Math.random() < 0.5) {
						let boosts = {"LH": -1}
						anyCivilians = 1
						spawned = 1
						this.spawnCreep("intershardRepairer", creepCreator.getDesignForEnergyCap("intershardRepairer", secondRoom.energyCapacityAvailable, false, false, false, {}), boosts, secondSpawn, civilianMem1)
					}
					if (targetRoomMem.e > 200000 && targetRoomMem.el < 7 && effectiveEnergy >= constants.ROOM_ENERGY_NO_P2_REPAIRERS) {
						anyCivilians = 1
						spawned = 1
						this.spawnCreep("isUpgrader", creepCreator.getDesignForEnergyCap("isUpgrader", secondRoom.energyCapacityAvailable, false, false, false, {}), {}, secondSpawn, civilianMem1)
					}
				}
				if (thirdRoom && thirdSpawn && thirdRoom != firstRoom && thirdRoom != secondRoom && !noEconThird) {
					if ((effectiveEnergy = thirdRoom.calcEffectiveEnergy(false) + Memory.terminalNetworkFreeEnergy / 3) >= constants.ROOM_ENERGY_NO_TRANSPORTERS && targetRoomMem.el < 8 && (targetRoomMem.el < 6 || (targetRoomMem.storeCap || 0) > 700000)) {
						for (let i = throttleEconomy * 4; i < 20; i++) {
							if ((targetRoomMem.storeCap || 0) > 100000 + i * 5000 && 
								thirdRoom.memory.spawnUtilization < 0.95 - 0.033 * i && 
								(isMemory.avgBucket || 10000) > 1000 + i * 500 &&
								(isMemory.bucket || 10000) > 1000 + i * 500 &&
								effectiveEnergy >= constants.ROOM_ENERGY_NO_TRANSPORTERS * (1 + i * 0.2)) {
								anyCivilians = 1
								spawned = 1
								this.spawnCreep("isTransporter", creepCreator.getDesignForEnergyCap("isTransporter", thirdRoom.energyCapacityAvailable, false, false, false, {}), {}, thirdSpawn, civilianMem1)		
								if (portalDanger > 1.3) {
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
								}
							}
							else {
								console.log(thirdRoom, "spawning transporters up to", (i - throttleEconomy * 4))
								break;
							}
						}
					}
					if (targetRoomMem.el > 2 && targetRoomMem.el < 7 && throttleEconomy < 3 && effectiveEnergy >= constants.ROOM_ENERGY_NO_P2_REPAIRERS && Math.random() < 0.5) {
						let boosts = {"LH": -1}
						anyCivilians = 1
						spawned = 1
						this.spawnCreep("intershardRepairer", creepCreator.getDesignForEnergyCap("intershardRepairer", thirdRoom.energyCapacityAvailable, false, false, false, {}), boosts, thirdSpawn, civilianMem1)
					}
					if (targetRoomMem.e > 300000 && targetRoomMem.el < 7 && effectiveEnergy >= constants.ROOM_ENERGY_NO_P2_REPAIRERS) {
						anyCivilians = 1
						spawned = 1
						this.spawnCreep("isUpgrader", creepCreator.getDesignForEnergyCap("isUpgrader", thirdRoom.energyCapacityAvailable, false, false, false, {}), {}, thirdSpawn, civilianMem1)
					}
				}				
				if (fourthRoom && fourthSpawn && fourthRoom != firstRoom && fourthRoom != secondRoom && fourthRoom != thirdRoom && !noEconFourth) {
					if ((effectiveEnergy = fourthRoom.calcEffectiveEnergy(false) + Memory.terminalNetworkFreeEnergy / 3) >= constants.ROOM_ENERGY_NO_TRANSPORTERS && targetRoomMem.el < 8 && (targetRoomMem.el < 6 || (targetRoomMem.storeCap || 0) > 800000)) {
						for (let i = throttleEconomy * 4; i < 20; i++) {
							if ((targetRoomMem.storeCap || 0) > 100000 + i * 5000 && 
								fourthRoom.memory.spawnUtilization < 0.95 - 0.033 * i && 
								(isMemory.avgBucket || 10000) > 1000 + i * 500 &&
								(isMemory.bucket || 10000) > 1000 + i * 500 &&
								effectiveEnergy >= constants.ROOM_ENERGY_NO_TRANSPORTERS * (1 + i * 0.2)) {
								anyCivilians = 1
								spawned = 1
								this.spawnCreep("isTransporter", creepCreator.getDesignForEnergyCap("isTransporter", fourthRoom.energyCapacityAvailable, false, false, false, {}), {}, fourthSpawn, civilianMem1)		
								if (portalDanger > 1.3) {
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
								}
							}
							else {
								console.log(fourthRoom, "spawning transporters up to", (i - throttleEconomy * 4))
								break;
							}
						}
					}
					if (targetRoomMem.el > 2 && targetRoomMem.el < 7 && throttleEconomy < 3 && effectiveEnergy >= constants.ROOM_ENERGY_NO_P2_REPAIRERS && Math.random() < 0.5) {
						let boosts = {"LH": -1}
						anyCivilians = 1
						spawned = 1
						this.spawnCreep("intershardRepairer", creepCreator.getDesignForEnergyCap("intershardRepairer", fourthRoom.energyCapacityAvailable, false, false, false, {}), boosts, fourthSpawn, civilianMem1)
					}
					if (targetRoomMem.e > 400000 && targetRoomMem.el < 7 && effectiveEnergy >= constants.ROOM_ENERGY_NO_P2_REPAIRERS) {
						anyCivilians = 1
						spawned = 1
						this.spawnCreep("isUpgrader", creepCreator.getDesignForEnergyCap("isUpgrader", fourthRoom.energyCapacityAvailable, false, false, false, {}), {}, fourthSpawn, civilianMem1)
					}
				}
			}
			else if (targetRoomMem.el < 2) {
				anyCivilians = 1
				spawned = 1
				let j = 0
				// for (let i = 0; i < 2; i++) {					
					this.spawnCreep("isTransporter", creepCreator.getDesignForEnergyCap("isTransporter", firstRoom.energyCapacityAvailable, false, false, false, {}), {}, civilianSpawns[j % civilianSpawns.length], civilianMem1)
					j++
					this.spawnCreep("isTransporter", creepCreator.getDesignForEnergyCap("isTransporter", firstRoom.energyCapacityAvailable, false, false, false, {}), {}, civilianSpawns[j % civilianSpawns.length], civilianMem1)
					j++
					if (portalDanger < 1.2) {
						this.spawnCreep("isTransporter", creepCreator.getDesignForEnergyCap("isTransporter", firstRoom.energyCapacityAvailable, false, false, false, {}), {}, civilianSpawns[j % civilianSpawns.length], civilianMem1)
						j++
						this.spawnCreep("isTransporter", creepCreator.getDesignForEnergyCap("isTransporter", firstRoom.energyCapacityAvailable, false, false, false, {}), {}, civilianSpawns[j % civilianSpawns.length], civilianMem1)
						j++
						if (portalDanger < 1) {
							this.spawnCreep("isTransporter", creepCreator.getDesignForEnergyCap("isTransporter", firstRoom.energyCapacityAvailable, false, false, false, {}), {}, civilianSpawns[j % civilianSpawns.length], civilianMem1)
							j++
							this.spawnCreep("isTransporter", creepCreator.getDesignForEnergyCap("isTransporter", firstRoom.energyCapacityAvailable, false, false, false, {}), {}, civilianSpawns[j % civilianSpawns.length], civilianMem1)
							j++
						}
					}
				// }
			}
		}


		// if ((targetRoomMem.el < 7 && ((targetRoomMem.s || 0) < 1500)) || (targetRoomMem.el < 3 && !targetRoomMem.s) || targetRoomMem.el + 1 < targetRoomMem.l || portalDanger > 1.) {
		let notSafeModed = (targetRoomMem.s || 0) < 1500
		if (targetRoomMem.el < 7 || ((targetRoomMem.attackScore || 0) > 1e6 && notSafeModed) || targetRoomMem.el < targetRoomMem.l || targetRoomMem.d <= 1 || anyCivilians) {
			let healer = creepCreator.createBestHeal(firstRoom, 1, true, true, undefined, undefined, 1)
			let tankRanged = creepCreator.createBestTank(firstRoom, true, true, undefined, undefined, 1)
			let tankTank = creepCreator.createBestTank(firstRoom, true, true, undefined, undefined, 0)

			let numWaves = 1;

			if (targetRoomMem.d <= 3) {
				numWaves++;
			}
			if (targetRoomMem.d <= 2) {
				numWaves++;
			}
			if (targetRoomMem.d <= 1) {
				numWaves++;
			}
			if (targetRoomMem.el < targetRoomMem.l) {
				numWaves++;
			}
			if (targetRoomMem.el < 6) {
				numWaves++;
			}
			if ((targetRoomMem.attackScore || 0) > 1e6 && notSafeModed) {
				numWaves++;	
			}
			if (portalDanger > 0.5) {
				numWaves++;	
			}
			if (portalDanger > 1.) {
				numWaves++;	
			}
			if (portalDanger > 1.5) {
				numWaves++;	
			}

			let numExits = 0
			for (let exitInfo of targetRoomMem.exits) {
				let exitRoomName = exitInfo.roomName

				let exitPos = util.getSectorCoords(exitRoomName);
				if (exitPos.x == 0 || exitPos.y == 0) {
					numExits++
					if (exitInfo.DT > 0.5) {
						numWaves++
					}
					if (exitInfo.DT > 1.) {
						numWaves++
					}
					if (exitInfo.DT > 1.5) {
						numWaves++
					}
				}				
			}



			if (Object.keys(isMemory.myRooms).length == 1) {
				numWaves++;	
			}

			if (isMemory.avgBucket > 9000) {
				numWaves++
			}
			if (isMemory.avgBucket > 9500) {
				numWaves++
			}

			if (thirdRoom != firstRoom) {
				numWaves++
			}

			if (isMemory.isSupportData && isMemory.isSupportData[this.memory.targetRoomName]) {
				numWaves += Math.max(-isMemory.isSupportData[this.memory.targetRoomName].spawnOffset / 100, 0)
			}

			if (secondRoom == firstRoom) {
				numWaves--
			}
			if (isMemory.avgBucket < 3000) {
				numWaves--
			}
			if (isMemory.avgBucket < 2000) {
				numWaves--
			}
			if (isMemory.avgBucket < 1000) {
				numWaves--
			}
			if (avgQueueLength > 4) {
				numWaves--
			}
			if ((targetRoomMem.n || 1e6) < 20000 && targetRoomMem.sma > 1) {
				numWaves--
			}
			if (!anyCivilians) {
				numWaves--
			}
			if (targetRoomMem.el >= 7) {
				numWaves--
				if (portalDanger < 0.5) {
					numWaves--
				}
			}

			if (Memory.stats.globalResources["XKHO2"] / Game.myRooms.length < 6000) {
				numWaves--
			}
			if (Memory.stats.globalResources["XKHO2"] / Game.myRooms.length < 3000) {
				numWaves--
			}
			if (Memory.stats.globalResources["XLHO2"] / Game.myRooms.length < 6000) {
				numWaves--
			}
			if (Memory.stats.globalResources["XLHO2"] / Game.myRooms.length < 3000) {
				numWaves--
			}



			// Some have died. Try to compensate
			if (targetRoomMem.numISSupportCreeps !== undefined) {
				numWaves = Math.max(numWaves, 2 * numWaves - targetRoomMem.numISSupportCreeps / 4)
			}

			// At some point I doubled the spawning frequency from once every 900 ticks to once every 450
			// 450 is good as it allows for a bit more reactivity
			if (this.memory.launchType == 0) {
				numWaves = Math.ceil(numWaves / 2)
			}
			else {
				numWaves = Math.floor(numWaves / 2)
			}

			numWaves = Math.max(1, numWaves)

			let localMem = interShardMemoryManager.getMem(Game.shard.name) 

			localMem.isSupportData = localMem.isSupportData || {}
			localMem.isSupportData[this.memory.targetShard] = localMem.isSupportData[this.memory.targetShard] || {}
			localMem.isSupportData[this.memory.targetShard].targetRoom = this.memory.targetRoomName;
			localMem.isSupportData[this.memory.targetShard].expectedCombatCreeps = numWaves * 4;

			interShardMemoryManager.touchLocal();

			let roomPos = util.getSectorCoords(this.memory.targetRoomName);

			let cornerRoom = ((roomPos.x == 1 || roomPos.x == 9) && (roomPos.y == 1 || roomPos.y == 9))

			let numExitsGuarded = 0;

			let allowUnboostFirst = 0;
			let allowUnboostSecond = 0;
			let allowUnboostThird = 0;

			for (let lab of firstRoom.labs) {
				if (!lab.cooldown) {
					allowUnboostFirst = 1
					break
				}
			}
			for (let lab of secondRoom.labs) {
				if (!lab.cooldown) {
					allowUnboostSecond = 1
					break
				}
			}

			if (thirdRoom) {
				for (let lab of thirdRoom.labs) {
					if (!lab.cooldown) {
						allowUnboostThird = 1
						break
					}
				}
			}


			let spawns = []
			let allowUnboosts = []
			let portals = []
			if (firstSpawn) {
				spawns.push(firstSpawn)
				allowUnboosts.push(allowUnboostFirst)
				portals.push(firstPortal)
			}
			if (secondSpawn) {
				spawns.push(secondSpawn)
				allowUnboosts.push(allowUnboostSecond)
				portals.push(secondPortal)
			}
			if (thirdSpawn) {
				spawns.push(thirdSpawn)
				allowUnboosts.push(allowUnboostThird)
				portals.push(thirdPortal)
			}

			let combatRooms = []

			if (notSafeModed) {
				combatRooms.push(this.memory.targetRoomName)
			}
			combatRooms.push(this.memory.portalRoomName)

			for (let exitInfo of targetRoomMem.exits) {
				let exitRoomName = exitInfo.roomName
				combatRooms.push(exitRoomName)
			}



			let buildAggessive = false && Math.random() < 0.5
			let numRooms = 2 + numExits


			this.memory.launchRoomOffset = ((this.memory.launchType || 0) + 1) % numRooms



			for (let i = this.memory.launchRoomOffset; i < numWaves + this.memory.launchRoomOffset; i++) {
				let spawnA = spawns[i % spawns.length];
				let spawnB = spawns[(i + 1) % spawns.length];

				let portalA = portals[i % portals.length]
				let portalB = portals[(i + 1) % portals.length]

				let allowUnboostA = allowUnboosts[i % allowUnboosts.length];;
				let allowUnboostB = allowUnboosts[(i + 1) % allowUnboosts.length];


				// let targetRoom = (notSafeModed && (portalDanger <= 1.25 || Math.random() < 0.5)) ? this.memory.targetRoomName : this.memory.portalRoomName
				let targetRoom = this.memory.portalRoomName

				let tankType = tankRanged 

				let modeRanged = -1 
				let modeAttack = -1 
				let modeHeal = -1 
				let modeTough = -1 


				if (i % numRooms == 0) {
					// 1 in every 5 always goes to the home room if it's not in safe mode
					if (notSafeModed && (targetRoomMem.el < 7 || targetRoomMem.el < targetRoomMem.l || targetRoomMem.attackScore)) {
						targetRoom = this.memory.targetRoomName
						tankType = tankTank
					}
					numExitsGuarded = 0
				}
				else if (cornerRoom && i % numRooms < 1 + numExits && targetRoomMem.exits) {
					let j = 0;
					for (let exitInfo of targetRoomMem.exits) {
						let exitRoomName = exitInfo.roomName

						let exitPos = util.getSectorCoords(exitRoomName);
						if (exitPos.x == 0 || exitPos.y == 0) {
							if (j == numExitsGuarded % numExits) {
								if (i / numRooms >= 1 && exitInfo.DT > 0.25) {									
									targetRoom = exitRoomName
									if (exitInfo.ccp && exitInfo.ccp.a) {
										tankType = tankTank
									}
									if (exitInfo.mode) {
										modeRanged = exitInfo.mode.r || -1;
										modeAttack = exitInfo.mode.a || -1;
										modeHeal = exitInfo.mode.h || -1;
										modeTough = exitInfo.mode.t || -1;
									}
								}
								numExitsGuarded++
								break;
							}
							j++
						}
					}
				}

				if (targetRoom == this.memory.targetRoom) {
					modeRanged = targetRoomMem.mode.r || -1;
					modeAttack = targetRoomMem.mode.a || -1;
					modeHeal = targetRoomMem.mode.h || -1;
					modeTough = targetRoomMem.mode.t || -1;
				}
				else if (targetRoom == this.memory.portalRoomName && isMemory.portalStatus && isMemory.portalStatus[this.memory.portalRoomName] && isMemory.portalStatus[this.memory.portalRoomName] && isMemory.portalStatus[this.memory.portalRoomName].mode) {
					modeRanged = isMemory.portalStatus[this.memory.portalRoomName].mode.r || -1;
					modeAttack = isMemory.portalStatus[this.memory.portalRoomName].mode.a || -1;
					modeHeal = isMemory.portalStatus[this.memory.portalRoomName].mode.h || -1;
					modeTough = isMemory.portalStatus[this.memory.portalRoomName].mode.t || -1;
				}

				// We want to create ranged to beat their ranged.
				let ranged1
				let ranged2

				// Aim is to be able to 2v1 them, but not get 2v1ed. Assumes T3 boosts on me and T3 tough on them.
				if (modeRanged >= 0 && modeHeal >= 0 && modeTough >= 0) {	
					let requiredRanged = Math.ceil(Math.min(modeTough * 100 / 0.3, modeHeal * HEAL_POWER / 0.3) / (2 * RANGED_ATTACK_POWER));
					let requiredTough = Math.ceil((2 * modeRanged * RANGED_ATTACK_POWER / 100) * 0.3)
					let requiredHeal = Math.ceil((2 * modeRanged * RANGED_ATTACK_POWER) * 0.3 / (HEAL_POWER))

					// Sanity
					requiredRanged = Math.max(20, requiredRanged) * 4
					requiredTough = Math.max(4, requiredTough)
					requiredHeal = Math.max(8, requiredHeal) * 4

					// Ok, we're good to go!
					if (Math.ceil(requiredRanged / 4) + requiredTough + Math.ceil(requiredHeal / 4) <= Math.round(4 * MAX_CREEP_SIZE / 5)) {
						ranged1 = creepCreator.createBestRanged(firstRoom, true, true, true, firstRoom.energyCapacityAvailable, requiredRanged, requiredHeal, requiredTough, true)
						ranged2 = creepCreator.createBestRanged(firstRoom, true, true, true, firstRoom.energyCapacityAvailable, requiredRanged, requiredHeal, requiredTough, true)
					}
					// Can't do it. What do? I can either build so I don't get 2v1ed or so that I 2v1. Lets mix it up globally.
					else {
						// I think this build still gets a reasonable balance. 
						// We can't nessessarily 2v1 them
						requiredRanged = Math.ceil(Math.min(modeTough * 100 / 0.3, modeHeal * HEAL_POWER / 0.3) / (RANGED_ATTACK_POWER)) + 1;

						// But they can't 2v1 us.
						requiredTough = Math.ceil((2 * modeRanged * RANGED_ATTACK_POWER / 100) * 0.3)
						requiredHeal = Math.ceil((2 * modeRanged * RANGED_ATTACK_POWER) * 0.3 / (HEAL_POWER))
						
						// Sanity
						requiredRanged = Math.max(20, requiredRanged) * 4
						requiredTough = Math.max(4, requiredTough)
						requiredHeal = Math.max(8, requiredHeal) * 4


						if (Math.ceil(requiredRanged / 4) + requiredTough + Math.ceil(requiredHeal / 4) <= Math.round(4 * MAX_CREEP_SIZE / 5)) {
							ranged1 = creepCreator.createBestRanged(firstRoom, true, true, true, firstRoom.energyCapacityAvailable, requiredRanged, requiredHeal, requiredTough, true)
							ranged2 = creepCreator.createBestRanged(firstRoom, true, true, true, firstRoom.energyCapacityAvailable, requiredRanged, requiredHeal, requiredTough, true)
						}
						else {
							// Ok, so I guess they're packing a punch? Try to survive 1v1!
							// I can damage them in 1v1
							requiredRanged = Math.ceil(Math.min(modeTough * 100 / 0.3, modeHeal * HEAL_POWER / 0.3) / RANGED_ATTACK_POWER) + 1;
							// They can't damage me in 1v1
							requiredTough = Math.ceil((modeRanged * RANGED_ATTACK_POWER / 100) * 0.3) + 1
							requiredHeal = Math.ceil((modeRanged * RANGED_ATTACK_POWER) * 0.3 / (HEAL_POWER)) + 1

							// Sanity
							requiredRanged = Math.max(20, requiredRanged) * 4
							requiredTough = Math.max(4, requiredTough)
							requiredHeal = Math.max(8, requiredHeal) * 4

							if (Math.ceil(requiredRanged / 4) + requiredTough + Math.ceil(requiredHeal / 4) <= Math.round(4 * MAX_CREEP_SIZE / 5)) {
								ranged1 = creepCreator.createBestRanged(firstRoom, true, true, true, firstRoom.energyCapacityAvailable, requiredRanged, requiredHeal, requiredTough, true)
								ranged2 = creepCreator.createBestRanged(firstRoom, true, true, true, firstRoom.energyCapacityAvailable, requiredRanged, requiredHeal, requiredTough, true)
							}
						}
					}
				}

				// Defaut
				if (!ranged1 || !ranged2) {
					ranged1 = creepCreator.createBestRanged(firstRoom, true, true, true, firstRoom.energyCapacityAvailable, undefined)
					// If the room looks good, create one without tough
					if (targetRoomMem.el == targetRoomMem.l && portalDanger < 0.75 && !targetRoomMem.exits) {
					 	ranged2 = creepCreator.createBestRanged(firstRoom, false, true, true, firstRoom.energyCapacityAvailable, undefined)
					}
					else {
						ranged2 = creepCreator.createBestRanged(firstRoom, true, true, true, firstRoom.energyCapacityAvailable, undefined)	
					}
				}





				if (targetRoom == this.memory.portalRoomName && isMemory.portalStatus[this.memory.portalRoomName] && isMemory.portalStatus[this.memory.portalRoomName].ccp && isMemory.portalStatus[this.memory.portalRoomName].ccp.a) {
					tankType = tankTank
				}
				else if (targetRoom == this.memory.targetRoomName && targetRoomMem.ccp && targetRoomMem.ccp.a) {
					tankType = tankTank
				}

				let myCombatRooms
				let roam
				if (i - this.memory.launchRoomOffset < numRooms && this.memory.launchType == 0 && (targetRoomMem.el < 7 || portalDanger > 0.5 || targetRoomMem.attackScore) && numWaves > 1) {
					myCombatRooms = [targetRoom]
					roam = 0
				}
				else {
					myCombatRooms = _.clone(combatRooms)
					roam = 1
				}

				if (Memory.stats.globalResources["XKHO2"] < 0.5 * Memory.stats.globalResources["XUH2O"]) {
					tankType = tankTank
				}


				// let portalTargetRoom = targetRoom == this.memory.targetRoomName ? this.memory.portalRoomName : portalRoomName
				let portalTargetRoom = portalRoomName
				console.log("IS spawning wave for", targetRoom, "using", portalA, "and", portalB, "from", spawnA.room.name, "and", spawnB.room.name, i, cornerRoom, JSON.stringify(targetRoomMem.exits), numExitsGuarded)

				let mem = {targetRoom : targetRoom, "shardTarget": this.memory.targetShard, "portalTargetRoom": portalA, "spawnShard": Game.shard.name, "allowUnboost": allowUnboostA, "maxRenewTime": Game.time + 1000, "combatRooms": myCombatRooms, "roam": roam}

				spawned = 1

				// One room gets ranged, the other pairs. Should make it more wavey. Further room gets ranged as they spawn faster.
				this.spawnCreep("intershardRanged", ranged1.body, ranged1.boosts, spawnA, _.clone(mem))
				this.spawnCreep("intershardRanged", ranged2.body, ranged2.boosts, spawnA, _.clone(mem))

				// Need some names. 
				// Don't have a great way of handling this right now. Normally the mission controls, but this is intershard
				let healerName = "h" + i + "_" + Memory.creepCount + "_" + (Game.time % 7919)
				let tankName = "t" + i + "_" + Memory.creepCount + "_" + (Game.time % 7919)
				Memory.creepCount++

				mem = {"targetRoom": targetRoom, "shardTarget": this.memory.targetShard, "portalTargetRoom": portalB, "formationCreeps": [healerName, tankName], "allowUnboost": allowUnboostB, "maxRenewTime": Game.time + 1000, "combatRooms": myCombatRooms, "roam": roam}

				this.spawnCreep("intershardPairedHealer", healer.body, healer.boosts, spawnB, _.clone(mem), healerName)
				this.spawnCreep("intershardPairedTank", tankType.body, tankType.boosts, spawnB, _.clone(mem), tankName)
			}

			// Memory.creepCount += numWaves

		}

		if (spawned) {			
			if (firstRoom) {
				firstRoom.memory.spawningHeavyMission = Game.time
			}
			if (secondRoom) {
				secondRoom.memory.spawningHeavyMission = Game.time
			}
			if (thirdRoom) {
				thirdRoom.memory.spawningHeavyMission = Game.time
			}
			if (fourthRoom) {
				fourthRoom.memory.spawningHeavyMission = Game.time
			}
		}


		this.memory.lastLaunchTick = Game.time;

		return true;
	}


	missionComplete(success) {
		return super.missionComplete(success);
	}


	assignCreep(creep) {
		super.assignCreep(creep);
		if (!creep.mem.targetRoom) {
			creep.mem.targetRoom = this.memory.targetRoomName;
		}
	}

	spawnCreep(role, body, boosts, spawn, mem, name) {
		mem = mem || {targetRoom : this.memory.targetRoom, "shardTarget": this.memory.targetShard, "portalTargetRoom": this.memory.portalRoomName}


		return super.spawnCreep(role, body, boosts, spawn, _.clone(mem), name)
	}

	get targetRoomName() {
		return this.memory.targetRoomName;
	}
}

module.exports = InterShardSupportMission