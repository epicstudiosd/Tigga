"use strict";

var util = require('util');
var safeRoute = require('safeRoute');
var pathCache = require('pathCache');
var roomAI = require('roomAI');
var roomIntel = require('roomIntel');
var intelAI = require('intelAI');
var roomDesignAI = require('roomDesignAI');
var constants = require('constants');
const creepCreator = require('creepCreator');
const scouting = require('scouting');

const interShardMemoryManager = require('interShardMemoryManager');

const marketTrader = require("marketTrader")
const overseerSeason = require("overseerSeason")

// Remoting
function analyseRemoteRooms(homeRoomName, claimScan) {
	var remoteRooms = []
	var baseCoords = util.getRoomCoords(homeRoomName);

	if (!Memory.rooms[homeRoomName]) return remoteRooms;

	let hardRefresh = Game.cpu.getUsed() < 300;
	let maxLinearRange = Memory.stats.yieldPerCPU === 0 && Memory.rooms[homeRoomName].spawnUtilization < 0.8 && !claimScan ? 3 : 2
	// let hardRefresh = Game.cpu.bucket > 8500 && Game.cpu.getUsed() < 300;

	let myName = util.getMyName()

	// Allow harvesting in a 5x5 tile.
	for (var i = -maxLinearRange; i <= maxLinearRange; i++) {
		for (var j = -maxLinearRange; j <= maxLinearRange; j++) {
			if (i == 0 && j == 0) continue;
			// if (i == 0 && j == 0 || (Math.abs(i) + Math.abs(j) >= 4)) continue;
			var coords = {"x": baseCoords.x + i, "y" : baseCoords.y + j};
			var testRoomName = util.getRoomNameFromCoords(coords);

			// console.log(testRoomName, Memory.rooms[testRoomName], Game.map.getRoomStatus(testRoomName).status, safeRoute.getSafeRouteCost(homeRoomName, testRoomName, false, true))


			if (Game.rooms[testRoomName] && Memory.rooms[testRoomName] && Memory.rooms[testRoomName].owner == myName) {
				continue;
			}

			// If we've failed to path there before, lets skip over it most of the time.
			if (!claimScan) {				
				if (Memory.rooms[homeRoomName].incompleteHarvestPathRooms && Memory.rooms[homeRoomName].incompleteHarvestPathRooms.includes(testRoomName) && Math.random() < 0.9) {
					continue;
				}

				if (Memory.rooms[testRoomName] && Memory.rooms[testRoomName].restrictHarvestingUntil !== undefined) {
					if (Memory.rooms[testRoomName].restrictHarvestingUntil > Game.time) {
						continue;
					}
					else {
						Memory.rooms[testRoomName].restrictHarvestingUntil = undefined;
					}
				}
				if ((Memory.rooms[testRoomName] && Memory.rooms[testRoomName].owner) || intelAI.getEnemyRoomSet().has(testRoomName)) {
					continue;
				}
			}

			var sectorCoords = util.getSectorCoords(testRoomName);
			if (sectorCoords.x % 10 == 0 || sectorCoords.y % 10 == 0) continue;

			if (!Memory.rooms[testRoomName] || !util.isRoomAccessible(testRoomName)) continue;
			// Avoid really long routes. Got to be >4 as you can cover 3 rooms in 3 ticks.
			// Maybe could do better by looking at exit directions

			let maxRange = 4 + (maxLinearRange == 3 ? 1 : 0);
			if (claimScan || (Game.rooms[homeRoomName] && Game.rooms[homeRoomName].effectiveLevel && Game.rooms[homeRoomName].effectiveLevel < 7)) {
				maxRange = 3 + (maxLinearRange == 3 ? 1 : 0);
			}

			// Force safe route completion here.
			let routeCost = safeRoute.getSafeRouteCost(homeRoomName, testRoomName, false, true, maxRange);
			// console.log(homeRoomName, testRoomName, routeCost, maxRange)
			if (routeCost > maxRange) continue

			// Used to drop it as range goes out, but that doesn't really make sense tbh
			let refreshChance = (claimScan || (Memory.tick < 1000)) ? 1 : 0.15
			// let refreshChance = (claimScan || (Memory.tick < 1000)) ? 1 : 0.25 - rangeMod * (Math.abs(i) + Math.abs(j))

			if (Memory.rooms[testRoomName].DT > 1.5) {
				refreshChance *= 2;
			}
			if (Memory.rooms[testRoomName].DT > 1) {
				refreshChance *= 2;
			}
			if (Memory.rooms[testRoomName].DT > 0.5) {
				refreshChance *= 2;
			}
			if (Game.rooms[testRoomName] && Game.rooms[testRoomName].dangerous == 2) {
				refreshChance *= 2;	
			}

			if (hardRefresh) {
				refreshChance *= 10;
			}
			if (Game.cpu.getUsed() > 400) {
				refreshChance /= 10;
			}
			if (Game.cpu.getUsed() > 450) {
				refreshChance /= 10;
			}

			// Always refresh keeper rooms, barring anything else, to track mineral refreshes
			if (sectorCoords.x % 10 <= 6 && sectorCoords.x % 10 >= 4 && sectorCoords.y % 10 <= 6 && sectorCoords.y % 10 >= 4) {
				refreshChance *= 1 / 0.15
			}


			var value = _.clone(roomAI.getRemoteHarvestingValue(homeRoomName, testRoomName, false, refreshChance, claimScan));

			if (value.v <= 0) {
				continue
			}

			let currentlyUsed = false

			// We're already on this room, so give it a nudge to stop too much swapping
			if (!claimScan) {				
				if (Memory.rooms[homeRoomName].goodRooms && Memory.rooms[homeRoomName].goodRooms.includes(testRoomName)) {
					currentlyUsed = true
					value.v *= 1.1;
					// value.u /= 1.1;
					// value.c /= 1.1;
				}
				else {
					// Got to build infrastructure
					value.u *= 1.1
					value.c *= 1.1
				}

				if (Memory.rooms[testRoomName].reservedBy != util.getMyName()) {
					// Don't try to take on invader cores at very low RCL
					if (Game.rooms[homeRoomName] && Game.rooms[homeRoomName].effectiveLevel < 4 && Memory.rooms[testRoomName].reservedBy == "Invader") {
						continue
					}

					if (Game.rooms[testRoomName] && Game.rooms[testRoomName].containers.length) {
						value.v /= 1.1;
						value.u *= 1.1;
						value.c *= 1.1;
					}
					else {						
						value.v /= 1.2;
						value.u *= 1.2;
						value.c *= 1.2;
					}
				}
				else if (Game.rooms[testRoomName] && Game.rooms[testRoomName].containers.length) {
					value.v *= 1.05
				}				


				if (Memory.rooms[testRoomName].reservedBy == util.getMyName()) {
					// At 5000 ticks this is 1.1x.
					value.v *= 1 + (Memory.rooms[testRoomName].reserveTicksToEnd || 0) / 50000
				}


				if (sectorCoords.x % 10 <= 6 && sectorCoords.x % 10 >= 4 && sectorCoords.y % 10 <= 6 && sectorCoords.y % 10 >= 4) {
					if (Memory.rooms[testRoomName].mineralAmount && Memory.botArena) {
						value.v *= 1.1;
					}
					// Don't want to bounce off these if we can avoid it
					if (Memory.rooms[homeRoomName].keeperHarvestRooms && Memory.rooms[homeRoomName].keeperHarvestRooms.includes(testRoomName)) {
						currentlyUsed = true
						value.v *= 1.1;
						// value.u /= 1.1;
						// value.c /= 1.1;
					}
					else if (Memory.rooms[homeRoomName].centreHarvestRooms && Memory.rooms[homeRoomName].centreHarvestRooms.includes(testRoomName)) {
						currentlyUsed = true
						value.v *= 1.05;
						// value.u /= 1.1;
						// value.c /= 1.1;
					}
					else {
						// Got to build infrastructure
						value.u *= 1.1
						value.c *= 1.1
					}
				}

				// We've got more energy than we need to focus a few rooms up. 
				// Try to free up the spawns for other duties
				if (Memory.season1 && Game.time - (Memory.lastHighEnergyUpgradingTrigger || 0) < 20000) {
					value.u *= 1.05
				}
			}
			
			// console.log(testRoomName, JSON.stringify(value))

			let minValue
			if (currentlyUsed || Memory.rooms[testRoomName].reservedBy == util.getMyName()) {
				minValue = 0
			}
			else if (Game.rooms[testRoomName] && Game.rooms[testRoomName].containers.length) {
				minValue = 0.5
			}
			else {
				minValue = 1
			}

			// If we're not using it currently there's some setup cost. Set a higher threshold
			if (value.v > minValue) {
				value = _.clone(value);
				value.parentRoom = homeRoomName;
				value.testRoomName = testRoomName;

				remoteRooms.push(value);
			}
		}
	}
	return remoteRooms;
}

function analyseSKMineRooms(homeRoomName, claimScan) {
	var skMineRooms = []

	if (!claimScan && Game.rooms[homeRoomName].effectiveLevel < 7) return skMineRooms;
	if (!Memory.rooms[homeRoomName]) return skMineRooms;

	let hardRefresh = Math.random() * Game.myRooms.length < 4 && Game.cpu.bucket > 9000;

	let maxLinearRange = Game.market.credits === 0 && !claimScan ? 4 : 3

	var baseCoords = util.getRoomCoords(homeRoomName);
	// Allow harvesting in a 5x5 tile.
	for (var i = -maxLinearRange; i <= maxLinearRange; i++) {
		for (var j = -maxLinearRange; j <= maxLinearRange; j++) {
			if (i == 0 && j == 0 || (Math.abs(i) + Math.abs(j) >= maxLinearRange + 2)) continue;
			var coords = {"x": baseCoords.x + i, "y" : baseCoords.y + j};
			var testRoomName = util.getRoomNameFromCoords(coords);

			if (!Memory.rooms[testRoomName]) continue
			if (Memory.rooms[testRoomName].invCL) continue;
			if (!Memory.rooms[testRoomName].mineralAmount) continue;

			if (!marketTrader.isMineralRequired(roomIntel.getMineralType(testRoomName))) {
				continue	
			}

			// If we've failed to path there before, lets skip over it most of the time.
			if (Memory.rooms[homeRoomName].incompleteHarvestPathRooms && Memory.rooms[homeRoomName].incompleteHarvestPathRooms.includes(testRoomName) && Math.random() < 0.9) {
				continue;
			}

			if (Memory.rooms[testRoomName] && Memory.rooms[testRoomName].restrictHarvestingUntil !== undefined) {
				if (Memory.rooms[testRoomName].restrictHarvestingUntil > Game.time) {
					continue;
				}
				else {
					Memory.rooms[testRoomName].restrictHarvestingUntil = undefined;
				}
			}

			var sectorCoords = util.getSectorCoords(testRoomName);
			if (sectorCoords.x < 4 || sectorCoords.y < 4 || sectorCoords.x > 6 || sectorCoords.y > 6) continue;

			console.log(testRoomName, util.isRoomAccessible(testRoomName))

			if (!util.isRoomAccessible(testRoomName)) continue;

			if (Memory.usedRemotes.includes(testRoomName)) {
				continue;
			}

			// Avoid really long routes. Got to be >4 as you can cover 3 rooms in 3 ticks.
			// Maybe could do better by looking at exit directions
			let routeCost = safeRoute.getSafeRouteCost(homeRoomName, testRoomName, false, false, maxLinearRange + 2);

			if (routeCost > maxLinearRange + 2) continue

			// let refreshChance = claimScan ? 1 : (0.2 - 0.04 * (Math.abs(i) + Math.abs(j)))
			let refreshChance = (claimScan || (Memory.tick < 1000)) ? 1 : 0.15

			if (hardRefresh) {
				refreshChance *= 10;
			}

			// Returns {"value" : int, "util" : int}
			// Value takes utilization into account, but we want to take it into account here
			// as well. Utilization accounts for multiple spawns in larger rooms.
			var value = _.clone(roomAI.getRemoteSKMineralValue(homeRoomName, testRoomName, false, refreshChance, claimScan));


			// We're already on this room, so give it a nudge to stop too much swapping
			if (Memory.rooms[homeRoomName].goodRooms && Memory.rooms[homeRoomName].goodRooms.includes(testRoomName) && !Memory.rooms[homeRoomName].keeperHarvestRooms.includes(testRoomName)) {
				value.v *= 1.25;
				value.u *= 0.9;
			}

			if (Game.rooms[homeRoomName] && Game.rooms[homeRoomName].controller.my) {
				// Prefer RCL 8
				if (Game.rooms[homeRoomName].effectiveLevel == 8) {
					value.v *= 1.1;
				}
			}



			if (value.v > 0) {
				value.parentRoom = homeRoomName;
				value.testRoomName = testRoomName;

				skMineRooms.push(value);
			}
		}
	}
	return skMineRooms;
}





