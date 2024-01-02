"use strict";

const StrongholdBase = require('strongholdSpecialBase')
const creepCreator = require('creepCreator')

const roomIntel = require('roomIntel');


function getNumOpenNeighbourRamparts(roomName, roomMap, terrain, x, y) {
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


class StrongholdSnakeAssaultMission extends StrongholdBase {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_STRONGHOLD_SNAKE_ASSAULT;
		// console.log(JSON.stringify(memory))

		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		if (createNew) {
			memory.formations = []
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
			let formationCreepNames = [];

			let creepMemory = {targetRoom: this.memory.targetRoomName};

			let healer = creepCreator.createStrongholdHealer(parentRoom, Memory.rooms[this.memory.targetRoomName].invCL)
			let tank = creepCreator.createStrongholdTank(parentRoom, Memory.rooms[this.memory.targetRoomName].invCL)
			

			if (healer.body.length && tank.body.length) {
				formationCreepNames.push(super.spawnCreep("ranged", healer.body, healer.boosts, spawn, _.clone(creepMemory)));
				formationCreepNames.push(super.spawnCreep("tank", tank.body, tank.boosts, spawn, _.clone(creepMemory)));
				this.memory.formations.push(formationCreepNames);

				this.memory.lastLaunchTick = Game.time
				return true;
			}
		}
		else {
			return super.requestSpawns();
		}


		return false;
	}

	tick() {
		let room = Game.rooms[this.memory.targetRoomName];

		if (room && room.invaderCore && room.invaderCore.ticksToDeploy === undefined) {
			let towers = _.filter(room.towers, (tower) => (tower.owner.username == "Invader"));

			if (towers.length == room.invaderCore.level) {
				if (!this.memory.pokePoint) {	
					let ret = StrongholdSnakeAssaultMission.getPokePoints(this.memory.targetRoomName)

					if (ret) {
						this.memory.pokePoint = ret.pokePoint;
						this.memory.healerPoint = ret.healerPoint;
					}
				}
			}
			else {
				delete this.memory.pokePoint
				delete this.memory.healerPoint
			}
		}



		for (let formationIdx in this.memory.formations) {
			let formation = this.memory.formations[formationIdx];

			for (let formationCreepName of formation) {
				let formationCreep = Game.creeps[formationCreepName]
				if (!formationCreep) continue;

				formationCreep.mem.target = new RoomPosition(Memory.rooms[this.memory.targetRoomName].invCX, Memory.rooms[this.memory.targetRoomName].invCY, this.memory.targetRoomName);
				formationCreep.memory.formationCreeps = _.clone(formation);
				formationCreep.memory.allSquadCreeps = _.clone(formation);
				formationCreep.assaulter = 1;
				formationCreep.assaultSnake = 1;

				if (this.memory.pokePoint) {
					formationCreep.mem.targetPos = this.memory.pokePoint;
					formationCreep.mem.healerPos = this.memory.healerPoint;
				}
				else {
					delete formationCreep.mem.targetPos
				}
			}
		}

		this.formationPairRenew()

		super.tick();

	}


	static getPokePoints(targetRoomName) {
		let pokePoints = [];
		let terrain = Game.map.getRoomTerrain(targetRoomName)

		let mem = Memory.rooms[targetRoomName];

		let roomMap = roomIntel.getEnemyRoomMap(targetRoomName);

		if (!roomMap) return;

		let minScore = Infinity;

		for (let towerIdx in mem.twrX) {
			let towerX = mem.twrX[towerIdx];
			let towerY = mem.twrY[towerIdx];

			for (let dx = -1; dx <= 1; dx++) {
				for (let dy = -1; dy <= 1; dy++) {
					let x = towerX + dx
					let y = towerY + dy

					if (terrain.get(x, y) & TERRAIN_MASK_WALL) continue;

					// Not exposed to the edge
					if (parseInt(roomMap[x][y]) < 4) {
						continue
					}

					let score = StrongholdBase.getNumOpenNeighbourRamparts(targetRoomName, roomMap, terrain, x, y);

					let anyHealerSpot = StrongholdBase.checkAnyZeroNeighbourRamparts(targetRoomName, roomMap, terrain, x, y)

					if (anyHealerSpot && score <= minScore) {
						pokePoints.push({x: x, y: y, s: score})
						minScore = score;
					}
				}
			}
		}

		for (let pokePoint of _.clone(pokePoints)) {
			if (pokePoint.s > minScore) {
				_.pull(pokePoints, pokePoint)
			}
		}
		let pokePoint = _.shuffle(pokePoints)[0];

		if (pokePoint) {			
			let x = pokePoint.x;
			let y = pokePoint.y;

			let healerPoint

			for (let dx = -1; dx <= 1; dx++) {
				for (let dy = -1; dy <= 1; dy++) {
					if (terrain.get(x + dx, y + dy) & TERRAIN_MASK_WALL) continue;

					if (StrongholdBase.getNumOpenNeighbourRamparts(targetRoomName, roomMap, terrain, x + dx, y + dy) == 0) {
						healerPoint = {x: x + dx, y: y+dy}
					}
				}
			}

			if (pokePoint && healerPoint) {
				return {pokePoint: pokePoint, healerPoint: healerPoint}
			}
		}

		return
	}
}


module.exports = StrongholdSnakeAssaultMission