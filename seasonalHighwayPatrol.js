"use strict";

const Mission = require('missionBase')

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');

const creepCreator = require('creepCreator');

const MAX_PATROL_DIST = 15

class SeasonHighwayPatrolMission extends Mission {
	constructor(memory, sourceRoomName, startRoomName, endRoomName, createNew, priority) {
		memory.type = MISSION_SEASONAL_HIGHWAY_PATROL;

		memory.fRefreshRate = 10000;
		// Do this before we make our mission active.
		super(memory, sourceRoomName, startRoomName, createNew, priority);

		if (createNew && this.isActive()) {
			memory.targetRoomName = memory.startRoomName || startRoomName;

			memory.startRoomName = startRoomName
			memory.endRoomName = endRoomName

			memory.routeCost = safeRoute.getSafeRouteCost(sourceRoomName, startRoomName, true)

			memory.firstArrivedInRoom = undefined

			// Give it some time
			memory.lastCreepInRoom = Game.time


			memory.formations = [];
			memory.interestingCreepsSeenTotal = [];


			memory.allRooms = []
			let startCoords = util.getRoomCoords(startRoomName)
			let endCoords = util.getRoomCoords(endRoomName)

			if (startCoords.x < endCoords.x) {
				for (let x = startCoords.x; x <= endCoords.x; x++) {
					memory.allRooms.push(util.getRoomNameFromCoords({x: x, y: startCoords.y}))
				}
			}
			else if (startCoords.x > endCoords.x) {
				for (let x = startCoords.x; x >= endCoords.x; x--) {
					memory.allRooms.push(util.getRoomNameFromCoords({x: x, y: startCoords.y}))
				}
			}
			else if (startCoords.y < endCoords.y) {
				for (let y = startCoords.y; y <= endCoords.y; y++) {
					memory.allRooms.push(util.getRoomNameFromCoords({x: startCoords.x, y: y}))
				}
			}
			else if (startCoords.y > endCoords.y) {
				for (let y = startCoords.y; y >= endCoords.y; y--) {
					memory.allRooms.push(util.getRoomNameFromCoords({x: startCoords.x, y: y}))
				}
			}
		}
	}