var overseerAI = {
	tickStart : function() {
		let cpu = Game.cpu.getUsed()

		if (Memory.season2) {
			overseerSeason.season2TickStart();
		}

		if (Memory.totalRooms === undefined || Math.random() < 0.01) {
			Memory.totalRooms = 0;
			for (let shard of global.activeShards) {
				if (shard == Game.shard.name) {
					Memory.totalRooms += Game.myRooms.length
					if (shard == "shard1") {
						Memory.hasRoomOnShard1 = Game.myRooms.length ? 1 : 0
					}
				}
				else {					
					let isMemory = interShardMemoryManager.getMem(shard)
					Memory.totalRooms += Object.keys(isMemory.myRooms || {}).length
					if (!Memory.attemptShard1StartTick) {
						Memory.attemptShard1Claim = Memory.attemptShard1Claim || isMemory.attemptShard1Claim
					}
					if (shard == "shard1") {
						Memory.hasRoomOnShard1 = Object.keys(isMemory.myRooms || {}).length ? 1 : 0
					}
				}
			}

			if (!Memory.attemptShard1StartTick && Memory.attemptShard1Claim && (Memory.totalRooms < Game.gcl.level || Memory.hasRoomOnShard1)) {
				Memory.attemptShard1StartTick = Game.time
				delete Memory.attemptShard1Claim
			}
			// Fail condition. Trying for 50k ticks and still have a room free
			// Now it can happen that I still have a room on shard 1 when this happens - if I get gcl for some other reason
			// So this is kinda cutting it off if so. I guess that's ok
			else if (Memory.attemptShard1StartTick && Game.time - Memory.attemptShard1StartTick > 50000 && Memory.totalRooms < Game.gcl.level) {
				delete Memory.attemptShard1Claim
				delete Memory.attemptShard1StartTick				
			}
		}

		// If we have x rooms at full strength, empireStrength is x
		if (Memory.empireStrength === undefined || Math.random() < 0.01) {
			Memory.empireStrength = 0.125 * (Game.myRooms.length + Memory.totalRooms) / 2

			for (let room of Game.myRooms) {
				Memory.empireStrength += 0.375 * room.effectiveLevel / 8
			}

			// Only gets max score when it has 12k of everything per room
			if (Game.myRooms.length) {
				Memory.empireStrength += (0.5 / 6) * Math.min(2 * Game.myRooms.length, (Memory.stats.globalResources["XKHO2"] || 0) / 12000)
				Memory.empireStrength += (0.5 / 6) * Math.min(2 * Game.myRooms.length, (Memory.stats.globalResources["XLHO2"] || 0) / 12000)
				Memory.empireStrength += (0.5 / 6) * Math.min(1 * Game.myRooms.length, (Memory.stats.globalResources["XZHO2"] || 0) / 12000)
				Memory.empireStrength += (0.5 / 6) * Math.min(1 * Game.myRooms.length, (Memory.stats.globalResources["XUH2O"] || 0) / 12000)
			}

			// Want to supress it to focus on minerals for factories
			if (Memory.season4) {
				Memory.empireStrength /= 2
			}
		}

		// TODO: Refactor this so it's just memory
		global.totalRooms = Memory.totalRooms

		if (!Memory.privateServer && !Memory.botArena && !Memory.swc && !Memory.season && !Memory.timedRound) {
			// Keep a room
			if (global.totalRooms == Game.gcl.level - 1) {
				global.totalRooms = Game.gcl.level
			}
		}


		if (Memory.debugScoutRefresh || (((Game.time - (Memory.lastScoutRefresh || 0) > 1000 && Math.random() > 0.99) || Memory.tick < 10000) && Game.cpu.getUsed() < 100 && Game.cpu.getUsed() < Game.cpu.limit / 3)) {
			delete Memory.debugScoutRefresh
			Memory.lastScoutRefresh = Game.time
			// Last ones are the highest priority. That way I can pop
			function compare(roomName1, roomName2) {
				var t1 = Game.time - ((Memory.rooms[roomName1] && Memory.rooms[roomName1].lo) || 0);
				var t2 = Game.time - ((Memory.rooms[roomName2] && Memory.rooms[roomName2].lo) || 0);

				// Honestly, it doesn't matter a whole lot if we've got particularily old data
				// Noise mixes things up a bit
				t1 += Math.random() * 4000;
				t2 += Math.random() * 4000;

				t1 = Math.min(10000, t1)
				t2 = Math.min(10000, t2)
				// Hit the enemy owned rooms a bit more often
				if (Memory.rooms[roomName1] && Memory.rooms[roomName1].owner && Memory.rooms[roomName1].owner != util.getMyName()) {
					t1 -= 2000;
					if (Memory.rooms[roomName1].rcl != 8) {
						t1 -= 2000
					}
					if (Memory.rooms[roomName1].nukeLandTime && Memory.rooms[roomName1].nukeLandTime - Game.time < 1500) { 
						t1 -= 2000
					}
				}

				if (Memory.rooms[roomName2] && Memory.rooms[roomName2].owner && Memory.rooms[roomName2].owner != util.getMyName()) {
					t2 -= 2000;
					if (Memory.rooms[roomName2].rcl != 8) {
						t2 -= 2000
					}
					if (Memory.rooms[roomName2].nukeLandTime && Memory.rooms[roomName2].nukeLandTime - Game.time < 1500) { 
						t2 -= 2000
					}
				}


				return t1 - t2;
			}
			// Handle scouting
			let scoutRooms = [];
			for (var room of _.shuffle(Game.myRooms)) {
				if (Game.cpu.getUsed() > Game.cpu.limit / 3) break;
				// Scout +/- rcl. Don't bother with centre rooms or highways
				var baseCoords = util.getRoomCoords(room.name);
				var sectorCoords = util.getSectorCoords(room.name);

				var radius = Math.round(room.controller.level * 1.5);

				for (var i = -radius; i <= radius; i++) {
					for (var j = -radius; j <= radius; j++) {
						let coords = {"x": baseCoords.x + i, "y" : baseCoords.y + j};


						var newRoomName = util.getRoomNameFromCoords(coords)
						let sectorCoords = util.getSectorCoords(newRoomName);

						if (sectorCoords.x == 0 || sectorCoords.y == 0) continue

						if (scoutRooms.includes(newRoomName)) continue;


						if (!Game.rooms[newRoomName] && Game.time - (Memory.rooms[newRoomName] ? (Memory.rooms[newRoomName].lo || - 1000) : -1000) > 250 && util.isRoomAccessible(newRoomName)) {
							let pathCost = safeRoute.getSafeRouteCost(room.name, newRoomName, false, false, Math.min(15, 2 * radius));

							if (pathCost <= Math.min(15, 2 * radius)) {
								scoutRooms.push(newRoomName);
							}
						}
					}
				}
			}
			scoutRooms.sort(compare);
			Memory.scoutRooms = scoutRooms;

		}
		// console.log(Memory.scoutRooms.length, Memory.scoutRooms)

		Memory.stats.profiler["overseerStart1"] = Game.cpu.getUsed() - cpu
		cpu = Game.cpu.getUsed()		

		for (var room of Game.myRooms) {
			let mem = Memory.rooms[room.name]
			room.goodRooms = _.clone(mem.goodRooms) || [room.name];
			room.regularHarvestRooms = _.clone(mem.regularHarvestRooms) || [];
			room.doubleHarvestRooms = _.clone(mem.doubleHarvestRooms) || [];
			room.protectRooms = _.clone(mem.protectRooms) || [];
			room.observeRooms = _.clone(mem.observeRooms) || [];
			room.lootRooms = _.clone(mem.lootRooms) || [];
			room.powerRooms = _.clone(mem.powerRooms) || [];
			room.depositRooms = _.clone(mem.depositRooms) || [];
			room.convoyRooms = _.clone(mem.convoyRooms) || [];
			room.buildRooms = _.clone(mem.buildRooms) || [room.name];
			room.centreHarvestRooms = _.clone(mem.centreHarvestRooms) || [];
			room.keeperHarvestRooms = _.clone(mem.keeperHarvestRooms) || [];
			room.keeperMineRooms = _.clone(mem.keeperMineRooms) || [];
		}

		Memory.stats.profiler["overseerStart2"] = Game.cpu.getUsed() - cpu
		cpu = Game.cpu.getUsed()		

		// Global resource census
		if (Game.cpu.getUsed() < 100 && (Game.time - (Memory.lastTerminalNetworkCheck || 0) > 200) && Math.random() < 0.1) {
			Memory.lastTerminalNetworkCheck = Game.time

			let numTerminals = 0
			Memory.terminalNetworkFreeEnergy = 0;
			for (let loopRoom of Game.myRooms) {
				if (loopRoom.effectiveLevel >= 6 && loopRoom.terminal) {
					numTerminals++;
					let mod = ((loopRoom.defcon - 1) / 4) * 0.8;

					// Can go negative
					if (loopRoom.upgradeFocus) {
						Memory.terminalNetworkFreeEnergy += (loopRoom.getStoredEnergy() * mod - constants.ROOM_ENERGY_NO_UPGRADERS) || 0
					}
					else {
						Memory.terminalNetworkFreeEnergy += (loopRoom.getStoredEnergy() * mod - constants.ROOM_ENERGY_BUY) || 0
					}

					let batteryRatio = 0.5 * COMMODITIES[RESOURCE_ENERGY].amount / COMMODITIES[RESOURCE_ENERGY].components[RESOURCE_BATTERY]

					if (loopRoom.storage) Memory.terminalNetworkFreeEnergy += batteryRatio * loopRoom.storage.store[RESOURCE_BATTERY]
					if (loopRoom.terminal) Memory.terminalNetworkFreeEnergy += batteryRatio * loopRoom.terminal.store[RESOURCE_BATTERY]
					if (loopRoom.factory) Memory.terminalNetworkFreeEnergy += batteryRatio * loopRoom.factory.store[RESOURCE_BATTERY]
				}
			}

			if (numTerminals <= 1) {
				Memory.terminalNetworkFreeEnergy = 0
			}

			Memory.stats.globalResources["terminalNetworkFreeEnergy"] = Memory.terminalNetworkFreeEnergy

		}

		if (Game.cpu.getUsed() < 100 && (Game.time - (Memory.lastGlobalResourceCensus || 0) > 500) && Math.random() < 0.1) {
			Memory.lastGlobalResourceCensus = Game.time
			Memory.stats.globalResources = Memory.stats.globalResources || {};
			for (let resource of RESOURCES_ALL) {
				let resourceAmount = 0;
				for (let loopRoom of Game.myRooms) {
					if (loopRoom.effectiveLevel >= 6 && loopRoom.terminal) {
						resourceAmount += loopRoom.getCurrentOfResource(resource)
					}
				}

				Memory.stats.globalResources[resource] = resourceAmount
			}

			if ((Math.random() < 0.1 || !Memory.totalWealth) && Game.cpu.getUsed() < 100 && Game.market.credits) {
				Memory.totalWealth = 0
				for (let loopRoom of Game.myRooms) {
					if (loopRoom.effectiveLevel < 6 || !loopRoom.terminal) continue

					let roomWealth = 0
					for (let resource of RESOURCES_ALL) {
						roomWealth += loopRoom.getCurrentOfResource(resource) * (loopRoom.mem.avgExportValues[resource] || 0)
					}

					roomWealth /= loopRoom.mem.energyPrice

					Memory.totalWealth += roomWealth
				}
			}
		}

		Memory.stats.profiler["overseerStart3"] = Game.cpu.getUsed() - cpu
		cpu = Game.cpu.getUsed()		

		if (Math.random() < 0.1) {			
			const alpha = Math.exp(-(1/25000) * 10);
			// Decay hate
			Memory.stats.hateCounter = Memory.stats.hateCounter || {};
			for (let playerName in Memory.stats.hateCounter) {
				Memory.stats.hateCounter[playerName] = alpha * Memory.stats.hateCounter[playerName];

				if (Memory.stats.hateCounter[playerName] < 1 || playerName == "Invader") {
					delete Memory.stats.hateCounter[playerName];
				}
			}

			// Decay focus
			Memory.attackFocus = Memory.attackFocus || {};
			for (let playerName in Memory.attackFocus) {
				Memory.attackFocus[playerName] = alpha * Memory.attackFocus[playerName];

				if (Memory.attackFocus[playerName] < 0.01 || playerName == "Invader") {
					delete Memory.attackFocus[playerName];
				}
			}
		}

		Memory.stats.profiler["overseerStart4"] = Game.cpu.getUsed() - cpu
		cpu = Game.cpu.getUsed()		


		Memory.claimScanData = Memory.claimScanData || {}

		// Make sure we have no orphans
		if (Math.random() < 0.01 || Game.time - (Memory.claimScanData.lastClaimerSpawnedTick || 0) < 1500) {
			for (let room of Game.myRooms) {
				room.orphaned = true;
				if (Math.random() < 0.01) {
					room.memory.childRooms = []
				}
			}
			for (let room of Game.myRooms) {
				for (let childRoomName of room.memory.childRooms) {
					// 0.01 * -0.01 = 1 in 10,000 we try to reassign
					if (Game.rooms[childRoomName] && Math.random() > 0.01) {
						Game.rooms[childRoomName].orphaned = false;
					}
				}
			}
			for (let room of _.shuffle(Game.myRooms)) {
				if (room.orphaned) {
					let bestScore = Infinity;
					let bestRoom;
					for (let room2 of _.shuffle(Game.myRooms)) {
						if (room == room2) continue;

						if (room2.effectiveLevel < 4 || room2.effectiveLevel < room.effectiveLevel) continue;
						if (room2.memory.spawnUtilization > 0.975) continue

						let dist = safeRoute.getSafeRouteCost(room2.name, room.name, true);
						let score = dist * 1.5 - room2.effectiveLevel + (room2.memory.childRooms || []).length + room2.memory.spawnUtilization * 5 - room2.defcon * 5;

						if (room2.memory.lastBreached) {
							if (Game.time - room2.memory.lastBreached < 50000) {
								score += 5;
							}
							else if (Game.time - room2.memory.lastBreached < 100000) {
								score += 2;
							}
						}

						if (dist < 15 && score < bestScore) {
							bestScore = score;
							bestRoom = room2;
						}
					}

					if (bestRoom) {
						bestRoom.memory.childRooms = bestRoom.memory.childRooms || [];
						bestRoom.memory.childRooms.push(room.name)
						bestRoom.memory.childRooms = _.uniq(bestRoom.memory.childRooms);
						if (Math.random() < 0.01) console.log("Orphan room found", bestRoom.name, "is now parent of", room.name)
					}
				}
			}
		}

		Memory.stats.profiler["overseerStart5"] = Game.cpu.getUsed() - cpu
		cpu = Game.cpu.getUsed()		


		// Boom or attack?
		if (Memory.botArena) {
			Memory.boomMode = 0;
			Memory.attackMode = 0;
			Memory.powerBoom = 0;

			// If we have a nice place to expand, boom.
			// If we don't, attack.
			// If we don't know, do neither.

			if (Memory.numExpansionRooms === undefined || Math.random() < 0.001) {
				let cpu = Game.cpu.getUsed();
				// This is super lazy. 
				let expansionRooms = [];
				for (var room of _.shuffle(Game.myRooms)) {
					var baseCoords = util.getRoomCoords(room.name);
					var sectorCoords = util.getSectorCoords(room.name);

					var radius = 7;

					for (var i = -radius; i <= radius; i++) {
						for (var j = -radius; j <= radius; j++) {
							let coords = {"x": baseCoords.x + i, "y" : baseCoords.y + j};

							// if (Math.abs(i) + Math.abs(j) <= 2) continue

							var newRoomName = util.getRoomNameFromCoords(coords)
							let sectorCoords = util.getSectorCoords(newRoomName);

							if (sectorCoords.x == 0 || sectorCoords.y == 0) continue
							if (sectorCoords.x >= 4 && sectorCoords.x <= 6 && sectorCoords.y >= 4 && sectorCoords.y <= 6) continue

							if (expansionRooms.includes(newRoomName)) continue

							if (Memory.rooms[newRoomName] && roomIntel.getEffectiveNumSources(newRoomName) == 2 && !Memory.rooms[newRoomName].owner && !Memory.rooms[newRoomName].reservedBy && util.isRoomAccessible(newRoomName)) {
								let pathCost = safeRoute.getSafeRouteCost(room.name, newRoomName, false, false, 9);

								if (pathCost > 2 && pathCost <= 9) {
									let minRouteCost = pathCost
									for (let routeRoom of Game.myRooms) {
										if (routeRoom.name == room.name) continue
										let testRouteCost = safeRoute.getSafeRouteCost(routeRoom.name, newRoomName, true, true);

										if (testRouteCost < minRouteCost) {
											minRouteCost = testRouteCost;
											if (minRouteCost <= 2) {
												break;
											}
										}
									}
									if (minRouteCost > 2) {
										expansionRooms.push(newRoomName)
									}
								}
							}
						}
					}
				}

				console.log(Game.cpu.getUsed() - cpu, expansionRooms)

				Memory.numExpansionRooms = expansionRooms.length;
			}

			if (Memory.numExpansionRooms > 8 + 0.5 * Game.gcl.level) {
				// let minDefcon = 5;
				// for (let room of Game.myRooms) {
				// 	console.log(room.defcon)
				// 	minDefcon = Math.min(room.defcon, minDefcon)
				// }

				if (Game.gcl.level < (Memory.gclCPULimit || Infinity) || Memory.stats.avgBucket > 9500) {					
					let now = Date.now()
					Memory.startWallTime = Memory.startWallTime || now;

					const sevenDaysInMs = 7 * 24 * 3600 * 1000;

					// Second week don't boom unless winning
					if (Memory.timedRound && Memory.maxRoomLevel == 8 && now - Memory.startWallTime > sevenDaysInMs) {
						let maxEnemyGCL = _.max(Memory.gclEstimates);
						let maxEnemyGCLEnergy = _.max(Memory.gclEnergyEstimates);


						if (Game.gcl.level > maxEnemyGCL) {
							let myGCLEnergy = Game.gcl.progress

							if (Game.gcl.level > 1) {
								myGCLEnergy += (Math.pow(Game.gcl.level - 1, 2.4) - Math.pow(Game.gcl.level - 2, 2.4)) * 1e6
							}

							if (Game.gcl.progress > maxEnemyGCLEnergy) {
								Memory.boomMode = 1;
							}
						}
					}
					else {
						Memory.boomMode = 1;
					}
				}
			}
			else if (Memory.numExpansionRooms < 4 + 0.5 * Game.gcl.level && Memory.maxRoomLevel >= 7) {
				Memory.attackMode = 1;
			}

			if (Memory.season && Game.gcl.level >= constants.SEASON_TARGET_GCL) {
				Memory.boomMode = 0
			}

			if (Memory.minRoomLevel == 8 && (Game.gpl.level < 2 * Game.gcl.level || Game.gcl.level >= (Memory.gclCPULimit || Infinity)) && !Memory.disablePower) {
				if (Memory.timedRound) {
					let now = Date.now()
					Memory.startWallTime = Memory.startWallTime || now;

					let sevenDaysInMs = 7 * 24 * 3600 * 1000;

					// Second week don't boom unless winning
					if (now - Memory.startWallTime < sevenDaysInMs) {
						Memory.powerBoom = 1;
					}
				}
				else {
					Memory.powerBoom = 1;
				}
			}
		}


		// If we have multiple RCL 7 rooms on BA/SWC, disable upgrading on the one furthest from RCL 8.
		// if (Memory.botArena) {
		if (!Memory.economyArena) {
			let mostProgress = 0;
			let mostProgressRoom;
			let maxLevel = 0
			let minLevel = 8
			let numRCL6Plus = 0
			let numRCL6PlusTerminal = 0
			let numRCL7Plus = 0
			let nonRCL8TerminalRooms = false

			let bestRCL7PriorityRoomScore = -Infinity
			let RCL7PriorityRoom

			let mostProgressRCL6 = 0;
			let mostProgressRoomRCL6;


			for (let room of Game.myRooms) {
				maxLevel = Math.max(maxLevel, room.effectiveLevel)
				minLevel = Math.min(minLevel, room.effectiveLevel)
				if (room.controller.level >= 6 && room.effectiveLevel >= 6) {
					numRCL6Plus++;
					if (room.terminal) {
						numRCL6PlusTerminal++;
						if (room.controller.level == 6 && 
							room.effectiveLevel == 6 && 
							room.controller.progress > mostProgressRCL6 &&
							(!Memory.season5 || room.mem.claimToUnclaimRoom)) {
							mostProgressRCL6 = room.controller.progress;
							mostProgressRoomRCL6 = room;
						}
					}


					if (room.controller.level >= 7 && room.effectiveLevel >= 7) {
						numRCL7Plus++;
						if (room.controller.level == 7 && room.effectiveLevel == 7) {
							if (room.controller.progress > mostProgress) {
								mostProgress = room.controller.progress;
								mostProgressRoom = room;
							}

							let RCL7PriorityRoomScore = (room.controller.progress / room.controller.progressTotal) * 100 - room.memory.storageControllerLinkDist

							if (RCL7PriorityRoomScore > bestRCL7PriorityRoomScore) {
								bestRCL7PriorityRoomScore = RCL7PriorityRoomScore
								RCL7PriorityRoom = room
							}
						}
					}
				}
			}

			Memory.numRCL6Plus = numRCL6Plus;
			Memory.numRCL7Plus = numRCL7Plus;
			Memory.numRCL6PlusTerminal = numRCL6PlusTerminal

			if (maxLevel == 6 && numRCL6PlusTerminal > 1) {
				for (let room of Game.myRooms) {
					if (room.controller.level >= 6 && room.effectiveLevel >= 6) {
						if (room.controller.progress > mostProgress) {
							mostProgress = room.controller.progress;
							mostProgressRoom = room;
						}
					}
				}
			}

			// Not sure why this can't be shard specific.
			/*if (maxLevel < 8) {	
				// I don't like this, but otherwise we parse isMemory every tick
				if (!Memory.botArena && global.activeShards.length > 1)	{
					maxLevel = 8;
				}
				// for (let shard of global.activeShards) {
				// 	if (shard == Game.shard.name) {
				// 		continue
				// 	}
				// 	else {					
				// 		let isMemory = interShardMemoryManager.getMem(shard)
				// 		for (let roomName in isMemory.myRooms) {
				// 			if (isMemory.myRooms[roomName].el >= maxLevel) {
				// 				maxLevel = isMemory.myRooms[roomName].el
				// 			}
				// 		}
				// 	}
				// }
			}*/

			Memory.maxRoomLevel = maxLevel;
			Memory.minRoomLevel = minLevel;

			let goWildEnergy;

			// Hysteresis - honestly, pretty pointless. The trigger is useful though - can use it to long term
			// focus on non-energy
			if (Memory.highEnergyUpgrading) {
				goWildEnergy = (Memory.terminalNetworkFreeEnergy || 0) >= (Memory.boomMode ? 0.74e6 : 0.99e6)
				if (!goWildEnergy) {
					Memory.highEnergyUpgrading = 0
				}
			}
			else {
				goWildEnergy = (Memory.terminalNetworkFreeEnergy || 0) >= (Memory.boomMode ? 0.76e6 : 1.01e6)
				if (goWildEnergy) {
					Memory.highEnergyUpgrading = 1
					Memory.lastHighEnergyUpgradingTrigger = Game.time
				}
			}				

			if (minLevel < 8) {
				for (let room of Game.myRooms) {
					// Stop rooms at RCL 7.
					if (room.controller.level == 7 && room.effectiveLevel == 7) {
						if (numRCL7Plus > 1) {
							if (room == RCL7PriorityRoom && !Memory.noRCL8) {
								if (!mostProgressRoomRCL6 ||
									!mostProgressRoomRCL6.terminal ||
									mostProgressRoomRCL6.getStoredEnergy() > 75000) {
									room.upgradeFocus = 1;	
								}							
							}
							else if (!goWildEnergy) {
								room.restrictUpgraders = 1;
							}
						}
						else if (numRCL6PlusTerminal > 1 && !goWildEnergy) {
							room.restrictUpgraders = 1;
						}
						// Intershard stuff
						else if (!Memory.privateServer && Game.myRooms.length == 1) {
							room.upgradeFocus = 1;
						}
					}
					else if (maxLevel == 6) {
						if (room.controller.level == 6 && room.effectiveLevel == 6) {
							if (numRCL6PlusTerminal > 1) {
								if (room == mostProgressRoom) {
									room.upgradeFocus = 1;
								}
								else if (!goWildEnergy) {
									room.restrictUpgraders = 1;
								}
							}
						}
					}
				}
			}
			if (maxLevel >= 7) {
				for (let room of Game.myRooms) {
					if (room.effectiveLevel < maxLevel && !room.restrictUpgraders) {
						if (room == mostProgressRoomRCL6 || 
							room.controller.level < 6 || 
							room.effectiveLevel < 6 || 
							maxLevel == 8) {
							room.upgradeFocus = 1;	
						} else if (mostProgressRoomRCL6 && mostProgressRoomRCL6.getStoredEnergy() > 75000) {
							room.upgradeFocus = 1;	
						}
						
						if (room.effectiveLevel >= 6) {
							if (room.terminal) {
								nonRCL8TerminalRooms = true;
							}
							else if (!Memory.noTerminals) {
								// Let it build the terminal!
								room.upgradeFocus = 0
							}
						} else {
							room.upgradeFocus = 1
						}
					}
				}
				// Don't waste energy on only RCL 8 GCL if we can build RCL
				if (nonRCL8TerminalRooms && maxLevel == 8) {
					for (let room of Game.myRooms) {
						if (room.effectiveLevel == 8 && (Memory.terminalNetworkFreeEnergy || 0) < (Memory.boomMode ? 1.0e6 : 1.5e6)) {
							room.restrictUpgraders = 1;
						}
					}
				}
			}

			// Actually doesn't matter much getting rooms at RCL 8 on seasonal
			// Energy transfer costs start to bite hard (season 2, ~15% of GCL/tick spent on energy transfers pre RCL 8)
			// Once we have one RCL 8 (for power, combat, observer) just let the others run naturally. 
			// GCL and new RCL 7s will be the big source of new spawns
			if (Memory.season && Memory.maxRoomLevel == 8) {
				// Basically removes restrictUpgraders
				for (let room of Game.myRooms) {
					if (room.controller.level != 8) {
						room.restrictUpgraders = 0;
					}
					// Don't restrict upgraders if we're CPU bound
					else if (Memory.stats.yieldPerCPU !== 0) {
						room.restrictUpgraders = 0;	
					}
					// else if (Game.gcl.level == 11) {
					// 	room.restrictUpgraders = 1;
					// }
				}
			}


			if (Math.random() < 0.001) {				
				if ((Memory.maxEnemyRoomLevel || 0) != 8) {
					Memory.maxEnemyRoomLevel = 1;
					for (let roomName of Memory.enemyRooms) {
						if (Memory.rooms[roomName] && Memory.rooms[roomName].rcl) {
							Memory.maxEnemyRoomLevel = Math.max(Memory.maxEnemyRoomLevel, Memory.rooms[roomName].rcl)
						}
					}
				}
			}
			for (let room of Game.myRooms) {
				// If we're under attack keep a bit more energy about...
				if (room.upgradeFocus) {			
					if ((room.mem.attackScore || 0) > 0) {
						room.upgradeFocus = 0
					}
					if (room.defcon != 5) {
						room.upgradeFocus = 0
					}
				}
			}

			// Just upgrade flat in season 3.RCL does not matter much and not worth
			// burning energy in terminal transfers
			if (Memory.season3) {
				for (let room of Game.myRooms) {
					// if (room.effectiveLevel != 8) {
						room.restrictUpgraders = 0
					// }
					if (!Memory.highEnergyUpgrading) {
						room.upgradeFocus = 0
					}
				}
			}
		}
		else {
			let maxLevel = 0
			for (let room of Game.myRooms) {
				maxLevel = Math.max(maxLevel, room.effectiveLevel)

			}
			Memory.maxRoomLevel = maxLevel;
		}

		/*if (Memory.season1 && Game.gcl.level < 5) {
			// if (Game.rooms.E22S3.controller.level < 7) {
			// 	for (let room of Game.myRooms) {
			// 		room.restrictUpgraders = room.name != "E22S3"
			// 		room.upgradeFocus = room.name == "E22S3"
			// 	}
			// }
			// else {				
				for (let room of Game.myRooms) {
					room.restrictUpgraders = 0
					room.upgradeFocus = 1
				}
			// }
		}*/
		if (Memory.season5) {
			for (let room of Game.myRooms) {
				if (room.effectiveLevel == 6 && room.mem.claimToUnclaimRoom) {
					room.upgradeFocus = 0
					room.restrictUpgraders = 1
				}
			}	
		}
		


		Memory.stats.profiler["overseerStart6"] = Game.cpu.getUsed() - cpu
		
		global.bucketBurning = Game.cpu.bucket < 9000 && Memory.stats.avgCPU > 1.05 * Game.cpu.limit && Memory.stats.avgCPUFast > 1.1 * Game.cpu.limit

	},

	scoreRoom: function(newRoomName, roomIdx, routeLength, myRoom, coords, sectorCoords, claim) {
		if (Memory.season2 && false) {
			let currentDecoders = {}
			for (let room of Game.myRooms) {
				if (global.currentlyUnclaimingRoom == room.name) continue
				currentDecoders[room.mem.decoderType] = (currentDecoders[room.mem.decoderType] || 0) + 1
			}

			if (currentDecoders[Memory.rooms[newRoomName].decoderType]) {
				console.log("Already have", Memory.rooms[newRoomName].decoderType)
				return 0
			}
			else if (Memory.allyDecoders && Memory.allyDecoders.includes(Memory.rooms[newRoomName].decoderType)) {
				console.log("Ally has", Memory.rooms[newRoomName].decoderType)
				return 0
			}
		}


		var potentialRemoteRooms = analyseRemoteRooms(newRoomName, true);

		let isPortalClaim = claim && roomIdx >= Game.myRooms.length;

		if (Memory.season1 && roomIdx >= Game.myRooms.length) {
			console.log("Portal claims disabled on season")
			return 0
		}

		// Don't share remotes if we can get fresh ones.
		for (var testRoom of potentialRemoteRooms) {
			if (Memory.usedRemotes.includes(testRoom.testRoomName)) {
				// Claiming, or someone else has it.
				if (claim || !Game.rooms[newRoomName].goodRooms.includes(testRoom.testRoomName)) {
					testRoom.v /= 2;
				}
			}
		}

		console.log(JSON.stringify(coords))

		// Let cub be
		// if (Memory.season1 && coords.x < -20) {
		// 	console.log("Skipping due to cub/fiend/Xara")
		// 	return 0
		// }
		// if (Memory.season1 && coords.y > 0) {
		// 	console.log("Skipping due to qzar/north")
		// 	return 0
		// }
		if (Memory.season2) {
			if (coords.x >= 11 && coords.x <= 9 &&
				coords.y >= 11 && coords.y <= 19) {
				console.log("Skipping due to Montblanc")
				return 0
			}
			if (coords.x >= 1 && coords.x <= 9 &&
				coords.y >= 21 && coords.y <= 29) {
				console.log("Skipping due to merid")
				return 0
			}
			if (coords.x >= 11 && coords.x <= 19 &&
				coords.y >= -20 && coords.y <= -12) {
				console.log("Skipping due to Xeno")
				return 0
			}
		}
		if (Memory.season3 && Date.now() < 1628683200000 && coords.x >= 12) {
			console.log("Skipping due to Qzar")
			return 0
		}
		if (Memory.season4 && newRoomName == "E1S11") {
			return 0
		}

		potentialRemoteRooms.sort(function (a, b) {
			return a.v - b.v;
		});

		// console.log(JSON.stringify(potentialRemoteRooms))


		var potentialUsedRemotes = [];
		var remoteUtilization = 0;
		var remoteCPU = 0;
		var remoteValue = 0;
		while (potentialRemoteRooms.length > 0) {
			var remote = potentialRemoteRooms.pop();

			// console.log(JSON.stringify(remote))

			if (remote.v > 0) {
				remoteUtilization += remote.u;
				remoteCPU += remote.c;
				remoteValue += remote.v;
			}

			let maxUtil = Memory.season3 ? 1000 : 3500

			if (remoteUtilization >= maxUtil || remoteCPU >= 0.5 * Game.cpu.limit / (Game.myRooms.length + 1)) {
				break;
			}
		}

		// console.log("a", Game.cpu.getUsed())


		console.log("Scanning room A:", newRoomName, remoteValue, remoteUtilization, remoteCPU)

		var terrainModifier = 0;

		let roomTerrain = Game.map.getRoomTerrain(newRoomName)
		let wallScore = Memory.botArena ? 0.9 : 1.1
		// I don't much like swamps. I don't much like walls either
		for (var i = 2; i < 48; i++) {
			for (var j = 2; j < 48; j++) {
				var terrain = roomTerrain.get(i, j);
				if 		(terrain & TERRAIN_MASK_WALL)  terrainModifier += wallScore // Walls have pros and cons
				else if (terrain & TERRAIN_MASK_SWAMP) terrainModifier += 2 // Fookin' hate swamps
				else  								   terrainModifier += 1 // Love a good plain
			}
		}

		// 1=all planes, 2=all swamp.
		terrainModifier /= 46 * 46;

		let swampRatio = roomIntel.getSwampRatio(newRoomName)

		if (swampRatio > 0.25) {
			terrainModifier *= 1.25;
		}
		if (swampRatio > 0.5) {
			terrainModifier *= 1.25;
		}
		if (swampRatio > 0.75) {
			terrainModifier *= 1.25;
		}

		if (Memory.season3) {
			terrainModifier = (1 + terrainModifier) / 2
		}

		let wallRatio = roomIntel.getWallRatio(newRoomName)

		if (wallRatio < 0.2) {
			terrainModifier *= 1.1;
		}
		if (wallRatio < 0.1) {
			terrainModifier *= 1.1;
		}

		// console.log("b", Game.cpu.getUsed())


		// Prefer medium-busy non-swampy rooms.
		remoteValue /= terrainModifier;

		let numSources = roomIntel.getNumSources(newRoomName);

		// It's really useful to have two sources.
		if (Memory.season3) {
			remoteValue += 2 * 10;
			remoteValue *= Math.sqrt(2);
		}
		else {			
			remoteValue += numSources * 10;
			remoteValue *= Math.sqrt(numSources);
		}


		if (Memory.season5) {
			remoteValue += (Memory.rooms[newRoomName].thoriumAmount || 0) / 3000
			let roomCoords = util.getRoomCoords(newRoomName)

			for (let i = -3; i <= 3; i++) {
				for (let j = -3; j <= 3; j++) {
					if (Math.abs(i) + Math.abs(j) > 4) continue

					let newCoords = {x: roomCoords.x + i, y: roomCoords.y + j};

					let innerRoomName = util.getRoomNameFromCoords(newCoords)

					if (!Memory.rooms[innerRoomName]) continue
					if (Memory.rooms[innerRoomName].owner) continue

					remoteValue += (Memory.rooms[innerRoomName].thoriumAmount || 0) / (3000 * (1 + (Math.abs(i) + Math.abs(j))))
				}
			}
		}

		// Going for RCL 1->8 speed more important than RCL 8 perf

		let meanX = Memory.rooms[newRoomName].conX
		let meanY = Memory.rooms[newRoomName].conY

		for (var sourceIdx = 0; sourceIdx < numSources; sourceIdx++) {
			meanX += roomIntel.getSourceX(newRoomName, sourceIdx);
			meanY += roomIntel.getSourceY(newRoomName, sourceIdx);
		}

		meanX /= 1 + numSources
		meanY /= 1 + numSources

		let scoreMod = 0

		scoreMod += 0.001 * Math.max(Math.abs(meanX - Memory.rooms[newRoomName].conX), Math.abs(meanY - Memory.rooms[newRoomName].conY))
		scoreMod += 0.001 * (Math.abs(meanX - Memory.rooms[newRoomName].conX) + Math.abs(meanY - Memory.rooms[newRoomName].conY))

		let srcScoreMod = 0
		for (var sourceIdx = 0; sourceIdx < numSources; sourceIdx++) {
			let srcX = roomIntel.getSourceX(newRoomName, sourceIdx);
			let srcY = roomIntel.getSourceY(newRoomName, sourceIdx);

			srcScoreMod += 0.001 * Math.max(Math.abs(meanX - srcX), Math.abs(meanY - srcY))
			srcScoreMod += 0.001 * (Math.abs(meanX - srcX) + Math.abs(meanY - srcY))
		}

		srcScoreMod /= numSources;
		scoreMod += srcScoreMod

		// Not going to be larger than ~0.3
		scoreMod *= 1 + wallRatio

		if (Math.random() < 0.1) console.log("Room source-con spread modifier", newRoomName, 1 - scoreMod)

		if (Memory.timedRound) {
			remoteValue *= (1 - 1.5 * scoreMod)
		}
		else if (Memory.privateServer) {
			remoteValue *= (1 - scoreMod)
		}
		else {
			remoteValue *= (1 - 0.5 * scoreMod)
		}

		// console.log("c", Game.cpu.getUsed())


		console.log("Scanning room B:", remoteValue)

		if (claim) {				
			if (Memory.rooms[newRoomName] && Memory.rooms[newRoomName].reservedBy && Memory.rooms[newRoomName].reservedBy != "Invader") {
				remoteValue *= 0.25;
			}
			else if (Memory.usedRemotes.includes(newRoomName)) {
				remoteValue *= 0.5;
			}
		}

		// Don't go too far or too close. The too close doesn't really work past first new room...
		let minRouteCost = 30;

		let rangeMod 
		let routeDistMod = 1
		if (Memory.season) {
			// End of season, don't care about spreading
			if ((Memory.season4 && Game.gcl.level >= 9) || (Memory.season5 && Game.gcl.level >= 6)) {
				rangeMod = 0.75;
				routeDistMod = 0.75;
			}
			else {				
				rangeMod = 3;
				routeDistMod = 2.5;
			}
		}
		else if (Memory.timedRound) {
			rangeMod = 0.5
		}
		else if (Memory.privateServer) {
			rangeMod = 0.75
		}
		else {
			rangeMod = 1;
		}

		// console.log("d", Game.cpu.getUsed())
		// let maxRouteCost = 0;
		// This shouldn't penalise any portal claims
		let avoidRoomNames = []
		for (let avoidRoom of Game.myRooms) {
			avoidRoomNames.push(avoidRoom.name)
		}

		if (Memory.season2) {
			avoidRoomNames = avoidRoomNames.concat(Memory.allyRoomNames)
			avoidRoomNames = avoidRoomNames.concat(Memory.friendRoomNames)
		}

		for (let avoidRoomName of avoidRoomNames) {
			if (avoidRoomName == newRoomName) continue
			try {				
				if (Game.rooms[avoidRoomName] && Game.rooms[avoidRoomName].isMyRoom() && Game.rooms[avoidRoomName].mem.claimToUnclaimRoom) {
					continue
				}

				let testRouteCost = safeRoute.getSafeRouteCost(avoidRoomName, newRoomName, true, true);

				if (testRouteCost < minRouteCost) {
					minRouteCost = testRouteCost;
				}

				if (!Memory.season) {					
					if (testRouteCost <= 1 * routeDistMod) {
						remoteValue *= Math.max(0, 1 - 0.75 * rangeMod)
					}
					else if (testRouteCost <= 2 * routeDistMod) {
						remoteValue *= Math.max(0, 1 - 0.5 * rangeMod)
					}
					else if (testRouteCost <= 3 * routeDistMod) {
						remoteValue *= Math.max(0, 1 - 0.25 * rangeMod)
					}
					else if (testRouteCost <= 3.5 * routeDistMod) {
						remoteValue *= Math.max(0, 1 - 0.2 * rangeMod)
					}
				}

				// else if (testRouteCost <= 3.75 * routeDistMod) {
				// 	remoteValue *= Math.max(0, 1 - 0.15 * rangeMod)
				// }
			}
			catch(e) {
				console.log(e)
			}



			// else if (Memory.noTerminals) {
			// 	remoteValue *= 1 - Math.min(0.9, 0.1 * rangeMod * (testRouteCost - 3))
			// }
			// console.log("Scanning room BC:", routeRoom.name, newRoomName, testRouteCost, remoteValue)

			// if (testRouteCost > maxRouteCost) {
			// 	maxRouteCost = testRouteCost;
			// }
		}


		if (Memory.season) {

			if (Memory.season3) {
				let minLinearCost = 30;
				for (let avoidRoomName of avoidRoomNames) {
					if (avoidRoomName == newRoomName) continue
					try {				
						let testRouteCost = Game.map.getRoomLinearDistance(avoidRoomName, newRoomName);

						if (testRouteCost < minLinearCost) {
							minLinearCost = testRouteCost;
						}
					}
					catch(e) {
						console.log(e)
					}
				}

				if (minLinearCost > 5 && minRouteCost > 1.5 * minLinearCost) {
					console.log("Linear-route mod", 0.5 * (minLinearCost + minRouteCost) / 11)
					remoteValue *= 0.5 * (minLinearCost + minRouteCost) / 11
				}
				else {					
					console.log("Linear mod", minLinearCost / 11)
					remoteValue *= minLinearCost / 11
				}

			}
			else {
				console.log("Route mod", minRouteCost / 11)
				remoteValue *= minRouteCost / 11
			}

		}

		// console.log("e", Game.cpu.getUsed())
		// Try not to share dropoffs
		if (Memory.season1) {
			let minDist = Infinity
			let closestDropOff
			for (let roomName of Memory.scoreCollectorRooms) {
				if (Game.map.getRoomLinearDistance(newRoomName, roomName) > minDist) continue
				let dist = safeRoute.getSafeRouteCost(newRoomName, roomName, false, true)
				if (dist < minDist) {
					minDist = dist;
					closestDropOff = roomName
				}
			}

			if (minDist > 3) {
				remoteValue *= 1 - Math.min(1, 0.15 * (minDist - 3))
			}
			else {
				remoteValue *= 1 + 0.02 * (3 - minDist)
			}

			for (let room of Game.myRooms) {
				// if (Game.gcl.level == 5 && closestDropOff == "E10S10" && coords.x > -10) continue
				if (room.mem.closestDropOff == closestDropOff) {
					remoteValue *= 0.9;
					console.log("Debuf room as matching closestDropOff", room, closestDropOff)
				}
			}
		}


		if (Memory.season2) {
			// if (Memory.stealingDecoders && Memory.stealingDecoders.includes(Memory.rooms[newRoomName].decoderType)) {
			// 	console.log("Stealing", Memory.rooms[newRoomName].decoderType)
			// 	remoteValue *= 0.25
			// }	
			let currentDecoders = {}
			for (let room of Game.myRooms) {
				if (global.currentlyUnclaimingRoom == room.name) continue
				currentDecoders[room.mem.decoderType] = (currentDecoders[room.mem.decoderType] || 0) + 1
			}

			if (currentDecoders[Memory.rooms[newRoomName].decoderType]) {
				console.log("Already have", Memory.rooms[newRoomName].decoderType)
				remoteValue *= 0.2
			}
			else if (Memory.allyDecoders && Memory.allyDecoders.includes(Memory.rooms[newRoomName].decoderType)) {
				console.log("Ally has", Memory.rooms[newRoomName].decoderType)
				remoteValue *= 0.2
			}
			else if (Memory.friendDecoders && Memory.friendDecoders.includes(Memory.rooms[newRoomName].decoderType)) {
				console.log("friend", Memory.rooms[newRoomName].decoderType)
				remoteValue *= 0.2
			}			
		}

		// console.log("f", Game.cpu.getUsed())


		// Try to go _away_ from other players
		// This is really fucking expensive.
		// Obviously there's a lot of paths here but most should be cut off by max linear dist of 5.
		// Maybe the heuristic is being fucky going to/from an enemy room? Can't see that bug.
		if ((Memory.boomMode && Memory.botArena && !Memory.season2) || Memory.season3) {
			for (var enemyRoomName of Memory.enemyRooms) {
				if (!Memory.rooms[enemyRoomName] || !Memory.rooms[enemyRoomName].owner) continue

				let mod = 1

				// Ignore shitty rooms/low GCL players
				if (Memory.season3) {
					if (Memory.rooms[enemyRoomName].owner == "QzarSTB" || 
						Memory.rooms[enemyRoomName].owner == "Genovese" || 
						Memory.rooms[enemyRoomName].owner == "PythonBeatJava" || 
						Memory.rooms[enemyRoomName].owner == "Eiskalt" || 
						Memory.rooms[enemyRoomName].owner == "TheLastPiece") {
						mod = 3
					}
					else {
						continue
					}
				}
				else {					
					if ((intelAI.getGCLLowerBound(Memory.rooms[enemyRoomName].owner) + intelAI.getGCLUpperBound(Memory.rooms[enemyRoomName].owner)) / 2 < Game.gcl.level - 2) {
						continue
					}
					if (!Memory.rooms[enemyRoomName].rampHp && Memory.rooms[enemyRoomName].rcl > 3) {
						continue
					}
				}

				// if (Memory.season4) {
				// 	if (Memory.rooms[enemyRoomName].owner == "psy372") {
				// 		mod = 2
				// 	}
				// }			
				/*if (Memory.rooms[enemyRoomName].owner == "Xarabydun") {
					mod = 1.4
				}
				if (Memory.rooms[enemyRoomName].owner == "Cub") {
					mod = 1.4
				}*/


				let testRouteCost = safeRoute.getSafeRouteCost(enemyRoomName, newRoomName, false, true, 5 * mod);

				// testRouteCost /= mod;

				// console.log(Game.map.getRoomLinearDistance(enemyRoomName, newRoomName), enemyRoomName, newRoomName, testRouteCost, Game.cpu.getUsed())
				if (testRouteCost < 5 * mod) {
					remoteValue *= 0.9 + testRouteCost * 0.02 / mod
				}
				if (testRouteCost < 3 * mod) {
					remoteValue *= 0.7 + testRouteCost * 0.1 / mod
				}
				if (testRouteCost < 1 * mod) {
					remoteValue *= 0.5 + testRouteCost * 0.5 / mod
				}
			}
		}

		// console.log("f2", Game.cpu.getUsed())

		console.log("Scanning room C:", remoteValue)

		// if (minRouteCost < 2) {
		// 	remoteValue *= 0.5;
		// }
		// else if (minRouteCost < 3 && Game.myRooms.length > 2) {
		// 	remoteValue *= 0.8;
		// }
		// Spread your wings rooms!
		if (Game.myRooms.length > 10 && !isPortalClaim) {
			let mod = claim ? 0.02 : 0.05
			remoteValue *= 1 + Math.min((CREEP_CLAIM_LIFE_TIME - 100) / 50, minRouteCost) * (Game.myRooms.length - 10) * mod
		}

		// Migrate toward the middle with a very low bias
		if (!Memory.botArena) {
			remoteValue *= 1 - (Math.abs(coords.x) + Math.abs(coords.y)) * 0.002

			// Mineral deposits are in 0. Controlling all deposits in range is important for repsawn rules
			// https://github.com/screeps/backend-local/blob/ptr/lib/cronjobs.js#L514-L581
			// if (sectorCoords.x == 1) {
			// 	remoteValue *= 1.02;
			// }
			// if (sectorCoords.y == 1) {
			// 	remoteValue *= 1.02;
			// }
			// if (sectorCoords.x == 2) {
			// 	remoteValue *= 1.01;
			// }
			// if (sectorCoords.y == 2) {
			// 	remoteValue *= 1.01;
			// }
		}
		console.log("Scanning room D:", remoteValue)

		let rawResources = [RESOURCE_HYDROGEN, RESOURCE_OXYGEN, RESOURCE_UTRIUM, RESOURCE_KEANIUM, RESOURCE_LEMERGIUM, RESOURCE_ZYNTHIUM, RESOURCE_CATALYST];
		// console.log("g", Game.cpu.getUsed())

		let avgMarketValue = 0

		let minResourceAmount = Infinity;
		let minResource;
		for (let resource of rawResources) {
			if (!Memory.season) {				
				if (Memory.marketInfo && Memory.marketInfo.avgEValues[resource] && Memory.marketInfo.avgIValues[resource]) {
					avgMarketValue += Memory.marketInfo.avgEValues[resource] + Memory.marketInfo.avgIValues[resource]
				}
				else {
					console.log("A Missing market info for", resource)
				}
			}

			let resourceAmount = 0;
			for (let loopRoom of Game.myRooms) {
				resourceAmount += loopRoom.getCurrentOfResource(resource)
			}

			if (resourceAmount < minResourceAmount) {
				minResourceAmount = resourceAmount;
				minResource = resource;
			}
		}

		avgMarketValue /= rawResources.length

		let currentMinerals = {};

		for (let loopRoom of Game.myRooms) {
			if (loopRoom.name == newRoomName) continue
			if (loopRoom.mem.claimToUnclaimRoom) {
				continue
			}

			currentMinerals[roomIntel.getMineralType(loopRoom.name)] = (currentMinerals[roomIntel.getMineralType(loopRoom.name)] || 0) + 1
		}

		// console.log(JSON.stringify(currentMinerals))

		let minCurrentRoomMinerals = _.min(Object.values(currentMinerals));

		let mineralType = roomIntel.getMineralType(newRoomName);
		// console.log("h", Game.cpu.getUsed())

		// Some minerals are better than others
		if (marketTrader.isMineralRequired(mineralType)) {
			if (mineralType == RESOURCE_OXYGEN ||
				mineralType == RESOURCE_CATALYST) {
				remoteValue *= 1.1
			}
			else if (mineralType == RESOURCE_LEMERGIUM ||
					 mineralType == RESOURCE_HYDROGEN) {
				remoteValue *= 1.05
			}
		}



		// if (Memory.season4 && (mineralType == "L" || mineralType == "Z" || mineralType == "U" || mineralType == "K")) {
		// 	remoteValue *= 1.25
		// }

		// So, we want to have two rooms (at least) per sector so that we can effectively grab deposits all around
		// (and hence they refresh)
		if (Memory.season4) {
			if (Game.gcl.level <= 10) {
				if (mineralType == RESOURCE_OXYGEN) {
					remoteValue *= 2
				}
			}
			else if (mineralType == RESOURCE_OXYGEN || mineralType == RESOURCE_HYDROGEN) {
				remoteValue *= 1.5
			}

			// let myCentre = util.getCentreRoomForRoomPos(new RoomPosition(25, 25, newRoomName))
			// let cnt = 0;
			// for (let loopRoom of Game.myRooms) {
			// 	if (util.getCentreRoomForRoomPos(new RoomPosition(25, 25, loopRoom.name)) == myCentre) {
			// 		cnt++
			// 	}

			// }
			// if (cnt == 1) {
			// 	remoteValue *= 1.5
			// }
		}



		if (Memory.marketInfo && Memory.marketInfo.avgEValues[mineralType] && Memory.marketInfo.avgIValues[mineralType]) {
			let marketValue = Memory.marketInfo.avgEValues[mineralType] + Memory.marketInfo.avgIValues[mineralType]

			remoteValue *= 1 + 0.1 * marketValue / avgMarketValue
		}
		else {
			console.log("B Missing market info for", mineralType)
		}

		console.log("Scanning room E:", remoteValue)


		// console.log(minResource, minResourceAmount, Memory.rooms[newRoomName].mineral, JSON.stringify(currentMinerals));

		if (mineralType == minResource) {
			remoteValue *= 1.2;
		}

		if (!currentMinerals[mineralType]) {
			// If we may SK this mineral in, then it's not so important
			let hasViaSKRange1 = false;
			let hasViaSKRange2 = false;
			for (let room of Game.myRooms) {
				if (room.mem.claimToUnclaimRoom) {
					continue
				}
				for (let i = -2; i <= 2; i++) {
					for (let j = -2; j <= 2; j++) {
						if (Math.abs(i) + Math.abs(j) > 2) continue

						let roomCoords = util.getRoomCoords(room.name)

						let newCoords = {x: roomCoords.x + i, y: roomCoords.y + j};

						let innerRoomName = util.getRoomNameFromCoords(newCoords)

						if (!Memory.rooms[innerRoomName]) continue
						if (roomIntel.getMineralType(innerRoomName) != mineralType) continue

						let sectorCoords = util.getSectorCoords(innerRoomName)

						if (sectorCoords.x < 4 || sectorCoords.x > 6 || sectorCoords.y < 4 || sectorCoords.y > 6) {
							continue
						}

						if (Math.abs(i) + Math.abs(j) == 1) {
							hasViaSKRange1 = true;
						}
						else {
							hasViaSKRange2 = true
						}
					}
				}
			}

			let mod = hasViaSKRange1 ? 0.33 : hasViaSKRange2 ? 0.67 : 1

			remoteValue *= 1 + mod * 0.25;
			if (Memory.season) {
				remoteValue *= 1 + mod * 1.5
				// if (mineralType == "Z") {
				// 	remoteValue *= 1.1
				// }
			}
			else if (Memory.timedRound) {
				remoteValue *= 1 + mod * 0.25;
				// Trading is broken... 
				if (Game.gcl.level > 2 && !Memory.swc && Game.market.credits == 0) {
					remoteValue *= 1 + mod * 1;
				}
			}
		}

		console.log("Scanning room F:", remoteValue)

		if ((currentMinerals[mineralType] || 0) == minCurrentRoomMinerals) {
			if (Memory.timedRound || Memory.season) {
				remoteValue *= 1.05;	
			}
			remoteValue *= 1.05;
		}

		if (Memory.rooms[newRoomName].numAttemptedClaims) {
			remoteValue /= (1 + 0.1 * Memory.rooms[newRoomName].numAttemptedClaims);
		}

		console.log("Scanning room G:", remoteValue)

		// Prefer closer, but only by a bit. Should bias toward closer parent rooms
		if (myRoom && routeLength != Infinity) {
			remoteValue *= 1 - routeLength * 0.01;
			// Getting a bit edgy
			if (routeLength * 50 > CREEP_CLAIM_LIFE_TIME - 100) {
				remoteValue *= 1 - routeLength * 0.01;
			}
		}

		// Prefer high RCL parent rooms
		remoteValue *= 1 + (myRoom ? myRoom.effectiveLevel * 0.02 : 0);

		console.log("Scanning room H:", remoteValue)

		// Convoys, power
		if (!Memory.swc && !Memory.disablePower) {
			let heavyEdge = (Memory.season3) // || (Memory.season4 && Game.myRooms.length >= 4))	
					
			var sectorCoords = util.getSectorCoords(newRoomName);
			if (sectorCoords.x == 1 || sectorCoords.x == 9) {
				for (let exitName of Object.values(Game.map.describeExits(newRoomName))) {
					let exitCoords = util.getSectorCoords(exitName);
					if (exitCoords.x == 0) {
						remoteValue *= heavyEdge ? 1.2 : 1.02;
						if (heavyEdge) {
							console.log("Edge mod x 1")
						}
						/*if (heavyEdge && (coords.x == -2 || coords.x == 1)) {
							// Want my 6th and 7th room on the NS highway as there's space							
							// remoteValue *= (Game.myRooms.length == 5 || Game.myRooms.length == 6 ? 2 : 1.2)
							remoteValue *= 1.2
							if (heavyEdge) {
								console.log("Edge mod x 2")
							}
						}*/
						// If we're also near the y edge, give a buff
						if (heavyEdge && (sectorCoords.y <= 2 || sectorCoords.y >= 8)) {
							remoteValue *= 1.1
							if (heavyEdge) {
								console.log("Edge mod xy 3")
							}
						}
						break
					}
				}
			}
			if (sectorCoords.y == 1 || sectorCoords.y == 9) {
				for (let exitName of Object.values(Game.map.describeExits(newRoomName))) {
					let exitCoords = util.getSectorCoords(exitName);
					if (exitCoords.y == 0) {
						remoteValue *= heavyEdge ? 1.2 : 1.02;
						if (heavyEdge) {
							console.log("Edge mod y 1")
						}						
						/*if (heavyEdge && (coords.y == -2 || coords.y == 1)) {
							// Want my fifth room on the EW highway to claim ground against qzar/geno
							remoteValue *= (Game.myRooms.length == 4 ? 2 : 1.2)
							if (heavyEdge) {
								console.log("Edge mod y 2")
							}
						}*/
						// If we're also near the x edge, give a buff. 
						if (heavyEdge && (sectorCoords.x <= 2 || sectorCoords.x >= 8)) {
							remoteValue *= 1.1
							if (heavyEdge) {
								console.log("Edge mod yx 3")
							}
						}
						break
					}
				}

				// remoteValue *= Memory.season3 ? 1.2 : 1.02;
				// if (Memory.season3 && Math.abs(coords.y) < 5) {
				// 	remoteValue *= 1.2
				// }				
			}
			// if (sectorCoords.x == 2 || sectorCoords.x == 8) {
			// 	remoteValue *= Memory.season3 ? 1.05 : 1.01;
			// 	if (Memory.season3 && Math.abs(coords.x) < 5) {
			// 		remoteValue *= 1.05
			// 	}				
			// }
			// if (sectorCoords.y == 2 || sectorCoords.y == 8) {
			// 	remoteValue *= Memory.season3 ? 1.05 : 1.01;
			// 	if (Memory.season3 && Math.abs(coords.y) < 5) {
			// 		remoteValue *= 1.05
			// 	}
			// }
		}
		console.log("Scanning room I:", remoteValue)

		// if (Memory.season4) {
		// 	if (coords.x < -12) {
		// 		remoteValue *= 1 - Math.min(0.9, (coords.x / -12) - 1)
		// 	}
		// 	if (coords.y < -12) {
		// 		remoteValue *= 1 - Math.min(0.9, (coords.y / -12) - 1)
		// 	}

		// 	if (coords.x > 11) {
		// 		remoteValue *= 1 - Math.min(0.9, (coords.x / 11) - 1)
		// 	}
		// 	if (coords.y > 11) {
		// 		remoteValue *= 1 - Math.min(0.9, (coords.y / 11) - 1)
		// 	}
		// }

		if (isPortalClaim) {
			if (Memory.season1) {
				remoteValue *= 0.5
			}
			else if (Game.myRooms.length > 10 && !Memory.botArena) {
				remoteValue *= 1.5
			}
			// console.log("Scanning room G:", remoteValue)
		}

		if ((Memory.timedRound || Memory.season) && claim && Memory.rooms[newRoomName].safeModeCooldown) {
			remoteValue *= 1 - (Memory.season ? 0.25 : 0.5) * Memory.rooms[newRoomName].safeModeCooldown / 50000 
		}
		// console.log("j", Game.cpu.getUsed())

		if (Memory.season2 && Game.gcl.level == 5 && newRoomName == "W8N7") {
			remoteValue *= 4	
		}

		/*if (Memory.season5 && coords.y > 0 && Game.gcl.level <= 7) {
			remoteValue *= 4
		}
		if (Memory.season5 && coords.y <= 10 && Game.gcl.level <= 7) {
			remoteValue *= 4
		}
		if (Memory.season5 && newRoomName == "W11S5" && Game.gcl.level <= 7) {
			remoteValue *= 4000
		}
		if (Memory.season5 && newRoomName == "W11S4" && Game.gcl.level <= 7) {
			remoteValue *= 400
		}*/
		if (Memory.season5 && newRoomName == "E8N7" && Game.gcl.level >= 10) {
			remoteValue *= 40
		}
		if (Memory.season5 && newRoomName == "W2N8" && Game.gcl.level >= 11) {
			remoteValue *= 40
		}

		// Push geir
		if (Memory.season5 && newRoomName == "E9S5" && Game.gcl.level >= 7 && Game.gcl.level <= 8) {
			remoteValue *= 10
		}		
		if (Memory.season5 && newRoomName == "E11S5" && Game.gcl.level >= 7 && Game.gcl.level <= 8) {
			remoteValue *= 10
		}		
		if (Memory.season5 && newRoomName == "E11S6" && Game.gcl.level >= 7 && Game.gcl.level <= 8) {
			remoteValue *= 40
		}		
		if (Memory.season5 && newRoomName == "E11S7" && Game.gcl.level >= 7 && Game.gcl.level <= 8) {
			remoteValue *= 400
		}

		if (Memory.season5 && coords.x > 10 && Game.gcl.level <= 4) {
			remoteValue *= 10 - Math.abs(sectorCoords.x - 5)
			remoteValue *= 10 - Math.abs(sectorCoords.y - 5)
		}

		if (Memory.season5 && coords.x >= 21) {
			return 0
		}

		// TODO: Bias for 6th claim

		//if (Memory.season5 && mineralType == RESOURCE_LEMERGIUM && Game.gcl.level <= 4) {
		//	remoteValue *= 4
		//}

		// if (Memory.season3 && newRoomName == "E8S19") {
		// 	remoteValue *= 2
		// }
		// if (Memory.season3 && newRoomName == "E22S9") {
		// 	remoteValue *= 2
		// }
		// if (Memory.season3 && newRoomName == "E19S8") {
		// 	remoteValue *= 100
		// }

		return remoteValue
	},


	// Should not be the end of the world if this doesn't run.
	tickEnd : function() {
		if (Memory.season1) {
			overseerSeason.season1TickEnd();
		}
		else if (Memory.season2) {
			overseerSeason.season2TickEnd();
		}
		else if (Memory.season3) {
			overseerSeason.season3TickEnd();
		}
		else if (Memory.season4) {
			overseerSeason.season4TickEnd();
		}
		else if (Memory.season5) {
			overseerSeason.season5TickEnd();
		}

		// We're burning through the CPU fast, poll again sooner as we might have no bucket soon
		if (global.bucketBurning) {
			Memory.remoteRefreshOffset = (Memory.remoteRefreshOffset || 0) - 2;
			console.log("bucket burning. Moving remote refresh pick closer", Memory.remoteRefreshOffset)
		}


		if ((Memory.debugRemotePicking || 
				(Memory.tick > 5 && 
				((Game.time - (Memory.lastRemoteRefresh || 0) > 1000 + (Memory.remoteRefreshOffset || 0) && Math.random() > 0.98) || Memory.tick < 1000))) && 
				Game.cpu.getUsed() < 325) {
			let remoteRooms = [];
			let skMineRooms = []

			console.log("remote rescan triggered", Game.time, Memory.lastRemoteRefresh, Memory.remoteRefreshOffset)

			for (var room of _.shuffle(Game.myRooms)) {
				room.calculateTargetRemoteUtilization();
				remoteRooms = remoteRooms.concat(analyseRemoteRooms(room.name, false));
			}

			for (var room of _.shuffle(Game.myRooms)) {
				skMineRooms = skMineRooms.concat(analyseSKMineRooms(room.name, false))
			}


			// Stats
			// if (!Memory.botArena) {
				let creepCostEcon = 0;
				let creepCostCombat = 0;
				for (let creepName in Game.creeps) {
					let creep = Game.creeps[creepName];
					if (!creep) continue;

					if (creep.mem.role == "harvester" ||
						creep.mem.role == "bHarvester" ||
						creep.mem.role == "fetcher"   || 
						creep.mem.role == "reserver"   || 
						creep.mem.role == "centralHarvester"   || 
						creep.mem.role == "keeperGuard2"   || 
						creep.mem.role == "keeperHarvester2") {
						creepCostEcon += (creep.mem.bC || 0);
					}
					else if (creep.mem.role == "ranged" ||
						creep.mem.role == "tank"   || 
						creep.mem.role == "controllerAttacker"   || 
						creep.mem.role == "tankChildRoom"   || 
						creep.mem.role == "rangedChildRoom"   || 
						creep.mem.role == "healerChildRoom"   || 
						creep.mem.role == "edgeBouncer"   || 
						creep.mem.role == "defender"   || 
						creep.mem.role == "deconstructor"   || 
						creep.mem.role == "intershardRanged"   || 
						creep.mem.role == "intershardPairedHealer"   || 
						creep.mem.role == "intershardPairedTank"   || 
						creep.mem.role == "healer") {
						creepCostCombat += (creep.mem.bC || 0);
					}

				}

				Memory.stats.econCreepCost = creepCostEcon / CREEP_LIFE_TIME
				Memory.stats.combatCreepCost = creepCostCombat / CREEP_LIFE_TIME
			// }

			// Got some things that could be very temporal in this. I don't really like that but there are sometimes
			// steps that maybe avgBucket can't really model.
			
			// Upper bound of x% of my CPU into remotes.
			let totalRemoteCPU = 0.65 * (Game.cpu.limit - 5);

			if (Memory.season) {
				totalRemoteCPU -= (Memory.stats.creepCPUs["seasonFetcher"] || 0) / Memory.stats.ticks;
			}

			totalRemoteCPU *= Math.pow((Memory.stats.avgBucket - 500) / 9500, (Memory.botArena ? 0.75 : 0.65))

			// Need bucket
			if (Memory.stats.avgBucket < 4000) {
				totalRemoteCPU *= Memory.stats.avgBucket / 4000
			}

			// We're using more than we have. Cut back.
			totalRemoteCPU -= Math.max(0, Memory.stats.avgCPU - Game.cpu.limit)

			let remoteCPUUsed = 0;
			
			Memory.stats.remoteDebug = {};
			Memory.stats.remoteDebug.cf = 0
			Memory.stats.remoteDebug.ch = 0
			Memory.stats.remoteDebug.cz = 0
			Memory.stats.remoteDebug.cg = 0
			Memory.stats.remoteDebug.cr = 0

			// Gonna be defending. Free up some CPU.
			for (let room of Game.myRooms) {
				switch (room.defcon) {
					case 5:
						break;
					case 4:
						totalRemoteCPU -= 0.1;
						break
					case 3:
						totalRemoteCPU -= 0.25;
						break
					case 2:
						totalRemoteCPU -= 0.5;
						break
					case 1:
						totalRemoteCPU -= 1;
						break
				}

				// For local harvesters/haulers.
				remoteCPUUsed += room.effectiveLevel == 8 ? 0.5 : 0.7;

				Memory.stats.remoteDebug.cf += room.effectiveLevel == 8 ? .1 : .3;
				Memory.stats.remoteDebug.ch += .4;


			}



			// Claim scan. Call it 2 CPU/tick
			if (Game.myRooms.length < Game.gcl.level && Memory.claimScanData && Memory.claimScanData.lastClaimerSpawnedTick && Game.time - Memory.claimScanData.lastClaimerSpawnedTick > 2000) {
				totalRemoteCPU -= 2;
			}

			// Lets assume an assault is ~4 CPU. Might be a bit optimistic
			if (Memory.stats.avgBucket < 2500) {
				totalRemoteCPU -= 4. * (global.totalAssaultCount || 0);
			}			
			else if (Memory.stats.avgBucket < 3000) {
				totalRemoteCPU -= 3.5 * (global.totalAssaultCount || 0);
			}
			else if (Memory.stats.avgBucket < 4000) {
				totalRemoteCPU -= 3. * (global.totalAssaultCount || 0);
			}
			else if (Memory.stats.avgBucket < 5000) {
				totalRemoteCPU -= 2.5 * (global.totalAssaultCount || 0);
			}
			else if (Memory.stats.avgBucket < 7000) {
				totalRemoteCPU -= 2. * (global.totalAssaultCount || 0);
			}
			else if (Memory.stats.avgBucket < 9000) {
				totalRemoteCPU -= 1.5 * (global.totalAssaultCount || 0);
			}
			else if (Memory.stats.avgBucket < 9000) {
				totalRemoteCPU -= 1 * (global.totalAssaultCount || 0);
			}

			// totalRemoteCPU *= Math.pow((Memory.stats.avgBucket - 500) / 9500, (Memory.botArena ? 1.5 : 1.4))

			// We know how much the last pass should have been using, and we know how much haulers/harvesters/etc cost us
			// so we can normalise expected CPU usage. Smoothed over a few resets
			let actualCPUUsage = ((Memory.stats.creepCPUs["fetcher"] || 0) + 
								 (Memory.stats.creepCPUs["harvester"] || 0) + 
								 (Memory.stats.creepCPUs["bHarvester"] || 0) + 
								 (Memory.stats.creepCPUs["doubleHarvester"] || 0) + 
								 (Memory.stats.creepCPUs["reserver"] || 0) + 
								 (Memory.stats.creepCPUs["centralHarvester"] || 0) + 
								 (Memory.stats.creepCPUs["keeperGuard2"] || 0) + 
								 (Memory.stats.creepCPUs["keeperHarvester2"] || 0)) / Memory.stats.ticks;

			Memory.stats.actualRemoteCPUUsage = actualCPUUsage;
			Memory.stats.remoteCPUNormalization = Memory.stats.remoteCPUNormalization || 1;

			// Dunno how they can be NaN, but apparently they can be.
			if (Memory.stats.remoteCPUUsedPreNorm != Memory.stats.remoteCPUUsedPreNorm) {
				Memory.stats.remoteCPUUsedPreNorm = 0;
			}
			// Not quite sure what's going on with this
			if (Memory.stats.remoteCPUNormalization != Memory.stats.remoteCPUNormalization || Memory.stats.remoteCPUNormalization > 1e3 || Memory.stats.remoteCPUNormalization < 1e-3) {
				Memory.stats.remoteCPUNormalization = 1;
			}

			// Normalization is out because we're using small haulers. We don't want to use small haulers _and_ be on the CPU limit. Drop normalisation toward
			// 1 which should give us a more realistic CPU prediction
			if (Memory.stats.remoteCPUNormalization > 1 && global.anySmallHaulers) {
				Memory.stats.remoteCPUNormalization = (Memory.stats.remoteCPUNormalization + 1) / 2
			}

			// My estimates aren't _that_ bad
			Memory.stats.remoteCPUNormalization = Math.max(0.5, Math.min(2, Memory.stats.remoteCPUNormalization))

			let localNormalization = (Memory.stats.remoteCPUUsedPreNorm ? (actualCPUUsage / Memory.stats.remoteCPUUsedPreNorm) : 1);

			const alpha = Math.exp(-(1 / 5.));

			Memory.stats.remoteCPUNormalization = alpha * Memory.stats.remoteCPUNormalization + (1 - alpha) * localNormalization;



			let normalization =  Memory.stats.remoteCPUNormalization;

			// Seems we can maintain about 98% of the limit
			/*if (Game.cpu.bucket < 9000 && Memory.stats.avgCPU / Game.cpu.limit > 0.98) {
				// Range is 0->1. 0 means 93% CPU used, 1 means 100%.
				let normalized = 20 * (Memory.stats.avgCPU / Game.cpu.limit - 0.98);
				totalRemoteCPU *= 1 - normalized;
			}*/


			let oldRemotesByRoom = {}
			for (let room of Game.myRooms) {
				oldRemotesByRoom[room.name] = {r: room.regularHarvestRooms, d: room.doubleHarvestRooms, kh: room.keeperHarvestRooms, ch: room.centreHarvestRooms, km: room.keeperMineRooms}
			}

			for (var room of Game.myRooms) {
				room.remoteUtilization = 0;				

				room.goodRooms = [room.name];
				room.regularHarvestRooms = [room.name];
				room.doubleHarvestRooms = [];
				room.centreHarvestRooms = [];
				room.keeperHarvestRooms = [];
				room.keeperMineRooms = [];
			}

			// For now, just pick from the top while under utilization.
			remoteRooms.sort(function (a, b) {
				let av = a.v;
				let bv = b.v;
				if (Game.rooms[a.parentRoom]) {
					// No terminal rooms get first pick and optimize for utilization
					if (Game.rooms[a.parentRoom].effectiveLevel < 6 || !Game.rooms[a.parentRoom].terminal) {
						av *= 10000;
						av /= a.u;
					}
					else {
						// These rooms need energy more.
						// But they can get it via terminal. Don't want to just burn
						// all the spawn cycles on collecting energy when we have a terminal
						if (Game.rooms[a.parentRoom].controller.level < 8 && Game.rooms[a.parentRoom].upgradeFocus && Memory.highEnergyUpgrading) {
							av /= 1.25;
						}
						av /= 10000;
						if (Memory.stats.avgBucket < 9000 && !global.anySmallHaulers) {
							av /= a.c
						}
						else {
							av /= a.u
						}
					}

					// We're utilization bound. Slightly favour rooms with lower utilization
					if (Memory.stats.avgBucket > 9000 || global.anySmallHaulers) {
						av /= (1 + Game.rooms[a.parentRoom].mem.spawnUtilization) / 2
					}

				}

				if (Game.rooms[b.parentRoom]) {
					// No terminal rooms get first pick and optimize for utilization
					if (Game.rooms[b.parentRoom].effectiveLevel < 6 || !Game.rooms[b.parentRoom].terminal) {
						bv *= 10000;
						bv /= b.u;
					}
					else {
						// These rooms need energy more.
						// But they can get it via terminal. Don't want to just burn
						// all the spawn cycles on collecting energy when we have a terminal
						if (Game.rooms[b.parentRoom].controller.level < 8 && Game.rooms[b.parentRoom].upgradeFocus && Memory.highEnergyUpgrading) {
							bv /= 1.25;
						}
						bv /= 10000;

						if (Memory.stats.avgBucket < 9000 && !global.anySmallHaulers) {
							bv /= b.c
						}
						else {
							bv /= b.u
						}
					}
					// We're utilization bound. Slightly favour rooms with lower utilization
					if (Memory.stats.avgBucket > 9000 || global.anySmallHaulers) {
						bv /= (1 + Game.rooms[b.parentRoom].mem.spawnUtilization) / 2
					}

				}

				return av - bv;
			});

			// Ok, I'm not quite sure how to solve this optimization problem. Rooms can't be shared
			// and we want to maximize value while staying under a spawn utlization budget.
			let oldRemotes = _.clone(Memory.usedRemotes);


			Memory.usedRemotes = [];
			Memory.lastAddedRemotes = [];
			Memory.keeperHarvestRooms = [];


			let harvesterWWM = creepCreator.getHarvesterNumWorkWorkMove();
			let harvesterHpt = harvesterWWM * 4;
			let harvesterCost = harvesterWWM * (2 * BODYPART_COST[WORK] + BODYPART_COST[MOVE]);

			let doubleHarvesterWWM = creepCreator.getDoubleHarvesterNumWorkWorkMove();
			let doubleHarvesterHpt = doubleHarvesterWWM * 4;
			let doubleHarvesterCost = doubleHarvesterWWM * (2 * BODYPART_COST[WORK] + BODYPART_COST[MOVE]);

			let totalRemoteCount = 0;
			let totalProfit = 0;

			let CPULimitHit = 0
			let utilLimitHit = 0


			let usedSKMineRooms = [];
			function pickSKMineRooms(currentRemotes) {
				// This doens't look at CPU. Shouldn't add much.
				// _does_ look at utilization though

				skMineRooms.sort(function (a, b) {
					return a.v - b.v;
				});


				
				while (skMineRooms.length > 0) {
					var remote = skMineRooms.pop();

					if (remote.v > 0 &&
						Game.rooms[remote.parentRoom].remoteUtilization + remote.u < Math.max(Game.rooms[remote.parentRoom].spawns.length * 100, Game.rooms[remote.parentRoom].targetRemoteUtilization) &&
						!currentRemotes.includes(remote.testRoomName) && 
						Game.rooms[remote.parentRoom].keeperMineRooms.length == 0 &&  // One at a time
						Game.rooms[remote.parentRoom].calcEffectiveEnergy() > constants.ROOM_ENERGY_NO_SOLO_MINERS && 
						!usedSKMineRooms.includes(remote.testRoomName)) {

						let sectorCoords = util.getSectorCoords(remote.testRoomName);
						Game.rooms[remote.parentRoom].goodRooms.push(remote.testRoomName);
						Game.rooms[remote.parentRoom].keeperMineRooms.push(remote.testRoomName);

						Game.rooms[remote.parentRoom].remoteUtilization += remote.u;

						usedSKMineRooms.push(remote.testRoomName)
					}
				}

				console.log("Remote rescan",  usedSKMineRooms.length, "SK mine rooms")
			}

			// Do it before remote rooms if we really need minerals
			// Otheriwse do it after
			let alreadyPickedSKMineRooms = false
			if (!Memory.season3) {				
				if (Memory.timedRound || Game.market.credits === 0) {
					// Assume we'll use the same remotes as last time - don't want a solo to overlap a proper remote
					// with a solo. Still a slight chance we will but this will only cause a utilization hole as 
					// we don't spawn solo mine creeps if something is in Memory.usedRemotes
					pickSKMineRooms(oldRemotes)
					alreadyPickedSKMineRooms = true
				}
			}



			while (remoteRooms.length > 0) {
				var remote = remoteRooms.pop();

				// We're under heavy attack. Ship energy in instead.
				if (Game.rooms[remote.parentRoom].defcon == 1 && Game.rooms[remote.parentRoom].terminal && Memory.terminalNetworkFreeEnergy > 500000) {
					// We're going to be using CPU elsewhere here. Lets call in 3 CPU though maybe that's optimistic. I don't know.
					if (Memory.debugRemotePicking) {
						console.log("Ignoring remote (high defcon)", JSON.stringify(remote))
					}
					continue;
				}

				let spareUtil = Game.rooms[remote.parentRoom].remoteUtilization + remote.u < Math.max(Game.rooms[remote.parentRoom].spawns.length * 100, Game.rooms[remote.parentRoom].targetRemoteUtilization)

				// TODO: Slow rampup by looking at harvest counts?
				if (spareUtil &&
					remote.v > 0 &&				
					!Memory.usedRemotes.includes(remote.testRoomName)) {

					if (Memory.rooms[remote.testRoomName] && (Memory.rooms[remote.testRoomName].owner || Memory.rooms[remote.testRoomName].invCL)) continue;
					


					if (remoteCPUUsed + (remote.c || 1) * normalization <= totalRemoteCPU) {
						totalProfit += remote.v
						Game.rooms[remote.parentRoom].goodRooms.push(remote.testRoomName);

						let sectorCoords = util.getSectorCoords(remote.testRoomName);
						if (sectorCoords.x <= 6 && sectorCoords.x >= 4 && sectorCoords.y <= 6 && sectorCoords.y >= 4 && !(sectorCoords.x == 5 && sectorCoords.y == 5)) {
							Game.rooms[remote.parentRoom].keeperHarvestRooms.push(remote.testRoomName);
							Memory.keeperHarvestRooms.push(remote.testRoomName);

							// Fresh into a keeper room, push the guard out ASAP
							if (Game.rooms[remote.parentRoom].spawns[0] && !oldRemotes.includes(remote.testRoomName)) {
								Game.rooms[remote.parentRoom].spawns[0].addPrioritySpawn("keeperGuard2", {targetRoom: remote.testRoomName})
							}
						}
						else if (sectorCoords.x == 5 && sectorCoords.y == 5) {
							Game.rooms[remote.parentRoom].centreHarvestRooms.push(remote.testRoomName);
						}
						else {
							// Doublework or not
							// Assume we have to do 4 walks every 300 ticks. This is a bit pessemistic.
							let doubleTimeNeeded = 4. * remote.ss + 2 * SOURCE_ENERGY_CAPACITY / doubleHarvesterHpt;
							let doubleCost = CREEP_LIFE_TIME * (4 * remote.ss * global.INTENT_CPU_COST * (Memory.stats.yieldPerCPU || 1) / ENERGY_REGEN_TIME);

							doubleCost += doubleHarvesterCost

							if (!Memory.botArena && remote.ss && Game.rooms[remote.parentRoom].energyCapacityAvailable > MAX_CREEP_SIZE * BODYPART_COST[WORK] && doubleTimeNeeded < 0.8 * ENERGY_REGEN_TIME && 2 * harvesterCost > doubleCost) {
								Game.rooms[remote.parentRoom].doubleHarvestRooms.push(remote.testRoomName);
							}
							else {
								Game.rooms[remote.parentRoom].regularHarvestRooms.push(remote.testRoomName);	
							}
						}

						Game.rooms[remote.parentRoom].remoteUtilization += remote.u;

						Memory.usedRemotes.push(remote.testRoomName)

						if (!oldRemotes.includes(remote.testRoomName)) {
							Memory.lastAddedRemotes.push(remote.testRoomName)
							delete Memory.rooms[remote.parentRoom].noBuiltRoads;
						}

						totalRemoteCount++
						remoteCPUUsed += (remote.c || 1) * normalization;

						// if (Memory.debugRemotePicking) {
							Memory.stats.remoteDebug.cf += (remote.cf || 0);
							Memory.stats.remoteDebug.ch += (remote.ch || 0);
							Memory.stats.remoteDebug.cz += (remote.cz || 0);
							Memory.stats.remoteDebug.cg += (remote.cg || 0);
							Memory.stats.remoteDebug.cr += (remote.cr || 0);
							// console.log("adding remote", JSON.stringify(remote), Memory.stats.remoteDebug.cf, Memory.stats.remoteDebug.ch, Memory.stats.remoteDebug.cz, Memory.stats.remoteDebug.cg, Memory.stats.remoteDebug.cr)
						// }
					}
					else {
						if (Memory.debugRemotePicking) {
							console.log("cpu limit hit", remoteCPUUsed, totalRemoteCPU)
						}

						let idealFinalValue = roomAI.getRemoteHarvestingValue(remote.parentRoom, remote.testRoomName, true, 1.0, false)

						const alpha = Math.exp(-(1 / 2.));

						Memory.stats.yieldPerCPU = alpha * (Memory.stats.yieldPerCPU || 10) + (1 - alpha) * idealFinalValue.v / (normalization * idealFinalValue.c);

						CPULimitHit = 1;
						break;
					}
				}
				else if (!spareUtil && remote.v > 0) {
					const alpha = Math.exp(-(1 / 2.));
					// Not yet normalized.
					// Gets a bit dodgy when we're CPU limited globally but util limited locally.
					Memory.stats.yieldPerSpawnTick = alpha * (Memory.stats.yieldPerSpawnTick || 0.01) + (1 - alpha) * remote.v / (remote.u);
					utilLimitHit = 1
				}

				// else if (Memory.debugRemotePicking) {
				// 	if (remote.v < 0) {
				// 		console.log("Ignoring remote (low v)", JSON.stringify(remote))
				// 	}
				// 	else if (Game.rooms[remote.parentRoom].remoteUtilization + remote.u > Math.max(Game.rooms[remote.parentRoom].spawns.length * 100, Game.rooms[remote.parentRoom].targetRemoteUtilization)) {
				// 		console.log("Ignoring remote (parent busy)", JSON.stringify(remote))
				// 		console.log(Game.rooms[remote.parentRoom].remoteUtilization, Math.max(Game.rooms[remote.parentRoom].spawns.length * 100, Game.rooms[remote.parentRoom].targetRemoteUtilization))
				// 	}
				// 	else if (Memory.usedRemotes.includes(remote.testRoomName)) {
				// 		console.log("Ignoring remote (taken)", JSON.stringify(remote))
				// 	}
				// }
			}

			// More CPU won't give us more useful stuff
			if (!CPULimitHit) {
				console.log("!CPULimitHit")
				Memory.stats.yieldPerCPU = 0;
			}
			// More util won't give us more useful stuff
			if (!utilLimitHit) {
				console.log("!utilLimitHit")
				Memory.stats.yieldPerSpawnTick = 0;
			}

			Memory.stats.numRemotes = totalRemoteCount
			Memory.stats.targetRemoteCPU = totalRemoteCPU
			Memory.stats.remoteCPUUsed = remoteCPUUsed
			Memory.stats.remoteCPUUsedPreNorm = remoteCPUUsed / normalization;


			for (let room of Game.myRooms) {
				if (JSON.stringify(oldRemotesByRoom[room.name]) != JSON.stringify({r: room.regularHarvestRooms, d: room.doubleHarvestRooms, kh: room.keeperHarvestRooms, ch: room.centreHarvestRooms, km: room.keeperMineRooms})) {
					// Remotes changed, got to check the roads
					room.mem.triggerRebuild = 1			
					delete room.mem.noBuiltRoads
				}
			}


			// Lets call half of it profit?
			for (let room of Game.myRooms) {
				totalProfit += 0.5 * 10 * roomIntel.getEffectiveNumSources(room.name)
			}

			Memory.stats.expectedEnergyProfit = totalProfit;

			console.log("Remote rescan", remoteCPUUsed, "/", totalRemoteCPU, "cpu scheduled.", totalRemoteCount, "remotes. Normalization", normalization)

			if (!Memory.season3) {
				if (!alreadyPickedSKMineRooms) {
					pickSKMineRooms(Memory.usedRemotes)
					alreadyPickedSKMineRooms = true
				}
			}

			Memory.lastRemoteRefresh = Game.time
			Memory.remoteRefreshOffset = 0;

			delete global.fetcherTargetCounts;

			delete Memory.debugRemotePicking
		}


		// Analyse this to figure out which rooms are exposed to the outside.
		if (Math.random() < 0.01) {			
			for (var room of Game.myRooms) {
				room.protectRooms = []
				for (let roomName of room.goodRooms) {
					// It's a peaceful room. Don't bother posting guards.
					if (Memory.rooms[roomName].DT < 0.1 && ((Memory.rooms[roomName].hSnceLstInv || 0) < INVADERS_ENERGY_GOAL * .7 || !util.hasSectorGotAStronghold(roomName))) {
						continue;
					}
					// Find a route to enemy room without going through any rooms I've reserved or own.
					// If that passes, it's an "border" room.
					// for (var enemyRoom of Memory.enemyRooms) {
					// 	let routeCost = safeRoute.getSafeRouteCost(roomName, enemyRoom);

					// 	if (routeCost < 30) {
							room.protectRooms.push(roomName);
							// break;
						// }
					// }
				}
			}
		}

		// Measured as 100 CPU on shard2 11 August 2021
		if ((Math.random() > 0.995 || Memory.debugPowerDepositConvoyRooms) && Game.cpu.getUsed() < 300 && (Memory.maxRoomLevel >= 7 || (Memory.season3 && Memory.maxRoomLevel >= 5)) && !Memory.swc) {
			Memory.debugPowerDepositConvoyRooms = 0
			// let powerRooms = [];
			// let depositRooms = [];
			for (var room of Game.myRooms) {
				room.powerRooms = [];
				room.depositRooms = [];

				let isRoomEnoughLevel = (room.effectiveLevel >= 7 || (Memory.season3 && room.effectiveLevel >= 5))


				if (!Memory.disablePower && isRoomEnoughLevel && !room.restrictPowerMissions(10000)) {
					let maxPowerRange = constants.MAX_POWER_RANGE

					if (Memory.season3) {
						let powerMod = 1;
						let PCLevel = -1
						for (let powerCreepName of (room.mem.assignedPowerCreeps || [])) {
							if (Game.powerCreeps[powerCreepName].room && Game.powerCreeps[powerCreepName].powers[PWR_OPERATE_SPAWN]) {
								if (Memory.season && Game.powerCreeps[powerCreepName].level < 9) {
									continue
								}
								else {
									PCLevel = Math.max(PCLevel, Game.powerCreeps[powerCreepName].powers[PWR_OPERATE_SPAWN].level)
								}
							}
						}

						if (Memory.season3) {			
							if (room.mem.lastOpSpawnUsed && Game.time - room.mem.lastOpSpawnUsed.t < 1500) {
								PCLevel = Math.max(PCLevel, room.mem.lastOpSpawnUsed.l)
							}
							for (let spawn of room.spawns) {
								for (let effect of (spawn.effects || [])) {
									if (effect.effect == PWR_OPERATE_SPAWN) {
										PCLevel = Math.max(PCLevel, effect.level)
									}
								}
							}
						}

						if (PCLevel > 0) {
							powerMod = POWER_INFO[PWR_OPERATE_SPAWN].effect[PCLevel - 1]
						}

						if (powerMod == 1) {
							maxPowerRange -= 3
						}
						else if (powerMod >= 0.5) {
							maxPowerRange -= 1	
						}

						if (room.effectiveLevel == 8) {
							maxPowerRange += 2
						}

						// Agreement
						if (room.name == "E8S19") {
							maxPowerRange = 5
						}

						room.mem.maxPowerRange = maxPowerRange


					}
					let baseCoords = util.getRoomCoords(room.name);

					for (let i = -maxPowerRange; i <= maxPowerRange; i++) {
						for (let j = -maxPowerRange; j <= maxPowerRange; j++) {
							let coords = {"x": baseCoords.x + i, "y" : baseCoords.y + j};
							let testRoomName = util.getRoomNameFromCoords(coords);
							let sectorCoords = util.getSectorCoords(testRoomName);


							if (sectorCoords.x % 10 && sectorCoords.y % 10) continue;

							if (Memory.season3 && 
								(testRoomName == "W0S14" || 
								 testRoomName == "E0S14" || 
								 testRoomName == "W0S15" || 
								 testRoomName == "E0S15" || 
								 testRoomName == "W0S16" || 
								 testRoomName == "E0S16" || 
								 testRoomName == "W0S17" || 
								 testRoomName == "E0S17" ||
								 testRoomName == "E6N10" ||
								 testRoomName == "E7N10" ||
								 testRoomName == "E8N10" ||
								 testRoomName == "E9N10" ||
								 testRoomName == "E10N10" ||
								 testRoomName == "W0N15" ||
								 testRoomName == "W0N16" ||
								 testRoomName == "W0N17" ||
								 testRoomName == "W0N18" ||
								 testRoomName == "W0N19" ||
								 testRoomName == "E0N15" ||
								 testRoomName == "E0N16" ||
								 testRoomName == "E0N17" ||
								 testRoomName == "E0N18" ||
								 testRoomName == "E0N19" ||
								 false)) {
								continue
							}

							if (Memory.season3 && coords.x >= 12 && Date.now() < 1628683200000) {
								continue
							}

							let routeCost = safeRoute.getSafeRouteCost(room.name, testRoomName, false, false, maxPowerRange);
							if (routeCost < maxPowerRange) {
								room.powerRooms.push(testRoomName);
							}
						}
					}
				}

				if ((!Memory.season || Memory.season4) && room.effectiveLevel >= 7) {
					let baseCoords = util.getRoomCoords(room.name);

					for (let i = -constants.MAX_DEPOSIT_RANGE; i <= constants.MAX_DEPOSIT_RANGE; i++) {
						for (let j = -constants.MAX_DEPOSIT_RANGE; j <= constants.MAX_DEPOSIT_RANGE; j++) {
							let coords = {"x": baseCoords.x + i, "y" : baseCoords.y + j};
							let testRoomName = util.getRoomNameFromCoords(coords);
							let sectorCoords = util.getSectorCoords(testRoomName);

							if (sectorCoords.x % 10 && sectorCoords.y % 10) continue;

							let routeCost = safeRoute.getSafeRouteCost(room.name, testRoomName, false, false, constants.MAX_DEPOSIT_RANGE);
							if (routeCost < constants.MAX_DEPOSIT_RANGE) {
								room.depositRooms.push(testRoomName);
							}
						}
					}
				}
			}


			/*if (powerRooms.length > 0) {
				powerRooms = _.sortBy(powerRooms, function(obj) { return -obj.cost });
				let usedPowerRooms = [];

				while (powerRooms.length > 0) {
					let obj = powerRooms.pop();

					// if (!usedPowerRooms.includes(obj.target)) {
					// 	usedPowerRooms.push(obj.target);
						Game.rooms[obj.source].powerRooms.push(obj.target);
					// }
				}
			}*/

			/*if (depositRooms.length > 0) {
				depositRooms = _.sortBy(depositRooms, function(obj) { return -obj.cost });
				let usedDepositRooms = [];

				while (depositRooms.length > 0) {
					let obj = depositRooms.pop();

					// if (usedDepositRooms.indexOf(obj.target) == -1) {
					// 	usedDepositRooms.push(obj.target);
						Game.rooms[obj.source].depositRooms.push(obj.target);
					// }
				}
			}*/




			let convoyRooms = [];
			for (var room of Game.myRooms) {
				room.convoyRooms = [];
				if (room.effectiveLevel >= 8) {
					let baseCoords = util.getRoomCoords(room.name);

					for (let i = -10; i <= 10; i++) {
						for (let j = -10; j <= 10; j++) {
							let coords = {"x": baseCoords.x + i, "y" : baseCoords.y + j};
							let testRoomName = util.getRoomNameFromCoords(coords);
							let sectorCoords = util.getSectorCoords(testRoomName);

							if (sectorCoords.x && sectorCoords.y) continue;
							if (sectorCoords.x == 0 && sectorCoords.y == 0) continue;

							convoyRooms.push({cost: Math.max(Math.abs(i), Math.abs(j)), source: room.name, target: testRoomName})
						}
					}
				}
			}

			if (convoyRooms.length > 0) {
				convoyRooms = _.sortBy(convoyRooms, function(obj) { return -obj.cost });
				let usedConvoyRooms = [];

				while (convoyRooms.length > 0) {
					let obj = convoyRooms.pop();

					if (usedConvoyRooms.indexOf(obj.target) == -1) {
						usedConvoyRooms.push(obj.target);
						Game.rooms[obj.source].convoyRooms.push(obj.target);
					}
				}
			}
		}

		if ((Math.random() > 0.99 || Memory.debugLootRooms) && Game.cpu.getUsed() < 300) {
			let lootRange = constants.MAX_LOOT_RANGE 

			if (Game.cpu.bucket < 5000 || Memory.stats.avgBucket < 5000) {
				lootRange *= Math.min(Game.cpu.bucket, Memory.stats.avgBucket) / 5000
			}
			for (var room of _.shuffle(Game.myRooms)) {
				if ((Math.random() > 0.95 || room.lootRooms.length || Memory.debugLootRooms) && Game.cpu.getUsed() < 300) {					
					room.lootRooms = []; 
					let baseCoords = util.getRoomCoords(room.name);


					for (let i = -lootRange; i <= lootRange; i++) {
						for (let j = -lootRange; j <= lootRange; j++) {


							let coords = {"x": baseCoords.x + i, "y" : baseCoords.y + j};
							let testRoomName = util.getRoomNameFromCoords(coords);

							if (Game.rooms[testRoomName]) {
								scouting.setRoomLoot(Game.rooms[testRoomName])
							}

							if (!Memory.rooms[testRoomName] || !Memory.rooms[testRoomName].loot) {
								continue
							}

							if (!Memory.rooms[testRoomName].loot) {
								continue
							}

							if (Memory.rooms[testRoomName].safeMode) {
								continue
							}

							// Shouldn't happen but happened
							if (Game.rooms[testRoomName] && Game.rooms[testRoomName].isMyRoom()) {
								delete Memory.rooms[testRoomName].loot
								continue
							}
							if (Memory.rooms[testRoomName].twrX && Memory.rooms[testRoomName].twrX.length) {
								continue
							}
							if (!util.isRoomAccessible(testRoomName)) {
								continue
							}
							if (scouting.isRoomWhiteListed(testRoomName)) {
								continue
							}

							// Something worth 100k we'll trek 10 rooms for.
							// Something worth 50k we'll trek 5 rooms for.
							let maxRange = Memory.rooms[testRoomName].loot / 10000

							if (Game.cpu.bucket < 5000 || Memory.stats.avgBucket < 5000) {
								maxRange *= Math.min(Game.cpu.bucket, Memory.stats.avgBucket) / 5000
							}


							if (Math.abs(i) > maxRange || Math.abs(j) > maxRange) {
								continue
							}

							maxRange = Math.min(maxRange, lootRange)

							let routeCost = safeRoute.getSafeRouteCost(room.name, testRoomName, false, false);
							if (routeCost < maxRange) {
								room.lootRooms.push(testRoomName);
								console.log(room.name, "looting", testRoomName)
							}
						}
					}
				}
			}
			delete Memory.debugLootRooms
		}


		if (Memory.season1 && Math.random() > 0.95 && Game.cpu.getUsed() < 300) {
			Memory.seasonalDropRooms = Memory.seasonalDropRooms || []

			for (var room of Game.myRooms) {
				if (Math.random() > 0.95 || Memory.seasonalDropRooms.length == 0) {	
					let bestRange = Infinity

					room.mem.seasonalDropRooms = []
					let baseCoords = util.getRoomCoords(room.name);

					for (let i = -10; i <= 10; i++) {
						for (let j = -10; j <= 10; j++) {

							let coords = {"x": baseCoords.x + i, "y" : baseCoords.y + j};
							let testRoomName = util.getRoomNameFromCoords(coords);
							let sectorCoords = util.getSectorCoords(testRoomName)

							if (sectorCoords.x || sectorCoords.y) continue


							let routeCost = safeRoute.getSafeRouteCost(room.name, testRoomName, false, false, 10);
							if (routeCost < 10) {
								room.mem.seasonalDropRooms.push(testRoomName)
								bestRange = routeCost
								if (!Memory.seasonalDropRooms.includes(testRoomName)) {
									Memory.seasonalDropRooms.push(testRoomName)
								}
							}
						}
					}
				}
			}
		}

		// Fookin respawn zones
		if (!Memory.privateServer) {			
			if (Game.time % 1001 == 0 && Game.cpu.getUsed() < 400) {
				let usedRooms = {}
				let maxRange = Math.min(6, Game.myRooms.length)
				for (var room of Game.myRooms) {
					if (room.restrictOffensiveMissions(undefined, false, false, true)) {
						continue	
					} 
					var baseCoords = util.getRoomCoords(room.name);

					for (var i = -maxRange; i <= maxRange; i++) {
						for (var j = -maxRange; j <= maxRange; j++) {
							if (i == 0 && j == 0) continue;
							// if (i == 0 && j == 0 || (Math.abs(i) + Math.abs(j) >= 4)) continue;
							var coords = {x: baseCoords.x + i, y : baseCoords.y + j};
							// Checkerboard
							if ((coords.x + coords.y) % 2) continue

							var testRoomName = util.getRoomNameFromCoords(coords);

							if (!Memory.rooms[testRoomName]) continue
							if (Memory.rooms[testRoomName].owner) continue
							if (!Memory.rooms[testRoomName].plannedZone) continue
							if (Memory.rooms[testRoomName].reservedBy) {
								if (Memory.rooms[testRoomName].reservedBy != util.getMyName()) {
									continue
								}
								else if (Memory.rooms[testRoomName].reserveTicksToEnd > 1900) {
									continue
								}
							}
							if (!util.isRoomAccessible(testRoomName)) continue

							let routeCost = safeRoute.getSafeRouteCost(room.name, testRoomName, false, true, maxRange);
							if (routeCost > maxRange) continue

							if (usedRooms[testRoomName]) {
								let currentRange = Object.values(usedRooms[testRoomName])[0]
								if (routeCost < currentRange) {
									usedRooms[testRoomName] = {[room.name]: routeCost}
								}
							}
							else {
								usedRooms[testRoomName] = {[room.name]: routeCost}
							}
						}
					}
				}

				for (let roomName in usedRooms) {
					let sourceRoom = Game.rooms[Object.keys(usedRooms[roomName])[0]]

					let spawn = sourceRoom.spawns[0]

					console.log(sourceRoom, "wants to launch a planning appeal to", roomName)
					spawn.addPrioritySpawn("reserver", {targetRoom: roomName})
				}
			}
		}


		for (var room of Game.myRooms) {
			room.mem.goodRooms = _.clone(room.goodRooms);
			room.mem.regularHarvestRooms = _.clone(room.regularHarvestRooms);
			room.mem.doubleHarvestRooms = _.clone(room.doubleHarvestRooms);
			room.mem.protectRooms = _.clone(room.protectRooms);
			room.mem.observeRooms = _.clone(_.uniq(room.goodRooms.concat(room.buildRooms))) //.concat(room.powerRooms)));
			room.mem.powerRooms = _.clone(room.powerRooms);
			room.mem.depositRooms = _.clone(room.depositRooms);
			room.mem.convoyRooms = _.clone(room.convoyRooms);
			room.mem.lootRooms = _.clone(room.lootRooms);
			room.mem.buildRooms = _.clone(room.buildRooms);
			room.mem.centreHarvestRooms = _.clone(room.centreHarvestRooms);
			room.mem.keeperHarvestRooms = _.clone(room.keeperHarvestRooms);
			room.mem.keeperMineRooms = _.clone(room.keeperMineRooms);
		}








		// Claiming!
		Memory.claimScanData = Memory.claimScanData || {};

		let claimScanData = Memory.claimScanData;

		claimScanData.lastClaimerSpawnedTick = claimScanData.lastClaimerSpawnedTick || 0;
		claimScanData.claimScanStartTick = claimScanData.claimScanStartTick || 0;

		let targetRoomCount = global.roomLimit === undefined ? Game.gcl.level : global.roomLimit;




		// We want to claim, start scanning
		if ((Game.myRooms.length < targetRoomCount && Game.time - claimScanData.lastClaimerSpawnedTick > 2000 && global.totalRooms < Game.gcl.level) || Memory.preGCLScan) {
			// Need rooms to be in a deterministic order
			Game.myRooms = _.sortBy(Game.myRooms, "name");

			// console.log(Game.myRooms)

			var radius;
			if (Game.myRooms.length) {
				radius = 2 + Math.max(1, Game.myRooms.length) + (Memory.season ? 10 : 0);
			}
			else {
				radius = 1;
			}

			radius = Math.min(Memory.season3 ? 12 : 10, radius)

			if (Memory.swc && global.whiteList.length) {
				radius = Math.min(10, radius * 3);
			}

			Memory.knownPortalRoomNames = Memory.knownPortalRoomNames || []

			let numSourceRooms

			if (Game.myRooms.length == 0) {
				numSourceRooms = Memory.knownIntershardPortalRoomNames.length
			}
			else if (Memory.season) {
				numSourceRooms = Game.myRooms.length
			}
			else {
				numSourceRooms = (Game.myRooms.length + Memory.knownPortalRoomNames.length)
			}

			let numSteps = numSourceRooms * ((radius * 2 + 1) * (radius * 2 + 1));
			// New scan. Wait some time between scans or bucket goes to shit
			if (Game.time - claimScanData.claimScanStartTick > (Memory.fastClaims ? 1 : 2) * numSteps) {
				Memory.lastClaimScanData = _.clone(claimScanData)

				console.log("Starting claim scan")
				claimScanData.claimScanStartTick = Game.time;
				claimScanData.skips = 0;
				claimScanData.claimScanBestValue = 0;
				claimScanData.claimScanSecondValue = 0;
				claimScanData.claimScanThirdValue = 0;
				claimScanData.claimScanBestRoom = undefined;
				claimScanData.claimScanParentRoom = undefined;
				claimScanData.claimScanSecondRoom = undefined;
				claimScanData.claimScanSecondParentRoom = undefined;
				claimScanData.claimScanThirdRoom = undefined;
				claimScanData.claimScanThirdParentRoom = undefined;

				// let util = require("util")
				// We've decided to claim. Do a scan over rooms we thing we may have claimed in the past...
				for (let roomName in _.clone(Memory.rooms)) {
					// Be extra sure here.
					if (Memory.rooms[roomName].owner != util.getMyName() && !Game.myRooms.includes(Game.rooms[roomName])) {
						if (Memory.rooms[roomName].ID) {
							let newMemory = {}

							// Um. I hate this. Just grabbing the "important" stuff. Previously I'd delete everything
							// which included "numAttemptedClaims" which was not ideal.
							newMemory.DT = Memory.rooms[roomName].DT
							newMemory.kd = (Memory.rooms[roomName].kd || 0)
							newMemory.sP = Memory.rooms[roomName].sP
							newMemory.m = Memory.rooms[roomName].m
							newMemory.conX = Memory.rooms[roomName].conX	
							newMemory.conY = Memory.rooms[roomName].conY
							newMemory.lo = Memory.rooms[roomName].lo
							newMemory.numAttemptedClaims = Memory.rooms[roomName].numAttemptedClaims
							newMemory.designFailed = Memory.rooms[roomName].designFailed

							Memory.rooms[roomName] = newMemory
						}
					}
				}
			}

			

			// Process one per tick
			if (Game.time - claimScanData.claimScanStartTick < numSteps - claimScanData.skips) {
				claimScanData.claimScanTick = (Game.time - claimScanData.claimScanStartTick + (claimScanData.skips || 0)) % numSteps;

				let validRooms = false;
				if (Game.myRooms.length) {					
					for (let room of Game.myRooms) {
						if (room.effectiveLevel >= 4) {
							validRooms = true;
							break;
						}
					}
				}
				else {
					// Assuming we'll intershard
					validRooms = true;
				}

				if (!validRooms) {
					claimScanData.claimScanTick = 0;
				}



				var roomIdx = Math.floor(claimScanData.claimScanTick / ((radius * 2 + 1) * (radius * 2 + 1)))
				var roomTick = claimScanData.claimScanTick % ((radius * 2 + 1) * (radius * 2 + 1))

				var iStep = Math.floor(roomTick / (radius * 2 + 1))
				var jStep = (roomTick % (radius * 2 + 1))


				if (roomIdx < numSourceRooms) {
					let myRoom;
					let spawnRoomName

					// Intershard claim
					if (Game.myRooms.length == 0) {
						spawnRoomName = Memory.knownIntershardPortalRoomNames[roomIdx]
					}
					else if (roomIdx < Game.myRooms.length) {
						myRoom = Game.myRooms[roomIdx];
						spawnRoomName = myRoom.name
					}
					else {
						let portalRoomName = Memory.knownPortalRoomNames[roomIdx - Game.myRooms.length]

						if (Memory.rooms[portalRoomName] && Memory.rooms[portalRoomName].portalDest) {
							let minDist = 6;

							// Find a room near the portal entrance and use that.
							for (var testRoom of Game.myRooms) {
								let routeCost = safeRoute.getSafeRouteCost(testRoom.name, Memory.rooms[portalRoomName].portalDest.roomName, false)
								if (routeCost < minDist) {
									minDist = routeCost
									myRoom = testRoom
								}
							}						

							// If we're too close to the other side of the portal don't do portal claims
							if (myRoom) {								
								for (var testRoom of Game.myRooms) {
									let routeCost = safeRoute.getSafeRouteCost(testRoom.name, portalRoomName, false)
									if (routeCost < 6) {
										myRoom = undefined
										break
									}
								}												
							}
							else {
								// Skip
								claimScanData.skips += ((radius * 2 + 1) * (radius * 2 + 1)) - roomTick - 1
							}
						}
						else {
							// skip ahead
							claimScanData.skips += ((radius * 2 + 1) * (radius * 2 + 1)) - roomTick - 1
						}

						if (myRoom) {
							spawnRoomName = myRoom.name
						}


 						

						console.log(myRoom, spawnRoomName, Memory.rooms[portalRoomName] ? JSON.stringify(Memory.rooms[portalRoomName].portalDest) : "", roomIdx - Game.myRooms.length)
					}

					if (Game.myRooms.length == 0 || (myRoom && myRoom.effectiveLevel >= 4)) {
						var i = -radius + iStep;
						var j = -radius + jStep;

						var baseCoords;
						if (Game.myRooms.length == 0) {
							baseCoords = util.getRoomCoords(spawnRoomName);
						}
						else if (roomIdx < Game.myRooms.length) {
						 	baseCoords = util.getRoomCoords(spawnRoomName);
						}
						else {
							baseCoords = util.getRoomCoords(Memory.knownPortalRoomNames[roomIdx - Game.myRooms.length]);
						}
						var coords = {"x": baseCoords.x + i, "y" : baseCoords.y + j};


						let ignore = false;
						var newRoomName = util.getRoomNameFromCoords(coords)
						var sectorCoords = util.getSectorCoords(newRoomName);

						// No highways or centre rooms
						if (sectorCoords.x % 10 != 0 && sectorCoords.y % 10 != 0 && 
							((sectorCoords.x % 10 < 4 || sectorCoords.x % 10 > 6) || (sectorCoords.y % 10 < 4 || sectorCoords.y % 10 > 6)) &&
							Memory.rooms[newRoomName] && 
							!ignore && util.isRoomAccessible(newRoomName) && 
							!Memory.rooms[newRoomName].designFailed && 
							!Memory.rooms[newRoomName].owner && Memory.rooms[newRoomName].sP) {
							// Maybe we should consider reserved rooms, but it seems like it's best to go for non-fighty ones
							var routeLength = safeRoute.getSafeRouteCost(spawnRoomName, newRoomName, true, true);
							// var routeNoSKLength = safeRoute.getSafeRouteCost(myRoom.name, newRoomName, true, false, 30, true);
							// if (Memory.season2) {
							//     routeLength = safeRoute.getSafeRouteCost(spawnRoomName, newRoomName, true, true);
							// }
							// else {
							//     routeLength = safeRoute.getSafeRouteCost(spawnRoomName, newRoomName, true, true, Math.round(CREEP_CLAIM_LIFE_TIME / 50));
							// }

							// We check paths now, so no need for route length
							// if (routeLength * 49 < CREEP_CLAIM_LIFE_TIME - 50 || (Memory.season2 && routeLength != Infinity)) {
								let remoteValue = this.scoreRoom(newRoomName, roomIdx, routeLength, myRoom, coords, sectorCoords, true)

								console.log("Scanned room:", spawnRoomName, newRoomName, remoteValue, Math.round(100 * claimScanData.claimScanTick / numSteps) + "%")

								if (remoteValue > claimScanData.claimScanBestValue) {
									let parentRoom
									/*if (!myRoom && Game.myRooms.length) {
										// claimScanData.claimScanPortalRoom = spawnRoomName;

										let bestPortalRoom
										let bestPortalRoomScore = Infinity;

										for (let portalCheckRoom of Game.myRooms) {
											if (portalCheckRoom.effectiveLevel < 4) continue
											var routeLength = safeRoute.getSafeRouteCost(spawnRoomName, portalCheckRoom.name, true, true);
											if (routeLength < bestPortalRoomScore) {
												bestPortalRoomScore = routeLength
												bestPortalRoom = portalCheckRoom
											}
										}
										parentRoom = bestPortalRoom.name
									}
									else {*/
										parentRoom = spawnRoomName;
										// delete claimScanData.claimScanPortalRoom
									// }

									let rangeFail = false
									if (Game.rooms[parentRoom] && Game.rooms[parentRoom].spawns.length) {
										let spawn = _.sample(Game.rooms[parentRoom].spawns)

										let moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.5, "minKD" : -0.5, "maxRooms": 64, "maxOps": Math.max(20000, 1000 * (450 - Game.cpu.getUsed()))};
										let path = pathCache.getPath(spawn.pos, 
																	 new RoomPosition(Memory.rooms[newRoomName].conX, Memory.rooms[newRoomName].conY, newRoomName),
																	 1, 
																	 5, 
																	 false, 
																	 false,
																	 moveOptions)

										if (path.incomplete) {
											rangeFail = true										
										}
										if (path.path.length > CREEP_CLAIM_LIFE_TIME) {
											rangeFail = true;
										}
										// return {"hit": false, "incomplete": incomplete, "usedFindRoute": usedFindRoute, "path": serializedPath, "r": pathRooms};

									}

									console.log("New best room! Range fail:", rangeFail)
									if (parentRoom && !rangeFail) {
										// Take down the damned cores as we find best rooms. Will hopefully kill the reservation soon enough
										if (Memory.rooms[newRoomName] && Memory.rooms[newRoomName].reservedBy == "Invader" && !Memory.preGCLScan) {
											if (Game.rooms[parentRoom] && Game.rooms[parentRoom].spawns.length) {
												let spawn = _.sample(Game.rooms[parentRoom].spawns)

												spawn.addPrioritySpawn("coreDismantler", {targetRoom: newRoomName})	
											}
										}									

										if (claimScanData.claimScanSecondRoom) {
											claimScanData.claimScanThirdRoom = claimScanData.claimScanSecondRoom;
											claimScanData.claimScanThirdValue = claimScanData.claimScanSecondValue;
											claimScanData.claimScanThirdParentRoom = claimScanData.claimScanSecondParentRoom;
										}
										if (claimScanData.claimScanBestRoom) {
											claimScanData.claimScanSecondRoom = claimScanData.claimScanBestRoom;
											claimScanData.claimScanSecondValue = claimScanData.claimScanBestValue;
											claimScanData.claimScanSecondParentRoom = claimScanData.claimScanParentRoom;
										}

										claimScanData.claimScanBestValue = remoteValue;
										claimScanData.claimScanBestRoom = newRoomName;
										claimScanData.claimScanParentRoom = parentRoom;
									}
								}
								// Clearly something has changed. Start again.
								else if (newRoomName == claimScanData.claimScanBestRoom && remoteValue < claimScanData.claimScanBestValue * 0.7) {
									console.log("Best room dropped value, restarting claim scan", claimScanData.claimScanBestRoom, "new:", remoteValue, "old:", claimScanData.claimScanBestValue)

									// Memory.rooms[claimScanData.claimScanBestRoom].numAttemptedClaims = (Memory.rooms[claimScanData.claimScanBestRoom].numAttemptedClaims || 0) + 1

									claimScanData.claimScanStartTick = 0;
									claimScanData.claimScanBestValue = 0;
									claimScanData.claimScanBestRoom = undefined;
									claimScanData.claimScanParentRoom = undefined;
								}
								else if (remoteValue > (claimScanData.claimScanSecondValue || 0)) {
									let parentRoom = spawnRoomName;

									let rangeFail = false
									if (Game.rooms[parentRoom] && Game.rooms[parentRoom].spawns.length) {
										let spawn = _.sample(Game.rooms[parentRoom].spawns)

										let moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.5, "minKD" : -0.5, "maxRooms": 64, "maxOps": Math.max(20000, 1000 * (450 - Game.cpu.getUsed()))};
										let path = pathCache.getPath(spawn.pos, 
																	 new RoomPosition(Memory.rooms[newRoomName].conX, Memory.rooms[newRoomName].conY, newRoomName),
																	 1, 
																	 5, 
																	 false, 
																	 false,
																	 moveOptions)

										if (path.incomplete) {
											rangeFail = true										
										}
										if (path.path.length > CREEP_CLAIM_LIFE_TIME) {
											rangeFail = true;
										}
									}

									console.log("New second room! Range fail:", rangeFail)
									if (parentRoom && !rangeFail) {
										if (claimScanData.claimScanSecondRoom) {
											claimScanData.claimScanThirdRoom = claimScanData.claimScanSecondRoom;
											claimScanData.claimScanThirdValue = claimScanData.claimScanSecondValue;
											claimScanData.claimScanThirdParentRoom = claimScanData.claimScanSecondParentRoom;
										}
										claimScanData.claimScanSecondRoom = newRoomName;
										claimScanData.claimScanSecondValue = remoteValue;
										claimScanData.claimScanSecondParentRoom = parentRoom;
									}
								}
								else if (remoteValue > (claimScanData.claimScanThirdValue || 0)) {
									let parentRoom = spawnRoomName;

									let rangeFail = false
									if (Game.rooms[parentRoom] && Game.rooms[parentRoom].spawns.length) {
										let spawn = _.sample(Game.rooms[parentRoom].spawns)

										let moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.5, "minKD" : -0.5, "maxRooms": 64, "maxOps": Math.max(20000, 1000 * (450 - Game.cpu.getUsed()))};
										let path = pathCache.getPath(spawn.pos, 
																	 new RoomPosition(Memory.rooms[newRoomName].conX, Memory.rooms[newRoomName].conY, newRoomName),
																	 1, 
																	 5, 
																	 false, 
																	 false,
																	 moveOptions)

										if (path.incomplete) {
											rangeFail = true										
										}
										if (path.path.length > CREEP_CLAIM_LIFE_TIME) {
											rangeFail = true;
										}
									}

									console.log("New third room! Range fail:", rangeFail)
									if (parentRoom && !rangeFail) {
										claimScanData.claimScanThirdRoom = newRoomName;
										claimScanData.claimScanThirdValue = remoteValue;
										claimScanData.claimScanThirdParentRoom = parentRoom;
									}
								}
							// }
							// else {
							// 	console.log("Skipped room room a:", spawnRoomName, newRoomName, Math.round(100 * claimScanData.claimScanTick / numSteps) + "%")
							// }
						}
						else {
							console.log("Skipped room room b:", spawnRoomName, newRoomName, Math.round(100 * claimScanData.claimScanTick / numSteps) + "%")
						}
					}
				}
			}

			// Scan complete. Spawn a claimer!
			if (claimScanData.claimScanBestRoom && Game.time - claimScanData.claimScanStartTick >= numSteps - claimScanData.skips) {
				console.log("##### Scan complete:", claimScanData.claimScanBestValue, claimScanData.claimScanBestRoom, claimScanData.claimScanParentRoom)

				if (!Memory.preGCLScan) {
					Memory.rooms[claimScanData.claimScanBestRoom].numAttemptedClaims = (Memory.rooms[claimScanData.claimScanBestRoom].numAttemptedClaims || 0) + 1
				}

				// Make sure we can design it
				roomDesignAI.designRoom(claimScanData.claimScanBestRoom, true);
				if (Memory.rooms[claimScanData.claimScanBestRoom].designFailed === false) {
					if (Memory.preGCLScan) {
						delete Memory.preGCLScan
					}
					else { 
						// Not neccessarily the best idea to spawn it from the parent room - it's probably the best room but another may be better
						// It's what I'm doing though!

						let anyRoomsWithSpawns = 0
						for (let room of Game.myRooms) {
							if (room.effectiveLevel > 3 && room.find(FIND_MY_SPAWNS).length) {
								anyRoomsWithSpawns = 1
								break;
							}
						}
						if (anyRoomsWithSpawns) {
							if (!Game.rooms[claimScanData.claimScanParentRoom]) {
								// eeeh, must've gone wrong somewhere above
								Game.notify("------------------------ Bug during portal claims")
								console.log("------------------------ Bug during portal claims")
								
								claimScanData.claimScanStartTick = 0;
								claimScanData.skips = 0;
								claimScanData.claimScanBestValue = 0;
								claimScanData.claimScanBestRoom = undefined;
								claimScanData.claimScanParentRoom = undefined;
							}
							else {
								var spawn = Game.rooms[claimScanData.claimScanParentRoom].find(FIND_MY_SPAWNS)[0];

								// spawn.addPrioritySpawn("antiScout", {"targetRoom": claimScanData.claimScanBestRoom})

								var baseCoords = util.getRoomCoords(claimScanData.claimScanBestRoom);
								let maxHate = intelAI.getMaxHate()
								if (maxHate > 3000) spawn.addPrioritySpawn("ranged", {"targetRoom": claimScanData.claimScanBestRoom})
								if (maxHate > 3000) spawn.addPrioritySpawn("ranged", {"targetRoom": claimScanData.claimScanBestRoom})
								if (maxHate > 3000 || (Memory.rooms[claimScanData.claimScanBestRoom] && Memory.rooms[claimScanData.claimScanBestRoom].reservedBy == "Invader")) {
									spawn.addPrioritySpawn("tank", {"targetRoom": claimScanData.claimScanBestRoom})
								}
								if (maxHate > 3000) spawn.addPrioritySpawn("healer", {"targetRoom": claimScanData.claimScanBestRoom})
								for (var i = -1; i <= 1; i++) {
									for (var j = -1; j <= 1; j++) {
										var coords = {"x": baseCoords.x + i, "y" : baseCoords.y + j};

										// Don't do centre rooms
										if (coords.x >= 4 && coords.x <= 6 && coords.y >= 4 && coords.y <= 6) continue;

										var testRoomName = util.getRoomNameFromCoords(coords);

										if (Game.map.findRoute(claimScanData.claimScanBestRoom, testRoomName).length > 3) continue

										spawn.addPrioritySpawn("antiScout", {"targetRoom": testRoomName})
									}
								}


								spawn.addPrioritySpawn("claimer", {"targetRoom": claimScanData.claimScanBestRoom})
								spawn.addPrioritySpawn("pioneer", {"targetRoom": claimScanData.claimScanBestRoom})
								spawn.addPrioritySpawn("claimer", {"targetRoom": claimScanData.claimScanBestRoom})
								spawn.addPrioritySpawn("pioneer", {"targetRoom": claimScanData.claimScanBestRoom})
								spawn.addPrioritySpawn("claimer", {"targetRoom": claimScanData.claimScanBestRoom})
								spawn.addPrioritySpawn("pioneer", {"targetRoom": claimScanData.claimScanBestRoom})
								spawn.addPrioritySpawn("pioneer", {"targetRoom": claimScanData.claimScanBestRoom})
							}

						}
						else {
							let isMemory = interShardMemoryManager.getMem(Game.shard.name)

							let closestPortalRoom
							let shortestDist = Infinity

							for (let portalRoomName of Memory.knownIntershardPortalRoomNames) {
								let dist = safeRoute.getSafeRouteCost(portalRoomName, claimScanData.claimScanBestRoom, false, true, 5)
								if (dist < shortestDist) {
									closestPortalRoom = portalRoomName;
									shortestDist = dist;
								}
							}


							isMemory.claimRequest = {t: Game.time, r: claimScanData.claimScanBestRoom, p: JSON.stringify(Memory.rooms[closestPortalRoom].portalDests)}
							interShardMemoryManager.touchLocal();
						}
						claimScanData.lastClaimerSpawnedTick = Game.time;
						claimScanData.lastClaimerSpawnedDest = claimScanData.claimScanBestRoom;
					}


				}
				else {
					// roomDesignAI.clearFailedDesign(claimScanData.claimScanBestRoom)
					/*if (claimScanData.claimScanSecondRoom) {
						claimScanData.claimScanBestRoom = claimScanData.claimScanSecondRoom
						claimScanData.claimScanParentRoom = claimScanData.claimScanSecondParentRoom
						if (claimScanData.claimScanThirdRoom) {
							claimScanData.claimScanSecondRoom = claimScanData.claimScanThirdRoom;
							claimScanData.claimScanSecondParentRoom = claimScanData.claimScanThirdParentRoom;

							delete claimScanData.claimScanThirdRoom;
							delete claimScanData.claimScanThirdParentRoom;
						}
						else {
							delete claimScanData.claimScanSecondRoom ;
							delete claimScanData.claimScanSecondParentRoom;
						}
					}
					else {*/
						// Well, try again I guess
						claimScanData.claimScanStartTick = 0;
						claimScanData.skips = 0;
						claimScanData.claimScanBestValue = 0;
						claimScanData.claimScanBestRoom = undefined;
						claimScanData.claimScanParentRoom = undefined;
					// }
				}


				/*if (claimScanData.claimScanSecondRoom) {
					claimScanData.claimScanBestRoom = claimScanData.claimScanSecondRoom;
					claimScanData.claimScanParentRoom = claimScanData.claimScanSecondParentRoom;
					if (claimScanData.claimScanThirdRoom) {
						claimScanData.claimScanSecondRoom = claimScanData.claimScanThirdRoom;
						claimScanData.claimScanSecondParentRoom = claimScanData.claimScanThirdParentRoom;

						claimScanData.claimScanThirdRoom = undefined;
						claimScanData.claimScanThirdRoom = undefined;
					}
					else {
						claimScanData.claimScanSecondRoom = undefined;
						claimScanData.claimScanSecondParentRoom = undefined;
					}
				}
				else {
					claimScanData.claimScanBestRoom = undefined;
					claimScanData.claimScanParentRoom = undefined;
				}*/
			}
		}

		if (Game.time - (claimScanData.lastClaimerSpawnedTick || 0) > 5000 && Math.random() < 0.01) {			
			for (let shard of global.activeShards) {
				if (shard == Game.shard.name) continue
				let isMemory = interShardMemoryManager.getMem(shard)
				if (isMemory.claimRequest && isMemory.tick - isMemory.claimRequest.t < 2000) {
					let targetRoomName = isMemory.claimRequest.r

					if (!targetRoomName) continue

					let portalRoomName
					// Find the closest portal to that target room
					for (let portalDest of JSON.parse(isMemory.claimRequest.p)) {
						if (portalDest.shard != Game.shard.name) {
							continue;
						}
						portalRoomName = portalDest.room;
						break;
					}

					if (portalRoomName) {						
						let bestRoom
						let shortestDist = Infinity
						for (let room of Game.myRooms) {
							if (room.effectiveLevel == 8 && room.defcon == 5) {							
								let dist = safeRoute.getSafeRouteCost(portalRoomName, room.name, false, true, 4)
								if (dist < shortestDist) {
									bestRoom = room;
									shortestDist = dist;
								}
							}
						}

						if (bestRoom) {
							var spawn = bestRoom.find2(FIND_MY_SPAWNS)[0];

							let rangedCreep = creepCreator.createBestRanged(bestRoom, true, true, true, bestRoom.energyCapacityAvailable)

							// We're going to need it!
							spawn.addPrioritySpawn("baseManager")
							spawn.addPrioritySpawn("intershardRanged", {"targetRoom": isMemory.claimRequest.r, "shardTarget": shard, "portalTargetRoom": portalRoomName, "targetBoosts": rangedCreep.boosts}, undefined, rangedCreep.body)
							spawn.addPrioritySpawn("intershardRanged", {"targetRoom": isMemory.claimRequest.r, "shardTarget": shard, "portalTargetRoom": portalRoomName, "targetBoosts": rangedCreep.boosts}, undefined, rangedCreep.body)
							spawn.addPrioritySpawn("isTransporter", {"targetRoom": isMemory.claimRequest.r, "shardTarget": shard, "portalTargetRoom": portalRoomName})
							spawn.addPrioritySpawn("intershardClaimer", {"targetRoom": isMemory.claimRequest.r, "shardTarget": shard, "portalTargetRoom": portalRoomName})
							spawn.addPrioritySpawn("intershardPioneer", {"targetRoom": isMemory.claimRequest.r, "shardTarget": shard, "portalTargetRoom": portalRoomName})
							spawn.addPrioritySpawn("intershardRanged", {"targetRoom": isMemory.claimRequest.r, "shardTarget": shard, "portalTargetRoom": portalRoomName, "targetBoosts": rangedCreep.boosts}, undefined, rangedCreep.body)
							spawn.addPrioritySpawn("isTransporter", {"targetRoom": isMemory.claimRequest.r, "shardTarget": shard, "portalTargetRoom": portalRoomName})
							spawn.addPrioritySpawn("intershardClaimer", {"targetRoom": isMemory.claimRequest.r, "shardTarget": shard, "portalTargetRoom": portalRoomName})
							spawn.addPrioritySpawn("intershardPioneer", {"targetRoom": isMemory.claimRequest.r, "shardTarget": shard, "portalTargetRoom": portalRoomName})
							spawn.addPrioritySpawn("isTransporter", {"targetRoom": isMemory.claimRequest.r, "shardTarget": shard, "portalTargetRoom": portalRoomName})
							spawn.addPrioritySpawn("intershardClaimer", {"targetRoom": isMemory.claimRequest.r, "shardTarget": shard, "portalTargetRoom": portalRoomName})
							spawn.addPrioritySpawn("intershardPioneer", {"targetRoom": isMemory.claimRequest.r, "shardTarget": shard, "portalTargetRoom": portalRoomName})
							spawn.addPrioritySpawn("isTransporter", {"targetRoom": isMemory.claimRequest.r, "shardTarget": shard, "portalTargetRoom": portalRoomName})
							spawn.addPrioritySpawn("intershardClaimer", {"targetRoom": isMemory.claimRequest.r, "shardTarget": shard, "portalTargetRoom": portalRoomName})
							spawn.addPrioritySpawn("intershardPioneer", {"targetRoom": isMemory.claimRequest.r, "shardTarget": shard, "portalTargetRoom": portalRoomName})
							spawn.addPrioritySpawn("intershardRanged", {"targetRoom": isMemory.claimRequest.r, "shardTarget": shard, "portalTargetRoom": portalRoomName, "targetBoosts": rangedCreep.boosts}, undefined, rangedCreep.body)

							claimScanData.supportingISClaim = {p: bestRoom.name, t: Game.time, r: isMemory.claimRequest.r, s: shard, pr: portalRoomName}

							claimScanData.lastClaimerSpawnedTick = Game.time

							delete claimScanData.nextISMission
						}
					}
					// else {
					// 	Game.notify("Wtf no portalRoomName " + JSON.stringify(isMemory.claimRequest))
					// }

				}

			}
		}

		// Unclaiming
		if (!Memory.botArena && (Game.myRooms.length || 0) > 10 && global.totalRooms == Game.gcl.level) {
			if (Math.random() < 0.1 && Game.cpu.getUsed() < 400) {

				let room = _.sample(Game.myRooms)
				if (room.effectiveLevel == 8 && (room.memory.claimScore === undefined || Math.random() < 0.5)) {
					let baseCoords = util.getRoomCoords(room.name);
					let anyWeirdZone = false;

					for (let i = -3; i <= 3; i++) {
						for (let j = -3; j <= 3; j++) {
							let coords = {"x": baseCoords.x + i, "y" : baseCoords.y + j};
							let status = Game.map.getRoomStatus(util.getRoomNameFromCoords(coords)).status

							if (status == "novice" || status == "respawn") {
								anyWeirdZone = true;
								i = 4
								break
							}
						}
					}

					if (!anyWeirdZone) {					
						let newScore = this.scoreRoom(room.name, -1, 0, undefined, util.getRoomCoords(room.name),  util.getSectorCoords(room.name), false)

						// Energy/CPU. These are _long_ term averages (half life 200k ticks)
						newScore *= 0.5 + 0.5 * ((room.memory.haulerTransferredEnergyAvg - room.memory.energyCreepsECost) / room.memory.energyCreepsCCost)

						if (room.memory.claimScore === undefined) {
							room.memory.claimScore = newScore
						}
						else {
							// Really shouldn't change that much. Half life 50k ticks
							// 1 / 0.1 * 0.5 * 0.0004 = 50k if I had one room.
							const alpha = Math.exp(-0.0004 * Game.myRooms.length);
							room.memory.claimScore = alpha * room.memory.claimScore + (1 - alpha) * newScore
						}
					}


				}

				if (Memory.minRoomLevel == 8) {
					let allScored = true;
					for (let room of Game.myRooms) {
						if (room.memory.claimScore === undefined) {
							allScored = false;
							break;
						}
					}

					let minValue = Infinity
					let lowestRoom;

					if (allScored) {
						for (let room of Game.myRooms) {
							if (room.memory.claimScore < minValue) {
								// If we have respawn/noobie zones, ignore this
								let baseCoords = util.getRoomCoords(room.name);
								let anyWeirdZone = false;
								for (let i = -3; i <= 3; i++) {
									for (let j = -3; j <= 3; j++) {
										let coords = {"x": baseCoords.x + i, "y" : baseCoords.y + j};
										let status = Game.map.getRoomStatus(util.getRoomNameFromCoords(coords)).status

										if (status == "novice" || status == "respawn") {
											anyWeirdZone = true;
											i = 4
											break
										}
									}
								}

								if (!anyWeirdZone) {
									minValue = room.memory.claimScore
									lowestRoom = room;								
								}
							}
						}
						if (lowestRoom) {
							// Stablity check. We'll wait until Memory.roomToUnclaimTick is sufficiently in the past before doing anything
							// If it's flip-flopping, do nothing. Maybe that's a bad thing?
							if (lowestRoom.name != Memory.roomToUnclaim) {
								Memory.roomToUnclaimTick = Game.time
								delete global.currentlyUnclaimingRoom
							}
							Memory.roomToUnclaim = lowestRoom.name

						}
					}
				}
				else {
					delete Memory.roomToUnclaimTick
					delete Memory.roomToUnclaim
					delete global.currentlyUnclaimingRoom
				}

			}
		}
		else {
			delete Memory.roomToUnclaimTick
			delete Memory.roomToUnclaim
			delete global.currentlyUnclaimingRoom
		}

		if (Memory.visScouting) {			
			for (let roomName in Memory.rooms) {
				if (Memory.rooms[roomName].lo !== undefined) {
					Game.map.visual.text(Game.time - Memory.rooms[roomName].lo.toString(), new RoomPosition(25, 25, roomName), {fontSize: 5})	
				}
			}

			for (let room of Game.myRooms) {
				for (let scoutName of (room.mem.ownedCreeps["scout"] || [])) {
					if (!Memory.creeps[scoutName] || !Memory.creeps[scoutName].targetRoom || !Game.creeps[scoutName]) continue
					Game.map.visual.line(Game.creeps[scoutName].pos, new RoomPosition(25, 25, Memory.creeps[scoutName].targetRoom), {color: "#0000ff", opacity: 0.5})
				}
				for (let scoutName of (room.mem.ownedCreeps["powerScout"] || [])) {
					if (!Memory.creeps[scoutName] || !Memory.creeps[scoutName].targetRoom || !Game.creeps[scoutName]) continue
					Game.map.visual.line(Game.creeps[scoutName].pos, new RoomPosition(25, 25, Memory.creeps[scoutName].targetRoom), {color: "#ff4040", opacity: 0.5})

				}
			}

			for (let roomName of Memory.scoutRooms) {
				Game.map.visual.circle(new RoomPosition(25, 25, roomName), {fill: "#0000ff", opacity: 0.5})
			}
		}



		// Vis
		if (Memory.visRemotes && Game.cpu.bucket > 3000) {
			for (let roomName of Memory.usedRemotes) {
				Game.map.visual.rect(new RoomPosition(0, 0, roomName), 50, 50, {fill: "#00ff00", opacity: 0.1})
			}

			let idx = 0
			for (let room of Game.myRooms) {
				for (let roomName in Memory.remoteHarvestingValues[room.name]) {
					let values = Memory.remoteHarvestingValues[room.name][roomName]
					Game.map.visual.text("v" + values.v, new RoomPosition(10 + 15 * idx, 15, roomName), {fontSize: 5})	
					Game.map.visual.text("c" + values.c, new RoomPosition(10 + 15 * idx, 25, roomName), {fontSize: 5})	
					Game.map.visual.text("u" + values.u, new RoomPosition(10 + 15 * idx, 35, roomName), {fontSize: 5})
				}

				idx++
			}
		}

		if (Memory.visFullyCon) {
			for (let roomName in Memory.rooms) {
				if (Memory.rooms[roomName].fullyConnected !== undefined) {
					if (Memory.rooms[roomName].fullyConnected === 0) {
						Game.map.visual.text("⛔", new RoomPosition(25, 25, roomName), {fontSize: 5})	
					}
					else {
						Game.map.visual.text("🟢", new RoomPosition(25, 25, roomName), {fontSize: 5})	
					}
				}
			}
		}

		if (Memory.visAccessible) {
			for (let roomName in Memory.rooms) {
				if (!util.isRoomAccessible(roomName)) {
					Game.map.visual.text("⛔", new RoomPosition(25, 25, roomName), {fontSize: 5})						
				}
				else {
					Game.map.visual.text("🟢", new RoomPosition(25, 25, roomName), {fontSize: 5})	
				}
			}
		}

		if (Memory.visPortals) {
			for (let portalRoomName of Memory.knownPortalRoomNames) {
				if (!Memory.rooms[portalRoomName] || !Memory.rooms[portalRoomName].portalDest) continue

				let dest = Memory.rooms[portalRoomName].portalDest

				if (!dest) continue

				Game.map.visual.line(new RoomPosition(25, 25, portalRoomName), new RoomPosition(25, 25, dest.roomName), {fill: "#0000ff", opacity: 0.5, "lineStyle": "dotted", width: 2})
			}
		}


	}
};

module.exports = overseerAI;