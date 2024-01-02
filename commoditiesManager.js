"use strict";

const util = require('util');
const safeRoute = require('safeRoute');
const constants = require('constants');




/*const basicResources = [
    RESOURCE_POWER, RESOURCE_ENERGY, RESOURCE_HYDROGEN,
    RESOURCE_OXYGEN, RESOURCE_UTRIUM, RESOURCE_KEANIUM, RESOURCE_LEMERGIUM, RESOURCE_ZYNTHIUM, RESOURCE_CATALYST, RESOURCE_GHODIUM,
    RESOURCE_SILICON, RESOURCE_METAL, RESOURCE_BIOMASS, RESOURCE_MIST];

function commodityCost(commodity) {
    var factoryTime = {
        0: 0,
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0
    };

    var resources = {};
    breakUpCommodity(commodity, 1, factoryTime, resources);
    console.log("Stats for : " + commodity);
    console.log("Factorytime: " + JSON.stringify(factoryTime));
    console.log("Resources: " + JSON.stringify(resources));
}

function breakUpCommodity(commodity, count, factorytime, resources) {
    if (_.contains(basicResources, commodity) || COMMODITIES[commodity] === undefined) {
        if (resources[commodity] === undefined) {
            resources[commodity] = 0;
        }

        resources[commodity] += count;
        return;

    }

    let jobsNeeded = count / COMMODITIES[commodity].amount;

    if (COMMODITIES[commodity].level !== undefined) {
        factorytime[COMMODITIES[commodity].level] += (COMMODITIES[commodity].cooldown + 1) * jobsNeeded;
    }

    else {
        factorytime[0] += (COMMODITIES[commodity].cooldown + 1) * jobsNeeded;
    }

    for (let component of Object.keys(COMMODITIES[commodity].components)) {
        breakUpCommodity(component, COMMODITIES[commodity].components[component] * jobsNeeded, factorytime, resources);
    }
}
*/



