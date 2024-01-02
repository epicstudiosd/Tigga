"use strict";

const Mission = require('missionBase')

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');
const creepCreator = require('creepCreator');
const intelAI = require('intelAI');
const roomIntel = require('roomIntel');

const defenseAnalysis = require("defenseAnalysis")



class RoomSourceRaidMission extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, targetSourceId, createNew, priority) {
		memory.type = memory.type || MISSION_ROOM_SOURCE_RAID;

		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		// If we fail, don't go again for a while.
		if (createNew && this.isActive()) {
			memory.targetRoomName = memory.targetRoomName || targetRoomName;
			memory.targetSourceId = memory.targetSourceId || targetSourceId;

			memory.fRefreshRate = memory.fRefreshRate || 10000;

			memory.routeCost = safeRoute.getSafeRouteCost(sourceRoomName, targetRoomName, true) || 15;

			memory.formations = [];
			memory.ticksInRoom = 0
			memory.anyDamageDone = 0

			var bestSetupRoom;
			var bestExitDir;
			var bestExitCost = Infinity;

			var exits = Game.map.describeExits(this.memory.targetRoomName);
			for (var exitDir in exits) {
				var exitRoom = exits[exitDir];

				if (!Memory.rooms[exitRoom]) {
					continue;
				}
				if (Memory.rooms[exitRoom].owner && Memory.rooms[exitRoom].owner != util.getMyName()) {
					continue;
				}

			 	if (Memory.rooms[exitRoom].fullyConnected === 0) {
			 		continue;
			 	}

				var exitCost = safeRoute.getSafeRouteCost(this.memory.sourceRoomName, exitRoom, true);

				if (exitCost > 15) {
					continue;
				}

				let damage;
				if (Memory.rooms[targetRoomName].pathTowerDamageToSourcesByEdge1x1[targetSourceId][Math.round((parseInt(exitDir) - 1) / 2)]) {
					damage = Memory.rooms[targetRoomName].pathTowerDamageToSourcesByEdge1x1[targetSourceId][Math.round((parseInt(exitDir) - 1) / 2)]
				}
				else {
					continue
				}

				// 40 healing is the most we can do
				if (damage > 480) {
					continue
				}

				exitCost += damage * damage / 15000
				exitCost += Math.random() * 2

				if (exitCost < bestExitCost) {
					bestExitCost = exitCost;
					bestSetupRoom = exitRoom;
					bestExitDir = exitDir;
				}
			}

			if (bestSetupRoom === undefined) {
				console.log(this.memory.type + " " + "couldn't find a best setup room")
				this.ID = 0
				return
			}

			this.memory.bestSetupRoom = bestSetupRoom
			this.memory.bestExitIdx = Math.round((parseInt(bestExitDir) - 1) / 2)
		}
	}

	static getMinEnergyCost(targetRoomName, targetSourceId) {
		let mem = Memory.rooms[targetRoomName]
		if (_.any(mem.sourcesExposedToEdge[targetSourceId]) || _.any(mem.sourcesNearlyExposedToEdge[targetSourceId])) {
			let minDamage = Infinity;
			for (let i = 0; i < 4; i++) {
				if (mem.pathTowerDamageToSourcesByEdge1x1[targetSourceId][i]) {
					minDamage = Math.min(minDamage, mem.pathTowerDamageToSourcesByEdge1x1[targetSourceId][i])
				}
			}
		
			return 10 * (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE]) + Math.ceil(minDamage / HEAL_POWER) * (BODYPART_COST[HEAL] + BODYPART_COST[MOVE])
		}


		// Not sure I should even be here
		return Infinity
	}



	tick() {
		// let a = Game.cpu.getUsed()
		let mmem = this.memory;
		if (this.isActive()) {
			let targetRoomName = mmem.targetRoomName;
			let sourceRoomName = mmem.sourceRoomName;
			let tmem = Memory.rooms[targetRoomName];

			if (Math.random() < 0.01) {
				this.memory.routeCost = safeRoute.getSafeRouteCost(sourceRoomName, targetRoomName, true) || this.memory.routeCost;
			}

			if (Game.rooms[this.memory.targetRoomName]) {
				if (this.memory.startWallHP === undefined || this.memory.startRampHP === undefined || this.memory.startEnergy === undefined) {
					let defensiveStructures = Game.rooms[this.memory.targetRoomName].find(FIND_STRUCTURES, {
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

					let totalEnergy = 0;
					for (var towerIdx in Memory.rooms[this.memory.targetRoomName].twrX) {
						totalEnergy += Memory.rooms[this.memory.targetRoomName].twrE[towerIdx];
					}
					totalEnergy += Memory.rooms[this.memory.targetRoomName].storE || 0;
					totalEnergy += Memory.rooms[this.memory.targetRoomName].trmE || 0;

					this.memory.startEnergy = totalEnergy
				}
			}

			if (!tmem) {
				console.log(mmem.type, "can't find room in memory!", mmem.targetRoomName);
				mmem.fTick = Game.time;
				mmem.f++;
				this.missionComplete(false);
				return;
			}

			let useShift = false;
			let anyInTargetRoom = false;
			// This is a bit more expensive than I'd like.
			for (let formationIdx in this.memory.formations) {
				let formation = this.memory.formations[formationIdx];

				let cnt = 0;
				for (let formationCreepName of formation) {
					let formationCreep = Game.creeps[formationCreepName]
					if (!formationCreep) continue;
					cnt ++

					formationCreep.mem.formationCreeps = _.clone(formation);
					formationCreep.mem.allSquadCreeps = _.clone(formation);
					// formationCreep.combatSnake = 1;
					formationCreep.assaulter = 1;
					// formationCreep.assaultSnake = 1;

					if (formationCreep.room.name == this.memory.targetRoomName) {
						anyInTargetRoom = true
						if (mmem.anyDamageDone < 100) {
							if (formationCreep.pos.findFirstInRange(FIND_HOSTILE_CREEPS, 3)) {
								mmem.anyDamageDone++;
							}

							let structs = formationCreep.pos.findInRange(FIND_STRUCTURES, 3, {filter: (structure) => {
									return structure.hits && !structure.my;
								}
							})
							if (structs.length) {
								mmem.anyDamageDone++;
							}
						}
					}

					formationCreep.mem.target = {x: tmem.srcPos[mmem.targetSourceId].x, y: tmem.srcPos[mmem.targetSourceId].y, roomName: targetRoomName} 
				}

				// Old and dead formation. Clean it.
				if (formationIdx == 0 && cnt == 0 && this.memory.formations.length > 5) {
					useShift = true;
				}
			}



			if (anyInTargetRoom) {
				defenseAnalysis.run(Game.rooms[this.memory.targetRoomName])
				this.memory.startEnergy += (Memory.rooms[this.memory.targetRoomName].termEnergyInPerTick || 0)
				this.memory.ticksInRoom = (this.memory.ticksInRoom || 0) + 1
			}
			else if (!Game.rooms[this.memory.targetRoomName]) {
				delete tmem.meanActiveTowers;
			}




			if (useShift) {
				this.memory.formations.shift();
			}


			if (Game.rooms[targetRoomName] && Game.rooms[targetRoomName].controller.safeMode) {
				// They safe moded
				console.log("Source raid has triggered safe mode", targetRoomName)
				mmem.s++;
				this.missionComplete(true);
				return;
			}
			// Room is no longer owned by somebody else.
			else if (Game.rooms[targetRoomName] &&
				(!Game.rooms[targetRoomName].controller.owner || Game.rooms[targetRoomName].controller.owner.username == util.getMyName())) {
				console.log("Source raid attack has removed owner", targetRoomName);
				mmem.s++;
				this.missionComplete(true);
				return;
			}
			else if (Game.rooms[targetRoomName] && (Game.rooms[targetRoomName].mem.twrX.length == 0 || Game.rooms[targetRoomName].mem.spwnX.length == 0)) {
				console.log("Source raid no tower or no spawn", targetRoomName);
				mmem.s++;
				this.missionComplete(true);
				return;
			}
			else if (mmem.assignedCreeps.length == 0 && mmem.spawningCreeps.length == 0) {
				if (Game.time - mmem.lastLaunchTick <= 1100) { 
					if (Game.time - mmem.lastLaunchTick == 1) {
						console.log("Source raid attack has crapped out on launch", targetRoomName, Game.time - mmem.lastLaunchTick)
						this.missionComplete(true);
						return;
					}
					else {
						console.log("Source raid attack has lost all creeps earlier than desired", targetRoomName, Game.time - mmem.lastLaunchTick)

						// If we lived more than 500 ticks post launch, just escalate it.
						if (Game.time - mmem.lastLaunchTick < 500) {
							mmem.fTick = Game.time;
							this.missionComplete(false);
						}
						else {
							this.missionComplete(true);
						}
						return;
					}
				}
				// Mission complete! Our creeps should live at least 1500 ticks, and we've decided not to respawn for some reason.
				else {
					console.log("Source raid attack has lost all creeps as expected", targetRoomName)
					mmem.s++;
					this.missionComplete(true);
					return;
				}
			}
			// Need moar. Our last guys are still alive, so back them up.
			// It's ok to have a bit of a gap between arrivals. The point is to deny it
			// it's unlikely they'll sneak in and get much done and maybe they'll sneak in and rebuild stuff
			// that I can then trash
			else if (Game.time - mmem.lastLaunchTick >= (mmem.anyDamageDone >= 100 ? 1500 : 1350 - (mmem.routeCost || 5) * 50) &&
					 mmem.spawningCreeps.length == 0 &&
					 Game.rooms[targetRoomName] &&
					 util.isRoomAccessible(targetRoomName) &&
					 !this.renewRestricted()) {

				var totalEnergy = 0;
				for (var towerIdx in Memory.rooms[this.memory.targetRoomName].twrX) {
					totalEnergy += Memory.rooms[this.memory.targetRoomName].twrE[towerIdx];
				}

				let storedEnergy = (Memory.rooms[this.memory.targetRoomName].storE || 0) + (Memory.rooms[this.memory.targetRoomName].trmE || 0)

				totalEnergy += storedEnergy

				let energyDrained = this.memory.startEnergy - totalEnergy + (this.memory.startWallHP + this.memory.startRampHP - tmem.wallHP - tmem.rampHP) / 100 + this.memory.ticksInRoom * 10;

				if (Game.time % 10 == 0) {
					console.log("roomSourceRaid renew", energyDrained, this.memory.bC)
				}

				// Push a bit longer if it's actually drained out
				if (energyDrained > this.memory.bC * (storedEnergy == 0 ? 0.5 : 1)) {					
					// Quick sanity check: are our guys an effective team? Somebody may cripple us and leave us alive, and we don't want to keep
					// spawning in thinking life is going well.
					var effectiveTeam = false;
					for (var creepName of mmem.assignedCreeps) {
						var creep = Game.creeps[creepName];
						if (creep) {
							if (creep.getActiveBodyparts(RANGED_ATTACK) > 0 || creep.getActiveBodyparts(HEAL) > 0) {
								effectiveTeam = true;
								break;
							}
						}
					}
					if (effectiveTeam) {
						mmem.lastLaunchTick = Game.time;
						mmem.anyDamageDone = 0

						console.log("Renewing", sourceRoomName, "source raid attack against", targetRoomName)
						this.requestSpawns();
					}
				}
			}
		}

		this.formationPairRenew()

		// console.log("e", Game.cpu.getUsed() - a)

		super.tick();

		// console.log("f", Game.cpu.getUsed() - a)
	}

	requestSpawns() {
		let mem = Memory.rooms[this.memory.targetRoomName]

		// Don't want him debugging against these
		// if (Game.shard.name == "screepsplus2" && mem.owner == "Geir1983" && !global.currentBoostedAssault.includes(mem.owner)) {
		// 	this.memory.fTick = Game.time - this.memory.fRefreshRate + 500
		// 	return false
		// }

		var parentRoom = Game.rooms[this.memory.sourceRoomName]
		var spawns = parentRoom.find2(FIND_MY_SPAWNS);
		// Oh. Crap.
		if (spawns.length == 0) return;

		// let maxNumCreeps = 

		var spawn = spawns[0];

		let minDamage = mem.pathTowerDamageToSourcesByEdge1x1[this.memory.targetSourceId][this.memory.bestExitIdx];

		let healNeededPerCreep = Math.ceil(0.8 * minDamage / (2 * HEAL_POWER))
		let healDesiredPerCreep = Math.ceil(1.1 * minDamage / (2 * HEAL_POWER))
		let rangedNeededPerCreep = 3;

		let energyNeeded = rangedNeededPerCreep * (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE]) + healNeededPerCreep * (BODYPART_COST[HEAL] + BODYPART_COST[MOVE])

		while (healNeededPerCreep < healDesiredPerCreep && (rangedNeededPerCreep + healNeededPerCreep + 1) * 2 <= MAX_CREEP_SIZE && energyNeeded + (BODYPART_COST[HEAL] + BODYPART_COST[MOVE]) <= parentRoom.energyCapacityAvailable) {
			healNeededPerCreep++;
			energyNeeded += (BODYPART_COST[HEAL] + BODYPART_COST[MOVE])
		}

		// Add more ranged. There are ramparts to kill
		if (!mem.sourcesExposedToEdge[this.memory.bestExitIdx]) {
			while (rangedNeededPerCreep < healNeededPerCreep && (rangedNeededPerCreep + 1 + healNeededPerCreep) * 2 <= MAX_CREEP_SIZE && energyNeeded + (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE]) <= parentRoom.energyCapacityAvailable) {
				rangedNeededPerCreep++;
				energyNeeded += (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE])
			}
		}

		if (energyNeeded > parentRoom.energyCapacityAvailable) {
			console.log("Source raid wanting more energy than I got", rangedNeededPerCreep, healNeededPerCreep, energyNeeded, parentRoom, parentRoom.energyCapacityAvailable)
			return false;
		}
		else if ((rangedNeededPerCreep + healNeededPerCreep) * 2 > MAX_CREEP_SIZE) {
			console.log("Source raid wanting more than 50 parts per creep", rangedNeededPerCreep, healNeededPerCreep)
			return false;
		}

		if (Memory.rooms[this.memory.targetRoomName] && Memory.rooms[this.memory.targetRoomName].owner) {
			Memory.attackFocus[Memory.rooms[this.memory.targetRoomName].owner] += 1
		}


		let numCreeps
		if (((healNeededPerCreep + rangedNeededPerCreep) * 2) * 2 <= MAX_CREEP_SIZE && energyNeeded * 2 <= parentRoom.energyCapacityAvailable) {
			numCreeps = 1;
			healNeededPerCreep *= 2
			rangedNeededPerCreep *= 2
		}
		else {
			numCreeps = 2
		}

		let body = []

		for (let i = 0; i < rangedNeededPerCreep; i++) {
			body.push(RANGED_ATTACK)
		}
		for (let i = 0; i < rangedNeededPerCreep + healNeededPerCreep - 1; i++) {
			body.push(MOVE)
		}
		for (let i = 0; i < healNeededPerCreep; i++) {
			body.push(HEAL)
		}

		body.push(MOVE)

		let formationCreepNames = [];

		for (let i = 0; i < numCreeps; i++) {
			// if (idleCreep && idleCreep.ticksToLive > 1300) {
			// 	this.assignCreep(idleCreep);
			// 	formationCreepNames.push(idleCreep.name)
			// }
			// else {
				formationCreepNames.push(this.spawnCreep("ranged", body, {}, spawn))
			// }
		}


		this.memory.formations.push(formationCreepNames);
		this.memory.lastLaunchTick = Game.time
		return true;
	}

	missionComplete(success) {
		delete this.memory.formations;
		delete this.memory.bestSetupRoom;
		delete this.memory.bestExitIdx;

		super.missionComplete(success);
	}

	spawnCreep(role, body, boosts, spawn) {
		return super.spawnCreep(role, body, boosts, spawn, {targetRoom : this.memory.targetRoomName, targetSourceId: this.memory.targetSourceId, setupRoom: this.memory.bestSetupRoom, fallbackRoom: this.memory.sourceRoomName})
	}

	assignCreep(creep) {
		super.assignCreep(creep);
		creep.memory.targetRoom = this.memory.targetRoomName
	}

	get targetRoomName() {
		return this.memory.targetRoomName;
	}
}
module.exports = RoomSourceRaidMission