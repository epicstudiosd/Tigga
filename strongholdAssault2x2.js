"use strict";

const RoomAssaultMission = require('roomAssault')
const safeRoute = require('safeRoute')
const scouting = require('scouting');

const roomIntel = require('roomIntel');
const utf15 = require('./utf15');
const Codec = utf15.Codec;

class StrongholdAssaultMission extends RoomAssaultMission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.squadSize = 4;
		memory.mask = [[0,0],[1,0],[0,1],[1,1]];
		memory.fRefreshRate = 10000;

		memory.type = memory.type || MISSION_STRONGHOLD_ASSAULT;
		// console.log(JSON.stringify(memory))

		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		if (createNew) {
			memory.lootersSpawned = 0;

			memory.otherAssaultCount = 0;
			for (let otherAssault of Memory.combatManager.currentMissions[MISSION_STRONGHOLD_ASSAULT]) {
				if (otherAssault.ID && otherAssault.ID != memory.ID) {
					memory.otherAssaultCount++
				}
			}

			memory.e = 0
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
		if (Memory.rooms[this.memory.targetRoomName].invCL && (!Game.rooms[this.memory.targetRoomName] || Game.rooms[this.memory.targetRoomName].invaderCore)) {
			return super.requestSpawns(restrictBoosts, refresh)
		}
		else if (Game.rooms[this.memory.targetRoomName]) {
			let parentRoom = Game.rooms[this.memory.sourceRoomName]
			let spawns = parentRoom.find(FIND_MY_SPAWNS);

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

			// if (!rampHP) {
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

				// scouting.setRoomLoot(room)

				// Memory.rooms[this.memory.targetRoomName].loot = Math.max((Memory.rooms[this.memory.targetRoomName].loot || 0), loot);

				if (spawn && loot) {
					if (this.memory.primaryLooter) {
						// Hmmm
						this.spawnCreep("keeperGuard2", [], {}, -1, spawn, false, {targetRoom: this.memory.targetRoomName});
						this.spawnCreep("observer", [], {}, -1, spawn, false, {targetRoom: this.memory.targetRoomName});
					}

					let numLooters = Math.min(12, Math.ceil(Math.ceil(loot / (25 * CARRY_CAPACITY)) / Math.ceil(1500 / (6 * this.memory.routeLength * 50))))

					for (let i = 0; i < numLooters; i++) {
						this.spawnCreep("lootFetcher", [], {}, -1, spawn, false, {targetRoom: this.memory.targetRoomName});
						// spawn.addPrioritySpawn("lootFetcher", {targetRoom: this.memory.targetRoomName});
					}
				}
			// }

			this.memory.lastLaunchTick = Game.time
			return true

			// return super.requestSpawns(true, refresh)
		}
	}

	getBestTarget(squadHeal, formationIdx) {
		let mem = Memory.rooms[this.memory.targetRoomName];

		let mask = JSON.stringify(this.memory.mask);
		if (!mem.navigationByMask || !mem.navigationByMask[mask]) {
			roomIntel.calcNavigableByMask(this.memory.targetRoomName, this.memory.mask, true);
		}

		let maskNavigation = mem.navigationByMask[mask];

		function doesXYFail(x, y, squadSize) {
			const depth = 1;
			const codec = new Codec({ depth, array:1 });

			if (squadSize == 4) {
				if ((x >= 2 && codec.decode(maskNavigation[x - 2])[y] != 1) &&
					(x >= 2 && codec.decode(maskNavigation[x - 2])[y - 1] != 1) &&
					(y >= 2 && codec.decode(maskNavigation[x - 1])[y - 2] != 1) &&
					(y >= 2 && codec.decode(maskNavigation[x])[y - 2] != 1) &&
					codec.decode(maskNavigation[x + 1])[y - 1] != 1 &&
					codec.decode(maskNavigation[x + 1])[y] != 1 &&
					codec.decode(maskNavigation[x])[y + 1] != 1 &&
					codec.decode(maskNavigation[x - 1])[y + 1] != 1
					) {

					return true;
				}
			}
			else if (squadSize == 9) {
				if ((x >= 3 && codec.decode(maskNavigation[x - 3])[y - 1] != 1) &&
					codec.decode(maskNavigation[x + 1])[y - 1] != 1 &&
					(y >= 3 && codec.decode(maskNavigation[x - 1])[y - 3] != 1) &&
					codec.decode(maskNavigation[x - 1])[y + 1] != 1
					) {
					return true;
				}
			}
			return false;
		}



		if (mem.invCH) {
			// Bias to a given direction if possible
			if (mem.invCL == 5 && Game.rooms[this.memory.targetRoomName] && formationIdx !== undefined) {
				let room = Game.rooms[this.memory.targetRoomName]

				function findTarget(x, y, squadSize) {
					let targets = room.lookForAt(LOOK_STRUCTURES, x, y);
					for (let target of targets) {
						if (target.structureType == STRUCTURE_RAMPART && !target.my) {
							if (!doesXYFail(x, y, squadSize)) {
								return {x: x, y: y};
							}
						}
					}
				}

				// Spread out around the stronghold
				// Corners
				if (this.memory.otherAssaultCount % 2 == 0) {
					switch ((formationIdx + Math.floor(this.memory.otherAssaultCount / 2)) % 4) {
						case 0:
							for (let i = 2; i >= 0; i++) {
								let target = findTarget(mem.invCX + i, mem.invCY + i, squadSize);
								if (target) {
									return target
								}				
							}
							break;
						case 1:
							for (let i = 2; i >= 0; i++) {
								let target = findTarget(mem.invCX - i, mem.invCY - i, squadSize);
								if (target) {
									return target
								}				
							}
							break;
						case 2:
							for (let i = 2; i >= 0; i++) {
								let target = findTarget(mem.invCX + i, mem.invCY - i, squadSize);
								if (target) {
									return target
								}				
							}
							break;
						case 3:
							for (let i = 2; i >= 0; i++) {
								let target = findTarget(mem.invCX - i, mem.invCY + i, squadSize);
								if (target) {
									return target
								}				
							}
							break;
					}
				}
				// Flats		
				else {
					switch ((formationIdx + Math.floor(this.memory.otherAssaultCount / 2)) % 4) {
						case 0:
							for (let i = 2; i >= 0; i++) {
								let target = findTarget(mem.invCX - i, mem.invCY, squadSize);
								if (target) {
									return target
								}				
							}
							break;
						case 1:
							for (let i = 2; i >= 0; i++) {
								let target = findTarget(mem.invCX + i, mem.invCY, squadSize);
								if (target) {
									return target
								}				
							}
							break;
						case 2:
							for (let i = 2; i >= 0; i++) {
								let target = findTarget(mem.invCX, mem.invCY + i, squadSize);
								if (target) {
									return target
								}				
							}
							break;
						case 3:
							for (let i = 2; i >= 0; i++) {
								let target = findTarget(mem.invCX, mem.invCY - i, squadSize);
								if (target) {
									return target
								}				
							}
							break;
					}
				}
			}

			let fail = doesXYFail(mem.invCX, mem.invCY, this.memory.squadSize)
			if (!fail) {
				return {x: mem.invCX, y: mem.invCY};
			}
			else {
				console.log("Invader core with invalid target pos", this.memory.targetRoomName)
				// delete mem.navigationByMask[mask]
			}
		}
		else {
			if (Game.rooms[this.memory.targetRoomName]) {
				let invaderStructures = Game.rooms[this.memory.targetRoomName].find(FIND_HOSTILE_STRUCTURES, {
					filter: (struct) => {
						return struct.owner.username == "Invader" && !doesXYFail(struct.pos.x, struct.pos.y, this.memory.squadSize)
					}
				})

				if (invaderStructures.length) {
					return {x: invaderStructures[0].pos.x, y: invaderStructures[0].pos.y}
				}
			}
			else {
				return super.getBestTarget(squadHeal, formationIdx)
			}
		}
	}

	tick() {
		for (let creepName of this.memory.assignedCreeps) {
			let creep = Game.creeps[creepName]
			if (!creep) continue;

			if (creep.room.name == this.memory.targetRoomName) {
				creep.killAllStructures = 1;
				delete creep.mem.sleep
			}
		}

		if (Game.rooms[this.memory.targetRoomName] && !Game.rooms[this.memory.targetRoomName].invaderCore) {
			for (let creepName of this.memory.assignedCreeps) {
				let creep = Game.creeps[creepName]
				if (!creep) continue;

				creep.ignoreInvaders = 1;

				if (Game.rooms[this.memory.targetRoomName].ramparts.length) {					
					creep.ignoreSKs = 1
				}

				// This is done by something else
				if (Game.rooms[this.memory.targetRoomName] && Game.rooms[this.memory.targetRoomName].dangerous !== 2) {
					if (Memory.rooms[this.memory.targetRoomName].rampHP == 0 || Game.rooms[this.memory.targetRoomName].ramparts.length == 0) {						
						if (creep.ticksToLive >= this.memory.routeLength * 50 && 
							creep.hasBoost()) {
							creep.mem.role = "recycler"
						}
					}
					else {
						if (creep.ticksToLive >= this.memory.routeLength * 50 && 
							creep.ticksToLive < 2 * this.memory.routeLength * 50 && 
							creep.hasBoost()) {
							creep.mem.role = "recycler"
						}
					}

				}
			}

			Game.rooms[this.memory.targetRoomName].ignoreInvaders = 1

			if (Game.rooms[this.memory.sourceRoomName].lootRooms.indexOf(this.memory.targetRoomName) == -1) {
				Game.rooms[this.memory.sourceRoomName].lootRooms.push(this.memory.targetRoomName);
				let route = safeRoute.findSafeRoute(this.memory.sourceRoomName, this.memory.targetRoomName);
				for (let step of route) {
					if (Game.rooms[this.memory.sourceRoomName].lootRooms.indexOf(step.room) == -1) {
						Game.rooms[this.memory.sourceRoomName].lootRooms.push(step.room);
					}
				}
			}

			// Otherwise scounting might not update and we'll launch a new one
			delete Memory.rooms[this.memory.targetRoomName].invCH
			delete Memory.rooms[this.memory.targetRoomName].invCX
			delete Memory.rooms[this.memory.targetRoomName].invCY
			delete Memory.rooms[this.memory.targetRoomName].invCL

			let room = Game.rooms[this.memory.targetRoomName];

			if (room && !this.memory.lootersSpawned && !Memory.rooms[this.memory.targetRoomName].lootersSpawned) {
				// this.requestSpawns(true, true);

				this.memory.lootersSpawned = 1;
				this.memory.primaryLooter = 1
				Memory.rooms[this.memory.targetRoomName].lootersSpawned = 1;

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

				// The above gets the total amount. This sets the "value" amount
				// scouting.setRoomLoot(room)

				// Memory.rooms[this.memory.targetRoomName].loot = Math.max((Memory.rooms[this.memory.targetRoomName].loot || 0), loot);

				let spawn = Game.rooms[this.memory.sourceRoomName].spawns[0];

				if (spawn) {
					// Hmmm
					this.spawnCreep("keeperGuard2", [], {}, -1, spawn, false, {targetRoom: this.memory.targetRoomName});
					this.spawnCreep("observer", [], {}, -1, spawn, false, {targetRoom: this.memory.targetRoomName});

					// spawn.addPrioritySpawn("keeperGuard2", {targetRoom: this.memory.targetRoomName});
					// spawn.addPrioritySpawn("observer", {targetRoom: this.memory.targetRoomName});
					
					let numLooters = Math.min(12, Math.ceil(Math.ceil(loot / (25 * CARRY_CAPACITY)) / Math.ceil(1500 / (6 * this.memory.routeLength * 50))))

					for (let i = 0; i < numLooters; i++) {
						// spawn.addPrioritySpawn("lootFetcher", {targetRoom: this.memory.targetRoomName});
						this.spawnCreep("lootFetcher", [], {}, -1, spawn, false, {targetRoom: this.memory.targetRoomName});
					}
				}

			}
			let numInvaderStructures = Game.rooms[this.memory.targetRoomName].find(FIND_HOSTILE_STRUCTURES, {
				filter: (struct) => {
					return struct.owner.username == "Invader"
				}
			}).length

			if (numInvaderStructures == 0 && !Memory.rooms[this.memory.targetRoomName].loot) {
				this.memory.s++;
				this.missionComplete(true);
				return
			}

		}
		else {
			// 'cos they do
			Memory.rooms[this.memory.targetRoomName].towerShootsWithFocus = 1;
		}


		super.tick();
	}
}


module.exports = StrongholdAssaultMission