"use strict";

class customCostMatrix {
	constructor(_bits) {
		this._bits = _bits || (new Uint8Array(2500));
	}

	clone() {
		let newBits = new Uint8Array(2500);
		newBits.set(this._bits, 0);
		return new customCostMatrix(newBits)
	}

	copyFrom(otherCostMatrix) {
		this._bits.set(otherCostMatrix._bits, 0);
	}

	set(xx, yy, val) {
		xx = xx|0;
		yy = yy|0;
		this._bits[xx * 50 + yy] = Math.min(Math.max(0, val), 255);
	}

	set2(xx, yy, val) {
		xx = xx|0;
		yy = yy|0;
		this._bits[xx * 50 + yy] = val;
	}

	fillColumn(xx, yStart, yEnd, val) {
		xx = xx|0;
		yStart = yStart|0;
		yEnd = yEnd|0;

		// for (let i = yStart; i <= yEnd; i++) {
		//	 this.set2(xx, i, val)
		// }

		this._bits.fill(val, xx * 50 + yStart, xx * 50 + yEnd + 1);
	}

	get(xx, yy) {
		xx = xx|0;
		yy = yy|0;
		return this._bits[xx * 50 + yy];
	}

	get2(xx, yy) {
		return this._bits[xx * 50 + yy];
	}
}

module.exports = customCostMatrix