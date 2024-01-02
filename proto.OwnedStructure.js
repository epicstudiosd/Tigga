"use strict";

module.exports = function() {
	let isActive = OwnedStructure.prototype.isActive;
	OwnedStructure.prototype.isActive = function() {
		// Be careful about strongholds and ownership.
		if (this.room.controller && (this.room.controller.level || 0) == 8 && this.room.controller.owner.username == this.owner.username) {
			return true;
		}

		if (this.room.mem && this.room.mem.maxRCL && this.room.mem.maxRCL == (this.room.controller.level || 0)) {
			return true;
		}

		if (this._isActive !== undefined) {
			return this._isActive
		}

		if (this.owner && this.room.mem.invCL && this.owner.username == "Invader") {
			return true;
		}

		// It has most of the other cheap stuff in it.
		this._isActive = isActive.call(this)

		return this._isActive;
	}
}