	requestSpawns() {
		let parentRoom = Game.rooms[this.memory.sourceRoomName]
		let spawns = parentRoom.find(FIND_MY_SPAWNS);

		// Oh. Crap.
		if (spawns.length == 0) {
			console.log("spawn failed no spawns")
			return;
		}

		let maxDist = MAX_PATROL_DIST;

		if (Game.time - (Memory.combatManager.requestedMissions[this.memory.type][this.memory.startRoomName + "_" + this.memory.endRoomName] || 0) > 100) {
			console.log("Spawn fail not requested")
			return
		}


		if (this.memory.routeCost > maxDist) {

			return		
		}

		let spawn = spawns[0];
			

		if (Game.time - this.memory.lastCreepInRoom > 2000) {
			console.log("Highway patrol not reaching room", this.memory.lastCreepInRoom, this.memory.startRoomName)			
			return false	
		}



		// else if (this.memory.sourceRoomName != "W19S8" && this.memory.sourceRoomName != "W12S3" && this.memory.targetRoomName == "W7S0") {
		// 	console.log("Gap raids must be from W19S8 or W12S3")
		// 	return false
		// }

		// if (this.memory.targetRoomName == "W6S20") {
		// 	console.log("------------ Disabled gap raid for W6S20")
		// 	return false

		// }

		let maxHostileRangedParts = 0;
		let maxHostileHealParts = 0;


		for (let roomName of this.memory.allRooms) {			
			let hostileRangedParts = 0;
			let hostileHealParts = 0;

			if (Game.rooms[roomName]) {
				let hostileCreeps = Game.rooms[roomName].getAllHostileCreepsWithBodyParts([RANGED_ATTACK, ATTACK, HEAL], false);
				for (let creep of hostileCreeps) {
					let bmcp = creep.getBoostModifiedCombatParts(false)
					hostileRangedParts += bmcp.numRanged + bmcp.numAttack * 0.1;
					hostileHealParts += bmcp.numHeal;
				}
			}
			else if (Memory.rooms[roomName]) {
				hostileRangedParts = (Memory.rooms[roomName].creepCombatPartsRanged || 0) + (Memory.rooms[roomName].creepCombatPartsAttack || 0) * 0.1
				hostileHealParts = Memory.rooms[roomName].creepCombatPartsHeal || 0
			}

			maxHostileRangedParts = Math.max(maxHostileRangedParts, hostileRangedParts)
			maxHostileHealParts = Math.max(maxHostileHealParts, hostileHealParts)
		}

		maxHostileRangedParts = Math.min(maxHostileRangedParts, Math.round(maxHostileHealParts * 0.5))


		maxHostileRangedParts = Math.max(1, maxHostileRangedParts);
		// Got to kill some transposts or something. Better actually kill them.
		// This is heal because we build to overcome heal
		maxHostileHealParts = Math.max(6, maxHostileHealParts);

		let maxCreeps = Math.max(1, Math.min(Memory.empireStrength / 2, 3))

		let rambo
		let numRambos
		for (numRambos = 1; numRambos <= maxCreeps; numRambos++) {		
			rambo = creepCreator.createRambo(parentRoom, this.memory.allRooms, 0, 0, Math.ceil(maxHostileRangedParts / numRambos), Math.ceil(maxHostileHealParts / numRambos), false, 0, true)
			if (rambo.body.length) {
				break;
			}
			if (Object.keys(rambo.boosts).length) {
				console.log("ForceNoBoosts set but rambo has boosts?")
				return false
			}
		}

		if (rambo && rambo.body.length > 0) {
			if (numRambos >= 3) {
				// Spawn a tank-healer.
				let healer = creepCreator.createBestHeal(parentRoom, 0, false, false)
				let tank = creepCreator.createBestTank(parentRoom, false, false)
				if (healer.body.length && tank.body.length) {
					let formationCreepNames = [];
					let creepMemory = {targetRoom: this.memory.startRoomName};

					formationCreepNames.push(super.spawnCreep("ranged", healer.body, healer.boosts, spawn, _.clone(creepMemory)));
					formationCreepNames.push(super.spawnCreep("tank", tank.body, tank.boosts, spawn, _.clone(creepMemory)));
					this.memory.formations.push(formationCreepNames);

					numRambos -= 2;
				}

			}
			for (let i = 0; i < numRambos; i++) {				
				console.log("RAMBO spawning for highway patrol", this.memory.startRoomName)
				// role, body, boosts, spawn, extraMemory
				this.spawnCreep("ranged", rambo.body, rambo.boosts, spawn, {attackPower: 0, targetRoom: this.memory.startRoomName})
			}

			return true
		}
		else {
			console.log("Can't spawn enough rambos", maxHostileRangedParts, maxHostileHealParts, maxCreeps)
		}

		return false
	}


