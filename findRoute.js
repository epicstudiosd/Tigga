"use strict";

//
// Simple open-closed list
class OpenClosed {
	constructor(size) {
		this.list = new Uint8Array(size);
		this.marker = 1;
	}

	clear() {
		if (this.marker >= 253) {
			this.list = new Uint8Array(this.list.length);
			this.marker = 1;
		} else {
			this.marker += 2;
		}
	}

	isOpen(index) {
		return this.list[index] === this.marker;
	}

	isClosed(index) {
		return this.list[index] === this.marker + 1;
	}

	open(index) {
		this.list[index] = this.marker;
	}

	close(index) {
		this.list[index] = this.marker + 1;
	}
}

//
// Priority queue implementation w/ support for updating priorities
class Heap {
	constructor(size, ctor) {
		this.priorities = new (ctor || Uint16Array)(size + 1);
		this.heap = new Uint16Array(size + 1);
		this.size_ = 0;
	}

	minPriority() {
		return this.priorities[this.heap[1]];
	}

	min() {
		return this.heap[1];
	}

	size() {
		return this.size_;
	}

	priority(index) {
		return this.priorities[index];
	}

	pop() {
		this.heap[1] = this.heap[this.size_];
		--this.size_;
		let vv = 1;
		do {
			let uu = vv;
			if ((uu << 1) + 1 <= this.size_) {
				if (this.priorities[this.heap[uu]] >= this.priorities[this.heap[uu << 1]]) {
					vv = uu << 1;
				}
				if (this.priorities[this.heap[vv]] >= this.priorities[this.heap[(uu << 1) + 1]]) {
					vv = (uu << 1) + 1;
				}
			} else if (uu << 1 <= this.size_) {
				if (this.priorities[this.heap[uu]] >= this.priorities[this.heap[uu << 1]]) {
					vv = uu << 1;
				}
			}
			if (uu !== vv) {
				let tmp = this.heap[uu];
				this.heap[uu] = this.heap[vv];
				this.heap[vv] = tmp;
			} else {
				return;
			}
		} while (true);
	}

	push(index, priority) {
		this.priorities[index] = priority;
		let ii = ++this.size_;
		this.heap[ii] = index;
		this.bubbleUp(ii);
	}

	update(index, priority) {
		for (let ii = this.size_; ii > 0; --ii) {
			if (this.heap[ii] === index) {
				this.priorities[index] = priority;
				this.bubbleUp(ii);
				return;
			}
		}
	}

	bubbleUp(ii) {
		while (ii !== 1) {
			if (this.priorities[this.heap[ii]] <= this.priorities[this.heap[ii >>> 1]]) {
				let tmp = this.heap[ii];
				this.heap[ii] = this.heap[ii >>> 1];
				this.heap[ii = ii >>> 1] = tmp;
			} else {
				return;
			}
		}
	}

	clear() {
		this.size_ = 0;
	}
}


 function getRoomNameFromXY(x,y) {
	if(x < 0) {
		x = 'W'+(-x-1);
	}
	else {
		x = 'E'+(x);
	}
	if(y < 0) {
		y = 'N'+(-y-1);
	}
	else {
		y = 'S'+(y);
	}
	return ""+x+y;
};

function roomNameToXY(name) {
	name = name.toUpperCase();

	var match = name.match(/^(\w)(\d+)(\w)(\d+)$/);
	if(!match) {
		return [undefined, undefined];
	}
	var [,hor,x,ver,y] = match;

	if(hor == 'W') {
		x = -x-1;
	}
	else {
		x = +x;
	}
	if(ver == 'N') {
		y = -y-1;
	}
	else {
		y = +y;
	}
	return [x,y];
};

const kRouteGrid = 30;
var heap, openClosed, parents;
var originX, originY;
var toX, toY;

function xyToIndex(xx, yy) {
	let ox = originX - xx;
	let oy = originY - yy;
	if (ox < 0 || ox >= kRouteGrid * 2 || oy < 0 || oy >= kRouteGrid * 2) {
		return;
	}
	return ox * kRouteGrid * 2 + oy;
}

