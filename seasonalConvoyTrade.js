"use strict";

const Mission = require('missionBase')

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');
const creepCreator = require('creepCreator');



class SeasonalConvoyTrade extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, convoyDirection, createNew, priority) {
		memory.type = memory.type || MISSION_SEASONAL_CONVOY_TRADE;

		// Do this before we make our mission active.
		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		if (createNew && this.isActive()) {
			memory.targetRoomName = memory.targetRoomName || targetRoomName;

			if (Game.rooms[memory.targetRoomName]) {
				let resources = []

				let convoyCreeps = Game.rooms[memory.targetRoomName].find(FIND_HOSTILE_CREEPS, {filter: (h) => {return h.owner.username == "Screeps"}})
				for (let creep of convoyCreeps) {
					let resource = Object.keys(creep.store)[0]

					if (!Memory.stats.globalResources[resource]) {
						continue
					}

					resources.push(resource)

					// if ((Memory.tradeResources || []).includes(resource)) {
					// 	resources.push(resource)
					// }
					// else if (COMMODITIES[resource].level) {
					// 	if (resource == RESOURCE_COMPOSITE || resource == RESOURCE_CRYSTAL || resource == RESOURCE_LIQUID) {
					// 		if ((Memory.stats.globalResources[resource] || 0) > 2048) {
					// 			resources.push(resource)
					// 		}
					// 	}
					// 	else if ((Memory.stats.globalResources[resource] || 0) > 1024 >> (COMMODITIES[resource].level || 0)) {
					// 	 	resources.push(resource)
					// 	}
					// 	else if (COMMODITIES[resource].level == 5) {
					// 		resources.push(resource)	
					// 	}
					// }
					// else if (!util.getDeBar(resource)) {
					// 	if ((Memory.stats.globalResources[resource] || 0) > 2048) {
					// 		resources.push(resource)
					// 	}
					// }
					// else if ((Memory.stats.globalResources[resource] || 0) > 10000) {
					// 	resources.push(resource)
					// }
				}

				if (!resources.length) {
					memory.ID = 0
					return
				}

				memory.resources = resources
			}
			else {
				console.log("New convoy trade without vision?")
			}

			var sectorPos = util.getSectorCoords(targetRoomName);
			var globalPos = util.getRoomCoords(targetRoomName);

			function correctMod(n, m) {
  				return ((n % m) + m) % m;
			}

			if (sectorPos.x) {
				// Zero origin
				if (globalPos.x < 0) {
					globalPos.x += 1
				}
				if (convoyDirection == TOP_RIGHT || convoyDirection == RIGHT || convoyDirection == BOTTOM_RIGHT) {
					memory.convoyDirection = RIGHT;
					let finalRoom = {x: globalPos.x - correctMod(globalPos.x, 10), y: globalPos.y};
					// Reverse the zero origin. When negative crossroads are -1, -11, -21
					if (globalPos.x < 0) {
						finalRoom.x -= 1;
					}

					// Right is negative
					let targetRoom = _.clone(finalRoom);
					targetRoom.x += 1;

					memory.interceptRoom = util.getRoomNameFromCoords(targetRoom);
				}
				else if (convoyDirection == TOP_LEFT || convoyDirection == LEFT || convoyDirection == BOTTOM_LEFT) {
					memory.convoyDirection = LEFT;
					let finalRoom = {x: globalPos.x + 10 - correctMod(globalPos.x, 10), y: globalPos.y};
					// Reverse the zero origin. When negative crossroads are -1, -11, -21
					if (globalPos.x < 0) {
						finalRoom.x -= 1;
					}

					// Right is negative
					let targetRoom = _.clone(finalRoom);
					targetRoom.x -= 1;

					memory.interceptRoom = util.getRoomNameFromCoords(targetRoom);
				}
			}
			else if (sectorPos.y) {
				// Zero origin
				if (globalPos.y < 0) {
					globalPos.y += 1
				}
				if (convoyDirection == BOTTOM_RIGHT || convoyDirection == BOTTOM || convoyDirection == BOTTOM_LEFT) {
					memory.convoyDirection = BOTTOM;
					let finalRoom = {x: globalPos.x, y: globalPos.y - correctMod(globalPos.y, 10)};
					// Reverse the zero origin. When negative crossroads are -1, -11, -21
					if (globalPos.y < 0) {
						finalRoom.y -= 1;
					}

					// Bottom is negative
					let targetRoom = _.clone(finalRoom);
					targetRoom.y += 1;

					memory.interceptRoom = util.getRoomNameFromCoords(targetRoom);
				}
				else if (convoyDirection == TOP_LEFT || convoyDirection == TOP || convoyDirection == TOP_RIGHT) {
					memory.convoyDirection = TOP;
					let finalRoom = {x: globalPos.x, y: globalPos.y + 10 - correctMod(globalPos.y, 10)};
					// Reverse the zero origin. When negative crossroads are -1, -11, -21
					if (globalPos.y < 0) {
						finalRoom.y -= 1;
					}

					// Bottom is negative
					let targetRoom = _.clone(finalRoom);
					targetRoom.y -= 1;

					memory.interceptRoom = util.getRoomNameFromCoords(targetRoom);
				}
			}


			// Meh.
			memory.fRefreshRate = 300;
		}
	}

	tick() {
		if (this.isActive()) {
			this.memory.pending = 0;

			for (let creepName of this.memory.assignedCreeps) {
				if (Game.creeps[creepName]) {
					Game.creeps[creepName].mem.targetRoom = this.memory.interceptRoom;

					Game.creeps[creepName].mem.retreat = false;
					Game.creeps[creepName].convoyRaider = 1;
					Game.creeps[creepName].forceMoveRooms = 1;
					Game.creeps[creepName].convoyDirection = this.memory.convoyDirection;
				}
			}

			if (Game.time - this.memory.lastLaunchTick > 1500) {
				this.missionComplete();
			}
		}

		super.tick();
	}


	requestSpawns() {
		let parentRoom = Game.rooms[this.memory.sourceRoomName]
		let spawns = parentRoom.find(FIND_MY_SPAWNS);
		// Oh. Crap.
		if (spawns.length == 0) return;

		let spawn = spawns[0];


		for (let resource of this.memory.resources) {
			// if (parentRoom.terminal.store[resource]) {
				let body = creepCreator.createSeason4Scorer(parentRoom, resource).body

				this.spawnCreep("season4Scorer", body, {}, spawn, resource)	
			// }
		}
		

		return true
	}


	assignCreep(creep) {
		super.assignCreep(creep);
		creep.memory.targetRoom = this.memory.interceptRoom;
	}

	cleanMemory() {
		delete this.memory.creepID
		delete this.memory.convoyDirection

		return super.cleanMemory();
	}


	missionComplete(success) {
		this.cleanMemory()

		return super.missionComplete(success)
	}

	spawnCreep(role, body, boosts, spawn, resource) {
		super.spawnCreep(role, body, boosts, spawn, {targetRoom : this.memory.interceptRoom, fallbackRoom: this.memory.sourceRoomName, resource})
	}

	get targetRoomName() {
		return this.memory.targetRoomName;
	}
}

module.exports = SeasonalConvoyTrade