	tick() {
		let mmem = this.memory;
		if (this.isActive()) {
			for (let creepName of this.memory.assignedCreeps) {
				let creep = Game.creeps[creepName]
				if (!creep) continue


				if (creep.room.name == this.memory.startRoomName) {
					this.memory.lastCreepInRoom = Game.time
				}

				if (creep.room.name == creep.mem.targetRoom && !creep.room.find(FIND_HOSTILE_CREEPS).length) {
					if (creep.room.name == this.memory.endRoomName) {
						creep.mem.patrolReverse = 1
					}
					else if (creep.room.name == this.memory.startRoomName) {
						creep.mem.patrolReverse = 0
						creep.mem.patrolRoomIdx = 0
					}

					if (creep.mem.patrolReverse) {
						creep.mem.patrolRoomIdx--
						creep.mem.targetRoom = this.memory.allRooms[creep.mem.patrolRoomIdx]
					}
					else {
						creep.mem.patrolRoomIdx++
						creep.mem.targetRoom = this.memory.allRooms[creep.mem.patrolRoomIdx]
					}
				}
			}

			if (Math.random() < 0.01) {
				mmem.routeCost = Math.round((safeRoute.getSafeRouteCost(mmem.sourceRoomName, mmem.startRoomName, true) || 15) * 10) / 10;
			}

			for (let roomName of this.memory.allRooms) {
				let room = Game.rooms[roomName];
				if (!room) continue

				let anyHostiles = 0

				if (room) {
					let interestingCreeps = room.find(FIND_HOSTILE_CREEPS).concat(room.find(FIND_HOSTILE_POWER_CREEPS))

					if (Memory.swc) {
						interestingCreeps = _.filter(interestingCreeps, (threat) => (global.whiteList.indexOf(threat.owner.username) == -1));
					}
					if (Memory.season2) {
						interestingCreeps = _.filter(interestingCreeps, (threat) => (!scouting.isPlayerMediumWhiteListed(threat.owner.username)));	
					}

					anyHostiles = interestingCreeps.length > 0

					for (let creep of interestingCreeps) {
						if (!mmem.interestingCreepsSeenTotal.includes(creep.id)) {
							mmem.interestingCreepsSeenTotal.push(creep.id);
						}
					}
				}
			}

			for (let formationIdx in mmem.formations) {
				let formation = mmem.formations[formationIdx];

				for (let formationCreepName of formation) {
					let formationCreep = Game.creeps[formationCreepName]
					if (!formationCreep) continue;

					formationCreep.memory.formationCreeps = _.clone(formation);
					formationCreep.memory.allSquadCreeps = _.clone(formation);
					formationCreep.combatSnake = 1;
				}
			}
		}

		this.formationPairRenew()


		if (this.isActive() && ((mmem.assignedCreeps.length == 0 && mmem.spawningCreeps.length == 0) || Game.time - mmem.lastLaunchTick > 2000)) {
			if (Game.time - mmem.lastLaunchTick > 1450 && (mmem.interestingCreepsSeenTotal.length >= 4 * mmem.numLaunches || mmem.killCount > mmem.bC / 2)) {
				mmem.s++;
				return this.missionComplete(true);
			}
			else if (Game.time - mmem.lastLaunchTick < 1250) {
				console.log(this.memory.type, "fail RIP")
				console.log(Game.time, mmem.lastLaunchTick)
				console.log(mmem.targetRoomName)

				mmem.f++;

				// Wait for the guys who killed me to despawn.
				mmem.fRefreshRate = 1500;
				mmem.fRefreshRate *= (1.5 - this.getSuccessRate());
				mmem.fTick = Game.time;

				return this.missionComplete(false);
			}
			else {
				// Booooring.
				console.log(this.memory.type, "fail boring")
				console.log(Game.time, mmem.lastLaunchTick)
				console.log(mmem.targetRoomName)

				mmem.fRefreshRate = 5000;

				mmem.fRefreshRate *= (1.5 - this.getSuccessRate());
				mmem.fTick = Game.time;

				if (mmem.killCount < 0.5 * mmem.bC) {
					mmem.fRefreshRate *= 2;
				}
				if (mmem.killCount < 0.25 * mmem.bC) {
					mmem.fRefreshRate *= 2;
				}

				return this.missionComplete(false);
			}
		}

		let respawnTimer = 1350 - mmem.routeCost * 50;


		// Need moar. If our guys are still alive and they've still requested.
		if (Game.time - mmem.lastLaunchTick >= respawnTimer &&
			Game.time - (Memory.combatManager.requestedMissions[this.memory.type][this.memory.startRoomName + "_" + this.memory.endRoomName] || 0) < 100 && 
			mmem.spawningCreeps.length == 0 &&
			Game.time % 10 == 0) {


			if (!this.renewRestricted()) {
				// Are our guys an effective team? Somebody may cripple us and leave us alive, and we don't want to keep
				// spawning in thinking life is going well.
				var effectiveTeam = false;
				for (var creepName of mmem.assignedCreeps) {
					var creep = Game.creeps[creepName];
					if (creep) {
						if (creep.hasActiveBodypart(RANGED_ATTACK) || creep.hasActiveBodypart(HEAL) || creep.hasActiveBodypart(ATTACK)) {
							effectiveTeam = true;
							break;
						}
					}
				}
				if (effectiveTeam) {
					console.log(mmem.sourceRoomName, "relaunching", this.memory.type, "from", this.memory.startRoomName, "to", this.memory.endRoomName)
					console.log(mmem.killCount, mmem.bC, mmem.numLaunches)
					// Attenuate the kill count & cost. If we don't do that we could hit the case where we have 5 good launches we persist through 5 bad ones.
					mmem.killCount /= 2;
					mmem.bC /= 2;
					mmem.numLaunches += 1;

					mmem.lastLaunchTick = Game.time;

					this.requestSpawns();
				}
			}
		}

		super.tick();
	}

