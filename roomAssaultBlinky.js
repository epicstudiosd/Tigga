"use strict";

const Mission = require('missionBase')

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');
const creepCreator = require('creepCreator');
const intelAI = require('intelAI');
const roomIntel = require('roomIntel');


class BlinkyAssault extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_ROOM_ASSAULT_BLINKY;

		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		// If we fail, don't go again for a while.
		if (createNew && this.isActive()) {
			memory.targetRoomName = memory.targetRoomName || targetRoomName;

			memory.fRefreshRate = memory.fRefreshRate || 10000;
		}
	}

	tick() {
		// let a = Game.cpu.getUsed()
		let mmem = this.memory;
		if (this.isActive()) {
			let targetRoomName = mmem.targetRoomName;
			let sourceRoomName = mmem.sourceRoomName;
			let tmem = Memory.rooms[targetRoomName];

			if (!tmem) {
				console.log(mmem.type, "can't find room in memory!", mmem.targetRoomName);
				mmem.fTick = Game.time;
				mmem.f++;
				this.missionComplete(false);
				return;
			}

			for (let creepName of mmem.assignedCreeps) {
				if (Game.creeps[creepName] && tmem.twrX.length) {
					Game.creeps[creepName].ignoreCivilians = 1
				}
			}

			if (!tmem.twrX || !tmem.twrX.length) {
				Memory.combatManager.requestedMissions[MISSION_WEAK_ROOM_ATTACK][this.memory.targetRoomName] = Game.time;

				if (!tmem.spwnX || !tmem.spwnX.length) {					
					console.log(mmem.type, "has killed all towers and spawns", targetRoomName)
					mmem.s++;
					this.missionComplete(true);
					return;
				}
			}

			if (Game.rooms[targetRoomName] && Game.rooms[targetRoomName].controller.safeMode && Game.time - mmem.startTick > WEAK_ROOM_ATTACK_SAFE_MODE_PRESPAWN) {
				// They safe moded
				console.log(mmem.type, "has triggered safe mode", targetRoomName)
				mmem.s++;
				this.missionComplete(true);
				return;
			}
			// Room is no longer owned by somebody else.
			else if (Game.rooms[targetRoomName] &&
				(!Game.rooms[targetRoomName].controller.owner || Game.rooms[targetRoomName].controller.owner.username == util.getMyName())) {
				console.log(mmem.type, "has removed owner", targetRoomName);
				mmem.s++;
				this.missionComplete(true);
				return;
			}
			else if (mmem.assignedCreeps.length == 0 && mmem.spawningCreeps.length == 0) {
				if (Game.time - mmem.lastLaunchTick <= 1100) { // 1100 is minimum idle creep ttl at mission creation
					if (Game.time - mmem.lastLaunchTick == 1) {
						console.log(mmem.type, "has crapped out on launch", targetRoomName, Game.time - mmem.lastLaunchTick)
						this.missionComplete(true);
						return;
					}
					else {
						console.log(mmem.type, "has lost all creeps earlier than desired", targetRoomName, Game.time - mmem.lastLaunchTick)

						// If we lived more than 500 ticks post launch, just escalate it.
						if (Game.time - mmem.lastLaunchTick < 500) {
							mmem.fTick = Game.time;
							this.missionComplete(false);
						}
						else {
							Memory.combatManager.requestedMissions[MISSION_ROOM_ASSAULT][this.memory.targetRoomName] = Game.time;
							this.missionComplete(true);
						}
						return;
					}
				}
				// Mission complete! Our creeps should live at least 1500 ticks, and we've decided not to respawn for some reason.
				else {
					console.log(mmem.type, "has lost all creeps as expected", targetRoomName)
					mmem.s++;
					this.missionComplete(true);
					return;
				}
			}
			// Need moar. Our last guys are still alive, so back them up.
			else if (Game.time - mmem.lastLaunchTick >= 1100 &&
					 mmem.spawningCreeps.length == 0 &&
					 mmem.numLaunches < 5 && // We don't check we're doing damage yet. We should. This is a circuit-break... idea is that we're in and kill not that we hang around
					 Game.rooms[targetRoomName] &&
					 Game.rooms[targetRoomName].towers.length &&
					 // !tmem.hostileBoostedCreeps &&
					 Game.map.getRoomStatus(targetRoomName).status == global.zoneType &&
					 !this.renewRestricted()) {
				// Quick sanity check: are our guys an effective team? Somebody may cripple us and leave us alive, and we don't want to keep
				// spawning in thinking life is going well.
				var effectiveTeam = false;
				for (var creepName of mmem.assignedCreeps) {
					var creep = Game.creeps[creepName];
					if (creep) {
						if (creep.getActiveBodyparts(ATTACK) > 0 || creep.getActiveBodyparts(RANGED_ATTACK) > 0 || creep.getActiveBodyparts(HEAL) > 0) {
							effectiveTeam = true;
							break;
						}
					}
				}
				if (effectiveTeam) {
					mmem.lastLaunchTick = Game.time;
					mmem.numLaunches++

					console.log("Renewing", sourceRoomName, mmem.type, "against", targetRoomName)

					// Reset the clock
					mmem.killCount = 0
					this.requestSpawns();
				}
			}
		}

		// console.log("e", Game.cpu.getUsed() - a)

		super.tick();

		// console.log("f", Game.cpu.getUsed() - a)
	}

	requestSpawns() {
		var parentRoom = Game.rooms[this.memory.sourceRoomName]
		var spawns = parentRoom.find2(FIND_MY_SPAWNS);
		// Oh. Crap.
		if (spawns.length == 0) return;

		var spawn = spawns[0];

		let step = 0;
		let ramboDef = creepCreator.createRambo(parentRoom, [this.memory.targetRoomName], 0, 0)

		if (ramboDef.body.length) {
			if (Memory.rooms[this.memory.targetRoomName] && Memory.rooms[this.memory.targetRoomName].owner) {
				Memory.attackFocus[Memory.rooms[this.memory.targetRoomName].owner] += 2
			}			

			this.spawnCreep("ranged", ramboDef.body, ramboDef.boosts, spawn)
			return true
		}

	}

	missionComplete(success) {

		delete this.memory.numLaunches;

		super.missionComplete(success);
	}

	spawnCreep(role, body, boosts, spawn) {
		return super.spawnCreep(role, body, boosts, spawn, {targetRoom : this.memory.targetRoomName, fallbackRoom: this.memory.sourceRoomName})
	}

	assignCreep(creep) {
		super.assignCreep(creep);
		creep.memory.targetRoom = this.memory.targetRoomName
	}

	get targetRoomName() {
		return this.memory.targetRoomName;
	}
}


module.exports = BlinkyAssault