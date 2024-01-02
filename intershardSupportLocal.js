"use strict";

const Mission = require('missionBase')

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');
const constants = require('constants');

const interShardMemoryManager = require('interShardMemoryManager');



class InterShardSupportMissionLocal extends Mission {
	constructor(memory, targetRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_INTERSHARD_SUPPORT_LOCAL;

		// Do this before we make our mission active.
		super(memory, null, targetRoomName, createNew, priority);

		if (createNew && this.isActive()) {
			memory.targetRoomName = targetRoomName
			memory.pending = 0;
			if (memory.assignedCreeps.length == 0) {
				this.grabCreeps();
			}
		}
	}

	grabCreeps() {
		for (let creepName in Game.creeps) {
			if (!Memory.creeps[creepName]) continue
			if (!(["intershardRanged", "intershardPairedHealer", "intershardPairedTank"].includes(Memory.creeps[creepName].role))) continue

			// Now we have all the intershard combat creeps
			if (Memory.creeps[creepName].ID === undefined) {
				this.memory.assignedCreeps.push(creepName)
				Memory.creeps[creepName].ID = this.memory.ID
			}
		}
	}

	tick() {
		global.runningIntershardLocal = 1;
		let homeRoom = Game.rooms[this.memory.targetRoomName]

		if (!homeRoom) return		
		// "intershardRanged"
		// "intershardPairedHealer"
		// "intershardPairedTank"
		// Grab creeps for management
		if (Math.random() < 0.05) {
			this.grabCreeps();

			for (let creepName of _.clone(this.memory.assignedCreeps)) {
				if (!Game.creeps[creepName]) {
					_.pull(this.memory.assignedCreeps, creepName)
				}
			}

			for (let shard of global.activeShards) {
				if (shard == Game.shard.name) continue
				let isMemory = interShardMemoryManager.getMem(shard);

				// They're helping
				if (isMemory.isSupportData && isMemory.isSupportData[Game.shard.name] && isMemory.isSupportData[Game.shard.name].targetRoom == this.memory.targetRoomName) {
					// This is per wave, and we expect ~2 waves worth at any given time
					let expectedNumCreeps = isMemory.isSupportData[Game.shard.name].expectedCombatCreeps * 2

					let actualNumCreeps = 0;
					for (let creepName of this.memory.assignedCreeps) {
						// if (Game.creeps[creepName] && Game.creeps[creepName].ticksToLive > 50) {
							actualNumCreeps++
						// }
					}
					// this.memory.assignedCreeps.length

					// If we have half as many creeps as expected, shift spawn 150 ticks closer. If we have none, move it 450.
					// eg. (0 - x) / x) == -1/2 * 450 = -450
					// eg. (x/2 - x) / x) == -1/2 * 450 = -225
					// Can't push it too late or it goes wrong and we have gaps with no defenses at all
					let spawnOffset = Math.min(100, (actualNumCreeps - expectedNumCreeps) / (expectedNumCreeps) * 225)

					// This is pretty hair trigger
					if (!Game.rooms[this.memory.targetRoomName] || !Game.rooms[this.memory.targetRoomName].controller.safeMode) {						
						if (Memory.rooms[this.memory.targetRoomName].attackScore) {
							spawnOffset -= 100 * Math.min(Memory.rooms[this.memory.targetRoomName].attackScore, 3e6) / 3e6
						}
					}

					spawnOffset = Math.round(spawnOffset)

					let localIsMem = interShardMemoryManager.getMem(Game.shard.name);

					// If we're really wiped out, mark that and delay the spawn offset significantly
					// If they bursted, this will let the enemy TTL out
					let dead = expectedNumCreeps > 10 * actualNumCreeps && Game.rooms[this.memory.targetRoomName].effectiveLevel == 1

					if (dead) {
						spawnOffset = 1000
					}

					localIsMem.isSupportData = localIsMem.isSupportData || {}
					localIsMem.isSupportData[this.memory.targetRoomName] = {spawnOffset: spawnOffset, dead: dead}

					interShardMemoryManager.touchLocal();

					console.log("Local intershard", this.memory.targetRoomName, "Expected", expectedNumCreeps, "creeps. Have", actualNumCreeps, ". Offseting new spawn by", spawnOffset, "ticks")
				}
			}



			if (this.memory.assignedCreeps.length == 0) {			
				this.missionComplete()
				return
			}
		}

		let actuallyDangerous
		if (homeRoom.dangerous == 2) {
			let hostileCreepCombatPartsRanged = 0;
			let hostileCreepCombatPartsAttack = 0;

			let friendCreepCombatPartsRanged = 0;
			let friendCreepCombatPartsAttack = 0;


			for (let creep of homeRoom.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK], false)) {
				var combatParts = creep.getBoostModifiedCombatParts(false, true);
				hostileCreepCombatPartsRanged += combatParts.numRanged;
				hostileCreepCombatPartsAttack += combatParts.numAttack;
			}