var commoditiesManager = {
	tick: function() {
		Memory.commoditiesManager = Memory.commoditiesManager || {};

		Memory.commoditiesManager.depositStats = Memory.commoditiesManager.depositStats || {}
		Memory.commoditiesManager.depositStats.tooExpensive = Memory.commoditiesManager.depositStats.tooExpensive || {}
		Memory.commoditiesManager.depositStats.harvested = Memory.commoditiesManager.depositStats.harvested || {}
		Memory.commoditiesManager.depositStats.energyCost = Memory.commoditiesManager.depositStats.energyCost || {}


		let harvestedStats = Memory.commoditiesManager.depositStats.harvested
		let costStats = Memory.commoditiesManager.depositStats.energyCost

		
		for (let depositType of [RESOURCE_SILICON, RESOURCE_METAL, RESOURCE_BIOMASS, RESOURCE_MIST]) {
			harvestedStats[depositType] = constants.DEPOSIT_STATS_ALPHA * (harvestedStats[depositType] || 0)
			costStats[depositType] = constants.DEPOSIT_STATS_ALPHA * (costStats[depositType] || 0)
			Memory.stats.depositTicks = constants.DEPOSIT_STATS_ALPHA * ((Memory.stats.depositTicks || 0) + 1);
		}											


		if (Memory.maxRoomLevel < 7 || (Memory.season && !Memory.season4)) {
			return
		}
		if (Game.cpu.getUsed() < 300 && (Math.random() < 0.001 || !global.depositFarmingSectors)) {
			this.calcDepositFarmingSectors();
		}

		if (global.depositFarmingSectors === undefined) return;

		this.scanRooms();

		if (Math.random() < 0.1 || Memory.season4) {
			this.requestMissions();
		}
	},


	calcDepositFarmingSectors: function() {
		global.depositFarmingSectors = [];

		let activeSectors = []
		let activeHighways = {};

		const maxDist = constants.MAX_DEPOSIT_RANGE;

		for (let room of Game.myRooms) {
			let centreCoords = util.getCentreRoomXYForRoomName(room.name)

			let centreRoomX = centreCoords.x;
			let centreRoomY = centreCoords.y;

			let centreRoom = util.getRoomNameFromCoords({x: centreRoomX, y: centreRoomY});

			if (!activeSectors.includes(centreRoom)) {
				activeSectors.push(centreRoom)
			}

			let topRoom = util.getRoomNameFromCoords({x: centreRoomX, y: centreRoomY - (centreRoomY == 5 ? 11 : 10)});
			let rightRoom = util.getRoomNameFromCoords({x: centreRoomX - (centreRoomX == 5 ? 11 : 10), y: centreRoomY});
			let bottomRoom = util.getRoomNameFromCoords({x: centreRoomX, y: centreRoomY + (centreRoomY == -6 ? 11 : 10)});
			let leftRoom = util.getRoomNameFromCoords({x: centreRoomX + (centreRoomX == -6 ? 11 : 10), y: centreRoomY});

			if (!activeSectors.includes(topRoom)) {
				activeSectors.push(topRoom)
			}
			if (!activeSectors.includes(rightRoom)) {
				activeSectors.push(rightRoom)
			}
			if (!activeSectors.includes(bottomRoom)) {
				activeSectors.push(bottomRoom)
			}
			if (!activeSectors.includes(leftRoom)) {
				activeSectors.push(leftRoom)
			}

		}
		
		for (let centreName of activeSectors) {
			let centreCoords = util.getRoomCoords(centreName);

			let sectorValid = true;

			// Top highway
			for (let i = -5; i <= 5; i++) {
				let highwayX = centreCoords.x + (centreCoords.x > 0 ? i : -i)
				let highwayY = centreCoords.y + (centreCoords.y > 0 ? -5 : 5)

				let highwayRoomName = util.getRoomNameFromCoords({x: highwayX, y: highwayY})

				let reachable = false
				for (let room of Game.myRooms) {
					if (safeRoute.getSafeRouteCost(room.name, highwayRoomName, false, true, maxDist, true) <= maxDist) {
						reachable = true;
						break;
					}
				}
				if (!reachable) {
					sectorValid = false;
					break;
				}
			}

			// Bottom highway
			for (let i = -5; i <= 5; i++) {
				let highwayX = centreCoords.x + (centreCoords.x > 0 ? i : -i)
				let highwayY = centreCoords.y + (centreCoords.y > 0 ? 5 : -5)

				let highwayRoomName = util.getRoomNameFromCoords({x: highwayX, y: highwayY})

				let reachable = false
				for (let room of Game.myRooms) {
					if (safeRoute.getSafeRouteCost(room.name, highwayRoomName, false, true, maxDist, true) <= maxDist) {
						reachable = true;
						break;
					}
				}
				if (!reachable) {
					sectorValid = false;
					break;
				}
			}

			if (!sectorValid) continue;

			// Right highway
			for (let i = -5; i <= 5; i++) {
				let highwayX = centreCoords.x + (centreCoords.x > 0 ? -5 : 5)
				let highwayY = centreCoords.y + (centreCoords.y > 0 ? i : -i)

				let highwayRoomName = util.getRoomNameFromCoords({x: highwayX, y: highwayY})

				let reachable = false
				for (let room of Game.myRooms) {
					if (safeRoute.getSafeRouteCost(room.name, highwayRoomName, false, true, maxDist, true) <= maxDist) {
						reachable = true;
						break;
					}
				}
				if (!reachable) {
					sectorValid = false;
					break;
				}
			}	

			if (!sectorValid) continue;

			// Left highway
			for (let i = -5; i <= 5; i++) {
				let highwayX = centreCoords.x + (centreCoords.x > 0 ? 5 : -5)
				let highwayY = centreCoords.y + (centreCoords.y > 0 ? i : -i)

				let highwayRoomName = util.getRoomNameFromCoords({x: highwayX, y: highwayY})

				let reachable = false
				for (let room of Game.myRooms) {
					if (safeRoute.getSafeRouteCost(room.name, highwayRoomName, false, true, maxDist, true) <= maxDist) {
						reachable = true;
						break;
					}
				}
				if (!reachable) {
					sectorValid = false;
					break;
				}
			}

			if (!sectorValid) continue

			global.depositFarmingSectors.push(centreName)

		}
	},


	scanRooms: function() {
		Memory.commoditiesManager.sectors = Memory.commoditiesManager.sectors || {}

		for (let depositFarmingCentreName of global.depositFarmingSectors) {
			Memory.commoditiesManager.sectors[depositFarmingCentreName] = Memory.commoditiesManager.sectors[depositFarmingCentreName] || {};

			let sectorMem = Memory.commoditiesManager.sectors[depositFarmingCentreName]

			sectorMem.deposits = sectorMem.deposits || {};
			sectorMem.walls = sectorMem.walls || {};


			let centreCoords = util.getRoomCoords(depositFarmingCentreName);

			let deposits = [];
			// Top highway
			for (let i = -5; i <= 5; i++) {
				let highwayX = centreCoords.x + (centreCoords.x > 0 ? i : -i)
				let highwayY = centreCoords.y + (centreCoords.y > 0 ? -5 : 5)

				let highwayRoomName = util.getRoomNameFromCoords({x: highwayX, y: highwayY})

				if (Game.rooms[highwayRoomName]) {
					let newDeposits = Game.rooms[highwayRoomName].find(FIND_DEPOSITS);
					deposits = deposits.concat(newDeposits)
					if (newDeposits.length && Game.rooms[highwayRoomName].constructedWalls.length) {
						sectorMem.walls[highwayRoomName] = 1;
					}
					else {
						delete sectorMem.walls[highwayRoomName]
					}
				}
			}

			// Right highway
			for (let i = -5; i <= 5; i++) {
				let highwayX = centreCoords.x + (centreCoords.x > 0 ? -5 : 5)
				let highwayY = centreCoords.y + (centreCoords.y > 0 ? i : -i)

				let highwayRoomName = util.getRoomNameFromCoords({x: highwayX, y: highwayY})

				if (Game.rooms[highwayRoomName]) {
					let newDeposits = Game.rooms[highwayRoomName].find(FIND_DEPOSITS);
					deposits = deposits.concat(newDeposits)
					if (newDeposits.length && Game.rooms[highwayRoomName].constructedWalls.length) {
						sectorMem.walls[highwayRoomName] = 1;
					}
					else {
						delete sectorMem.walls[highwayRoomName]
					}
				}
			}

			// Bottom highway
			for (let i = -5; i <= 5; i++) {
				let highwayX = centreCoords.x + (centreCoords.x > 0 ? i : -i)
				let highwayY = centreCoords.y + (centreCoords.y > 0 ? 5 : -5)

				let highwayRoomName = util.getRoomNameFromCoords({x: highwayX, y: highwayY})

				if (Game.rooms[highwayRoomName]) {
					let newDeposits = Game.rooms[highwayRoomName].find(FIND_DEPOSITS);
					deposits = deposits.concat(newDeposits)
					if (newDeposits.length && Game.rooms[highwayRoomName].constructedWalls.length) {
						sectorMem.walls[highwayRoomName] = 1;
					}
					else {
						delete sectorMem.walls[highwayRoomName]
					}
				}
			}

			// Left highway
			for (let i = -5; i <= 5; i++) {
				let highwayX = centreCoords.x + (centreCoords.x > 0 ? 5 : -5)
				let highwayY = centreCoords.y + (centreCoords.y > 0 ? i : -i)

				let highwayRoomName = util.getRoomNameFromCoords({x: highwayX, y: highwayY})

				if (Game.rooms[highwayRoomName]) {
					let newDeposits = Game.rooms[highwayRoomName].find(FIND_DEPOSITS);
					deposits = deposits.concat(newDeposits)
					if (newDeposits.length && Game.rooms[highwayRoomName].constructedWalls.length) {
						sectorMem.walls[highwayRoomName] = 1;
					}
					else {
						delete sectorMem.walls[highwayRoomName]
					}
				}
			}

			// console.log("Sector", depositFarmingCentreName, "deposits", deposits)

			for (let deposit of deposits) {
				// Is this my sector or another? Need to actually do collsion detection
				// New one.
				// if (!sectorMem.deposits[deposit.id]) {
					// TODO: Sort it out in the mission. When selecting a new one, check for current on other missions
					let foundElsewhere = false;

					if (!foundElsewhere) {						
						sectorMem.deposits[deposit.id] = {x: deposit.pos.x, 
														  y: deposit.pos.y,
														  r: deposit.depositType,
														  roomName: deposit.pos.roomName,
														  t: deposit.pos.countAccessibleTiles(),
														  lc: deposit.lastCooldown, 
														  ttd: deposit.ticksToDecay,
														  h: (sectorMem.deposits[deposit.id] ? sectorMem.deposits[deposit.id].h : 0) // Harvested so far. More accurate cooldown prediction
														};
					}


				// }
				// Update
				// else {
				// 	sectorMem.deposits[deposit.id].lc = deposit.lastCooldown
				// 	sectorMem.deposits[deposit.id].ttd = deposit.ticksToDecay
				// }
			}

			let keys = Object.keys(sectorMem.deposits)
			for (let depositId of keys) {
				let checkDepositInfo = sectorMem.deposits[depositId];
				if (Game.rooms[checkDepositInfo.roomName]) {
					let found = false;
					for (let deposit of Game.rooms[checkDepositInfo.roomName].find(FIND_DEPOSITS)) {
						if (deposit.id == depositId) {
							found = true;
							// I shouldn't have to do this but stuff was being weird so here it is
							sectorMem.deposits[deposit.id].lc = deposit.lastCooldown
							sectorMem.deposits[deposit.id].ttd = deposit.ticksToDecay
							break;
						}
					}
					if (!found) {
						delete sectorMem.deposits[depositId]
					}
				}
			}

			let sumCooldown = 0;
			let cnt = 0;
			for (let depositIDs in sectorMem.deposits) {
				sumCooldown += sectorMem.deposits[depositIDs].lc
				cnt++;
			}

			sectorMem.meanCooldown = sumCooldown / cnt;

		}



	},

	requestMissions: function() {
		let takenDepositIDs = [];
		for (let depositFarmingCentreName of global.depositFarmingSectors) {
			let sectorMem = Memory.commoditiesManager.sectors[depositFarmingCentreName];

			let depositIDs = Object.keys(sectorMem.deposits)
			if (!depositIDs.length) continue;


			// Any deposit in a room with walls => cancel
			let walls = false;
			for (let depositId of depositIDs) {
				let roomName = sectorMem.deposits[depositId].roomName;

				if (sectorMem.walls[roomName]) {
					walls = true;
					break;
				}
			}

			if (walls) continue;


			if (!Memory.botArena || Memory.season4) {
				takenDepositIDs = takenDepositIDs.concat(depositIDs)
				Memory.combatManager.requestedMissions[MISSION_DEPOSIT_FARM][depositFarmingCentreName] = Game.time;
			}
			else {
				if (Math.random() < 0.001) console.log("Deposit farm disabled on botArena")
			}
		}

		Memory.commoditiesManager.extraDeposits = Memory.commoditiesManager.extraDeposits || {};

		for (let room of Game.myRooms) {
			for (let depositRoomName of room.depositRooms) {
				if (!Game.rooms[depositRoomName]) continue;
				let deposits = Game.rooms[depositRoomName].find(FIND_DEPOSITS);

				if (!deposits.length) {
					delete Memory.commoditiesManager.extraDeposits[depositRoomName];
					continue;
				}

				if (deposits.length == 0) {
					delete Memory.commoditiesManager.extraDeposits[depositRoomName];
					continue
				}

				if (Game.rooms[depositRoomName].constructedWalls.length) {
					delete Memory.commoditiesManager.extraDeposits[depositRoomName];
					continue
				}

				// We can only do one at once right now. Make sure we get a consistent order
				if (deposits.length > 1) {
					deposits = _.sortBy(deposits, "id")
				}
				for (let deposit of deposits) {
					if ((deposit.lastCooldown || 0) <= (Memory.stats.yieldPerSpawnTick != 0 ? 20 : 40) && deposit.ticksToDecay > 3000) {
						if (!takenDepositIDs.includes(deposit.id)) {						
							Memory.commoditiesManager.extraDeposits[depositRoomName] = {x: deposit.pos.x, 
																						y: deposit.pos.y, 
																						r: deposit.depositType,
																						roomName: deposit.pos.roomName,
																						t: deposit.pos.countAccessibleTiles(),
																						lc: deposit.lastCooldown, 
																						ttd: deposit.ticksToDecay,
																						h: (Memory.commoditiesManager.extraDeposits[depositRoomName] ? Memory.commoditiesManager.extraDeposits[depositRoomName].h : 0)}
							Memory.combatManager.requestedMissions[MISSION_DEPOSIT_HARVEST][depositRoomName] = Game.time;
							takenDepositIDs.push(deposit.id)	
						}
					}
				}

				// console.log(depositRoomName, takenDepositIDs, deposit.lastCooldown, deposit.ticksToDecay)

			}
		}
	},
}


module.exports = commoditiesManager;
