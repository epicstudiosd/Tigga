"use strict";

const Mission = require('missionBase')

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');



class ConvoyTakedownMission extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, convoyDirection, createNew, priority) {
		memory.type = memory.type || MISSION_CONVOY_TAKEDOWN;

		// Do this before we make our mission active.
		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		if (createNew && this.isActive()) {
			memory.targetRoomName = memory.targetRoomName || targetRoomName;


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
			if (!Game.rooms[this.memory.sourceRoomName].lootRooms.includes(this.memory.interceptRoom)) {
				Game.rooms[this.memory.sourceRoomName].lootRooms.push(this.memory.interceptRoom);
			}

			if (Math.random() < 0.01) {
				let route = safeRoute.findSafeRoute(this.memory.sourceRoomName, this.memory.interceptRoom);
				for (let step of route) {
					if (!Game.rooms[this.memory.sourceRoomName].lootRooms.includes(step.room)) {
						Game.rooms[this.memory.sourceRoomName].lootRooms.push(step.room);
					}
				}
			}

			let targetCreep;
			if (Game.rooms[this.memory.interceptRoom] && Game.rooms[this.memory.interceptRoom].dangerous) {
				let creeps = Game.rooms[this.memory.interceptRoom].find(FIND_HOSTILE_CREEPS);

				let min = 50;
				let max = 0;
				for (let creep of creeps) {
					if (creep.owner.username != "Screeps") continue;
					if (this.memory.convoyDirection == TOP) {
						if (creep.pos.y > max) {
							max = creep.pos.y;
							targetCreep = creep;
						}
					}
					else if (this.memory.convoyDirection == BOTTOM) {
						if (creep.pos.y < min) {
							min = creep.pos.y;
							targetCreep = creep;
						}
					}
					else if (this.memory.convoyDirection == LEFT) {
						if (creep.pos.x > max) {
							max = creep.pos.x;
							targetCreep = creep;
						}
					}
					else if (this.memory.convoyDirection == RIGHT) {
						if (creep.pos.x < min) {
							min = creep.pos.x;
							targetCreep = creep;
						}
					}
				}
				// console.log(this.memory.convoyDirection, max, min)
				// for (let creep of creeps) {
				// 	console.log(creep.owner.username)
				// }
			}
			// if (!targetCreep && this.memory.assignedCreeps.length) {
			// 	console.log(Game.rooms[this.memory.interceptRoom], Game.rooms[this.memory.interceptRoom] ? Game.rooms[this.memory.interceptRoom].dangerous : undefined)
			// }

			for (let creepName of this.memory.assignedCreeps) {
				if (Game.creeps[creepName]) {
					Game.creeps[creepName].memory.targetRoom = this.memory.interceptRoom;

					Game.creeps[creepName].memory.retreat = false;
					Game.creeps[creepName].convoyRaider = 1;
					Game.creeps[creepName].forceMoveRooms = 1;
					Game.creeps[creepName].convoyDirection = this.memory.convoyDirection;
					Game.creeps[creepName].targetCreep = targetCreep;
				}
			}

			if (Game.time - this.memory.lastLaunchTick == 1350) {
				let parentRoom = Game.rooms[this.memory.sourceRoomName]
				let spawns = parentRoom.find2(FIND_MY_SPAWNS);
				// Oh. Crap.
				if (spawns.length == 0) return;

				let spawn = spawns[0];
				spawn.addPrioritySpawn("lootFetcher");
				spawn.addPrioritySpawn("lootFetcher");
				spawn.addPrioritySpawn("lootFetcher");
			}

			if ((Game.time - this.memory.lastLaunchTick) % 1300 == 0) {
				let parentRoom = Game.rooms[this.memory.sourceRoomName]
				let spawns = parentRoom.find2(FIND_MY_SPAWNS);
				// Oh. Crap.
				if (spawns.length == 0) return;

				let spawn = spawns[0];

				spawn.addPrioritySpawn("observer", {targetRoom: this.memory.interceptRoom});
			}

			if (Game.time - this.memory.lastLaunchTick > 7000) {
				this.missionComplete();
			}
		}

		super.tick();
	}


	requestSpawns() {
		let parentRoom = Game.rooms[this.memory.sourceRoomName]
		let spawns = parentRoom.find2(FIND_MY_SPAWNS);
		// Oh. Crap.
		if (spawns.length == 0) return;

		let spawn = spawns[0];

		let hostileCreeps = Game.rooms[this.memory.targetRoomName].find(FIND_HOSTILE_CREEPS);

		// For now I consider only one type of takedown: disable and remove the RA creep at the back
		// Assume uniform and only the ranged creep has RA
		let enemyNumRanged = 0;
		let rangedBoostedEnemy = false;
		let enemyNumHeal = 0;
		let enemyNumTough = 0;
		let enemyBodySize = 0;
		let enemyToughScale = 0;
		for (let hostileCreep of hostileCreeps) {
			if (hostileCreep.owner.username != "Screeps") continue;

			if (hostileCreep.hasActiveBodypart(RANGED_ATTACK)) {
				enemyBodySize = hostileCreep.body.length;
				for(let part of hostileCreep.body) {
					if (part.type == HEAL) {
						if (part.boost) {
							enemyNumHeal += BOOSTS[HEAL][part.boost][HEAL];
						}
						else {
							enemyNumHeal++;
						}
					}
					if (part.type == RANGED_ATTACK) {
						if (part.boost) {
							enemyNumRanged += BOOSTS[RANGED_ATTACK][part.boost]["rangedAttack"];
							rangedBoostedEnemy = true;
						}
						else {
							enemyNumRanged++;
						}
					}
					if (part.type == TOUGH) {
						enemyNumTough++;
						if (part.boost) {
							enemyToughScale = BOOSTS[TOUGH][part.boost]["damage"];
						}
					}
				}

				break;
			}
		}

		// Ok, fuck it, I'm lazy. Just spawn 3 RA creeps for small, 4 for big.
		let body = [];

		let numCreeps = 4;
		let numRanged = 11;
		let numHeal = 5;

		if (rangedBoostedEnemy) {
			numHeal += 3;
		}
		if (enemyToughScale < 0.7 - 0.001) {
			numRanged += 4;
		}

		for (let i = 0; i < numRanged; i++) {
			body.push(RANGED_ATTACK);
		}
		for (let i = 0; i < numRanged + numHeal; i++) {
			body.push(MOVE);
		}
		for (let i = 0; i < numHeal; i++) {
			body.push(HEAL);
		}

		if (util.getECostForDesign(body) > parentRoom.energyCapacityAvailable) {
			console.log("ERROR: convoy takedown can't afford", body, parentRoom.energyCapacityAvailable, numHeal, numRanged)
			Game.notify("ERROR: convoy takedown can't afford " + parentRoom.energyCapacityAvailable + " " + numHeal + " " + numRanged)
		}


		for (let i = 0; i < numCreeps; i++) {
			this.spawnCreep("ranged", body, {}, spawn, numCreeps)
		}
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

	spawnCreep(role, body, boosts, spawn, numCreeps) {
		if (this.memory.creepID === undefined) {
			this.memory.creepID = 0;
		}
		else {
			this.memory.creepID++;
		}
		super.spawnCreep(role, body, boosts, spawn, {targetRoom : this.memory.interceptRoom, fallbackRoom: this.memory.sourceRoomName, carMissionID: this.memory.creepID, carMissionNumCreeps: numCreeps})
	}

	get targetRoomName() {
		return this.memory.targetRoomName;
	}
}

module.exports = ConvoyTakedownMission