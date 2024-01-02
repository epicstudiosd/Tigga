"use strict";

const findRoute = require("findRoute")

var util = {
	getMyName() {
		if (!global.myName) {
			if (Object.keys(Game.structures)[0]) {
				global.myName = Game.getObjectById(Object.keys(Game.structures)[0]).owner.username;
			}
			else if (Object.keys(Game.creeps)[0]) {
				global.myName = Game.creeps[Object.keys(Game.creeps)[0]].owner.username;
			}
			else if (Object.keys(Game.constructionSites)[0]) {
				global.myName = Game.getObjectById(Object.keys(Game.constructionSites)[0]).owner.username;
			}
		}
		return global.myName;
	},

	getNumConstructionSites() {
		if (global.inTickObject.numConstructionSites === undefined) {
			global.inTickObject.numConstructionSites = Object.keys(Game.constructionSites).length;
		}

		return global.inTickObject.numConstructionSites

	},

	getAllHarvesters() {
		global.inTickObject.allharvesters = global.inTickObject.allharvesters || _.filter(Game.creeps, (creep) => creep.mem && (creep.mem.role == 'harvester' || creep.mem.role == 'bHarvester' || creep.mem.role == 'centralHarvester' || creep.mem.role == 'keeperHarvester2'))
		return global.inTickObject.allharvesters
	},





	isNPCTerminalRoom(roomName) {
		let str = roomName
		// Throw away E:W
		str = str.substr(1)
		var NS = str.indexOf("N")
		if (NS < 0) {
			NS = str.indexOf("S")
		}

		var eastWestPos = parseInt(str.substr(0, NS))
		var northSouthPos = parseInt(str.substr(NS+1))

		return eastWestPos % 10 == 0 && northSouthPos % 10 == 0

	},

	// Doesn't distinguish E/W at highways
	getRoomPos(roomName) {
		let str = roomName
		// Throw away E:W
		str = str.substr(1)
		var NS = str.indexOf("N")
		if (NS < 0) {
			NS = str.indexOf("S")
		}

		var eastWestPos = parseInt(str.substr(0, NS))
		var northSouthPos = parseInt(str.substr(NS+1))

		return {"x": eastWestPos, "y": northSouthPos}
	},

	getRoomCoords(roomName) {
		global._roomCoords = global._roomCoords || {};
		if (global._roomCoords[roomName]) {
			return _.clone(global._roomCoords[roomName]);
		}
		else {

			let str = roomName
			// Throw away E:W
			str = str.substr(1)
			var north;
			var NS = str.indexOf("N")
			if (NS < 0) {
				NS = str.indexOf("S")
				north = false;
			}
			else {
				north = true;
			}

			var eastWestPos = parseInt(str.substr(0, NS))

			var northSouthPos = parseInt(str.substr(NS+1))

			var west;
			if (roomName.indexOf("W") >= 0) {
				west = true;
			}
			else {
				west = false;
			}
			global._roomCoords[roomName] = {"x": west ? eastWestPos : -1 - eastWestPos, "y": north ? northSouthPos : -1 - northSouthPos}
			return _.clone(global._roomCoords[roomName])
		}
	},


	getSectorCoords(roomName) {
		global._sectorCoords = global._sectorCoords || {};
		if (global._sectorCoords[roomName]) {
			return _.clone(global._sectorCoords[roomName]);
		}
		else {
			// Throw away E:W
			let str = roomName.substr(1)
			let NS = str.indexOf("N")
			if (NS < 0) {
				NS = str.indexOf("S")
			}

			let eastWestPos = parseInt(str.substr(0, NS))
			let northSouthPos = parseInt(str.substr(NS+1))

			global._sectorCoords[roomName] = {"x": eastWestPos % 10, "y": northSouthPos % 10};
			return _.clone(global._sectorCoords[roomName]);
		}
	},

	areNeighbourRooms(roomName1, roomName2) {
		let coords1 = this.getRoomCoords(roomName1);
		let coords2 = this.getRoomCoords(roomName2);

		return Math.abs(coords1.x - coords2.x) + Math.abs(coords1.y - coords2.y) == 1;
	},

	areRoomsConnected(roomName1, roomName2) {
		let exits = Game.map.describeExits(roomName1);

		for (var exitDir in exits) {
		   	var exitRoom = exits[exitDir];
		   	if (exitRoom == roomName2) return true;
		}
		return false
	},

	getCentreRoomForRoomPos(pos) {
		const parsed = /^([WE])([0-9]+)([NS])([0-9]+)$/.exec(pos.roomName);
		const [_, ew, x, ns, y] = parsed;

		let xMore = ((pos.x <= 24 && ew == 'W') || (pos.x >= 25 && ew == 'E'));
		let yMore = ((pos.y <= 24 && ns == 'N') || (pos.y >= 25 && ns == 'S'));

		let xBorder = ((parseInt(x) % 10) == 0);
		let yBorder = ((parseInt(y) % 10) == 0);

		let xSector = '?';
		let ySector = '?';

		if (parseInt(x) == 0) {
			if (xMore) {
				xSector = ew + (Math.floor((parseInt(x)+1) / 10) * 10 + 5);
			} 
			else {
				xSector = '--';
			}
		} 
		else if (xBorder) {
			if (xMore) {
				xSector = ew + (Math.floor((parseInt(x)+1) / 10) * 10 + 5);
			} 
			else {
				xSector = ew + (Math.floor((parseInt(x)-1) / 10) * 10 + 5);
			}
		} 
		else {
			xSector = ew + (Math.floor(parseInt(x) / 10) * 10 + 5);
		}

		if (parseInt(y) == 0) {
			if (yMore) {
				ySector = ns + (Math.floor((parseInt(y)+1) / 10) * 10 + 5);
			} 
			else {
				ySector = '--';
			}
		} 
		else if (yBorder) {
			if (yMore) {
				ySector = ns + (Math.floor((parseInt(y)+1) / 10) * 10 + 5);
			} 
			else {
				ySector = ns + (Math.floor((parseInt(y)-1) / 10) * 10 + 5);
			}
		} 
		else {
			ySector = ns + (Math.floor(parseInt(y) / 10) * 10 + 5);
		}

		return xSector + ySector;
	},

	getCentreRoomXYForRoomName(roomName) {
		let roomCoords = this.getRoomCoords(roomName);

		let centreRoomX;
		let centreRoomY;

		if (roomCoords.x >= 0) {
			centreRoomX = Math.floor(roomCoords.x / 10) * 10 + 5;
		}
		else {
			centreRoomX = Math.ceil((roomCoords.x + 1) / 10) * 10 - 5 - 1;
		}
		if (roomCoords.y >= 0) {
			centreRoomY = Math.floor(roomCoords.y / 10) * 10  + 5;
		}
		else {
			centreRoomY = Math.ceil((roomCoords.y + 1) / 10) * 10 - 5 - 1;
		}

		return {x: centreRoomX, y: centreRoomY}
	},

	getCentreRoomForRoomName(roomName) {
		return this.getRoomNameFromCoords(this.getCentreRoomXYForRoomName(roomName));
	},

	hasSectorGotAStronghold(roomName) {
		global.sectorHasAStronghold = global.sectorHasAStronghold || {}
		if (global.sectorHasAStronghold[roomName] === undefined || Math.random() < 0.01) {
			let centreRoomXY = this.getCentreRoomXYForRoomName(roomName);

			for (let i = -1; i <= 1; i++) {
				for (let j = -1; j <= 1; j++) {
					let testRoomName = this.getRoomNameFromCoords({x: centreRoomXY.x + i, y: centreRoomXY.y + j})
					if (!Memory.rooms[testRoomName]) continue

					if (Memory.rooms[testRoomName].invCL) {
						global.sectorHasAStronghold[roomName] = true;
						return true
					}
				}
			}
		}
		else {
			return global.sectorHasAStronghold[roomName]
		}

		global.sectorHasAStronghold[roomName] = false;
		return false;
	},

	isRoomAccessible(roomName) {
		function setSeason2Accessible(roomName) {
			global.isRoomAccessible[roomName] = true;
			let sectorCoords = util.getSectorCoords(roomName)		
			let roomCoords = util.getRoomCoords(roomName)				
			if (sectorCoords.x == 0 || sectorCoords.y == 0) {
				for (let otherRoomName of Object.values(Game.map.describeExits(roomName))) {
					if (global.isRoomAccessible[otherRoomName] === false) {
						delete global.isRoomAccessible[otherRoomName]
					}
				}
			}
		}


		global.isRoomAccessible = global.isRoomAccessible || {}
		if (global.isRoomAccessible[roomName] === undefined || Math.random() < 0.01) {
			global.isRoomAccessible[roomName] = Game.map.getRoomStatus(roomName).status == global.zoneType
			if (global.isRoomAccessible[roomName] && Memory.season2 && Memory.openSectors) {
				let centreRoomName = this.getCentreRoomForRoomName(roomName);

				if (!Memory.openSectors.includes(centreRoomName)) {
					if (Game.rooms[roomName] && Game.rooms[roomName].find(FIND_MY_CREEPS).length) {
						setSeason2Accessible(roomName)
					}
					else {						
						let sectorCoords = this.getSectorCoords(roomName)
						let roomCoords = this.getRoomCoords(roomName)

						// Close enough. 
						if (sectorCoords.x == 0 || sectorCoords.y == 0) {
							global.isRoomAccessible[roomName] = false;
							for (let otherRoomName of Object.values(Game.map.describeExits(roomName))) {
								if (!global.isRoomAccessible[otherRoomName]) continue

								let otherSectorCoords = this.getSectorCoords(otherRoomName)
								let otherRoomCoords = this.getRoomCoords(otherRoomName)

								if (otherRoomCoords.x == roomCoords.x && otherSectorCoords.y != 0 && util.getCentreRoomForRoomName(roomName) == util.getCentreRoomForRoomName(otherRoomName)) {
									// global.isRoomAccessible[roomName] = true;
									setSeason2Accessible(roomName)
									break
								}
								else if (otherRoomCoords.y == roomCoords.y && otherSectorCoords.x != 0  && util.getCentreRoomForRoomName(roomName) == util.getCentreRoomForRoomName(otherRoomName)) {
									// global.isRoomAccessible[roomName] = true;
									setSeason2Accessible(roomName)
									break
								}
								else if ((otherSectorCoords.x != 0 || (sectorCoords.x == 0 && otherRoomCoords.x != roomCoords.x && Memory.rooms[otherRoomName] && Memory.rooms[otherRoomName].seasonWallsToRemove && Memory.rooms[otherRoomName].seasonWallsToRemove.length == 0)) && 
									(otherSectorCoords.y != 0 || (sectorCoords.y == 0 && otherRoomCoords.y != roomCoords.y && Memory.rooms[otherRoomName] && Memory.rooms[otherRoomName].seasonWallsToRemove && Memory.rooms[otherRoomName].seasonWallsToRemove.length == 0))) {
									// global.isRoomAccessible[roomName] = true;
									setSeason2Accessible(roomName)
									break
								}
							}
						}
						else {
							global.isRoomAccessible[roomName] = false;
						}
					}
				}

			}
		}
		
		return global.isRoomAccessible[roomName]
	},

	getRoomStatus(roomName) {
		global._getRoomStatus = global._getRoomStatus || {}
		if (global._getRoomStatus[roomName] === undefined || Math.random() < 0.1) {
			global._getRoomStatus[roomName] = Game.map.getRoomStatus(roomName).status
		}
		
		return global._getRoomStatus[roomName]
	},



	getRoomNameFromCoords(roomCoords) {
		let str = ""

		if (roomCoords.x >= 0) {
			str += "W"
			str += roomCoords.x;
		}
		else {
			str += "E"
			str += -1-roomCoords.x;
		}

		if (roomCoords.y >= 0) {
			str += "N"
			str += roomCoords.y;
		}
		else {
			str += "S"
			str += -1-roomCoords.y;
		}

		return str;
	},

	getEmpireCentreRoom() {
		if (global.empireCentreRoom && Math.random() < 0.999) {
			return global.empireCentreRoom
		}

		let meanX = 0;
		let meanY = 0;

		for (let room of Game.myRooms) {
			let roomCoords = this.getRoomCoords(room.name);
			meanX += roomCoords.x;
			meanY += roomCoords.y;
		}

		meanX /= Game.myRooms.length;
		meanY /= Game.myRooms.length;

		meanX = Math.round(meanX);
		meanY = Math.round(meanY);

		let centreRoomName = this.getRoomNameFromCoords({x: meanX, y: meanY});

		global.empireCentreRoom = _.min(Game.myRooms, function(room) {
			return Game.map.getRoomLinearDistance(room.name, centreRoomName);
		});

		return global.empireCentreRoom

	},

	isEdgeOfRoom: function(pos) {
		return pos.x == 0 || pos.x == 49 || pos.y == 0 || pos.y == 49;
	},

	isNearEdgeOfRoom: function(pos, range) {
		return pos.x <= range || pos.x >= 49 - range || pos.y <= range || pos.y >= 49 - range;
	},

	// Takes 50x50 in, spits 50 strings out.
	compressFloodArray: function(floodArray) {
		let ret = [];
		for (let i = 0; i < 50; i++) {
			ret[i] = ""
			for (let j = 0; j < 50; j++) {
				ret[i] += floodArray[i][j];
			}
		}
		return ret;
	},

	compressFloodArrayCM: function(floodArray) {
		let ret = [];
		for (let i = 0; i < 50; i++) {
			ret[i] = ""
			for (let j = 0; j < 50; j++) {
				ret[i] += floodArray.get2(i, j);
			}
		}
		return ret;
	},

	getTowerRepairForDist: function(dist) {
		return this.getTowerPowerForDist(dist, TOWER_POWER_REPAIR)
	},

	getTowerHealForDist: function(dist) {
		return this.getTowerPowerForDist(dist, TOWER_POWER_HEAL)
	},

	getTowerDamageForDist: function(dist) {
		return this.getTowerPowerForDist(dist, TOWER_POWER_ATTACK)
	},

	getTowerPowerForDist: function(dist, power) {
		if (dist <= TOWER_OPTIMAL_RANGE) {
			return power
		}
		if (dist >= TOWER_FALLOFF_RANGE) {
			return Math.floor(power * (1 - TOWER_FALLOFF));
		}
		let towerFalloffPerTile = TOWER_FALLOFF / (TOWER_FALLOFF_RANGE - TOWER_OPTIMAL_RANGE)
		return Math.floor(power * (1 - (dist - TOWER_OPTIMAL_RANGE) * towerFalloffPerTile))
	},

	getECostForCreep: function(creep) {
		// Hmm. Power creeps. Hmmm
		var cost = 0;
		_.forEach(creep.body, function(part) { cost += BODYPART_COST[part.type]; });
		return cost;
	},

	getECostForDesign: function(design) {
		// let hash = JSON.stringify(deisgn)

		var cost = 0;
		_.forEach(design, function(part) { cost += BODYPART_COST[part]; });
		return cost;
	},

	getTimeToCookBoost: function(boost) {
		global.timeToCookBoosts = global.timeToCookBoosts || {};

		if (global.timeToCookBoosts[boost]) return global.timeToCookBoosts[boost]

		let time = 0;
		if (RECIPES[boost]) {
			time += this.getTimeToCookBoost(RECIPES[boost][0])
			time += this.getTimeToCookBoost(RECIPES[boost][1])
		}
		else {
			return 0;
		}

		global.timeToCookBoosts[boost] = time + REACTION_TIME[boost]

		return time + REACTION_TIME[boost]
	},

	isSameBoostType: function(boost1, boost2) {
		if (this.isRangedBoost(boost1) && this.isRangedBoost(boost2)) {
			return true;
		}
		if (this.isHealBoost(boost1) && this.isHealBoost(boost2)) {
			return true;
		}
		if (this.isToughBoost(boost1) && this.isToughBoost(boost2)) {
			return true;
		}
		if (this.isDismantleBoost(boost1) && this.isDismantleBoost(boost2)) {
			return true;
		}
		if (this.isMoveBoost(boost1) && this.isMoveBoost(boost2)) {
			return true;
		}
		if (this.isAttackBoost(boost1) && this.isAttackBoost(boost2)) {
			return true;
		}
		if (this.isRepairBoost(boost1) && this.isRepairBoost(boost2)) {
			return true;
		}
		if (this.isUpgradeBoost(boost1) && this.isUpgradeBoost(boost2)) {
			return true;
		}
		if (this.isHarvestBoost(boost1) && this.isHarvestBoost(boost2)) {
			return true;
		}
		if (this.isCarryBoost(boost1) && this.isCarryBoost(boost2)) {
			return true;
		}
		return false;
	},

	isRangedBoost: function(boost) {
		return boost == "KO" || boost == "KHO2" || boost == "XKHO2";
	},

	isHealBoost: function(boost) {
		return boost == "LO" || boost == "LHO2" || boost == "XLHO2";
	},

	isToughBoost: function(boost) {
		return /*boost == "GO" ||*/ boost == "GHO2" || boost == "XGHO2";
	},

	isMoveBoost: function(boost) {
		return boost == "ZO" || boost == "ZHO2" || boost == "XZHO2";
	},

	isDismantleBoost: function(boost) {
		return boost == "ZH" || boost == "ZH2O" || boost == "XZH2O";
	},

	isAttackBoost: function(boost) {
		return boost == "UH" || boost == "UH2O" || boost == "XUH2O";
	},

	isRepairBoost: function(boost) {
		return boost == "LH" || boost == "LH2O" || boost == "XLH2O";
	},

	isCarryBoost: function(boost) {
		return boost == "KH" || boost == "KH2O" || boost == "XKH2O";
	},

	isCheapRepairBoost: function(boost) {
		return boost == "LH";
	},

	isUpgradeBoost: function(boost) {
		return boost == "GH" || boost == "GH2O" || boost == "XGH2O";
	},

	isHarvestBoost: function(boost) {
		return boost == "UO";
	},

	getBoostTier: function(boost) {
		switch(boost) {
			case "UH":
			case "UO":
			case "KH":
			case "KO":
			case "LH":
			case "LO":
			case "ZH":
			case "ZO":
			case "GH":
			case "GO":
				return 1;

   			case "UH2O":
   			case "UHO2":
   			case "KH2O":
   			case "KHO2":
   			case "LH2O":
   			case "LHO2":
   			case "ZH2O":
   			case "ZHO2":
   			case "GH2O":
   			case "GHO2":
   				return 2;
			case "XUH2O":
			case "XUHO2":
			case "XKH2O":
			case "XKHO2":
			case "XLH2O":
			case "XLHO2":
			case "XZH2O":
			case "XZHO2":
			case "XGH2O":
			case "XGHO2":
				return 3;
			default:
				return 0;
		}
	},

	isDepositResource: function (resourceType) {
		return resourceType == RESOURCE_SILICON || resourceType == RESOURCE_METAL || resourceType == RESOURCE_BIOMASS || resourceType == RESOURCE_MIST
	},

	getNextTierForCommoditiy: function(resourceType) {
		switch (resourceType) {
			case RESOURCE_SILICON:
				return RESOURCE_WIRE
			case RESOURCE_METAL:
				return RESOURCE_ALLOY
			case RESOURCE_BIOMASS:
				return RESOURCE_CELL
			case RESOURCE_MIST:
				return RESOURCE_CONDENSATE

		}
	},

	getCommoditiesForLevel: function(level) {
		switch (level || 0) {
			case 0:
				return [RESOURCE_WIRE,
						RESOURCE_CELL,
						RESOURCE_ALLOY,
						RESOURCE_CONDENSATE];

			case 1:
				return [RESOURCE_SWITCH,
						RESOURCE_PHLEGM,
						RESOURCE_TUBE,
						RESOURCE_CONCENTRATE,
						RESOURCE_COMPOSITE];

			case 2:
				return [RESOURCE_TRANSISTOR,
						RESOURCE_TISSUE,
						RESOURCE_FIXTURES,
						RESOURCE_EXTRACT,
						RESOURCE_CRYSTAL];

			case 3:
				return [RESOURCE_MICROCHIP,
						RESOURCE_MUSCLE,
						RESOURCE_FRAME,
						RESOURCE_SPIRIT,
						RESOURCE_LIQUID];
			case 4:
				return [RESOURCE_CIRCUIT,
						RESOURCE_ORGANOID,
						RESOURCE_HYDRAULICS,
						RESOURCE_EMANATION];
			case 5:
				return [RESOURCE_DEVICE,
						RESOURCE_ORGANISM,
						RESOURCE_MACHINE,
						RESOURCE_ESSENCE];

		}
	},

	getBaseCommodityInChain: function(resourceType){
		switch (resourceType) {
			case RESOURCE_SILICON:
			case RESOURCE_WIRE:
			case RESOURCE_SWITCH:
			case RESOURCE_TRANSISTOR:
			case RESOURCE_MICROCHIP:
			case RESOURCE_CIRCUIT:
			case RESOURCE_DEVICE:
				return RESOURCE_WIRE
			case RESOURCE_BIOMASS:
			case RESOURCE_CELL:
			case RESOURCE_PHLEGM:
			case RESOURCE_TISSUE:
			case RESOURCE_MUSCLE:
			case RESOURCE_ORGANOID:
			case RESOURCE_ORGANISM:
				return RESOURCE_CELL
			case RESOURCE_METAL:
			case RESOURCE_ALLOY:
			case RESOURCE_TUBE:
			case RESOURCE_FIXTURES:
			case RESOURCE_FRAME:
			case RESOURCE_HYDRAULICS:
			case RESOURCE_MACHINE:
				return RESOURCE_ALLOY
			case RESOURCE_MIST:
			case RESOURCE_CONDENSATE:
			case RESOURCE_CONCENTRATE:
			case RESOURCE_EXTRACT:
			case RESOURCE_SPIRIT:
			case RESOURCE_EMANATION:
			case RESOURCE_ESSENCE:
				return RESOURCE_CONDENSATE
		}
	},

	getCommoditiesForChain: function(resourceType) {
		switch (resourceType) {
			case RESOURCE_WIRE:
			case RESOURCE_SWITCH:
			case RESOURCE_TRANSISTOR:
			case RESOURCE_MICROCHIP:
			case RESOURCE_CIRCUIT:
			case RESOURCE_DEVICE:
				return [RESOURCE_WIRE,
						RESOURCE_SWITCH,
						RESOURCE_TRANSISTOR,
						RESOURCE_MICROCHIP,
						RESOURCE_CIRCUIT,
						RESOURCE_DEVICE]
			case RESOURCE_CELL:
			case RESOURCE_PHLEGM:
			case RESOURCE_TISSUE:
			case RESOURCE_MUSCLE:
			case RESOURCE_ORGANOID:
			case RESOURCE_ORGANISM:
				return [RESOURCE_CELL,
						RESOURCE_PHLEGM,
						RESOURCE_TISSUE,
						RESOURCE_MUSCLE,
						RESOURCE_ORGANOID,
						RESOURCE_ORGANISM]
			case RESOURCE_ALLOY:
			case RESOURCE_TUBE:
			case RESOURCE_FIXTURES:
			case RESOURCE_FRAME:
			case RESOURCE_HYDRAULICS:
			case RESOURCE_MACHINE:
				return [RESOURCE_ALLOY,
						RESOURCE_TUBE,
						RESOURCE_FIXTURES,
						RESOURCE_FRAME,
						RESOURCE_HYDRAULICS,
						RESOURCE_MACHINE]
			case RESOURCE_CONDENSATE:
			case RESOURCE_CONCENTRATE:
			case RESOURCE_EXTRACT:
			case RESOURCE_SPIRIT:
			case RESOURCE_EMANATION:
			case RESOURCE_ESSENCE:
				return [RESOURCE_CONDENSATE,
						RESOURCE_CONCENTRATE,
						RESOURCE_EXTRACT,
						RESOURCE_SPIRIT,
						RESOURCE_EMANATION,
						RESOURCE_ESSENCE]
		}
	},

	getBar: function(resourceType) {
		switch (resourceType) {
			case RESOURCE_UTRIUM:
				return RESOURCE_UTRIUM_BAR;
			case RESOURCE_LEMERGIUM:
				return RESOURCE_LEMERGIUM_BAR;
			case RESOURCE_ZYNTHIUM:
				return RESOURCE_ZYNTHIUM_BAR;
			case RESOURCE_KEANIUM:
				return RESOURCE_KEANIUM_BAR;
			case RESOURCE_GHODIUM:
				return RESOURCE_GHODIUM_MELT;
			case RESOURCE_OXYGEN:
				return RESOURCE_OXIDANT;
			case RESOURCE_HYDROGEN:
				return RESOURCE_REDUCTANT;
			case RESOURCE_CATALYST:
				return RESOURCE_PURIFIER;
		}
	},
	getDeBar: function(resourceType) {
		switch (resourceType) {
			case RESOURCE_UTRIUM_BAR:
				return RESOURCE_UTRIUM;
			case RESOURCE_LEMERGIUM_BAR:
				return RESOURCE_LEMERGIUM;
			case RESOURCE_ZYNTHIUM_BAR:
				return RESOURCE_ZYNTHIUM;
			case RESOURCE_KEANIUM_BAR:
				return RESOURCE_KEANIUM;
			case RESOURCE_GHODIUM_MELT:
				return RESOURCE_GHODIUM;
			case RESOURCE_OXIDANT:
				return RESOURCE_OXYGEN;
			case RESOURCE_REDUCTANT:
				return RESOURCE_HYDROGEN;
			case RESOURCE_PURIFIER:
				return RESOURCE_CATALYST;
		}
	},

	// Magic from https://stackoverflow.com/questions/52898456/simplest-way-of-finding-mode-in-javascript
	calcMode: function(array) {
		return Object.values(
			array.reduce((count, e) => {
				if (!(e in count)) {
					count[e] = [0, e];
				}
			  
				count[e][0]++;
				return count;
			}, {})).reduce((array, v) => v[0] < array[0] ? array : v, [0, null])[1];
	},


	getPowerRequiredToReachLevel(level) {
		let currentLevel = Game.gpl.level;
		let currentPowerAtLevel = Game.gpl.progress

		let totalRequired = POWER_LEVEL_MULTIPLY * Math.pow(level, POWER_LEVEL_POW)
		let currentlyHave = POWER_LEVEL_MULTIPLY * Math.pow(currentLevel, POWER_LEVEL_POW) + currentPowerAtLevel

		return totalRequired - currentlyHave

	},


	getSeasonOrderedSymbols() {
		if (!global.inTickObject.seasonOrderedSymbols) {
			function sortFunc (symbol) {
				let amount = 0

				if (Memory.myDecoders.includes(symbol)) {
					amount += Memory.stats.globalResources[symbol]
				}
				else if (Memory.allyDecoders.includes(symbol)) {
					amount += Memory.stats.globalResources[symbol] + 100000
				}
				else if (Memory.currentMBSymbols.includes(symbol)) {
					amount += Memory.stats.globalResources[symbol] + (Memory.modifiedOutgoingTradeLedger["Montblanc"][symbol] || 0)
				}

				amount *= 243;

				amount *= Memory.TARGET_SCORE_RATIO / (1 + Memory.TARGET_SCORE_RATIO)

				amount += Game.symbols[symbol]

				return -amount
			}

			global.inTickObject.seasonOrderedSymbols = _.sortBy(Object.keys(Game.symbols), sortFunc)

		}

		return global.inTickObject.seasonOrderedSymbols
	},

	getSeasonProjectedScore() {
		let seasonOrderedSymbols = this.getSeasonOrderedSymbols();

		function scoreForSymbol(symbol, idx) {
			let amount = 0

			if (Memory.myDecoders.includes(symbol)) {
				amount += Memory.stats.globalResources[symbol]
			}
			else if (Memory.allyDecoders.includes(symbol)) {
				amount += Memory.stats.globalResources[symbol] + 100000
			}
			else if (Memory.currentMBSymbols.includes(symbol)) {
				amount += Memory.stats.globalResources[symbol] + (Memory.modifiedOutgoingTradeLedger["Montblanc"][symbol] || 0)
			}

			amount *= 243;

			amount *= Memory.TARGET_SCORE_RATIO / (1 + Memory.TARGET_SCORE_RATIO)

			amount += Game.symbols[symbol]

			return amount * (idx + 1)
		}

		let score = 0

		for (let i = 0; i < seasonOrderedSymbols.length; i++) {
			score += scoreForSymbol(seasonOrderedSymbols[i], i)
		}

		return score
		
	}

};

module.exports = util;
