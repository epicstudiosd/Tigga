"use strict";

const MegaAssaultMission = require('megaAssault')
const safeRoute = require('safeRoute')

const roomIntel = require('roomIntel');
const utf15 = require('./utf15');
const Codec = utf15.Codec;

class StrongholdMegaAssaultMission extends MegaAssaultMission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.squadSize = 4;
		memory.mask = [[0,0],[1,0],[0,1],[1,1]];
		memory.fRefreshRate = 20000;

		memory.type = memory.type || MISSION_STRONGHOLD_MEGA_ASSAULT;
		// console.log(JSON.stringify(memory))

		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		if (createNew && this.isActive()) {
			// Need enough points to poke at or it's all pointless
			if (memory.targetTiles.length < StrongholdMegaAssaultMission.getRequiredNumTargetTiles(targetRoomName)) {
				memory.fTick = Game.time
				memory.fRefreshRate = 5000;
				memory.ID = 0;
				console.log(memory.type, "activate failed due to not enouhg target tiles (stronghold mega)", memory.targetTiles.length, StrongholdMegaAssaultMission.getRequiredNumTargetTiles(targetRoomName))
				return;
			}

			memory.lootersSpawned = 0;
			memory.primaryLooter = 0;

			memory.otherAssaultCount = 0;
			for (let otherAssault of Memory.combatManager.currentMissions[MISSION_STRONGHOLD_MEGA_ASSAULT]) {
				if (otherAssault.ID && otherAssault.ID != memory.ID) {
					memory.otherAssaultCount++
				}
			}
		}
	}

	static getRequiredNumTargetTiles(targetRoomName) {
		let mem = Memory.rooms[targetRoomName]

		// If we're currently assaulting then take defenders as-is. Otherwise wait until there are 9.
		let currentlyAssaulting = 0;
		for (let assault of Memory.combatManager.currentMissions[MISSION_STRONGHOLD_MEGA_ASSAULT]) {
			if (assault.ID) {
				currentlyAssaulting = 1;
				break;
			}
		}
		// Crap, I don't know, probably can't get another room involved if there's only 6 spots. Probably don't want to either.
		if (currentlyAssaulting) {
			return 6;
		}

		let numRanged = mem.creepRanged
		let numAttack = mem.creepAttack
		let numFortifier = mem.creepFortifier

		if (numRanged + numAttack + numFortifier == 9) {
			return 6 + numRanged * 2 + numFortifier * 3
		}
		else {
			return Infinity
		}
	}

	// Dismantle doesn't work on cores
	// They're all ramparty _anyway_
	selectCloseCombat() {
		this.memory.closeCombat = 0;
		this.memory.directional = 0;
		return 0;
	}

	requestSpawns(restrictBoosts, refresh) {
		if (Memory.rooms[this.memory.targetRoomName].invCL) {
			return super.requestSpawns(restrictBoosts, refresh)
		}
		else {
			let parentRoom = Game.rooms[this.memory.sourceRoomName]
			let spawns = parentRoom.find2(FIND_MY_SPAWNS);

			// Oh. Crap.
			if (spawns.length == 0) return;
			let spawn = spawns[0];

			// We clear the memory when the core dies.
			let rampHP = 0;
			for (let rampart of Game.rooms[this.memory.targetRoomName].ramparts) {
				rampHP += rampart.hits;
			}

			for (let i = 0; i < Math.min(6, Math.ceil(rampHP / (25 * DISMANTLE_POWER * 1000))); i++) {
				this.spawnCreep("strongholdDeconstructor", [], {}, -1, spawn, false, {targetRoom: this.memory.targetRoomName});
			}
			if (rampHP) {
				this.memory.lastLaunchTick = Game.time
			}

			if (this.memory.primaryLooter && !rampHP) {				
				let room = Game.rooms[this.memory.targetRoomName]

				let loot = 0;
				if (room.storage) {
					loot += _.sum(room.storage.store) - (room.storage.store[RESOURCE_ENERGY] || 0)
				}
				if (room.terminal) {
					loot += _.sum(room.terminal.store) - (room.terminal.store[RESOURCE_ENERGY] || 0)
				}

				for (let container of room.containers) {
					loot += _.sum(container.store) - (container.store[RESOURCE_ENERGY] || 0)
				}

				for (let ruin of room.find(FIND_RUINS)) {
					if (ruin.store) {
						loot += _.sum(ruin.store) - (ruin.store[RESOURCE_ENERGY] || 0)
					}
				}

				// Memory.rooms[this.memory.targetRoomName].loot = Math.max((Memory.rooms[this.memory.targetRoomName].loot || 0), loot);

				if (spawn && loot) {
					this.memory.lastLaunchTick = Game.time
					// Hmmm
					this.spawnCreep("keeperGuard2", [], {}, -1, spawn, false, {targetRoom: this.memory.targetRoomName});
					this.spawnCreep("observer", [], {}, -1, spawn, false, {targetRoom: this.memory.targetRoomName});

					let numLooters = 6

					for (let i = 0; i < numLooters; i++) {
						this.spawnCreep("lootFetcher", [], {}, -1, spawn, false, {targetRoom: this.memory.targetRoomName});
					}
				}
			}

			return;
			// return super.requestSpawns(true, refresh)
		}
	}

	getBestTarget(squadHeal, inFormationIdx, otherAssaults, forceChange) {
		let mem = Memory.rooms[this.memory.targetRoomName];

		if (mem.invCH) {
			return super.getBestTarget(squadHeal, inFormationIdx, otherAssaults, forceChange)
		}
		else {
			if (Game.rooms[this.memory.targetRoomName]) {
				let invaderStructures = Game.rooms[this.memory.targetRoomName].find(FIND_HOSTILE_STRUCTURES, {
					filter: (struct) => {
						return struct.owner.username == "Invader"
					}
				})

				if (invaderStructures.length) {
					return {x: invaderStructures[0].pos.x, y: invaderStructures[0].pos.y}
				}
			}
			else {
				return super.getBestTarget(squadHeal, inFormationIdx, otherAssaults, forceChange)
			}
		}
	}

	tick() {
		let cpu = Game.cpu.getUsed();

		for (let creepName of this.memory.assignedCreeps) {
			let creep = Game.creeps[creepName]
			if (!creep) continue;

			if (creep.room.name == this.memory.targetRoomName) {
				creep.killAllStructures = 1;
				delete creep.mem.sleep
			}
		}

		if (Game.rooms[this.memory.targetRoomName] && 
			Game.rooms[this.memory.targetRoomName].invaderCore && 
			Game.rooms[this.memory.targetRoomName].find(FIND_MY_CREEPS).length > 10 && 
			!Memory.rooms[this.memory.targetRoomName].strongholdNukeLaunched && 
			global.roomAssaultCounts[this.memory.targetRoomName].activeFormations >= 4 && 
			!Game.rooms[this.memory.targetRoomName].find(FIND_NUKES).length) {

			let activeNukers = [];
			for (let room of Game.myRooms) {
				if (Game.map.getRoomLinearDistance(room.name, this.memory.targetRoomName) <= NUKE_RANGE && room.canLaunchNuke()) {
					activeNukers.push(room.nuker);
				}
			}

			_.shuffle(activeNukers);

			activeNukers[0].launchNuke(new RoomPosition(Memory.rooms[this.memory.targetRoomName].invCX, Memory.rooms[this.memory.targetRoomName].invCY, this.memory.targetRoomName))

			Memory.rooms[this.memory.targetRoomName].strongholdNukeLaunched = 1;

		}

		if (Game.rooms[this.memory.targetRoomName] && !Game.rooms[this.memory.targetRoomName].invaderCore) {
			for (let creepName of this.memory.assignedCreeps) {
				let creep = Game.creeps[creepName]
				if (!creep) continue;

				creep.ignoreInvaders = 1;
			}

			Game.rooms[this.memory.targetRoomName].ignoreInvaders = 1

			if (Game.map.getRoomLinearDistance(this.memory.sourceRoomName, this.memory.targetRoomName) <= 5) {				
				if (Game.rooms[this.memory.sourceRoomName].lootRooms.indexOf(this.memory.targetRoomName) == -1) {
					Game.rooms[this.memory.sourceRoomName].lootRooms.push(this.memory.targetRoomName);
					let route = safeRoute.findSafeRoute(this.memory.sourceRoomName, this.memory.targetRoomName);
					for (let step of route) {
						if (Game.rooms[this.memory.sourceRoomName].lootRooms.indexOf(step.room) == -1) {
							Game.rooms[this.memory.sourceRoomName].lootRooms.push(step.room);
						}
					}
				}
			}

			// Otherwise scounting might not update and we'll launch a new one
			delete Memory.rooms[this.memory.targetRoomName].invCH
			delete Memory.rooms[this.memory.targetRoomName].invCX
			delete Memory.rooms[this.memory.targetRoomName].invCY
			delete Memory.rooms[this.memory.targetRoomName].invCL
			delete Memory.rooms[this.memory.targetRoomName].strongholdNukeLaunched

			let room = Game.rooms[this.memory.targetRoomName];

			if (Game.map.getRoomLinearDistance(this.memory.sourceRoomName, this.memory.targetRoomName) <= 5) {
				let totalAssaultCount = 0;
				for (let otherAssault of Memory.combatManager.currentMissions[MISSION_STRONGHOLD_MEGA_ASSAULT]) {
					if (otherAssault.ID && Game.map.getRoomLinearDistance(otherAssault.sourceRoomName, otherAssault.targetRoomName) <= 5) {
						totalAssaultCount++
					}
				}

				if (room && !this.memory.lootersSpawned && (Memory.rooms[this.memory.targetRoomName].lootersSpawned || 0) < totalAssaultCount) {
					this.memory.lootersSpawned = 1;
					Memory.rooms[this.memory.targetRoomName].lootersSpawned = (Memory.rooms[this.memory.targetRoomName].lootersSpawned || 0) + 1;

					let loot = 0;
					if (room.storage) {
						loot += _.sum(room.storage.store) - (room.storage.store[RESOURCE_ENERGY] || 0)
					}
					if (room.terminal) {
						loot += _.sum(room.terminal.store) - (room.terminal.store[RESOURCE_ENERGY] || 0)
					}

					for (let container of room.containers) {
						loot += _.sum(container.store) - (container.store[RESOURCE_ENERGY] || 0)
					}

					for (let ruin of room.find(FIND_RUINS)) {
						if (ruin.store) {
							loot += _.sum(ruin.store) - (ruin.store[RESOURCE_ENERGY] || 0)
						}
					}

					// Memory.rooms[this.memory.targetRoomName].loot = Math.max((Memory.rooms[this.memory.targetRoomName].loot || 0), loot);

					let spawn = Game.rooms[this.memory.sourceRoomName].spawns[0];

					if (spawn) {
						// Hmmm
						if (Memory.rooms[this.memory.targetRoomName].lootersSpawned == 1) {
							this.memory.primaryLooter = 1
							this.spawnCreep("keeperGuard2", [], {}, -1, spawn, false, {targetRoom: this.memory.targetRoomName});
							this.spawnCreep("observer", [], {}, -1, spawn, false, {targetRoom: this.memory.targetRoomName});
						}

						let numLooters = Math.min(12, Math.ceil(Math.ceil(loot / (25 * CARRY_CAPACITY)) / Math.ceil(1500 / (6 * this.memory.routeLength * 50))))

						for (let i = 0; i < numLooters; i++) {
							this.spawnCreep("lootFetcher", [], {}, -1, spawn, false, {targetRoom: this.memory.targetRoomName});
						}
					}
				}
			}
			let numInvaderStructures = Game.rooms[this.memory.targetRoomName].find(FIND_HOSTILE_STRUCTURES, {
				filter: (struct) => {
					return struct.owner.username == "Invader"
				}
			}).length

			if (numInvaderStructures == 0 && (!this.memory.primaryLooter || !Memory.rooms[this.memory.targetRoomName].loot)) {
				this.memory.s++;
				this.missionComplete(true);
				return
			}
		}
		else {
			// 'cos they do
			Memory.rooms[this.memory.targetRoomName].towerShootsWithFocus = 1;
		}

		Memory.stats.profiler["StrongholdMegaAssaultTick1" + this.memory.sourceRoomName + "_" + this.memory.targetRoomName] = Game.cpu.getUsed() - cpu;

		super.tick();
	}
}


module.exports = StrongholdMegaAssaultMission