			for (let creep of homeRoom.getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK], false)) {
				var combatParts = creep.getBoostModifiedCombatParts(false, true);
				friendCreepCombatPartsRanged += combatParts.numRanged;
				friendCreepCombatPartsAttack += combatParts.numAttack;
			}

			if (friendCreepCombatPartsRanged >= 3 * (hostileCreepCombatPartsRanged || 0) &&
				friendCreepCombatPartsAttack >= 3 * (hostileCreepCombatPartsAttack || 0)) {
				actuallyDangerous = 0
			}
			else if (friendCreepCombatPartsRanged >= 1.5 * (hostileCreepCombatPartsRanged || 0) &&
				friendCreepCombatPartsAttack >= 1.5 * (hostileCreepCombatPartsAttack || 0)) {
				actuallyDangerous = 1
			}
			else {
				actuallyDangerous = 2
			}
		}


		if (actuallyDangerous) {
			for (let creepName of this.memory.assignedCreeps) {
				let creep = Game.creeps[creepName]
				if (!creep) continue

				if (creep.mem.targetRoom != this.memory.targetRoomName) {					
					creep.mem.oldTargetRoom = creep.mem.targetRoom
					creep.mem.targetRoom = this.memory.targetRoomName
				}
				
				if (actuallyDangerous == 2) {					
					// Don't push there hard if it's already lost
					if (creep.room.name != creep.mem.targetRoom && 
						Memory.rooms[this.memory.targetRoomName].attackScore > 1e6 && 
						Game.rooms[this.memory.targetRoomName] &&
						Game.rooms[this.memory.targetRoomName].find(FIND_MY_CREEPS).length > 3 &&
						Game.rooms[this.memory.targetRoomName].ramparts.length &&
					    (Game.rooms[this.memory.targetRoomName].towers.length || Game.rooms[this.memory.targetRoomName].spawns.length || Game.rooms[this.memory.targetRoomName].storage)) {
						// Settting this gets really really ugly
						// creep.forceMoveRooms = 1
						creep.moveRooms = 1
					}
				}
			}
		}
		// Reshuffle to dangerous rooms
		else if (Math.random() < 0.05) {
			for (let creepName of this.memory.assignedCreeps) {
				let creep = Game.creeps[creepName]
				if (!creep) continue

				if (creep.mem.oldTargetRoom) continue

				if ((creep.room.dangerous && creep.room.memory.hostileBoostedCreeps) || !creep.mem.combatRooms) continue

				// These guys are tasked with defending the main room
				// if (creep.mem.targetRoom == this.memory.targetRoomName) continue

				let foundRoom = false;

				for (let testRoomName of _.shuffle(creep.mem.combatRooms)) {
					if (Game.map.getRoomLinearDistance(creep.mem.targetRoom, testRoomName) > 1 && creep.room.memory.DT > 0.2) {
						continue
					}
					if (!Memory.rooms[testRoomName] || Memory.rooms[testRoomName].safeMode) continue

					let testRoom = Game.rooms[testRoomName]
					if (!testRoom || (testRoom.dangerous && testRoom.memory.hostileBoostedCreeps)) {
						creep.mem.oldTargetRoom = creep.mem.targetRoom
						creep.mem.targetRoom = testRoomName
						foundRoom = true
						break;
					}
				}

				// Go find a fight (if I have bucket)
				if (!foundRoom && creep.mem.roam && creep.room.memory.DT < 0.2 && Game.cpu.bucket > 9000) {
					for (let testRoomName of _.shuffle(Object.values(Game.map.describeExits(creep.room.name)))) {

						if (!Memory.rooms[testRoomName] || Memory.rooms[testRoomName].safeMode) {
							continue
						}

						if (Memory.rooms[testRoomName].owner && (Memory.rooms[testRoomName].safeMode || (Memory.rooms[testRoomName].twrX && Memory.rooms[testRoomName].twrX.length > 1))) {
							continue
						}

						if ((Memory.rooms[testRoomName].kd || 0) < 0) {
							continue
						}

						let testRoom = Game.rooms[testRoomName]
						if (!testRoom || (testRoom.dangerous && testRoom.memory.hostileBoostedCreeps)) {
							creep.mem.oldTargetRoom = creep.mem.targetRoom
							creep.mem.targetRoom = testRoomName
							foundRoom = true
							break;
						}
					}
				}
			}
		}
		else if (Math.random() < 0.2) {
			for (let creepName of this.memory.assignedCreeps) {
				let creep = Game.creeps[creepName]
				if (!creep) continue

				if (!creep.mem.oldTargetRoom) continue

				let testRoom = Game.rooms[creep.mem.targetRoom]
				// Carry on
				if (!testRoom || (testRoom.dangerous && testRoom.memory.hostileBoostedCreeps)) continue

				// Nothing to see, go back
				creep.mem.targetRoom = creep.mem.oldTargetRoom
				delete creep.mem.oldTargetRoom

			}
		}

		if (Math.random() < 0.01) {
			for (let creepName of this.memory.assignedCreeps) {
				let creep = Game.creeps[creepName]
				if (!creep) continue

				if (!Memory.rooms[this.memory.targetRoomName].lootRooms.includes(creep.mem.targetRoom)) {
					Memory.rooms[this.memory.targetRoomName].lootRooms.push(creep.mem.targetRoom)
				}
			}
		}
	}


	requestSpawns() {
	
	}


	missionComplete(success) {
		let localIsMem = interShardMemoryManager.getMem(Game.shard.name);

		localIsMem.isSupportData = localIsMem.isSupportData || {}
		delete localIsMem.isSupportData[this.memory.targetRoomName]

		interShardMemoryManager.touchLocal();

		return super.missionComplete(success);
	}


	assignCreep(creep) {
	}

	spawnCreep(role, body, boosts, spawn, mem, name) {
	}

	get targetRoomName() {
		return this.memory.targetRoomName;
	}
}

module.exports = InterShardSupportMissionLocal