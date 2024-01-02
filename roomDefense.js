"use strict";

const Mission = require('missionBase')

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');



class RoomDefenseMission extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_ROOM_DEFENSE;

		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		// Get straight into it
		if (sourceRoomName == targetRoomName) {
			memory.pending = false;
		}
		else if (Game.rooms[targetRoomName] && !Game.rooms[targetRoomName].breached && Game.rooms[targetRoomName].towers.length > 0) {
			memory.pending = false;
		}

		if (sourceRoomName == targetRoomName) {
			memory.fRefreshRate = 100;
		}
		else {
			memory.fRefreshRate = 1500;
		}


		if (createNew && this.isActive()) {
			memory.clearCounter = 0;

			memory.targetRoomName = memory.targetRoomName || targetRoomName;

			memory.clearWaitTime = 25;

			memory.e = memory.e || 1;

			// This basically means they won't leave.
			// if (Game.rooms[targetRoomName] && Game.rooms[targetRoomName].effectiveLevel < 3) {
			// 	memory.clearWaitTime = 500;
			// }
			this.grabExtraCreeps(sourceRoomName);
			if (sourceRoomName != targetRoomName && !Memory.rooms[targetRoomName].hostileBoostedCreeps) {
				this.requestSpawns();
			}
		}
	}

	grabExtraCreeps(roomName) {
		 // Take all idle creeps. I guess only ranged guys will do the rampart stuff
		 // But if we've got some others, make them work!
		for (var idleCreep of _.clone(Memory.combatManager.idlePool)) {
			if (Game.creeps[idleCreep] && (Math.random() > .5 || Game.creeps[idleCreep].ticksToLive < 200)) {
				if (!idleCreepManager.canPullIdleCreep(Game.creeps[idleCreep], roomName)) {
					continue;
				}

				var pathCost = safeRoute.getSafeRouteCost(Game.creeps[idleCreep].room.name, roomName, true);

				if (pathCost > 4) continue;

				this.assignCreep(Game.creeps[idleCreep]);
				_.pull(Memory.combatManager.idlePool, idleCreep)
			}
		}
	}

	tick() {
		if (this.isActive() && Game.rooms[this.memory.targetRoomName]) {
			if (Math.random() < 0.02) {
				 this.grabExtraCreeps(this.memory.pending ? this.memory.sourceRoomName : this.memory.targetRoomName);
			}

			let room = Game.rooms[this.memory.targetRoomName]
			let threats = room.find(FIND_HOSTILE_CREEPS).concat(room.find(FIND_HOSTILE_POWER_CREEPS));

			if (this.memory.sourceRoomName != this.memory.targetRoomName) {
				let friends = room.find(FIND_MY_CREEPS);

				// It's gone tits up, reboot.
				if (friends.length == 0 && this.memory.spawningCreeps.length > 0 && Game.time - this.memory.startTick > 1000) {
					this.memory.pending = true;
					this.memory.startTick = Game.time;
				}
			}

			// Dead
			if (this.memory.assignedCreeps.length == 0 && this.memory.spawningCreeps.length == 0) {
				this.memory.fTick = Game.time;
				this.memory.f++;
				if (Game.time - this.memory.startTick < 1500) {
					this.memory.e += 1;
				}
				this.missionComplete(false);
				return;
			}

			// Don't set up for ever.
			if (Game.time - this.memory.startTick > 300) {
				this.memory.pending = false;
				for (var creepName of this.memory.assignedCreeps) {
					if (Game.creeps[creepName]) {
						Game.creeps[creepName].memory.retreat = false;
					}
				}
			}

			// Given
			if (!this.memory.pending) {
				for (var creepName of this.memory.assignedCreeps) {
					let creep = Game.creeps[creepName]
					if (Game.creeps[creepName]) {
						if (creep.room.name != creep.mem.sR) {
							creep.mem.sR = this.memory.targetRoomName;
							creep.ignoreCivilians = 1
						}
						creep.mem.fallbackRoom = this.memory.targetRoomName;
					}
				}
			}


			if (threats.length == 0 || (Game.rooms[this.memory.targetRoomName].controller.safeMode || 0) > 19000) {
				if (this.memory.clearCounter > this.memory.clearWaitTime || (Game.rooms[this.memory.targetRoomName].controller.safeMode || 0) > 19000) {
					// Ok, we completed
					if (Game.time - this.memory.startTick < 50) {
						// Oh, that was quick. We should probably get some data. It might be somebody
						// just popped in and straight back out again. That's expensive if it causes
						// a phat-ass defence to come out every time.

						// For now I'm not going to count it as a failure, however I will set a failure
						// tick, which will prevent us spawning anybody new to deal with it.
						this.memory.fTick = Game.time;
					}


					else {
						this.memory.s++;
						if (Math.random() < 0.2) {
							this.memory.e = Math.max(0, this.memory.e - 1);
						}
						this.missionComplete(true);
					}
					return;
				}
				else {
					// Love a good bit of noise this means we'll hang around for a non-deterministic time.
					if ((Memory.rooms[this.memory.targetRoomName].attackScore || 0) < 10000) {
						this.memory.clearCounter += Math.random() > 0.5 ? 1 : 0;
					}
				}
			}
			else {
				this.memory.clearCounter -= Math.random() > 0.5 ? 2 : 1;
				this.memory.clearCounter = Math.max(this.memory.clearCounter, 0)
			}
		   	for (var creepName of this.memory.assignedCreeps) {
		   		if (Game.creeps[creepName]) {
		   			Game.creeps[creepName].ramparter = true;
		   		}
		   	}
		}
		super.tick();
	}

	requestSpawns() {
		// If the other room is struggling, spawn the biggest rambo we can.
		let parentRoom = Game.rooms[this.memory.sourceRoomName]
		let targetRoom = Game.rooms[this.memory.targetRoomName]

		if (parentRoom == targetRoom) return;
		if (targetRoom.effectiveLevel > 5) return;

		let spawns = parentRoom.find2(FIND_MY_SPAWNS);

		// Oh. Crap.
		if (spawns.length == 0) return;

		let spawn = spawns[0];

		let unitCost = 4 * BODYPART_COST[RANGED_ATTACK] + 1 * BODYPART_COST[HEAL] + 5 * BODYPART_COST[MOVE];

		if (parentRoom.energyCapacityAvailable < unitCost) return

		let numUnits = Math.min(Math.floor(parentRoom.energyCapacityAvailable / unitCost), MAX_CREEP_SIZE / 10)

		let rangedBoost = parentRoom.getAvailableBoost(util.isRangedBoost, numUnits * 4 * LAB_BOOST_MINERAL);
		let healBoost  = parentRoom.getAvailableBoost(util.isHealBoost, numUnits * LAB_BOOST_MINERAL);

		let body = [];
		let boosts = {};


		for (var i = 0; i < numUnits * 4; i++) {
			body.push(RANGED_ATTACK)
			if (rangedBoost) {
				boosts[rangedBoost] = (boosts[rangedBoost] || 0) + 1
			}
		}
		for (var i = 0; i < Math.floor(numUnits * 2.5); i++) {
			body.push(MOVE)
		}
		for (var i = 0; i < numUnits; i++) {
			body.push(HEAL)
			if (healBoost) {
				boosts[healBoost] = (boosts[healBoost] || 0) + 1
			}
		}
		for (var i = 0; i < Math.ceil(numUnits * 2.5); i++) {
			body.push(MOVE)
		}

		for (var i = 0; i < this.memory.e; i++) {
			this.spawnCreep("ranged", body, boosts, spawn)
		}

		if (targetRoom.effectiveLevel < 3) {
			spawn.addPrioritySpawn("pioneer", {targetRoom : this.memory.targetRoomName});
		}
	}


	spawnCreep(role, body, boosts, spawn, extraMemory) {
		extraMemory = extraMemory || {};
		Object.assign(extraMemory, {targetRoom : this.memory.targetRoomName, fallbackRoom: this.memory.sourceRoomName})

		super.spawnCreep(role, body, boosts, spawn, extraMemory)
	}

	assignCreep(creep) {
		super.assignCreep(creep);
		creep.mem.targetRoom = this.memory.targetRoomName
	}

	get targetRoomName() {
		return this.memory.targetRoomName;
	}
}
module.exports = RoomDefenseMission