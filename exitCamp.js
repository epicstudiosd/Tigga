"use strict";

const Mission = require('missionBase')

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');


class ExitCampMission extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_EXIT_CAMP;

		// Do this before we make our mission active.
		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		if (createNew && this.isActive()) {
			memory.targetRoomName = targetRoomName;
			memory.fRefreshRate = 5000;
			memory.e = memory.e || 0

			if (!Memory.rooms[targetRoomName].borderInfos) {
				this.missionComplete(true);
				return;
			}

			let enemydps = 0;
			let enemyAvgEnergyCost = 0;

			for (let borderIdx in Memory.rooms[targetRoomName].borderInfos) {
				let borderInfo = Memory.rooms[targetRoomName].borderInfos[borderIdx];

				if (borderInfo.creepsSeen > 0.5) {
					if (borderInfo.maxdps > enemydps) {
						enemydps = borderInfo.maxdps;
					}
					if (borderInfo.creepsSeen > 1) {
						if (borderInfo.avgEnergyCost > enemyAvgEnergyCost) {
							enemyAvgEnergyCost = borderInfo.avgEnergyCost;
						}
					}
				}
			}

			if (enemyAvgEnergyCost <= 0) {
				this.missionComplete(true);
				return;
			}

			memory.damageDone = 0;
			memory.killCount = 0;
			memory.enemydps = enemydps;
			memory.enemyAvgEnergyCost = enemyAvgEnergyCost;

			// De-escalate from time to time
			if (memory.e && Math.random() > 0.9) {
				memory.e--;
			}

			if (!this.requestSpawns()) {
				this.missionComplete(true);
				return;
			}

			console.log(sourceRoomName, "Launching ECM against", targetRoomName, enemydps, enemyAvgEnergyCost, memory.e)
		}
	}

	tick() {
		if (this.isActive()) {
			for (let creepName of this.memory.assignedCreeps) {
				if (Game.creeps[creepName]) {
					this.memory.damageDone = Math.max((Game.creeps[creepName].mem.damageDone || 0), (this.memory.damageDone || 0));
					Game.creeps[creepName].exitCamper = true;
				}
			}

			// if (!this.memory.pending) {
			// 	let room = Game.rooms[this.memory.targetRoomName];
			// 	if (room && room.killCount) {
			// 		this.memory.killCount += room.killCount
			// 	}
			// }


			if ((this.memory.assignedCreeps.length == 0 && this.memory.spawningCreeps.length == 0) || Game.time - this.memory.lastLaunchTick > 2000) {
				if (Game.time - this.memory.lastLaunchTick > 1450) {
					this.memory.s++;

					// De-escalate if no kills.
					if (this.memory.killCount == 0 && this.memory.damageDone == 0) {
						this.memory.e = Math.max(this.memory.e - 1, 0)
					}
					return this.missionComplete(true);
				}
				else if (Game.time - this.memory.lastLaunchTick < 750) {
					this.memory.f++;
					// Only escalate if we think we saw interesting stuff and can build a beefier creep, otherwise take a nap
					// These numbers are kinda hacked up.
					if (Game.rooms[this.memory.sourceRoomName].energyCapacityAvailable >= (this.memory.e + 1) * 130 && (this.memory.e + 1) * 3 <= MAX_CREEP_SIZE) {
						if (this.memory.damageDone > this.memory.e * 200) {
							this.memory.e += 3;
						}
						else if (this.memory.damageDone > this.memory.e * 100) {
							this.memory.e += 2;
						}
						else {
							this.memory.e ++;
						}
						if (this.getSuccessRate() < 0.5) {
							this.memory.e++;
						}
					}
					else {
						this.memory.fTick = Game.time;
					}
					return this.missionComplete(false);
				}
				this.missionComplete(true);
			}
			else if (Game.time - this.memory.lastLaunchTick >= 1200 &&
					 this.memory.spawningCreeps.length == 0 &&
					 Game.time % 10 == 0 &&
					 (this.memory.killCount > this.memory.bC || this.memory.damageDone / this.memory.numLaunches > this.memory.bC * 2)) {

				if (!this.renewRestricted()) {
					// Are our guys an effective team? Somebody may cripple us and leave us alive, and we don't want to keep
					// spawning in thinking life is going well.
					var effectiveTeam = false;
					for (var creepName of this.memory.assignedCreeps) {
						var creep = Game.creeps[creepName];
						if (creep) {
							if (creep.hasActiveBodypart(ATTACK)) {
								effectiveTeam = true;
								break;
							}
						}
					}
					if (effectiveTeam) {
						console.log(this.memory.sourceRoomName, "relaunching ECM against", this.memory.targetRoomName)
						console.log(this.memory.killCount, this.memory.damageDone, this.memory.bC, this.memory.numLaunches)
						// Attenuate the kill count & cost. If we don't do that we could hit the case where we have 5 good launches we persist through 5 bad ones.
						this.memory.killCount /= 2;
						this.memory.bC /= 2;
						this.memory.numLaunches += 1;

						this.memory.lastLaunchTick = Game.time;

						this.requestSpawns();
					}
				}
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

		let body = [];
		let targetNumAttack = Math.round(this.memory.enemyAvgEnergyCost / 5000) + this.memory.e;
		if (targetNumAttack <= 1) {
			body.push(MOVE);
			body.push(ATTACK);
		}
		else {
			let targetNumHeals = Math.round(this.memory.enemydps / (2 * HEAL_POWER));

			let percentageBodySize = MAX_CREEP_SIZE / (2 * (targetNumAttack + targetNumHeals));

			if (percentageBodySize < 0.75) {
				return false;
			}


			let energy = Game.rooms[this.memory.sourceRoomName].energyCapacityAvailable;

			let percentageEnergy = energy / (targetNumAttack * 130 + targetNumHeals * 300);

			if (percentageEnergy < 0.75) {
				return false;
			}

			let percentage = Math.min(percentageEnergy, percentageBodySize);

			let actualNumAttack = Math.floor(percentage * targetNumAttack);
			let actualNumHeal = Math.floor(percentage * targetNumHeals);

			if (actualNumAttack * 130 + actualNumHeal * 300 >= 0.5 * this.memory.enemyAvgEnergyCost) {
				return false;
			}


			if (actualNumAttack * 130 + actualNumHeal * 300 < energy && 2 * (actualNumAttack + actualNumHeal) <= MAX_CREEP_SIZE) {
				for (let i = 0; i < actualNumAttack + actualNumHeal - 1; i++) {
					body.push(MOVE);
				}
				for (let i = 0; i < actualNumAttack; i++) {
					body.push(ATTACK);
				}
				for (let i = 0; i < actualNumHeal; i++) {
					body.push(HEAL);
				}
				body.push(MOVE);
			}
			else {
				console.log("ECM WEIRD BODY", actualNumAttack, actualNumHeal);
				return false;
			}


		}

		let idleCreep = idleCreepManager.getIdleCreepForBody(body, parentRoom);

		if (idleCreep && idleCreep.ticksToLive > 1100) {
			this.assignCreep(idleCreep);
		}
		else {
			this.spawnCreep("tank", body, {}, spawn)
		}
		return true;
	}


	missionComplete(success) {
		delete this.memory.damageDone
		delete this.memory.killCount
		delete this.memory.enemydps;
		delete this.memory.enemyAvgEnergyCost;

		return super.missionComplete(success);
	}


	assignCreep(creep) {
		super.assignCreep(creep);
		creep.memory.targetRoom = this.memory.targetRoomName;
	}

	spawnCreep(role, body, boosts, spawn) {
		super.spawnCreep(role, body, boosts, spawn, {targetRoom : this.memory.targetRoomName, fallbackRoom: this.memory.sourceRoomName})
	}

	get targetRoomName() {
		return this.memory.targetRoomName;
	}
}

module.exports = ExitCampMission