	missionComplete(success) {
		super.missionComplete(success);

		delete this.memory.allRooms;
		delete this.memory.routeCost;
		delete this.memory.formations;
		delete this.memory.interestingCreepsSeenTotal;
		delete this.memory.firstArrivedInRoom;
	}


	static requestHighwayPatrol(startRoomName, endRoomName) {
		if (Game.cpu.bucket < 2000) {
			console.log("Season highway patrol low bucket", startRoomName, endRoomName)
			return 0
		}

		if (!Memory.combatManager.requestedMissions[MISSION_SEASONAL_HIGHWAY_PATROL][startRoomName + "_" + endRoomName]) {
			Memory.combatManager.requestedMissions[MISSION_SEASONAL_HIGHWAY_PATROL][startRoomName + "_" + endRoomName] = Game.time;
		}

		for (let mission of Memory.combatManager.currentMissions[MISSION_SEASONAL_HIGHWAY_PATROL]) {
			if (mission.startRoomName == startRoomName && mission.endRoomName == endRoomName) {
				// Doing this already.
				if (mission.ID) {
					return 0;
				}
			}
		}

		console.log("Season highway patrol", startRoomName, endRoomName)

		let lowestScore = Infinity;
		let bestSourceRoom;

		for (let room of Game.myRooms) {
			if (room.restrictOffensiveMissions(undefined, false, false, false)) {
				continue
			}

			let dist = safeRoute.getSafeRouteCost(room.name, startRoomName, true, true)
			let score = dist - room.effectiveLevel * 4;

			// console.log(room, dist, score)

			if (dist < MAX_PATROL_DIST && score < lowestScore) {
				lowestScore = score;
				bestSourceRoom = room;
			}
		}


		if (bestSourceRoom) {
			let currentMemory = {};
			for (let mission of Memory.combatManager.currentMissions[MISSION_SEASONAL_HIGHWAY_PATROL]) {
				if (mission.startRoomName == startRoomName && mission.endRoomName == endRoomName && mission.sourceRoomName == bestSourceRoom.name) {
					currentMemory = mission;
					break;
				}
			}
			var newMemory = (!currentMemory.type);


			// constructor(memory, sourceRoomName, targetRoomName, createNew, priority, parentAssaultMission) {
			let currentMission = new SeasonHighwayPatrolMission(currentMemory || {}, bestSourceRoom.name, startRoomName, endRoomName, true, 0)

			if (currentMission.isActive()) {
				let spawnSuccessful = currentMission.requestSpawns();

				if (!spawnSuccessful) {
					console.log("Highway patrol spawn failed " + startRoomName)
					currentMission.memory.ID = 0;
					return
				}

				console.log(bestSourceRoom.name + "Launching highway patrol to " + startRoomName)

				if (newMemory) Memory.combatManager.currentMissions[MISSION_SEASONAL_HIGHWAY_PATROL].push(currentMission.memory);
				return
			}
			console.log("Highway patrol activate failed ", bestSourceRoom.name, startRoomName)
			return
		}
		else {
			console.log("Highway patrol no spawn room to ", startRoomName, endRoomName)
		}
	}

}


module.exports = SeasonHighwayPatrolMission