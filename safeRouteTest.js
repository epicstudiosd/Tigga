let util = require('util');
let roomIntel = require('roomIntel');
let intelAI = require('intelAI');

function getRoomCost(roomName, fromRoomName, fromRoom, toRoom, toCoords, useNoise, swampMod, allowPortals, maxRange, avoidKeepers, ignoreKeepers, avoidHostiles) {
	let canUseCache = !avoidKeepers && !ignoreKeepers && !avoidHostiles

	// if (Memory.season2) {
	// 	var coords = util.getSectorCoords(roomName);
	// 	if (coords.x == 0 || coords.y == 0) {
	// 		canUseCache = false;
	// 	}
	// }

	if (global.inTickObject.findSafeRouteCBResult[roomName] && canUseCache) {
		return global.inTickObject.findSafeRouteCBResult[roomName];
	}

	let mem = Memory.rooms[roomName]
			
	if (!util.isRoomAccessible(roomName)) {
		return Infinity;
	}

	var coords = util.getSectorCoords(roomName);

	let mod = 1;


	let keeperRoom = coords.x >= 4 && coords.x <= 6 && coords.y >= 4 && coords.y <= 6 && !(coords.x == 5 && coords.y == 5);

	let swampRatio = roomIntel.getSwampRatio(roomName)
	let wallRatio = roomIntel.getWallRatio(roomName)

	let swampCost = swampRatio > (keeperRoom && !ignoreKeepers ? 0.1 : 0.2) ? swampRatio : 0;
	let wallCost = wallRatio > (keeperRoom && !ignoreKeepers ? 0.1 : 0.2) ? wallRatio : 0;

	let DT

	if (mem) {
		DT = mem.DT

		if (DT < 1) {
			DT = (DT + 1) / 2
		}

		let harvestedKeeperRoom = keeperRoom && Memory.keeperHarvestRooms && Memory.keeperHarvestRooms.includes(roomName);
		// Assume reserved remotes have roads
		if (Memory.rooms[roomName].reservedBy == util.getMyName()) {
			swampCost /= 2;
		}

		if (keeperRoom && !harvestedKeeperRoom && !ignoreKeepers) {
			if ((toCoords.x != 5 || toCoords.y != 5) && avoidKeepers) {
				return Infinity
			}
			swampCost *= 2;
			wallCost *= 2;
		}

		if (swampMod) {
			swampCost *= swampMod;
		}

		mod += swampCost;
		mod += wallCost;

		if (avoidHostiles && DT > 1) {
			mod *= 1 + (DT - 1) * 8
		}
	}
	else {
		DT = 1.5;

		mod += swampCost;
		mod += wallCost;
	}


	if (keeperRoom && (!mem || !mem.twrX || mem.twrX.length == 0)) {
		if (fromRoom != roomName && toRoom != roomName && (!Memory.keeperHarvestRooms || !Memory.keeperHarvestRooms.includes(roomName))) {
			if (toCoords.x == 5 && toCoords.y == 5) {
				let score = mod * (0.75 + DT / 2) * (0.9 + (useNoise ? Math.random() * 0.2 : 0.1));
				// if (toRoom == "E7N5" && fromRoom == "E1N6") Game.map.visual.text(Math.round(score * 100).toString(), new RoomPosition(25, 25, roomName), {})
				return score
			}
			else {
				if (!ignoreKeepers && avoidKeepers && (!mem || !mem.skNavigable)) {
					return Infinity
				}

				let mod2
				if (ignoreKeepers) {
				 	mod2 = (0.75 + Math.max(0, DT - 1))
				}
				else if (mem && mem.skNavigable === 1) {
					mod2 = (1 + Math.max(0, DT - 1))
				}
				else {
					mod2 = (3 + Math.max(0, DT - 1))
				}

				let score = mod * mod2 * ((0.9 + (useNoise ? Math.random() * 0.2 : 0.1)));
				if (canUseCache) {
					global.inTickObject.findSafeRouteCBResult[roomName] = score;
				}
				// if (toRoom == "E7N5" && fromRoom == "E1N6") Game.map.visual.text(Math.round(score * 100).toString(), new RoomPosition(25, 25, pathRoomName), {})
				// if (Game.shard.name == "shard3") console.log(pathRoomName, score)
				return score
			}
		}
		else {
			let score = mod * (0.75 + DT / 2) * (0.9 + (useNoise ? Math.random() * 0.2 : 0.1));
			// if (toRoom == "E7N5" && fromRoom == "E1N6") Game.map.visual.text(Math.round(score * 100).toString(), new RoomPosition(25, 25, pathRoomName), {})
			// if (Game.shard.name == "shard3") console.log(pathRoomName, score)
			return score
		}
	}
	else if (fromRoom != roomName && toRoom != roomName && mem && mem.owner && mem.owner != util.getMyName()) {
		let hasTowers = (mem.twrX && mem.twrX.length != 0);
		let hasSpawns = (mem.spwnX && mem.spwnX.length != 0);
		if (hasTowers || (mem.safeMode || 0) > 0 || mem.invCL || !mem.enemyFullyConnected) {
			let score = Infinity
			// if (mem.owner == "Cub") console.log("Infinity in safeRoute", roomName, fromRoom, toRoom, JSON.stringify(mem))
			if (canUseCache) {
				global.inTickObject.findSafeRouteCBResult[roomName] = score;
			}
			// if (toRoom == "E7N5" && fromRoom == "E1N6") Game.map.visual.text(Math.round(score * 100).toString(), new RoomPosition(25, 25, pathRoomName), {})
			// if (Game.shard.name == "shard3") console.log(pathRoomName, score)
			return score
		}
		else if (hasSpawns) {
			let score = mod * 3 * (0.9 + (useNoise ? Math.random() * 0.2 : 0.1));
			if (canUseCache) {
				global.inTickObject.findSafeRouteCBResult[roomName] = score;
			}
			// if (toRoom == "E7N5" && fromRoom == "E1N6") Game.map.visual.text(Math.round(score * 100).toString(), new RoomPosition(25, 25, pathRoomName), {})
			// if (Game.shard.name == "shard3") console.log(pathRoomName, score)
			return score
		}
		else {
			let score = mod * 2 * (0.9 + (useNoise ? Math.random() * 0.2 : 0.1));
			if (canUseCache) {
				global.inTickObject.findSafeRouteCBResult[roomName] = score;
			}
			// if (toRoom == "E7N5" && fromRoom == "E1N6") Game.map.visual.text(Math.round(score * 100).toString(), new RoomPosition(25, 25, pathRoomName), {})
			// if (Game.shard.name == "shard3") console.log(pathRoomName, score)
			return score;
		}
	}
	// Last intel there was an enemy room here but we don't have room memory available.
	else if (!mem && fromRoom != roomName && toRoom != roomName && (intelAI.getEnemyRoomSet().has(roomName) || Memory.strongholdRooms.includes(roomName))) {
		let score = mod * 20 * (0.9 + (useNoise ? Math.random() * 0.2 : 0.1));
		if (canUseCache) {
			global.inTickObject.findSafeRouteCBResult[roomName] = score;
		}
		// if (toRoom == "E7N5" && fromRoom == "E1N6") Game.map.visual.text(Math.round(score * 100).toString(), new RoomPosition(25, 25, pathRoomName), {})
		// if (Game.shard.name == "shard3") console.log(pathRoomName, score)
		return score
	}
	// Don't let highways be blockers - newbie zones may annoy but shouldn't block between two accessible rooms.
	// EXCEPT ON SEASON BLOODY 2
	else if (fromRoom != roomName && toRoom != roomName && mem && mem.fullyConnected === 0 && (Memory.season2 || (coords.x != 0 && coords.y != 0))) {
		/*if (Memory.season2) {
			if (coords.x == 0) {				
				// Crossing horizontally
				if (util.getSectorCoords(roomName).x % 2 == 1 && util.getSectorCoords(fromRoomName).x % 2 == 1) {
					return Infinity
				}
			}
			if (coords.y == 0) { 
				// Crossing vertically
				if (util.getSectorCoords(roomName).y % 2 == 1 && util.getSectorCoords(fromRoomName).y % 2 == 1) {
					return Infinity
				}
			}
		}*/


		let score = mod * 20 * (0.75 + DT / 2) * (0.9 + (useNoise ? Math.random() * 0.2 : 0.1));
		if (canUseCache) {
			global.inTickObject.findSafeRouteCBResult[roomName] = score;
		}
		// if (toRoom == "E7N5" && fromRoom == "E1N6") Game.map.visual.text(Math.round(score * 100).toString(), new RoomPosition(25, 25, pathRoomName), {})
		// if (Game.shard.name == "shard3") console.log(pathRoomName, score)
		return score;
	}
	else {
		let score = mod * (0.75 + DT / 2) * (0.9 + (useNoise ? Math.random() * 0.2 : 0.1));
		if (canUseCache) {
			global.inTickObject.findSafeRouteCBResult[roomName] = score;
		}
		// if (toRoom == "E7N5" && fromRoom == "E1N6") Game.map.visual.text(Math.round(score * 100).toString(), new RoomPosition(25, 25, pathRoomName), {})
		// if (Game.shard.name == "shard3") console.log(pathRoomName, score)
		return score
	}
}



