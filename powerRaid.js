"use strict";

const Mission = require('missionBase')

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');

const creepCreator = require('creepCreator');
const PowerHarvestMission = require('powerHarvest');

class PowerRaidMission extends PowerHarvestMission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_POWER_RAID;

		memory.fRefreshRate = 10000;
		// Do this before we make our mission active.
		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		if (createNew && this.isActive()) {
			if (!Game.rooms[targetRoomName]) {
				console.log("PowerRaidMission with no target room visible???")
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
		}
	}

	requestSpawns() {
		let parentRoom = Game.rooms[this.memory.sourceRoomName]
		let spawns = parentRoom.find2(FIND_MY_SPAWNS);

		// Oh. Crap.
		if (spawns.length == 0) return;

		let spawn = spawns[0];
			
		let mem = Memory.rooms[this.memory.targetRoomName];

		let hostileRangedParts = 0;
		let hostileHealParts = 0;

		if (Game.rooms[this.memory.targetRoomName]) {
			let hostileCreeps = Game.rooms[this.memory.targetRoomName].getAllHostileCreepsWithBodyParts([RANGED_ATTACK, HEAL], false);
			for (let creep of hostileCreeps) {
				hostileRangedParts += creep.getBoostModifiedCombatParts(false).numRanged;
				hostileHealParts += creep.getBoostModifiedCombatParts(false).numHeal;
			}
		}
		else {
			hostileRangedParts = mem.creepCombatPartsRanged || 0
			hostileHealParts = mem.creepCombatPartsHeal || 0
		}


		// Gotta kill a power bank. Need to heal a bit for that!
		hostileRangedParts = Math.max((Memory.season3 ? 1 : 10), hostileRangedParts);
		hostileHealParts = Math.max(10, hostileHealParts);

		let ret = creepCreator.createRambo(parentRoom, [this.memory.targetRoomName], 0, 0, hostileRangedParts, hostileHealParts)

		if (ret.body.length > 0) {
			console.log("RAMBO spawning for power raid", this.memory.targetRoomName)
			// role, body, boosts, spawn, extraMemory
			this.spawnCreep("ranged", ret.body, ret.boosts, spawn, {attackPower: 1, targetRoom: this.memory.targetRoomName})


			return true
		}
	}
}


module.exports = PowerRaidMission