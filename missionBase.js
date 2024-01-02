"use strict";

var util = require('util');
var missionInfo = require('missionInfo');

// Mission id != 0 means active mission, otherwise it's inactive
class CombatMission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority, fRefreshMod) {
		this.memory = memory;

		fRefreshMod = fRefreshMod || 1;


		// memory.fTick = memory.fTick || 0;
		memory.fRefreshRate = memory.fRefreshRate || 0;

		if (!memory.ID) {
			if (Game.time < (memory.fTick || 0) + memory.fRefreshRate * fRefreshMod) {
				//if (memory.type == MISSION_STRONGHOLD_MEGA_ASSAULT) {
					console.log(memory.type, "Not activating due to fTick", memory.fTick, memory.fRefreshRate * fRefreshMod)
				//}
				return;
			}

			let mem = Memory.rooms[targetRoomName]

			if (Memory.rooms[targetRoomName] && mem.missionFailList && mem.missionFailList[memory.type]) {
				if (Game.time < mem.missionFailList[memory.type] + (memory.fRefreshRate || 5) * 0.75 * fRefreshMod) {
					//if (memory.type == MISSION_STRONGHOLD_MEGA_ASSAULT) {
						console.log("Not activating due to missionFailList", mem.missionFailList[memory.type], memory.fRefreshRate * fRefreshMod * 0.75)
					//}
					return;
				}
				else if (mem.missionFailList[memory.type]) {
					delete mem.missionFailList[memory.type];
					if (Object.keys(mem.missionFailList).length == 0) {
						delete mem.missionFailList;
					}
				}
			}
		}

		memory.s = memory.s || 0;
		memory.f = memory.f || 0;