var safeRoute = {
	findSafeRoute(fromRoom, toRoom, useNoise, swampMod, allowPortals, maxRange, avoidKeepers, ignoreKeepers, avoidHostiles) {
		// let hash = fromRoom + toRoom;
		let toCoords = util.getSectorCoords(toRoom);

		maxRange = maxRange || 30;

		let linearDist = Game.map.getRoomLinearDistance(fromRoom, toRoom);

		if (!allowPortals && linearDist > maxRange) {
			return ERR_NO_PATH;
		}

		let t = Game.cpu.getUsed();

		// Oof.
		if (t > 500) {
			return ERR_NO_PATH
		}

		// We don't use fromRoomName. Cache and return ones we've seen this tick already.
		global.inTickObject.findSafeRouteCBResult = global.inTickObject.findSafeRouteCBResult || {};

		let canUseCache = !avoidKeepers && !ignoreKeepers && !avoidHostiles

		// We're using dangerTracking as a fairly strong signal.
		// The trouble is that it can make 2x difference without any hostiles
		// To resolve this we need to ignore low DT

		function cb(pathRoomName, fromRoomName) {
			if (Game.map.getRoomLinearDistance(pathRoomName, fromRoom) > maxRange || Game.map.getRoomLinearDistance(pathRoomName, toRoom) > maxRange) {
				return Infinity
			}
			return getRoomCost(pathRoomName, fromRoomName, fromRoom, toRoom, toCoords, useNoise, swampMod, allowPortals, maxRange, avoidKeepers, ignoreKeepers, avoidHostiles)
		}


		let directRoute;
		if (linearDist > maxRange) {
			directRoute = ERR_NO_PATH;
		} 
		else {
			// console.log(fromRoom, toRoom, Game.cpu.getUsed())
			directRoute = Game.map.findRoute(fromRoom, toRoom, {routeCallback: cb});
			// console.log(fromRoom, toRoom, Game.cpu.getUsed())
		}

		if (allowPortals) {
			let bestPortalRoute;
			let bestPortalRouteLength = (directRoute == ERR_NO_PATH ? Infinity : directRoute.length);

			Memory.knownPortalRoomNames = Memory.knownPortalRoomNames || [];
			for (let portalRoomName of Memory.knownPortalRoomNames) {
				if (!Memory.rooms[portalRoomName]) continue;
				if (!Memory.rooms[portalRoomName].portalDest) continue;
				let dist1 = Game.map.getRoomLinearDistance(fromRoom, portalRoomName)
				if (dist1 > maxRange || dist1 > bestPortalRouteLength) continue;
				let otherSide = Memory.rooms[portalRoomName].portalDest.roomName;

				if (!Memory.rooms[otherSide]) continue;
				let dist2 = Game.map.getRoomLinearDistance(toRoom, otherSide)
				if (dist1 + dist2 > maxRange || dist1 + dist2 > bestPortalRouteLength) continue;
				let routeToPortalRoom = Game.map.findRoute(fromRoom, portalRoomName, {routeCallback: cb});

				let length1 = routeToPortalRoom.length;

				// Diagonal is 2 rooms but can be traversed in same time as 1. 
				// It's not perfect as a hairpin will be many rooms in not much time, but a hairpin in not much
				// time usually involves a long step before/after.
				if (length1 / 2 + dist2 > maxRange) continue;

				if (routeToPortalRoom != ERR_NO_PATH && length1 < bestPortalRouteLength) {
					routeToPortalRoom.push({"exit": "portal", "room": otherSide})

					let routeFromPortalRoom = Game.map.findRoute(otherSide, toRoom, {routeCallback: cb});

					if (routeFromPortalRoom != ERR_NO_PATH) {
						if (length1 + routeFromPortalRoom.length < bestPortalRouteLength) {
							bestPortalRoute = routeToPortalRoom.concat(routeFromPortalRoom);
							bestPortalRouteLength = bestPortalRoute.length;
						}
					}
				}

			}

			if (bestPortalRoute && bestPortalRouteLength < (directRoute == ERR_NO_PATH ? Infinity : directRoute.length)) {
				if (Game.cpu.getUsed() - t > 10) {
					// console.log("a", fromRoom, toRoom, t)
				}
				return bestPortalRoute
			}
			else {
				if (Game.cpu.getUsed() - t > 10) {
					// console.log("b", fromRoom, toRoom, t)
				}
				return directRoute
			}
		}
		if (Game.cpu.getUsed() - t > 10) {
			// console.log("c", fromRoom, toRoom, t)
		}

		return directRoute;
	},


	getSafeRouteCost(fromRoom, toRoom, allowPortals, force, maxRange, avoidKeepers, ignoreKeepers) {
		if (_.isObject(fromRoom)) {
			fromRoom = fromRoom.name;
		}
		if (_.isObject(toRoom)) {
			toRoom = toRoom.name;
		}

		if (fromRoom == toRoom) {
			return 0;
		}

		if (!util.isRoomAccessible(fromRoom)) {
			return Infinity
		}
		if (!util.isRoomAccessible(toRoom)) {
			return Infinity
		}


		// These are not directional
		let hash = fromRoom + toRoom;
		let hash2 = toRoom + fromRoom;

		maxRange = maxRange || 30;

		maxRange = Math.ceil(maxRange);

		hash += (allowPortals ? "p" : "n") + maxRange + "_" + (avoidKeepers ? 1 : 0) + (ignoreKeepers ? 1 : 0)
		hash2 += (allowPortals ? "p" : "n") + maxRange + "_" + (avoidKeepers ? 1 : 0) + (ignoreKeepers ? 1 : 0)

		global.safeRouteCostsTest = global.safeRouteCostsTest || {};

		let skipCalc = (!force || Game.cpu.getUsed() > 500) && Game.cpu.getUsed() > 300;

		console.log(hash)
		console.log(global.safeRouteCostsTest[hash])
		console.log(hash2)
		console.log(global.safeRouteCostsTest[hash2])

		// 1% chance of clearing so if we poll it a lot it is more likely to be up to date.
		if (global.safeRouteCostsTest[hash] && (skipCalc || Math.random() < 0.99)) {
			if (global.safeRouteCostsTest[hash] < 0 || global.safeRouteCostsTest[hash] > maxRange) {
				return Infinity;
			}
			else {
				return global.safeRouteCostsTest[hash];
			}
		}
		else if (global.safeRouteCostsTest[hash2] && (skipCalc || Math.random() < 0.99)) {
			if (global.safeRouteCostsTest[hash2] < 0 || global.safeRouteCostsTest[hash2] > maxRange) {
				return Infinity;
			}
			else {
				return global.safeRouteCostsTest[hash2];
			}
		}
		// Same as above but we can try the unlimited hash
		else if (maxRange != 30) {
			let hash = fromRoom + toRoom;
			let hash2 = toRoom + fromRoom;
			hash += (allowPortals ? "p" : "n") + 30 + "_" + (avoidKeepers ? 1 : 0) + (ignoreKeepers ? 1 : 0)
			hash2 += (allowPortals ? "p" : "n") + 30 + "_" + (avoidKeepers ? 1 : 0) + (ignoreKeepers ? 1 : 0)

			console.log(hash)
			console.log(global.safeRouteCostsTest[hash])
			console.log(hash2)
			console.log(global.safeRouteCostsTest[hash2])

			if (global.safeRouteCostsTest[hash] && (skipCalc || Math.random() < 0.99)) {
				if (global.safeRouteCostsTest[hash] < 0 || global.safeRouteCostsTest[hash] > maxRange) {
					return Infinity;
				}
				else {
					return global.safeRouteCostsTest[hash];
				}
			}
			else if (global.safeRouteCostsTest[hash2] && (skipCalc || Math.random() < 0.99)) {
				if (global.safeRouteCostsTest[hash2] < 0 || global.safeRouteCostsTest[hash2] > maxRange) {
					return Infinity;
				}
				else {
					return global.safeRouteCostsTest[hash2];
				}
			}
		}

		// findRoute can be suprisingly expensive
		// This result isn't cached, so shouldn't cause too many issues.
		if (skipCalc) {
			return Infinity;
		}

		if (!allowPortals && Game.map.getRoomLinearDistance(fromRoom, toRoom) > maxRange) {
			return Infinity;	
		}

		// It is much more likely the room we're going to will be blocked so search backwards
		// if (toRoom == "E27S8" || fromRoom == "E27S8") console.log(Game.cpu.getUsed())
		let route = this.findSafeRoute(toRoom, fromRoom, false, 0, allowPortals, maxRange, avoidKeepers, ignoreKeepers);
		// if (toRoom == "E27S8" || fromRoom == "E27S8") console.log(Game.cpu.getUsed())
		if (route == ERR_NO_PATH) {
			global.safeRouteCostsTest[hash] = -2;
			return Infinity;
		}
		let toCoords = util.getSectorCoords(toRoom);

		let cost = 0;
		let lastExit;
		let lastRoom = toRoom;
		let lastlastRoom = toRoom;
		for (let step of route) {
			let tmpCost = 0;
			if (step.exit == "portal" || lastExit == "portal") {
				tmpCost += 0.5;
			}

			let pathRoomName = step.room;

			// Damn seasonal walls
			// if (Memory.season2 && Memory.rooms[lastRoom] && Memory.rooms[lastRoom].fullyConnected === 0) {
			// 	let lastSectorCoords = util.getSectorCoords(lastRoom)
			// 	if (lastSectorCoords.x == 0) {
			// 		let currentSectorCoords = util.getSectorCoords(pathRoomName)
			// 		let lastLastSectorCoords = util.getSectorCoords(lastlastRoom)

			// 		// Crossed a highway wall
			// 		if (currentSectorCoords.x % 2 == 1 && lastLastSectorCoords.x % 2 == 1) {
			// 			console.log("Marking", lastlastRoom, lastRoom, pathRoomName, "as impassible season wall in safeRoute")
			// 			cost = Infinity
			// 			break
			// 		}
			// 	}
			// 	if (lastSectorCoords.y == 0) {
			// 		let currentSectorCoords = util.getSectorCoords(pathRoomName)
			// 		let lastLastSectorCoords = util.getSectorCoords(lastlastRoom)

			// 		// Crossed a highway wall
			// 		if (currentSectorCoords.y % 2 == 1 && lastLastSectorCoords.y % 2 == 1) {
			// 			console.log("Marking", lastlastRoom, lastRoom, pathRoomName, "as impassible season wall in safeRoute")
			// 			cost = Infinity
			// 			break
			// 		}
			// 	}
			// }

			// getRoomCost(roomName, fromRoom, toRoom, toCoords, useNoise, swampMod, allowPortals, maxRange, avoidKeepers, ignoreKeepers, avoidHostiles)
			tmpCost += getRoomCost(pathRoomName, lastRoom, fromRoom, toRoom, toCoords, false, 0, allowPortals, maxRange, avoidKeepers, ignoreKeepers, false)


			// Turning a corner.
			if (lastExit && Math.abs(lastExit - step.exit) != 4) {
				tmpCost /= 2;
			}
			// Avoid keeper rooms if we can please.
			// Actually don't. If they're a keeper harvest room we can go through them.
			// if (Memory.keeperHarvestRooms && Memory.keeperHarvestRooms.indexOf(pathRoomName) >= 0) {
			// 	tmpCost *= 1.1;
			// }

			cost += tmpCost;

			// console.log(pathRoomName, lastRoom)

			lastExit = step.exit;
			lastlastRoom = lastRoom;
			lastRoom = pathRoomName;


		}

		if (cost > maxRange) {
			cost = Infinity
		}


		global.safeRouteCostsTest[hash] = cost;

		return cost;
	},

	cleanSafeRouteCostCache() {
		if (Math.random() < 0.05 * Memory.stats.avgBucket / 10000) {
			for (let hash in _.clone(global.safeRouteCostsTest)) {
				if (Math.random() < 0.015) {
					delete global.safeRouteCostsTest[hash];
				}
			}
		}
	}
}


module.exports = safeRoute;
