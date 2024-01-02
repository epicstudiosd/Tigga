"use strict";

const Mission = require('missionBase')

var util = require('util');
var safeRoute = require('safeRoute');
var pathCache = require('pathCache');
var roomIntel = require('roomIntel');
var constants = require('constants');
var creepCreator = require('creepCreator');

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
	

class DepositBaseMission extends Mission {
	constructor(memory, centreRoomName, createNew, priority) {
		super(memory, null, centreRoomName, createNew, priority);

		if (createNew && this.isActive()) {
			memory.assignedCreeps = [];

			memory.pairIdx = 0;
			memory.pairNames = [];
			delete memory.pending
		}

	}

	getBestHaulerDropRoom(destRoomName) {
		let bestScore = Infinity
		let bestRoom;
		for (let room of Game.myRooms) {
			if (room.effectiveLevel < 6 || !room.terminal || !room.storage) continue;
			let routeCost = safeRoute.getSafeRouteCost(room.name, destRoomName, false);

			if (routeCost < bestScore) {
				bestRoom = room;
				bestScore = routeCost
			}
		}

		if (bestRoom) {
			return bestRoom.name
		}
	}

	// I don't like this much
	getBestSpawnRoom(destRoomName, firstLaunch, lowPriority) {
		let bestScore = Infinity
		let bestRoom;
		for (let room of Game.myRooms) {
			if (room.effectiveLevel < 7) continue;
			if (room.restrictDepositMissions()) continue;
			if (!room.spawns.length) continue;

			let score = this.getSpawnRoomScore(room, destRoomName)

			if (score > 8) continue;

			if (score < bestScore) {
				bestRoom = room;
				bestScore = score;
			}
		}

		if (!firstLaunch && this.memory.type == MISSION_DEPOSIT_HARVEST) {
			if (!bestRoom) {
				for (let room of Game.myRooms) {
					if (room.effectiveLevel < 7) continue;
					if (room.restrictDepositMissions(true)) continue;
					if (!room.spawns.length) continue;

					let score = this.getSpawnRoomScore(room, destRoomName)

					if (score > 8) continue;

					if (score < bestScore) {
						bestRoom = room;
						bestScore = score;
					}
				}
			}
		}

		return bestRoom
	}

	getSpawnRoomScore(room, destRoomName) {
		let routeCost = safeRoute.getSafeRouteCost(room.name, destRoomName, false);

		// Lower is better
		let score = routeCost;
		score += 3 * room.mem.spawnUtilization;
		score += _.sum(_.values(room.mem.priorityBuilds)) 
		score -= room.defcon

		return score
	}

	spawnHauler(room, targetPos, dropRoom) {
		return super.spawnCreep("depositFetcher", [], {}, room.spawns[0], {target: targetPos, dropRoom: dropRoom});
	}

	assignCreep(creep) {
		if (!this.memory.depositType) {
			throw(new Error("Error, no depsoit type"))
		}
		if (creep.hasBoost()) {
			// Bit of a hack. Calling boosted guys 3x more expensive. If we're using the boosts, they're probably less than that.
			Memory.commoditiesManager.depositStats.energyCost[this.memory.depositType] += (1 - constants.DEPOSIT_STATS_ALPHA) * (creep.mem.bC || util.getECostForCreep(creep)) * 3
		}
		else {
			Memory.commoditiesManager.depositStats.energyCost[this.memory.depositType] += (1 - constants.DEPOSIT_STATS_ALPHA) * (creep.mem.bC || util.getECostForCreep(creep))
		}
		super.assignCreep(creep);
	}

	spawnCreep(role, body, boosts, spawn, depositPos) {
		if (role == "depositMiner") {
			return super.spawnCreep(role, body, boosts, spawn, {target: depositPos, pairIdx: this.memory.pairIdx, alwaysPulled: 1})		
		}
		else {
			return super.spawnCreep(role, body, boosts, spawn, {target: depositPos, pairIdx: this.memory.pairIdx})
		}
	}

	spawnCombatCreep(role, body, boosts, spawn, extraMem) {
		return super.spawnCreep(role, body, boosts, spawn, extraMem)
	}

	cleanMemory() {
		delete this.memory.pairIdx
		delete this.memory.pairNames

		return super.cleanMemory();
	}

	missionComplete(success) {	
		this.cleanMemory()

		return super.missionComplete(success)
	}
}

module.exports = DepositBaseMission