		// New mission!
		if (createNew && !memory.ID) {
			if (priority) {
				memory.p = Math.round(priority * 100) / 100;
			}
			else {
				memory.p = 0
			}

			Memory.combatManager.ID++
			memory.ID = Memory.combatManager.ID;

			memory.assignedCreeps = [];
			memory.spawningCreeps = [];
			memory.spawningBodies = {};
			memory.spawningCreepBoosts = {};

			memory.sourceRoomName = memory.sourceRoomName || sourceRoomName;

			memory.killCount = 0;
			memory.bC = 0;

			memory.pending = 1;
			// memory.fTick = memory.fTick || -1e5;
			memory.startTick = Game.time;
			memory.lastLaunchTick = Game.time;
			memory.numLaunches = 1;
			memory.effectiveNumLaunches = 1;
		}
	}

	tick() {
		if (this.isActive()) {
			let mem = this.memory;
			// Is are we ready to launch?
			if ((mem.pending && (mem.spawningCreeps.length == 0 && mem.assignedCreeps.length > 0)) || (Game.time - this.memory.startTick) > 750) {
				var spawning = false;
				for (var creepName of mem.assignedCreeps) {
					if (Game.creeps[creepName]) {
						if (Game.creeps[creepName].spawning) {
							spawning = true;
							break;
						}
					}
				}

				if (!spawning) {
					mem.pending = 0;
					for (var creepName of mem.assignedCreeps) {
						if (Game.creeps[creepName]) {
							Game.creeps[creepName].mem.retreat = 0;
						}
					}
				}
				else if (mem.pending) {
					for (var creepName of mem.assignedCreeps) {
						if (Game.creeps[creepName]) {
							Game.creeps[creepName].mem.retreat = Game.creeps[creepName].ticksToLive > 100 ? 1 : 0;
						}
					}
				}
			}
			// If not, stay at the fallback position
			else if (mem.pending) {
				for (var creepName of mem.assignedCreeps) {
					if (Game.creeps[creepName]) {
						Game.creeps[creepName].mem.retreat = Game.creeps[creepName].ticksToLive > 100 ? 1 : 0;
					}
				}
				// for (let creepName of mem.spawningCreeps)
			}
			// Track kills
			if (!mem.pending) {

				// if (Math.random() < 0.1) {
				// 	for (var creepName of mem.assignedCreeps) {
				// 		if (Game.creeps[creepName]) {
				// 			Game.creeps[creepName].memory.retreat = 0;
				// 		}
				// 	}
				// }
				if (Game.rooms[mem.targetRoomName]) {
					mem.killCount += Game.rooms[mem.targetRoomName].killCount
				}
			}

			// RIP
			if (Game.time % 5 == 0) {
				for (var creepName of _.clone(mem.assignedCreeps)) {
					if (!Game.creeps[creepName]) {
						// console.log("pull", creepName)
						_.pull(mem.assignedCreeps, creepName);
					}
				}
			}
			// Have our dudes spawned? If so, move them to active
			// if (Game.time % 3 == 0) {
				for (var creepName of _.clone(mem.spawningCreeps)) {
					if (Game.creeps[creepName]/* && Game.creeps[creepName].id*/) {
						_.pull(mem.spawningCreeps, creepName);
						delete mem.spawningBodies[creepName];
						delete mem.spawningCreepBoosts[creepName];
						this.assignCreep(Game.creeps[creepName]);
					}
				}
			// }

			// If things go wrong we end up here. Mission should have been complete due to other parameters. One possible cause of this
			// is the spawn backing out of our requests due to being overloaded.
			if ((!mem.pending && Game.time - mem.lastLaunchTick > 3000) || (mem.pending && Game.time - mem.startTick > 1500)) {
				if (mem.type != MISSION_CONVOY_TAKEDOWN) {
					this.missionComplete(false)
				}
			}
		}
	}

	getNumCombatBodyParts() {
		var bodyCount = 0;
		if (this.isActive()) {
			for (var creepName of this.memory.assignedCreeps) {
				if (Game.creeps[creepName]) {
					bodyCount += Game.creeps[creepName].body.length;
				}
			}
			for (var creepName of this.memory.spawningCreeps) {
				if (this.memory.spawningBodies[creepName]) {
					bodyCount += this.memory.spawningBodies[creepName].length;
				}
			}
		}
		return bodyCount;
	}

	cleanMemory() {
		let mem = this.memory;

		delete mem.spawningBodies;
		delete mem.spawningCreepBoosts;
		delete mem.bC;
		delete mem.pending;
		delete mem.numLaunches;
		delete mem.effectiveNumLaunches;
		delete mem.p;
		delete mem.killCount;
		delete mem.startTick;
	}

	missionComplete(success) {
		let mem = this.memory;
		for (var creepName of mem.assignedCreeps) {
			if (Game.creeps[creepName]) {
				if (Game.creeps[creepName].mem.ID) {				
					Game.creeps[creepName].mem.ID = 0;

					// Recycle boosted creeps.
					if (!Game.creeps[creepName].room.dangerous && (Game.creeps[creepName].hasBoost() || (Memory.creeps[creepName].targetBoosts && Object.keys(Memory.creeps[creepName].targetBoosts).length > 0))) {
						Game.creeps[creepName].memory.role = "recycler";
					}
					else {
						Memory.combatManager.idlePool.push(creepName)
					}
				}
				else {
					console.log("ERR: Assigned creep with no ID", creepName, JSON.stringify(mem))
				}
			}
		}
		// Zero mission ID is considered idle
		mem.ID = 0;

		for (let sourceRoomName of mem.sourceRoomNames || [mem.sourceRoomName]) {
			let room = Game.rooms[sourceRoomName];
			if (room) {
				let spawn = room.find(FIND_MY_SPAWNS)[0];
				if (spawn) {
					for (let creepName of mem.spawningCreeps) {
						spawn.removePrioritySpawnByName(creepName);
					}
				}
			}
		}

		// Decay these quite hard
		mem.s = Math.round(mem.s * 800) / 1000;
		mem.f = Math.round(mem.f * 800) / 1000;

		if (!success && mem.targetRoomName && Memory.rooms[mem.targetRoomName]) {
			Memory.rooms[mem.targetRoomName].missionFailList = Memory.rooms[mem.targetRoomName].missionFailList || {};
			Memory.rooms[mem.targetRoomName].missionFailList[mem.type] = Game.time;
		}

		// Don't let other peeps delete these
		delete mem.assignedCreeps;
		delete mem.spawningCreeps;		

		this.cleanMemory()
	}

	get ID() {
		return this.memory.ID;
	}
	set ID(ID) {
		this.memory.ID = ID;
	}

	isActive() {
		return !!this.memory.ID;
	}

	getSuccessRate() {
		if (this.memory.s || this.memory.f) {
			return this.memory.s / (this.memory.s + this.memory.f)
		}
		else {
			return 0.5;
		}
	}

	get spawningCreeps() {
		return this.memory.spawningCreeps;
	}

	getSpawningBody(creepName) {
		return this.memory.spawningBodies[creepName];
	}

	getSpawningBoosts(creepName) {
		return this.memory.spawningCreepBoosts[creepName];
	}

	spawnCreep(role, body, boosts, spawn, extraMemory, name) {
		var name = name || (role[0] + this.memory.ID.toString() + "_" + Memory.creepCount.toString());
		this.memory.spawningCreeps.push(name);
		this.memory.spawningBodies[name] = body;
		this.memory.spawningCreepBoosts[name] = boosts;

		if (boosts && spawn) {
			for (let boost in boosts) {
				spawn.room.requestAvailableBoost(boost)
			}
		}

		extraMemory = _.clone(extraMemory) || {};
		Object.assign(extraMemory, {"ID" : this.memory.ID, "targetBoosts": boosts})

		// console.log(JSON.stringify(extraMemory))

		spawn.addPrioritySpawn(role, extraMemory, name, body);
		Memory.creepCount++;

		global._sourceRoomSpawningMission = global._sourceRoomSpawningMission || {};
		global._sourceRoomSpawningMission[spawn.room.name] = 1;

		return name;
	}

	assignCreep(creep) {
		// console.log("assign", creep.name)
		if (this.isActive()) {
			// Normally this is set by the creep on first touch
			// But we need it too. Need to update spawn costs as that's done by this too
			if (!creep.mem.bC) {
				creep.notifyWhenAttacked(false)
				creep.mem.c = 0
				creep.mem.bC = util.getECostForCreep(creep)
				Memory.stats.spawnCosts[creep.mem.role] = (Memory.stats.spawnCosts[creep.mem.role] || 0) + creep.mem.bC;
			}

			let diff = creep.mem.bC * (creep.ticksToLive || 1500) / 1500;

			this.memory.bC += diff;

			// Only count fresh ones
			if (creep.ticksToLive > 1495) {
				Memory.stats.missionCosts[this.memory.type] = (Memory.stats.missionCosts[this.memory.type] || 0) + diff
			}

			creep.mem.retreat = 0;
			creep.mem.ID = this.memory.ID;
			this.memory.assignedCreeps.push(creep.name);

			if (creep.mem.sR === creep.mem.fallbackRoom && this.memory.sourceRoomName) {
				creep.mem.fallbackRoom = this.memory.sourceRoomName;
				creep.mem.sR = this.memory.sourceRoomName;
			}

			// if (Memory.combatManager.idlePool.indexOf(creep.name) != -1) {
				_.pull(Memory.combatManager.idlePool, creep.name)
			// }
		}
		else {
			creep.mem.ID = 0;
			Memory.combatManager.idlePool.push(creep.name)
		}
	}

	renewRestricted(sourceRoomName) {
		let room = Game.rooms[this.memory.sourceRoomName || sourceRoomName]
		// if (Memory.season2 && Game.time < 1227463 + 5000) {
		// 	if (Memory.rooms[this.memory.targetRoomName] && Memory.rooms[this.memory.targetRoomName].owner == "Kasami") {
		// 		console.log("Not allowing renew on kasami's rooms")
		// 		return true
		// 	}
		// }
		return room.restrictOffensiveMissions(this.memory.targetRoomName, true, false, false) || missionInfo.isRoomSpawningMission(room);
	}

	formationPairRenew() {
		let mmem = this.memory;
		
		for (let formationIdx in mmem.formations) {
			let formation = mmem.formations[formationIdx];

			let currentlySpawning = false;

			for (let formationCreepName of formation) {
				if (mmem.spawningCreeps.includes(formationCreepName)) {
					currentlySpawning = true;
					break
				}

				let formationCreep = Game.creeps[formationCreepName]
				if (!formationCreep) continue;
				if (formationCreep.spawning) {
					currentlySpawning = true;
					break
				}
			}

			if (currentlySpawning) {
				for (let formationCreepName of formation) {
					let formationCreep = Game.creeps[formationCreepName]
					if (!formationCreep) continue;
					if (!formationCreep.hasBoost()) {
						formationCreep.renew = 1;
					}
				}
			}
		}
	}

	get type() {
		return this.memory.type;
	}

	get assignedCreeps() {
		return this.memory.assignedCreeps;
	}
	set assignedCreeps(creeps) {
		this.memory.assignedCreeps = creeps;
	}

	get sourceRoomName() {
		return this.memory.sourceRoomName;
	}
}


module.exports = CombatMission