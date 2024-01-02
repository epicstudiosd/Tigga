"use strict";



var missionInfo = {
	findMissionForID : function(id, missionType) {
		let missionTypes = missionType !== undefined ? [missionType] : MISSION_TYPES;
		for (let type of missionTypes) {
			for (var mission of Memory.combatManager.currentMissions[type]) {
				if (mission.ID == id) {
					return mission;
				}
			}
		}
	},


	hasActiveMissionsToRoom : function(targetRoomName) {
		for (let type of MISSION_TYPES) {
			for (var mission of Memory.combatManager.currentMissions[type]) {
				if (mission.targetRoomName == targetRoomName && mission.ID) {
					return true;
				}
			}
		}
		return false;
	},

	isRoomSpawningMission : function(sourceRoom, attackPoll) {
		// In the attack poll we call this a lot. If we have in-tick data for it grab that instead
		if (attackPoll) {
			global.inTickObject.attackPollSourceRoomSpawningMission = global.inTickObject.attackPollSourceRoomSpawningMission || {};
			if (global.inTickObject.attackPollSourceRoomSpawningMission[sourceRoom.name] !== undefined) {
				return global.inTickObject.attackPollSourceRoomSpawningMission[sourceRoom.name];
			}
		}


		global._sourceRoomSpawningMission = global._sourceRoomSpawningMission || {}
		if (global._sourceRoomSpawningMission[sourceRoom.name] !== undefined && Math.random() > 0.2) {
			return global._sourceRoomSpawningMission[sourceRoom.name]
		}
		else {
			for (let type of MISSION_TYPES) {
				for (var mission of Memory.combatManager.currentMissions[type]) {
					if (mission.sourceRoomName === sourceRoom.name && mission.ID && mission.spawningCreeps.length) {
						global._sourceRoomSpawningMission[sourceRoom.name] = 1;

						if (attackPoll) {
							global.inTickObject.attackPollSourceRoomSpawningMission = global.inTickObject.attackPollSourceRoomSpawningMission || {};
							global.inTickObject.attackPollSourceRoomSpawningMission[sourceRoom.name] = mission.ID;
						}

						return mission.ID;
					}
				}
			}
			global._sourceRoomSpawningMission[sourceRoom.name] = 0;

			if (attackPoll) {
				global.inTickObject.attackPollSourceRoomSpawningMission = global.inTickObject.attackPollSourceRoomSpawningMission || {};
				global.inTickObject.attackPollSourceRoomSpawningMission[sourceRoom.name] = 0;
			}

			return false;
		}
	},

	isRoomAssaulting : function(sourceRoom, onlyIfTargetHasPower) {
		if (!onlyIfTargetHasPower) {
			return (Game.time - (sourceRoom.mem.spawningHeavyMission || -2000)) < 2000
		}


		for (let type of [MISSION_ROOM_SWARM, 
					      MISSION_ROOM_ASSAULT,
					      MISSION_ROOM_ASSAULT_LARGE, 
					      MISSION_MEGA_ASSAULT, 
					      MISSION_STRONGHOLD_ASSAULT, 
					      MISSION_STRONGHOLD_MEGA_ASSAULT, 
					      MISSION_ROOM_EDGE_ASSAULT, 
					      MISSION_ROOM_LOW_ENERGY_ASSAULT,
					      MISSION_ROOM_LOW_ENERGY_ASSAULT_LARGE, 
					      MISSION_HEAVY_CONTROLLER_ATTACK]) {
			for (var mission of Memory.combatManager.currentMissions[type]) {
				if (mission.sourceRoomName == sourceRoom.name && mission.ID) {
					if (!onlyIfTargetHasPower) {
						return true;
					}

					// We don't do power assaults in this case
					let mem = Memory.rooms[mission.targetRoomName]
					if ((!mem.invCL && (mem.spwnX || []).length == 0) || (mem.twrX || []).length == 0) {
						continue
					}
					if ([MISSION_ROOM_ASSAULT, MISSION_MEGA_ASSAULT].includes(type) && (Memory.rooms[mission.targetRoomName].powerEnabled || _.sum(Memory.rooms[mission.targetRoomName].controllerExposedToEdge))) {
						return true;
					}
					if (type == MISSION_STRONGHOLD_ASSAULT || type == MISSION_STRONGHOLD_MEGA_ASSAULT) {
						return true
					}
				}
			}
		}
		return false;
	},

	canLaunchNewAssault: function(targetRoomName, setupRoomName, thresholdModifier = 1) {
		global.roomAssaultCounts[targetRoomName] = global.roomAssaultCounts[targetRoomName] || {};
		if (!global.roomAssaultCounts[targetRoomName].assaultCountByEdge) {
			return true;
		}
		if (!Memory.rooms[targetRoomName].boundaryWallCountByEdge) {
			return true;
		}
		if (!Memory.rooms[targetRoomName].boundaryWallCount) {
			return true;
		}
		let threshold = 10;

		// Don't have to be nearly so cautious in this case as we should be able to
		// have quite a lot of freedom to move around.
		if (Memory.rooms[targetRoomName].enemyFullyConnected) {
			threshold /= 2;
		}
		// Mostly this is covered by the megaassault logic.
		if (Memory.rooms[targetRoomName].invCL == 5) {
			threshold /= 2;
		}
		else if (Memory.rooms[targetRoomName].invCL == 4) {
			threshold /= 2;
		}
		// No threats, keep it cool
		if (Memory.rooms[targetRoomName].DT == 0) {
			threshold *= 4;
		}

		threshold *= thresholdModifier

		if (setupRoomName) {
			let dir;
			let exits = Game.map.describeExits(targetRoomName)
			for (let exitDir in exits) {
				if (exits[exitDir] == setupRoomName) {
					dir = Math.round((parseInt(exitDir) - 1) / 2);
				}
			}

			if (global.roomAssaultCounts[targetRoomName].assaultCountByEdge[dir] * threshold > Memory.rooms[targetRoomName].boundaryWallCountByEdge[dir]) {
				return false;
			}
			let edgeWalls;
			switch (dir) {
				case TOP:
					edgeWalls = Memory.rooms[targetRoomName].eWallsT
					break;
				case RIGHT:
					edgeWalls = Memory.rooms[targetRoomName].eWallsR
					break;
				case LEFT:
					edgeWalls = Memory.rooms[targetRoomName].eWallsL
					break;
				case BOTTOM:
					edgeWalls = Memory.rooms[targetRoomName].eWallsB
					break;
			}


			// This isn't really "make sure everyone has space" - assuming one 2x2 squad takes 1 tile, or 3 if edge walls. This gives it one tile...
			if (Memory.rooms[targetRoomName].exitSize && global.roomAssaultCounts[targetRoomName].assaultCountByEdge[dir] > (edgeWalls ? 3 : 1) * (Memory.rooms[targetRoomName].exitSize[dir] || Infinity)) {
				return false;
			}
			if (global.roomAssaultCounts[targetRoomName].assaultCount * threshold > Memory.rooms[targetRoomName].boundaryWallCount) {
				return false;
			}


			return true;
		}
		else {
			// This is pessimistic "I don't know yet if I even want to launch"
			threshold *= 1.25;
			return (global.roomAssaultCounts[targetRoomName].assaultCount || 0) * threshold <= Memory.rooms[targetRoomName].boundaryWallCount;
		}
	},
}

module.exports = missionInfo;