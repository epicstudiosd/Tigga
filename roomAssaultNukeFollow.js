"use strict";

const Mission = require('missionBase')

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');
const creepCreator = require('creepCreator');
const intelAI = require('intelAI');
const roomIntel = require('roomIntel');


class NukeFollowAssault extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_ROOM_ASSAULT_NUKE_FOLLOW;

		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		// If we fail, don't go again for a while.
		if (createNew && this.isActive()) {
			memory.targetRoomName = memory.targetRoomName || targetRoomName;

			memory.fRefreshRate = memory.fRefreshRate || 10000;
			memory.spawnedClaim = 0
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

			if (tmem && tmem.nukeLandTime - Game.time < 1500 && tmem.nukeLandTime - Game.time > 0) {
				if (!mmem.spawnedClaim && tmem.nukeLandTime - Game.time < 10 && safeRoute.getSafeRouteCost(sourceRoomName, targetRoomName, true, true) < 3) {
					mmem.spawnedClaim = 1
					this.spawnControllerAttacker();					
				}
				for (let creepName of mmem.assignedCreeps) {
					let creep = Game.creeps[creepName]
					if (!creep) {
						continue
					}

					let exits = Game.map.describeExits(creep.room.name)
					for (let exitDir in exits) {
						if (exits[exitDir] == targetRoomName) {
							creep.mem.targetRoom = creep.room.name
							break
						}
					}
				}

			}
			else {
				for (let creepName of mmem.assignedCreeps) {
					let creep = Game.creeps[creepName]
					if (!creep) {
						continue
					}

					creep.mem.targetRoom = targetRoomName
				}
				for (let creepName of mmem.assignedCreeps) {
					if (Game.creeps[creepName] && tmem.twrX.length) {
						Game.creeps[creepName].ignoreCivilians = 1
					}
				}
			}

			if (Game.rooms[targetRoomName] && 
				Game.rooms[targetRoomName].controller.safeMode && 
				Game.rooms[targetRoomName].controller.safeMode > 1500) {
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

	spawnControllerAttacker() {
		var parentRoom = Game.rooms[this.memory.sourceRoomName]
		var spawns = parentRoom.find2(FIND_MY_SPAWNS);
		// Oh. Crap.
		if (spawns.length == 0) return;

		var spawn = spawns[0];

		let extraMemory = {"targetRoom" : this.memory.targetRoomName}
		spawn.addPrioritySpawn("controllerAttacker", extraMemory, undefined, [MOVE, MOVE, MOVE, MOVE, MOVE, CLAIM])
	}

	missionComplete(success) {

		delete this.memory.numLaunches;
		delete this.memory.spawnedClaim;

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

	static requestNukeFollowAssault(targetRoomName) {
		if (!Memory.combatManager.requestedMissions[MISSION_ROOM_ASSAULT_NUKE_FOLLOW][targetRoomName]) {
			Memory.combatManager.requestedMissions[MISSION_ROOM_ASSAULT_NUKE_FOLLOW][targetRoomName] = Game.time;
		}

		if (!Memory.rooms[targetRoomName]) {
			return 0
		}

		for (let mission of Memory.combatManager.currentMissions[MISSION_ROOM_ASSAULT_NUKE_FOLLOW]) {
			if (mission.targetRoomName == targetRoomName) {
				// Doing this already.
				if (mission.ID) {
					return 0;
				}
			}
		}

		let lowestScore = Infinity;
		let bestSourceRoom;

		for (let room of Game.myRooms) {
			if (room.name == targetRoomName) continue;
			
			if (room.restrictOffensiveMissions(targetRoomName, true)) {
				continue;
			}
			

			let dist = safeRoute.getSafeRouteCost(room.name, targetRoomName, true, true)
			let score = dist - room.effectiveLevel * 4;

			// console.log(room, dist, score)

			if (dist < 10 && score < lowestScore) {
				lowestScore = score;
				bestSourceRoom = room;
			}
		}


		if (bestSourceRoom) {
			let currentMemory = {};
			for (let mission of Memory.combatManager.currentMissions[MISSION_ROOM_ASSAULT_NUKE_FOLLOW]) {
				if (mission.targetRoomName == targetRoomName && mission.sourceRoomName == bestSourceRoom.name) {
					currentMemory = mission;
					break;
				}
			}
			var newMemory = (!currentMemory.type);


			// constructor(memory, sourceRoomName, targetRoomName, createNew, priority, parentAssaultMission) {
			let currentMission = new NukeFollowAssault(currentMemory || {}, bestSourceRoom.name, targetRoomName, true, 0)

			if (currentMission.isActive()) {
				let spawnSuccessful = currentMission.requestSpawns();

				if (!spawnSuccessful) {
					console.log("Nuke follow spawn failed " + targetRoomName)
					currentMission.memory.ID = 0;
					return
				}

				console.log(bestSourceRoom.name + "Launching nuke follow hold to " + targetRoomName)

				if (newMemory) Memory.combatManager.currentMissions[MISSION_ROOM_ASSAULT_NUKE_FOLLOW].push(currentMission.memory);
				return
			}
			console.log("Nuke follow activate failed ", bestSourceRoom.name, targetRoomName)
			return
		}
		else {
			console.log("Nuke follow no spawn room to " + targetRoomName)
		}
	}
}


module.exports = NukeFollowAssault