function indexToXY(index) {
	return [ originX - Math.floor(index / (kRouteGrid * 2)), originY - index % (kRouteGrid * 2) ];
}

function heuristic(xx, yy) {
	return Math.abs(xx - toX) + Math.abs(yy - toY);
}



module.exports = function(fromRoom, toRoom, opts) {
	if(_.isObject(fromRoom)) {
		fromRoom = fromRoom.name;
	}
	if(_.isObject(toRoom)) {
		toRoom = toRoom.name;
	}
	if(fromRoom == toRoom) {
		return [];
	}
	 
	if(!/(W|E)\d+(N|S)\d+$/.test(fromRoom) || !/(W|E)\d+(N|S)\d+$/.test(toRoom)) {
		return ERR_NO_PATH;
	}

	var [fromX, fromY] = roomNameToXY(fromRoom);
	[toX, toY] = roomNameToXY(toRoom);

	if (fromX == toX && fromY == toY) {
		return [];
	}

	originX = fromX + kRouteGrid;
	originY = fromY + kRouteGrid;

	// Init path finding structures
	if (heap) {
		heap.clear();
		openClosed.clear();
	} 
	else {
		heap = new Heap(Math.pow(kRouteGrid * 2, 2), Float32Array);
		openClosed = new OpenClosed(Math.pow(kRouteGrid * 2, 2));
	}
	if (!parents) {
		parents = new Uint16Array(Math.pow(kRouteGrid * 2, 2));
	}
	var fromIndex = xyToIndex(fromX, fromY);
	heap.push(fromIndex, heuristic(fromX, fromY));
	var routeCallback = (opts && opts.routeCallback) || function() { return 1; };

	// Astar
	while (heap.size()) {
		// Pull node off heap
		let index = heap.min();
		let fcost = heap.minPriority();

		// Close this node
		heap.pop();
		openClosed.close(index);

		// Calculate costs
		let [ xx, yy ] = indexToXY(index);
		let hcost = heuristic(xx, yy);
		let gcost = fcost - hcost;

		// Reached destination?
		if (hcost === 0) {
			let route = [];
			while (index !== fromIndex) {
				let [ xx, yy ] = indexToXY(index);
				index = parents[index];
				let [ nx, ny ] = indexToXY(index);
				let dir;
				if (nx < xx) {
					dir = FIND_EXIT_RIGHT;
				} else if (nx > xx) {
					dir = FIND_EXIT_LEFT;
				} else if (ny < yy) {
					dir = FIND_EXIT_BOTTOM;
				} else {
					dir = FIND_EXIT_TOP;
				}
				route.push({
					exit: dir,
					room: getRoomNameFromXY(xx, yy),
				});
			}
			route.reverse();
			return route;
		}

		// Add neighbors
		let fromRoomName = getRoomNameFromXY(xx, yy);
		let exits = Game.map.describeExits(fromRoomName);
		for (let dir in exits) {

			// Calculate costs and check if this node was already visited
			let roomName = exits[dir];
			// let graphKey = fromRoomName+ ':'+ roomName;
			let [ xx, yy ] = roomNameToXY(roomName);
			let neighborIndex = xyToIndex(xx, yy);
			if (neighborIndex === undefined || openClosed.isClosed(neighborIndex)) {
				continue;
			}
			let cost = Number(routeCallback(roomName, fromRoomName)) || 1;
			if (cost === Infinity) {
				continue;
			}
			
			let fcost = gcost + heuristic(xx, yy) + cost;
			
			// Add to or update heap
			if (openClosed.isOpen(neighborIndex)) {
				if (heap.priority(neighborIndex) > fcost) {
					heap.update(neighborIndex, fcost);
					parents[neighborIndex] = index;
				}
			} else {
				heap.push(neighborIndex, fcost);
				openClosed.open(neighborIndex);
				parents[neighborIndex] = index;
			}
		}
	}

	return ERR_NO_PATH;
}


