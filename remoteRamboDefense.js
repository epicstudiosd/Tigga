"use strict";

const idleCreepManager = require('idleCreepManager')
const Mission = require('missionBase')
const safeRoute = require('safeRoute');
const creepCreator = require('creepCreator');

const constants = require('constants');
const util = require("util")


// Mission id != 0 means active mission, otherwise it's inactive
class RemoteRamboDefenseMission extends Mission {
	constructor(memory, sourceRoomName, protectRoomNames, createNew, priority) {
		memory.type = memory.type || MISSION_REMOTE_RAMBO_DEFENSE;

		super(memory, sourceRoomName, sourceRoomName, createNew, priority);
		if (createNew && this.isActive()) {
			// If we fail, don't go back for a bit.
			memory.fRefreshRate = 3000;

			memory.e = memory.e || 0;

			memory.protectRoomNames = [];
			for (let protectRoomName of protectRoomNames) {
				if (Memory.rooms[protectRoomName] && !Memory.rooms[protectRoomName].owner) {
					memory.protectRoomNames.push(protectRoomName);
				}
			}

			memory.targetRoomName = _.sample(memory.protectRoomNames);
		}
	}

	grabExtraCreeps(roomName) {
		for (var idleCreep of _.clone(Memory.combatManager.idlePool)) {
			if (Game.creeps[idleCreep] && (Math.random() > .25 || Game.creeps[idleCreep].ticksToLive < 200)) {
				if (!idleCreepManager.canPullIdleCreep(Game.creeps[idleCreep], roomName)) {
					continue;
				}

				var pathCost = safeRoute.getSafeRouteCost(Game.creeps[idleCreep].room.name, roomName, false);

				if (pathCost > 4) continue;

				this.assignCreep(Game.creeps[idleCreep]);
				_.pull(Memory.combatManager.idlePool, idleCreep)
			}
		}
	}

	tick() {
		if (this.isActive()) {
			let threats;
			if (Game.rooms[this.memory.targetRoomName]) {
				threats = Game.rooms[this.memory.targetRoomName].find2(FIND_HOSTILE_CREEPS, {
					filter: function(object) {
						if (object.owner.username == "Source Keeper") {
							return false;
						}
						return true;
					}
				});

				threats = threats.concat(Game.rooms[this.memory.targetRoomName].find2(FIND_HOSTILE_POWER_CREEPS));
			}

			if (Game.rooms[this.memory.targetRoomName] && threats.length == 0) {
				this.memory.targetRoomName = _.sample(this.memory.protectRoomNames);

				for (let creepName of this.memory.assignedCreeps) {
					if (Game.creeps[creepName]) {
						Game.creeps[creepName].mem.targetRoom = this.memory.targetRoomName;
					}
				}
			}

			// Dead
			if (this.memory.assignedCreeps.length == 0 && this.memory.spawningCreeps.length == 0) {
				this.memory.e++;
				this.memory.fTick = Game.time;
				this.memory.f++;
				this.missionComplete(false);
				return;
			}

			for (let creepName of this.memory.assignedCreeps) {
				if (Game.creeps[creepName] && this.memory.protectRoomNames.indexOf(Game.creeps[creepName].room.name) == -1 && Game.creeps[creepName].hits == Game.creeps[creepName].hitsMax) {
					Game.creeps[creepName].forceMoveRooms = true;
				}
			}

			let complete = true;
			for (let protectRoomName of this.memory.protectRoomNames) {
				if (!Game.rooms[protectRoomName]) {
					complete = false;
					break;
				}
				else if (Game.rooms[protectRoomName] && Game.rooms[protectRoomName].dangerous) {
					complete = false;
					break;
				}
				else if (Memory.rooms[protectRoomName].DT > 0.75) {
					complete = false;
					break;
				}
			}

			if (complete) {
				if (Math.random() < 0.1) {
					this.memory.e--;
				}
				this.memory.s++;
				this.missionComplete(true);
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

		let ret = creepCreator.createRambo(parentRoom, this.memory.protectRoomNames, 1, 0, 0, 0, false, this.memory.e)

		if (ret.body.length > 0) {
			console.log(this.memory.type, "RAMBO spawning for", this.memory.protectRoomNames, "from", parentRoom.name)
			this.spawnCreep("ranged", ret.body, ret.boosts, spawn)
			return true
		}
	}

	spawnCreep(role, body, boosts, spawn) {
		let diff = util.getECostForDesign(body) * (1 - Math.exp(-(1/3000.))) / this.memory.protectRoomNames.length
		for (let roomName of this.memory.protectRoomNames) {
			if (Memory.rooms[roomName].meanHarvestYeild) {
				Memory.rooms[roomName].meanHarvestYeild -= diff;
			}
		}


		super.spawnCreep(role, body, boosts, spawn, {targetRoom : this.memory.targetRoomName, fallbackRoom: this.memory.sourceRoomName})
	}

	assignCreep(creep) {
		super.assignCreep(creep);
		creep.memory.targetRoom = this.memory.targetRoomName
	}

	get targetRoomName() {
		return this.memory.targetRoomName;
	}
}

module.exports = RemoteRamboDefenseMission