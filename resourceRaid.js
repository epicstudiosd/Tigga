"use strict";

const Mission = require('missionBase')
const RoomHeavyCreepRangedHold = require("roomHeavyCreepRangedHold")

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');

const creepCreator = require('creepCreator');

class ResourceRaidMission extends RoomHeavyCreepRangedHold {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_RESOURCE_RAID;

		memory.fRefreshRate = 10000;
		// Do this before we make our mission active.
		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		if (createNew && this.isActive()) {
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


		hostileRangedParts = Math.max(2, hostileRangedParts);
		// Got to kill some transposts or something. Better actually kill them.
		// This is heal because we build to overcome heal
		hostileHealParts = Math.max(15, hostileHealParts);

		let ret = creepCreator.createRambo(parentRoom, [this.memory.targetRoomName], 0, 0, hostileRangedParts, hostileHealParts)

		if (ret.body.length > 0) {
			console.log("RAMBO spawning for resource raid", this.memory.targetRoomName)
			// role, body, boosts, spawn, extraMemory
			this.spawnCreep("ranged", ret.body, ret.boosts, spawn, {attackPower: 1, targetRoom: this.memory.targetRoomName})

			return true
		}

		return false
	}


	tick() {
		super.tick();

		if (!Memory.rooms[this.memory.sourceRoomName].lootRooms.includes(this.memory.targetRoomName)) {
			Memory.rooms[this.memory.sourceRoomName].lootRooms.push(this.memory.targetRoomName)
		}
	}
}


module.exports = ResourceRaidMission