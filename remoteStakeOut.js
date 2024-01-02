"use strict";

const RemoteHarassMission = require('remoteHarass')

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const roomIntel = require('roomIntel')
const creepCreator = require('creepCreator')
const util = require('util')


class RemoteStakeOutMission extends RemoteHarassMission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = MISSION_REMOTE_STAKEOUT;

		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		if (createNew && this.isActive()) {
			memory.type = MISSION_REMOTE_STAKEOUT;
			memory.killCount = 0;
			memory.roomKillCounts = {};
			memory.roomDeathCounts = {};
			memory.roomMaxSeenStrengthRatios = {};
			memory.cc = Math.random() > 0.5 ? 1 : 0;
			memory.formations = [];
			memory.effectiveNumLaunches = 1;


			memory.roome = memory.roome || {};

			for (var roomName of memory.harassRooms) {
				let sum = 0;
				let cnt = 0;

				for (let otherMission of Memory.combatManager.currentMissions[MISSION_REMOTE_STAKEOUT].concat(Memory.combatManager.currentMissions[MISSION_REMOTE_STAKEOUT_CAPPED])) {
					if (otherMission.targetRoomName == targetRoomName) {
						sum += (otherMission.roome[roomName] || 0)
						cnt++;
					}
				}
				if (!memory.roome[roomName]) {
					if (cnt == 0) {
						let effectiveRCL = Memory.rooms[memory.targetRoomName].nonLocalCombatCreeps ? 8 : Memory.rooms[memory.targetRoomName].rcl

						memory.roome[roomName] = Math.floor(Game.rooms[memory.sourceRoomName].effectiveLevel / 3 + effectiveRCL / 3);
					}
					else {
						memory.roome[roomName] = sum / cnt;
					}
				}
				else if (cnt && sum / cnt > memory.roome[roomName]) {
					memory.roome[roomName] = (memory.roome[roomName] + sum / cnt) / 2
				}

				if (!memory.s && !memory.f) {				
					if (priority < 0) {				
						memory.roome[roomName] += -priority / 10
					}
				}
			}

			// Only if we're creating it from zero memory.
			// if (priority < 0 && !memory.s && !memory.f) {				
			// 	if (memory.roome) {
			// 		for (let roomName in memory.roome) {
			// 			memory.roome[roomName] += Math.ceil(-priority / 10)
			// 		}
			// 	}
			// }
		}
	}


	grabExtraCreeps(roomName) {
		// Something is buggy. I've no idea what. Why not this?
		/*for (var idleCreep of _.clone(Memory.combatManager.idlePool)) {
			if (Game.creeps[idleCreep] && Math.random() > .5 && (Game.creeps[idleCreep].hasActiveBodypart(RANGED_ATTACK) || Game.creeps[idleCreep].hasActiveBodypart(ATTACK)) && Game.creeps[idleCreep].hasActiveBodypart(HEAL)) {
				let maxe = _.max(this.memory.roome);
				if (Game.creeps[idleCreep].body.length > maxe * 5) {
					continue;
				}

				if (!idleCreepManager.canPullIdleCreep(Game.creeps[idleCreep], roomName)) {
					continue;
				}

				var pathCost = safeRoute.getSafeRouteCost(Game.creeps[idleCreep].room.name, roomName, true);

				if (pathCost > 4) continue;

				this.assignCreep(Game.creeps[idleCreep], _.sample(this.memory.harassRooms));
				_.pull(Memory.combatManager.idlePool, idleCreep)
			}
		}*/
	}


	randomizeCloseCombat() {
		this.memory.cc = Math.random() > 0.5 ? 1 : 0;
	}


	tick() {

		let mmem = this.memory;

		// Well that went well!
		if (!Memory.rooms[mmem.targetRoomName] || !Memory.rooms[mmem.targetRoomName].owner) {
			mmem.s++;
			return this.missionComplete(true);
		}

		// Grandfathering
		mmem.roomMaxSeenStrengthRatios = mmem.roomMaxSeenStrengthRatios || {}
		mmem.roomDeathCounts = mmem.roomDeathCounts || {}
		mmem.deathCount = mmem.deathCount || 0

		if (this.isActive()) {
			global.inTickObject.activeStakeOuts = global.inTickObject.activeStakeOuts || new Set();
			global.inTickObject.activeStakeOuts.add(this.memory.targetRoomName)

			// if (Math.random() < 0.01) {
			// 	this.memory.routeLength = safeRoute.getSafeRouteCost(this.memory.sourceRoomName, this.memory.targetRoomName, true, true)
			// }

			// if (Math.random() < 0.01 && mmem.killCount > 0) {
			// 	this.grabExtraCreeps(mmem.pending ? mmem.sourceRoomName : mmem.targetRoomName);
			// }
			for (var creepName of this.memory.assignedCreeps) {
				let creep = Game.creeps[creepName];

				if (!creep) continue
				if (!creep.mem.origTargetRoom) {
					creep.mem.origTargetRoom = creep.mem.targetRoom
				}

				let origTargetRoom = Game.rooms[creep.mem.origTargetRoom];

				if (creep.ticksToLive < 50) {
					// Stolen from Geir. When TTL is low, just yolo into the room and do some confusion/tower energy cost
					creep.mem.targetRoom = this.memory.targetRoomName
				}
				else if (!origTargetRoom || origTargetRoom.dangerous == 2) {
					creep.mem.targetRoom = creep.mem.origTargetRoom
				}
				// Let every other creep roam to other harass rooms to join fights
				else if (creep.room.name == creep.mem.targetRoom && creep.mem.creepNum == 1) {
					let otherRoomDanger = 0
					for (var roomName of mmem.harassRooms) {
						if (roomName == creep.mem.origTargetRoom) continue

						if (Game.rooms[roomName] && Game.rooms[roomName].dangerous == 2 && (roomName == creep.mem.targetRoom || !Game.rooms[roomName].roomStrength || Game.rooms[roomName].roomStrength < 1.5)) {
							if (safeRoute.getSafeRouteCost(creep.mem.origTargetRoom, roomName) < 2) {
								creep.mem.targetRoom = roomName
								otherRoomDanger = 1
								break;
							}
						}
					}
					if (!otherRoomDanger) {
						creep.mem.targetRoom = creep.mem.origTargetRoom
					}
				}
			}

			for (var roomName of mmem.harassRooms) {
				var room = Game.rooms[roomName];
				if (room) {
					// We're targeting civilians. Combat creeps we'd actually prefer to avoid
					let interestingCreeps = room.find(FIND_HOSTILE_CREEPS).concat(room.find(FIND_HOSTILE_POWER_CREEPS))

					mmem.interestingCreepsSeen[roomName] = mmem.interestingCreepsSeen[roomName] || []

					for (let creep of interestingCreeps) {
						if (!mmem.interestingCreepsSeen[roomName].includes(creep.id)) {
							// Oooh, that's interesting
							mmem.interestingCreepsSeen[roomName].push(creep.id);
						}
						if (!mmem.interestingCreepsSeenTotal.includes(creep.id)) {
							// Oooh, that's interesting
							mmem.interestingCreepsSeenTotal.push(creep.id);
						}
					}

					if (!mmem.pending) {
						if (room) {
							mmem.roomKillCounts[roomName] = (mmem.roomKillCounts[roomName] || 0) + (room.killCount || 0)
							mmem.roomDeathCounts[roomName] = (mmem.roomDeathCounts[roomName] || 0) + (room.friendlyLosses || 0)
							mmem.killCount = (mmem.killCount || 0) + (room.killCount || 0)
							mmem.deathCount = (mmem.friendlyLosses || 0) + (room.friendlyLosses || 0)

							// One one hand camping an empty room is bad. On the other hand it stops builders coming in
							// if (Memory.rooms[mmem.targetRoomName] && 
							// 	(Memory.rooms[mmem.targetRoomName].spwnX.length || Memory.rooms[mmem.targetRoomName].twrX.length)) {								
								mmem.denialCount += roomIntel.getEffectiveNumSources(roomName);
							// }

						}
					}

					// One structure means controller
					mmem.hasStructures = mmem.hasStructures || {}

					mmem.hasStructures[roomName] = 0

					for (let structure of room.find(FIND_STRUCTURES)) {
						if (structure.structureType == STRUCTURE_ROAD || structure.structureType == STRUCTURE_CONTAINER) {
							mmem.hasStructures[roomName] = 1;
							break;
						}
					}

					let strangthValid = true
					for (let creepName of mmem.assignedCreeps) {
						let creep = Game.creeps[creepName];
						if (creep && creep.mem.targetRoom == room.name) {
							if (creep.room.name != room.name || creep.ticksToLive < 200) {
								strangthValid = false
							}
						}
					}
					if (strangthValid && room.roomStrength && 1 / room.roomStrength > (mmem.roomMaxSeenStrengthRatios[roomName] || 0)) {
						const alpha = Math.exp(-1/50)
						mmem.roomMaxSeenStrengthRatios[roomName] = alpha * (mmem.roomMaxSeenStrengthRatios[roomName] || 0) + (1 - alpha) * 1 / room.roomStrength
					}
				}
			}

			if (!mmem.pending) {
				for (var roomName of mmem.harassRooms) {
					if (Game.rooms[roomName]) {
						// Combat analysis

					}
				}
			}
		}

		if (this.isActive()) {
			let useShift = false;

			for (let formationIdx in this.memory.formations) {
				let formation = this.memory.formations[formationIdx];

				let cnt = 0;
				for (let formationCreepName of formation) {
					let formationCreep = Game.creeps[formationCreepName]
					if (!formationCreep) continue;
					cnt++

					formationCreep.memory.formationCreeps = _.clone(formation);
					formationCreep.memory.allSquadCreeps = _.clone(formation);
					formationCreep.combatSnake = 1;
				}

				// Old and dead formation. Clean it.
				if (formationIdx == 0 && cnt == 0 && this.memory.formations.length > 5) {
					useShift = true;
				}
			}

			if (useShift && !mmem.pending && mmem.spawningCreeps.length == 0) {
				this.memory.formations.shift();
			}
		}


		this.formationPairRenew()

		if (this.isActive() && ((mmem.assignedCreeps.length == 0 && mmem.spawningCreeps.length == 0) || Game.time - mmem.lastLaunchTick > 2000)) {
			// Completion should be "we're all dead".
			// I think if it's a long time since the start and we're all dead, we can call it a success as we've probably timed out.
			// If it's not many ticks, we've probably died and that's probably a fail.
			// We also want to see action. We're going to count the number of unique creeps we see. If we don't see many we've not had much impact.
			if (Game.time - mmem.lastLaunchTick > 1450 && (mmem.interestingCreepsSeenTotal.length >= mmem.harassRooms.length * 2 * mmem.effectiveNumLaunches || mmem.killCount > mmem.bC - mmem.denialCount * 4)) {
				mmem.s++;

				for (var roomName of mmem.harassRooms) {
					// De-escalate if no kills.
					if (mmem.roomKillCounts[roomName] == 0) {
						mmem.roome[roomName] = Math.max(mmem.roome[roomName] - 1, 0)
					}
					if (mmem.roomKillCounts[roomName] < mmem.bC / mmem.roomKillCounts.length) {
						mmem.roome[roomName] = Math.max(mmem.roome[roomName] - 1, 0)
					}
				}

				return this.missionComplete(true);
			}
			else if (Game.time - mmem.lastLaunchTick < 1250) {
				console.log("Stakeout Fail RIP")
				console.log(Game.time, mmem.lastLaunchTick)
				console.log(mmem.targetRoomName, JSON.stringify(mmem.roome))

				mmem.f++;

				mmem.rangeHealRatio = this.getRandomRangedHealRatio();
				mmem.bodyOrder = this.getRandomBodyOrder();
				mmem.maxBonusTough = this.getRandomMaxBonusTough();

				this.randomizeCloseCombat();


				for (var roomName of mmem.harassRooms) {
					mmem.roome[roomName]++;
					if (this.getSuccessRate() < 0.5) {
						mmem.roome[roomName]++;
					}

					if (Memory.rooms[mmem.targetRoomName] && mmem.roome[roomName] < Math.round((Memory.rooms[mmem.targetRoomName].rcl || 0) / 2)) {
						mmem.e = Math.round((Memory.rooms[mmem.targetRoomName].rcl || 0) / 2);
					}
				}
				// Wait for the guys who killed me to despawn.
				mmem.fRefreshRate = 3000;
				mmem.fRefreshRate *= (1.5 - this.getSuccessRate());
				mmem.fTick = Game.time;

				if (mmem.killCount < 0.5 * mmem.bC - mmem.denialCount * 8) {
					mmem.fRefreshRate *= 2;
					for (var roomName of mmem.harassRooms) {
						mmem.roome[roomName]++;
					}
				}
				if (mmem.killCount < 0.25 * mmem.bC - mmem.denialCount * 8) {
					mmem.fRefreshRate *= 2;
					for (var roomName of mmem.harassRooms) {
						mmem.roome[roomName]++;
					}
				}

				return this.missionComplete(false);
			}
			else {
				// Booooring.
				console.log("Stakeout Fail boring")
				console.log(Game.time, mmem.lastLaunchTick)
				console.log(mmem.targetRoomName, JSON.stringify(mmem.roome))

				mmem.fRefreshRate = 10000;
				mmem.fRefreshRate *= (1.5 - this.getSuccessRate());
				mmem.fTick = Game.time;

				if (mmem.killCount < 0.5 * mmem.bC - mmem.denialCount * 8) {
					mmem.fRefreshRate *= 2;
				}
				if (mmem.killCount < 0.25 * mmem.bC - mmem.denialCount * 8) {
					mmem.fRefreshRate *= 2;
				}

				for (var roomName of mmem.harassRooms) {
					// De-escalate if no kills.
					if (mmem.roomKillCounts[roomName] == 0) {
						mmem.roome[roomName] = Math.max(mmem.roome[roomName] - 1, 0)
					}
					if (mmem.roomKillCounts[roomName] < mmem.bC) {
						mmem.roome[roomName] = Math.max(mmem.roome[roomName] - 1, 0)
					}
				}


				return this.missionComplete(false);
			}
			return this.missionComplete(true);
		}
		// Need moar. If our guys are still alive and they've managed to kill more than they cost, spawn them some friends.
		else if (Game.time % 10 == 0) { 
			let targetRoomEnergy = (Memory.rooms[this.memory.targetRoomName].storE || 0) + (Memory.rooms[this.memory.targetRoomName].trmE || 0)

			if (Game.time - mmem.lastLaunchTick >= 1200 && mmem.spawningCreeps.length == 0) {
				 // Killed lots, or reduced energy by lots, or just seen a lot of creeps?
				 // TODO: This could certainly be better. "Seen a lot of creeps" seems like a bad metric but it kinda hooks into denial?

				 // Probably want some fudge mixing kill, bC, denial, and energy costing the target room.
				 // And interestingCreepsSeenTotal.length is kinda a check to see if we're doing anything (ie. should not be zero or small)
				 // rather than a reason to launch again in itself

				 // On the other hand if we're doing something aren't we doing our job?

				let cost = (mmem.bC - mmem.denialCount * 2)

				for (let creepName in this.memory.assignedCreeps) {
					let creep = Game.creeps[creepName]
					if (!creep) continue

					cost += creep.mem.c * Memory.stats.yieldPerCPU
				}



				if ((mmem.killCount > Math.max(0, (mmem.bC - mmem.denialCount * 2)) || 
				 	mmem.tgtE - targetRoomEnergy >= (Memory.rooms[mmem.targetRoomName].trmX ? mmem.bC / 2 : mmem.bc / 4)) || 
				    mmem.interestingCreepsSeenTotal.length >= mmem.harassRooms.length * 4 * mmem.effectiveNumLaunches) {


					// Sanity check. Sum the K:Ds of our harass rooms to provide another confirmation that we're doing well.
					let sumKD = 0;
					for (let harassRoom of mmem.harassRooms) {
						if (Memory.rooms[harassRoom]) {
							sumKD += (Memory.rooms[harassRoom].kd || 0);
						}
					}

					// averageKD /= mmem.harassRooms.length;

					if (sumKD >= 0 && !this.renewRestricted()) {
						// Are our guys an effective team? Somebody may cripple us and leave us alive, and we don't want to keep
						// spawning in thinking life is going well.
						var effectiveTeam = false;
						for (var creepName of mmem.assignedCreeps) {
							var creep = Game.creeps[creepName];
							if (creep) {
								if (creep.hasActiveBodypart(RANGED_ATTACK) || creep.hasActiveBodypart(HEAL) || creep.hasActiveBodypart(ATTACK)) {
									effectiveTeam = true;
									break;
								}
							}
						}
						if (effectiveTeam) {
							console.log(mmem.sourceRoomName, "relaunching stakeout against", mmem.targetRoomName)
							console.log(mmem.killCount, mmem.bC, mmem.numLaunches)
							mmem.lastLastLaunchTick = mmem.lastLaunchTick;
							mmem.lastLaunchTick = Game.time;
							// Attenuate the kill count & cost. If we don't do that we could hit the case where we have 5 good launches we persist through 5 bad ones.
							mmem.killCount /= 2;
							mmem.bC /= 2;
							mmem.denialCount /= 2;
							mmem.numLaunches += 1;

							for (let roomName in mmem.roomKillCounts) {
								mmem.roomKillCounts[roomName] /= 2;
							}
							for (let roomName in mmem.roomDeathCounts) {
								mmem.roomDeathCounts[roomName] /= 2;
							}
							for (let roomName in mmem.roomMaxSeenStrengthRatios) {
								mmem.roomMaxSeenStrengthRatios[roomName] *= .9;
								
								if ((mmem.roomMaxSeenStrengthRatios[roomName] || 0) > 1.5) {
									mmem.roomMaxSeenStrengthRatios[roomName] *= .9
								}
								if ((mmem.roomMaxSeenStrengthRatios[roomName] || 0) > 2.5) {
									mmem.roomMaxSeenStrengthRatios[roomName] *= .9
								}
							}

							if (targetRoomEnergy > mmem.tgtE) {
								mmem.tgtE = targetRoomEnergy;
							}
							else {
								mmem.tgtE = (targetRoomEnergy + mmem.tgtE) / 2
							}
							mmem.effectiveNumLaunches += 1;
							
							// Memory can get out of hand
							if (mmem.interestingCreepsSeenTotal.length > 40) {
								let fractionToCutTo = (mmem.effectiveNumLaunches - 1) / mmem.effectiveNumLaunches
								let origLength = mmem.interestingCreepsSeenTotal.length;
								while (mmem.interestingCreepsSeenTotal.length && mmem.interestingCreepsSeenTotal.length > origLength * fractionToCutTo) {
									mmem.interestingCreepsSeenTotal.shift();
								}
								for (var roomName of mmem.harassRooms) {
									let origLength = mmem.interestingCreepsSeen[roomName].length;
									while (mmem.interestingCreepsSeen[roomName].length && mmem.interestingCreepsSeen[roomName].length > origLength * fractionToCutTo) {
										mmem.interestingCreepsSeen[roomName].shift();
									}
								}
								mmem.effectiveNumLaunches -= 1
							}


							this.requestSpawns();
						}
					}
				}
			}
		}

		super.tick();
	}

	requestSpawns() {
		this.memory.roome = this.memory.roome || {};

		// let useMoreRanged = 1

		for (var roomName of this.memory.harassRooms) {
			if (this.memory.roome[roomName] === undefined) {
				let effectiveRCL = Memory.rooms[this.memory.targetRoomName].nonLocalCombatCreeps ? 8 : Memory.rooms[this.memory.targetRoomName].rcl

				this.memory.roome[roomName] = Math.floor(Game.rooms[this.memory.sourceRoomName].effectiveLevel / 3 + effectiveRCL / 3);
			}
			else {
				let energyPerEscalation = RemoteStakeOutMission.getEnergyPerEscalation()
				// Don't escalate if we're already forbidding high priority missions
				let restrictHighPriorityMissions = Game.rooms[this.memory.sourceRoomName].restrictOffensiveMissions(this.memory.targetRoomName, false, false, true, this.memory.roome[roomName] * energyPerEscalation, true)

				// Not much going on, calm it a bit.
				if ((this.memory.roomMaxSeenStrengthRatios[roomName] || 0) < (restrictHighPriorityMissions ? 0.9 : 0.75)) {
					this.memory.roome[roomName] *= 0.9
				}
				// They're fighitng and we're losing some creeps (or not killing any of theirs). Step up.
				if (this.memory.roomDeathCounts[roomName] > 0.1 * this.memory.roomKillCounts[roomName] && !restrictHighPriorityMissions) {					
					if ((this.memory.roomMaxSeenStrengthRatios[roomName] || 0) > 1.05) {
						this.memory.roome[roomName] *= 1.1
					}
					if ((this.memory.roomMaxSeenStrengthRatios[roomName] || 0) > 1.5) {
						this.memory.roome[roomName] *= 1.1
					}
					if ((this.memory.roomMaxSeenStrengthRatios[roomName] || 0) > 2.5) {
						this.memory.roome[roomName] *= 1.1
					}
				}

				// Should I add more ranged if we're not dying? Makes for better farming
				// But also can't go back.
				// if (this.memory.roomDeathCounts[roomName] > 0.01 * this.memory.roome[roomName] * energyPerEscalation) {
				// 	useMoreRanged = 0;
				// }
			}
		}

		// if (useMoreRanged) {
		// 	this.memory.rangeHealRatio += 0.1
		// 	this.memory.rangeHealRatio = Math.min(this.memory.rangeHealRatio, 5)
		// }


		for (var roomName of this.memory.harassRooms) {
			this.requestSpawnsForRoom(roomName);
		}
	}

	static getEnergyPerEscalation() {
		return 700
	}


	requestSpawnsForRoom(campRoomName) {
		let parentRoom = Game.rooms[this.memory.sourceRoomName]
		let spawns = parentRoom.find(FIND_MY_SPAWNS);

		// Oh. Crap.
		if (spawns.length == 0) return;
		// let mem = Memory.rooms[this.memory.targetRoomName]

		if (Memory.rooms[campRoomName] && Memory.rooms[campRoomName].owner && Memory.rooms[campRoomName].twrX.length) {
			return 
		}

		// Don't want him debugging against these
		// if (Game.shard.name == "screepsplus2" && mem.owner == "Geir1983" && this.memory.maxE === undefined && !global.currentBoostedAssault.includes(mem.owner)) {
		// 	this.memory.fTick = Game.time - this.memory.fRefreshRate + 500
		// 	return false
		// }


		let spawn = spawns[0];
		let e = this.memory.roome[campRoomName];

		let energyPerEscalation = RemoteStakeOutMission.getEnergyPerEscalation();

		// console.log("Stakeout request spawns for room", campRoomName, e)

		if (this.memory.p < 0) {
			e *= 1.2;
		}

		if (this.memory.maxE) {
			e = Math.min(this.memory.maxE, e)
		}

		if (Memory.rooms[this.memory.targetRoomName] && Memory.rooms[this.memory.targetRoomName].owner) {
			Memory.attackFocus[Memory.rooms[this.memory.targetRoomName].owner] += e / 10
		}


		if (this.memory.cc) {
			// let mem = Memory.rooms[campRoomName];

			// let creepMemory = {targetRoom: campRoomName};

			let numCreeps = 1;

			// If they're trying to blockade-run civilian creeps, having more intercepters is good
			// But not if it costs all the CPU...
			if (Memory.rooms[this.memory.targetRoomName].nonLocalCivilianCreeps && !Memory.rooms[this.memory.targetRoomName].nonLocalCombatCreeps && Memory.stats.avgBucket > 9000) {
				numCreeps = 2;
				e /= 2;
			}

			e = Math.max(1, e)

			let healerEnergy = e * energyPerEscalation * 0.65
			if (Memory.rooms[campRoomName].DT < 0.5) {
				healerEnergy = healerEnergy * (0.5 + Memory.rooms[campRoomName].DT)
			}
			healerEnergy = Math.max(healerEnergy, BODYPART_COST[HEAL] + BODYPART_COST[MOVE])

			let swampRatio = roomIntel.getSwampRatio(campRoomName) / (1 - roomIntel.getWallRatio(campRoomName))

			let moveRatio = 1
			if (swampRatio > 0.8) {
				moveRatio = 5
			}
			else if (swampRatio > 0.7) {
				moveRatio = 4
			}
			else if (swampRatio > 0.6) {
				moveRatio = 3
			}
			else if (swampRatio > 0.5) {
				moveRatio = 2
			}

			let healer = creepCreator.createBestHeal(parentRoom, 0, false, false, Math.min(parentRoom.energyCapacityAvailable, healerEnergy), undefined, undefined, undefined, {moveRatio: moveRatio})
			let tank = creepCreator.createBestTank(parentRoom, false, false, Math.min(parentRoom.energyCapacityAvailable, e * energyPerEscalation * 0.35), undefined, undefined, undefined, undefined, {moveRatio: moveRatio})

			if (healer.body.length && tank.body.length) {
				for (let i = 0; i < numCreeps; i++) {					
					let formationCreepNames = [];
					formationCreepNames.push(this.spawnCreep("ranged", healer.body, healer.boosts, spawn, campRoomName, i % 2));
					formationCreepNames.push(this.spawnCreep("tank", tank.body, tank.boosts, spawn, campRoomName, i % 2));
					this.memory.formations.push(formationCreepNames);

					e -= Math.min((util.getECostForDesign(healer.body) + util.getECostForDesign(tank.body)) / energyPerEscalation, e);
				}
				if (e > 0 && e < 1) {
					e = 1;
				}
			}
		}

		
		if (e >= 0) {
			let body = [];
			let cost = 0

			let doubleCreeps = Memory.rooms[this.memory.targetRoomName].nonLocalCivilianCreeps && !Memory.rooms[this.memory.targetRoomName].nonLocalCombatCreeps && Memory.stats.avgBucket > 9000;

			if (doubleCreeps) {
				e /= 2;
			}

			if (e < 1) {
				if (this.memory.bodyOrder == 0 || this.memory.bodyOrder == 1) {
					body.push(RANGED_ATTACK);
					body.push(MOVE);
				}
				else {
					body.push(MOVE);
					body.push(RANGED_ATTACK);
				}
				cost = BODYPART_COST[MOVE] + BODYPART_COST[RANGED_ATTACK];
			}
			else {

				// Build a body based on this ratio for this.memory.e * energyPerEscalation energy.
				let targetRanged = 1;
				let targetHeal = 1;
				let maxCost = Math.min(parentRoom.energyCapacityAvailable, e * energyPerEscalation);

				let rangedHealRatio = this.memory.rangeHealRatio

				if (Memory.rooms[campRoomName].DT < 0.5) {
					rangedHealRatio = rangedHealRatio * (Math.min(3, 0.5 / Memory.rooms[campRoomName].DT))
				}

				console.log("Stakeout body builder", maxCost, e, rangedHealRatio, this.memory.bodyOrder)

				cost = BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[HEAL] + 2 * BODYPART_COST[MOVE];
				while ((targetRanged + targetHeal) * 2 < MAX_CREEP_SIZE) {
					let ratio = targetRanged / targetHeal;
					if (ratio < rangedHealRatio) {
						let newCost = cost + BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE];
						if (newCost <= maxCost) {
							console.log("Adding RA. New cost:", newCost)
							cost = newCost;
							targetRanged++;
						}
						else {
							break;
						}
					}
					else {
						let newCost = cost + BODYPART_COST[HEAL] + BODYPART_COST[MOVE];
						if (newCost <= maxCost) {
							console.log("Adding Heal. New cost:", newCost)
							cost = newCost;
							targetHeal++;
						}
						else {
							// Just plug on another RA. Why not.
							newCost = cost + BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE];
							if (newCost <= maxCost) {
								console.log("Adding RA. New cost:", newCost)
								cost = newCost;
								targetRanged++;
							}
							break;
						}
					}
				}

				let bonusCarry = 0;
				if (parentRoom.memory.spawnUtilization < 0.9) {
					while (cost <= maxCost - BODYPART_COST[MOVE] && bonusCarry < this.memory.maxBonusTough && (targetRanged + targetHeal) * 2 + bonusCarry < MAX_CREEP_SIZE) {
						bonusCarry += 1;
						cost += BODYPART_COST[MOVE];
						console.log("Adding move. New cost:", cost)
					}
				}

				for (let i = 0; i < bonusCarry; i++) {
					body.push(MOVE)
				}

				if (this.memory.bodyOrder == 0) {
					for (let i = 0; i < targetRanged; i++) {
						body.push(RANGED_ATTACK)
					}
					for (let i = 0; i < targetRanged + targetHeal - 1; i++) {
						body.push(MOVE)
					}
					for (let i = 0; i < targetHeal; i++) {
						body.push(HEAL)
					}

					body.push(MOVE)
				}
				else if (this.memory.bodyOrder == 1) {
					for (let i = 0; i < Math.floor((targetRanged + targetHeal) / 2); i++) {
						body.push(MOVE)
					}
					for (let i = 0; i < targetRanged; i++) {
						body.push(RANGED_ATTACK)
					}
					for (let i = 0; i < Math.ceil((targetRanged + targetHeal) / 2) - 1; i++) {
						body.push(MOVE)
					}
					for (let i = 0; i < targetHeal; i++) {
						body.push(HEAL)
					}

					body.push(MOVE)
				}
				else if (this.memory.bodyOrder == 2) {
					for (let i = 0; i < targetRanged + targetHeal - 1; i++) {
						body.push(MOVE)
					}
					for (let i = 0; i < targetRanged; i++) {
						body.push(RANGED_ATTACK)
					}
					for (let i = 0; i < targetHeal; i++) {
						body.push(HEAL)
					}

					body.push(MOVE)
				}
			}
			let numCreeps = Math.max((doubleCreeps ? 2 : 1), Math.round((doubleCreeps ? 2 : 1) * (e * energyPerEscalation) / cost));

			// If they're trying to blockade-run civilian creeps, having more intercepters is good
			// if (Memory.rooms[this.memory.targetRoomName].nonLocalCivilianCreeps && !Memory.rooms[this.memory.targetRoomName].nonLocalCombatCreeps) {
			// 	numCreeps = Math.max(2, numCreeps)
			// }

			// Err, this is getting out of control
			numCreeps = Math.min(numCreeps, Math.floor(spawns.length * 750 / (body.length * CREEP_SPAWN_TIME)))

			for (let i = 0; i < numCreeps; i++) {
				let idleCreep = idleCreepManager.getIdleCreepForBody(body, parentRoom);
				if (idleCreep && idleCreep.ticksToLive > 1100) {
					this.assignCreep(idleCreep, campRoomName, i % 2);
				}
				else {
					this.spawnCreep("ranged", body, {}, spawn, campRoomName, i % 2)
				}
			}
		}


		// Ok, we've decided to push this beyond the first.
		// Start spawning in special harass units
		if (this.memory.numLaunches > 1) {
			// If they're far enough away that I can be happy they're not my structures, then tear them down!
			if (Math.random() > 0.5) {
				let minDist = Infinity;
				let areStructures = false;

				let dist = safeRoute.getSafeRouteCost(this.memory.sourceRoomName, campRoomName, true);
				areStructures = areStructures || this.memory.hasStructures[campRoomName];
				if (dist < minDist) {
					minDist = dist;
				}

				if (areStructures && minDist > 3) {
					if (!Memory.usedRemotes.includes(campRoomName)) {					
						let maxCount = Math.min(Math.floor(parentRoom.energyCapacityAvailable / (2 * 150)), Math.floor(MAX_CREEP_SIZE / 2));
						let eCount = this.memory.e == 0 ? 1 : this.memory.e * 2.5;
						let count = Math.min(eCount, maxCount);

						let body = [];
						for (let i = 0; i < count; i++) {
							body.push(WORK)
						}
						for (let i = 0; i < count; i++) {
							body.push(MOVE)
						}

						if (this.memory.hasStructures[campRoomName]) {
							let idleCreep = idleCreepManager.getIdleCreepForBody(body, parentRoom);

							if (idleCreep && idleCreep.ticksToLive > 1100) {
								this.assignCreep(idleCreep, campRoomName);
							}
							else {
								this.spawnCreep("deconstructor", body, {}, spawn, campRoomName)
							}
						}
					}

				}
			}
		}
	}

	cleanMemory() {
		delete this.memory.roomKillCounts;
		delete this.memory.roomDeathCounts;
		delete this.memory.roomMaxSeenStrengthRatios;
		delete this.memory.cc;
		delete this.memory.formations;
		delete this.memory.hasStructures;
		delete this.memory.harassRooms;
		delete this.memory.interestingCreepsSeen;
		delete this.memory.interestingCreepsSeenTotal;
		delete this.memory.bouncedCount;

		delete this.memory.deathCount;

		return super.cleanMemory();
	}

	missionComplete(success) {
		this.cleanMemory();

		return super.missionComplete(success);
	}

	assignCreep(creep, campRoomName, creepNum) {
		if (!campRoomName && creep.memory.targetRoom && this.memory.harassRooms.includes(creep.memory.targetRoom)) {
			campRoomName = creep.memory.targetRoom
		}
		creep.mem.creepNum = creepNum
		// console.log("---------------- STAKEOUT ASSIGN CREEP????? ----------------")
		// console.log("---------------- STAKEOUT ASSIGN CREEP????? ----------------")
		// console.log("---------------- STAKEOUT ASSIGN CREEP????? ----------------")
		// console.log(creep, campRoomName)
		super.assignCreep(creep);
		if (campRoomName) creep.mem.targetRoom = campRoomName;
		// console.log(creep, creep.memory.targetRoom)
		// console.log("---------------- STAKEOUT ASSIGN CREEP????? ----------------")
		// console.log("---------------- STAKEOUT ASSIGN CREEP????? ----------------")
		// console.log("---------------- STAKEOUT ASSIGN CREEP????? ----------------")
	}

	spawnCreep(role, body, boosts, spawn, campRoomName, creepNum) {
		let extraMem = {targetRoom: campRoomName, fallbackRoom: this.memory.sourceRoomName, creepNum: creepNum};

		let name = super.spawnCreep(role, body, boosts, spawn, _.clone(extraMem))
		// console.log("Spawning", role, "to camp", campRoomName, name)
		return name
	}
}

module.exports = RemoteStakeOutMission