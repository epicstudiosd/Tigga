"use strict";

var intelAI = {
	// TODO 
	hasFullKnowledge : function() {


	},

	getEnemyRoomSet : function() {
		if (!global.enemyRoomSet) {
			global.enemyRoomSet = new Set();

			for (let roomName of Memory.enemyRooms) {
				global.enemyRoomSet.add(roomName)
			}
		}

		return global.enemyRoomSet
	},


	getGCLLowerBound : function(playerName) {
		if (!Memory.gclEstimates) {
			this.getGCLEstimates();
		}
		if (!Memory.gclEnergyEstimates) {
			this.getGCLEnergyEstimates();
		}

		return Math.floor(Math.pow((Memory.gclEnergyEstimates[playerName] || 0) / GCL_MULTIPLY, 1 / GCL_POW))
	},

	getGCLUpperBound : function(playerName) {
		if (!Memory.gclEstimates) {
			this.getGCLEstimates();
		}
		if (!Memory.gclEnergyEstimates) {
			this.getGCLEnergyEstimates();
		}

		let gclFromEnergy = Math.floor(Math.pow((Memory.gclEnergyEstimates[playerName] || 0) / GCL_MULTIPLY, 1 / GCL_POW)) + 1

		return Math.max(gclFromEnergy, Memory.gclEstimates[playerName])

	},

	// Cannot decrease. Can overestimate.
	getGCLEstimates : function() {
		if (Math.random() > 0.99 || !Memory.gclEstimates) {
			Memory.gclEstimates = Memory.gclEstimates || {};
			let gclEstimates = {};

			for (let enemyRoomName of Memory.enemyRooms) {
				if (Memory.rooms[enemyRoomName]) {
					let owner = Memory.rooms[enemyRoomName].owner;
					if (owner) {
						gclEstimates[owner] = (gclEstimates[owner] || 0) + 1;
						if (gclEstimates[owner] > (Memory.gclEstimates[owner] || 0)) {
							Memory.gclEstimates[owner] = gclEstimates[owner];
						}
					}
				}
			}
		}

		return Memory.gclEstimates;
	},

	// Will tend to underestimate
	getGCLEnergyEstimates : function() {
		Memory.gclEnergyEstimates = Memory.gclEnergyEstimates || {};
		if (Math.random() > 0.99) {
			let gclEnergyEstimates = {};

			for (let enemyRoomName of Memory.enemyRooms) {
				if (Memory.rooms[enemyRoomName]) {
					let owner = Memory.rooms[enemyRoomName].owner;
					if (owner) {
						let RCL = Memory.rooms[enemyRoomName].rcl

						let GCLContribution = Memory.rooms[enemyRoomName].controllerProgress || 0
						for (let i = 1; i < RCL; i++) {
							GCLContribution += (CONTROLLER_LEVELS[i] || 0)
						}

						gclEnergyEstimates[owner] = (gclEnergyEstimates[owner] || 0) + GCLContribution;
						if (gclEnergyEstimates[owner] > (Memory.gclEnergyEstimates[owner] || 0)) {
							Memory.gclEnergyEstimates[owner] = gclEnergyEstimates[owner];
						}
					}
				}
			}
		}

		return Memory.gclEnergyEstimates;
	},

	getPlayerNumRooms : function(playerName) {
		if (Math.random() > 0.99 || !global.playerNumRooms || !global.playerNumRooms[playerName]) {
			global.playerNumRooms = {};
			global.playerNumRooms[playerName] = 0;
			for (let enemyRoomName of Memory.enemyRooms) {
				if (Memory.rooms[enemyRoomName]) {
					let owner = Memory.rooms[enemyRoomName].owner;
					if (owner) {
						global.playerNumRooms[owner] = (global.playerNumRooms[owner] || 0) + 1
					}
				}
			}
		}

		return global.playerNumRooms[playerName];
	},

	getPlayerDamagedRoomsFraction : function(playerName) {
		if (Math.random() > 0.99 || !global.playerDamagedRoomFraction || !global.playerDamagedRoomFraction[playerName]) {
			global.playerDamagedRoomFraction = {};
			global.playerNumRooms = {};

			let damagedRoomCount = {}

			global.playerNumRooms[playerName] = 0;
			for (let enemyRoomName of Memory.enemyRooms) {
				let mem = Memory.rooms[enemyRoomName]
				if (mem) {
					let owner = mem.owner;
					if (owner) {
						global.playerNumRooms[owner] = (global.playerNumRooms[owner] || 0) + 1
						if ((!mem.twrX || mem.twrX.length == 0) && (!mem.spwnX || mem.spwnX.length == 0)) {
							damagedRoomCount[owner] = (damagedRoomCount[owner] || 0) + 1
						}
					}
				}
			}

			global.playerDamagedRoomFraction[playerName] = 0;
			for (let owner in global.playerNumRooms) {
				global.playerDamagedRoomFraction[owner] = (damagedRoomCount[owner] || 0) / (global.playerNumRooms[owner] || 1)
			}
		}

		return global.playerDamagedRoomFraction[playerName];
	},

	// Could save ~0.2 CPU/tick using global cache here.
	getSafeModeEstimates : function() {
		let ret = {};
		for (let enemyRoomName of Memory.enemyRooms) {
			if (Memory.rooms[enemyRoomName]) {
				let owner = Memory.rooms[enemyRoomName].owner;
				ret[owner] = 0;
				if (owner && (Memory.rooms[enemyRoomName].safeMode || 0) > 2000) {
					ret[owner] = 1;
				}
			}
		}
		return ret;
	},

	getEnergyEstimate : function(playerName) {
		let ret = 0;
		if (Math.random() > 0.99 || !global.playerEnergyEstimate || !global.playerEnergyEstimate[playerName]) {
			for (let enemyRoomName of Memory.enemyRooms) {
				if (Memory.rooms[enemyRoomName]) {
					let owner = Memory.rooms[enemyRoomName].owner;
					if (owner && owner == playerName) {
						ret += (Memory.rooms[enemyRoomName].storE || 0) + (Memory.rooms[enemyRoomName].trmE || 0)
					}
				}
			}

			global.playerEnergyEstimate = global.playerEnergyEstimate || {};
			global.playerEnergyEstimate[playerName] = ret;
		}
		else {
			return (global.playerEnergyEstimate[playerName] || 0)
		}
		return ret;
	},

	getBoostStocks : function(playerName) {
		let ret = [0, 0, 0];
		if (Math.random() > 0.99 || !global.playerBoostStocksEstimate || !global.playerBoostStocksEstimate[playerName]) {
			for (let enemyRoomName of Memory.enemyRooms) {
				if (Memory.rooms[enemyRoomName]) {
					let owner = Memory.rooms[enemyRoomName].owner;
					if (owner && owner == playerName && Memory.rooms[enemyRoomName].totalBoosts) {
						for (let i = 0; i < 3; i++) {
							ret[i] += Memory.rooms[enemyRoomName].totalBoosts[i]
						}
					}
				}
			}

			global.playerBoostStocksEstimate = global.playerBoostStocksEstimate || {};
			global.playerBoostStocksEstimate[playerName] = ret;
		}
		else {
			return (global.playerBoostStocksEstimate[playerName] || 0)
		}
		return ret;
	},

	strugglingToKillRooms : function(playerName) {
		let ret = 0;
		if (Math.random() > 0.99 || !global.strugglingToKillRoomsCount || global.strugglingToKillRoomsCount[playerName] === undefined) {
			for (let enemyRoomName of Memory.enemyRooms) {
				if (Memory.rooms[enemyRoomName]) {
					let owner = Memory.rooms[enemyRoomName].owner;
					if (owner && owner == playerName) {
						ret += (Memory.rooms[enemyRoomName].numAttacksFailed || 0) + (Memory.rooms[enemyRoomName].numAttacksFizzled || 0)
					}
				}
			}

			if (Memory.botArena) ret *= 2;

			global.strugglingToKillRoomsCount = global.strugglingToKillRoomsCount || {};
			global.strugglingToKillRoomsCount[playerName] = ret;
		}
		else {
			return (global.strugglingToKillRoomsCount[playerName] || 0)
		}
		return ret;
	},

	getMaxHate : function() {
		if (global._maxHate === undefined || Math.random() < 0.01) {
			if (Memory.stats && Memory.stats.hateCounter) {
				global._maxHate = _.max(Memory.stats.hateCounter)
			}
			else {
				global._maxHate = 0
			}

			if (Memory.season5) {
				// Generating some hate for attacking reasons
				global._maxHate /= 10
			}

		}
		return global._maxHate
	},

	getHatePercentage : function(testName) {
		global._hatePercentages = global._hatePercentages || {};

		if (Math.random() < 0.99 && global._hatePercentages[testName]) {
			return global._hatePercentages[testName];
		}
		else {
			let totalHate = 0;
			for (let name in Memory.stats.hateCounter) {
				if (Memory.stats.hateCounter[name]) {
					totalHate += Math.log(1 + Memory.stats.hateCounter[name]);
				}
			}

			if (totalHate == 0) {
				return 0;
			}

			let res = Math.log(1 + (Memory.stats.hateCounter[testName] || 0)) / totalHate;
			global._hatePercentages[testName] = res;
			return res;
		}
	},

	getMaxHatePercentage : function() {
		let highestHate = 0;
		let totalHate = 0;
		for (let name in Memory.stats.hateCounter) {
			let hate = Math.log(1 + Memory.stats.hateCounter[name]);
			if (hate > highestHate) {
				highestHate = hate;
			}
			totalHate += hate;
		}

		if (totalHate == 0) {
			return 1;
		}

		return highestHate / totalHate;
	}
};

module.exports = intelAI;