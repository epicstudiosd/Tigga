"use strict";

var util = require('util');
const constants = require('constants');
const intelAI = require('intelAI');

const interShardMemoryManager = require('interShardMemoryManager');
const safeRoute = require('safeRoute');
const creepCreator = require('creepCreator');
const missionInfo = require('missionInfo');


const BUY_SELL_MAX_DIFF = 0.2; // 20%


const testAmount = 1000;
const labWorkPremiumExport = 1.05
const labWorkPremiumImport = 0.98


function getAvgMineralCost(room) {
	if (room.avgMineralCost === undefined) {	
		let mineralCost = 0
		if (room.mem.avgImportValues) {			
			mineralCost += (room.mem.avgImportValues[RESOURCE_HYDROGEN] || 0) * 1.5;
			mineralCost += (room.mem.avgImportValues[RESOURCE_OXYGEN] || 0) * 1.5;
			mineralCost += room.mem.avgImportValues[RESOURCE_ZYNTHIUM] || 0;
			mineralCost += room.mem.avgImportValues[RESOURCE_KEANIUM] || 0;
			mineralCost += room.mem.avgImportValues[RESOURCE_UTRIUM] || 0;
			mineralCost += room.mem.avgImportValues[RESOURCE_LEMERGIUM] || 0;
			mineralCost += room.mem.avgImportValues[RESOURCE_CATALYST] || 0;

			mineralCost /= 8;

			room.avgMineralCost = mineralCost;
		}
		else {
			room.avgMineralCost = Infinity			
		}
	}
	return room.avgMineralCost
}

// If we can base energy price off the average PRICE not VALUE then maybe we get something sane?
function getAvgMineralPrice(room) {
	if (room.avgMineralPrice === undefined) {	
		if (room.bestImportOrders &&
			room.bestImportOrders[RESOURCE_HYDROGEN] && 
			room.bestImportOrders[RESOURCE_OXYGEN] && 
			room.bestImportOrders[RESOURCE_ZYNTHIUM] && 
			room.bestImportOrders[RESOURCE_KEANIUM] && 
			room.bestImportOrders[RESOURCE_UTRIUM] && 
			room.bestImportOrders[RESOURCE_LEMERGIUM] && 
			room.bestImportOrders[RESOURCE_CATALYST]) {			

			let mineralPrice = 0
			mineralPrice += (room.bestImportOrders[RESOURCE_HYDROGEN].price || 0) * 1.5;
			mineralPrice += (room.bestImportOrders[RESOURCE_OXYGEN].price || 0) * 1.5;
			mineralPrice += room.bestImportOrders[RESOURCE_ZYNTHIUM].price || 0;
			mineralPrice += room.bestImportOrders[RESOURCE_KEANIUM].price || 0;
			mineralPrice += room.bestImportOrders[RESOURCE_UTRIUM].price || 0;
			mineralPrice += room.bestImportOrders[RESOURCE_LEMERGIUM].price || 0;
			mineralPrice += room.bestImportOrders[RESOURCE_CATALYST].price || 0;

			mineralPrice /= 8;

			room.avgMineralPrice = mineralPrice;
		}
	}
	return room.avgMineralPrice
}


function calcRoomEnergyPrice(room) {
	if (room.energyPrice === undefined) {
		if (Memory.privateServer == 1) {
			// let avgMineralCost = getAvgMineralCost(room)
			// if (avgMineralCost && Memory.baselineMineralCost === undefined) {
			// 	Memory.baselineMineralCost = avgMineralCost
			// }

			// This might take a while to be defined
			if (room.mem.avgMineralPrice) {
				room.energyPrice = room.mem.avgMineralPrice;
			}
			else {
				// I don't like this min. The trouble is you get loops - energy price rises so import does so energy does.
				room.energyPrice = Math.min(0.2, (getAvgMineralCost(room) || 0));
			}

			room.mem.energyPrice = room.energyPrice;
		}
		else {
			room.energyPrice = room.mem.energyPrice || Infinity;
		}
		room.storedEnergy = room.getStoredEnergy()
		// TODO: Include batteries?

		if (room.storedEnergy > constants.MARKET_STORED_ENERGY_THRESHOLD) {
			room.energyPrice /= (room.storedEnergy / constants.MARKET_STORED_ENERGY_THRESHOLD);
		}

	}
}


