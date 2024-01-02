"use strict";

var util = require('util');

var state

var moveResolver = {
	

	init() {
		state = {};
		// global.inTickObject.moveResolver = global.inTickObject.moveResolver || {}
	},

	getState(roomName) {
		return state[roomName]
	},

	vis(roomName) {
		let vis = new RoomVisual(roomName)
		for (let x = 0; x < 50; x++) {
			for (let y = 0; y < 50; y++) {
				if (state[roomName][x * 100 + y + 25]) {
					// vis.circle(x, y)
					vis.text(state[roomName][x * 100 + y + 25], x, y, {font: 0.3})
				}
			}
		}
	},

	static(creep) {
		state[creep.room.name] = state[creep.room.name] || {}

		state[creep.room.name][creep.pos.x * 100 + creep.pos.y + 25] = creep.name;
	},

	set(creep, newPos) {
		state[creep.room.name] = state[creep.room.name] || {}

		state[creep.room.name][newPos.x * 100 + newPos.y + 25] = creep.name;
	},

	move(creep, target) {
		// if (creep.fatigue) return ERR_TIRED

		state[creep.room.name] = state[creep.room.name] || {}

		let roomState = state[creep.room.name]

		// Pull
		if (target && (target instanceof Creep)) {
			if (roomState[target.pos.x * 100 + target.pos.y + 25]) {
				// creep.mem.mS = (creep.mem.mS || 0) + 1
				// Formations have priotiy. If they say they're going there don't try to go there too
				if (Memory.creeps[roomState[target.pos.x * 100 + target.pos.y + 25]].pairIdx !== undefined || Memory.creeps[roomState[target.pos.x * 100 + target.pos.y + 25]].formationCreeps !== undefined) {
					return -999
				}

				if (creep.mem.mS < 2 && (creep.room.dangerous || !global.creepReplayPhase || !global.inTickObject.replayCreep.includes(roomState[target.pos.x * 100 + target.pos.y + 25]))) {
					return -999
				}
			}
			let ret = creep.resolvedMove(target)
			if (ret == OK) {
				roomState[target.pos.x * 100 + target.pos.y + 25] = creep.name;
			}
			return ret
		}

		let x = creep.pos.x
		let y = creep.pos.y

		let direction = +target

		switch (direction) {
			case TOP:
			case TOP_RIGHT:
			case TOP_LEFT:
				y--;
				break
			case BOTTOM:
			case BOTTOM_RIGHT:
			case BOTTOM_LEFT:
				y++
				break
		}

		switch (direction) {
			case TOP_LEFT:
			case LEFT:
			case BOTTOM_LEFT:
				x--;
				break
			case TOP_RIGHT:
			case RIGHT:
			case BOTTOM_RIGHT:
				x++
				break
		}

		// Someone is there
		if (roomState[x * 100 + y + 25]) {
			// creep.mem.mS = (creep.mem.mS || 0) + 1
			// Formations have priority. If they say they're going there don't try to go there too
			if (Memory.creeps[roomState[x * 100 + y + 25]].pairIdx !== undefined || Memory.creeps[roomState[x * 100 + y + 25]].formationCreeps !== undefined) {
				return -999
			}
			
			// If this condition is true we don't move.
			// So don't move if there's danger or we're not yet replaying, and we're not stuck
			// The issue this tries to avoid is pileups when neither side can move. In dangerous rooms
			// We kinda don't want to be forcing swaps (do we? doesn't the above catch where this goes wrong)
			if (creep.mem.mS < 2 && (creep.room.dangerous || !global.creepReplayPhase)) {
			// The creep we're moving to is also stuck. Why not just swap?
			// if (creep.room.dangerous || !global.creepReplayPhase || !global.inTickObject.replayCreep.includes(roomState[x * 100 + y + 25])) {
				return -999
			}
			
		}
		let ret = creep.resolvedMove(direction)
		if (ret == OK) {
			roomState[x * 100 + y + 25] = creep.name;
		}
		return ret
	},
}



module.exports = moveResolver;