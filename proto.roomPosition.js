"use strict";
var util = require('util');

const pathCache = require("pathCache")


module.exports = function() {
	let findInRange = RoomPosition.prototype.findInRange;
	RoomPosition.prototype.findInRange = function(type, range, opts) {
		if (((range <= 3 && type == FIND_STRUCTURES) || (range <= 2 && type == FIND_MY_STRUCTURES)) && Game.rooms[this.roomName]) {
			var retArray = []
			var structures = Game.rooms[this.roomName].lookForAtArea(LOOK_STRUCTURES, Math.max(1, this.y-range),Math.max(1, this.x-range),Math.min(48, this.y+range),Math.min(48, this.x+range), true);

			for (var structure of structures) {
				if (type == FIND_STRUCTURES || (type == FIND_MY_STRUCTURES && structure.structure.my)) {
					retArray.push(structure.structure)
				}
			}

			if (opts && opts.filter) {
				retArray = _.filter(retArray, opts.filter)
			}
			return retArray
		}
		else if (range <= 1 && type == FIND_MY_CREEPS && Game.rooms[this.roomName]) {
			var retArray = []
			var creeps = Game.rooms[this.roomName].lookForAtArea(LOOK_CREEPS, Math.max(1, this.y-range),Math.max(1, this.x-range),Math.min(48, this.y+range),Math.min(48, this.x+range), true);

			for (var creep of creeps) {
				if (type == FIND_MY_CREEPS && creep.creep.my) {
					retArray.push(creep.creep)
				}
			}

			if (opts && opts.filter) {
				retArray = _.filter(retArray, opts.filter)
			}
			return retArray
		}
		else {
			return findInRange.call(this, type, range, opts)
		}
	}
	RoomPosition.prototype.nativeFindInRange = function(type, range, opts) {
		return findInRange.call(this, type, range, opts)
	}

	RoomPosition.prototype.isEqualToXY = function(x, y){
		return x === this.x && y === this.y;
	}
	RoomPosition.prototype.isEqualToPos = function(obj){
		return obj.x === this.x && obj.y === this.y && obj.roomName === this.roomName;
	}
	RoomPosition.prototype.isEqualToRoomObject = function(obj){
		return obj.pos.x == this.x && obj.pos.y == this.y && obj.pos.roomName == this.roomName;
	}

	RoomPosition.prototype.inRangeToXY = function(x, y, range){
		return (((x-this.x)<0?(this.x-x):(x-this.x)) <= range && ((y-this.y)<0?(this.y-y):(y-this.y)) <= range);
	}
	RoomPosition.prototype.inRangeToPos = function(obj, range){
		return (((obj.x-this.x)<0?(this.x-obj.x):(obj.x-this.x)) <= range && ((obj.y-this.y)<0?(this.y-obj.y):(obj.y-this.y)) <= range) && obj.roomName == this.roomName;
	}
	RoomPosition.prototype.inRangeToRoomObject = function(obj, range){
		return (((obj.pos.x-this.x)<0?(this.x-obj.pos.x):(obj.pos.x-this.x)) <= range && ((obj.pos.y-this.y)<0?(this.y-obj.pos.y):(obj.pos.y-this.y)) <= range) && obj.pos.roomName == this.roomName;
	}

	RoomPosition.prototype.getRangeToPos = function(obj){
		if (obj.roomName != this.roomName) return Infinity
		let dx = (obj.x-this.x)<0?(this.x-obj.x):(obj.x-this.x)
		let dy = (obj.y-this.y)<0?(this.y-obj.y):(obj.y-this.y)

		return dx > dy ? dx : dy
	}
	RoomPosition.prototype.getRangeToXY = function(x, y){
		let dx = (x-this.x)<0?(this.x-x):(x-this.x)
		let dy = (y-this.y)<0?(this.y-y):(y-this.y)

		return dx > dy ? dx : dy
	}
	RoomPosition.prototype.getRangeToRoomObject = function(obj){
		if (obj.pos.roomName != this.roomName) return Infinity
		let dx = (obj.pos.x-this.x)<0?(this.x-obj.pos.x):(obj.pos.x-this.x)
		let dy = (obj.pos.y-this.y)<0?(this.y-obj.pos.y):(obj.pos.y-this.y)
		
		return dx > dy ? dx : dy
	}

	RoomPosition.prototype.isNearToXY = function(x, y){
		return ((x-this.x)<0?(this.x-x):(x-this.x)) <= 1 && ((y-this.y)<0?(this.y-y):(y-this.y)) <= 1;
	}
	RoomPosition.prototype.isNearToPos = function(obj){
		return ((obj.x-this.x)<0?(this.x-obj.x):(obj.x-this.x)) <= 1 && ((obj.y-this.y)<0?(this.y-obj.y):(obj.y-this.y)) <= 1 && obj.roomName === this.roomName;
	}
	RoomPosition.prototype.isNearToRoomObject = function(obj){
		return ((obj.pos.x-this.x)<0?(this.x-obj.pos.x):(obj.pos.x-this.x)) <= 1 && ((obj.pos.y-this.y)<0?(this.y-obj.pos.y):(obj.pos.y-this.y)) <= 1 && obj.room.name === this.roomName;
	}

	// Up, these twho functions do the same thing
	RoomPosition.prototype.getPosInDirection = function(dir){
		let newPos = new RoomPosition(this.x, this.y, this.roomName);

		if (dir >= 2 && dir <= 4 && newPos.x < 49) {
			newPos.x += 1;
		}
		else if (dir >= 6 && newPos.x > 0) {
			newPos.x -= 1;
		}
		if (dir >= 4 && dir <= 6 && newPos.y < 49) {
			newPos.y += 1;
		}
		else if ((dir <= 2 || dir == 8) && newPos.y > 0) {
			newPos.y -= 1;
		}

		// console.log("New pos in direction OOB")

		return newPos;
	}

	RoomPosition.prototype.findPosInDirection = function(dir) {
		let x = this.x;
		let y = this.y;

		dir = +dir;

		switch (dir) {
			case 2:
			case 3:
			case 4:
				x += 1;
				break;
			case 6:
			case 7:
			case 8:
				x -= 1;
				break;
		}
		switch (dir) {
			case 1:
			case 2:
			case 8:
				y -= 1;
				break;
			case 4:
			case 5:
			case 6:
				y += 1;
				break;
		}

		if (x < 0 || x > 49 || y < 0 || y > 49) {
			return
		}

		return new RoomPosition(x, y, this.roomName)

	}




	RoomPosition.prototype.isAccessible = function() {
		let roomTerrain = Game.map.getRoomTerrain(this.roomName)
		for (let i = this.x - 1; i <= this.x + 1; i++) {
			for (let j = this.y - 1; j <= this.y + 1; j++) {
				if (i == this.x && j == this.y) continue;
				if (roomTerrain.get(i, j) & TERRAIN_MASK_WALL) continue;

				let open = true;
				let structs = Game.rooms[this.roomName].lookForAt(LOOK_STRUCTURES, i, j);
				for (let struct of structs) {
					if (struct.structureType != STRUCTURE_ROAD && struct.structureType != STRUCTURE_CONTAINER) {
						open = false;
						break;
					}
				}
				if (open) {
					return true;
				}
			}
		}
		return false;
	}

	RoomPosition.prototype.countAccessibleTiles = function() {
		let cnt = 0;
		let roomTerrain = Game.map.getRoomTerrain(this.roomName)
		for (let i = this.x - 1; i <= this.x + 1; i++) {
			for (let j = this.y - 1; j <= this.y + 1; j++) {
				if (i == this.x && j == this.y) continue;
				if (roomTerrain.get(i, j) & TERRAIN_MASK_WALL) continue;

				let open = true;
				let structs = Game.rooms[this.roomName].lookForAt(LOOK_STRUCTURES, i, j);
				for (let struct of structs) {
					if (struct.structureType != STRUCTURE_ROAD && 
						struct.structureType != STRUCTURE_CONTAINER &&
						(struct.structureType != STRUCTURE_RAMPART || !struct.my)) {
						open = false;
						break;
					}
				}

				if (open) {
					if (!Memory.season1 || !Game.rooms[this.roomName].lookForAt(LOOK_SCORE_COLLECTORS, i, j).length) {
						cnt++;
					}
				}
			}
		}
		return cnt;
	}

	RoomPosition.prototype.getWorldRangeToPos = function(target) {
		if (target.roomName == this.roomName) {
			return this.getRangeToPos(target)
		}

		let coords = util.getRoomCoords(this.roomName);
		let targetCoords = util.getRoomCoords(target.roomName);

		let xRange;
		let yRange;
		let worldX = coords.x * 50 - targetCoords.x * 50;
		let worldY = coords.y * 50 - targetCoords.y * 50;

		if (worldX < 0) {
			xRange = Math.abs(worldX) + this.x - target.x;
		}
		else {
			xRange = worldX + target.x - this.x;
		}
		if (worldY < 0) {
			yRange = Math.abs(worldY) + this.y - target.y;
		}
		else {
			yRange = worldY + target.y - this.y;
		}

		let range = Math.max(Math.abs(xRange), Math.abs(yRange));

		return range;
	}

	RoomPosition.prototype.getHeuristicWorldRangeToPos = function(target) {
		if (target.roomName == this.roomName) {
			return this.getRangeToPos(target)
		}

		let coords = util.getRoomCoords(this.roomName);
		let targetCoords = util.getRoomCoords(target.roomName);

		let xRange;
		let yRange;
		let worldX = coords.x * 50 - targetCoords.x * 50;
		let worldY = coords.y * 50 - targetCoords.y * 50;

		if (worldX < 0) {
			xRange = Math.abs(worldX) + this.x - target.x;
		}
		else {
			xRange = worldX + target.x - this.x;
		}
		if (worldY < 0) {
			yRange = Math.abs(worldY) + this.y - target.y;
		}
		else {
			yRange = worldY + target.y - this.y;
		}

		let range = Math.max(Math.abs(xRange), Math.abs(yRange)) + Math.min(Math.abs(xRange), Math.abs(yRange)) * 0.2;

		return range;
	}

	RoomPosition.prototype.findClosestPosByWorldRange = function(targets, opts) {

		let minRange = Infinity;
		let bestTarget = undefined;

		if(_.isNumber(targets)) {
			targets = Game.rooms[this.roomName].find(targets)
		}
		
		if (opts && opts.filter) {
			console.log("findClosestPosByWorldRange can't have filter")
			// targets = _.filter(targets, opts.filter)
		}

		for (let target of targets) {
			let worldRange = this.getWorldRangeToPos(target);
			if (worldRange < minRange) {
				minRange = worldRange;
				bestTarget = target;
			}
		}
		return bestTarget;
	}

	RoomPosition.prototype.findClosestByWorldRange = function(targets, opts) {
		if (opts && opts.filter) {
			targets = _.filter(targets, opts.filter)
		}

		let minRange = Infinity;
		let bestTarget = undefined;

		for (let target of targets) {
			if (!target) continue
			let worldRange = this.getWorldRangeToPos(target.pos || target);
			if (worldRange < minRange) {
				minRange = worldRange;
				bestTarget = target;
			}
		}
		return bestTarget;
	}

	RoomPosition.prototype.findClosestObjectByWorldRange = function(targets, opts) {
		if (opts && opts.filter) {
			targets = _.filter(targets, opts.filter)
		}

		let minRange = Infinity;
		let bestTarget = undefined;

		for (let target of targets) {
			let worldRange = this.getWorldRangeToPos(target.pos ? target.pos : target);
			if (worldRange < minRange) {
				minRange = worldRange;
				bestTarget = target;
			}
		}
		return bestTarget;
	}

	RoomPosition.prototype.findClosestByWorldPath = function(objects, opts) {
		opts = opts || {};

		if(_.isNumber(objects)) {
			throw new Error("findClosestByWorldPath passed a number " + objects)
		}

		let pathfinderGoals = []

		for (let object of objects) {
			pathfinderGoals.push({pos: object.pos || object, range: opts.range || 1})
		}

		let ret
		try {
			opts.maxRooms = 64
			ret = pathCache.runPathFinder(this, pathfinderGoals, opts.range, opts.swampCost < 5 ? 3 : 1, opts, undefined)
		}
		catch(e) {
			console.log(e)
			console.log("New multigoal pathfinding not working")
			ret = PathFinder.search(this, pathfinderGoals, opts);
		}
		

		var result = null;
		var lastPos;

   		if (ret.path.length) {
			lastPos = ret.path[ret.path.length-1];
		}
		else {
			lastPos = this
		}

		objects.forEach(obj => {
			if (lastPos.isNearTo(obj)) {
				result = obj;
			}
		});

		// if (result) console.log(this, JSON.stringify(pathfinderGoals), result.pos)
		
		return result;
	}

	RoomPosition.prototype.findClosestByRange = function(type, opts) {
		var room = Game.rooms[this.roomName];

		opts = opts || {};

		var objects = [],
		result = [];

		if(_.isNumber(type)) {
			objects = room.find(type, opts);
		}
		if(_.isArray(type)) {
			objects = opts.filter ? _.filter(type, opts.filter) : type;
		}

		var closest = null, minRange = Infinity;

		let numObjects = objects.length;
		for (let i = 0; i < numObjects; i++) {
			var range = this.getRangeTo(objects[i]);
			if(range < minRange) {
				minRange = range;
				closest = objects[i];
			}
			if (range == 0) {
				break;
			}
		}

		return closest;
	}

	// TODO: Perhaps should check opts && opts.filter in a wider branch then can early exit in the loop
	RoomPosition.prototype.findFirstInRange = function(type, range, opts) {
		if (((range <= 3 && type == FIND_STRUCTURES) || (range <= 2 && type == FIND_MY_STRUCTURES)) && Game.rooms[this.roomName]) {
			var retArray = []
			var structures = Game.rooms[this.roomName].lookForAtArea(LOOK_STRUCTURES, Math.max(1, this.y-range),Math.max(1, this.x-range),Math.min(48, this.y+range),Math.min(48, this.x+range), true);

			for (var structure of structures) {
				if (type == FIND_STRUCTURES || (type == FIND_MY_STRUCTURES && structure.structure.my)) {
					retArray.push(structure.structure)
				}
			}

			if (opts && opts.filter) {
				return _.find(retArray, opts.filter)
			}
			return retArray[0];
		}
		else if (range <= 1 && type == FIND_MY_CREEPS && Game.rooms[this.roomName]) {
			var retArray = []
			var creeps = Game.rooms[this.roomName].lookForAtArea(LOOK_CREEPS, Math.max(1, this.y-range),Math.max(1, this.x-range),Math.min(48, this.y+range),Math.min(48, this.x+range), true);

			for (var creep of creeps) {
				if (type == FIND_MY_CREEPS && creep.creep.my) {
					retArray.push(creep.creep)
				}
			}

			if (opts && opts.filter) {
				return _.find(retArray, opts.filter)
			}
			return retArray[0];
		}
		else {
			var room = Game.rooms[this.roomName];

			opts = opts || {};

			let objects = [];
			let result = undefined;

			if(_.isNumber(type)) {
				objects = room.find(type, opts);
			}
			if(_.isArray(type)) {
				objects = opts.filter ? _.filter(type, opts.filter) : type;
			}

			let numObjects = objects.length;
			for (let i = 0; i < numObjects; i++) {
				if (this.inRangeTo(objects[i], range)) {
					return objects[i];
				}
			}

			return result;
		}
	}
}