"use strict";

const Mission = require('missionBase')

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');
const creepCreator = require('creepCreator');
const scouting = require('scouting');




class HeavyControllerAttackMission extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_HEAVY_CONTROLLER_ATTACK;

		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		// If we fail, don't go again for a while.
		if (createNew && this.isActive()) {
			memory.targetRoomName = memory.targetRoomName || targetRoomName;

			memory.fRefreshRate = memory.fRefreshRate || 5000;

			memory.routeCost = safeRoute.getSafeRouteCost(sourceRoomName, targetRoomName, true) || 15;

			if(memory.routeCost > 0.75 * CREEP_CLAIM_LIFE_TIME / 50) {
				console.log("HCA constructor too far")
				this.memory.ID = 0
				return;
			}

			if (!Game.rooms[targetRoomName]) {
				console.log("HCA constructor no vis", targetRoomName)
				this.memory.ID = 0
				return;
			}

			if (Game.rooms[targetRoomName].controller.upgradeBlocked > 600) {
				console.log("HCA constructor controller blocked", targetRoomName)
				this.memory.ID = 0
				return;
			}

			let exits = Game.map.describeExits(targetRoomName);

			let rm = Memory.rooms[targetRoomName]

			let bestScore = Infinity;
			let bestSetupRoom;
			let bestExitDir;

			for (let exitDir in exits) {
				let exitRoom = exits[exitDir];

				let exitRouteCost = (safeRoute.getSafeRouteCost(sourceRoomName, exitRoom, true) || 15)

				console.log("HCA constructor", exitRoom, exitRouteCost)

				if (exitRouteCost > 0.75 * CREEP_CLAIM_LIFE_TIME / 50 - 1) continue;

				let exitIdx = Math.round((parseInt(exitDir) - 1) / 2);

				console.log("HCA constructor", exitRoom, rm.controllerExposedToEdge[exitIdx])

				if (!rm.controllerExposedToEdge[exitIdx]) continue;

				console.log("HCA constructor", exitRoom, rm.pathTowerDamageToControllerByEdge1x1[exitIdx])

				let score = 0;

				score += rm.pathTowerDamageToControllerByEdge1x1[exitIdx];
				score += exitRouteCost * 10;

				if (score < bestScore) {
					bestScore = score;
					bestSetupRoom = exitRoom
					bestExitDir = exitDir
				}
			}

			if (bestSetupRoom === undefined) {
				console.log("HCA constructor no setup room")
				this.memory.ID = 0
				return;
			}

			this.memory.setupRoom = bestSetupRoom
			this.memory.exitDir = bestExitDir

			this.memory.teams = [];
		}
	}

	tick() {
		if (this.isActive()) {
			let mmem = this.memory;
			let targetRoomName = mmem.targetRoomName;
			let sourceRoomName = mmem.sourceRoomName;
			let tmem = Memory.rooms[targetRoomName];

			// Organize the theam and make them all renewed and shit.
			for (var teamIdx in this.memory.teams) {
				let team = this.memory.teams[teamIdx]
				let fullTeam = 1;
				let currentlySpawning = 0;
				for (var creepName of team) {
					var creep = Game.creeps[creepName];
					if (!creep) {
						fullTeam = 0;
						continue;
					}

					creep.memory.team = _.clone(team);

					if (creep.spawning) {
						let structs = creep.pos.lookFor(LOOK_STRUCTURES);
						for (let struct of structs) {
							if (struct.structureType == STRUCTURE_SPAWN) {
								if (struct.spawning && struct.spawning.remainingTime > 10 && team.includes(struct.spawning.name)) {
									fullTeam = 0;
									currentlySpawning = 1;
									break;
								}
							}
						}
					}

					creep.memory.allTeamCreeps = [];
					for (let creepName2 of this.memory.assignedCreeps) {
						let creep2 = Game.creeps[creepName2]
						if (creep2 && creep2.memory.teamId == teamIdx) {
							creep.memory.allSquadCreeps.push(creepName2)
						}
					}
				}

				if (fullTeam) {
					this.memory.pending = 0;
					for (var creepName of this.memory.assignedCreeps) {
						var creep = Game.creeps[creepName];
						if (creep && creep.memory.teamId !== undefined && creep.memory.teamId == teamIdx) {
							creep.memory.retreat = 0;
						}
					}

					for (var creepName of team) {
						var creep = Game.creeps[creepName];
						creep.memory.retreat = 0;
						creep.renew = 0;
					}
				}
				else {
					for (var creepName of team) {
						var creep = Game.creeps[creepName];
						if (creep && creep.room.name == creep.memory.sR && (this.memory.spawningCreeps.length || currentlySpawning)) {
							if (!creep.hasBoost()) {
								creep.renew = 1;
							}
							creep.memory.retreat = 1;
						}
					}
				}
			}

			if (!tmem) {
				console.log("Heavy controller attack can't find room in memory!", mmem.targetRoomName);
				mmem.fTick = Game.time;
				mmem.f++;
				this.missionComplete(false);
				return;
			}

			if (Game.rooms[targetRoomName] && Game.rooms[targetRoomName].controller.safeMode && Game.time - mmem.startTick > WEAK_ROOM_ATTACK_SAFE_MODE_PRESPAWN) {
				// They safe moded
				console.log("Heavy controller attack has triggered safe mode", targetRoomName)
				mmem.s++;
				this.missionComplete(true);
				return;
			}
			// Room is no longer owned by somebody else.
			else if (Game.rooms[targetRoomName] &&
				(!Game.rooms[targetRoomName].controller.owner || Game.rooms[targetRoomName].controller.owner.username == util.getMyName())) {
				console.log("Heavy controller attack has removed owner", targetRoomName);
				mmem.s++;
				this.missionComplete(true);
				return;
			}
			else if (mmem.assignedCreeps.length == 0 && mmem.spawningCreeps.length == 0) {
				if (Game.time - mmem.lastLaunchTick <= 500) {
					if (Game.time - mmem.lastLaunchTick == 1) {
						console.log("Heavy controller attack has crapped out on launch", targetRoomName, Game.time - mmem.lastLaunchTick)
						this.missionComplete(true);
						return;
					}
					else {
						console.log("Heavy controller attack has lost all creeps earlier than desired", targetRoomName, Game.time - mmem.lastLaunchTick)

						this.missionComplete(false);
						return;
					}
				}
				// Mission complete! We've decided not to respawn for some reason.
				else if (Game.time - mmem.lastLaunchTick <= 1500) {
					console.log("Weak room attack has lost all creeps as expected", targetRoomName)
					mmem.s++;
					this.missionComplete(true);
					return;
				}
			}
			// Need moar.
			else if (Game.rooms[targetRoomName] &&
					(Game.rooms[targetRoomName].controller.upgradeBlocked || 0) < 250 + mmem.routeCost * 50 &&
					 mmem.assignedCreeps.length == 0 &&
					 mmem.spawningCreeps.length == 0 &&
					 Game.time - mmem.lastLaunchTick > 700 &&
					 Game.map.getRoomStatus(targetRoomName).status == global.zoneType &&
					 !this.renewRestricted()) {
				mmem.lastLaunchTick = Game.time;

				console.log("Renewing", sourceRoomName, "heavy controller attack against", targetRoomName)

				this.requestSpawns();
			}
		}
		super.tick();
	}

	requestSpawns() {
		// Got to sort out renew issue

		var parentRoom = Game.rooms[this.memory.sourceRoomName]
		var spawns = parentRoom.find2(FIND_MY_SPAWNS);
		// Oh. Crap.
		if (spawns.length == 0) return;

		var spawn = spawns[0];

		let ret = creepCreator.createHeavyUnclaim(parentRoom, this.memory.setupRoom, this.memory.targetRoomName)


		if (ret.body.length <= 0) {
			return false;
		}

		let teamCreepNames = [];
		console.log("Controller basher spawning for", this.memory.targetRoomName)
		Game.notify("Controller basher spawning for " + this.memory.targetRoomName)

		let exitIdx = Math.round((parseInt(this.memory.exitDir) - 1) / 2);

		for (var i = 0; i < (Memory.rooms[this.memory.targetRoomName].controllerExposedToEdge[exitIdx] || 0); i++) {
			teamCreepNames.push(this.spawnCreep("heavyControllerAttacker", ret.body, ret.boosts, spawn, false, {teamId: this.memory.teams.length}));
			if (i == 0) {
				console.log("Only one HCA spawning due to renew issue")
				break
			}
		}

		this.memory.teams.push(teamCreepNames);
		return true;
	}


	spawnCreep(role, body, boosts, spawn) {
		return super.spawnCreep(role, body, boosts, spawn, {targetRoom : this.memory.targetRoomName, setupRoom: this.memory.setupRoom, fallbackRoom: this.memory.sourceRoomName})
	}

	assignCreep(creep) {
		super.assignCreep(creep);
		creep.memory.targetRoom = this.memory.targetRoomName
	}

	get targetRoomName() {
		return this.memory.targetRoomName;
	}

	static requestHeavyControllerAttackers(targetRoomName) {
		if (Game.cpu.bucket < 1000) {
			console.log("Request HCA B BUK", targetRoomName)
			return 0
		}

		if (!Memory.rooms[targetRoomName].owner) {
			console.log("Request HCA B OWN", targetRoomName)
			return 0;
		}
		if (Memory.rooms[targetRoomName].owner == "Invader") {
			console.log("Request HCA B Invader?????", targetRoomName)
			return 0;
		}

		// Need vision to select target.
		if (!Game.rooms[targetRoomName]) {
			console.log("Request HCA B VIS", targetRoomName)
			return 0;
		}

		if (scouting.isRoomWhiteListed(targetRoomName)) {
			console.log("Request HCA B WL", targetRoomName)
			return 0;
		}


		for (let mission of Memory.combatManager.currentMissions[MISSION_HEAVY_CONTROLLER_ATTACK]) {
			if (mission.targetRoomName == targetRoomName && mission.ID) {
				console.log("Request HCA B HCA", targetRoomName)
				return 0;
			}
		}
		// Don't combine
		for (let mission of Memory.combatManager.currentMissions[MISSION_WEAK_ROOM_ATTACK]) {
			if (mission.targetRoomName == targetRoomName && mission.ID) {
				console.log("Request HCA B WRA", targetRoomName)
				return 0;
			}
		}

		let lowestScore = Infinity;
		let bestSourceRoom;

		for (let room of Game.myRooms) {
			if (room.restrictOffensiveMissions(targetRoomName, true, false, false)) {
				// console.log("Request HCA B restrictOffensiveMissions", room)
				continue;
			}

			let dist = safeRoute.getSafeRouteCost(room.name, targetRoomName, true)
			if (dist > 0.75 * CREEP_CLAIM_LIFE_TIME / 50) {
				// console.log("Request HCA B too far", room)
				continue;
			}

			// Really minimize dist
			let score = dist * 10 + room.effectiveLevel * 10 + room.memory.spawnUtilization * 10;

			if (score < lowestScore) {
				lowestScore = score;
				bestSourceRoom = room;
			}
		}

		console.log("Request HCA B1", bestSourceRoom)

		if (bestSourceRoom) {
			console.log("Request HCA B2", bestSourceRoom)

			let currentMemory = {};
			for (let mission of Memory.combatManager.currentMissions[MISSION_HEAVY_CONTROLLER_ATTACK]) {
				currentMemory = {};
				if (mission.targetRoomName == targetRoomName && mission.sourceRoomName == bestSourceRoom.name) {
					currentMemory = mission;
					break;
				}
			}
			var newMemory = (!currentMemory.type);
			let currentMission = new HeavyControllerAttackMission(currentMemory, bestSourceRoom.name, targetRoomName, true)

			if (currentMission.isActive()) {
				let spawnSuccessful = currentMission.requestSpawns();

				if (!spawnSuccessful) {
					currentMission.memory.ID = 0;
					return 0;
				}

				console.log(bestSourceRoom.name + " Launching heavy controller attack against " + targetRoomName)

				if (newMemory) Memory.combatManager.currentMissions[MISSION_HEAVY_CONTROLLER_ATTACK].push(currentMission.memory);
				return 1;
			}
			return 0;
		}
	}
}


module.exports = HeavyControllerAttackMission