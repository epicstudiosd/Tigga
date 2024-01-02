"use strict";

const Mission = require('missionBase')

const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');
const constants = require('constants');

const creepCreator = require('creepCreator');
const roomAI = require('roomAI');



class Season5ReactorClaim extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_SEASON_5_REACTOR_CLAIM;

		memory.fRefreshRate = 5000;
		// Do this before we make our mission active.
		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		if (createNew && this.isActive()) {
			memory.targetRoomName = memory.targetRoomName || targetRoomName;

			this.memory.roomRange = safeRoute.getSafeRouteCost(sourceRoomName, targetRoomName, false);
		}
	}

	renewRestricted() {
		return true
	}

	tick() {
		if (this.isActive()) {
			this.memory.pending = 0;

			if ((this.memory.assignedCreeps.length == 0 && this.memory.spawningCreeps.length == 0) || Game.time - this.memory.lastLaunchTick > 2000) {
				// Launch fail
				if (Game.time - this.memory.lastLaunchTick <= 1) {
					return this.missionComplete(true);
				}
				else if (Game.time - this.memory.lastLaunchTick < 1000) {
					this.memory.f++;
					this.memory.fTick = Game.time;
					return this.missionComplete(false);
				}
				return this.missionComplete(false);
			}

			if (Memory.rooms[this.memory.targetRoomName].reactorOwner == util.getMyName()) {
				return this.missionComplete(true);
			}
		}

		super.tick();

	}

	requestSpawns() {
		// Need to be able to cover half the tower damage between two of us.
		let parentRoom = Game.rooms[this.memory.sourceRoomName]
		let spawns = parentRoom.find2(FIND_MY_SPAWNS);
		// Oh. Crap.
		if (spawns.length == 0) return;

		let spawn = spawns[0];

		// Probably should genericify this.
		let route = safeRoute.findSafeRoute(this.memory.sourceRoomName, this.memory.targetRoomName, false, undefined, true);

		if (route.length < 10) {
			this.spawnCreep("season5ReactorClaimer", 
				[MOVE, MOVE, MOVE, MOVE, MOVE, CLAIM], 
				{}, 
				spawn, 
				{targetRoom: this.memory.targetRoomName})	
			return true
		}

		return false	
	}

	static request(targetRoomName) {
		if (!Memory.combatManager.requestedMissions[MISSION_SEASON_5_REACTOR_CLAIM][targetRoomName]) {
			Memory.combatManager.requestedMissions[MISSION_SEASON_5_REACTOR_CLAIM][targetRoomName] = Game.time;
		}

		if (!Memory.rooms[targetRoomName]) {
			return 0
		}

		for (let mission of Memory.combatManager.currentMissions[MISSION_SEASON_5_REACTOR_CLAIM]) {
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
			
			if (room.restrictDefensiveMissions(false, true, false)) {
				continue;
			}
		
			let dist = safeRoute.getSafeRouteCost(room.name, targetRoomName, true, true)
			let score = dist

			// console.log(room, dist, score)

			if (dist < 10 && score < lowestScore) {
				lowestScore = score;
				bestSourceRoom = room;
			}
		}


		if (bestSourceRoom) {
			let currentMemory = {};
			for (let mission of Memory.combatManager.currentMissions[MISSION_SEASON_5_REACTOR_CLAIM]) {
				if (mission.targetRoomName == targetRoomName && mission.sourceRoomName == bestSourceRoom.name) {
					currentMemory = mission;
					break;
				}
			}
			var newMemory = (!currentMemory.type);

			let currentMission = new Season5ReactorClaim(currentMemory || {}, bestSourceRoom.name, targetRoomName, true, 0)

			if (currentMission.isActive()) {
				let spawnSuccessful = currentMission.requestSpawns();

				if (!spawnSuccessful) {
					console.log("Season5ReactorClaim spawn failed " + targetRoomName)
					currentMission.memory.ID = 0;
					return
				}

				console.log(bestSourceRoom.name + "Launching Season5ReactorClaim to " + targetRoomName)

				if (newMemory) Memory.combatManager.currentMissions[MISSION_SEASON_5_REACTOR_CLAIM].push(currentMission.memory);
				return
			}
			console.log("Season5ReactorClaim activate failed ", bestSourceRoom.name, targetRoomName)
			return
		}
		else {
			console.log("Season5ReactorClaim no spawn room to " + targetRoomName)
		}
	}	
}




module.exports = Season5ReactorClaim