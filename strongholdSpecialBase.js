"use strict";

const Mission = require('missionBase')

const safeRoute = require('safeRoute')

class StrongholdSpecialBase extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		if (createNew) {
			memory.targetRoomName = memory.targetRoomName || targetRoomName;
			memory.lootersSpawned = 0;
			memory.pending = 0;
			memory.routeLength = safeRoute.getSafeRouteCost(sourceRoomName, targetRoomName, false, true, 30, false, true)
		}
	}

	requestSpawns() {
		let parentRoom = Game.rooms[this.memory.sourceRoomName]
		let spawns = parentRoom.find2(FIND_MY_SPAWNS);

		// Oh. Crap.
		if (spawns.length == 0) return;

		let spawn = spawns[0];		
		if (!Memory.rooms[this.memory.targetRoomName].invCL) {
			if (!Game.rooms[this.memory.targetRoomName]) return false;

			// We clear the memory when the core dies.
			let rampHP = 0;
			for (let rampart of Game.rooms[this.memory.targetRoomName].ramparts) {
				rampHP += rampart.hits;
			}

			for (let i = 0; i < Math.min(6, Math.ceil(rampHP / (25 * DISMANTLE_POWER * 1000))); i++) {
				this.spawnCreep("strongholdDeconstructor", [], {}, spawn, {targetRoom: this.memory.targetRoomName});
			}

			if (!rampHP) {
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
					// Hmmm
					this.spawnCreep("keeperGuard2", [], {}, spawn, {targetRoom: this.memory.targetRoomName});
					this.spawnCreep("observer", [], {}, spawn, {targetRoom: this.memory.targetRoomName});

					let numLooters = Math.ceil(Math.ceil(loot / (25 * CARRY_CAPACITY)) / Math.ceil(1500 / (6 * this.memory.routeLength * 50)))

					for (let i = 0; i < numLooters; i++) {
						this.spawnCreep("lootFetcher", [], {}, spawn, {targetRoom: this.memory.targetRoomName});
					}
				}
			}

			this.memory.lastLaunchTick = Game.time
			return true
		}

		return false;
	}

	tick() {
		let room = Game.rooms[this.memory.targetRoomName];

		if (this.isActive() && ((this.memory.assignedCreeps.length == 0 && this.memory.spawningCreeps.length == 0) || Game.time - this.memory.lastLaunchTick > 2000)) {
			console.log(this.memory.type, "RIP")
			console.log(Game.time, this.memory.lastLaunchTick)
			console.log(this.memory.targetRoomName)

			this.memory.f++;

			// Wait for the guys who killed me to despawn.
			this.memory.fRefreshRate = 2000;
			this.memory.fRefreshRate *= (1.5 - this.getSuccessRate());
			this.memory.fTick = Game.time;

			return this.missionComplete(false);
		}


		// Respawn
		if (Game.time - this.memory.lastLaunchTick >= 1350 - this.memory.routeLength * 50 &&
			this.memory.spawningCreeps.length == 0 &&
			room &&
			!this.renewRestricted()) {
			// Quick sanity check: are our guys an effective team? Somebody may cripple us and leave us alive, and we don't want to keep
			// spawning in thinking life is going well.
			var effectiveTeam = false;
			for (var creepName of this.memory.assignedCreeps) {
				var creep = Game.creeps[creepName];
				if (creep) {
					if (creep.getActiveBodyparts(ATTACK) > 0 || creep.getActiveBodyparts(WORK) || creep.getActiveBodyparts(RANGED_ATTACK)) {
						effectiveTeam = true;
						break;
					}
				}
			}
			if (effectiveTeam) {
				if (this.requestSpawns()) {					
					this.memory.lastLaunchTick = Game.time;
					this.memory.numLaunches++
					console.log("Renewing", this.memory.sourceRoomName, this.memory.type, "against", this.memory.targetRoomName)
				}
			}
			else {
				console.log("NOT renewing", this.memory.sourceRoomName, this.memory.type, "against", this.memory.targetRoomName, "as not an effective team")
			}
		}
		else {
			if (Math.random() < 0.05) {
				console.log("Not respawning", this.memory.type, "yet", this.memory.targetRoomName, Game.time - this.memory.lastLaunchTick, 1350 - this.memory.routeLength * 50, this.memory.spawningCreeps.length, room, this.renewRestricted())
			}
		}


		// Looters
		if (room && !room.invaderCore) {
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

			if (room && (!this.memory.lootersSpawned || Game.time - this.memory.lootersSpawned > 1350)) {

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

				console.log(loot)

				// Memory.rooms[this.memory.targetRoomName].loot = loot;

				let spawn = Game.rooms[this.memory.sourceRoomName].spawns[0];

				if (spawn) {
					// Hmmm
					this.spawnCreep("keeperGuard2", [], {}, spawn, {targetRoom: this.memory.targetRoomName});
					this.spawnCreep("observer", [], {}, spawn, {targetRoom: this.memory.targetRoomName});


					let numLooters = Math.ceil(Math.ceil(loot / (25 * CARRY_CAPACITY)) / Math.ceil(1500 / (6 * this.memory.routeLength * 50)))

					for (let i = 0; i < numLooters; i++) {
						this.spawnCreep("lootFetcher", [], {}, spawn, {targetRoom: this.memory.targetRoomName});
					}
				}
				this.memory.lootersSpawned = Game.time;

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

		super.tick()
	}

	static getNumOpenNeighbourRamparts(roomName, roomMap, terrain, x, y) {
		let cnt = 0;
		for (let dx = -1; dx <= 1; dx++) {
			for (let dy = -1; dy <= 1; dy++) {
				if (parseInt(roomMap[x+dx][y+dy]) >= 4) continue;
				if (terrain.get(x+dx, y+dy) & TERRAIN_MASK_WALL) continue;

				let blocked = false;
				for (let towerIdx of Memory.rooms[roomName].twrX) {
					if (Memory.rooms[roomName].twrX[towerIdx] == x + dx && Memory.rooms[roomName].twrY[towerIdx] == y + dy) {
						blocked = true;
						break;
					}
				}

				if (!blocked) {
					cnt++
				}
			}
		}
		return cnt;
	}


	static checkAnyZeroNeighbourRamparts(roomName, roomMap, terrain, x, y) {
		let cnt = 0;
		for (let dx = -1; dx <= 1; dx++) {
			for (let dy = -1; dy <= 1; dy++) {
				if (terrain.get(x + dx, y + dy) & TERRAIN_MASK_WALL) continue;

				if (StrongholdSpecialBase.getNumOpenNeighbourRamparts(roomName, roomMap, terrain, x + dx, y + dy) == 0) {
					return true;
				}
			}
		}
		return false;
	}
}


module.exports = StrongholdSpecialBase