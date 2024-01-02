/*function wrappedCall(name, originalFunction, that, args) {
	let result;
	let heapStart = 0;
	global.Tracing.traceCall(name, () => {
		heapStart = Game.cpu.getHeapStatistics().used_heap_size;
		result = originalFunction.apply(that, args);
		// wrap iterators
		if (!!result && typeof (result.next) === 'function' &&
			result.__wrapped === undefined) {
			result.__wrapped = true;
			const orgNext = result.next;
			Reflect.set(result, 'next', function (...args) {
				return wrappedCall(name, orgNext, this, args);
			});
		}
	}, () => {
		return {
			'heap': Game.cpu.getHeapStatistics().used_heap_size - heapStart,
		};
		//   const r: {[k:string]:string} = {};
		//   for(let i = 0;i<args.length;i++) {
		//	 r[`arg${i}`] = String(args[i]);
		//   }
		//   r[`ret`] = String(result);
		//   return r;
	});
	return result;
}*/
function wrappedCall(name, originalFunction, that, args) {
	let result;
	global.Tracing.traceCall(name, () => {
		result = originalFunction.apply(that, args);
		// wrap iterators
		if (!!result && typeof (result.next) === 'function' &&
			result.__wrapped === undefined) {
			result.__wrapped = true;
			const orgNext = result.next;
			Reflect.set(result, 'next', function (...args) {
				return wrappedCall(name, orgNext, this, args);
			});
		}
	}, () => {
		// Uncomment this to trace arguments and return values
		// const r: {[k:string]:string} = {};
		// for(let i = 0;i<args.length;i++) {
		//   r[`arg${i}`] = String(args[i]);
		// }
		// r[`ret`] = String(result);
		// return r;
		return {};
	});
	return result;
}


function wrapFunction(obj, _key, className) {
	const descriptor = Reflect.getOwnPropertyDescriptor(obj, _key);
	const key = String(_key);
	if (!descriptor || descriptor.get || descriptor.set) {
		return;
	}
	if (key === 'constructor') {
		return;
	}
	const originalFunction = descriptor.value;
	if (!originalFunction || typeof originalFunction !== 'function') {
		return;
	}
	// set a key for the object in memory
	if (!className) {
		className = obj.constructor ? `${obj.constructor.name}` : '';
	}
	const memKey = className + `:${key}`;
	// set a tag so we don't wrap a function twice
	const savedName = `__${key}__`;
	if (Reflect.has(obj, savedName)) {
		return;
	}
	Reflect.set(obj, savedName, originalFunction);
	Reflect.set(obj, _key, function (...args) {
		return wrappedCall(memKey, originalFunction, this, args);
	});
}
function wrapEngine() {
	for (const m in Creep.prototype) {
		wrapFunction(Creep.prototype, m, 'Creep');
	}
	for (const m in Room.prototype) {
		wrapFunction(Room.prototype, m, 'Room');
	}
	for (const m in Spawn.prototype) {
		wrapFunction(Spawn.prototype, m, 'Spawn');
	}
	for (const m in StructureLink.prototype) {
		wrapFunction(StructureLink.prototype, m, 'Link');
	}
	for (const m in StructureObserver.prototype) {
		wrapFunction(StructureObserver.prototype, m, 'Observer');
	}
	for (const m in StructureLab.prototype) {
		wrapFunction(StructureLab.prototype, m, 'Lab');
	}
	for (const m in require("roomAI")) {
		wrapFunction(require("roomAI"), m, 'roomAI');
	}
	for (const m in require("combatManager")) {
		wrapFunction(require("combatManager"), m, 'combatManager');
	}
	for (const m in require("creepAI")) {
		wrapFunction(require("creepAI"), m, 'creepAI');
	}
	for (const m in require("safeRoute")) {
		wrapFunction(require("safeRoute"), m, 'safeRoute');
	}
	for (const m in require("roomIntel")) {
		wrapFunction(require("roomIntel"), m, 'roomIntel');
	}
	for (const m in require("snakeAI")) {
		wrapFunction(require("snakeAI"), m, 'snakeAI');
	}
	for (const m in require("segments")) {
		wrapFunction(require("segments"), m, 'segments');
	}
	for (const m in require("util")) {
		wrapFunction(require("util"), m, 'util');
	}
	for (const m in require("overseerAI")) {
		wrapFunction(require("overseerAI"), m, 'overseerAI');
	}
}
function trace(target, key, _descriptor) {
	if (key) {
		// case of method decorator
		wrapFunction(target, key);
		return;
	}
	// case of class decorator
	const ctor = target;
	if (!ctor.prototype) {
		return;
	}
	const className = ctor.name;
	Reflect.ownKeys(ctor.prototype).forEach((k) => {
		wrapFunction(ctor.prototype, k, className);
	});
}



module.exports = {wrapFunction: wrapFunction, wrapEngine: wrapEngine, trace: trace}
