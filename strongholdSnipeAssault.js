"use strict";

const StrongholdBase = require('strongholdSpecialBase')
const creepCreator = require('creepCreator')

const roomIntel = require('roomIntel');

class StrongholdSnipeAssaultMission extends StrongholdBase {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_STRONGHOLD_SNIPE_ASSAULT;
		// console.log(JSON.stringify(memory))

		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		if (createNew) {
			if (!memory.snipePoints) {	
				let ret = StrongholdSnipeAssaultMission.getSnipePoint(memory.targetRoomName)

				if (ret) {
					memory.snipePoints = ret;
				}
			}
		}
	}


	requestSpawns() {
		let parentRoom = Game.rooms[this.memory.sourceRoomName]
		let spawns = parentRoom.find2(FIND_MY_SPAWNS);

		// Oh. Crap.
		if (spawns.length == 0) return;
		let spawn = spawns[0];

		if (Memory.rooms[this.memory.targetRoomName].invCL) {
			let mem = Memory.rooms[this.memory.targetRoomName];

			let creepMemory = {targetRoom: this.memory.targetRoomName};

			if (!this.memory.snipePoints) {	
				let ret = StrongholdSnipeAssaultMission.getSnipePoint(this.memory.targetRoomName)

				if (ret) {
					this.memory.snipePoints = ret;
				}
			}

			let sniper = creepCreator.createStrongholdSniper(parentRoom, Memory.rooms[this.memory.targetRoomName].invCL, !this.memory.snipePoints || this.memory.snipePoints[0].sk, this.memory.routeLength < 2)		

			if (sniper.body.length) {
				super.spawnCreep("ranged", sniper.body, sniper.boosts, spawn, _.clone(creepMemory));
				this.memory.lastLaunchTick = Game.time
				return true;
			}
			return false
		}
		else {
			return super.requestSpawns();
		}
	}

	tick() {
		for (let creepName of this.memory.assignedCreeps) {
			let creep = Game.creeps[creepName]

			if (creep) {				
				if (Memory.rooms[this.memory.targetRoomName].invCL) {
					creep.mem.target = new RoomPosition(Memory.rooms[this.memory.targetRoomName].invCX, Memory.rooms[this.memory.targetRoomName].invCY, this.memory.targetRoomName);

					if (this.memory.snipePoints) {
						creep.mem.snipePoints = this.memory.snipePoints;
						creep.strongholdSniper = 1;
					}
					else {
						delete creep.mem.snipePoints
					}				
				}
				else {
					creep.ignoreInvaders = 1;
					if (Game.rooms[this.memory.targetRoomName]) {
						Game.rooms[this.memory.targetRoomName].ignoreInvaders = 1
					}

				}
			}
		}

		super.tick();
	}

	missionComplete(success) {
		delete this.memory.snipePoints
		return super.missionComplete(success)
	}


	static getSnipePoint(targetRoomName) {
		let roomMap = roomIntel.getEnemyRoomMap(targetRoomName);
		if (!roomMap) return;

		let snipePoints = [];
		let terrain = Game.map.getRoomTerrain(targetRoomName)

		let mem = Memory.rooms[targetRoomName];

		let minScore = 2

		for (let x = mem.invCX - 3; x <= mem.invCX + 3; x++) {
			for (let y = mem.invCY - 3; y <= mem.invCY + 3; y++) {
				if (x <= 0 || x >= 49 || y <= 0 || y >= 49) continue

				if (terrain.get(x, y) & TERRAIN_MASK_WALL) continue;

				// Not exposed to the edge
				if (parseInt(roomMap[x][y]) < 4) {
					continue
				}

				let score = StrongholdBase.getNumOpenNeighbourRamparts(targetRoomName, roomMap, terrain, x, y);
				let skDanger = false;

				for (let skIdx in mem.skLairsX) {
					let skX = mem.skLairsX[skIdx]
					let skY = mem.skLairsY[skIdx]

					// Be far away from SKs.
					let dist = Math.max(Math.abs(x - skX), Math.abs(y - skY))

					if (dist < 6) {
						score += (6 - dist) * 0.1;
						skDanger = true;
					}
				}

				for (let srcIdx = 0; srcIdx < roomIntel.getNumSources(targetRoomName); srcIdx++) {
					let srcX = roomIntel.getSourceX(targetRoomName, srcIdx);
					let srcY = roomIntel.getSourceY(targetRoomName, srcIdx);

					let dist = Math.max(Math.abs(x - srcX), Math.abs(y - srcY))
					if (dist < 6) {
						score += (6 - dist) * 0.1;
						skDanger = true;
					}

				}
				let mX = roomIntel.getMineralX(targetRoomName);
				let mY = roomIntel.getMineralY(targetRoomName);

				let dist = Math.max(Math.abs(x - mX), Math.abs(y - mY))
				if (dist < 6) {
					score += (6 - dist) * 0.1;
					skDanger = true;
				}



				if (score <= minScore) {
					snipePoints.push({x: x, y: y, s: score, sk: skDanger})
					minScore = score;
				}
			}
		}

		for (let snipePoint of _.clone(snipePoints)) {
			if (snipePoint.s > minScore) {
				_.pull(snipePoints, snipePoint)
			}
		}

		if (snipePoints.length) {
			return snipePoints
		}
		else {
			return false
		}
	}
}


module.exports = StrongholdSnipeAssaultMission