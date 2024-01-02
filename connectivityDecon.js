"use strict";

const Mission = require('missionBase')
const idleCreepManager = require('idleCreepManager')

const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute')
const util = require('util')


class ConnectivityDecon extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_CONNECTIVITY_DECON;

		// Do this before we make our mission active.
		super(memory, sourceRoomName, targetRoomName, createNew, priority);
		if (createNew && this.isActive()) {

			memory.targetRoomName = memory.targetRoomName || targetRoomName;

			// If we fail, don't go back for a bit.
			memory.fRefreshRate = memory.fRefreshRate || 25500;
		}
	}

	tick() {
		let mmem = this.memory;
		if (this.isActive() && ((mmem.assignedCreeps.length == 0 && mmem.spawningCreeps.length == 0) || Game.time - mmem.lastLaunchTick > 2000)) {
			// Completion should be "we're all dead".
			// I think if it's a long time since the start and we're all dead, we can call it a success as we've probably timed out.
			// If it's not many ticks, we've probably died and that's probably a fail.
			// We also want to see action. We're going to count the number of unique creeps we see. If we don't see many we've not had much impact.
			if (Game.time - mmem.lastLaunchTick > 1450) {
				mmem.s++;
				return this.missionComplete(true);
			}
			else if (Game.time - mmem.lastLaunchTick < 1000) {
				console.log("ConnectivityDecon Fail")
				console.log(Game.time, mmem.lastLaunchTick, mmem.targetRoomName)

				mmem.f++;
				mmem.fRefreshRate = 7500;
				mmem.fRefreshRate *= (1.5 - this.getSuccessRate());
				mmem.fTick = Game.time;

				return this.missionComplete(false);
			}

			return this.missionComplete(false);
		}
		else if (Game.rooms[this.memory.targetRoomName] && Game.rooms[this.memory.targetRoomName].find(FIND_STRUCTURES).length <= 1) {
			Memory.rooms[this.memory.targetRoomName].fullyConnected = 1
			mmem.s++;
			return this.missionComplete(true);
		}
		// Need moar. If our guys are still alive and they've managed to kill more than they cost, spawn them some friends.
		else if (Game.time - mmem.lastLaunchTick >= 1200 &&
				 mmem.spawningCreeps.length == 0 &&
				 Game.time % 10 == 0 &&
				 Memory.rooms[mmem.targetRoomName].fullyConnected === 0) {

			if (!this.renewRestricted()) {
				// Are our guys an effective team? Somebody may cripple us and leave us alive, and we don't want to keep
				// spawning in thinking life is going well.
				var effectiveTeam = false;
				for (var creepName of mmem.assignedCreeps) {
					var creep = Game.creeps[creepName];
					if (creep) {
						if (creep.hasActiveBodypart(WORK)) {
							effectiveTeam = true;
							break;
						}
					}
				}
				if (effectiveTeam) {
					console.log(mmem.sourceRoomName, "relaunching connectivityDeconn against", mmem.targetRoomName)
					console.log(mmem.numLaunches);
					mmem.numLaunches += 1;
					mmem.lastLaunchTick = Game.time;

					this.requestSpawns();
				}
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

		let body = [];

		// Build a body based on this ratio for (this.memory.e + 1) * 700 energy.
		let maxCount = Math.min(Math.floor(parentRoom.energyCapacityAvailable / (2 * 150)), Math.floor(MAX_CREEP_SIZE / 2));
		let count = maxCount;

		body = [];
		for (let i = 0; i < count; i++) {
			body.push(WORK)
		}
		for (let i = 0; i < count; i++) {
			body.push(MOVE)
		}

		let idleCreep = idleCreepManager.getIdleCreepForBody(body, parentRoom);

		if (idleCreep && idleCreep.ticksToLive > 1100) {
			this.assignCreep(idleCreep);
		}
		else {
			this.spawnCreep("deconstructor", body, {}, spawn)
		}

		// Game.notify("Claimer clear room " + this.memory.sourceRoomName +
		// 			" " + this.memory.targetRoomName +
		// 			" " + safeRoute.getSafeRouteCost(this.memory.sourceRoomName, this.memory.targetRoomName, true) +
		// 			" " + 0.8 * CREEP_CLAIM_LIFE_TIME +
		// 			" " + parentRoom.effectiveLevel +
		// 			" " + (Game.myRooms.length < Game.gcl.level)
		// 			)

		if (!Memory.rooms[this.memory.targetRoomName].unexposedController &&
			Game.myRooms.length < Game.gcl.level &&
			parentRoom.effectiveLevel == 8 &&
			safeRoute.getSafeRouteCost(this.memory.sourceRoomName, this.memory.targetRoomName, true) * 50 < 0.8 * CREEP_CLAIM_LIFE_TIME) {
			// Game.notify("Claimer spawning")
			Memory.rooms[this.memory.targetRoomName].clearRoomClaim = Game.time;
			this.spawnCreep("claimer", [CLAIM, MOVE, MOVE, MOVE, MOVE, MOVE], {}, spawn)
		}

		return true;
	}

	assignCreep(creep) {
		super.assignCreep(creep);
		creep.memory.targetRoom = this.memory.targetRoomName
	}

	spawnCreep(role, body, boosts, spawn) {
		super.spawnCreep(role, body, boosts, spawn, {targetRoom : this.memory.targetRoomName, fallbackRoom: this.memory.sourceRoomName})
	}

	get targetRoomName() {
		return this.memory.targetRoomName;
	}
}

module.exports = ConnectivityDecon