var marketTrader = {
	/*isWorthLevel0OverProcess(room, resourceType) {
		let components = COMMODITIES[resourceType].components;

		let cost = 0;
		for (let componentType in components) {
			if ([RESOURCE_SILICON, RESOURCE_METAL, RESOURCE_BIOMASS, RESOURCE_MIST].includes(_componentType)) {
				if (Memory.stats.globalResources[resourceType] > Game.myRooms.length * constants.MIN_AMOUNT_BEFORE_BAR) {
					cost = room.mem.avgExportValues[resourceType];
				}
				else {					
					cost = room.mem.avgImportValues[resourceType] || Infinity;

					if ((room.mem.avgExportValues[resourceType] || 0) < cost * 0.5) {
						cost = Math.min(cost, (room.mem.avgExportValues[resourceType] + room.energyPrice) * 1.1);
					}
				}

				
			}	
			else {
				cost += this.getMyMineralBaseComponentsCost(room, componentType) * components[componentType];
			}
		}

		let income;
		if (current && global.exportValues && global.exportValues[room.name] && global.exportValues[room.name][resourceType]) {
			income = 0.5 * (global.exportValues[room.name][resourceType] + room.mem.avgExportValues[resourceType]) * COMMODITIES[resourceType].amount;
		}
		else {
			income = room.mem.avgExportValues[resourceType] * COMMODITIES[resourceType].amount;
		}

		let marginPercentage = income / cost;

		return marginPercentage;
	},*/


	getProfitMargin(room, resourceType, current, overProcess) {
		if (Memory.season4) {
			return 1
		}

		global.inTickObject.profitMargin = global.inTickObject.profitMargin || {}
		global.inTickObject.profitMargin[room.name] = global.inTickObject.profitMargin[room.name] || {}

		let hash = resourceType + "" + (overProcess ? 1 : 0)

		if (global.inTickObject.profitMargin[room.name][hash]) {
			return global.inTickObject.profitMargin[room.name][hash]
		}

		let components = COMMODITIES[resourceType].components;

		let cost = 0;
		for (let componentType in components) {
			if (Memory.season4) {
				cost += (COMMODITY_SCORE[componentType] || 0)
			}
			else {
				cost += this.getMyMineralBaseComponentsCost(room, componentType, overProcess) * components[componentType];	
			}
			
		}

		if (COMMODITIES[resourceType].level && !Memory.season4) {
			cost += this.getMyMineralBaseComponentsCost(room, RESOURCE_OPS, overProcess) * POWER_INFO[PWR_OPERATE_FACTORY].ops / Math.ceil(POWER_INFO[PWR_OPERATE_FACTORY].duration / COMMODITIES[resourceType].cooldown)
		}


		let income;
		if (Memory.season4) {
			income = COMMODITY_SCORE[resourceType]
		}
		else {			
			if (current && global.exportValues && global.exportValues[room.name] && global.exportValues[room.name][resourceType]) {
				income = 0.5 * (global.exportValues[room.name][resourceType] + room.mem.avgExportValues[resourceType]) * COMMODITIES[resourceType].amount;
			}
			else {
				income = room.mem.avgExportValues[resourceType] * COMMODITIES[resourceType].amount;
			}
		}

		let marginPercentage = income / cost;

		global.inTickObject.profitMargin[room.name][hash] = marginPercentage

		return marginPercentage;
	},
	getProfitMarginTEST(room, resourceType, current, overProcess) {

		global.inTickObject.profitMargin = global.inTickObject.profitMargin || {}
		global.inTickObject.profitMargin[room.name] = global.inTickObject.profitMargin[room.name] || {}

		let hash = resourceType + "" + (overProcess ? 1 : 0)

		if (global.inTickObject.profitMargin[room.name][hash]) {
			return global.inTickObject.profitMargin[room.name][hash]
		}

		let components = COMMODITIES[resourceType].components;

		let cost = 0;
		for (let componentType in components) {
			if (Memory.season4) {
				cost += (COMMODITY_SCORE[componentType] || 0) * components[componentType]
			}
			else {
				cost += this.getMyMineralBaseComponentsCost(room, componentType, overProcess) * components[componentType];	
			}
			
		}

		if (COMMODITIES[resourceType].level && !Memory.season4) {
			cost += this.getMyMineralBaseComponentsCost(room, RESOURCE_OPS, overProcess) * POWER_INFO[PWR_OPERATE_FACTORY].ops / Math.ceil(POWER_INFO[PWR_OPERATE_FACTORY].duration / COMMODITIES[resourceType].cooldown)
		}


		let income;
		if (Memory.season4) {
			income = COMMODITY_SCORE[resourceType] * COMMODITIES[resourceType].amount
		}
		else {			
			if (current && global.exportValues && global.exportValues[room.name] && global.exportValues[room.name][resourceType]) {
				income = 0.5 * (global.exportValues[room.name][resourceType] + room.mem.avgExportValues[resourceType]) * COMMODITIES[resourceType].amount;
			}
			else {
				income = room.mem.avgExportValues[resourceType] * COMMODITIES[resourceType].amount;
			}
		}

		let marginPercentage = income / cost;

		global.inTickObject.profitMargin[room.name][hash] = marginPercentage

		return marginPercentage;
	},


	chainAnalysis: function(room, chain) {
		let bestInChain;
		let bestMarginPercentage = 1;

		for (let resourceType of chain) {
			if ((COMMODITIES[resourceType].level || 0) > (Memory.commoditiesManager.maxFactoryLevel || 0)) {
				continue
			}
			let marginPercentage = this.getProfitMargin(room, resourceType, true, false)

			if (marginPercentage > bestMarginPercentage) {
				bestMarginPercentage = marginPercentage;
				bestInChain = resourceType;
			}
		}

		return {resourceType: bestInChain, margin: bestMarginPercentage};
	},

	getBestCommoditityInChain: function(room, chainResourceType) {
		// Um. This is called with a room and calculates for a room... but inTickObject is _not_ a room. Is that bad? Probably not
		let chain = util.getCommoditiesForChain(chainResourceType);

		if (!chain) {
			return -1
		}

		if (Memory.season4) {
			return chain[chain.length - 1]
		}

		global.bestInChain = global.bestInChain || {}
		if (global.bestInChain[chain] && Math.random() > 0.01) {
			return global.bestInChain[chain].resourceType 
		}

		global.bestInChain[chain] = this.chainAnalysis(room, chain)

		return global.bestInChain[chain].resourceType || -1;

		// global.inTickObject.bestInChain = global.inTickObject.bestInChain || {}

		// if (global.inTickObject.bestInChain[chain]) {
		// 	return global.inTickObject.bestInChain[chain].resourceType
		// }

		// global.inTickObject.bestInChain[chain] = this.chainAnalysis(room, chain)

		// return global.inTickObject.bestInChain[chain].resourceType;
	},

	getChainProfitMargin: function(room, chainResourceType) {
		let chain = util.getCommoditiesForChain(chainResourceType);

		if (!chain) {
			return -1
		}

		global.bestInChain = global.bestInChain || {}
		if (global.bestInChain[chain] && Math.random() > 0.01) {
			return global.bestInChain[chain].margin;
		}

		global.bestInChain[chain] = this.chainAnalysis(room, chain)

		return global.bestInChain[chain].margin;


		// global.inTickObject.bestInChain = global.inTickObject.bestInChain || {}

		// if (global.inTickObject.bestInChain[chain]) {
		// 	return global.inTickObject.bestInChain[chain].margin
		// }

		// global.inTickObject.bestInChain[chain] = this.chainAnalysis(room, chain)

		// return global.inTickObject.bestInChain[chain].margin;
	},


	// If we were to buy everything to make this, how much would it cost?
	// Overprocess is for processing for profit: if we already have enough of the target
	// should we process for profit?
	getMyMineralBaseComponentsCost: function(room, resourceType, overProcess) {
		global.inTickObject.mineralBaseComponentsCost = global.inTickObject.mineralBaseComponentsCost || {}
		global.inTickObject.mineralBaseComponentsCost[room.name] = global.inTickObject.mineralBaseComponentsCost[room.name] || {}

		let hash = resourceType + "" + (overProcess ? 1 : 0)

		if (global.inTickObject.mineralBaseComponentsCost[room.name][hash]) {
			return global.inTickObject.mineralBaseComponentsCost[room.name][hash]
		}

		let cost = 0;

		calcRoomEnergyPrice(room);

		if (resourceType == RESOURCE_ENERGY) {
			return room.energyPrice
		}
		else if (RECIPES[resourceType]) {
			let cost1
			
			// Got loads of it. We'll be exporting it more than import. Value at what I can get for it
			if (Memory.stats.globalResources[resourceType] > Game.myRooms.length * constants.MIN_AMOUNT_BEFORE_BAR) {
				cost1 = room.mem.avgExportValues[resourceType];
			}
			else {
				// Matching people's sell orders
				if (room.mem.avgImportValues[resourceType] !== undefined) {
					// Assume there's no arbitrage.
					if (room.mem.avgExportValues[resourceType] !== undefined) {
						cost1 = Math.max(room.mem.avgImportValues[resourceType], room.mem.avgExportValues[resourceType])
					}
					else {
						cost1 = room.mem.avgImportValues[resourceType]
					}
				}
				else {
					cost1 = Infinity
				}

				// There's a big disparity between buy and sell. In this case _don't_ lean
				// on people's sell orders for pricing info. It's probably not a developed market.
				// Instead take the best buy and add energy price.
				if ((room.mem.avgExportValues[resourceType] || 0) < cost1 * 0.5) {
					cost1 = Math.min(cost1, (room.mem.avgExportValues[resourceType] + room.energyPrice) * 1.1);
				}
			}

			let cost2 = 0;
			cost2 += this.getMyMineralBaseComponentsCost(room, RECIPES[resourceType][0], overProcess) * (1 + REACTION_TIME[resourceType] / 500);
			cost2 += this.getMyMineralBaseComponentsCost(room, RECIPES[resourceType][1], overProcess) * (1 + REACTION_TIME[resourceType] / 500);

			if (room.energyPrice && room.energyPrice != Infinity) {
				// Transmission cost. Assume I have to move one mineral ~10 rooms.
				cost2 += room.energyPrice / 2;
				// CPU cost
				cost2 += room.energyPrice * (Memory.stats.yieldPerCPU || 0) * global.INTENT_CPU_COST / LAB_REACTION_AMOUNT
			}
			// Fucking convoys everywhere
			if (resourceType == RESOURCE_CATALYZED_GHODIUM_ACID && !Memory.botArena) {
				cost2 /= 2;
			}

			cost = 0.8 * Math.min(cost1, cost2) + 0.2 * (cost1 + cost2);
		}
		// Using length is an awful hack to say "is it a basic mineral" otherwise we'll get infinite loops between basic minerals and bars
		else if (COMMODITIES[resourceType] && resourceType.length > 1) {
			// Matching people's sell orders
			let cost1;

			// Got loads of it. We'll be exporting it more than import. Value at what I can get for it
			if (Memory.stats.globalResources[resourceType] > Game.myRooms.length * constants.MIN_AMOUNT_BEFORE_BAR) {
				cost1 = room.mem.avgExportValues[resourceType];
			}
			else {				
				if (room.mem.avgImportValues[resourceType] !== undefined) {
					// Assume there's no arbitrage.
					if (room.mem.avgExportValues[resourceType] !== undefined) {
						cost1 = Math.max(room.mem.avgImportValues[resourceType], room.mem.avgExportValues[resourceType])
					}
					else {
						cost1 = room.mem.avgImportValues[resourceType]
					}
				}

				// There's a big disparity between buy and sell. In this case _don't_ lean
				// on people's sell orders for pricing info. It's probably not a developed market.
				// Instead take the best buy and add energy price.
				if (room.mem.avgExportValues[resourceType] !== undefined && cost1 !== undefined) {				
					if (room.mem.avgExportValues[resourceType] < cost1 * 0.5) {
						cost1 = Math.min(cost1, (room.mem.avgExportValues[resourceType] + room.energyPrice) * 1.1);
					}
				}
			}

			// if (room.name == "W17S38" && (resourceType == "silicon" || resourceType == "wire")) {
			// 	console.log(resourceType, cost1, room.mem.avgExportValues[resourceType], room.mem.avgImportValues[resourceType])
			// }


			let components = COMMODITIES[resourceType].components;
			let cost2 = 0;
			for (let componentType in components) {
				cost2 += this.getMyMineralBaseComponentsCost(room, componentType, overProcess) * components[componentType];
				// if (room.name == "W17S38" && (resourceType == "silicon" || resourceType == "wire")) {
				// 	console.log(resourceType, cost2, componentType, JSON.stringify(components))
				// }
			}

			if (COMMODITIES[resourceType].level) {
				cost2 += this.getMyMineralBaseComponentsCost(room, RESOURCE_OPS, overProcess) * POWER_INFO[PWR_OPERATE_FACTORY].ops / Math.ceil(POWER_INFO[PWR_OPERATE_FACTORY].duration / COMMODITIES[resourceType].cooldown)
			}

			// if (room.name == "W17S38" && (resourceType == "silicon" || resourceType == "wire")) {
			// 	console.log(resourceType, cost2, JSON.stringify(components))
			// }


			cost2 /= COMMODITIES[resourceType].amount;

			// if (room.name == "W17S38" && (resourceType == "silicon" || resourceType == "wire")) {
			// 	console.log(resourceType, cost2, COMMODITIES[resourceType].amount)
			// }



			if (room.energyPrice && room.energyPrice != Infinity) {
				// Transmission cost. Assume I have to move one mineral ~10 rooms.
				cost2 += room.energyPrice / 2;
				// CPU cost
				// cost2 += room.energyPrice * (Memory.stats.yieldPerCPU || 0) * global.INTENT_CPU_COST / LAB_REACTION_AMOUNT
			}

			if (cost1 !== undefined) {
				cost = 0.8 * Math.min(cost1, cost2) + 0.2 * (cost1 + cost2);
			}
			else {
				cost = cost2;
			}

			// if (room.name == "W17S38" && (resourceType == "silicon" || resourceType == "wire")) {
			// 	console.log(resourceType, cost, cost1, cost2)
			// }
		}
		else {
			// Basics. 
			// Shit, no intel. Base it off energy. Honestly, this should be rare. 
			if (!room.mem.avgImportValues[resourceType] && !room.mem.avgExportValues[resourceType]) {
				// Minerals cost... 4x energy???
				if (resourceType.length == 1) {
					// TODO. Maybe we could come down from the bar price. Got to make sure not to infinite loop in recursion.
					cost = room.mem.energyPrice * 4;
				}
				// Fuck knows
				else if (resourceType == RESOURCE_OPS) {
					cost = room.mem.energyPrice * 100;
				}
				else {
					let ratio = Memory.commoditiesManager.depositStats.energyCost[resourceType] / Memory.commoditiesManager.depositStats.harvested[resourceType] 
					cost = room.energyPrice * ratio * 1.1;
				}
			}
			else {
				// Got loads of it. We'll be exporting it more than import. Value at what I can get for it
				if (Memory.stats.globalResources[resourceType] > Game.myRooms.length * constants.MIN_AMOUNT_BEFORE_BAR) {
					cost = room.mem.avgExportValues[resourceType];
				}
				else {					
					cost = room.mem.avgImportValues[resourceType] || Infinity;

					if ((room.mem.avgExportValues[resourceType] || 0) < cost * 0.5) {
						cost = Math.min(cost, (room.mem.avgExportValues[resourceType] + room.energyPrice) * 1.1);
					}
				}
				
				if (!overProcess && resourceType.length > 1 && Memory.commoditiesManager.depositStats.energyCost[resourceType] && Memory.commoditiesManager.depositStats.harvested[resourceType]) {
					let ratio = Memory.commoditiesManager.depositStats.energyCost[resourceType] / Memory.commoditiesManager.depositStats.harvested[resourceType] 

					cost = (cost + room.energyPrice * ratio * 1.1) / 2;
				}
			}
		}

		global.inTickObject.mineralBaseComponentsCost[room.name][hash] = cost;

		return cost
	},



	testEnergyMarket: function(room) {
		// Consider the more test prices I put out the more other people are likely to think that my test price is a value they can expect.
		// If we try to keep testing to a minimum we can hopefully not incur higher costs.

		const orderValidTime = 5001 // Any order that passed within this time considered a price people will pay (900 ticks/hour roughly)

		var terminal = room.terminal;

		if (!terminal || !terminal.my || !terminal.isActive()) return

		let currentLow = 0;
		let currentLowOrder;
		let hasOrder = false;
		let currentHigh = Infinity;

		// This gets a price that isn't good enough as it's still active
		var currentPositions = Game.market.orders;
		for (var orderId in currentPositions) {
			var order = currentPositions[orderId]
			if (order.resourceType == RESOURCE_ENERGY && order.type == ORDER_BUY && order.remainingAmount >= 50 && order.roomName == room.name) {
				if (order.price > currentLow) {
					currentLow = order.price;
					currentLowOrder = order;
				}
				hasOrder = true;
			}
		}

		let recentTransaction = false;


		// This looks through recent transactions to find what people were willing to pay in the past.
		for(var i = 0; i < Game.market.incomingTransactions.length; i++) {
			var transaction = Game.market.incomingTransactions[i];
			if (Game.time - transaction.time < orderValidTime) {
				if (transaction.order && transaction.resourceType == RESOURCE_ENERGY && transaction.to == room.name) {
					if (transaction.order.price < currentHigh) {
						currentHigh = transaction.order.price;
						room.mem.lastEnergyHigh = currentHigh;
						room.mem.lastEnergyHighTime = transaction.time;
					}
					recentTransaction = true;
				}
			}
			// These are sorted by time, so we can break
			// else {
			// 	break;
			// }
		}

		if (!recentTransaction && Game.time - (room.mem.lastEnergyHighTime || 0) < orderValidTime) {
			recentTransaction = true;
			currentHigh = Math.min(currentHigh, room.mem.lastEnergyHigh)
		}


		let sellOrders = Game.market.getAllOrders({type: ORDER_SELL, resourceType: RESOURCE_ENERGY});

		for (let sellOrder of sellOrders) {
			if (sellOrder.amount < 100) continue;
			let testAmount = 10000;
			let transferEnergyCost = Game.market.calcTransactionCost(testAmount, room.name, sellOrder.roomName);

			let cost = sellOrder.price * testAmount / (testAmount - transferEnergyCost);

			// Don't pay more than this.
			if (cost < currentHigh) currentHigh = cost;			

			// CurrentLow should not be set as maybe we can get it cheaper
		}

		// console.log(room.name, currentLow, currentHigh, room.mem.energyPrice)
		// Called once every hundred ticks.
		const alpha = Math.exp(-(1/(200.)));
		if (currentHigh !== Infinity) {
			if (room.mem.energyPrice === Infinity || !room.mem.energyPrice) {
				room.mem.energyPrice = currentHigh * 1.05;
			}
			else if (currentHigh * 1.05 < room.mem.energyPrice) {
				room.mem.energyPrice = currentHigh * 1.05;
			}
			else {
				room.mem.energyPrice = alpha * room.mem.energyPrice + (1 - alpha) * (currentHigh * 1.05);
			}
		}

		// Careful with fp comparisons
		if (!recentTransaction && Math.round(currentHigh * 1000) > Math.round(currentLow * 1000) + 1 && !Memory.botArena) {
			if (Math.random() < 0.1) {
				console.log(room.name, "Low: " + currentLow + " High: " + currentHigh)
			}
			if (currentLowOrder) {
				if (Math.random() < 0.1) {
					if (!Memory.privateServer || currentLowOrder.price < (room.mem.avgMineralPrice || 0)) {
						Game.market.changeOrderPrice(currentLowOrder.id, Math.round((currentLowOrder.price + 0.001) * 1000) / 1000);
					}
				}
			}
			else if (!hasOrder && Object.keys(Game.market.orders).length < MARKET_MAX_ORDERS - 1) {
				let testPrice = (room.mem.energyPrice || 0) == Infinity ? 0 : room.mem.energyPrice * .75;

				if (Memory.privateServer) {
					testPrice = Math.min(testPrice, (room.mem.avgMineralPrice || 0))
				}

				Game.market.createOrder(ORDER_BUY, RESOURCE_ENERGY, testPrice * .75 + 0.002, 100 + Math.floor(Math.random() * 100), room.name);
			}
			// Not sure yet, assume it hasn't changed. We'll find out soon.
		}
	},



	marketIntel: function(marketData) {
		global.exportOrders = global.exportOrders || {};
		global.importOrders = global.importOrders || {};

		marketData.changedImport = marketData.changedImport || {};
		marketData.changedExport = marketData.changedExport || {};

		if (Math.random() > Math.sqrt(Game.cpu.bucket / 10000)) return

		if (global.creditLimit > 0 && !Memory.botArena) {
			if (Math.random() < 0.1) {
				for (var room of _.shuffle(Game.myRooms)) {
					if (Math.random() < 0.1) {
						this.testEnergyMarket(room);
					}
				}
			}
		}

		let privateServer = Memory.privateServer && false;

		let allOrders;
		if (privateServer) {
			allOrders = _.groupBy(Game.market.getAllOrders(), "resourceType");
		}

		/*let energyImportOrders;
		if (!Memory.privateServer) {
			energyImportOrders = Game.market.getAllOrders({type: ORDER_SELL, resourceType: RESOURCE_ENERGY});
		}
		else {
			energyImportOrders = _.filter(allOrders[RESOURCE_ENERGY], o => o.type == ORDER_SELL);
		}*/

		let force = 0;
		for (let room of Game.myRooms) {
			calcRoomEnergyPrice(room)
			if (Memory.privateServer && room.terminal && (room.mem.avgMineralPrice === undefined || Math.random() < 0.0001)) {
				force = 1
			}
			/*let minCost = Infinity;
			for (let order of energyImportOrders) {
				let cost = order.price * testAmount / (testAmount - Game.market.calcTransactionCost(testAmount, room.name, order.roomName));
				// console.log(order.price, Game.market.calcTransactionCost(testAmount, room.name, order.roomName), cost)
				if (order.amount > 100 && cost < minCost) {
					minCost = cost;
					room.energyPrice = Math.min(cost, room.energyPrice);
					room.matchEnergyPrice = cost;
					room.bestEnergyOrder = order;
				}
			}*/
		}


		const alphaDown = Math.exp(-(1/(10000.)))
		const alphaDown2 = Math.exp(-(1/(1000.)))

		const alphaUp = Math.exp(-(1/(100.)))

		for (let resourceType of RESOURCES_ALL) {
			if (resourceType == RESOURCE_ENERGY) continue;
			// if (resourceType != "H") continue;

			if (Math.random() < 0.2 * Game.cpu.bucket / 10000 || force) {
				let exportOrders;
				let importOrders;

				marketData.exportOrders = marketData.exportOrders || {};
				marketData.importOrders = marketData.importOrders || {};

				if (marketData.exportOrders[resourceType] && marketData.importOrders[resourceType]) {
					exportOrders = marketData.exportOrders[resourceType];
					importOrders = marketData.importOrders[resourceType];
				}
				else {
					if (!privateServer) {
						let orders = _.groupBy(Game.market.getAllOrders({resourceType: resourceType}), "type");
						exportOrders = orders[ORDER_BUY] || [];
						importOrders = orders[ORDER_SELL] || [];
					}
					else {
						exportOrders = _.filter(allOrders[resourceType], o => o.type == ORDER_BUY);
						importOrders = _.filter(allOrders[resourceType], o => o.type == ORDER_SELL);
					}
					marketData.exportOrders[resourceType] = exportOrders;
					marketData.importOrders[resourceType] = importOrders;
				}

				if (exportOrders.length == 0 && importOrders.length == 0) continue

				let changedExport = false;
				let changedImport = false;

				let stringedExport = JSON.stringify(exportOrders);
				let stringedImport = JSON.stringify(importOrders);

				if (stringedExport != global.exportOrders[resourceType]) {
					changedExport = true;
					global.exportOrders[resourceType] = stringedExport;
				}

				if (stringedImport != global.importOrders[resourceType]) {
					changedImport = true;
					global.importOrders[resourceType] = stringedImport;
				}

				marketData.changedImport[resourceType] = changedImport;
				marketData.changedExport[resourceType] = changedExport;

				for (var room of Game.myRooms) {
					// if (!room.controller || !room.controller.my) continue


					global.importValues = global.importValues || {}
					global.importValues[room.name] = global.importValues[room.name] || {}

					global.exportValues = global.exportValues || {}
					global.exportValues[room.name] = global.exportValues[room.name] || {}


					// room.mem.importValues = room.mem.importValues || {};
					// room.mem.exportValues = room.mem.exportValues || {};
					room.mem.avgImportValues = room.mem.avgImportValues || {};
					room.mem.avgExportValues = room.mem.avgExportValues || {};

					room.bestExportOrders = room.bestExportOrders || {}
					room.bestExportValues = room.bestExportValues || {}
					room.bestExportRooms = room.bestExportRooms || {}

					room.bestImportOrders = room.bestImportOrders || {}
					room.bestImportValues = room.bestImportValues || {}
					room.bestImportRooms = room.bestImportRooms || {}

					let bestExportValue = 0;
					let bestExportOrder = null;
					let bestExportRoom;

					let bestImportValue = Infinity;
					let bestImportOrder = null;
					let bestImportRoom;

					if (changedExport && exportOrders) {
						if (!room.bestExportOrders[resourceType]) {
							// I assume orders are sorted by time. Sanity check here
							var lastOrderTime = Infinity

							for(var i=exportOrders.length-1; i >= 0; i--) {
								var order = exportOrders[i];
								if (order.amount > 100 || util.isNPCTerminalRoom(order.roomName)) {
									var transferEnergyCost = Game.market.calcTransactionCost(testAmount, room.name, order.roomName);

									var value = testAmount * order.price - transferEnergyCost * room.energyPrice;
									// if (resourceType == RESOURCE_POWER) console.log(room, resourceType, order.price, value / testAmount, bestExportValue)

									if (value / testAmount > bestExportValue) {
										bestExportValue = value / testAmount;
										bestExportOrder = order;
										bestExportRoom = room;
									}
								}
								lastOrderTime = order.created;
							}
							// Can't make money off this
							if (bestExportValue < 0 || bestExportOrder == null) {
								continue
							}
							else {
								room.bestExportOrders[resourceType] = bestExportOrder
								room.bestExportValues[resourceType] = bestExportValue
								room.bestExportRooms[resourceType] = bestExportRoom
							}
						}
						else {
							bestExportValue = room.bestExportValues[resourceType]
						}
					}
					else {
						bestExportValue = global.exportValues[room.name][resourceType] || 0;
					}

					if (changedImport && importOrders) {
						if (!room.bestImportOrders[resourceType]) {
							// I assume orders are sorted by time. Sanity check here
							var lastOrderTime = Infinity

							for(var i = importOrders.length-1; i >= 0; i--) {
								var order = importOrders[i];
								if (order.amount > 100) {
									var transferEnergyCost = Game.market.calcTransactionCost(testAmount, room.name, order.roomName);

									var value = testAmount * order.price + transferEnergyCost * room.energyPrice;

									if (value / testAmount < bestImportValue) {
										bestImportValue = value / testAmount;
										bestImportOrder = order;
										bestImportRoom = room;
									}
								}
							}
							if (bestImportOrder) {
								room.bestImportOrders[resourceType] = bestImportOrder
								room.bestImportValues[resourceType] = bestImportValue
								room.bestImportRooms[resourceType] = bestImportRoom
							}
						}
						else {
							bestImportValue = room.bestImportValues[resourceType]
						}
					}
					else {
						bestImportValue = global.importValues[room.name][resourceType] || Infinity;
					}

					// console.log(room, resourceType, bestImportValue, room.mem.importValues[resourceType], room.mem.avgImportValues[resourceType])

					if (bestImportValue && bestImportValue !== Infinity) {
						// Never import levelled ones
						if (!COMMODITIES[resourceType] || !COMMODITIES[resourceType].level) {							
							global.importValues[room.name][resourceType] = bestImportValue;
							if (room.mem.avgImportValues[resourceType] > bestImportValue || !room.mem.avgImportValues[resourceType]) {
								room.mem.avgImportValues[resourceType] = bestImportValue;
							}
							else {
								room.mem.avgImportValues[resourceType] = alphaDown * (room.mem.avgImportValues[resourceType] || bestImportValue) + (1 - alphaDown) * bestImportValue;
							}

							let precision = 100000;
							if (room.mem.avgImportValues[resourceType] < 1) {
								precision *= 10;
							}
							if (room.mem.avgImportValues[resourceType] < 0.1) {
								precision *= 10;
							}
							if (room.mem.avgImportValues[resourceType] < 0.01) {
								precision *= 10;
							}

							room.mem.avgImportValues[resourceType] = Math.round(room.mem.avgImportValues[resourceType] * precision) / precision
						}
					}


					// We only need it for power right now
					if (bestExportValue) {
						global.exportValues[room.name][resourceType] = bestExportValue;
						if (room.mem.avgExportValues[resourceType] < bestExportValue || !room.mem.avgExportValues[resourceType]) {
							room.mem.avgExportValues[resourceType] = alphaUp * (room.mem.avgExportValues[resourceType] || bestExportValue) + (1 - alphaUp) * bestExportValue;
						}
						else {
							// The problem is that these spike, but at very low volume. 
							if (COMMODITIES[resourceType] && COMMODITIES[resourceType].level) {							
								room.mem.avgExportValues[resourceType] = alphaDown2 * (room.mem.avgExportValues[resourceType] || bestExportValue) + (1 - alphaDown2) * bestExportValue;
							}
							else {
								room.mem.avgExportValues[resourceType] = alphaDown * (room.mem.avgExportValues[resourceType] || bestExportValue) + (1 - alphaDown) * bestExportValue;
							}

						}

						let precision = 100000;
						if (room.mem.avgExportValues[resourceType] < 1) {
							precision *= 10;
						}
						if (room.mem.avgExportValues[resourceType] < 0.1) {
							precision *= 10;
						}
						if (room.mem.avgExportValues[resourceType] < 0.01) {
							precision *= 10;
						}

						room.mem.avgExportValues[resourceType] = Math.round(room.mem.avgExportValues[resourceType] * precision) / precision
					}
				}
			}
		}


		if (Memory.privateServer) {
			for (let room of Game.myRooms) {
				let avgMineralPrice = getAvgMineralPrice(room)

				if (avgMineralPrice !== undefined) {
					room.mem.avgMineralPrice = avgMineralPrice
				}
			}
		}

	},



	arbitrage: function(marketData, currentDeals) {
		Memory.failedArbitrages = Memory.failedArbitrages || {}

		let privateServer = Memory.privateServer && false;

		var deadPeriod = 1 + 10 * Math.round((10000 - Game.cpu.bucket) / 1000);

		if (!global.exportOrders) {
			global.exportOrders = {}
		}
		if (!global.importOrders) {
			global.importOrders = {}
		}
		if (!global.deadResources) {
			if (privateServer) {
				global.deadResources = []
			}
			else {
				// Assume boring minerals will have no large profit possible
				global.deadResources = [RESOURCE_HYDROGEN, RESOURCE_OXYGEN, RESOURCE_LEMERGIUM, RESOURCE_KEANIUM, RESOURCE_UTRIUM, RESOURCE_ZYNTHIUM, RESOURCE_CATALYST]
			}
		}
		// console.log("B", Game.cpu.getUsed())
		var loadTime = 0
		var analTime = 0

		let allOrders;
		if (privateServer) {
			allOrders = _.groupBy(Game.market.getAllOrders(), "resourceType");
		}
		// return
		// if (!Memory.privateServer) {
		// 	importOrders = Game.market.getAllOrders({type: ORDER_SELL, resourceType: RESOURCE_ENERGY});
		// }
		// else {
		// 	importOrders = _.filter(allOrders[RESOURCE_ENERGY], o => o.type == ORDER_SELL);
		// }

		for (let resourceType of RESOURCES_ALL) {
			if (resourceType == RESOURCE_ENERGY) continue;

			if (privateServer || Game.time % deadPeriod == 0 || !global.deadResources.includes(resourceType)) {
				let exportOrders;
				let importOrders;

				marketData.exportOrders = marketData.exportOrders || {};
				marketData.importOrders = marketData.importOrders || {};

				if (marketData.exportOrders[resourceType] && marketData.importOrders[resourceType]) {
					exportOrders = marketData.exportOrders[resourceType];
					importOrders = marketData.importOrders[resourceType];
				}
				else {
					// Only do ones we've already got data for if bucket is not pretty maxed out.
					if (Game.cpu.bucket > 9900) {						
						if (!privateServer) {
							let orders = _.groupBy(Game.market.getAllOrders({resourceType: resourceType}), "type");
							exportOrders = orders[ORDER_BUY] || [];
							importOrders = orders[ORDER_SELL] || [];
						}
						else {
							exportOrders = _.filter(allOrders[resourceType], o => o.type == ORDER_BUY);
							importOrders = _.filter(allOrders[resourceType], o => o.type == ORDER_SELL);
						}
						marketData.exportOrders[resourceType] = exportOrders;
						marketData.importOrders[resourceType] = importOrders;
					}
					else {
						continue;
					}
				}

				if (exportOrders.length == 0 || importOrders.length == 0) {
					if (!global.deadResources.includes(resourceType)) {
						global.deadResources.push(resourceType)
					}
					continue;
				}
				// importOrders = _.filter(importOrders, (order) => order.remainingAmount > 100 /*&& Game.time - order.created < 10000*/);
				// if (importOrders.length == 0) continue
				// var e1 = Game.cpu.getUsed()
				// loadTime += e1 - s1
				// console.log(resourceType, e1 - s1)

				if (global.deadResources.includes(resourceType)) {
					_.pull(global.deadResources, resourceType)
				}


				var s2 = Game.cpu.getUsed()

				let changedExport = false;
				let changedImport = false;

				if (marketData.changedExport[resourceType] === undefined) {
					let stringedExport = JSON.stringify(exportOrders);

					if (stringedExport != global.exportOrders[resourceType]) {
						changedExport = true;
						global.exportOrders[resourceType] = stringedExport;
					}
				}
				else {
					changedExport = marketData.changedExport[resourceType]
				}

				if (marketData.changedImport[resourceType] === undefined) {
					let stringedImport = JSON.stringify(importOrders);
					if (stringedImport != global.importOrders[resourceType]) {
						changedImport = true;
						global.importOrders[resourceType] = stringedImport;
					}
				}
				else {
					changedImport = marketData.changedImport[resourceType]
				}

				if (!changedExport && !changedImport) continue;

				// Only arbitrage from the best otherwise we compete with ourselves
				var arbDeals = []
				var fullPass = true; //Memory.privateServer || (Game.cpu.bucket / 10000) > 0.3 + Math.random() * 0.7
				const nonFullTimeCutOff = 100000;

				let bestExportValue = 0;
				let bestExportOrder = null;
				let bestExportRoom;

				let bestImportValue = Infinity;
				let bestImportOrder = null;
				let bestImportRoom;

				for (var room of Game.myRooms) {
					let terminal = room.terminal;
					if (!terminal || !room.controller || !room.controller.my || terminal.cooldown || !room.storage) continue

					if (room.marketTraded) continue;

					if (!terminal.store[resourceType]) continue

					if ((room.storage.store[RESOURCE_ENERGY] || 0) + (room.terminal.store[RESOURCE_ENERGY] || 0) < 10000) continue;

					calcRoomEnergyPrice(room)



					// var energyPrice = Math.round(room.mem.energyPrice * 100) / 100.
					// Never do a full pass if CPU < 3000. Half of the time do full passes at CPU 6500.

					// var bestExportPrice = 0;

					// for(var i=0; i < exportOrders.length; i++) {
						// let order = exportOrders[i];
						// if (order.remainingAmount > 100) {
							// if (order.price > bestExportPrice) {
								// bestExportPrice = order.price;
							// }
						// }
					// }


					room.bestExportOrders = room.bestExportOrders || {}
					room.bestExportValues = room.bestExportValues || {}
					room.bestExportRooms = room.bestExportRooms || {}

					room.bestImportOrders = room.bestImportOrders || {}
					room.bestImportValues = room.bestImportValues || {}
					room.bestImportRooms = room.bestImportRooms || {}


					if (!room.bestExportOrders[resourceType]) {
						// I assume orders are sorted by time. Sanity check here
						var lastOrderTime = Infinity

						for(var i=exportOrders.length-1; i >= 0; i--) {
							var order = exportOrders[i];
							if (order.amount > 100) {
								var transferEnergyCost = Game.market.calcTransactionCost(testAmount, room.name, order.roomName);
								// console.log(resourceType, order.price)

								var value = testAmount * order.price - transferEnergyCost * room.energyPrice;

								if (value / testAmount > bestExportValue) {
									bestExportValue = value / testAmount;
									bestExportOrder = order;
									bestExportRoom = room;
								}
							}
							lastOrderTime = order.created;
						}
						// Can't make money off this
						if (bestExportValue < 0 || bestExportOrder == null) {
							continue
						}
						else {
							room.bestExportOrders[resourceType] = bestExportOrder
							room.bestExportValues[resourceType] = bestExportValue
							room.bestExportRooms[resourceType] = bestExportRoom
						}
					}
					else {
						bestExportOrder = room.bestExportOrders[resourceType]
						bestExportValue = room.bestExportValues[resourceType]
						bestExportRoom = room.bestExportRooms[resourceType]
					}

					if (!room.bestImportOrders[resourceType]) {
						// I assume orders are sorted by time. Sanity check here
						var lastOrderTime = Infinity

						for(var i = importOrders.length-1; i >= 0; i--) {
							var order = importOrders[i];
							if (order.amount > 100) {
								var transferEnergyCost = Game.market.calcTransactionCost(testAmount, room.name, order.roomName);

								var value = testAmount * order.price + transferEnergyCost * room.energyPrice;
								if (value / testAmount < bestImportValue) {
									bestImportValue = value / testAmount;
									bestImportOrder = order;
									bestImportRoom = room;
								}
							}
						}
						if (bestImportOrder) {
							room.bestImportOrders[resourceType] = bestImportOrder
							room.bestImportValues[resourceType] = bestImportValue
							room.bestImportRooms[resourceType] = bestImportRoom
						}
					}
					else {
						bestImportOrder = room.bestImportOrders[resourceType]
						bestImportValue = room.bestImportValues[resourceType]
						bestImportRoom = room.bestImportRooms[resourceType]
					}
				}



				if (bestExportOrder && bestImportOrder && bestExportValue - bestImportValue > 0 && bestExportRoom != bestImportRoom) {
					let value = bestExportValue - bestImportValue;

					value -= (Game.market.calcTransactionCost(testAmount, bestExportRoom.name, bestImportRoom.name) * room.energyPrice) / testAmount;

					if (value > 0) {
						// Check for fishy business. I don't think there's ever a legit reason
						// to buy and sell the same resource. Sadly there's no way of checking room owner.
						if (bestImportOrder.roomName == bestExportOrder.roomName) {
							var roomPos = util.getRoomPos(bestImportOrder.roomName);
							if (roomPos.x % 10 != 0 || roomPos.y % 10 != 0) {
								console.log("FISHY BUSINESS DETECTED", bestImportOrder.roomName)
							}
							continue;
						}

						// Ok. We think there's a deal, let's figure out the best deal if we've not already done a full pass.
						/*if (!fullPass) {
							// Any future rooms should do a full pass to see if they can beat them
							// Past rooms are just going to miss it I guess.
							fullPass = true;
							for(var i=exportOrders.length-1; i >= 0; i--) {
								var order = exportOrders[i];
								if (order.amount > 100) {
									var transferEnergyCost = Game.market.calcTransactionCost(testAmount, room.name, order.roomName);
									// console.log(resourceType, order.price)

									var value = testAmount * order.price - transferEnergyCost * room.energyPrice;

									if (value > bestExportValue) {
										bestExportValue = value;
										bestExportOrder = order;
									}
								}
							}
							room.bestExportOrders[resourceType] = bestExportOrder
							room.bestExportValues[resourceType] = bestExportValue

							for(var i = importOrders.length-1; i >= 0; i--) {
								var order = importOrders[i];
								if (order.amount > 100) {
									var transferEnergyCost = Game.market.calcTransactionCost(testAmount, room.name, order.roomName);

									var value = testAmount * order.price + transferEnergyCost * room.energyPrice;

									if (value < bestImportValue) {
										bestImportValue = value;
										bestImportOrder = order;
									}
								}
							}
							room.bestImportOrders[resourceType] = bestImportOrder
							room.bestImportValues[resourceType] = bestImportValue
						}*/


						var highRisk = false
						var skip = false

						// Might have had bad experiences with this target. Don't know why.
						// Hit them with a keepalive signal of 1 unit. If they fail to buy that, it'll renew
						// them on the "bad experience" list.

						if (Memory.failedArbitrages[resourceType] && Memory.failedArbitrages[resourceType].length > 0) {
							for (var i = 0; i < Memory.failedArbitrages[resourceType].length; i++) {
								if (Memory.failedArbitrages[resourceType][i].r == bestExportOrder.roomName || Memory.failedArbitrages[resourceType][i].r == bestImportOrder.roomName) {
									if (highRisk) {
										skip = true
										break;
									}
									else {
										highRisk = true;
									}
								}
							}
						}

						// Two bad experiences. Pass!
						if (skip) {
							continue
						}

						var importOnly = false
						if (!bestExportRoom.terminal.store[resourceType]) {
							importOnly = true;
						}

						// Not interested any more
						if (importOnly) {
							continue
						}

						// Am I already using this exportOrder
						var alreadyUsed = false;
						for (var deal of currentDeals) {
							// console.log(deal, JSON.stringify(deal))
							if (deal.order.id == bestExportOrder.id || deal.order.id == bestImportOrder.id) {
								// console.log("Arbitrage deal already used")
								alreadyUsed = true;
								break;
							}
						}
						if (alreadyUsed) {
							continue
						}

						// Lets make some deals.
						var orderAmount = Math.min(bestExportOrder.amount, bestImportOrder.amount) - 1;
						var myAmount;
						// if (importOnly) {
						// 	myAmount = 1000 * credsPerEnergy / 0.05;
						// }
						// else {
							myAmount = Math.min(20000, bestExportRoom.terminal.store[resourceType], bestImportRoom.terminal.store[resourceType]);
						// }

						// Moderate our amount based on distance. A long distance trade is more likely to be taken by ninjas
						var distance = Math.max(Game.map.getRoomLinearDistance(bestExportRoom.name, bestExportOrder.roomName, true), Game.map.getRoomLinearDistance(bestImportRoom.name, bestExportOrder.roomName, true))

						// It's outside our local area attenuate the amount so that we're reducing the risk if we don't make the sale.
						// 15 is pretty arbitrary, as is the downscaling
						if (distance > 20) {
							myAmount *= (20 / distance) * (20 / distance)
						}


						// This will be set when we're not really happy with this deal due to failed previous buy.
						// I don't really know what the best way to handle this is. If nobody else steps up this
						// will fulfill large orders slowly. If somebody else jumps in and we're closer we lose out.
						if (highRisk) {
							myAmount = 10;
						}

						var amount = Math.round(Math.min(orderAmount, myAmount))
						var creditsCost = amount * bestImportOrder.price
						var energyCost = Game.market.calcTransactionCost(amount, bestImportRoom.name, bestImportOrder.roomName);
						if (!importOnly) {
							energyCost += Game.market.calcTransactionCost(amount, bestExportRoom.name, bestExportOrder.roomName)
						}

						// Never spend more than 10% of my credits on a buy order
						while (amount >= 10 && (energyCost > Math.min(bestImportRoom.terminal.store[RESOURCE_ENERGY], bestExportRoom.terminal.store[RESOURCE_ENERGY])  || creditsCost > 0.1 * global.creditLimit)) {
							amount = Math.round(0.9 * amount);
							creditsCost = amount * bestImportOrder.price
							energyCost = Game.market.calcTransactionCost(amount, bestImportRoom.name, bestImportOrder.roomName);
							if (!importOnly) {
								energyCost += Game.market.calcTransactionCost(amount, bestExportRoom.name, bestExportOrder.roomName)
							}
						}

						if (amount >= 10 && energyCost <= Math.min(bestImportRoom.terminal.store[RESOURCE_ENERGY], bestExportRoom.terminal.store[RESOURCE_ENERGY]) && creditsCost <= 0.1 * global.creditLimit) {
							var profit = 0;
							if (!importOnly) {
								profit += (bestExportOrder.price - bestImportOrder.price) * amount
								profit -= room.energyPrice * energyCost
							}

							// If we've reduced the amount rounding errors could kick in and make this a loss if profit was low.
							if (profit > 0) {
								bestImportRoom.marketTraded = true;
								bestExportRoom.marketTraded = true;
								arbDeals.push({importOnly : importOnly,
											importOrder: bestImportOrder,
											exportOrder: bestExportOrder,
											amount: amount,
											importRoomName: bestImportRoom.name,
											exportRoomName: bestExportRoom.name,
											profit: profit,
											energyPrice: room.energyPrice,
											energyCost: energyCost,
											energyCostImport: Game.market.calcTransactionCost(amount, bestImportRoom.name, bestImportOrder.roomName),
											energyCostExport: Game.market.calcTransactionCost(amount, bestExportRoom.name, bestExportOrder.roomName)
										})
							}
						}
					}
				}

				var maxProfit = -1;
				var bestDeal = -1;

				for (var deal of arbDeals) {
					if (deal.profit > maxProfit) {
						bestDeal = deal;
						maxProfit = deal.profit;
					}
				}

				if (maxProfit > 0) {
					var err1 = Game.market.deal(bestDeal.importOrder.id, bestDeal.amount, bestDeal.importRoomName)
					var err2 = Game.market.deal(bestDeal.exportOrder.id, bestDeal.amount, bestDeal.exportRoomName)
					if (err1 == OK && err1 == OK) {
						console.log("DEAL!", "I", bestDeal.importRoomName, "E", bestDeal.exportRoomName, "ARB:", bestDeal.amount, resourceType, "for", bestDeal.energyCost, "energy.",
									"Buying for:", bestDeal.importOrder.price, "Selling for:", bestDeal.exportOrder.price,
									"Cost: " + (bestDeal.energyPrice * bestDeal.energyCost).toPrecision(4), "Expected total profit: " + bestDeal.profit.toPrecision(4));

						Memory.checkArbitrageExports = Memory.checkArbitrageExports || []
						Memory.checkArbitrageImports = Memory.checkArbitrageImports || []

						// Memory.checkArbitrageExports.push({roomName : bestDeal.roomName, time : Game.time, order : bestDeal.exportOrder, amount: bestDeal.amount});
						// Memory.checkArbitrageImports.push({roomName : bestDeal.roomName, time : Game.time, order : bestDeal.importOrder, amount: bestDeal.amount});

						Memory.checkArbitrageExports.push({time: Game.time, order: bestDeal.exportOrder, amount: bestDeal.amount});
						Memory.checkArbitrageImports.push({time: Game.time, order: bestDeal.importOrder, amount: bestDeal.amount});


						// TODO: Get split of buy and sell energy. This is for both...
						// Memory.energyBuyBack.push({roomName : bestDeal.roomName, order: bestDeal.importOrder, energyPrice: (bestDeal.energyPrice / 1.05), energyUsagePerUnit: bestDeal.energyCostImport / bestDeal.amount})
						// Memory.energyBuyBack.push({roomName : bestDeal.roomName, order: bestDeal.exportOrder, energyPrice: (bestDeal.energyPrice / 1.05), energyUsagePerUnit: bestDeal.energyCostExport / bestDeal.amount})
					}
					// else {
					// 	console.log("Failed arbitrage... disabling " + err1 + " " + err2)
					// 	Memory.arbitrage = 0;
					// }

					// placeBuyOrder(RESOURCE_ENERGY, (bestDeal.energyPrice / 1.05), bestDeal.energyCost, bestDeal.roomName)
				}
				// All buy if they want to. May not be best solution
				else {
					for (let deal of arbDeals) {
						var err1 = Game.market.deal(deal.importOrder.id, deal.amount, deal.importRoomName)
						if (err1 == OK) {
							console.log("Buying supplies for ARB " +  deal.amount + " " + resourceType + " for " + deal.energyCost + " energy " + deal.importOrder.price * deal.amount + " credits")
						}
						// else {
						// 	console.log("Failed arbitrage... disabling " + err1)
						// 	Memory.arbitrage = 0;
						// }
					}
				}

				// var e2 = Game.cpu.getUsed()
				// console.log(roomName, resourceType, e2 - s2)
				// analTime += e2 - s2

			}
		}
		// console.log(loadTime, analTime)

		currentDeals = currentDeals.concat(arbDeals)

		return currentDeals;
	},

	// We're sitting on an overvalued sale. Try to trick
	// people by putting an overvalued buy order in.
	exploitTryOvervaluedBuyPush: function() {
		Memory.marketExploit = Memory.marketExploit || {};
		Memory.marketExploit.tick = Memory.marketExploit.tick || 0;
		Memory.marketExploit.exploitRefreshTime = Memory.marketExploit.exploitRefreshTime || 100;

		if (!Memory.marketExploit.resource || !Memory.marketExploit.roomName || !Memory.marketExploit.price) {
			return;
		}

		// Every time we try 4x the refresh rate. If we pass, reset it.
		if (Game.time - Memory.marketExploit.tick > Memory.marketExploit.exploitRefreshTime) {
			Memory.marketExploit.tick = Math.ceil((Game.time + 20) / 100) * 100;
			Memory.marketExploit.exploitRefreshTime *= 4;
		}

		let exploitResource = Memory.marketExploit.resource
		let exploitRoom = Memory.marketExploit.roomName
		let exploitAmount = 100;
		let exploitBuyPrice = Math.round(Memory.marketExploit.price * 1.1 * 1000) / 1000;
		let exploitTime = Memory.marketExploit.tick;

   		if (Game.time >= exploitTime - 10 && Game.time <= exploitTime + 10) {
   			console.log("Market exploit in...", exploitTime - Game.time)
   			console.log(exploitResource, exploitRoom, exploitBuyPrice)
   		}

		if (Game.time == Memory.marketExploit.tick) {
			Game.market.createOrder(ORDER_BUY, exploitResource, exploitBuyPrice, exploitAmount, exploitRoom);
		}
		else if (Game.time > exploitTime && Game.time < exploitTime + 10) {
			let orders = Game.market.getAllOrders({type: ORDER_BUY, resourceType: exploitResource});
			for(var i=0; i < orders.length; i++) {
				var order = orders[i];
				if (order.type == ORDER_BUY && order.resourceType == exploitResource && order.roomName == exploitRoom && order.amount == exploitAmount && order.price == exploitBuyPrice) {
					Game.market.cancelOrder(order.id);
					Game.market.deal(order.id, exploitAmount, exploitRoom);
				}
			}
		}

		let passed = false;
		for(var j = 0; j < Game.market.outgoingTransactions.length; j++) {
			var transaction = Game.market.outgoingTransactions[j];
			if (transaction.resourceType == exploitResource && transaction.from == exploitRoom && transaction.order.type == ORDER_SELL && transaction.time < Memory.marketExploit.tick + 5 && transaction.amount > 50) {
				passed = true;
				break;
			}
		}

		// Good job!
		if (passed) {
			console.log("Market exploit passed!", Game.time)
			Memory.marketExploit.exploitRefreshTime = 100;
			delete Memory.marketExploit.tick;
		}
	},


	exploitOverValuedResources: function() {
		if (global.creditLimit <= 10000 || Memory.botArena) return;

		// let room = _.sample(Game.myRooms);

		// if (room.terminal && room.storage && room.terminal.my && room.terminal.isActive()) {
		// 	for (let resourceType of RESOURCES_ALL) {
		// 		// Only try with compounds.
		// 		if (RECIPES[resourceType] && room.terminal.store[resourceType] >= 500) {
		// 			if (room.mem.importValues[resourceType] && /*room.mem.exportValues[resourceType] != 0 &&*/ room.mem.importValues[resourceType] > 10 * room.mem.exportValues[resourceType]) {
		// 				let targetPrice = room.mem.importValues[resourceType] * .75;

		// 				// It costs me less than half of the target price to make
		// 				if (this.getMyMineralBaseComponentsCost(room, resourceType) * (1 + 0.1 * global.creditLimit / 0.1e6) < targetPrice / 2) {
		// 					// Oooh. Are we doing it already?
		// 					let doingItAlready = false;
		// 					let doingItAlreadyInThisRoom = false;
		// 					let myCurrentPrice = 0;
		// 					let myCurrentAmount = 0;
		// 					let myCurrentOrder = 0;
		// 					var currentPositions = Game.market.orders;
		// 					for (var orderId in currentPositions) {
		// 						var order = currentPositions[orderId]
		// 						if (order.resourceType == resourceType && order.type == ORDER_SELL && order.remainingAmount >= 50) {
		// 							myCurrentPrice = order.price;
		// 							myCurrentAmount = order.amount;
		// 							myCurrentOrder = order;
		// 							doingItAlready = true;
		// 							if (order.roomName == room.name) {
		// 								doingItAlreadyInThisRoom = true;
		// 							}
		// 							break;
		// 						}
		// 					}
		// 					if (!doingItAlready) {
		// 						// Nope, lets stick our price in and see what happens.
		// 						if (Object.keys(Game.market.orders).length < MARKET_MAX_ORDERS - 10) {
		// 							let ret = Game.market.createOrder(ORDER_SELL, resourceType, targetPrice, Math.min(1000, room.terminal.store[resourceType]), room.name);
		// 						}
		// 					}
		// 					else if (doingItAlreadyInThisRoom) {
		// 						// We're not the best deal. Cut the price.
		// 						if (myCurrentPrice > room.mem.importValues[resourceType]) {
		// 							let targetPrice = myCurrentPrice * 0.9;
		// 							if (this.getMyMineralBaseComponentsCost(room, resourceType) < targetPrice / 2) {
		// 								Game.market.changeOrderPrice(order.id, targetPrice);
		// 							}
		// 						}
		// 					}
		// 					else if (myCurrentAmount >= 100 && Math.random() < 0.1) {
		// 						Memory.marketExploit = Memory.marketExploit || {};

		// 						Memory.marketExploit.resource = resourceType;
		// 						Memory.marketExploit.roomName = room.name; // This isn't neccessarily the same room as my current order.
		// 						Memory.marketExploit.price = myCurrentPrice;
		// 					}
		// 				}
		// 			}
		// 		}
		// 	}
		// }
	},

	runIntershardTrading: function(marketData) {
		if (Game.time % 503 != 0 && !Memory.debugIntershardTrading) return

		if (Memory.botArena) return

		if (Memory.disableIntershardTrading2) {
			console.log("Intershard trading properly disabled")
			delete Memory.debugIntershardTrading
			return
		}

		let buyToMoveResources = {}
		global.marketBuyToMove = {}

		Memory.stats.lastInterShardTradeInfo = Memory.stats.lastInterShardTradeInfo || {}

		// TODO: Check portal room dangers

		const profitMargin = 1.25;
		const profitMarginNoAmountDiff = 2;
		const amountMargin = 2;


		let localMem = interShardMemoryManager.getMem(Game.shard.name)

		if (localMem.avgBucket < 2000) return

		let resetTradeRoutes = false

		for (let shard of global.activeShards) {
			if (shard == Game.shard.name) {
				continue
			}

			let shardMem = interShardMemoryManager.getMem(shard)

			if (shardMem.avgBucket < 2000) {
				continue
			}
			if (Date.now() - shardMem.wallClock > 20 * 60 * 1000) {
				continue
			}

			let avgEnergyPrice = Math.max(localMem.energyPrice, shardMem.energyPrice)

			let transporterCost = avgEnergyPrice * (3000 + 300 * global.INTENT_CPU_COST * Memory.stats.yieldPerCPU) / 1250

			let transfers = [];

			for (let resourceName in localMem.avgEValues) {
				// This assumes max factory level is 5. It also assumes I only want to intershard level 5s.
				// The former could be done properly fairly easily
				// The latter is a bit trickier. 
				// if (COMMODITIES[resourceName] && COMMODITIES[resourceName].level && COMMODITIES[resourceName].level != 5) {
				// 	continue
				// }

				if (Memory.stats.lastInterShardTradeInfo[resourceName]) {
					if (Memory.stats.lastInterShardTradeInfo[resourceName].t == Game.time) {
						continue
					}
					if (Memory.stats.lastInterShardTradeInfo[resourceName].b && Game.time - (Memory.stats.lastInterShardTradeInfo[resourceName].t || 0) < 1500) {
						continue
					}
				}

				let myVal = localMem.avgEValues[resourceName]
				let otherVal = shardMem.avgEValues[resourceName]

				let myAvgAmount = (localMem.globalResources[resourceName] || 0) / Game.myRooms.length
				let otherAvgAmount = (shardMem.globalResources[resourceName] || 0) / Object.keys(shardMem.myRooms).length


				// console.log(resourceName, myAvgAmount, otherAvgAmount, localMem.avgEValues[resourceName], shardMem.avgEValues[resourceName], localMem.avgIValues[resourceName], shardMem.avgIValues[resourceName])

				// We have more
				if (myAvgAmount > amountMargin * otherAvgAmount) {					
					// But they can sell it for more. EE
					if (shardMem.avgEValues[resourceName] > profitMargin * (localMem.avgEValues[resourceName] + transporterCost)) {
						console.log("M1 Could intershard", resourceName, "from", Game.shard.name, "to", shard, localMem.avgEValues[resourceName], shardMem.avgEValues[resourceName], transporterCost)
						transfers.push({resource: resourceName, from: Game.shard.name, to: shard})
					}

					// They can't buy it cheaply. IE
					if (shardMem.avgIValues[resourceName] > profitMargin * (localMem.avgEValues[resourceName] + transporterCost)) {
						console.log("M2 Could intershard", resourceName, "from", Game.shard.name, "to", shard, localMem.avgEValues[resourceName], shardMem.avgIValues[resourceName], transporterCost)
						transfers.push({resource: resourceName, from: Game.shard.name, to: shard})
					}

				}
				// They have more
				else if (otherAvgAmount > amountMargin * myAvgAmount) {					
					// But we can sell it for more. EE
					if (localMem.avgEValues[resourceName] > profitMargin * (shardMem.avgEValues[resourceName] + transporterCost)) {
						console.log("L1 Could intershard", resourceName, "from", shard, "to", Game.shard.name, shardMem.avgEValues[resourceName], localMem.avgEValues[resourceName], transporterCost)
						transfers.push({resource: resourceName, from: shard, to: Game.shard.name})
					}

					// We can't buy it cheaply. IE
					if (localMem.avgIValues[resourceName] > profitMargin * (shardMem.avgEValues[resourceName] + transporterCost)) {
						console.log("L2 Could intershard", resourceName, "from", Game.shard.name, "to", shard, shardMem.avgEValues[resourceName], localMem.avgIValues[resourceName], transporterCost)
						transfers.push({resource: resourceName, from: shard, to: Game.shard.name})
					}
				}
				// About the same in each shard. Buy it in the cheaper shard. Not for commodities. This kinda assumes we need everything
				else if ((!COMMODITIES[resourceName] || !COMMODITIES[resourceName].level) && (myAvgAmount || otherAvgAmount)) {
					// Costs me more to buy it than them
					if (localMem.avgIValues[resourceName] > profitMarginNoAmountDiff * (shardMem.avgIValues[resourceName] + transporterCost)) {
						console.log("S1 Could intershard", resourceName, "from", shard, "to", Game.shard.name, shardMem.avgIValues[resourceName], localMem.avgEValues[resourceName], transporterCost)
						transfers.push({resource: resourceName, from: shard, to: Game.shard.name})
					}
					// Costs them more to buy it than me
					if (shardMem.avgIValues[resourceName] > profitMarginNoAmountDiff * (localMem.avgIValues[resourceName] + transporterCost)) {
						console.log("S2 Could intershard", resourceName, "from", Game.shard.name, "to", shard, localMem.avgIValues[resourceName], shardMem.avgIValues[resourceName], transporterCost)
						transfers.push({resource: resourceName, from: Game.shard.name, to: shard})
						if (otherAvgAmount < constants.MARKET_INTERSHARD_BUY_TO_MOVE) {
							let otherNumRooms = Object.keys(shardMem.myRooms).length;
							let myNumRooms = Game.myRooms.length

							buyToMoveResources[resourceName] = {amount: (constants.MARKET_INTERSHARD_BUY_TO_MOVE - otherAvgAmount), margin: shardMem.avgIValues[resourceName] / (profitMarginNoAmountDiff * (localMem.avgIValues[resourceName] + transporterCost))}
						}
					}
				}

				// This is really buy-to-sell not by-to-move. I guess maybe it's both? The buy to move won't capture if we have a lot
				// and we only trigger it if we don't have enough
				if (!buyToMoveResources[resourceName]) {					
					if (shardMem.avgIValues[resourceName] > profitMarginNoAmountDiff * (localMem.avgEValues[resourceName] + transporterCost) && 
						otherAvgAmount < constants.MARKET_INTERSHARD_BUY_TO_MOVE && 
						(!COMMODITIES[resourceName] || !COMMODITIES[resourceName].level)) {
						let otherNumRooms = Object.keys(shardMem.myRooms).length;
						let myNumRooms = Game.myRooms.length

						buyToMoveResources[resourceName] = {amount: (constants.MARKET_INTERSHARD_BUY_TO_MOVE - otherAvgAmount), margin: shardMem.avgIValues[resourceName] / (profitMarginNoAmountDiff * (localMem.avgEValues[resourceName] + transporterCost))}
					}
				}

			}

			// Find a way to do the transfer
			if (transfers.length) {
				let myValidRooms = [];
				let remoteValidRooms;

				if (!resetTradeRoutes) {
					localMem.tradeRoutes = []
					resetTradeRoutes = true
				}

				let bestSourceRoom
				let bestSourceRoomDist = Infinity

				for (let room of Game.myRooms) {
					if (!room.terminal || !room.storage || !room.factory || room.defcon < 5) continue

					if (room.storage.store.getFreeCapacity() < 100000) {
						continue
					}
					if (room.terminal.store.getFreeCapacity() < 50000) {
						continue
					}

					for (let portalRoomName of Memory.knownIntershardPortalRoomNames) {
						let tradeRouteRoomName;
						if (!Memory.rooms[portalRoomName]) continue
						if ((Memory.rooms[portalRoomName].DT || 1) > 1) continue
						if (Game.map.getRoomLinearDistance(portalRoomName, room.name) > 4) continue
						if (safeRoute.getSafeRouteCost(portalRoomName, room.name, false, false, 4) > 4) continue
					
						for (let foreignRoomName in shardMem.myRooms) {
							if (shardMem.myRooms[foreignRoomName].el < 7 || shardMem.myRooms[foreignRoomName].d < 5) continue

							for (let dest of Memory.rooms[portalRoomName].portalDests) {
								if (dest.shard == shard) {
									if (Game.map.getRoomLinearDistance(foreignRoomName, dest.room) > 4) continue

									myValidRooms.push(room)
									tradeRouteRoomName = foreignRoomName;
									break;
								}
							}						
							if (tradeRouteRoomName) {						
								room.mem.intershardStoreInfoRequested = Game.time
								localMem.tradeRoutes.push(Game.shard.name + "-" + shard + "-" + room.name + "-" + tradeRouteRoomName + "-" + portalRoomName)
								tradeRouteRoomName = undefined
							}
						}

					}

				}

				for (let route of _.shuffle(localMem.tradeRoutes)) {
					let splitResult = route.split("-");
					let localShard = splitResult[0]
					let foreignShard = splitResult[1]
					let localRoom = splitResult[2]
					let foreignRoom = splitResult[3]
					let portalRoomName = splitResult[4]

					console.log("Trade route", "local", localRoom, "foreign", foreignShard, foreignRoom, "using", portalRoomName, 
								(shardMem.tradeRoutes || []).includes(route), 
								(shardMem.tradeRoutes || []).includes(foreignShard + "-" + localShard + "-" + foreignRoom + "-" + localRoom + "-" + portalRoomName))

					if (!(shardMem.tradeRoutes || []).includes(route) && !(shardMem.tradeRoutes || []).includes(foreignShard + "-" + localShard + "-" + foreignRoom + "-" + localRoom + "-" + portalRoomName)) continue
					if (!shardMem.myRooms[foreignRoom].resources) continue
					if (Memory.rooms[localRoom].spawnUtilization > 0.85) continue
					if (missionInfo.isRoomSpawningMission(localRoom, false)) continue

					// I think we have a trade route!
					for (let transfer of _.shuffle(transfers)) {
						// console.log("Test", JSON.stringify(transfer), Game.shard.name)
						if (transfer.from != Game.shard.name) continue


						if (Memory.stats.lastInterShardTradeInfo[transfer.resource]) {
							if (Memory.stats.lastInterShardTradeInfo[transfer.resource].t == Game.time) {
								continue
							}
							if (Memory.stats.lastInterShardTradeInfo[transfer.resource].b && Game.time - (Memory.stats.lastInterShardTradeInfo[transfer.resource].t || 0) < 1500) {
								continue
							}
						}

						console.log("I want to transport", transfer.resource, "from", localRoom, transfer.from, "to", foreignRoom, transfer.to, Memory.stats.globalResources[transfer.resource])


						let isCommodity = COMMODITIES[transfer.resource] && COMMODITIES[transfer.resource].level

						if (Memory.stats.globalResources[transfer.resource] > (REACTIONS[transfer.resource] ? 10000 : 1000) * Game.myRooms.length || 
							(isCommodity && Memory.stats.globalResources[transfer.resource] > 250 / COMMODITIES[transfer.resource].level)) {
							// Do it then.
							// Lock the room

							let level = Math.log10(10 * profitMargin * localMem.avgEValues[transfer.resource] / avgEnergyPrice) - 1

							let retVal = creepCreator.createHeavyTransport(Game.rooms[localRoom], level)

							// retVal.boosts = {};
							if (Memory.disableIntershardTrading) {
								console.log("Was about to intershard trade but Memory.disableIntershardTrading is set")
								delete Memory.debugIntershardTrading
								return	
							} 

							if (retVal.body.length) {
								Memory.rooms[localRoom].intershardTradeTick = Game.time;

								let numCarry = 0
								for (let part of retVal.body) {
									if (part == CARRY) numCarry++
								}

								let maxFractionOfGlobal = (isCommodity ? 0.5 : 0.25)

								// if (Memory.commoditiesManager.maxFactoryLevel == 0) {
								// 	maxFractionOfGlobal *= 2
								// }

								let maxCreeps = Math.floor(Memory.stats.globalResources[transfer.resource] * maxFractionOfGlobal / (numCarry * CARRY_CAPACITY))


								if (maxCreeps) {
									let current = Game.rooms[localRoom].getCurrentOfResource(transfer.resource)

									if (current < numCarry * CARRY_CAPACITY) {
										for (let otherRoom of Game.myRooms) {
											if (otherRoom.terminal && 
											   !otherRoom.terminal.cooldown && 
											   Game.time - (otherRoom.intershardTradeTick || 0) > 1500 && 
											   otherRoom.terminal.store.getUsedCapacity(transfer.resource) >= numCarry * CARRY_CAPACITY - current) {
												let ret = otherRoom.terminal.send(transfer.resource, numCarry * CARRY_CAPACITY - current, localRoom)	
												if (ret == OK) {
													console.log(otherRoom, "sending more so we can be more full")
													current = numCarry * CARRY_CAPACITY
													break;
												}
											}
										}
									}

									let numCreeps = Math.min((isCommodity ? 1 : 3), maxCreeps, Math.floor(current / (numCarry * CARRY_CAPACITY)))
									// let myAvgAmount = (Memory.stats.globalResources.globalResources[resourceName] || 0) / Game.myRooms.length
									// numCreeps = Math.min(numCreeps, Math.max(1, Math.floor(myAvgAmount / (numCarry * CARRY_CAPACITY))))

									if (numCreeps) {
										console.log("Building", numCreeps, "isHeavyTransport(s) at level", level)
										let spawn = Game.rooms[localRoom].find(FIND_MY_SPAWNS)[0];
										for (let i = 0; i < numCreeps; i++) {
											let name = "i" + Game.time + "_" + Memory.creepCount  + "_" +  Math.floor(Math.random() * 10000)
											spawn.addPrioritySpawn("isHeavyTransport", {targetRoom: foreignRoom, shardTarget: transfer.to, targetBoosts: retVal.boosts, resource: transfer.resource, portalTargetRoom: portalRoomName}, name, retVal.body)
											Memory.creepCount++
										}

										let myAvgAmount = (localMem.globalResources[transfer.resource] || 0) / Game.myRooms.length
										let otherAvgAmount = (shardMem.globalResources[transfer.resource] || 0) / Object.keys(shardMem.myRooms).length

										myAvgAmount -= (numCreeps * numCarry * CARRY_CAPACITY) / Game.myRooms.length
										otherAvgAmount += (numCreeps * numCarry * CARRY_CAPACITY) / Object.keys(shardMem.myRooms).length

										// Don't block if we've still got plenty.
										if (myAvgAmount > amountMargin * otherAvgAmount) {
											Memory.stats.lastInterShardTradeInfo[transfer.resource] = {t: Game.time, b: 0}
										}
										else {											
											Memory.stats.lastInterShardTradeInfo[transfer.resource] = {t: Game.time, b: 1}
										}

										delete Memory.debugIntershardTrading
										// return
									}
									else {
										console.log("not enough locally to spawn", current, numCarry * CARRY_CAPACITY)
									}
								}
								else {
									if (buyToMoveResources[transfer.resource]) {
										global.marketBuyToMove[localRoom] = global.marketBuyToMove[localRoom] || {}
										global.marketBuyToMove[localRoom][transfer.resource] = {amount: buyToMoveResources[transfer.resource].amount, margin: buyToMoveResources[transfer.resource].margin}
										console.log("not enough globally to spawn", Memory.stats.globalResources[transfer.resource], (isCommodity ? 2 : 4) * numCarry * CARRY_CAPACITY, "buying more")
									}
									else {
										console.log("not enough globally to spawn", Memory.stats.globalResources[transfer.resource], (isCommodity ? 2 : 4) * numCarry * CARRY_CAPACITY)
									}

								}

							}
							else {
								console.log("No body for level", level)
							}
						}
						else {
							if (buyToMoveResources[transfer.resource]) {
								global.marketBuyToMove[localRoom] = global.marketBuyToMove[localRoom] || {}
								global.marketBuyToMove[localRoom][transfer.resource] = {amount: buyToMoveResources[transfer.resource].amount, margin: buyToMoveResources[transfer.resource].margin}
								console.log("But I don't have enough", Memory.stats.globalResources[transfer.resource], "buying more")
							}
							else {
								console.log("But I don't have enough", Memory.stats.globalResources[transfer.resource])
							}

						}
					}
				}



				interShardMemoryManager.touchLocal();
			}
		}


		delete Memory.debugIntershardTrading
	},


	handleExports: function(marketData) {
		let privateServer = Memory.privateServer && false;

	   	for (let room of _.shuffle(Game.myRooms)) {
			if (!room.terminal || room.terminal.cooldown || room.transferred) continue;
			if (room.effectiveLevel < 8) continue
			if (!room.storage) continue;
			let energy = room.terminal.store[RESOURCE_ENERGY] + room.storage.store[RESOURCE_ENERGY];
			if (global.moddedCreditLimit > constants.MARKET_SELL_ENERGY_CREDIT_MAX && energy < constants.ROOM_ENERGY_SELL_TO_MARKET_2) continue
			if (energy < constants.ROOM_ENERGY_SELL_TO_MARKET) continue;

			let allOrders = Game.market.getAllOrders({type: ORDER_BUY, resourceType: RESOURCE_ENERGY});

			var bestValue = 0;
			var bestOrder;

			for (let order of allOrders) {
				if (order.amount < 100) continue;
				let value = order.price
				if (value < bestValue) continue;
				let transferEnergy = Game.market.calcTransactionCost(1000, room.name, order.roomName) / 1000
				value /= (1 + transferEnergy);
				if (value < bestValue) continue;

				if (Memory.rooms[order.roomName] && Memory.rooms[order.roomName].owner) {
					value /= 1 + 100 * intelAI.getHatePercentage(Memory.rooms[order.roomName].owner)
				}

				if (value > bestValue) {
					bestValue = value;
					bestOrder = order;
				}
			}

			let mineralCost = getAvgMineralCost(room)


			if (bestValue > mineralCost * constants.MARKET_SELL_ENERGY_MINERAL_RATIO || energy > constants.ROOM_ENERGY_SELL_TO_MARKET_2) {
				let amount = Math.min(bestOrder.amount, energy - constants.ROOM_ENERGY_SELL_TO_MARKET, room.terminal.store[RESOURCE_ENERGY] / 2);

				// console.log(bestValue, mineralCost, "sell", amount, "to", JSON.stringify(bestOrder));
				// break;
				let ret = Game.market.deal(bestOrder.id, amount, room.name);
			}
		}

		let level0Commodities = util.getCommoditiesForLevel(0);


	   	for (let room of _.shuffle(Game.myRooms)) {
	   		// Don't sell while intersharding.
			if (!room.terminal || room.terminal.cooldown || room.transferred || !room.excessResources || (Game.time - (room.mem.intershardTradeTick || 0)) < 1500) continue;
			for (let resourceType in room.excessResources) {

				if (resourceType == RESOURCE_ENERGY) continue


				// Sell!
				if ((room.excessResources[resourceType] || 0) > 0) {
					calcRoomEnergyPrice(room)

					let isLevel0Commoditiy = level0Commodities.includes(resourceType)

					// Match
					// Excess check is EXCESS. If it's a target mineral I already horde a lot.
					if (!room.transferred && (global.creditLimit < 6000 || room.excessResources[resourceType] > (4000 - 500 * Memory.saleLevel) || (COMMODITIES[resourceType] && (COMMODITIES[resourceType].level || isLevel0Commoditiy)))) {
						room.storedEnergy = room.getStoredEnergy();
						if (room.storedEnergy > 10000) {
							if (COMMODITIES[resourceType] && (COMMODITIES[resourceType].level || isLevel0Commoditiy)) {
								let sellAnyway = false;
								// if (resourceType == RESOURCE_COMPOSITE || resourceType == RESOURCE_CRYSTAL || resourceType == RESOURCE_LIQUID) {
									let noProfitLimit
									if (resourceType == RESOURCE_COMPOSITE && Memory.commoditiesManager.maxFactoryLevel < 2) {
										sellAnyway = true
									}
									else if (resourceType == RESOURCE_CRYSTAL && Memory.commoditiesManager.maxFactoryLevel < 5) {
										sellAnyway = true
									}
									else if (resourceType == RESOURCE_LIQUID && Memory.commoditiesManager.maxFactoryLevel < 4) {
										sellAnyway = true
									}
									else if (Memory.commoditiesManager.maxFactoryLevel == 0) {
										sellAnyway = true
									}
									else {
										noProfitLimit = 16384 / (COMMODITIES[resourceType].level || 1) // 2048
									}

									if (!sellAnyway) {
										let myCurrentAmount = room.getCurrentOfResource(resourceType)
										if (noProfitLimit && myCurrentAmount > noProfitLimit) {										
											room.excessResources[resourceType] = myCurrentAmount - noProfitLimit
											sellAnyway = true
										}
									}
								// }


								if (sellAnyway || isLevel0Commoditiy || this.getBestCommoditityInChain(room, resourceType) == resourceType || (COMMODITIES[resourceType].level && COMMODITIES[resourceType].level > Memory.commoditiesManager.maxFactoryLevel)) {
									var bestValue = 0;
									var bestOrder;

									// Match buy order
									let amount = Math.min(room.terminal.store[resourceType], room.excessResources[resourceType]);
									let allOrders = Game.market.getAllOrders({type: ORDER_BUY, resourceType: resourceType});

									var bestValue = 0;
									var bestOrder;

									let minPrice = -Infinity;
									let maxPrice = Infinity

									let NPCOrders = 0

									for (let order of allOrders) {
										// We can get to the stage where the energy price can't be discovered due to lack of cash
										// In this case assume energy is no more expensive than a mineral
										let energyPrice;
										if (room.energyPrice == Infinity) {
											energyPrice = order.price;
										}
										else {
											energyPrice = room.energyPrice
										}

										if (util.isNPCTerminalRoom(order.roomName)) {
											NPCOrders++;
											if (order.price > minPrice) {
												minPrice = order.price
											}
											if (order.price < maxPrice) {
												maxPrice = order.price
											}
										}

										let value = order.price - energyPrice * Game.market.calcTransactionCost(100, room.name, order.roomName) / 100;
										value *= (1 + 0.025 * Memory.saleLevel);

										// Just a little nudge so we get the largest order of a given type
										value += order.amount * 1.e-15;

										if (value > bestValue) {
											bestValue = value;
											bestOrder = order;
										}
									}

									if (!bestOrder) continue

									let stocksTooHigh = Memory.stats.globalResources[resourceType] / Game.myRooms.length > 500 / ((COMMODITIES[resourceType].level || 1) * (COMMODITIES[resourceType].level || 1))

									// I don't know exactly what to do here. Trouble seems to be I get too many lower tier commodities as they tend to have very low NPC order quantity
									// if (global.creditLimit > 10e6 && (COMMODITIES[resourceType].level == Memory.commoditiesManager.maxFactoryLevel || !util.isNPCTerminalRoom(bestOrder.roomName))) {
									if (global.moddedCreditLimit > 10e6 && !stocksTooHigh/*&& (COMMODITIES[resourceType].level == Memory.commoditiesManager.maxFactoryLevel || !util.isNPCTerminalRoom(bestOrder.roomName))*/) {
										let history = Game.market.getHistory(resourceType)
										if (history.length && (bestOrder.price < history[history.length - 1].avgPrice || (history.length > 1 && bestOrder.price < history[history.length - 2].avgPrice))) {
											if (Math.random() < 0.01) {
												console.log("Not selling", resourceType, "as price lower than history last")
											}
											continue;
										}
									}

									// Don't sell commodities if all NPCs have the same price. If one goes up we want to take that. If one goes down we want to sell before the rest do
									// but there's no point in selling if they may go up.
									if (NPCOrders && (allOrders.length == 1 || minPrice != maxPrice) || Memory.privateServer) {
										amount = Math.min(bestOrder.amount, amount);
										if (Game.market.calcTransactionCost(amount, room.name, bestOrder.roomName) <= room.terminal.store[RESOURCE_ENERGY]) {
											let ret = Game.market.deal(bestOrder.id, amount, room.name);
											room.transferred = true;
											// console.log("DEAL C", ret, JSON.stringify(bestOrder), amount, room.name, Game.market.calcTransactionCost(amount, room.name, bestOrder.roomName))
											break;
										}
									}
								}
							}
							else {
								let currentOrders = Game.market.orders;
								let isAllowed = room.excessResources[resourceType] > (16000 - 2000 * Memory.saleLevel)

								// Extend
								if (!isAllowed) {
									isAllowed = true
									for (let orderId of Object.keys(currentOrders)) {
										let order = currentOrders[orderId];
										if (order.resourceType == resourceType && order.type == ORDER_SELL) {
											if (order.roomName == room.name) {
												isAllowed = false;
												break;
											}
										}
									}
								}

								if (isAllowed) {
									// Match buy order
									let amount = Math.min(room.terminal.store[resourceType], room.excessResources[resourceType]);
									if (amount) {
										let allOrders = Game.market.getAllOrders({type: ORDER_BUY, resourceType: resourceType});

										let bestValue = 0;
										let bestOrder;

										let excessModifier = 1 + room.excessResources[resourceType] / 1000000

										if (room.storage.store.getFreeCapacity() == 0) {
											excessModifier *= 2
										}


										for (let order of allOrders) {
											if (order.amount >= 100) {
												// We can get to the stage where the energy price can't be discovered due to lack of cash
												// In this case assume energy is no more expensive than the mineral
												let energyPrice;
												if (room.energyPrice == Infinity) {
													energyPrice = order.price;
												}
												else {
													energyPrice = room.energyPrice
												}

												let value = order.price - energyPrice * Game.market.calcTransactionCost(100, room.name, order.roomName) / 100;
												if (Memory.botArena && util.isNPCTerminalRoom(order.roomName)) {
													value *= 1.25;
												}

												// value *= (1 + 0.025 * Memory.saleLevel);

												// Just a little nudge so we get the largest order of a given type
												value += order.amount * 1.e-15;


												if (resourceType == RESOURCE_POWER && 
													room.excessResources[resourceType] < 100000 &&
													value < Math.max(global.moddedCreditLimit / 10e6, 1) * (12 - Memory.saleLevel) * room.energyPrice / excessModifier) {
													continue;
												}

												if (value > bestValue) {
													bestValue = value;
													bestOrder = order;
												}
											}
										}

										bestValue *= (1 + 0.025 * Memory.saleLevel);

										if (room.excessResources[resourceType] > 16000) {
											bestValue *= 1 + (room.excessResources[resourceType] - 16000) / 100000
										}


										let basePrice;

										basePrice = this.getMyMineralBaseComponentsCost(room, resourceType);
										basePrice = basePrice / excessModifier;



										if (resourceType == RESOURCE_POWER) {
											basePrice = Math.max(global.moddedCreditLimit / 20e6, 1) * (12 - Memory.saleLevel) * room.energyPrice / excessModifier;
										}
										else if (util.isDepositResource(resourceType)) {
											// Hack. Price we're basing it off is a bit low probably.
											basePrice *= 1.2
										}


										// 33% profit if we have no spares. Drops as we get more spare

										if (bestOrder && (bestValue > basePrice * 0.75 || 
														  room.getCurrentOfResource(resourceType) > 250000 || 
														  (room.storage && _.sum(room.storage.store) >= 0.98 * STORAGE_CAPACITY) || 
														  (room.terminal && _.sum(room.terminal.store) >= 0.98 * TERMINAL_CAPACITY) || 
														  (Memory.botArena && util.isNPCTerminalRoom(bestOrder.roomName)))) {
											console.log("deal?", JSON.stringify(bestOrder), amount, resourceType, room.name)
											amount = Math.min(bestOrder.amount, amount);
											if (Game.market.calcTransactionCost(amount, room.name, bestOrder.roomName) <= room.terminal.store[RESOURCE_ENERGY]) {
												let ret = Game.market.deal(bestOrder.id, amount, room.name);
												room.transferred = true;
												if (ret == OK) {
													return;
												}
												else {
													console.log("deal fail", ret, JSON.stringify(bestOrder), amount, resourceType, room.name)
													break;
												}
											}
										}
									}

								}
							}

						}
					}
					// Place
					if ((global.creditLimit >= 2000 || room.clearTerminal) && (!COMMODITIES[resourceType] || (!COMMODITIES[resourceType].level && !isLevel0Commoditiy))) {
						let amount = room.excessResources[resourceType];


						if (amount < 10000) continue;

						amount = Math.min(amount, 5000)

						let currentOrders = Game.market.orders;
						let existing;
						let otherRoomExisting = false;

						// Extend
						for (let orderId of Object.keys(currentOrders)) {
							let order = currentOrders[orderId];
							if (order.resourceType == resourceType && order.type == ORDER_SELL) {
								if (order.roomName == room.name) {
									existing = order;
									// Game time modulo as I suspect some of these values may need a few ticks to update? I'm getting
									// mysteriously overextended orders.
									if (order.remainingAmount < amount && order.remainingAmount < order.totalAmount && Game.time % 100 == 78) {
										// room.resourceCensus();
										if (room.getCurrentOfResource(resourceType) >= amount - order.remainingAmount) {
											// let ret = Game.market.extendOrder(order.id, amount - order.remainingAmount)
										}
										// console.log("Extend", ret, JSON.stringify(order), amount - order.remainingAmount)
									}
									break;
								}
								else {
									// Don't compete against myself. I run out of orders.
									otherRoomExisting = true;
									break;
								}
							}
						}

						if (otherRoomExisting) {
							continue;
						}

						// Price check.
						let exportOrders;
						let importOrders;

						marketData.exportOrders = marketData.exportOrders || {};
						marketData.importOrders = marketData.importOrders || {};

						if (marketData.exportOrders[resourceType] && marketData.importOrders[resourceType]) {
							exportOrders = marketData.exportOrders[resourceType];
							importOrders = marketData.importOrders[resourceType];
						}
						else {
							if (!privateServer) {
								let orders = _.groupBy(Game.market.getAllOrders({resourceType: resourceType}), "type");
								exportOrders = orders[ORDER_BUY] || [];
								importOrders = orders[ORDER_SELL] || [];
							}
							else {
								exportOrders = _.filter(allOrders[resourceType], o => o.type == ORDER_BUY);
								importOrders = _.filter(allOrders[resourceType], o => o.type == ORDER_SELL);
							}
							marketData.exportOrders[resourceType] = exportOrders;
							marketData.importOrders[resourceType] = importOrders;
						}

						room.bestExportOrders = room.bestExportOrders || {}
						room.bestExportValues = room.bestExportValues || {}
						room.bestExportRooms = room.bestExportRooms || {}

						room.bestImportOrders = room.bestImportOrders || {}
						room.bestImportValues = room.bestImportValues || {}
						room.bestImportRooms = room.bestImportRooms || {}

						let bestExportValue = 0;
						let bestExportOrder = null;
						let bestExportRoom;

						let bestImportValue = Infinity;
						let bestImportOrder = null;
						let bestImportRoom;

						if (!room.bestExportOrders[resourceType]) {
							// I assume orders are sorted by time. Sanity check here
							var lastOrderTime = Infinity

							for(var i=exportOrders.length-1; i >= 0; i--) {
								var order = exportOrders[i];
								if (order.amount > 100) {
									var transferEnergyCost = Game.market.calcTransactionCost(testAmount, room.name, order.roomName);
									// console.log(resourceType, order.price)

									var value = testAmount * order.price - transferEnergyCost * room.energyPrice;

									if (value / testAmount > bestExportValue) {
										bestExportValue = value / testAmount;
										bestExportOrder = order;
										bestExportRoom = room;
									}
								}
								lastOrderTime = order.created;
							}
							// Can't make money off this
							if (bestExportValue < 0 || bestExportOrder == null) {
								continue
							}
							else {
								room.bestExportOrders[resourceType] = bestExportOrder
								room.bestExportValues[resourceType] = bestExportValue
								room.bestExportRooms[resourceType] = bestExportRoom
							}
						}
						else {
							bestExportOrder = room.bestExportOrders[resourceType]
							bestExportValue = room.bestExportValues[resourceType]
							bestExportRoom = room.bestExportRooms[resourceType]
						}

						if (!room.bestImportOrders[resourceType]) {
							// I assume orders are sorted by time. Sanity check here
							var lastOrderTime = Infinity

							for(var i = importOrders.length-1; i >= 0; i--) {
								var order = importOrders[i];
								if (order.amount > 100) {
									var transferEnergyCost = Game.market.calcTransactionCost(testAmount, room.name, order.roomName);

									var value = testAmount * order.price + transferEnergyCost * room.energyPrice;

									if (value / testAmount < bestImportValue) {
										bestImportValue = value / testAmount;
										bestImportOrder = order;
										bestImportRoom = room;
									}
								}
							}
							if (bestImportOrder) {
								room.bestImportOrders[resourceType] = bestImportOrder
								room.bestImportValues[resourceType] = bestImportValue
								room.bestImportRooms[resourceType] = bestImportRoom
							}
						}
						else {
							bestImportOrder = room.bestImportOrders[resourceType]
							bestImportValue = room.bestImportValues[resourceType]
							bestImportRoom = room.bestImportRooms[resourceType]
						}



						let targetPrice = Infinity;
						let modifier = 1;
						if (existing) {
							// Don't have to pay so don't have to be so confident. Keep a tighter price
							modifier *= 0.5;
							// It's not selling! Sell quicker!
							modifier += (Game.time - existing.created) / 100000;
						}


						// We do a weird thing where we multiply it by 0.05 later.
						modifier *= 1 + 20 * room.excessResources[resourceType] / 1e6

						if (!bestExportOrder || !bestImportOrder) {
							continue;
						}

						// Somebody is selling this. Beat their price if it't not me.
						if (bestExportOrder) { // (other people's buy orders)
							if (bestExportOrder.amount >= Math.min(100, (amount / 2)) &&
								(!Game.rooms[bestExportOrder.roomName] || Game.myRooms.indexOf(Game.rooms[bestExportOrder.roomName]) == -1)) {
								let transferEnergyCost = Game.market.calcTransactionCost(testAmount, room.name, bestExportOrder.roomName);
								let competetiveOrderPrice = bestExportOrder.price - transferEnergyCost * room.energyPrice / testAmount;
								targetPrice = Math.min(targetPrice, competetiveOrderPrice * (1 + 0.05 * (2 - modifier)));
							}
						}

						if (bestImportOrder) { // (other people's sell orders)
							let transferEnergyCost = Game.market.calcTransactionCost(testAmount, room.name, bestImportOrder.roomName);
							let competetiveOrderPrice = bestImportOrder.price - transferEnergyCost * room.energyPrice / testAmount;
							targetPrice = Math.max(targetPrice, competetiveOrderPrice * (1 - 0.05 * modifier));
						}

						let basePrice = this.getMyMineralBaseComponentsCost(room, resourceType);

						targetPrice = Math.max(targetPrice, basePrice * (1 - 0.05 * modifier));

						if (resourceType == RESOURCE_POWER && bestExportValue < Math.max(global.moddedCreditLimit / 20e6, 1) * (12 - Memory.saleLevel) * room.energyPrice) {
							continue;
						}
						else if (util.isDepositResource(resourceType)) {
							// Hack. I think it should be fine
							targetPrice *= 1.1
						}

						if (room.clearTerminal) {
							targetPrice *= 0.75;
						}

						targetPrice *= (1 - 0.025 * Memory.saleLevel);

						// console.log(room, resourceType, basePrice, targetPrice, modifier)

						if (targetPrice && targetPrice != Infinity) {
							if (existing && existing.remainingAmount < amount && existing.remainingAmount < existing.totalAmount && Game.time % 100 == 78 && (existing.price / targetPrice < 1.025 || targetPrice / existing.price < 1.025)) {
								if (amount - existing.remainingAmount > 3000 && room.excessResources[resourceType] >= 2 * (amount - existing.remainingAmount)) {
									let ret = Game.market.extendOrder(existing.id, amount - existing.remainingAmount)
								}
							}

							// Reprice infrequently. Only in this function 1/10 ticks.
							if (existing && Math.random() < (1 / 2000.) && (existing.price / targetPrice > 1.025 || targetPrice / existing.price > 1.025)) {
								let ret = Game.market.changeOrderPrice(existing.id, targetPrice);
								// console.log("Price change", ret, JSON.stringify(existing), targetPrice)
							}

							// It takes some time for market orders to register, so only create orders rarely.
							if (!existing && Game.time % 10 == 6 && Object.keys(Game.market.orders).length < MARKET_MAX_ORDERS - 10) {
								console.log("Place", ORDER_SELL, resourceType, targetPrice, amount, room.name);
								while (targetPrice * amount * 0.05 >= global.creditLimit * (Memory.botArena ? 0.1 : 0.01) && amount > 1000) {
									amount /= 2;
								}
								if (amount > 1000) {
									let ret = Game.market.createOrder(ORDER_SELL, resourceType, targetPrice, amount, room.name)
									if (ret == OK) {
										return // One per tick
									}
									else {
										console.log("createOrder fail ", ret, ORDER_SELL, resourceType, targetPrice, amount, room.name)
									}
								}
							}
						}
					}
				}
			}
		}
	},

	roomBalance: function(roomList) {
		if (Math.random() < 0.01) {
			for (let room of Game.myRooms) {		
				if (!room.mem.avgImportValues) continue
				let mineralCost = getAvgMineralCost(room)

				const alpha = Math.exp(-(1/(10. * Game.myRooms.length)));
				Memory.avgMineralCost = alpha * (Memory.avgMineralCost || mineralCost) + (1 - alpha) * mineralCost
			}
		}


		// Aim for 6000 of everything. Sell if I get over 90000.
		// This is actually room balancing...
		if (Game.cpu.bucket > 1500 && Game.cpu.getUsed() < 400) {
			let reversedRoomList;

			let creditModDiff = Memory.botArena ? 0.1e6 : 0.5e6

			let mod = (1 + global.moddedCreditLimit / creditModDiff);

			for (let room of roomList) {
				if (!room.terminal || (!room.storage && !room.clearTerminal) || !room.terminal.my || !room.terminal.isActive() || room.terminal.cooldown) continue;

				if (Memory.season5 && room.mem.claimToUnclaimRoom) continue
				if (room.clearTerminal) continue;
				if (room.transferred) continue;


				room.requiredResources = {};
				room.excessResources = {};

				if (Game.time % 80 == 0) {
					let testResources = global.balancableMinerals
					if (Math.random() < 0.01) {
						testResources = testResources.concat(global.saleMinerals)
					}
					
					if (global.moddedCreditLimit > 20e6 && room.effectiveLevel == 8 && room.powerSpawn && room.getCurrentOfResourceNonMineral(RESOURCE_POWER) < 2500) {
						room.requiredResources[RESOURCE_POWER] = 5000 - room.getCurrentOfResourceNonMineral(RESOURCE_POWER)
					}


					for (let resource of testResources) {
						if (Math.random() < 0.2) {
							if (room.transferred) break;

							if (resource == RESOURCE_POWER && room.effectiveLevel < 8) {
								continue
							}

							let targetAmount = 2 * LAB_MINERAL_CAPACITY + 500;

							// Not quite sure why. I guess we need a lot of it to room attack?
							if (util.isHealBoost(resource)) {
								targetAmount *= 1.5;
							}

							let maxAmount = util.getBoostTier(resource) == 3 ? 8 * LAB_MINERAL_CAPACITY : (util.getDeBar(resource) ? LAB_MINERAL_CAPACITY : 4 * LAB_MINERAL_CAPACITY)

							// The global resources check helps with CPU: if we're asking for more than the global we're going to be passing the first check a lot, then
							// having to loop over rooms. That's going to drain CPU and there's reasonable chance nothing is there.
							if (Math.random() < 0.9) {
								targetAmount = Math.min(maxAmount, targetAmount * mod, Math.max(LAB_MINERAL_CAPACITY, (Memory.stats.globalResources[resource] || 0) / Game.myRooms.length))
							}
							else {
								targetAmount = Math.min(maxAmount, targetAmount * mod)
							}
							let current = room.getCurrentOfResource(resource)

							if (current < targetAmount + 2000 || (current < targetAmount && Math.random() < 0.2)) {
								if (room.labs.length < 3 && room.effectiveLevel <= 6) {								
									if (util.isAttackBoost(resource) && room.labs.length == 0) {
										continue;
									}
									else if (util.isRangedBoost(resource) && room.labs.length <= 1) {
										continue;
									}
									else if (util.isRepairBoost(resource) && room.labs.length <= 2) {
										continue;
									}
									else if (!util.isAttackBoost(resource) && !util.isRepairBoost(resource) && !util.isRangedBoost(resource) && room.labs.length < 3) {
										continue;
									}
								}

								if (room.name == global.currentlyUnclaimingRoom) continue


								if (!reversedRoomList) {
									reversedRoomList = roomList.slice().reverse()

									for (let otherRoom of _.clone(reversedRoomList)) {
										if (otherRoom.transferred) {
											_.pull(reversedRoomList, otherRoom);
											continue
										}
										if (!otherRoom.terminal || !otherRoom.terminal.my || otherRoom.terminal.cooldown || !otherRoom.terminal.isActive()) {
											_.pull(reversedRoomList, otherRoom);
											continue;	
										}
										// Kinda annoying as it blocks other transfers but it's not expensive and I think acceptable
										if (otherRoom.mem.combatBoostsPending) {
											_.pull(reversedRoomList, otherRoom);
											continue;		
										}
										if ((Game.time - (otherRoom.mem.intershardTradeTick || 0)) < 1500) {
											_.pull(reversedRoomList, otherRoom);
											continue;		
										}

										let otherRoomEnergy = (otherRoom.storage ? otherRoom.storage.store[RESOURCE_ENERGY] : 0)
															+ (otherRoom.terminal ? otherRoom.terminal.store[RESOURCE_ENERGY] : 0);

										if (otherRoomEnergy < 20000) {
											_.pull(reversedRoomList, otherRoom)
											continue
										}
									}
								}

								for (let otherRoom of reversedRoomList) {
									if (otherRoom == room) continue;
									if (otherRoom.transferred) continue;
									if (room.transferred) break;

									let otherCurrent = otherRoom.getCurrentOfResource(resource)

									if (otherCurrent > targetAmount + 2000) {
										let amount = Math.round(Math.min(otherRoom.terminal.store[resource],
															  			(otherCurrent - targetAmount) / 2,
															  			(targetAmount - current) / 2))

										// if (amount >= 10) console.log("Terminal send?", resource, otherRoom.name, "to", room.name, amount);

										while (amount >= 1000 && Game.market.calcTransactionCost(amount, room.name, otherRoom.name) > otherRoom.terminal.store[RESOURCE_ENERGY]) {
											amount = Math.round(amount * 0.9);
										}

										if (amount >= 1000 && Game.market.calcTransactionCost(amount, room.name, otherRoom.name) <= otherRoom.terminal.store[RESOURCE_ENERGY]) {
											let ret = otherRoom.terminal.send(resource, amount, room.name);
											if (ret == OK) {
												global.inTickObject.energyExpenditures["terminalResources"] = (global.inTickObject.energyExpenditures["terminalResources"] || 0) + Game.market.calcTransactionCost(amount, room.name, otherRoom.name)
												global.inTickObject.energyExpenditures["terminalResources_" + resource] = (global.inTickObject.energyExpenditures["terminalResources_" + resource] || 0) + Game.market.calcTransactionCost(amount, room.name, otherRoom.name)
												console.log("Terminal send", ret, resource, otherRoom.name, "to", room.name, amount);
												otherRoom.transferred = true;
												room.transferred = true;
												break;
											}

										}
									}
								}

								if (!room.transferred && current < targetAmount && global.targetMinerals.includes(resource)) {
									targetAmount = Math.min(maxAmount, targetAmount * mod);
									room.requiredResources[resource] = targetAmount - current;
								}
							}
							// Lots and more than 4x average.
							else if (current > 100000 && current > (Memory.stats.globalResources[resource] / Game.myRooms.length) * 2) {
								if (!reversedRoomList) {
									reversedRoomList = roomList.slice().reverse()

									for (let otherRoom of _.clone(reversedRoomList)) {
										if (otherRoom.transferred) {
											_.pull(reversedRoomList, otherRoom);
											continue
										}
										if (!otherRoom.terminal || !otherRoom.terminal.my || otherRoom.terminal.cooldown || !otherRoom.terminal.isActive()) {
											_.pull(reversedRoomList, otherRoom);
											continue;	
										}
										// Kinda annoying as it blocks other transfers but it's not expensive and I think acceptable
										if (otherRoom.mem.combatBoostsPending) {
											_.pull(reversedRoomList, otherRoom);
											continue;		
										}
										if ((Game.time - (otherRoom.mem.intershardTradeTick || 0)) < 1500) {
											_.pull(reversedRoomList, otherRoom);
											continue;		
										}

										let otherRoomEnergy = (otherRoom.storage ? otherRoom.storage.store[RESOURCE_ENERGY] : 0)
															+ (otherRoom.terminal ? otherRoom.terminal.store[RESOURCE_ENERGY] : 0);

										if (otherRoomEnergy < 20000) {
											_.pull(reversedRoomList, otherRoom)
											continue
										}
									}
								}

								for (let otherRoom of reversedRoomList) {
									if (otherRoom == room) continue;
									if (otherRoom.transferred) continue;
									if (room.transferred) break;

									if (otherRoom.name == global.currentlyUnclaimingRoom) continue

									let otherCurrent = otherRoom.getCurrentOfResource(resource)

									if (otherCurrent < current - 2000) {
										let amount = Math.round(Math.min(room.terminal.store[resource],
															  			(current - otherCurrent)))

										// if (amount >= 10) console.log("Terminal send?", resource, otherRoom.name, "to", room.name, amount);

										while (amount >= 1000 && Game.market.calcTransactionCost(amount, room.name, otherRoom.name) > room.terminal.store[RESOURCE_ENERGY]) {
											amount = Math.round(amount * 0.9);
										}

										if (amount >= 1000 && Game.market.calcTransactionCost(amount, room.name, otherRoom.name) <= room.terminal.store[RESOURCE_ENERGY]) {
											let ret = room.terminal.send(resource, amount, otherRoom.name);
											if (ret == OK) {
												global.inTickObject.energyExpenditures["terminalResources"] = (global.inTickObject.energyExpenditures["terminalResources"] || 0) + Game.market.calcTransactionCost(amount, room.name, otherRoom.name)

												console.log("Terminal send", ret, resource, room.name, "to", otherRoom.name, amount);
												otherRoom.transferred = true;
												room.transferred = true;
												break;
											}

										}
									}
								}
							}
						}
					}
				}


				if (room.transferred) continue;

				if (Math.random() < 0.01) {
					for (let resource of global.saleMinerals) {
						if (Math.random() < 0.01) {
							let current = room.getCurrentOfResource(resource)
							if (current) {
								room.excessResources[resource] = current;
							}
						}
					}
				}

				if (Math.random() < 0.1) {
					let storageSpace = room.storage.store.getFreeCapacity();
					let storageMod = storageSpace >= 200000 ? 1 + (storageSpace - 200000) / 400000 : 0.5 + 0.5 * storageSpace / 200000

					for (let resource in room.terminal.store) {
						if (Math.random() < 0.1) {
							let current = room.getCurrentOfResource(resource)

							let targetAmount
							if (util.getDeBar(resource) && resource != RESOURCE_BATTERY) {
								targetAmount = constants.MARKET_SELL_RESOURCE_AMOUNT_BAR * storageMod;
							}
							else if (util.getBoostTier(resource) == 3) {
								targetAmount = constants.MARKET_SELL_RESOURCE_AMOUNT_BOOST_T3 * storageMod;
							}
							else if (util.getBoostTier(resource)) {
								targetAmount = constants.MARKET_SELL_RESOURCE_AMOUNT_BOOST * storageMod;
							}
							else {
								targetAmount = constants.MARKET_SELL_RESOURCE_AMOUNT * storageMod
							}

							// let targetAmount = constants.MARKET_SELL_RESOURCE_AMOUNT
							// let targetAmount = util.getDeBar(resource) ? constants.MARKET_SELL_RESOURCE_AMOUNT / 5 : constants.MARKET_SELL_RESOURCE_AMOUNT

							if (current > targetAmount || room.clearTerminal || 
								(COMMODITIES[resource] && (COMMODITIES[resource].level || util.getCommoditiesForLevel(0).includes(resource)) && (this.getBestCommoditityInChain(room, resource) === resource || (Memory.commoditiesManager.maxFactoryLevel || 0) <= (COMMODITIES[resource].level || 0)))) {
								let isTargetResource = (!COMMODITIES[resource] || (!COMMODITIES[resource].level && !util.getCommoditiesForLevel(0).includes(resource))) && global.targetMinerals.includes(resource) && !room.clearTerminal;

								room.excessResources[resource] = current - (isTargetResource ? targetAmount : 0);
							}
							// Processing this can lose money. If we have an ops shortage, and processing loses money, just cut off the chain at the head
							else if (Memory.stats.globalResources[RESOURCE_OPS] < 1000 * Game.myRooms.length && util.isDepositResource(resource)) {						
								let level0Upgrade = util.getBaseCommodityInChain(resource);

								let margin = this.getProfitMargin(room, level0Upgrade)
								if (margin < 0.9) {
									room.excessResources[resource] = current
								}
							}
						}
					}
				}
			}
		}
	},

	run: function() {
		if (!Memory.privateServer && !Memory.botArena && !Memory.screepsPlus) {
			global.creditLimit = Game.market.credits - 5e6;
			global.effectiveCreditLimit = global.creditLimit

			// Assume we can sell these
			for (let commodity of util.getCommoditiesForLevel(5)) {
				global.effectiveCreditLimit += (Memory.stats.globalResources[commodity] || 0) * (Memory.marketInfo.avgEValues[commodity] || 0)	
			}
			
		}
		else {
			global.creditLimit = Game.market.credits;
			global.effectiveCreditLimit = global.creditLimit
		}

		// Inflation adjusting
		if (Memory.marketInfo && Memory.marketInfo.energyPrice && !Memory.botArena && !Memory.privateServer && !Memory.timedRound && !Memory.swc) {
			global.moddedCreditLimit = global.creditLimit / Math.max(0.001, Memory.marketInfo.energyPrice)
		}
		else {
			global.moddedCreditLimit = global.creditLimit
		}


		if (Memory.disableMarket) return

		if (Memory.maxRoomLevel < 6) return

		if (Memory.boomMode) {
			// if (Memory.stats.avgBucket < 5000) {
			// 	Memory.disableCarryBoost = 1
			// }
			// if (Memory.stats.avgBucket > 9500) {
			// 	delete Memory.disableCarryBoost
			// }

			if (Memory.disableCarryBoost) {
				// if (global.targetMinerals.includes(RESOURCE_KEANIUM_HYDRIDE)) {
					_.pull(global.targetMinerals, RESOURCE_KEANIUM_HYDRIDE)
				// }
				if (!global.saleMinerals.includes(RESOURCE_KEANIUM_HYDRIDE)) {
					global.saleMinerals.push(RESOURCE_KEANIUM_HYDRIDE)
				}
			}
			else {				
				if (!global.targetMinerals.includes(RESOURCE_KEANIUM_HYDRIDE)) {
					global.targetMinerals.push(RESOURCE_KEANIUM_HYDRIDE)
				}
				// if (global.saleMinerals.includes(RESOURCE_KEANIUM_HYDRIDE)) {
					_.pull(global.saleMinerals, RESOURCE_KEANIUM_HYDRIDE)
				// }
			}
		}
		if (!Memory.botArena) {
			if (Memory.disableHarvestBoost) {
				// if (global.targetMinerals.includes(RESOURCE_UTRIUM_OXIDE)) {
					_.pull(global.targetMinerals, RESOURCE_UTRIUM_OXIDE)
				// }
				if (!global.saleMinerals.includes(RESOURCE_UTRIUM_OXIDE)) {
					global.saleMinerals.push(RESOURCE_UTRIUM_OXIDE)
				}
			}
			else {
				if (Memory.marketInfo.avgIValues[RESOURCE_UTRIUM_OXIDE] < Memory.marketInfo.energyPrice * 2) {
					if (!global.targetMinerals.includes(RESOURCE_UTRIUM_OXIDE)) {
						global.targetMinerals.push(RESOURCE_UTRIUM_OXIDE)
					}
				}
				else {
					_.pull(global.targetMinerals, RESOURCE_UTRIUM_OXIDE)
				}

				// if (global.saleMinerals.includes(RESOURCE_UTRIUM_OXIDE)) {
					_.pull(global.saleMinerals, RESOURCE_UTRIUM_OXIDE)
				// }
			}
		}

		Memory.stats.creditLimit = global.creditLimit;

		let marketData = {};

		let cpuStart
		if (!Memory.season || global.creditLimit) {			
			cpuStart = Game.cpu.getUsed();
			if (Game.cpu.bucket > 1500 && Game.cpu.getUsed() < 400) {
				this.marketIntel(marketData);
			}


			if (Math.random() < 0.001) {
				Memory.marketInfo = Memory.marketInfo || {}
				Memory.marketInfo.avgEValues = {}
				Memory.marketInfo.avgIValues = {}

				let rECnt = {}
				let rICnt = {}
				let energyCnt = 0;

				Memory.marketInfo.energyPrice = 0
				Memory.marketInfo.avgEValues = {}
				Memory.marketInfo.avgIValues = {}


				for (let room of Game.myRooms) {
					for (let resourceName in (room.mem.avgExportValues || {})) {
						Memory.marketInfo.avgEValues[resourceName] = (Memory.marketInfo.avgEValues[resourceName] || 0) + room.mem.avgExportValues[resourceName]
						rECnt[resourceName] = (rECnt[resourceName] || 0) + 1
					}
					for (let resourceName in (room.mem.avgImportValues || {})) {
						Memory.marketInfo.avgIValues[resourceName] = (Memory.marketInfo.avgIValues[resourceName] || 0) + room.mem.avgImportValues[resourceName]
						rICnt[resourceName] = (rICnt[resourceName] || 0) + 1
					}

					if (room.mem.energyPrice !== undefined) {
						Memory.marketInfo.energyPrice = (Memory.marketInfo.energyPrice || 0) + room.mem.energyPrice
						energyCnt++
					}
				}

				for (let resourceName in Memory.marketInfo.avgEValues) {
					Memory.marketInfo.avgEValues[resourceName] /= (rECnt[resourceName] || 1)
				}
				for (let resourceName in Memory.marketInfo.avgIValues) {
					Memory.marketInfo.avgIValues[resourceName] /= (rICnt[resourceName] || 1)
				}

				Memory.marketInfo.energyPrice /= (energyCnt || 1)

			}

			Memory.stats.profiler["marketIntel"] = (Game.cpu.getUsed() - cpuStart)
		}


		//this.exploitTryOvervaluedBuyPush();

		// Don't do anything while we're poking exploits.
		if (Memory.marketExploit && Math.abs((Memory.marketExploit.tick || 0) - Game.time) < 20) {
			return;
		}

		// this.exploit();
		// return;
   		let roomListPendingBoosts = [];
   		let roomListLabsInactive = [];
   		let roomListLabsActive = [];

   		let roomList;




		for (let room of Game.myRooms) {
			if (room.mem.combatBoostsPending) {
				roomListPendingBoosts.push(room);
			}
			else if (!room.mem.targetCompound) {
				roomListLabsInactive.push(room);
			}
			else {
				roomListLabsActive.push(room);
			}
		}


		if (Game.cpu.bucket > 1500 && Game.cpu.getUsed() < 400) {
			roomListPendingBoosts = _.shuffle(roomListPendingBoosts);
			roomListLabsInactive = _.shuffle(roomListLabsInactive);
			roomListLabsActive = _.shuffle(roomListLabsActive);

			roomList = roomListPendingBoosts.concat(roomListLabsInactive.concat(roomListLabsActive))
	   		cpuStart = Game.cpu.getUsed();
			this.roomBalance(roomList);
			Memory.stats.profiler["marketRoomBalance"] = (Game.cpu.getUsed() - cpuStart)
			// console.log(Game.time % 40, Memory.stats.profiler["marketRoomBalance"])
		}

		if (Memory.season) {
			return
		}

		// Limiting transfers per tick.


		cpuStart = Game.cpu.getUsed();
		if (Game.time % 51 == 0 && !Memory.noCancelOrder) {
			for (var orderId in Game.market.orders) {
				var order = Game.market.orders[orderId]
				if (order.remainingAmount <= 1) {
					Game.market.cancelOrder(order.id)
				}
			}
		}

		if (Object.keys(Game.market.orders).length == MARKET_MAX_ORDERS) {
			console.log("At max orders. Cleaning.")
			var cancelOrder = null;
			var oldestOrderTime = Infinity;
			let cancelled = false;
			for (var orderId in Game.market.orders) {
				var order = Game.market.orders[orderId]
				if (order.created < oldestOrderTime) {
					if (order.remainingAmount == order.totalAmount || Math.random() < 0.1) {
						oldestOrderTime = order.created;
						cancelOrder = order;
					}
				}
				if (order.remainingAmount < 100) {
					if (!Memory.noCancelOrder) Game.market.cancelOrder(order.id);
					cancelled = true;
				}
				if (Game.time - order.created > 100000 && order.amount == 0) {
					if (!Memory.noCancelOrder) Game.market.cancelOrder(order.id);
					cancelled = true;
				}
			}
			if (cancelOrder && !cancelled) {
				if (!Memory.noCancelOrder) Game.market.cancelOrder(cancelOrder.id)
			}
			return;
		}


		Memory.checkArbitrageExports = Memory.checkArbitrageExports || [];
		Memory.checkArbitrageImports = Memory.checkArbitrageImports || [];

		var arbLastTick = Memory.checkArbitrageExports.length > 0 || Memory.checkArbitrageImports.length > 0;

		if (Memory.checkArbitrageExports.length != 0) {
			for (var i = 0; i < Memory.checkArbitrageExports.length; i++) {
				var success = false;
				var partialSuccess = false;
				var attemptedSaleAmount = 1;
				var transactionSaleAmount = 0;
				var request = Memory.checkArbitrageExports[i]
			  	for(var j = 0; j < Game.market.outgoingTransactions.length; j++) {
			  		var transaction = Game.market.outgoingTransactions[j];
					// Internal transactions don't have orders.
			  		if (transaction.order && transaction.order.id == request.order.id && Math.round(transaction.amount) == Math.round(request.amount) && transaction.time >= Game.time - 1) {
			  			success = true;
			  			break;
			  		}
					else if (transaction.order && transaction.order.id == request.order.id && transaction.time >= Game.time - 1) {
			  			partialSuccess = true;
						transactionSaleAmount = transaction.amount
						attemptedSaleAmount = request.amount
			  			break;
					}
					else if (transaction.time < Game.time - 1) {
						break;
					}
				}

				if (!success) {
					console.log("Attempted sale via buy order failed for arbitrage")
					if (transactionSaleAmount / attemptedSaleAmount < 0.75) {
						Memory.failedArbitrages[request.order.resourceType] = Memory.failedArbitrages[request.order.resourceType] || []
						Memory.failedArbitrages[request.order.resourceType].push({t: Game.time, r: request.order.roomName})
					}
					if (partialSuccess) {
						console.log("Partial success though. Sold", transactionSaleAmount, "of", attemptedSaleAmount);
					}
				}
				// Purge old data.
				if (Memory.failedArbitrages[request.order.resourceType] && Memory.failedArbitrages[request.order.resourceType].length > 0) {
					if (Game.time - Memory.failedArbitrages[request.order.resourceType][0].t > 100000) {
						Memory.failedArbitrages[request.order.resourceType].shift()
					}
					if (Memory.failedArbitrages[request.order.resourceType].length == 0) {
						delete Memory.failedArbitrages[request.order.resourceType]
					}
				}
			}
			Memory.checkArbitrageExports = []
		}
		if (Memory.checkArbitrageImports.length != 0) {
			for (var i = 0; i < Memory.checkArbitrageImports.length; i++) {
				var success = false;
				var partialSuccess = false;
				var attemptedImportAmount = 1;
				var transactionImportAmount = 0;
				var request = Memory.checkArbitrageImports[i]
			  	for(var j = 0; j < Game.market.incomingTransactions.length; j++) {
			  		var transaction = Game.market.incomingTransactions[j];
					// Internal transactions don't have orders.
			  		if (transaction.order && transaction.order.id == request.order.id && Math.round(transaction.amount) == Math.round(request.amount) && transaction.time >= Game.time - 1) {
			  			success = true;
			  			break;
			  		}
					else if (transaction.order && transaction.order.id == request.order.id && transaction.time >= Game.time - 1) {
			  			partialSuccess = true;
						transactionImportAmount = transaction.amount
						attemptedImportAmount = request.amount
			  			break;
					}
					else if (transaction.time < Game.time - 1) {
						break;
					}
				}

				if (!success) {
					console.log("Attempted import via sell order failed for arbitrage")
					if (transactionImportAmount / attemptedImportAmount < 0.75) {
						Memory.failedArbitrages[request.order.resourceType] = Memory.failedArbitrages[request.order.resourceType] || []
						Memory.failedArbitrages[request.order.resourceType].push({t: Game.time, r: request.order.roomName})
					}
					if (partialSuccess) {
						console.log("Partial success though. Bought", transactionImportAmount, "of", attemptedImportAmount);
					}
				}
				// Purge old data.
				if (Memory.failedArbitrages[request.order.resourceType] && Memory.failedArbitrages[request.order.resourceType].length > 0) {
					if (Game.time - Memory.failedArbitrages[request.order.resourceType][0].t > 100000) {
						Memory.failedArbitrages[request.order.resourceType].shift()
					}
					if (Memory.failedArbitrages[request.order.resourceType].length == 0) {
						delete Memory.failedArbitrages[request.order.resourceType]
					}
				}
			}
			Memory.checkArbitrageImports = []
		}

		Memory.stats.profiler["marketChecks"] = (Game.cpu.getUsed() - cpuStart)

		if (Game.cpu.bucket > 1500 && Game.cpu.getUsed() < 400 && !Memory.noMarket) {
			// TODO: get rid of transferred here and make it per room
			if (global.creditLimit > 0) {
				let currentDeals = [];
				if (arbLastTick || (Math.random() < (Game.cpu.bucket - 4000) / 6000 && (Game.cpu.bucket > 9750 || Math.random() < 0.5))) {
					cpuStart = Game.cpu.getUsed();
					currentDeals = this.arbitrage(marketData, currentDeals);
					Memory.stats.profiler["marketArbitrage"] = (Game.cpu.getUsed() - cpuStart)
				}
			}

			if (!Memory.botArena) {
				this.exploitOverValuedResources();
			}

			if (!Memory.botArena && global.activeShards.length) {
				this.runIntershardTrading(marketData);
			}


			// Imports.



			// One buy order per tick max
			let placedBuyOrder = false;

			cpuStart = Game.cpu.getUsed();

			let globalMissingResources = []

			global.marketBuyToMove = global.marketBuyToMove || {}
			global.marketBuyToFactory = global.marketBuyToFactory || {}

			if (Memory.commoditiesManager.maxFactoryLevel == 5 && (Memory.testBuyToFactory || (Game.time - (Memory.lastMarketBuyToFactory || 0) > 500 && Math.random() < 0.1))) {
				Memory.lastMarketBuyToFactory = Game.time;

				let testRoom = _.sample(Game.myRooms);
				if (testRoom.factory && testRoom.effectiveLevel == 8) {
					function testChain(baseResource, secondResource, marketTrader) {
						let margin
						if ((margin = marketTrader.getChainProfitMargin(testRoom, secondResource)) > 1.5) {
							let amount = Memory.stats.globalResources[baseResource] + Memory.stats.globalResources[secondResource]
							if (Memory.testBuyToFactory) {
								console.log("testBuyToFactory", baseResource, secondResource, amount, margin / 2)
							}

							let targetAmount = Game.myRooms.length * 2000
							if (amount < Game.myRooms.length * 2000) {
								let chain = util.getCommoditiesForChain(secondResource)

								let buyResource
								let lastMargin
								for (let resource of chain.reverse()) {
									if (Memory.testBuyToFactory) {
										console.log("testBuyToFactory", baseResource, secondResource, resource, marketTrader.getProfitMargin(testRoom, resource, false))
									}
									if ((lastMargin = marketTrader.getProfitMargin(testRoom, resource, false)) < 1) {
										buyResource = resource
										break;
									}
								}

								if (!buyResource) {
									buyResource = baseResource
								}
								// Often the first reaction takes a hit (level 0 factory spam)
								// But it's hard to buy the second one from the market!
								// We can just buy the base resouce with a tighter margin
								else if (buyResource == secondResource) {
									let buyAmount = Math.floor((targetAmount - amount) / (COMMODITIES[baseResource] ? Math.pow(10, ((COMMODITIES[baseResource].level + 1) || 0)) : 1))

									if (Memory.testBuyToFactory) {
										console.log("testBuyToFactory", baseResource, secondResource, baseResource, buyAmount)
									}

									if (buyAmount > 0) {
										global.marketBuyToFactory[baseResource] = {amount: buyAmount, margin: margin * lastMargin / 2}
									}
								}


								let buyAmount = Math.floor((targetAmount - amount) / (COMMODITIES[buyResource] ? Math.pow(10, ((COMMODITIES[buyResource].level + 1) || 0)) : 1))

								if (Memory.testBuyToFactory) {
									console.log("testBuyToFactory", baseResource, secondResource, buyResource, buyAmount)
								}

								if (buyAmount > 0) {
									global.marketBuyToFactory[buyResource] = {amount: buyAmount, margin: margin / 2}
								}
							}

						}
					}

					testChain(RESOURCE_SILICON, RESOURCE_WIRE, this)
					testChain(RESOURCE_METAL, RESOURCE_ALLOY, this)
					testChain(RESOURCE_BIOMASS, RESOURCE_CELL, this)
					testChain(RESOURCE_MIST, RESOURCE_CONDENSATE, this)
				}

				console.log("Factory buying to produce:", JSON.stringify(global.marketBuyToFactory));

				if (Memory.testBuyToFactory) {
					delete global.marketBuyToFactory
				}
			}



			Memory.commoditiesManager.missingResources = Memory.commoditiesManager.missingResources || {};

			// Not sure what this was for. Other rooms are missing a resource. That should get
			// fed through into their local buying algos. Not sure why we want a global.
			/*for (let resource in Memory.commoditiesManager.missingResources) {
				if (Game.time - Memory.commoditiesManager.missingResources[resource] < 300) {
					let deBar = util.getDeBar(resource)
					// if (deBar) {
					// 	globalMissingResources.push(deBar)
					// }
				}
			}*/

			let creditModDiff = Memory.botArena ? 0.25e6 : 2e6


			let energyTarget = Math.min(constants.ROOM_ENERGY_MAX_BUY, constants.ROOM_ENERGY_BUY * (1 + global.moddedCreditLimit / creditModDiff) * (Game.myRooms.length == 1 ? 4 : 1))

			const BAR_RATIO = 5;

			let anyDoneEnergy = false
			let doFactoryMissing = Math.random() < 0.1
			let doMarketToBuy = Math.random() < 0.1

	   		for (let room of roomList) {
				if (room.transferred) continue;
				if (!room.terminal || !room.storage || room.terminal.cooldown) continue;
				if (room.clearTerminal) continue;
				if (room.name == global.currentlyUnclaimingRoom) continue


				for (let resource of Object.keys(room.requiredResources)) {
					let bar = util.getBar(resource)
					if (bar) {
						room.requiredResources[bar] = room.requiredResources[resource] / BAR_RATIO;
					}
				}

				// Values of raw mineral depend on the factories.
				// If the factory is blocked on something, buy it in a margin aware way.
				let missingResources = []

				if (doFactoryMissing && room.factory) {				
					if (room.mem.factoryPowerMissingResource) {
						let missingResource = room.mem.factoryPowerMissingResource
						// Go for barred and unbarred if they're barrable. Ignore if not
						let deBar = util.getDeBar(missingResource)
						if (deBar) { 
							// Kinda making the assumption we don't want these. I guess it's not all about margin but also cooldown. Hmmph.
							let margin
							if (room.mem.factoryPowerBlockedStage == RESOURCE_COMPOSITE || room.mem.factoryPowerBlockedStage == RESOURCE_CRYSTAL || room.mem.factoryPowerBlockedStage == RESOURCE_LIQUID) {
								margin = this.getProfitMargin(room, room.mem.factoryPowerBlockedStage)
							}
							else {
								margin = this.getChainProfitMargin(room, room.mem.factoryPowerBlockedChain) / (room.mem.factoryPowerBlockedStage ? this.getProfitMargin(room, room.mem.factoryPowerBlockedStage) : 1)
							}
							missingResources.push({resource: missingResource, margin: margin, amount: 1000})
							if (room.getCurrentOfResource(deBar) < constants.MIN_AMOUNT_BEFORE_BAR) missingResources.push({resource: deBar, margin: margin, amount: 3000})						
						}
					}
					else if (room.mem.factoryTargetPower) {
						if (room.getCurrentOfResource(RESOURCE_OPS) < POWER_INFO[PWR_OPERATE_FACTORY].ops * 10) {
							let margin
							if (room.mem.factoryTargetPower == RESOURCE_COMPOSITE || room.mem.factoryTargetPower == RESOURCE_CRYSTAL || room.mem.factoryTargetPower == RESOURCE_LIQUID) {
								margin = this.getProfitMargin(room, room.mem.factoryTargetPower)
							}
							else {
								margin = this.getChainProfitMargin(room, room.mem.factoryTargetPower) / (room.mem.factoryTargetPower ? this.getProfitMargin(room, room.mem.factoryTargetPower) : 1)
							}
							// How does a margin make sense here? I don't think it does
							missingResources.push({resource: RESOURCE_OPS, margin: margin, amount: POWER_INFO[PWR_OPERATE_FACTORY].ops * 10})	
						}
					}
					if (room.mem.factoryMissingResource) {
						let missingResource = room.mem.factoryMissingResource
						// Go for barred and unbarred if they're barrable. Ignore if not
						let deBar = util.getDeBar(missingResource)
						if (deBar) {
							let margin = this.getChainProfitMargin(room, room.mem.factoryBlockedChain)
							missingResources.push({resource: missingResource, margin: margin, amount: 1000})
							if (room.getCurrentOfResource(deBar) < constants.MIN_AMOUNT_BEFORE_BAR) missingResources.push({resource: deBar, margin: margin, amount: 3000})
						}
					}
					for (let missingResource of missingResources) {
						room.requiredResources[missingResource.resource] = Math.max((room.requiredResources[missingResource.resource] || 0), missingResource.amount);
					}
				}




				// Only raw minerals
				// For missingResources we have a margin. For these we just want them at base price
				// Not ideal. Ideally the ones that don't want them should buy them bar them then send them to the ones that do
				if (room.factory && Math.random() < 0.1) {					
					for (let globalMissingResource of globalMissingResources) {
						room.requiredResources[globalMissingResource] = Math.max((room.requiredResources[globalMissingResource] || 0), 3000);
					}
				}

				if (doMarketToBuy) {					
					if (global.marketBuyToMove[room.name]) {					
						for (let resource in global.marketBuyToMove[room.name]) {
							// If we need it for ourself.. don't
							if (room.requiredResources[resource]) {
								delete global.marketBuyToMove[room.name][resource]
							}
							else {
								room.requiredResources[resource] = global.marketBuyToMove[room.name][resource].amount;
							}
						}
					}
					else if (global.marketBuyToFactory) {					
						for (let resource in _.clone(global.marketBuyToFactory)) {
							// If we need it for ourself.. don't
							if (room.requiredResources[resource]) {
								delete global.marketBuyToFactory[resource]
							}
							else {
								room.requiredResources[resource] = global.marketBuyToFactory[resource].amount;
							}
						}
					}
				}


				calcRoomEnergyPrice(room)

				// console.log(room, JSON.stringify(room.requiredResources))

				// Energy
				if (Math.random() < 0.005 || anyDoneEnergy || Memory.forceEnergyBuyCheck) {
					let current = (room.terminal.store[RESOURCE_ENERGY] || 0) + (room.storage.store[RESOURCE_ENERGY] || 0);
					console.log("market enegy buy checks", room, current, energyTarget, room.terminal.store.getFreeCapacity(), global.creditLimit > 10000, room.energyPrice, room.energyPrice < Infinity)

					if (current < energyTarget && room.terminal.store.getFreeCapacity() > 10000 && global.creditLimit > 10000 && room.energyPrice && room.energyPrice < Infinity) {
						let amountNeeded = Math.min(room.terminal.store.getFreeCapacity(), Math.round(room.terminal.store.getFreeCapacity() / 2 + room.storage.store.getFreeCapacity() / 4), energyTarget - current);

						anyDoneEnergy = true;

						let sellOrders = Game.market.getAllOrders({type: ORDER_SELL, resourceType: RESOURCE_ENERGY});

						let minSellOrder;
						let minSellOrderPrice = Infinity;
						let batterySellOrder;

						let rawEnergyTransferCost = 0

						for (let sellOrder of sellOrders) {
							if (sellOrder.amount < 100) continue;
							let testAmount = 10000;
							let transferEnergyCost = Game.market.calcTransactionCost(testAmount, room.name, sellOrder.roomName);

							let cost = sellOrder.price * testAmount / (testAmount - transferEnergyCost);
							if (cost < minSellOrderPrice) {
								minSellOrderPrice = cost;
								minSellOrder = sellOrder
								batterySellOrder = false
								rawEnergyTransferCost = transferEnergyCost / testAmount
							}
						}

						let currentBatteries = (room.terminal.store[RESOURCE_BATTERY] || 0) + (room.storage.store[RESOURCE_BATTERY] || 0);

						// Can only convert batteries so fast
						if ((currentBatteries < current / 10 || currentBatteries < constants.BATTERY_RESERVE_SIZE) && room.effectiveLevel > 6 && room.factory) {
							let sellOrdersBattery = Game.market.getAllOrders({type: ORDER_SELL, resourceType: RESOURCE_BATTERY});
							for (let sellOrder of sellOrdersBattery) {
								if (sellOrder.amount < 20) continue;
								let testAmount = 10000;
								let transferEnergyCost = Game.market.calcTransactionCost(testAmount, room.name, sellOrder.roomName);

								let cost = sellOrder.price * testAmount / (10 * testAmount - transferEnergyCost);
								if (cost < minSellOrderPrice) {
									minSellOrderPrice = cost;
									minSellOrder = sellOrder
									batterySellOrder = true
									console.log(room, "wants to buy batteries", cost, minSellOrderPrice, JSON.stringify(minSellOrder), JSON.stringify(sellOrder))
								}
							}
						}

						console.log(room, "battery check", currentBatteries, current, constants.BATTERY_RESERVE_SIZE, room.effectiveLevel > 6 && room.factory)


						var currentPositions = Game.market.orders;
						let existing = false;
						let existingBattery = false;
						let useSellOrder = (current < 10000 && rawEnergyTransferCost < 0.5) || (current < 1000 && rawEnergyTransferCost < 0.9);
						let changeRand = global.moddedCreditLimit / 1e9

						changeRand *= energyTarget / (current || 1)

						for (var orderId in currentPositions) {
							var order = currentPositions[orderId]
							if (order.resourceType == RESOURCE_ENERGY && order.type == ORDER_BUY && order.roomName == room.name) {
								existing = true;
								if (order.price < minSellOrderPrice) {
									// if (Math.random() < changeRand && (order.remainingAmount >= amountNeeded || order.remainingAmount == order.totalAmount)) {
									if (Math.random() < changeRand) {
										let newPrice = Math.max(Math.round((order.price + 0.001) * 1000) / 1000, Math.round(order.price * 1.01 * 1000) / 1000)

										let ret = Game.market.changeOrderPrice(order.id, newPrice);
										console.log("Increase price", ret, JSON.stringify(order), amountNeeded - order.remainingAmount)
									}

									if (amountNeeded - order.remainingAmount > 1000 && order.remainingAmount < order.totalAmount) {
										let ret = Game.market.extendOrder(order.id, amountNeeded - order.remainingAmount);
										console.log("Extend", ret, JSON.stringify(order), amountNeeded - order.remainingAmount)
									}
								}
								else {
									useSellOrder = true;
								}
							}
							if (order.resourceType == RESOURCE_BATTERY && order.type == ORDER_BUY && order.roomName == room.name) {
								existingBattery = true;
								if (order.price < minSellOrderPrice * 10) {
									// if (Math.random() < changeRand && (order.remainingAmount >= amountNeeded || order.remainingAmount == order.totalAmount)) {
									if (Math.random() < changeRand) {
										let newPrice = Math.max(Math.round((order.price + 0.001) * 1000) / 1000, Math.round(order.price * 1.01 * 1000) / 1000)

										let ret = Game.market.changeOrderPrice(order.id, newPrice);
										console.log("Increase price", ret, JSON.stringify(order), Math.round(amountNeeded / 10) - order.remainingAmount)
									}

									if (Math.round(amountNeeded / 10) - order.remainingAmount > 100 && order.remainingAmount < order.totalAmount) {
										let ret = Game.market.extendOrder(order.id, Math.round(amountNeeded / 10) - order.remainingAmount);
										console.log("Extend", ret, JSON.stringify(order), Math.round(amountNeeded / 10) - order.remainingAmount)
									}
								}
								// else {
								// 	useSellOrder = true;
								// }
							}
							// if (order.resourceType == RESOURCE_BATTERY && order.type == ORDER_BUY && order.roomName == room.name) {
							// 	existing = true;
							// 	if (order.price < minSellOrderPrice * 10) {
							// 		let changeRand = global.creditLimit / 1e7

							// 		if (current < energyTarget && Math.random() < changeRand && order.remainingAmount > energyTarget) {
							// 			let ret = Game.market.changeOrderPrice(order.id, Math.round((order.price + 0.001) * 1000) / 1000);
							// 			console.log("Increase price", ret, JSON.stringify(order), amountNeeded - order.remainingAmount)
							// 		}

							// 		if (amountNeeded - order.remainingAmount > 1000 && order.remainingAmount < order.totalAmount) {
							// 			let ret = Game.market.extendOrder(order.id, amountNeeded - order.remainingAmount);
							// 			console.log("Extend", ret, JSON.stringify(order), amountNeeded - order.remainingAmount)
							// 		}
							// 	}
							// 	else {
							// 		useSellOrder = true;
							// 	}

							// 	break;
							// }
						}

						console.log(minSellOrder, useSellOrder, batterySellOrder, minSellOrderPrice < room.energyPrice / 1.1)

						if (minSellOrder && (useSellOrder || batterySellOrder || minSellOrderPrice < room.energyPrice / 1.1)) {
							if (minSellOrder.resourceType == RESOURCE_BATTERY) {
								let ret = Game.market.deal(minSellOrder.id, Math.min(minSellOrder.amount, Math.round(amountNeeded / 10)), room.name);
								console.log("Use sell order", ret, JSON.stringify(minSellOrder), Math.min(minSellOrder.amount, Math.round(amountNeeded / 10)))
							}
							else if (useSellOrder) {								
								let ret = Game.market.deal(minSellOrder.id, Math.min(minSellOrder.amount, amountNeeded, (room.terminal.store[RESOURCE_ENERGY] || 0)), room.name);
								console.log("Use sell order", ret, JSON.stringify(minSellOrder), Math.min(minSellOrder.amount, amountNeeded))
							}
							break
						}
						else if (!existing) {
							let price = room.energyPrice / 1.1;

							if (price < 0.001) price = 0.001

							let params = {
							    type: ORDER_BUY,
							    resourceType: RESOURCE_ENERGY,
							    price: price,
							    totalAmount: amountNeeded,
							    roomName: room.name  
							}

							let ret = Game.market.createOrder(params);
							console.log("Create energy buy order", ret, price, amountNeeded, room.name)

							if (!existingBattery && currentBatteries < current / 10) {
								let paramsBattery = {
								    type: ORDER_BUY,
								    resourceType: RESOURCE_BATTERY,
								    price: price * 9,
								    totalAmount: amountNeeded / 10,
								    roomName: room.name  
								}
								let ret = Game.market.createOrder(paramsBattery);
								console.log("Create battery buy order", ret, price * 9, amountNeeded / 10, room.name)
							}

							break
						}
					}
				}

				let requiredResourceKeys = Object.keys(room.requiredResources);
				if (requiredResourceKeys.length == 0) continue;
				// console.log(room, JSON.stringify(room.requiredResources))

				requiredResourceKeys = _.shuffle(requiredResourceKeys)

				// Really should base this on some "base" value like avg mineral price
				let creditModDiff = Memory.botArena ? 0.5e6 : 2.5e6

				let creditMod = 0.1 * (global.moddedCreditLimit / creditModDiff) 

				if (Memory.swc) {
					creditMod *= 2
				}

				if (!room.mem.targetCompound) {
					creditMod *= 2;
				}

				let matchMaxAmount = 2 * LAB_MINERAL_CAPACITY;

				matchMaxAmount = Math.min(matchMaxAmount * 2, matchMaxAmount * (1 + 0.1 * global.moddedCreditLimit / creditModDiff))

				for (let resource of requiredResourceKeys) {
					if (resource == RESOURCE_ENERGY) continue;

					// Buying
					if ((room.requiredResources[resource] || 0) > 0 && room.controller.level >= 7 && global.creditLimit > 10000) {
						// let anyOrders = false;
						let spareAmount = 0;
						if (room.storage) {
							spareAmount += (room.storage.store[resource] || 0);
						}
						if (room.terminal) {
							spareAmount += (room.terminal.store[resource] || 0);
						}

						for (let missingResource of missingResources) {
							if (missingResource.resource == resource) {
								spareAmount /= 2;
							}
						}

						// if (resource == "X") {
						// 	console.log(room, resource, spareAmount, 2 * LAB_MINERAL_CAPACITY - spareAmount)
						// }

						// We're really low, so urgently match the sell order
						// console.log(room, room.mem.resources[resource], spareAmount, resource, JSON.stringify(room.requiredResources))

						if (spareAmount < matchMaxAmount && !room.terminal.cooldown && !util.getDeBar(resource)) {
							if ((room.storage.store[RESOURCE_ENERGY] || 0) + (room.terminal.store[RESOURCE_ENERGY] || 0) > 10000) {
								let amount = (matchMaxAmount - spareAmount);

								// Don't bother with many small deals
								if (amount > 500) {
									let allOrders = Game.market.getAllOrders({type: ORDER_SELL, resourceType: resource});
									// let allOrders = global.importOrders[resourceType];

									// if (allOrders.length) {
									// 	anyOrders = true;
									// }
									let bar
									if (resource.length == 1) {
										bar = util.getBar(resource)
									}

									if (bar) {
										let barAmount = 0
										if (room.storage) {
											barAmount += (room.storage.store[bar] || 0);
										}
										if (room.terminal) {
											barAmount += (room.terminal.store[bar] || 0);
										}

										if (barAmount < spareAmount) {
											allOrders = allOrders.concat(Game.market.getAllOrders({type: ORDER_SELL, resourceType: bar}));
										}

									}

									var cheapestValue = Infinity;
									var cheapestOrder;

									for (let order of allOrders) {
										if (bar && order.resourceType == bar) {
											if (order.amount >= amount / 100) {
												let value = (order.price + room.energyPrice * Game.market.calcTransactionCost(1000, room.name, order.roomName) / 1000) / BAR_RATIO;

												value += room.energyPrice * 200 / 500

												if (Memory.botArena && util.isNPCTerminalRoom(order.roomName)) {
													value /= 1.25;
												}

												if (value < cheapestValue) {
													cheapestValue = value;
													cheapestOrder = order;
												}
											}
										}
										else {											
											if (order.amount >= amount / 20) {
												let value = order.price + room.energyPrice * Game.market.calcTransactionCost(1000, room.name, order.roomName) / 1000;
												if (Memory.botArena && util.isNPCTerminalRoom(order.roomName)) {
													value /= 1.25;
												}

												if (value < cheapestValue) {
													cheapestValue = value;
													cheapestOrder = order;
												}
											}
										}
									}
									// if (resource == "X") {
									// 	console.log(room, JSON.stringify(cheapestOrder))
									// }

									if (cheapestOrder) {
										let orderResource = cheapestOrder.resourceType

										let isOrderBar = util.getDeBar(orderResource) ? true : false

										if (isOrderBar) {
											amount /= BAR_RATIO;
										}

										amount = Math.min(amount, cheapestOrder.amount);
										let basePrice = this.getMyMineralBaseComponentsCost(room, orderResource);

										let mod1 = 1
										// Should I buy to bar
										// I want to buy a raw mineral (it's cheaper than bars)
										if (orderResource.length == 1) {
											let bar = util.getBar(orderResource)
											if (bar) {												
												let components = COMMODITIES[bar].components;

												let income = room.mem.avgExportValues[bar] * COMMODITIES[bar].amount
												let cost = 0
												for (let componentType in components) {
													if (componentType == RESOURCE_ENERGY) {
														cost += components[componentType] * room.energyPrice;
													}
													else if (componentType == orderResource) {
														cost += components[componentType] * basePrice;
													}
													else {
														console.log("Weird component marketTrader", orderResource, componentType)
													}
												}

												let profitRatio = income / cost;
												if (profitRatio > 1.25) {
													if (Math.random() < 0.01) console.log("A Buying", orderResource, "to bar too", bar, "should be a income of", income, "cost of", cost, "profit", income - cost, room.name)
													mod1 *= (1 + profitRatio) / 2;
												}
											}
										}
										// It's a bar
										// Same as last time, buy buying to debar
										else if (isOrderBar) {
											let deBar = util.getDeBar(orderResource);

											if (deBar) {												
												let components = COMMODITIES[deBar].components;

												let income = room.mem.avgExportValues[deBar] * COMMODITIES[deBar].amount
												let cost = 0
												for (let componentType in components) {
													if (componentType == RESOURCE_ENERGY) {
														cost += components[componentType] * room.energyPrice;
													}
													else if (componentType == orderResource) {
														cost += components[orderResource] * basePrice;
													}
													else {
														console.log("Weird component marketTrader", orderResource, componentType)
													}
												}

												let profitRatio = income / cost;
												if (profitRatio > 1.25) {
													if (Math.random() < 0.01) console.log("A Buying", orderResource, "to debar should be a income of", income, "cost of", cost, "profit", income - cost, room.name)
													mod1 *= (1 + profitRatio) / 2;
												}
											}
										}

										let mod2 = 1
										if (spareAmount < LAB_MINERAL_CAPACITY) {
											mod2 *= 1.1;
										}
										if (!room.mem.targetCompound) {
											mod2 *= 1.1;
										}

										let mod3 = 1;
										for (let missingResource of missingResources) {
											if (missingResource.orderResource == orderResource) {
												mod3 = missingResource.margin;
											}
										}

										mod2 *= (1 + creditMod * 2);

										let myHighestPrice
										// This is unset if we actually require resources
										if (global.marketBuyToMove[room.name] && global.marketBuyToMove[room.name][resource]) {
											myHighestPrice = basePrice * Math.min(global.marketBuyToMove[room.name][resource].margin, Math.max(mod1, mod2, mod3));
										}
										else if (global.marketBuyToFactory && global.marketBuyToFactory[resource]) {
											myHighestPrice = basePrice * Math.min(global.marketBuyToFactory[resource].margin, Math.max(mod1, mod2, mod3));
										}
										else {										
											myHighestPrice = basePrice * Math.max(mod1, mod2, mod3);
										}

										if (resource == RESOURCE_UTRIUM_OXIDE) {
											myHighestPrice = Math.min(myHighestPrice, 2 * room.energyPrice)
										}

										// if (resource == "ops") {
										// 	console.log(room, amount, cheapestValue, basePrice, mod1, mod2, mod3, JSON.stringify(missingResources))
										// }

										if (cheapestValue <= myHighestPrice || (Memory.botArena && util.isNPCTerminalRoom(cheapestOrder.roomName))) {
											let cost = cheapestOrder.price * amount;
											if (cost <= global.creditLimit) {
												if (Game.market.calcTransactionCost(amount, room.name, cheapestOrder.roomName) <= room.terminal.store[RESOURCE_ENERGY]) {
													let ret = Game.market.deal(cheapestOrder.id, amount, room.name);
													room.transferred = true;
													global.creditLimit -= amount * cheapestOrder.price;
													console.log("DEAL B", ret, JSON.stringify(cheapestOrder), amount, room.name)

													if (ret == OK) {
														if (global.marketBuyToMove[room.name] && global.marketBuyToMove[room.name][resource]) {					
															delete global.marketBuyToMove[room.name][resource];
														}
														else if (global.marketBuyToFactory && global.marketBuyToFactory[resource]) {					
															delete global.marketBuyToFactory[resource];
														}
													}

													break;
												}
											}
										}
									}
								}
							}
						}

						// let targetAmount = REACTIONS[resource] ? 3 * LAB_MINERAL_CAPACITY : 6 * LAB_MINERAL_CAPACITY;

						// console.log(room, room.transferred, room.mem.resources[resource], spareAmount, resource, JSON.stringify(room.requiredResources))

						// Place buy order
						if (!placedBuyOrder && !room.transferred && global.creditLimit > 1000 && !Memory.botArena) {
							let amountNeeded = room.requiredResources[resource];
							let existing;

							let hasRawResource = util.getDeBar(resource)

							if (amountNeeded < (hasRawResource ? 200 : 1000)) continue;

							// Extend
							for (let orderId in Game.market.orders) {
								let order = Game.market.orders[orderId];
								if (order.roomName == room.name && order.resourceType == resource && order.type == ORDER_BUY) {
									existing = order;
									if (order.remainingAmount < amountNeeded && order.remainingAmount < order.totalAmount) {
										let ret = Game.market.extendOrder(order.id, amountNeeded - order.remainingAmount)
										// console.log("Extend", ret, JSON.stringify(order), 2 * LAB_MINERAL_CAPACITY - room.mem.resources[resource] - order.remainingAmount)
									}
									break;
								}
							}

							// Reprice infrequently. This is run only 1 in every 10 ticks due to previous random in roomBalance and the thing that generates missingResources
							// At 1 million credits, it's 1 / 1000
							// At 10 million credits, it's 1 / 100
							// At 100 million credits, it's 1 / 10
							let changeRand = global.moddedCreditLimit / 1e8
							if (existing && Math.random() >= changeRand) {
								continue
							}

							// Price check.
							let allOrders = Game.market.getAllOrders({resourceType: resource});

							let targetPrice = 0;

							let modifier = 1;
							if (existing) {
								modifier += (Game.time - existing.created) / 100000;
							}


							let alreadyBuying = 0;
							let anyBuyers = false;

							for (let order of allOrders) {
								// Somebody else has a buy order. Pay a smidgen more than them
								if (order.type == ORDER_BUY && order.amount >= (hasRawResource ? 200 : 1000) && order.price > targetPrice && (!Game.rooms[order.roomName] || !Game.rooms.controller || !Game.rooms.controller.my)) {
									targetPrice = Math.max(targetPrice, order.price * (1 + 0.05 * modifier));
									anyBuyers = true;
								}
								if (!existing && Game.rooms[order.roomName] && Game.rooms[order.roomName].controller && Game.rooms[order.roomName].controller.my) {
									alreadyBuying++;
								}
							}


							if (!anyBuyers) {
								targetPrice = Infinity;
							}

							for (let order of allOrders) {
								// Somebody is selling this. Don't place too close to that
								if (order.type == ORDER_SELL) {
									targetPrice = Math.min(targetPrice, order.price * (1 - 0.05 * modifier));
								}
							}

							let basePrice = this.getMyMineralBaseComponentsCost(room, resource);

							let valuePrice = basePrice;

							let mod1 = 1

							let buyToSell = 0

							// Should I buy to bar
							// I want to buy a raw mineral (it's cheaper than bars)
							if (resource.length == 1) {
								let bar = util.getBar(resource)
								if (bar) {												
									let components = COMMODITIES[bar].components;

									let income = room.mem.avgExportValues[bar] * COMMODITIES[bar].amount
									let cost = 0
									for (let componentType in components) {
										if (componentType == RESOURCE_ENERGY) {
											cost += components[componentType] * room.energyPrice;
										}
										else if (componentType == resource) {
											cost += components[componentType] * basePrice;
										}
										else {
											console.log("Weird component marketTrader", resource, componentType)
										}
									}

									let profitRatio = income / cost;
									if (profitRatio > 1.25) {
										if (Math.random() < 0.01) console.log("B Buying", resource, "to bar to", bar, "should be a income of", income, "cost of", cost, "profit", income - cost, room.name)
										mod1 *= (1 + profitRatio) / 2;
										buyToSell = 1
									}
								}
							}
							// It's a bar
							// Same as last time, buy buying to debar
							else { 
								let deBar = util.getDeBar(resource);

								if (deBar) {												
									let components = COMMODITIES[deBar].components;

									let income = room.mem.avgExportValues[deBar] * COMMODITIES[deBar].amount
									let cost = 0
									for (let componentType in components) {
										if (componentType == RESOURCE_ENERGY) {
											cost += components[componentType] * room.energyPrice;
										}
										else if (componentType == resource) {
											cost += components[resource] * basePrice;
										}
										else {
											console.log("Weird component marketTrader", resource, componentType)
										}
									}

									let profitRatio = income / cost;
									if (profitRatio > 1.25) {
										if (Math.random() < 0.01) console.log("B Buying", resource, "to debar should be a income of", income, "cost of", cost, "profit", income - cost, room.name)
										mod1 *= (1 + profitRatio) / 2;
										buyToSell = 1
									}
								}
							}

							let mod3 = 1;
							for (let missingResource of missingResources) {
								if (missingResource.resource == resource) {
									mod3 = missingResource.margin;
								}
							}

							let mod2 = (1 + creditMod * 0.5);



							let myHighestPrice
							// This is unset if we actually require resources
							if (global.marketBuyToMove[room.name] && global.marketBuyToMove[room.name][resource]) {
								myHighestPrice = valuePrice * Math.min(global.marketBuyToMove[room.name][resource].margin, Math.max(mod1, mod2, mod3));
							}
							else if (global.marketBuyToFactory && global.marketBuyToFactory[resource]) {
								myHighestPrice = valuePrice * Math.min(global.marketBuyToFactory[resource].margin, Math.max(mod1, mod2, mod3));
							}
							else if (buyToSell) {										
								myHighestPrice = valuePrice * Math.max(mod1, mod3);
							}
							else {										
								myHighestPrice = valuePrice * Math.max(mod2, mod3);
							}

							if (resource == RESOURCE_UTRIUM_OXIDE) {
								myHighestPrice = Math.min(myHighestPrice, 2 * room.energyPrice)
							}


							// if (resource == RESOURCE_PURIFIER) {
							// 	console.log(room, existing, basePrice, targetPrice, resource, amountNeeded)
							// }

							// Base price is the amount I can buy it for today. I don't want to price above that, especially given the tax.
							// I also don't want to price too far below that or my order will never be taken.
							// if (targetPrice < myHighestPrice * .925) {
								if (targetPrice == Infinity) {
									targetPrice = basePrice * .925;
								}
								else {
									targetPrice = (targetPrice + basePrice) / 2
								}

								targetPrice = Math.min(targetPrice, myHighestPrice)
								
								if (existing && (myHighestPrice / existing.price > 1.05)) {
									let ret = Game.market.changeOrderPrice(existing.id, myHighestPrice * 0.05 + existing.price * 0.95);
									if (ret == OK) {
										if (global.marketBuyToMove[room.name] && global.marketBuyToMove[room.name][resource]) {					
											delete global.marketBuyToMove[room.name][resource];
										}
										else if (global.marketBuyToFactory && global.marketBuyToFactory[resource]) {					
											delete global.marketBuyToFactory[resource];
										}
									}

									console.log("Price change", ret, JSON.stringify(existing), myHighestPrice * 0.05 + existing.price * 0.95, myHighestPrice)
									break;
								}
								
								// It takes some time for market orders to register, so only create orders rarely.
								if (!existing) {									
									if (alreadyBuying < 3 && targetPrice != 0 && targetPrice != Infinity) {
										if (Object.keys(Game.market.orders).length < MARKET_MAX_ORDERS - 10) {
											let ret = Game.market.createOrder(ORDER_BUY, resource, targetPrice, amountNeeded, room.name);
											console.log("Place", ret, ORDER_BUY, resource, targetPrice, amountNeeded, room.name);
											placedBuyOrder = true;
											if (ret == OK) {
												if (global.marketBuyToMove[room.name] && global.marketBuyToMove[room.name][resource]) {					
													delete global.marketBuyToMove[room.name][resource];
												}
												else if (global.marketBuyToFactory && global.marketBuyToFactory[resource]) {					
													delete global.marketBuyToFactory[resource];
												}
											}
											break;
										}
									}
								}
							// }


						}
					}
				}
			}

			Memory.stats.profiler["marketImports"] = (Game.cpu.getUsed() - cpuStart)

			cpuStart = Game.cpu.getUsed();
			this.handleExports(marketData)
			Memory.stats.profiler["marketExports"] = (Game.cpu.getUsed() - cpuStart)
		}
	},


	// The idea is to push the price then dump.
	// I think it works against Taki.
	pushPrice: function(resource, roomName) {
		Memory.marketPushPrice = Memory.marketPushPrice || {}
		if (Memory.marketPushPrice[resource] && Memory.marketPushPrice[resource].r != roomName) {
			return
		}


		var exploitResource = resource
		// var exploitResource = RESOURCE_LEMERGIUM_HYDRIDE
		var exploitRoom = roomName
		var exploitAmount = 1000
		var exploitBuyPrice = .1
		var exploitSellPrice = 14
		var exploitTime = 4326450 - 2

		if (Game.time >= exploitTime - 10 && Game.time <= exploitTime + 2) {
			console.log(Game.time)
		}


		if (Game.time == exploitTime - 2) {
			// Game.market.createOrder(ORDER_SELL, exploitResource, exploitSellPrice, exploitAmount, exploitRoom);
		}
		else if (Game.time == exploitTime) {
			Game.market.createOrder(ORDER_BUY, exploitResource, exploitBuyPrice, exploitAmount, exploitRoom);
		}
		else if (Game.time > exploitTime && Game.time < exploitTime + 3) {
			let orders = Game.market.getAllOrders({type: ORDER_BUY, resourceType: exploitResource});
			for(var i=0; i < orders.length; i++) {
				var order = orders[i];
				if (order.type == ORDER_BUY && order.resourceType == exploitResource && order.roomName == exploitRoom && order.amount == exploitAmount && order.price == exploitBuyPrice) {
					Game.market.deal(order.id, exploitAmount, exploitRoom)
				}
			}
		}
		else if (Game.time >= exploitTime + 3) {
			for (var orderId in Game.market.orders) {
				var order = Game.market.orders[orderId]
				// console.log(order.id)
				// console.log(order.type, order.resourceType, order.roomName, order.price)
				// console.log(ORDER_SELL, exploitResource, exploitRoom, exploitSellPrice)
				if (order.type == ORDER_SELL && order.resourceType == exploitResource && order.roomName == exploitRoom && order.price == exploitSellPrice) {
					// console.log(order.id)
					// Game.market.cancelOrder(order.id)
				}
			}
		}
	},

	isMineralRequired(mineralType) {
		if ((Memory.numRCL6PlusTerminal || 0) < 6) {
			return true
		}



		let avgEnergyValue 
		if (Memory.marketInfo && Memory.marketInfo.energyPrice) {
			avgEnergyValue = Memory.marketInfo.energyPrice
		}
		if (!Memory.botArena && avgEnergyValue && Memory.marketInfo && Memory.marketInfo.avgEValues[mineralType] && Memory.marketInfo.avgIValues[mineralType]) {
			let avgMarketValue = (Memory.marketInfo.avgEValues[mineralType] + Memory.marketInfo.avgIValues[mineralType]) / 2
			// Miner is 3.1 energy for 5 minerals (per tick)
			if (5 * avgMarketValue - 3.1 * avgEnergyValue < 0) {
				if (Math.random() < 0.01) console.log("Not mining", mineralType, avgMarketValue, avgEnergyValue)
				return false
			}
		}
		if (Memory.season && Game.market.credits == 0) {
			let target = 15000

			if (Memory.season4) {
				return true
			}
			if (Memory.season5 && mineralType == "T") {
				return true
			}
			
			// Used in everything, we need a lot more
			if (mineralType == "X") {
				target *= 4
			}
			else if (mineralType == "H") {
				target *= 4
			}
			else if (mineralType == "O") {
				target *= 4
			}

			// I realise we're setting bars as "1" but this is mostly for avoiding storage overflow
			let amount = (Memory.stats.globalResources[mineralType] || 0) + (Memory.stats.globalResources[util.getBar(mineralType) || "null"] || 0)
			if (amount / Math.max(6, Game.myRooms.length) > target) {
				global.notMining = global.notMining || {}
				global.notMining[mineralType] = Game.time
				if (Math.random() < 0.01) console.log("Not mining", mineralType, amount / Math.max(6, Game.myRooms.length))
				return false
			}
		}

		// If I have more than 100k per room it's going tits up in some way
		let amount = (Memory.stats.globalResources[mineralType] || 0) + (Memory.stats.globalResources[util.getBar(mineralType) || "null"] || 0)
		if (amount > Game.myRooms.length * 100000) {
			global.notMining = global.notMining || {}
			global.notMining[mineralType] = Game.time
			return false
		}


		return true
	},

};

module.exports = marketTrader;