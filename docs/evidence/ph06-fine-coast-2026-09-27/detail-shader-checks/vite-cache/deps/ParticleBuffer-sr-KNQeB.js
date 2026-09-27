import { r as __toESM, t as __commonJSMin } from "./rolldown-runtime-DC62tzP2.js";
//#region node_modules/pixi.js/lib/extensions/Extensions.mjs
var ExtensionType = /* @__PURE__ */ ((ExtensionType2) => {
	ExtensionType2["Application"] = "application";
	ExtensionType2["WebGLPipes"] = "webgl-pipes";
	ExtensionType2["WebGLPipesAdaptor"] = "webgl-pipes-adaptor";
	ExtensionType2["WebGLSystem"] = "webgl-system";
	ExtensionType2["WebGLLoader"] = "webgl-loader";
	ExtensionType2["WebGPUPipes"] = "webgpu-pipes";
	ExtensionType2["WebGPUPipesAdaptor"] = "webgpu-pipes-adaptor";
	ExtensionType2["WebGPUSystem"] = "webgpu-system";
	ExtensionType2["WebGPULoader"] = "webgpu-loader";
	ExtensionType2["CanvasSystem"] = "canvas-system";
	ExtensionType2["CanvasPipesAdaptor"] = "canvas-pipes-adaptor";
	ExtensionType2["CanvasPipes"] = "canvas-pipes";
	ExtensionType2["CanvasLoader"] = "canvas-loader";
	ExtensionType2["Asset"] = "asset";
	ExtensionType2["LoadParser"] = "load-parser";
	ExtensionType2["ResolveParser"] = "resolve-parser";
	ExtensionType2["CacheParser"] = "cache-parser";
	ExtensionType2["DetectionParser"] = "detection-parser";
	ExtensionType2["MaskEffect"] = "mask-effect";
	ExtensionType2["BlendMode"] = "blend-mode";
	ExtensionType2["TextureSource"] = "texture-source";
	ExtensionType2["TextureUploaderWebGL"] = "texture-uploader-webgl";
	ExtensionType2["TextureUploaderWebGPU"] = "texture-uploader-webgpu";
	ExtensionType2["Environment"] = "environment";
	ExtensionType2["ShapeBuilder"] = "shape-builder";
	ExtensionType2["Batcher"] = "batcher";
	return ExtensionType2;
})(ExtensionType || {});
var normalizeExtension = (ext) => {
	if (typeof ext === "function" || typeof ext === "object" && ext.extension) {
		if (!ext.extension) throw new Error("Extension class must have an extension object");
		ext = {
			...typeof ext.extension !== "object" ? { type: ext.extension } : ext.extension,
			ref: ext
		};
	}
	if (typeof ext === "object") ext = { ...ext };
	else throw new Error("Invalid extension type");
	if (typeof ext.type === "string") ext.type = [ext.type];
	return ext;
};
var normalizeExtensionPriority = (ext, defaultPriority) => normalizeExtension(ext).priority ?? defaultPriority;
var extensions = {
	/** @ignore */
	_addHandlers: {},
	/** @ignore */
	_removeHandlers: {},
	/** @ignore */
	_queue: {},
	/**
	* Remove extensions from PixiJS.
	* @param extensions - Extensions to be removed. Can be:
	* - Extension class with static `extension` property
	* - Extension format object with `type` and `ref`
	* - Multiple extensions as separate arguments
	* @returns {extensions} this for chaining
	* @example
	* ```ts
	* // Remove a single extension
	* extensions.remove(MyRendererPlugin);
	*
	* // Remove multiple extensions
	* extensions.remove(
	*     MyRendererPlugin,
	*     MySystemPlugin
	* );
	* ```
	* @see {@link ExtensionType} For available extension types
	* @see {@link ExtensionFormat} For extension format details
	*/
	remove(...extensions2) {
		extensions2.map(normalizeExtension).forEach((ext) => {
			ext.type.forEach((type) => this._removeHandlers[type]?.(ext));
		});
		return this;
	},
	/**
	* Register new extensions with PixiJS. Extensions can be registered in multiple formats:
	* - As a class with a static `extension` property
	* - As an extension format object
	* - As multiple extensions passed as separate arguments
	* @param extensions - Extensions to add to PixiJS. Each can be:
	* - A class with static `extension` property
	* - An extension format object with `type` and `ref`
	* - Multiple extensions as separate arguments
	* @returns This extensions instance for chaining
	* @example
	* ```ts
	* // Register a simple extension
	* extensions.add(MyRendererPlugin);
	*
	* // Register multiple extensions
	* extensions.add(
	*     MyRendererPlugin,
	*     MySystemPlugin,
	* });
	* ```
	* @see {@link ExtensionType} For available extension types
	* @see {@link ExtensionFormat} For extension format details
	* @see {@link extensions.remove} For removing registered extensions
	*/
	add(...extensions2) {
		extensions2.map(normalizeExtension).forEach((ext) => {
			ext.type.forEach((type) => {
				const handlers = this._addHandlers;
				const queue = this._queue;
				if (!handlers[type]) {
					queue[type] = queue[type] || [];
					queue[type]?.push(ext);
				} else handlers[type]?.(ext);
			});
		});
		return this;
	},
	/**
	* Internal method to handle extensions by name.
	* @param type - The extension type.
	* @param onAdd  - Function handler when extensions are added/registered {@link StrictExtensionFormat}.
	* @param onRemove  - Function handler when extensions are removed/unregistered {@link StrictExtensionFormat}.
	* @returns this for chaining.
	* @internal
	* @ignore
	*/
	handle(type, onAdd, onRemove) {
		const addHandlers = this._addHandlers;
		const removeHandlers = this._removeHandlers;
		if (addHandlers[type] || removeHandlers[type]) throw new Error(`Extension type ${type} already has a handler`);
		addHandlers[type] = onAdd;
		removeHandlers[type] = onRemove;
		const queue = this._queue;
		if (queue[type]) {
			queue[type]?.forEach((ext) => onAdd(ext));
			delete queue[type];
		}
		return this;
	},
	/**
	* Handle a type, but using a map by `name` property.
	* @param type - Type of extension to handle.
	* @param map - The object map of named extensions.
	* @returns this for chaining.
	* @ignore
	*/
	handleByMap(type, map) {
		return this.handle(type, (extension) => {
			if (extension.name) map[extension.name] = extension.ref;
		}, (extension) => {
			if (extension.name) delete map[extension.name];
		});
	},
	/**
	* Handle a type, but using a list of extensions with a `name` property.
	* @param type - Type of extension to handle.
	* @param map - The array of named extensions.
	* @param defaultPriority - Fallback priority if none is defined.
	* @returns this for chaining.
	* @ignore
	*/
	handleByNamedList(type, map, defaultPriority = -1) {
		return this.handle(type, (extension) => {
			if (map.findIndex((item) => item.name === extension.name) >= 0) return;
			map.push({
				name: extension.name,
				value: extension.ref
			});
			map.sort((a, b) => normalizeExtensionPriority(b.value, defaultPriority) - normalizeExtensionPriority(a.value, defaultPriority));
		}, (extension) => {
			const index = map.findIndex((item) => item.name === extension.name);
			if (index !== -1) map.splice(index, 1);
		});
	},
	/**
	* Handle a type, but using a list of extensions.
	* @param type - Type of extension to handle.
	* @param list - The list of extensions.
	* @param defaultPriority - The default priority to use if none is specified.
	* @returns this for chaining.
	* @ignore
	*/
	handleByList(type, list, defaultPriority = -1) {
		return this.handle(type, (extension) => {
			if (list.includes(extension.ref)) return;
			list.push(extension.ref);
			list.sort((a, b) => normalizeExtensionPriority(b, defaultPriority) - normalizeExtensionPriority(a, defaultPriority));
		}, (extension) => {
			const index = list.indexOf(extension.ref);
			if (index !== -1) list.splice(index, 1);
		});
	},
	/**
	* Mixin the source object(s) properties into the target class's prototype.
	* Copies all property descriptors from source objects to the target's prototype.
	* @param Target - The target class to mix properties into
	* @param sources - One or more source objects containing properties to mix in
	* @example
	* ```ts
	* // Create a mixin with shared properties
	* const moveable = {
	*     x: 0,
	*     y: 0,
	*     move(x: number, y: number) {
	*         this.x += x;
	*         this.y += y;
	*     }
	* };
	*
	* // Create a mixin with computed properties
	* const scalable = {
	*     scale: 1,
	*     get scaled() {
	*         return this.scale > 1;
	*     }
	* };
	*
	* // Apply mixins to a class
	* extensions.mixin(Sprite, moveable, scalable);
	*
	* // Use mixed-in properties
	* const sprite = new Sprite();
	* sprite.move(10, 20);
	* console.log(sprite.x, sprite.y); // 10, 20
	* ```
	* @remarks
	* - Copies all properties including getters/setters
	* - Does not modify source objects
	* - Preserves property descriptors
	* @see {@link Object.defineProperties} For details on property descriptors
	* @see {@link Object.getOwnPropertyDescriptors} For details on property copying
	*/
	mixin(Target, ...sources) {
		for (const source of sources) Object.defineProperties(Target.prototype, Object.getOwnPropertyDescriptors(source));
	}
};
//#endregion
//#region node_modules/pixi.js/lib/maths/point/ObservablePoint.mjs
var ObservablePoint = class ObservablePoint {
	/**
	* Creates a new `ObservablePoint`
	* @param observer - Observer to pass to listen for change events.
	* @param {number} [x=0] - position of the point on the x axis
	* @param {number} [y=0] - position of the point on the y axis
	*/
	constructor(observer, x, y) {
		this._x = x || 0;
		this._y = y || 0;
		this._observer = observer;
	}
	/**
	* Creates a clone of this point.
	* @example
	* ```ts
	* // Basic cloning
	* const point = new ObservablePoint(observer, 100, 200);
	* const copy = point.clone();
	*
	* // Clone with new observer
	* const newObserver = {
	*     _onUpdate: (p) => console.log(`Clone updated: (${p.x}, ${p.y})`)
	* };
	* const watched = point.clone(newObserver);
	*
	* // Verify independence
	* watched.set(300, 400); // Only triggers new observer
	* ```
	* @param observer - Optional observer to pass to the new observable point
	* @returns A copy of this observable point
	* @see {@link ObservablePoint.copyFrom} For copying into existing point
	* @see {@link Observer} For observer interface details
	*/
	clone(observer) {
		return new ObservablePoint(observer ?? this._observer, this._x, this._y);
	}
	/**
	* Sets the point to a new x and y position.
	*
	* If y is omitted, both x and y will be set to x.
	* @example
	* ```ts
	* // Basic position setting
	* const point = new ObservablePoint(observer);
	* point.set(100, 200);
	*
	* // Set both x and y to same value
	* point.set(50); // x=50, y=50
	* ```
	* @param x - Position on the x axis
	* @param y - Position on the y axis, defaults to x
	* @returns The point instance itself
	* @see {@link ObservablePoint.copyFrom} For copying from another point
	* @see {@link ObservablePoint.equals} For comparing positions
	*/
	set(x = 0, y = x) {
		if (this._x !== x || this._y !== y) {
			this._x = x;
			this._y = y;
			this._observer._onUpdate(this);
		}
		return this;
	}
	/**
	* Copies x and y from the given point into this point.
	* @example
	* ```ts
	* // Basic copying
	* const source = new ObservablePoint(observer, 100, 200);
	* const target = new ObservablePoint();
	* target.copyFrom(source);
	*
	* // Copy and chain operations
	* const point = new ObservablePoint()
	*     .copyFrom(source)
	*     .set(x + 50, y + 50);
	*
	* // Copy from any PointData
	* const data = { x: 10, y: 20 };
	* point.copyFrom(data);
	* ```
	* @param p - The point to copy from
	* @returns The point instance itself
	* @see {@link ObservablePoint.copyTo} For copying to another point
	* @see {@link ObservablePoint.clone} For creating new point copy
	*/
	copyFrom(p) {
		if (this._x !== p.x || this._y !== p.y) {
			this._x = p.x;
			this._y = p.y;
			this._observer._onUpdate(this);
		}
		return this;
	}
	/**
	* Copies this point's x and y into the given point.
	* @example
	* ```ts
	* // Basic copying
	* const source = new ObservablePoint(100, 200);
	* const target = new ObservablePoint();
	* source.copyTo(target);
	* ```
	* @param p - The point to copy to. Can be any type that is or extends `PointLike`
	* @returns The point (`p`) with values updated
	* @see {@link ObservablePoint.copyFrom} For copying from another point
	* @see {@link ObservablePoint.clone} For creating new point copy
	*/
	copyTo(p) {
		p.set(this._x, this._y);
		return p;
	}
	/**
	* Checks if another point is equal to this point.
	*
	* Compares x and y values using strict equality.
	* @example
	* ```ts
	* // Basic equality check
	* const p1 = new ObservablePoint(100, 200);
	* const p2 = new ObservablePoint(100, 200);
	* console.log(p1.equals(p2)); // true
	*
	* // Compare with PointData
	* const data = { x: 100, y: 200 };
	* console.log(p1.equals(data)); // true
	*
	* // Check different points
	* const p3 = new ObservablePoint(200, 300);
	* console.log(p1.equals(p3)); // false
	* ```
	* @param p - The point to check
	* @returns `true` if both `x` and `y` are equal
	* @see {@link ObservablePoint.copyFrom} For making points equal
	* @see {@link PointData} For point data interface
	*/
	equals(p) {
		return p.x === this._x && p.y === this._y;
	}
	toString() {
		return `[pixi.js/math:ObservablePoint x=${this._x} y=${this._y} scope=${this._observer}]`;
	}
	/**
	* Position of the observable point on the x axis.
	* Triggers observer callback when value changes.
	* @example
	* ```ts
	* // Basic x position
	* const point = new ObservablePoint(observer);
	* point.x = 100; // Triggers observer
	*
	* // Use in calculations
	* const width = rightPoint.x - leftPoint.x;
	* ```
	* @default 0
	*/
	get x() {
		return this._x;
	}
	set x(value) {
		if (this._x !== value) {
			this._x = value;
			this._observer._onUpdate(this);
		}
	}
	/**
	* Position of the observable point on the y axis.
	* Triggers observer callback when value changes.
	* @example
	* ```ts
	* // Basic y position
	* const point = new ObservablePoint(observer);
	* point.y = 200; // Triggers observer
	*
	* // Use in calculations
	* const height = bottomPoint.y - topPoint.y;
	* ```
	* @default 0
	*/
	get y() {
		return this._y;
	}
	set y(value) {
		if (this._y !== value) {
			this._y = value;
			this._observer._onUpdate(this);
		}
	}
};
var eventemitter3_default = (/* @__PURE__ */ __toESM((/* @__PURE__ */ __commonJSMin(((exports, module) => {
	var has = Object.prototype.hasOwnProperty;
	var prefix = "~";
	/**
	* Constructor to create a storage for our `EE` objects.
	* An `Events` instance is a plain object whose properties are event names.
	*
	* @constructor
	* @private
	*/
	function Events() {}
	if (Object.create) {
		Events.prototype = Object.create(null);
		if (!new Events().__proto__) prefix = false;
	}
	/**
	* Representation of a single event listener.
	*
	* @param {Function} fn The listener function.
	* @param {*} context The context to invoke the listener with.
	* @param {Boolean} [once=false] Specify if the listener is a one-time listener.
	* @constructor
	* @private
	*/
	function EE(fn, context, once) {
		this.fn = fn;
		this.context = context;
		this.once = once || false;
	}
	/**
	* Add a listener for a given event.
	*
	* @param {EventEmitter} emitter Reference to the `EventEmitter` instance.
	* @param {(String|Symbol)} event The event name.
	* @param {Function} fn The listener function.
	* @param {*} context The context to invoke the listener with.
	* @param {Boolean} once Specify if the listener is a one-time listener.
	* @returns {EventEmitter}
	* @private
	*/
	function addListener(emitter, event, fn, context, once) {
		if (typeof fn !== "function") throw new TypeError("The listener must be a function");
		var listener = new EE(fn, context || emitter, once), evt = prefix ? prefix + event : event;
		if (!emitter._events[evt]) emitter._events[evt] = listener, emitter._eventsCount++;
		else if (!emitter._events[evt].fn) emitter._events[evt].push(listener);
		else emitter._events[evt] = [emitter._events[evt], listener];
		return emitter;
	}
	/**
	* Clear event by name.
	*
	* @param {EventEmitter} emitter Reference to the `EventEmitter` instance.
	* @param {(String|Symbol)} evt The Event name.
	* @private
	*/
	function clearEvent(emitter, evt) {
		if (--emitter._eventsCount === 0) emitter._events = new Events();
		else delete emitter._events[evt];
	}
	/**
	* Minimal `EventEmitter` interface that is molded against the Node.js
	* `EventEmitter` interface.
	*
	* @constructor
	* @public
	*/
	function EventEmitter() {
		this._events = new Events();
		this._eventsCount = 0;
	}
	/**
	* Return an array listing the events for which the emitter has registered
	* listeners.
	*
	* @returns {Array}
	* @public
	*/
	EventEmitter.prototype.eventNames = function eventNames() {
		var names = [], events, name;
		if (this._eventsCount === 0) return names;
		for (name in events = this._events) if (has.call(events, name)) names.push(prefix ? name.slice(1) : name);
		if (Object.getOwnPropertySymbols) return names.concat(Object.getOwnPropertySymbols(events));
		return names;
	};
	/**
	* Return the listeners registered for a given event.
	*
	* @param {(String|Symbol)} event The event name.
	* @returns {Array} The registered listeners.
	* @public
	*/
	EventEmitter.prototype.listeners = function listeners(event) {
		var evt = prefix ? prefix + event : event, handlers = this._events[evt];
		if (!handlers) return [];
		if (handlers.fn) return [handlers.fn];
		for (var i = 0, l = handlers.length, ee = new Array(l); i < l; i++) ee[i] = handlers[i].fn;
		return ee;
	};
	/**
	* Return the number of listeners listening to a given event.
	*
	* @param {(String|Symbol)} event The event name.
	* @returns {Number} The number of listeners.
	* @public
	*/
	EventEmitter.prototype.listenerCount = function listenerCount(event) {
		var evt = prefix ? prefix + event : event, listeners = this._events[evt];
		if (!listeners) return 0;
		if (listeners.fn) return 1;
		return listeners.length;
	};
	/**
	* Calls each of the listeners registered for a given event.
	*
	* @param {(String|Symbol)} event The event name.
	* @returns {Boolean} `true` if the event had listeners, else `false`.
	* @public
	*/
	EventEmitter.prototype.emit = function emit(event, a1, a2, a3, a4, a5) {
		var evt = prefix ? prefix + event : event;
		if (!this._events[evt]) return false;
		var listeners = this._events[evt], len = arguments.length, args, i;
		if (listeners.fn) {
			if (listeners.once) this.removeListener(event, listeners.fn, void 0, true);
			switch (len) {
				case 1: return listeners.fn.call(listeners.context), true;
				case 2: return listeners.fn.call(listeners.context, a1), true;
				case 3: return listeners.fn.call(listeners.context, a1, a2), true;
				case 4: return listeners.fn.call(listeners.context, a1, a2, a3), true;
				case 5: return listeners.fn.call(listeners.context, a1, a2, a3, a4), true;
				case 6: return listeners.fn.call(listeners.context, a1, a2, a3, a4, a5), true;
			}
			for (i = 1, args = new Array(len - 1); i < len; i++) args[i - 1] = arguments[i];
			listeners.fn.apply(listeners.context, args);
		} else {
			var length = listeners.length, j;
			for (i = 0; i < length; i++) {
				if (listeners[i].once) this.removeListener(event, listeners[i].fn, void 0, true);
				switch (len) {
					case 1:
						listeners[i].fn.call(listeners[i].context);
						break;
					case 2:
						listeners[i].fn.call(listeners[i].context, a1);
						break;
					case 3:
						listeners[i].fn.call(listeners[i].context, a1, a2);
						break;
					case 4:
						listeners[i].fn.call(listeners[i].context, a1, a2, a3);
						break;
					default:
						if (!args) for (j = 1, args = new Array(len - 1); j < len; j++) args[j - 1] = arguments[j];
						listeners[i].fn.apply(listeners[i].context, args);
				}
			}
		}
		return true;
	};
	/**
	* Add a listener for a given event.
	*
	* @param {(String|Symbol)} event The event name.
	* @param {Function} fn The listener function.
	* @param {*} [context=this] The context to invoke the listener with.
	* @returns {EventEmitter} `this`.
	* @public
	*/
	EventEmitter.prototype.on = function on(event, fn, context) {
		return addListener(this, event, fn, context, false);
	};
	/**
	* Add a one-time listener for a given event.
	*
	* @param {(String|Symbol)} event The event name.
	* @param {Function} fn The listener function.
	* @param {*} [context=this] The context to invoke the listener with.
	* @returns {EventEmitter} `this`.
	* @public
	*/
	EventEmitter.prototype.once = function once(event, fn, context) {
		return addListener(this, event, fn, context, true);
	};
	/**
	* Remove the listeners of a given event.
	*
	* @param {(String|Symbol)} event The event name.
	* @param {Function} fn Only remove the listeners that match this function.
	* @param {*} context Only remove the listeners that have this context.
	* @param {Boolean} once Only remove one-time listeners.
	* @returns {EventEmitter} `this`.
	* @public
	*/
	EventEmitter.prototype.removeListener = function removeListener(event, fn, context, once) {
		var evt = prefix ? prefix + event : event;
		if (!this._events[evt]) return this;
		if (!fn) {
			clearEvent(this, evt);
			return this;
		}
		var listeners = this._events[evt];
		if (listeners.fn) {
			if (listeners.fn === fn && (!once || listeners.once) && (!context || listeners.context === context)) clearEvent(this, evt);
		} else {
			for (var i = 0, events = [], length = listeners.length; i < length; i++) if (listeners[i].fn !== fn || once && !listeners[i].once || context && listeners[i].context !== context) events.push(listeners[i]);
			if (events.length) this._events[evt] = events.length === 1 ? events[0] : events;
			else clearEvent(this, evt);
		}
		return this;
	};
	/**
	* Remove all listeners, or those of the specified event.
	*
	* @param {(String|Symbol)} [event] The event name.
	* @returns {EventEmitter} `this`.
	* @public
	*/
	EventEmitter.prototype.removeAllListeners = function removeAllListeners(event) {
		var evt;
		if (event) {
			evt = prefix ? prefix + event : event;
			if (this._events[evt]) clearEvent(this, evt);
		} else {
			this._events = new Events();
			this._eventsCount = 0;
		}
		return this;
	};
	EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
	EventEmitter.prototype.addListener = EventEmitter.prototype.on;
	EventEmitter.prefixed = prefix;
	EventEmitter.EventEmitter = EventEmitter;
	if ("undefined" !== typeof module) module.exports = EventEmitter;
})))(), 1)).default;
//#endregion
//#region node_modules/pixi.js/lib/maths/misc/const.mjs
var PI_2 = Math.PI * 2;
var RAD_TO_DEG = 180 / Math.PI;
var DEG_TO_RAD = Math.PI / 180;
//#endregion
//#region node_modules/pixi.js/lib/maths/point/Point.mjs
var Point = class Point {
	/**
	* Creates a new `Point`
	* @param {number} [x=0] - position of the point on the x axis
	* @param {number} [y=0] - position of the point on the y axis
	*/
	constructor(x = 0, y = 0) {
		/**
		* Position of the point on the x axis
		* @example
		* ```ts
		* // Set x position
		* const point = new Point();
		* point.x = 100;
		*
		* // Use in calculations
		* const width = rightPoint.x - leftPoint.x;
		* ```
		*/
		this.x = 0;
		/**
		* Position of the point on the y axis
		* @example
		* ```ts
		* // Set y position
		* const point = new Point();
		* point.y = 200;
		*
		* // Use in calculations
		* const height = bottomPoint.y - topPoint.y;
		* ```
		*/
		this.y = 0;
		this.x = x;
		this.y = y;
	}
	/**
	* Creates a clone of this point, which is a new instance with the same `x` and `y` values.
	* @example
	* ```ts
	* // Basic point cloning
	* const original = new Point(100, 200);
	* const copy = original.clone();
	*
	* // Clone and modify
	* const modified = original.clone();
	* modified.set(300, 400);
	*
	* // Verify independence
	* console.log(original); // Point(100, 200)
	* console.log(modified); // Point(300, 400)
	* ```
	* @remarks
	* - Creates new Point instance
	* - Deep copies x and y values
	* - Independent from original
	* - Useful for preserving values
	* @returns A clone of this point
	* @see {@link Point.copyFrom} For copying into existing point
	* @see {@link Point.copyTo} For copying to existing point
	*/
	clone() {
		return new Point(this.x, this.y);
	}
	/**
	* Copies x and y from the given point into this point.
	* @example
	* ```ts
	* // Basic copying
	* const source = new Point(100, 200);
	* const target = new Point();
	* target.copyFrom(source);
	*
	* // Copy and chain operations
	* const point = new Point()
	*     .copyFrom(source)
	*     .set(x + 50, y + 50);
	*
	* // Copy from any PointData
	* const data = { x: 10, y: 20 };
	* point.copyFrom(data);
	* ```
	* @param p - The point to copy from
	* @returns The point instance itself
	* @see {@link Point.copyTo} For copying to another point
	* @see {@link Point.clone} For creating new point copy
	*/
	copyFrom(p) {
		this.set(p.x, p.y);
		return this;
	}
	/**
	* Copies this point's x and y into the given point.
	* @example
	* ```ts
	* // Basic copying
	* const source = new Point(100, 200);
	* const target = new Point();
	* source.copyTo(target);
	* ```
	* @param p - The point to copy to. Can be any type that is or extends `PointLike`
	* @returns The point (`p`) with values updated
	* @see {@link Point.copyFrom} For copying from another point
	* @see {@link Point.clone} For creating new point copy
	*/
	copyTo(p) {
		p.set(this.x, this.y);
		return p;
	}
	/**
	* Checks if another point is equal to this point.
	*
	* Compares x and y values using strict equality.
	* @example
	* ```ts
	* // Basic equality check
	* const p1 = new Point(100, 200);
	* const p2 = new Point(100, 200);
	* console.log(p1.equals(p2)); // true
	*
	* // Compare with PointData
	* const data = { x: 100, y: 200 };
	* console.log(p1.equals(data)); // true
	*
	* // Check different points
	* const p3 = new Point(200, 300);
	* console.log(p1.equals(p3)); // false
	* ```
	* @param p - The point to check
	* @returns `true` if both `x` and `y` are equal
	* @see {@link Point.copyFrom} For making points equal
	* @see {@link PointData} For point data interface
	*/
	equals(p) {
		return p.x === this.x && p.y === this.y;
	}
	/**
	* Sets the point to a new x and y position.
	*
	* If y is omitted, both x and y will be set to x.
	* @example
	* ```ts
	* // Basic position setting
	* const point = new Point();
	* point.set(100, 200);
	*
	* // Set both x and y to same value
	* point.set(50); // x=50, y=50
	*
	* // Chain with other operations
	* point
	*     .set(10, 20)
	*     .copyTo(otherPoint);
	* ```
	* @param x - Position on the x axis
	* @param y - Position on the y axis, defaults to x
	* @returns The point instance itself
	* @see {@link Point.copyFrom} For copying from another point
	* @see {@link Point.equals} For comparing positions
	*/
	set(x = 0, y = x) {
		this.x = x;
		this.y = y;
		return this;
	}
	toString() {
		return `[pixi.js/math:Point x=${this.x} y=${this.y}]`;
	}
	/**
	* A static Point object with `x` and `y` values of `0`.
	*
	* This shared instance is reset to zero values when accessed.
	*
	* > [!IMPORTANT] This point is shared and temporary. Do not store references to it.
	* @example
	* ```ts
	* // Use for temporary calculations
	* const tempPoint = Point.shared;
	* tempPoint.set(100, 200);
	* matrix.apply(tempPoint);
	*
	* // Will be reset to (0,0) on next access
	* const fresh = Point.shared; // x=0, y=0
	* ```
	* @readonly
	* @returns A fresh zeroed point for temporary use
	* @see {@link Point.constructor} For creating new points
	* @see {@link PointData} For basic point interface
	*/
	static get shared() {
		tempPoint.x = 0;
		tempPoint.y = 0;
		return tempPoint;
	}
};
var tempPoint = new Point();
//#endregion
//#region node_modules/pixi.js/lib/maths/matrix/Matrix.mjs
var Matrix = class Matrix {
	/**
	* @param a - x scale
	* @param b - y skew
	* @param c - x skew
	* @param d - y scale
	* @param tx - x translation
	* @param ty - y translation
	*/
	constructor(a = 1, b = 0, c = 0, d = 1, tx = 0, ty = 0) {
		/**
		* Array representation of the matrix.
		* Only populated when `toArray()` is called.
		* @default null
		* @see {@link Matrix.toArray} For filling this array
		*/
		this.array = null;
		this.a = a;
		this.b = b;
		this.c = c;
		this.d = d;
		this.tx = tx;
		this.ty = ty;
	}
	/**
	* Creates a Matrix object based on the given array.
	* Populates matrix components from a flat array in column-major order.
	*
	* > [!NOTE] Array mapping order:
	* > ```
	* > array[0] = a  (x scale)
	* > array[1] = b  (y skew)
	* > array[2] = tx (x translation)
	* > array[3] = c  (x skew)
	* > array[4] = d  (y scale)
	* > array[5] = ty (y translation)
	* > ```
	* @example
	* ```ts
	* // Create matrix from array
	* const matrix = new Matrix();
	* matrix.fromArray([
	*     2, 0,  100,  // a, b, tx
	*     0, 2,  100   // c, d, ty
	* ]);
	*
	* // Create matrix from typed array
	* const float32Array = new Float32Array([
	*     1, 0, 0,     // Scale x1, no skew
	*     0, 1, 0      // No skew, scale x1
	* ]);
	* matrix.fromArray(float32Array);
	* ```
	* @param array - The array to populate the matrix from
	* @see {@link Matrix.toArray} For converting matrix to array
	* @see {@link Matrix.set} For setting values directly
	*/
	fromArray(array) {
		this.a = array[0];
		this.b = array[1];
		this.c = array[3];
		this.d = array[4];
		this.tx = array[2];
		this.ty = array[5];
	}
	/**
	* Sets the matrix properties directly.
	* All matrix components can be set in one call.
	* @example
	* ```ts
	* // Set to identity matrix
	* matrix.set(1, 0, 0, 1, 0, 0);
	*
	* // Set to scale matrix
	* matrix.set(2, 0, 0, 2, 0, 0); // Scale 2x
	*
	* // Set to translation matrix
	* matrix.set(1, 0, 0, 1, 100, 50); // Move 100,50
	* ```
	* @param a - Scale on x axis
	* @param b - Shear on y axis
	* @param c - Shear on x axis
	* @param d - Scale on y axis
	* @param tx - Translation on x axis
	* @param ty - Translation on y axis
	* @returns This matrix. Good for chaining method calls.
	* @see {@link Matrix.identity} For resetting to identity
	* @see {@link Matrix.fromArray} For setting from array
	*/
	set(a, b, c, d, tx, ty) {
		this.a = a;
		this.b = b;
		this.c = c;
		this.d = d;
		this.tx = tx;
		this.ty = ty;
		return this;
	}
	/**
	* Creates an array from the current Matrix object.
	*
	* > [!NOTE] The array format is:
	* > ```
	* > Non-transposed:
	* > [a, c, tx,
	* > b, d, ty,
	* > 0, 0, 1]
	* >
	* > Transposed:
	* > [a, b, 0,
	* > c, d, 0,
	* > tx,ty,1]
	* > ```
	* @example
	* ```ts
	* // Basic array conversion
	* const matrix = new Matrix(2, 0, 0, 2, 100, 100);
	* const array = matrix.toArray();
	*
	* // Using existing array
	* const float32Array = new Float32Array(9);
	* matrix.toArray(false, float32Array);
	*
	* // Get transposed array
	* const transposed = matrix.toArray(true);
	* ```
	* @param transpose - Whether to transpose the matrix
	* @param out - Optional Float32Array to store the result
	* @returns The array containing the matrix values
	* @see {@link Matrix.fromArray} For creating matrix from array
	* @see {@link Matrix.array} For cached array storage
	*/
	toArray(transpose, out) {
		if (!this.array) this.array = /* @__PURE__ */ new Float32Array(9);
		const array = out || this.array;
		if (transpose) {
			array[0] = this.a;
			array[1] = this.b;
			array[2] = 0;
			array[3] = this.c;
			array[4] = this.d;
			array[5] = 0;
			array[6] = this.tx;
			array[7] = this.ty;
			array[8] = 1;
		} else {
			array[0] = this.a;
			array[1] = this.c;
			array[2] = this.tx;
			array[3] = this.b;
			array[4] = this.d;
			array[5] = this.ty;
			array[6] = 0;
			array[7] = 0;
			array[8] = 1;
		}
		return array;
	}
	/**
	* Get a new position with the current transformation applied.
	*
	* Can be used to go from a child's coordinate space to the world coordinate space. (e.g. rendering)
	* @example
	* ```ts
	* // Basic point transformation
	* const matrix = new Matrix().translate(100, 50).rotate(Math.PI / 4);
	* const point = new Point(10, 20);
	* const transformed = matrix.apply(point);
	*
	* // Reuse existing point
	* const output = new Point();
	* matrix.apply(point, output);
	* ```
	* @param pos - The origin point to transform
	* @param newPos - Optional point to store the result
	* @returns The transformed point
	* @see {@link Matrix.applyInverse} For inverse transformation
	* @see {@link Point} For point operations
	*/
	apply(pos, newPos) {
		newPos = newPos || new Point();
		const x = pos.x;
		const y = pos.y;
		newPos.x = this.a * x + this.c * y + this.tx;
		newPos.y = this.b * x + this.d * y + this.ty;
		return newPos;
	}
	/**
	* Get a new position with the inverse of the current transformation applied.
	*
	* Can be used to go from the world coordinate space to a child's coordinate space. (e.g. input)
	* @example
	* ```ts
	* // Basic inverse transformation
	* const matrix = new Matrix().translate(100, 50).rotate(Math.PI / 4);
	* const worldPoint = new Point(150, 100);
	* const localPoint = matrix.applyInverse(worldPoint);
	*
	* // Reuse existing point
	* const output = new Point();
	* matrix.applyInverse(worldPoint, output);
	*
	* // Convert mouse position to local space
	* const mousePoint = new Point(mouseX, mouseY);
	* const localMouse = matrix.applyInverse(mousePoint);
	* ```
	* @param pos - The origin point to inverse-transform
	* @param newPos - Optional point to store the result
	* @returns The inverse-transformed point
	* @see {@link Matrix.apply} For forward transformation
	* @see {@link Matrix.invert} For getting inverse matrix
	*/
	applyInverse(pos, newPos) {
		newPos = newPos || new Point();
		const a = this.a;
		const b = this.b;
		const c = this.c;
		const d = this.d;
		const tx = this.tx;
		const ty = this.ty;
		const id = 1 / (a * d + c * -b);
		const x = pos.x;
		const y = pos.y;
		newPos.x = d * id * x + -c * id * y + (ty * c - tx * d) * id;
		newPos.y = a * id * y + -b * id * x + (-ty * a + tx * b) * id;
		return newPos;
	}
	/**
	* Translates the matrix on the x and y axes.
	* Adds to the position values while preserving scale, rotation and skew.
	* @example
	* ```ts
	* // Basic translation
	* const matrix = new Matrix();
	* matrix.translate(100, 50); // Move right 100, down 50
	*
	* // Chain with other transformations
	* matrix
	*     .scale(2, 2)
	*     .translate(100, 0)
	*     .rotate(Math.PI / 4);
	* ```
	* @param x - How much to translate on the x axis
	* @param y - How much to translate on the y axis
	* @returns This matrix. Good for chaining method calls.
	* @see {@link Matrix.set} For setting position directly
	* @see {@link Matrix.setTransform} For complete transform setup
	*/
	translate(x, y) {
		this.tx += x;
		this.ty += y;
		return this;
	}
	/**
	* Applies a scale transformation to the matrix.
	* Multiplies the scale values with existing matrix components.
	* @example
	* ```ts
	* // Basic scaling
	* const matrix = new Matrix();
	* matrix.scale(2, 3); // Scale 2x horizontally, 3x vertically
	*
	* // Chain with other transformations
	* matrix
	*     .translate(100, 100)
	*     .scale(2, 2)     // Scales after translation
	*     .rotate(Math.PI / 4);
	* ```
	* @param x - The amount to scale horizontally
	* @param y - The amount to scale vertically
	* @returns This matrix. Good for chaining method calls.
	* @see {@link Matrix.setTransform} For setting scale directly
	* @see {@link Matrix.append} For combining transformations
	*/
	scale(x, y) {
		this.a *= x;
		this.d *= y;
		this.c *= x;
		this.b *= y;
		this.tx *= x;
		this.ty *= y;
		return this;
	}
	/**
	* Applies a rotation transformation to the matrix.
	*
	* Rotates around the origin (0,0) by the given angle in radians.
	* @example
	* ```ts
	* // Basic rotation
	* const matrix = new Matrix();
	* matrix.rotate(Math.PI / 4); // Rotate 45 degrees
	*
	* // Chain with other transformations
	* matrix
	*     .translate(100, 100) // Move to rotation center
	*     .rotate(Math.PI)     // Rotate 180 degrees
	*     .scale(2, 2);        // Scale after rotation
	*
	* // Common angles
	* matrix.rotate(Math.PI / 2);  // 90 degrees
	* matrix.rotate(Math.PI);      // 180 degrees
	* matrix.rotate(Math.PI * 2);  // 360 degrees
	* ```
	* @remarks
	* - Rotates around origin point (0,0)
	* - Affects position if translation was set
	* - Uses counter-clockwise rotation
	* - Order of operations matters when chaining
	* @param angle - The angle in radians
	* @returns This matrix. Good for chaining method calls.
	* @see {@link Matrix.setTransform} For setting rotation directly
	* @see {@link Matrix.append} For combining transformations
	*/
	rotate(angle) {
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		const a1 = this.a;
		const c1 = this.c;
		const tx1 = this.tx;
		this.a = a1 * cos - this.b * sin;
		this.b = a1 * sin + this.b * cos;
		this.c = c1 * cos - this.d * sin;
		this.d = c1 * sin + this.d * cos;
		this.tx = tx1 * cos - this.ty * sin;
		this.ty = tx1 * sin + this.ty * cos;
		return this;
	}
	/**
	* Appends the given Matrix to this Matrix.
	* Combines two matrices by multiplying them together: this = this * matrix
	* @example
	* ```ts
	* // Basic matrix combination
	* const matrix = new Matrix();
	* const other = new Matrix().translate(100, 0).rotate(Math.PI / 4);
	* matrix.append(other);
	* ```
	* @remarks
	* - Order matters: A.append(B) !== B.append(A)
	* - Modifies current matrix
	* - Preserves transformation order
	* - Commonly used for combining transforms
	* @param matrix - The matrix to append
	* @returns This matrix. Good for chaining method calls.
	* @see {@link Matrix.prepend} For prepending transformations
	* @see {@link Matrix.appendFrom} For appending two external matrices
	*/
	append(matrix) {
		const a1 = this.a;
		const b1 = this.b;
		const c1 = this.c;
		const d1 = this.d;
		this.a = matrix.a * a1 + matrix.b * c1;
		this.b = matrix.a * b1 + matrix.b * d1;
		this.c = matrix.c * a1 + matrix.d * c1;
		this.d = matrix.c * b1 + matrix.d * d1;
		this.tx = matrix.tx * a1 + matrix.ty * c1 + this.tx;
		this.ty = matrix.tx * b1 + matrix.ty * d1 + this.ty;
		return this;
	}
	/**
	* Appends two matrices and sets the result to this matrix.
	* Performs matrix multiplication: this = A * B
	* @example
	* ```ts
	* // Basic matrix multiplication
	* const result = new Matrix();
	* const matrixA = new Matrix().scale(2, 2);
	* const matrixB = new Matrix().rotate(Math.PI / 4);
	* result.appendFrom(matrixA, matrixB);
	* ```
	* @remarks
	* - Order matters: A * B !== B * A
	* - Creates a new transformation from two others
	* - More efficient than append() for multiple operations
	* - Does not modify input matrices
	* @param a - The first matrix to multiply
	* @param b - The second matrix to multiply
	* @returns This matrix. Good for chaining method calls.
	* @see {@link Matrix.append} For single matrix combination
	* @see {@link Matrix.prepend} For reverse order multiplication
	*/
	appendFrom(a, b) {
		const a1 = a.a;
		const b1 = a.b;
		const c1 = a.c;
		const d1 = a.d;
		const tx = a.tx;
		const ty = a.ty;
		const a2 = b.a;
		const b2 = b.b;
		const c2 = b.c;
		const d2 = b.d;
		this.a = a1 * a2 + b1 * c2;
		this.b = a1 * b2 + b1 * d2;
		this.c = c1 * a2 + d1 * c2;
		this.d = c1 * b2 + d1 * d2;
		this.tx = tx * a2 + ty * c2 + b.tx;
		this.ty = tx * b2 + ty * d2 + b.ty;
		return this;
	}
	/**
	* Sets the matrix based on all the available properties.
	* Combines position, scale, rotation, skew and pivot in a single operation.
	* @example
	* ```ts
	* // Basic transform setup
	* const matrix = new Matrix();
	* matrix.setTransform(
	*     100, 100,    // position
	*     0, 0,        // pivot
	*     2, 2,        // scale
	*     Math.PI / 4, // rotation (45 degrees)
	*     0, 0         // skew
	* );
	* ```
	* @remarks
	* - Updates all matrix components at once
	* - More efficient than separate transform calls
	* - Uses radians for rotation and skew
	* - Pivot affects rotation center
	* @param x - Position on the x axis
	* @param y - Position on the y axis
	* @param pivotX - Pivot on the x axis
	* @param pivotY - Pivot on the y axis
	* @param scaleX - Scale on the x axis
	* @param scaleY - Scale on the y axis
	* @param rotation - Rotation in radians
	* @param skewX - Skew on the x axis
	* @param skewY - Skew on the y axis
	* @returns This matrix. Good for chaining method calls.
	* @see {@link Matrix.decompose} For extracting transform properties
	* @see {@link TransformableObject} For transform data structure
	*/
	setTransform(x, y, pivotX, pivotY, scaleX, scaleY, rotation, skewX, skewY) {
		this.a = Math.cos(rotation + skewY) * scaleX;
		this.b = Math.sin(rotation + skewY) * scaleX;
		this.c = -Math.sin(rotation - skewX) * scaleY;
		this.d = Math.cos(rotation - skewX) * scaleY;
		this.tx = x - (pivotX * this.a + pivotY * this.c);
		this.ty = y - (pivotX * this.b + pivotY * this.d);
		return this;
	}
	/**
	* Prepends the given Matrix to this Matrix.
	* Combines two matrices by multiplying them together: this = matrix * this
	* @example
	* ```ts
	* // Basic matrix prepend
	* const matrix = new Matrix().scale(2, 2);
	* const other = new Matrix().translate(100, 0);
	* matrix.prepend(other); // Translation happens before scaling
	* ```
	* @remarks
	* - Order matters: A.prepend(B) !== B.prepend(A)
	* - Modifies current matrix
	* - Reverses transformation order compared to append()
	* @param matrix - The matrix to prepend
	* @returns This matrix. Good for chaining method calls.
	* @see {@link Matrix.append} For appending transformations
	* @see {@link Matrix.appendFrom} For combining external matrices
	*/
	prepend(matrix) {
		const tx1 = this.tx;
		if (matrix.a !== 1 || matrix.b !== 0 || matrix.c !== 0 || matrix.d !== 1) {
			const a1 = this.a;
			const c1 = this.c;
			this.a = a1 * matrix.a + this.b * matrix.c;
			this.b = a1 * matrix.b + this.b * matrix.d;
			this.c = c1 * matrix.a + this.d * matrix.c;
			this.d = c1 * matrix.b + this.d * matrix.d;
		}
		this.tx = tx1 * matrix.a + this.ty * matrix.c + matrix.tx;
		this.ty = tx1 * matrix.b + this.ty * matrix.d + matrix.ty;
		return this;
	}
	/**
	* Decomposes the matrix into its individual transform components.
	* Extracts position, scale, rotation and skew values from the matrix.
	* @example
	* ```ts
	* // Basic decomposition
	* const matrix = new Matrix()
	*     .translate(100, 100)
	*     .rotate(Math.PI / 4)
	*     .scale(2, 2);
	*
	* const transform = {
	*     position: new Point(),
	*     scale: new Point(),
	*     pivot: new Point(),
	*     skew: new Point(),
	*     rotation: 0
	* };
	*
	* matrix.decompose(transform);
	* console.log(transform.position); // Point(100, 100)
	* console.log(transform.rotation); // ~0.785 (PI/4)
	* console.log(transform.scale); // Point(2, 2)
	* ```
	* @remarks
	* - Handles combined transformations
	* - Accounts for pivot points
	* - Chooses between rotation/skew based on transform type
	* - Uses radians for rotation and skew
	* @param transform - The transform object to store the decomposed values
	* @returns The transform with the newly applied properties
	* @see {@link Matrix.setTransform} For composing from components
	* @see {@link TransformableObject} For transform structure
	*/
	decompose(transform) {
		const a = this.a;
		const b = this.b;
		const c = this.c;
		const d = this.d;
		const pivot = transform.pivot;
		const skewX = -Math.atan2(-c, d);
		const skewY = Math.atan2(b, a);
		const delta = Math.abs(skewX + skewY);
		let scaleX = Math.sqrt(a * a + b * b);
		if (delta < 1e-5 || Math.abs(PI_2 - delta) < 1e-5) {
			transform.rotation = skewY;
			transform.skew.x = transform.skew.y = 0;
		} else if (Math.abs(Math.PI - delta) < 1e-5) {
			transform.rotation = skewY - Math.PI;
			transform.skew.x = transform.skew.y = 0;
			scaleX = -scaleX;
		} else {
			transform.rotation = 0;
			transform.skew.x = skewX;
			transform.skew.y = skewY;
		}
		transform.scale.x = scaleX;
		transform.scale.y = Math.sqrt(c * c + d * d);
		transform.position.x = this.tx + (pivot.x * a + pivot.y * c);
		transform.position.y = this.ty + (pivot.x * b + pivot.y * d);
		return transform;
	}
	/**
	* Inverts this matrix.
	* Creates the matrix that when multiplied with this matrix results in an identity matrix.
	* @example
	* ```ts
	* // Basic matrix inversion
	* const matrix = new Matrix()
	*     .translate(100, 50)
	*     .scale(2, 2);
	*
	* matrix.invert(); // Now transforms in opposite direction
	*
	* // Verify inversion
	* const point = new Point(50, 50);
	* const transformed = matrix.apply(point);
	* const original = matrix.invert().apply(transformed);
	* // original ≈ point
	* ```
	* @remarks
	* - Modifies the current matrix
	* - Useful for reversing transformations
	* - Cannot invert matrices with zero determinant
	* @returns This matrix. Good for chaining method calls.
	* @see {@link Matrix.identity} For resetting to identity
	* @see {@link Matrix.applyInverse} For inverse transformations
	*/
	invert() {
		const a1 = this.a;
		const b1 = this.b;
		const c1 = this.c;
		const d1 = this.d;
		const tx1 = this.tx;
		const n = a1 * d1 - b1 * c1;
		this.a = d1 / n;
		this.b = -b1 / n;
		this.c = -c1 / n;
		this.d = a1 / n;
		this.tx = (c1 * this.ty - d1 * tx1) / n;
		this.ty = -(a1 * this.ty - b1 * tx1) / n;
		return this;
	}
	/**
	* Checks if this matrix is an identity matrix.
	*
	* An identity matrix has no transformations applied (default state).
	* @example
	* ```ts
	* // Check if matrix is identity
	* const matrix = new Matrix();
	* console.log(matrix.isIdentity()); // true
	*
	* // Check after transformations
	* matrix.translate(100, 0);
	* console.log(matrix.isIdentity()); // false
	*
	* // Reset and verify
	* matrix.identity();
	* console.log(matrix.isIdentity()); // true
	* ```
	* @remarks
	* - Verifies a = 1, d = 1 (no scale)
	* - Verifies b = 0, c = 0 (no skew)
	* - Verifies tx = 0, ty = 0 (no translation)
	* @returns True if matrix has no transformations
	* @see {@link Matrix.identity} For resetting to identity
	* @see {@link Matrix.IDENTITY} For constant identity matrix
	*/
	isIdentity() {
		return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.tx === 0 && this.ty === 0;
	}
	/**
	* Resets this Matrix to an identity (default) matrix.
	* Sets all components to their default values: scale=1, no skew, no translation.
	* @example
	* ```ts
	* // Reset transformed matrix
	* const matrix = new Matrix()
	*     .scale(2, 2)
	*     .rotate(Math.PI / 4);
	* matrix.identity(); // Back to default state
	*
	* // Chain after reset
	* matrix
	*     .identity()
	*     .translate(100, 100)
	*     .scale(2, 2);
	*
	* // Compare with identity constant
	* const isDefault = matrix.equals(Matrix.IDENTITY);
	* ```
	* @remarks
	* - Sets a=1, d=1 (default scale)
	* - Sets b=0, c=0 (no skew)
	* - Sets tx=0, ty=0 (no translation)
	* @returns This matrix. Good for chaining method calls.
	* @see {@link Matrix.IDENTITY} For constant identity matrix
	* @see {@link Matrix.isIdentity} For checking identity state
	*/
	identity() {
		this.a = 1;
		this.b = 0;
		this.c = 0;
		this.d = 1;
		this.tx = 0;
		this.ty = 0;
		return this;
	}
	/**
	* Creates a new Matrix object with the same values as this one.
	* @returns A copy of this matrix. Good for chaining method calls.
	*/
	clone() {
		const matrix = new Matrix();
		matrix.a = this.a;
		matrix.b = this.b;
		matrix.c = this.c;
		matrix.d = this.d;
		matrix.tx = this.tx;
		matrix.ty = this.ty;
		return matrix;
	}
	/**
	* Creates a new Matrix object with the same values as this one.
	* @param matrix
	* @example
	* ```ts
	* // Basic matrix cloning
	* const matrix = new Matrix()
	*     .translate(100, 100)
	*     .rotate(Math.PI / 4);
	* const copy = matrix.clone();
	*
	* // Clone and modify
	* const modified = matrix.clone()
	*     .scale(2, 2);
	*
	* // Compare matrices
	* console.log(matrix.equals(copy));     // true
	* console.log(matrix.equals(modified)); // false
	* ```
	* @returns A copy of this matrix. Good for chaining method calls.
	* @see {@link Matrix.copyTo} For copying to existing matrix
	* @see {@link Matrix.copyFrom} For copying from another matrix
	*/
	copyTo(matrix) {
		matrix.a = this.a;
		matrix.b = this.b;
		matrix.c = this.c;
		matrix.d = this.d;
		matrix.tx = this.tx;
		matrix.ty = this.ty;
		return matrix;
	}
	/**
	* Changes the values of the matrix to be the same as the ones in given matrix.
	* @example
	* ```ts
	* // Basic matrix copying
	* const source = new Matrix()
	*     .translate(100, 100)
	*     .rotate(Math.PI / 4);
	* const target = new Matrix();
	* target.copyFrom(source);
	* ```
	* @param matrix - The matrix to copy from
	* @returns This matrix. Good for chaining method calls.
	* @see {@link Matrix.clone} For creating new matrix copy
	* @see {@link Matrix.copyTo} For copying to another matrix
	*/
	copyFrom(matrix) {
		this.a = matrix.a;
		this.b = matrix.b;
		this.c = matrix.c;
		this.d = matrix.d;
		this.tx = matrix.tx;
		this.ty = matrix.ty;
		return this;
	}
	/**
	* Checks if this matrix equals another matrix.
	* Compares all components for exact equality.
	* @example
	* ```ts
	* // Basic equality check
	* const m1 = new Matrix();
	* const m2 = new Matrix();
	* console.log(m1.equals(m2)); // true
	*
	* // Compare transformed matrices
	* const transform = new Matrix()
	*     .translate(100, 100)
	* const clone = new Matrix()
	*     .scale(2, 2);
	* console.log(transform.equals(clone)); // false
	* ```
	* @param matrix - The matrix to compare to
	* @returns True if matrices are identical
	* @see {@link Matrix.copyFrom} For copying matrix values
	* @see {@link Matrix.isIdentity} For identity comparison
	*/
	equals(matrix) {
		return matrix.a === this.a && matrix.b === this.b && matrix.c === this.c && matrix.d === this.d && matrix.tx === this.tx && matrix.ty === this.ty;
	}
	toString() {
		return `[pixi.js:Matrix a=${this.a} b=${this.b} c=${this.c} d=${this.d} tx=${this.tx} ty=${this.ty}]`;
	}
	/**
	* A default (identity) matrix with no transformations applied.
	*
	* > [!IMPORTANT] This is a shared read-only object. Create a new Matrix if you need to modify it.
	* @example
	* ```ts
	* // Get identity matrix reference
	* const identity = Matrix.IDENTITY;
	* console.log(identity.isIdentity()); // true
	*
	* // Compare with identity
	* const matrix = new Matrix();
	* console.log(matrix.equals(Matrix.IDENTITY)); // true
	*
	* // Create new matrix instead of modifying IDENTITY
	* const transform = new Matrix()
	*     .copyFrom(Matrix.IDENTITY)
	*     .translate(100, 100);
	* ```
	* @readonly
	* @returns A read-only identity matrix
	* @see {@link Matrix.shared} For temporary calculations
	* @see {@link Matrix.identity} For resetting matrices
	*/
	static get IDENTITY() {
		return identityMatrix.identity();
	}
	/**
	* A static Matrix that can be used to avoid creating new objects.
	* Will always ensure the matrix is reset to identity when requested.
	*
	* > [!IMPORTANT] This matrix is shared and temporary. Do not store references to it.
	* @example
	* ```ts
	* // Use for temporary calculations
	* const tempMatrix = Matrix.shared;
	* tempMatrix.translate(100, 100).rotate(Math.PI / 4);
	* const point = tempMatrix.apply({ x: 10, y: 20 });
	*
	* // Will be reset to identity on next access
	* const fresh = Matrix.shared; // Back to identity
	* ```
	* @remarks
	* - Always returns identity matrix
	* - Safe to modify temporarily
	* - Not safe to store references
	* - Useful for one-off calculations
	* @readonly
	* @returns A fresh identity matrix for temporary use
	* @see {@link Matrix.IDENTITY} For immutable identity matrix
	* @see {@link Matrix.identity} For resetting matrices
	*/
	static get shared() {
		return tempMatrix$2.identity();
	}
};
var tempMatrix$2 = new Matrix();
var identityMatrix = new Matrix();
//#endregion
//#region node_modules/pixi.js/lib/maths/matrix/groupD8.mjs
var ux = [
	1,
	1,
	0,
	-1,
	-1,
	-1,
	0,
	1,
	1,
	1,
	0,
	-1,
	-1,
	-1,
	0,
	1
];
var uy = [
	0,
	1,
	1,
	1,
	0,
	-1,
	-1,
	-1,
	0,
	1,
	1,
	1,
	0,
	-1,
	-1,
	-1
];
var vx = [
	0,
	-1,
	-1,
	-1,
	0,
	1,
	1,
	1,
	0,
	1,
	1,
	1,
	0,
	-1,
	-1,
	-1
];
var vy = [
	1,
	1,
	0,
	-1,
	-1,
	-1,
	0,
	1,
	-1,
	-1,
	0,
	1,
	1,
	1,
	0,
	-1
];
var rotationCayley = [];
var rotationMatrices = [];
var signum = Math.sign;
function init() {
	for (let i = 0; i < 16; i++) {
		const row = [];
		rotationCayley.push(row);
		for (let j = 0; j < 16; j++) {
			const _ux = signum(ux[i] * ux[j] + vx[i] * uy[j]);
			const _uy = signum(uy[i] * ux[j] + vy[i] * uy[j]);
			const _vx = signum(ux[i] * vx[j] + vx[i] * vy[j]);
			const _vy = signum(uy[i] * vx[j] + vy[i] * vy[j]);
			for (let k = 0; k < 16; k++) if (ux[k] === _ux && uy[k] === _uy && vx[k] === _vx && vy[k] === _vy) {
				row.push(k);
				break;
			}
		}
	}
	for (let i = 0; i < 16; i++) {
		const mat = new Matrix();
		mat.set(ux[i], uy[i], vx[i], vy[i], 0, 0);
		rotationMatrices.push(mat);
	}
}
init();
var groupD8 = {
	/**
	* | Rotation | Direction |
	* |----------|-----------|
	* | 0°       | East      |
	* @group groupD8
	* @type {GD8Symmetry}
	*/
	E: 0,
	/**
	* | Rotation | Direction |
	* |----------|-----------|
	* | 45°↻     | Southeast |
	* @group groupD8
	* @type {GD8Symmetry}
	*/
	SE: 1,
	/**
	* | Rotation | Direction |
	* |----------|-----------|
	* | 90°↻     | South     |
	* @group groupD8
	* @type {GD8Symmetry}
	*/
	S: 2,
	/**
	* | Rotation | Direction |
	* |----------|-----------|
	* | 135°↻    | Southwest |
	* @group groupD8
	* @type {GD8Symmetry}
	*/
	SW: 3,
	/**
	* | Rotation | Direction |
	* |----------|-----------|
	* | 180°     | West      |
	* @group groupD8
	* @type {GD8Symmetry}
	*/
	W: 4,
	/**
	* | Rotation    | Direction    |
	* |-------------|--------------|
	* | -135°/225°↻ | Northwest    |
	* @group groupD8
	* @type {GD8Symmetry}
	*/
	NW: 5,
	/**
	* | Rotation    | Direction    |
	* |-------------|--------------|
	* | -90°/270°↻  | North        |
	* @group groupD8
	* @type {GD8Symmetry}
	*/
	N: 6,
	/**
	* | Rotation    | Direction    |
	* |-------------|--------------|
	* | -45°/315°↻  | Northeast    |
	* @group groupD8
	* @type {GD8Symmetry}
	*/
	NE: 7,
	/**
	* Reflection about Y-axis.
	* @group groupD8
	* @type {GD8Symmetry}
	*/
	MIRROR_VERTICAL: 8,
	/**
	* Reflection about the main diagonal.
	* @group groupD8
	* @type {GD8Symmetry}
	*/
	MAIN_DIAGONAL: 10,
	/**
	* Reflection about X-axis.
	* @group groupD8
	* @type {GD8Symmetry}
	*/
	MIRROR_HORIZONTAL: 12,
	/**
	* Reflection about reverse diagonal.
	* @group groupD8
	* @type {GD8Symmetry}
	*/
	REVERSE_DIAGONAL: 14,
	/**
	* @group groupD8
	* @param {GD8Symmetry} ind - sprite rotation angle.
	* @returns {GD8Symmetry} The X-component of the U-axis
	*    after rotating the axes.
	*/
	uX: (ind) => ux[ind],
	/**
	* @group groupD8
	* @param {GD8Symmetry} ind - sprite rotation angle.
	* @returns {GD8Symmetry} The Y-component of the U-axis
	*    after rotating the axes.
	*/
	uY: (ind) => uy[ind],
	/**
	* @group groupD8
	* @param {GD8Symmetry} ind - sprite rotation angle.
	* @returns {GD8Symmetry} The X-component of the V-axis
	*    after rotating the axes.
	*/
	vX: (ind) => vx[ind],
	/**
	* @group groupD8
	* @param {GD8Symmetry} ind - sprite rotation angle.
	* @returns {GD8Symmetry} The Y-component of the V-axis
	*    after rotating the axes.
	*/
	vY: (ind) => vy[ind],
	/**
	* @group groupD8
	* @param {GD8Symmetry} rotation - symmetry whose opposite
	*   is needed. Only rotations have opposite symmetries while
	*   reflections don't.
	* @returns {GD8Symmetry} The opposite symmetry of `rotation`
	*/
	inv: (rotation) => {
		if (rotation & 8) return rotation & 15;
		return -rotation & 7;
	},
	/**
	* Composes the two D8 operations.
	*
	* Taking `^` as reflection:
	*
	* |       | E=0 | S=2 | W=4 | N=6 | E^=8 | S^=10 | W^=12 | N^=14 |
	* |-------|-----|-----|-----|-----|------|-------|-------|-------|
	* | E=0   | E   | S   | W   | N   | E^   | S^    | W^    | N^    |
	* | S=2   | S   | W   | N   | E   | S^   | W^    | N^    | E^    |
	* | W=4   | W   | N   | E   | S   | W^   | N^    | E^    | S^    |
	* | N=6   | N   | E   | S   | W   | N^   | E^    | S^    | W^    |
	* | E^=8  | E^  | N^  | W^  | S^  | E    | N     | W     | S     |
	* | S^=10 | S^  | E^  | N^  | W^  | S    | E     | N     | W     |
	* | W^=12 | W^  | S^  | E^  | N^  | W    | S     | E     | N     |
	* | N^=14 | N^  | W^  | S^  | E^  | N    | W     | S     | E     |
	*
	* [This is a Cayley table]{@link https://en.wikipedia.org/wiki/Cayley_table}
	* @group groupD8
	* @param {GD8Symmetry} rotationSecond - Second operation, which
	*   is the row in the above cayley table.
	* @param {GD8Symmetry} rotationFirst - First operation, which
	*   is the column in the above cayley table.
	* @returns {GD8Symmetry} Composed operation
	*/
	add: (rotationSecond, rotationFirst) => rotationCayley[rotationSecond][rotationFirst],
	/**
	* Reverse of `add`.
	* @group groupD8
	* @param {GD8Symmetry} rotationSecond - Second operation
	* @param {GD8Symmetry} rotationFirst - First operation
	* @returns {GD8Symmetry} Result
	*/
	sub: (rotationSecond, rotationFirst) => rotationCayley[rotationSecond][groupD8.inv(rotationFirst)],
	/**
	* Adds 180 degrees to rotation, which is a commutative
	* operation.
	* @group groupD8
	* @param {number} rotation - The number to rotate.
	* @returns {number} Rotated number
	*/
	rotate180: (rotation) => rotation ^ 4,
	/**
	* Checks if the rotation angle is vertical, i.e. south
	* or north. It doesn't work for reflections.
	* @group groupD8
	* @param {GD8Symmetry} rotation - The number to check.
	* @returns {boolean} Whether or not the direction is vertical
	*/
	isVertical: (rotation) => (rotation & 3) === 2,
	/**
	* Approximates the vector `V(dx,dy)` into one of the
	* eight directions provided by `groupD8`.
	* @group groupD8
	* @param {number} dx - X-component of the vector
	* @param {number} dy - Y-component of the vector
	* @returns {GD8Symmetry} Approximation of the vector into
	*  one of the eight symmetries.
	*/
	byDirection: (dx, dy) => {
		if (Math.abs(dx) * 2 <= Math.abs(dy)) {
			if (dy >= 0) return groupD8.S;
			return groupD8.N;
		} else if (Math.abs(dy) * 2 <= Math.abs(dx)) {
			if (dx > 0) return groupD8.E;
			return groupD8.W;
		} else if (dy > 0) {
			if (dx > 0) return groupD8.SE;
			return groupD8.SW;
		} else if (dx > 0) return groupD8.NE;
		return groupD8.NW;
	},
	/**
	* Helps sprite to compensate texture packer rotation.
	* @group groupD8
	* @param {Matrix} matrix - sprite world matrix
	* @param {GD8Symmetry} rotation - The rotation factor to use.
	* @param {number} tx - sprite anchoring
	* @param {number} ty - sprite anchoring
	* @param {number} dw - sprite width
	* @param {number} dh - sprite height
	*/
	matrixAppendRotationInv: (matrix, rotation, tx = 0, ty = 0, dw = 0, dh = 0) => {
		const mat = rotationMatrices[groupD8.inv(rotation)];
		const a = mat.a;
		const b = mat.b;
		const c = mat.c;
		const d = mat.d;
		const finalTx = tx - Math.min(0, a * dw, c * dh, a * dw + c * dh);
		const finalTy = ty - Math.min(0, b * dw, d * dh, b * dw + d * dh);
		const a1 = matrix.a;
		const b1 = matrix.b;
		const c1 = matrix.c;
		const d1 = matrix.d;
		matrix.a = a * a1 + b * c1;
		matrix.b = a * b1 + b * d1;
		matrix.c = c * a1 + d * c1;
		matrix.d = c * b1 + d * d1;
		matrix.tx = finalTx * a1 + finalTy * c1 + matrix.tx;
		matrix.ty = finalTx * b1 + finalTy * d1 + matrix.ty;
	},
	/**
	* Transforms rectangle coordinates based on texture packer rotation.
	* Used when texture atlas pages are rotated and coordinates need to be adjusted.
	* @group groupD8
	* @param {RectangleLike} rect - Rectangle with original coordinates to transform
	* @param {RectangleLike} sourceFrame - Source texture frame (includes offset and dimensions)
	* @param {GD8Symmetry} rotation - The groupD8 rotation value
	* @param {Rectangle} out - Rectangle to store the result
	* @returns {Rectangle} Transformed coordinates (includes source frame offset)
	*/
	transformRectCoords: (rect, sourceFrame, rotation, out) => {
		const { x, y, width, height } = rect;
		const { x: frameX, y: frameY, width: frameWidth, height: frameHeight } = sourceFrame;
		if (rotation === groupD8.E) {
			out.set(x + frameX, y + frameY, width, height);
			return out;
		} else if (rotation === groupD8.S) return out.set(frameWidth - y - height + frameX, x + frameY, height, width);
		else if (rotation === groupD8.W) return out.set(frameWidth - x - width + frameX, frameHeight - y - height + frameY, width, height);
		else if (rotation === groupD8.N) return out.set(y + frameX, frameHeight - x - width + frameY, height, width);
		return out.set(x + frameX, y + frameY, width, height);
	}
};
//#endregion
//#region node_modules/pixi.js/lib/maths/shapes/Rectangle.mjs
var tempPoints = [
	new Point(),
	new Point(),
	new Point(),
	new Point()
];
var Rectangle = class Rectangle {
	/**
	* @param x - The X coordinate of the upper-left corner of the rectangle
	* @param y - The Y coordinate of the upper-left corner of the rectangle
	* @param width - The overall width of the rectangle
	* @param height - The overall height of the rectangle
	*/
	constructor(x = 0, y = 0, width = 0, height = 0) {
		/**
		* The type of the object, mainly used to avoid `instanceof` checks
		* @example
		* ```ts
		* // Check shape type
		* const shape = new Rectangle(0, 0, 100, 100);
		* console.log(shape.type); // 'rectangle'
		*
		* // Use in type guards
		* if (shape.type === 'rectangle') {
		*     console.log(shape.width, shape.height);
		* }
		* ```
		* @readonly
		* @default 'rectangle'
		* @see {@link SHAPE_PRIMITIVE} For all shape types
		*/
		this.type = "rectangle";
		this.x = Number(x);
		this.y = Number(y);
		this.width = Number(width);
		this.height = Number(height);
	}
	/**
	* Returns the left edge (x-coordinate) of the rectangle.
	* @example
	* ```ts
	* // Get left edge position
	* const rect = new Rectangle(100, 100, 200, 150);
	* console.log(rect.left); // 100
	*
	* // Use in alignment calculations
	* sprite.x = rect.left + padding;
	*
	* // Compare positions
	* if (point.x > rect.left) {
	*     console.log('Point is right of rectangle');
	* }
	* ```
	* @readonly
	* @returns The x-coordinate of the left edge
	* @see {@link Rectangle.right} For right edge position
	* @see {@link Rectangle.x} For direct x-coordinate access
	*/
	get left() {
		return this.x;
	}
	/**
	* Returns the right edge (x + width) of the rectangle.
	* @example
	* ```ts
	* // Get right edge position
	* const rect = new Rectangle(100, 100, 200, 150);
	* console.log(rect.right); // 300
	*
	* // Align to right edge
	* sprite.x = rect.right - sprite.width;
	*
	* // Check boundaries
	* if (point.x < rect.right) {
	*     console.log('Point is inside right bound');
	* }
	* ```
	* @readonly
	* @returns The x-coordinate of the right edge
	* @see {@link Rectangle.left} For left edge position
	* @see {@link Rectangle.width} For width value
	*/
	get right() {
		return this.x + this.width;
	}
	/**
	* Returns the top edge (y-coordinate) of the rectangle.
	* @example
	* ```ts
	* // Get top edge position
	* const rect = new Rectangle(100, 100, 200, 150);
	* console.log(rect.top); // 100
	*
	* // Position above rectangle
	* sprite.y = rect.top - sprite.height;
	*
	* // Check vertical position
	* if (point.y > rect.top) {
	*     console.log('Point is below top edge');
	* }
	* ```
	* @readonly
	* @returns The y-coordinate of the top edge
	* @see {@link Rectangle.bottom} For bottom edge position
	* @see {@link Rectangle.y} For direct y-coordinate access
	*/
	get top() {
		return this.y;
	}
	/**
	* Returns the bottom edge (y + height) of the rectangle.
	* @example
	* ```ts
	* // Get bottom edge position
	* const rect = new Rectangle(100, 100, 200, 150);
	* console.log(rect.bottom); // 250
	*
	* // Stack below rectangle
	* sprite.y = rect.bottom + margin;
	*
	* // Check vertical bounds
	* if (point.y < rect.bottom) {
	*     console.log('Point is above bottom edge');
	* }
	* ```
	* @readonly
	* @returns The y-coordinate of the bottom edge
	* @see {@link Rectangle.top} For top edge position
	* @see {@link Rectangle.height} For height value
	*/
	get bottom() {
		return this.y + this.height;
	}
	/**
	* Determines whether the Rectangle is empty (has no area).
	* @example
	* ```ts
	* // Check zero dimensions
	* const rect = new Rectangle(100, 100, 0, 50);
	* console.log(rect.isEmpty()); // true
	* ```
	* @returns True if the rectangle has no area
	* @see {@link Rectangle.width} For width value
	* @see {@link Rectangle.height} For height value
	*/
	isEmpty() {
		return this.left === this.right || this.top === this.bottom;
	}
	/**
	* A constant empty rectangle. This is a new object every time the property is accessed.
	* @example
	* ```ts
	* // Get fresh empty rectangle
	* const empty = Rectangle.EMPTY;
	* console.log(empty.isEmpty()); // true
	* ```
	* @returns A new empty rectangle instance
	* @see {@link Rectangle.isEmpty} For empty state testing
	*/
	static get EMPTY() {
		return new Rectangle(0, 0, 0, 0);
	}
	/**
	* Creates a clone of this Rectangle
	* @example
	* ```ts
	* // Basic cloning
	* const original = new Rectangle(100, 100, 200, 150);
	* const copy = original.clone();
	*
	* // Clone and modify
	* const modified = original.clone();
	* modified.width *= 2;
	* modified.height += 50;
	*
	* // Verify independence
	* console.log(original.width);  // 200
	* console.log(modified.width);  // 400
	* ```
	* @returns A copy of the rectangle
	* @see {@link Rectangle.copyFrom} For copying into existing rectangle
	* @see {@link Rectangle.copyTo} For copying to another rectangle
	*/
	clone() {
		return new Rectangle(this.x, this.y, this.width, this.height);
	}
	/**
	* Converts a Bounds object to a Rectangle object.
	* @example
	* ```ts
	* // Convert bounds to rectangle
	* const bounds = container.getBounds();
	* const rect = new Rectangle().copyFromBounds(bounds);
	* ```
	* @param bounds - The bounds to copy and convert to a rectangle
	* @returns Returns itself
	* @see {@link Bounds} For bounds object structure
	* @see {@link Rectangle.getBounds} For getting rectangle bounds
	*/
	copyFromBounds(bounds) {
		this.x = bounds.minX;
		this.y = bounds.minY;
		this.width = bounds.maxX - bounds.minX;
		this.height = bounds.maxY - bounds.minY;
		return this;
	}
	/**
	* Copies another rectangle to this one.
	* @example
	* ```ts
	* // Basic copying
	* const source = new Rectangle(100, 100, 200, 150);
	* const target = new Rectangle();
	* target.copyFrom(source);
	*
	* // Chain with other operations
	* const rect = new Rectangle()
	*     .copyFrom(source)
	*     .pad(10);
	* ```
	* @param rectangle - The rectangle to copy from
	* @returns Returns itself
	* @see {@link Rectangle.copyTo} For copying to another rectangle
	* @see {@link Rectangle.clone} For creating new rectangle copy
	*/
	copyFrom(rectangle) {
		this.x = rectangle.x;
		this.y = rectangle.y;
		this.width = rectangle.width;
		this.height = rectangle.height;
		return this;
	}
	/**
	* Copies this rectangle to another one.
	* @example
	* ```ts
	* // Basic copying
	* const source = new Rectangle(100, 100, 200, 150);
	* const target = new Rectangle();
	* source.copyTo(target);
	*
	* // Chain with other operations
	* const result = source
	*     .copyTo(new Rectangle())
	*     .getBounds();
	* ```
	* @param rectangle - The rectangle to copy to
	* @returns Returns given parameter
	* @see {@link Rectangle.copyFrom} For copying from another rectangle
	* @see {@link Rectangle.clone} For creating new rectangle copy
	*/
	copyTo(rectangle) {
		rectangle.copyFrom(this);
		return rectangle;
	}
	/**
	* Checks whether the x and y coordinates given are contained within this Rectangle
	* @example
	* ```ts
	* // Basic containment check
	* const rect = new Rectangle(100, 100, 200, 150);
	* const isInside = rect.contains(150, 125); // true
	* // Check edge cases
	* console.log(rect.contains(100, 100)); // true (on edge)
	* console.log(rect.contains(300, 250)); // false (outside)
	* ```
	* @param x - The X coordinate of the point to test
	* @param y - The Y coordinate of the point to test
	* @returns Whether the x/y coordinates are within this Rectangle
	* @see {@link Rectangle.containsRect} For rectangle containment
	* @see {@link Rectangle.strokeContains} For checking stroke intersection
	*/
	contains(x, y) {
		if (this.width <= 0 || this.height <= 0) return false;
		if (x >= this.x && x < this.x + this.width) {
			if (y >= this.y && y < this.y + this.height) return true;
		}
		return false;
	}
	/**
	* Checks whether the x and y coordinates given are contained within this rectangle including the stroke.
	* @example
	* ```ts
	* // Basic stroke check
	* const rect = new Rectangle(100, 100, 200, 150);
	* const isOnStroke = rect.strokeContains(150, 100, 4); // 4px line width
	*
	* // Check with different alignments
	* const innerStroke = rect.strokeContains(150, 100, 4, 1);   // Inside
	* const centerStroke = rect.strokeContains(150, 100, 4, 0.5); // Centered
	* const outerStroke = rect.strokeContains(150, 100, 4, 0);   // Outside
	* ```
	* @param x - The X coordinate of the point to test
	* @param y - The Y coordinate of the point to test
	* @param strokeWidth - The width of the line to check
	* @param alignment - The alignment of the stroke (1 = inner, 0.5 = centered, 0 = outer)
	* @returns Whether the x/y coordinates are within this rectangle's stroke
	* @see {@link Rectangle.contains} For checking fill containment
	* @see {@link Rectangle.getBounds} For getting stroke bounds
	*/
	strokeContains(x, y, strokeWidth, alignment = .5) {
		const { width, height } = this;
		if (width <= 0 || height <= 0) return false;
		const _x = this.x;
		const _y = this.y;
		const strokeWidthOuter = strokeWidth * (1 - alignment);
		const strokeWidthInner = strokeWidth - strokeWidthOuter;
		const outerLeft = _x - strokeWidthOuter;
		const outerRight = _x + width + strokeWidthOuter;
		const outerTop = _y - strokeWidthOuter;
		const outerBottom = _y + height + strokeWidthOuter;
		const innerLeft = _x + strokeWidthInner;
		const innerRight = _x + width - strokeWidthInner;
		const innerTop = _y + strokeWidthInner;
		const innerBottom = _y + height - strokeWidthInner;
		return x >= outerLeft && x <= outerRight && y >= outerTop && y <= outerBottom && !(x > innerLeft && x < innerRight && y > innerTop && y < innerBottom);
	}
	/**
	* Determines whether the `other` Rectangle transformed by `transform` intersects with `this` Rectangle object.
	* Returns true only if the area of the intersection is >0, this means that Rectangles
	* sharing a side are not overlapping. Another side effect is that an arealess rectangle
	* (width or height equal to zero) can't intersect any other rectangle.
	* @param {Rectangle} other - The Rectangle to intersect with `this`.
	* @param {Matrix} transform - The transformation matrix of `other`.
	* @returns {boolean} A value of `true` if the transformed `other` Rectangle intersects with `this`; otherwise `false`.
	*/
	/**
	* Determines whether the `other` Rectangle transformed by `transform` intersects with `this` Rectangle object.
	*
	* Returns true only if the area of the intersection is greater than 0.
	* This means that rectangles sharing only a side are not considered intersecting.
	* @example
	* ```ts
	* // Basic intersection check
	* const rect1 = new Rectangle(0, 0, 100, 100);
	* const rect2 = new Rectangle(50, 50, 100, 100);
	* console.log(rect1.intersects(rect2)); // true
	*
	* // With transformation matrix
	* const matrix = new Matrix();
	* matrix.rotate(Math.PI / 4); // 45 degrees
	* console.log(rect1.intersects(rect2, matrix)); // Checks with rotation
	*
	* // Edge cases
	* const zeroWidth = new Rectangle(0, 0, 0, 100);
	* console.log(rect1.intersects(zeroWidth)); // false (no area)
	* ```
	* @remarks
	* - Returns true only if intersection area is > 0
	* - Rectangles sharing only a side are not intersecting
	* - Zero-area rectangles cannot intersect anything
	* - Supports optional transformation matrix
	* @param other - The Rectangle to intersect with `this`
	* @param transform - Optional transformation matrix of `other`
	* @returns True if the transformed `other` Rectangle intersects with `this`
	* @see {@link Rectangle.containsRect} For containment testing
	* @see {@link Rectangle.contains} For point testing
	*/
	intersects(other, transform) {
		if (!transform) {
			const x02 = this.x < other.x ? other.x : this.x;
			if ((this.right > other.right ? other.right : this.right) <= x02) return false;
			const y02 = this.y < other.y ? other.y : this.y;
			return (this.bottom > other.bottom ? other.bottom : this.bottom) > y02;
		}
		const x0 = this.left;
		const x1 = this.right;
		const y0 = this.top;
		const y1 = this.bottom;
		if (x1 <= x0 || y1 <= y0) return false;
		const lt = tempPoints[0].set(other.left, other.top);
		const lb = tempPoints[1].set(other.left, other.bottom);
		const rt = tempPoints[2].set(other.right, other.top);
		const rb = tempPoints[3].set(other.right, other.bottom);
		if (rt.x <= lt.x || lb.y <= lt.y) return false;
		const s = Math.sign(transform.a * transform.d - transform.b * transform.c);
		if (s === 0) return false;
		transform.apply(lt, lt);
		transform.apply(lb, lb);
		transform.apply(rt, rt);
		transform.apply(rb, rb);
		if (Math.max(lt.x, lb.x, rt.x, rb.x) <= x0 || Math.min(lt.x, lb.x, rt.x, rb.x) >= x1 || Math.max(lt.y, lb.y, rt.y, rb.y) <= y0 || Math.min(lt.y, lb.y, rt.y, rb.y) >= y1) return false;
		const nx = s * (lb.y - lt.y);
		const ny = s * (lt.x - lb.x);
		const n00 = nx * x0 + ny * y0;
		const n10 = nx * x1 + ny * y0;
		const n01 = nx * x0 + ny * y1;
		const n11 = nx * x1 + ny * y1;
		if (Math.max(n00, n10, n01, n11) <= nx * lt.x + ny * lt.y || Math.min(n00, n10, n01, n11) >= nx * rb.x + ny * rb.y) return false;
		const mx = s * (lt.y - rt.y);
		const my = s * (rt.x - lt.x);
		const m00 = mx * x0 + my * y0;
		const m10 = mx * x1 + my * y0;
		const m01 = mx * x0 + my * y1;
		const m11 = mx * x1 + my * y1;
		if (Math.max(m00, m10, m01, m11) <= mx * lt.x + my * lt.y || Math.min(m00, m10, m01, m11) >= mx * rb.x + my * rb.y) return false;
		return true;
	}
	/**
	* Pads the rectangle making it grow in all directions.
	*
	* If paddingY is omitted, both paddingX and paddingY will be set to paddingX.
	* @example
	* ```ts
	* // Basic padding
	* const rect = new Rectangle(100, 100, 200, 150);
	* rect.pad(10); // Adds 10px padding on all sides
	*
	* // Different horizontal and vertical padding
	* const uiRect = new Rectangle(0, 0, 100, 50);
	* uiRect.pad(20, 10); // 20px horizontal, 10px vertical
	* ```
	* @remarks
	* - Adjusts x/y by subtracting padding
	* - Increases width/height by padding * 2
	* - Common in UI layout calculations
	* - Chainable with other methods
	* @param paddingX - The horizontal padding amount
	* @param paddingY - The vertical padding amount
	* @returns Returns itself
	* @see {@link Rectangle.enlarge} For growing to include another rectangle
	* @see {@link Rectangle.fit} For shrinking to fit within another rectangle
	*/
	pad(paddingX = 0, paddingY = paddingX) {
		this.x -= paddingX;
		this.y -= paddingY;
		this.width += paddingX * 2;
		this.height += paddingY * 2;
		return this;
	}
	/**
	* Fits this rectangle around the passed one.
	* @example
	* ```ts
	* // Basic fitting
	* const container = new Rectangle(0, 0, 100, 100);
	* const content = new Rectangle(25, 25, 200, 200);
	* content.fit(container); // Clips to container bounds
	* ```
	* @param rectangle - The rectangle to fit around
	* @returns Returns itself
	* @see {@link Rectangle.enlarge} For growing to include another rectangle
	* @see {@link Rectangle.pad} For adding padding around the rectangle
	*/
	fit(rectangle) {
		const x1 = Math.max(this.x, rectangle.x);
		const x2 = Math.min(this.x + this.width, rectangle.x + rectangle.width);
		const y1 = Math.max(this.y, rectangle.y);
		const y2 = Math.min(this.y + this.height, rectangle.y + rectangle.height);
		this.x = x1;
		this.width = Math.max(x2 - x1, 0);
		this.y = y1;
		this.height = Math.max(y2 - y1, 0);
		return this;
	}
	/**
	* Enlarges rectangle so that its corners lie on a grid defined by resolution.
	* @example
	* ```ts
	* // Basic grid alignment
	* const rect = new Rectangle(10.2, 10.6, 100.8, 100.4);
	* rect.ceil(); // Aligns to whole pixels
	*
	* // Custom resolution grid
	* const uiRect = new Rectangle(5.3, 5.7, 50.2, 50.8);
	* uiRect.ceil(0.5); // Aligns to half pixels
	*
	* // Use with precision value
	* const preciseRect = new Rectangle(20.001, 20.999, 100.001, 100.999);
	* preciseRect.ceil(1, 0.01); // Handles small decimal variations
	* ```
	* @param resolution - The grid size to align to (1 = whole pixels)
	* @param eps - Small number to prevent floating point errors
	* @returns Returns itself
	* @see {@link Rectangle.fit} For constraining to bounds
	* @see {@link Rectangle.enlarge} For growing dimensions
	*/
	ceil(resolution = 1, eps = .001) {
		const x2 = Math.ceil((this.x + this.width - eps) * resolution) / resolution;
		const y2 = Math.ceil((this.y + this.height - eps) * resolution) / resolution;
		this.x = Math.floor((this.x + eps) * resolution) / resolution;
		this.y = Math.floor((this.y + eps) * resolution) / resolution;
		this.width = x2 - this.x;
		this.height = y2 - this.y;
		return this;
	}
	/**
	* Scales the rectangle's dimensions and position by the specified factors.
	* @example
	* ```ts
	* const rect = new Rectangle(50, 50, 100, 100);
	*
	* // Scale uniformly
	* rect.scale(0.5, 0.5);
	* // rect is now: x=25, y=25, width=50, height=50
	*
	* // non-uniformly
	* rect.scale(0.5, 1);
	* // rect is now: x=25, y=50, width=50, height=100
	* ```
	* @param x - The factor by which to scale the horizontal properties (x, width).
	* @param y - The factor by which to scale the vertical properties (y, height).
	* @returns Returns itself
	*/
	scale(x, y = x) {
		this.x *= x;
		this.y *= y;
		this.width *= x;
		this.height *= y;
		return this;
	}
	/**
	* Enlarges this rectangle to include the passed rectangle.
	* @example
	* ```ts
	* // Basic enlargement
	* const rect = new Rectangle(50, 50, 100, 100);
	* const other = new Rectangle(0, 0, 200, 75);
	* rect.enlarge(other);
	* // rect is now: x=0, y=0, width=200, height=150
	*
	* // Use for bounding box calculation
	* const bounds = new Rectangle();
	* objects.forEach((obj) => {
	*     bounds.enlarge(obj.getBounds());
	* });
	* ```
	* @param rectangle - The rectangle to include
	* @returns Returns itself
	* @see {@link Rectangle.fit} For shrinking to fit within another rectangle
	* @see {@link Rectangle.pad} For adding padding around the rectangle
	*/
	enlarge(rectangle) {
		const x1 = Math.min(this.x, rectangle.x);
		const x2 = Math.max(this.x + this.width, rectangle.x + rectangle.width);
		const y1 = Math.min(this.y, rectangle.y);
		const y2 = Math.max(this.y + this.height, rectangle.y + rectangle.height);
		this.x = x1;
		this.width = x2 - x1;
		this.y = y1;
		this.height = y2 - y1;
		return this;
	}
	/**
	* Returns the framing rectangle of the rectangle as a Rectangle object
	* @example
	* ```ts
	* // Basic bounds retrieval
	* const rect = new Rectangle(100, 100, 200, 150);
	* const bounds = rect.getBounds();
	*
	* // Reuse existing rectangle
	* const out = new Rectangle();
	* rect.getBounds(out);
	* ```
	* @param out - Optional rectangle to store the result
	* @returns The framing rectangle
	* @see {@link Rectangle.copyFrom} For direct copying
	* @see {@link Rectangle.clone} For creating new copy
	*/
	getBounds(out) {
		out || (out = new Rectangle());
		out.copyFrom(this);
		return out;
	}
	/**
	* Determines whether another Rectangle is fully contained within this Rectangle.
	*
	* Rectangles that occupy the same space are considered to be containing each other.
	*
	* Rectangles without area (width or height equal to zero) can't contain anything,
	* not even other arealess rectangles.
	* @example
	* ```ts
	* // Check if one rectangle contains another
	* const container = new Rectangle(0, 0, 100, 100);
	* const inner = new Rectangle(25, 25, 50, 50);
	*
	* console.log(container.containsRect(inner)); // true
	*
	* // Check overlapping rectangles
	* const partial = new Rectangle(75, 75, 50, 50);
	* console.log(container.containsRect(partial)); // false
	*
	* // Zero-area rectangles can't contain anything
	* const empty = new Rectangle(0, 0, 0, 100);
	* console.log(empty.containsRect(inner)); // false
	* ```
	* @param other - The Rectangle to check for containment
	* @returns True if other is fully contained within this Rectangle
	* @see {@link Rectangle.contains} For point containment
	* @see {@link Rectangle.intersects} For overlap testing
	*/
	containsRect(other) {
		if (this.width <= 0 || this.height <= 0) return false;
		const x1 = other.x;
		const y1 = other.y;
		const x2 = other.x + other.width;
		const y2 = other.y + other.height;
		return x1 >= this.x && x1 < this.x + this.width && y1 >= this.y && y1 < this.y + this.height && x2 >= this.x && x2 <= this.x + this.width && y2 >= this.y && y2 <= this.y + this.height;
	}
	/**
	* Sets the position and dimensions of the rectangle.
	* @example
	* ```ts
	* // Basic usage
	* const rect = new Rectangle();
	* rect.set(100, 100, 200, 150);
	*
	* // Chain with other operations
	* const bounds = new Rectangle()
	*     .set(0, 0, 100, 100)
	*     .pad(10);
	* ```
	* @param x - The X coordinate of the upper-left corner of the rectangle
	* @param y - The Y coordinate of the upper-left corner of the rectangle
	* @param width - The overall width of the rectangle
	* @param height - The overall height of the rectangle
	* @returns Returns itself for method chaining
	* @see {@link Rectangle.copyFrom} For copying from another rectangle
	* @see {@link Rectangle.clone} For creating a new copy
	*/
	set(x, y, width, height) {
		this.x = x;
		this.y = y;
		this.width = width;
		this.height = height;
		return this;
	}
	toString() {
		return `[pixi.js/math:Rectangle x=${this.x} y=${this.y} width=${this.width} height=${this.height}]`;
	}
};
//#endregion
//#region node_modules/pixi.js/lib/utils/data/uid.mjs
var uidCache = { default: -1 };
function uid(name = "default") {
	if (uidCache[name] === void 0) uidCache[name] = -1;
	return ++uidCache[name];
}
function resetUids() {
	for (const key in uidCache) delete uidCache[key];
}
//#endregion
//#region node_modules/pixi.js/lib/utils/logging/deprecation.mjs
var warnings = /* @__PURE__ */ new Set();
var v8_0_0 = "8.0.0";
var v8_3_4 = "8.3.4";
var v8_21_0 = "8.21.0";
var deprecationState = {
	quiet: false,
	noColor: false
};
var deprecation = ((version, message, ignoreDepth = 3) => {
	if (deprecationState.quiet || warnings.has(message)) return;
	let stack = (/* @__PURE__ */ new Error()).stack;
	const deprecationMessage = `${message}
Deprecated since v${version}`;
	const useGroup = typeof console.groupCollapsed === "function" && !deprecationState.noColor;
	if (typeof stack === "undefined") console.warn("PixiJS Deprecation Warning: ", deprecationMessage);
	else {
		stack = stack.split("\n").splice(ignoreDepth).join("\n");
		if (useGroup) {
			console.groupCollapsed("%cPixiJS Deprecation Warning: %c%s", "color:#614108;background:#fffbe6", "font-weight:normal;color:#614108;background:#fffbe6", deprecationMessage);
			console.warn(stack);
			console.groupEnd();
		} else {
			console.warn("PixiJS Deprecation Warning: ", deprecationMessage);
			console.warn(stack);
		}
	}
	warnings.add(message);
});
Object.defineProperties(deprecation, {
	quiet: {
		get: () => deprecationState.quiet,
		set: (value) => {
			deprecationState.quiet = value;
		},
		enumerable: true,
		configurable: false
	},
	noColor: {
		get: () => deprecationState.noColor,
		set: (value) => {
			deprecationState.noColor = value;
		},
		enumerable: true,
		configurable: false
	}
});
//#endregion
//#region node_modules/pixi.js/lib/utils/misc/NOOP.mjs
var NOOP = () => {};
//#endregion
//#region node_modules/pixi.js/lib/maths/misc/pow2.mjs
function nextPow2(v) {
	v += v === 0 ? 1 : 0;
	--v;
	v |= v >>> 1;
	v |= v >>> 2;
	v |= v >>> 4;
	v |= v >>> 8;
	v |= v >>> 16;
	return v + 1;
}
function isPow2(v) {
	return !(v & v - 1) && !!v;
}
function log2(v) {
	let r = (v > 65535 ? 1 : 0) << 4;
	v >>>= r;
	let shift = (v > 255 ? 1 : 0) << 3;
	v >>>= shift;
	r |= shift;
	shift = (v > 15 ? 1 : 0) << 2;
	v >>>= shift;
	r |= shift;
	shift = (v > 3 ? 1 : 0) << 1;
	v >>>= shift;
	r |= shift;
	return r | v >> 1;
}
//#endregion
//#region node_modules/pixi.js/lib/scene/container/utils/definedProps.mjs
function definedProps(obj) {
	const result = {};
	for (const key in obj) if (obj[key] !== void 0) result[key] = obj[key];
	return result;
}
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/shared/texture/TextureStyle.mjs
var idHash$1 = /* @__PURE__ */ Object.create(null);
function createResourceIdFromString(value) {
	const id = idHash$1[value];
	if (id === void 0) idHash$1[value] = uid("resource");
	return id;
}
var _TextureStyle = class _TextureStyle extends eventemitter3_default {
	/**
	* @param options - options for the style
	*/
	constructor(options = {}) {
		super();
		/** @internal */
		this._resourceType = "textureSampler";
		/**
		* Specifies the maximum anisotropy value clamp used by the sampler.
		* Note: Most implementations support {@link TextureStyle#maxAnisotropy} values in range
		* between 1 and 16, inclusive. The used value of {@link TextureStyle#maxAnisotropy} will
		* be clamped to the maximum value that the platform supports.
		* @internal
		*/
		this._maxAnisotropy = 1;
		/**
		* Has the style been destroyed?
		* @readonly
		*/
		this.destroyed = false;
		options = {
			..._TextureStyle.defaultOptions,
			...options
		};
		this.addressMode = options.addressMode;
		this.addressModeU = options.addressModeU ?? this.addressModeU;
		this.addressModeV = options.addressModeV ?? this.addressModeV;
		this.addressModeW = options.addressModeW ?? this.addressModeW;
		this.scaleMode = options.scaleMode;
		this.magFilter = options.magFilter ?? this.magFilter;
		this.minFilter = options.minFilter ?? this.minFilter;
		this.mipmapFilter = options.mipmapFilter ?? this.mipmapFilter;
		this.lodMinClamp = options.lodMinClamp;
		this.lodMaxClamp = options.lodMaxClamp;
		this.compare = options.compare;
		this.maxAnisotropy = options.maxAnisotropy ?? 1;
	}
	set addressMode(value) {
		this.addressModeU = value;
		this.addressModeV = value;
		this.addressModeW = value;
	}
	/** setting this will set wrapModeU,wrapModeV and wrapModeW all at once! */
	get addressMode() {
		return this.addressModeU;
	}
	set wrapMode(value) {
		deprecation(v8_0_0, "TextureStyle.wrapMode is now TextureStyle.addressMode");
		this.addressMode = value;
	}
	get wrapMode() {
		return this.addressMode;
	}
	set scaleMode(value) {
		this.magFilter = value;
		this.minFilter = value;
		this.mipmapFilter = value;
	}
	/** setting this will set magFilter,minFilter and mipmapFilter all at once!  */
	get scaleMode() {
		return this.magFilter;
	}
	/** Specifies the maximum anisotropy value clamp used by the sampler. */
	set maxAnisotropy(value) {
		this._maxAnisotropy = Math.min(value, 16);
		if (this._maxAnisotropy > 1) this.scaleMode = "linear";
	}
	get maxAnisotropy() {
		return this._maxAnisotropy;
	}
	get _resourceId() {
		return this._sharedResourceId || this._generateResourceId();
	}
	update() {
		this._sharedResourceId = null;
		this.emit("change", this);
	}
	_generateResourceId() {
		const bigKey = `${this.addressModeU}-${this.addressModeV}-${this.addressModeW}-${this.magFilter}-${this.minFilter}-${this.mipmapFilter}-${this.lodMinClamp}-${this.lodMaxClamp}-${this.compare}-${this._maxAnisotropy}`;
		this._sharedResourceId = createResourceIdFromString(bigKey);
		return this._resourceId;
	}
	/** Destroys the style */
	destroy() {
		this.destroyed = true;
		this.emit("destroy", this);
		this.emit("change", this);
		this.removeAllListeners();
	}
};
/** default options for the style */
_TextureStyle.defaultOptions = {
	addressMode: "clamp-to-edge",
	scaleMode: "linear"
};
var TextureStyle = _TextureStyle;
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/shared/texture/sources/TextureSource.mjs
var _TextureSource = class _TextureSource extends eventemitter3_default {
	/**
	* @param options - options for creating a new TextureSource
	*/
	constructor(options = {}) {
		super();
		this.options = options;
		/** @internal */
		this._gpuData = /* @__PURE__ */ Object.create(null);
		/** @internal */
		this._gcLastUsed = -1;
		/** unique id for this Texture source */
		this.uid = uid("textureSource");
		/**
		* The resource type used by this TextureSource. This is used by the bind groups to determine
		* how to handle this resource.
		* @internal
		*/
		this._resourceType = "textureSource";
		/**
		* i unique resource id, used by the bind group systems.
		* This can change if the texture is resized or its resource changes
		* @internal
		*/
		this._resourceId = uid("resource");
		/**
		* this is how the backends know how to upload this texture to the GPU
		* It changes depending on the resource type. Classes that extend TextureSource
		* should override this property.
		* @internal
		*/
		this.uploadMethodId = "unknown";
		/** @internal */
		this._resolution = 1;
		/** the pixel width of this texture source. This is the REAL pure number, not accounting resolution */
		this.pixelWidth = 1;
		/** the pixel height of this texture source. This is the REAL pure number, not accounting resolution */
		this.pixelHeight = 1;
		/**
		* the width of this texture source, accounting for resolution
		* eg pixelWidth 200, resolution 2, then width will be 100
		*/
		this.width = 1;
		/**
		* the height of this texture source, accounting for resolution
		* eg pixelHeight 200, resolution 2, then height will be 100
		*/
		this.height = 1;
		/**
		* The number of samples of a multisample texture. This is always 1 for non-multisample textures.
		* To enable multisample for a texture, set antialias to true
		* @internal
		*/
		this.sampleCount = 1;
		/**
		* The number of mip levels to generate for this texture.
		* this is overridden if autoGenerateMipmaps is true. it is read only!
		*/
		this.mipLevelCount = 1;
		/**
		* Should we auto generate mipmaps for this texture? This will automatically generate mipmaps
		* for this texture when uploading to the GPU. Mipmapped textures take up more memory, but
		* can look better when scaled down.
		*
		* For performance reasons, it is recommended to NOT use this with RenderTextures, as they are often updated every frame.
		* If you do, make sure to call `updateMipmaps` after you update the texture.
		*/
		this.autoGenerateMipmaps = false;
		/** the format that the texture data has */
		this.format = "rgba8unorm";
		/** how many dimensions does this texture have? currently v8 only supports 2d */
		this.dimension = "2d";
		/** how this texture is viewed/sampled by shaders (WebGPU view dimension) */
		this.viewDimension = "2d";
		/** how many array layers this texture has (WebGPU depthOrArrayLayers) */
		this.arrayLayerCount = 1;
		this._ownsStyle = false;
		/**
		* Only really affects RenderTextures.
		* Should we use antialiasing for this texture. It will look better, but may impact performance as a
		* Blit operation will be required to resolve the texture.
		*/
		this.antialias = false;
		/**
		* Treat the underlying GPU texture as transient — see {@link TextureSourceOptions.transient}.
		* Internal flag, populated from options.
		* @internal
		*/
		this.transient = false;
		/**
		* Used by the batcher to build texture batches. faster to have the variable here!
		* @protected
		*/
		this._batchTick = -1;
		/**
		* A temporary batch location for the texture batching. Here for performance reasons only!
		* @protected
		*/
		this._textureBindLocation = -1;
		options = {
			..._TextureSource.defaultOptions,
			...options
		};
		this.label = options.label ?? "";
		this.resource = options.resource;
		this.autoGarbageCollect = options.autoGarbageCollect;
		this._resolution = options.resolution;
		if (options.width) this.pixelWidth = options.width * this._resolution;
		else this.pixelWidth = this.resource ? this.resourceWidth ?? 1 : 1;
		if (options.height) this.pixelHeight = options.height * this._resolution;
		else this.pixelHeight = this.resource ? this.resourceHeight ?? 1 : 1;
		this.width = this.pixelWidth / this._resolution;
		this.height = this.pixelHeight / this._resolution;
		this.format = options.format;
		this.dimension = options.dimensions;
		this.viewDimension = options.viewDimension ?? options.dimensions;
		this.arrayLayerCount = options.arrayLayerCount;
		this.mipLevelCount = options.mipLevelCount;
		this.autoGenerateMipmaps = options.autoGenerateMipmaps;
		this.sampleCount = options.sampleCount;
		this.antialias = options.antialias;
		this.transient = options.transient ?? false;
		this.alphaMode = options.alphaMode;
		this.style = new TextureStyle(definedProps(options));
		this._ownsStyle = true;
		this.destroyed = false;
		this._refreshPOT();
	}
	/** returns itself */
	get source() {
		return this;
	}
	/** the style of the texture */
	get style() {
		return this._style;
	}
	set style(value) {
		if (this.style === value) return;
		this._ownsStyle = false;
		this._style?.off("change", this._onStyleChange, this);
		this._style = value;
		this._style?.on("change", this._onStyleChange, this);
		this._onStyleChange();
	}
	/** Specifies the maximum anisotropy value clamp used by the sampler. */
	set maxAnisotropy(value) {
		this._style.maxAnisotropy = value;
	}
	get maxAnisotropy() {
		return this._style.maxAnisotropy;
	}
	/** setting this will set wrapModeU, wrapModeV and wrapModeW all at once! */
	get addressMode() {
		return this._style.addressMode;
	}
	set addressMode(value) {
		this._style.addressMode = value;
	}
	/** setting this will set wrapModeU, wrapModeV and wrapModeW all at once! */
	get repeatMode() {
		return this._style.addressMode;
	}
	set repeatMode(value) {
		this._style.addressMode = value;
	}
	/** Specifies the sampling behavior when the sample footprint is smaller than or equal to one texel. */
	get magFilter() {
		return this._style.magFilter;
	}
	set magFilter(value) {
		this._style.magFilter = value;
	}
	/** Specifies the sampling behavior when the sample footprint is larger than one texel. */
	get minFilter() {
		return this._style.minFilter;
	}
	set minFilter(value) {
		this._style.minFilter = value;
	}
	/** Specifies behavior for sampling between mipmap levels. */
	get mipmapFilter() {
		return this._style.mipmapFilter;
	}
	set mipmapFilter(value) {
		this._style.mipmapFilter = value;
	}
	/** Specifies the minimum and maximum levels of detail, respectively, used internally when sampling a texture. */
	get lodMinClamp() {
		return this._style.lodMinClamp;
	}
	set lodMinClamp(value) {
		this._style.lodMinClamp = value;
	}
	/** Specifies the minimum and maximum levels of detail, respectively, used internally when sampling a texture. */
	get lodMaxClamp() {
		return this._style.lodMaxClamp;
	}
	set lodMaxClamp(value) {
		this._style.lodMaxClamp = value;
	}
	_onStyleChange() {
		this.emit("styleChange", this);
	}
	/** call this if you have modified the texture outside of the constructor */
	update() {
		if (this.resource) {
			const resolution = this._resolution;
			if (this.resize(this.resourceWidth / resolution, this.resourceHeight / resolution)) return;
		}
		this.emit("update", this);
	}
	/** Destroys this texture source */
	destroy() {
		this.destroyed = true;
		this.unload();
		this.emit("destroy", this);
		if (this._style) {
			if (this._ownsStyle) this._style.destroy();
			this._style = null;
		}
		this.uploadMethodId = null;
		this.resource = null;
		this.removeAllListeners();
	}
	/**
	* This will unload the Texture source from the GPU. This will free up the GPU memory
	* As soon as it is required fore rendering, it will be re-uploaded.
	*/
	unload() {
		this._resourceId = uid("resource");
		this.emit("change", this);
		this.emit("unload", this);
		for (const key in this._gpuData) this._gpuData[key]?.destroy?.();
		this._gpuData = /* @__PURE__ */ Object.create(null);
	}
	/** the width of the resource. This is the REAL pure number, not accounting resolution   */
	get resourceWidth() {
		const { resource } = this;
		return resource.naturalWidth || resource.videoWidth || resource.displayWidth || resource.width;
	}
	/** the height of the resource. This is the REAL pure number, not accounting resolution */
	get resourceHeight() {
		const { resource } = this;
		return resource.naturalHeight || resource.videoHeight || resource.displayHeight || resource.height;
	}
	/**
	* the resolution of the texture. Changing this number, will not change the number of pixels in the actual texture
	* but will the size of the texture when rendered.
	*
	* changing the resolution of this texture to 2 for example will make it appear twice as small when rendered (as pixel
	* density will have increased)
	*/
	get resolution() {
		return this._resolution;
	}
	set resolution(resolution) {
		if (this._resolution === resolution) return;
		this._resolution = resolution;
		this.width = this.pixelWidth / resolution;
		this.height = this.pixelHeight / resolution;
	}
	/**
	* Resize the texture, this is handy if you want to use the texture as a render texture
	* @param width - the new width of the texture
	* @param height - the new height of the texture
	* @param resolution - the new resolution of the texture
	* @returns - if the texture was resized
	*/
	resize(width, height, resolution) {
		resolution || (resolution = this._resolution);
		width || (width = this.width);
		height || (height = this.height);
		const newPixelWidth = Math.round(width * resolution);
		const newPixelHeight = Math.round(height * resolution);
		this.width = newPixelWidth / resolution;
		this.height = newPixelHeight / resolution;
		this._resolution = resolution;
		if (this.pixelWidth === newPixelWidth && this.pixelHeight === newPixelHeight) return false;
		this._refreshPOT();
		this.pixelWidth = newPixelWidth;
		this.pixelHeight = newPixelHeight;
		this.emit("resize", this);
		this._resourceId = uid("resource");
		this.emit("change", this);
		return true;
	}
	/**
	* Lets the renderer know that this texture has been updated and its mipmaps should be re-generated.
	* This is only important for RenderTexture instances, as standard Texture instances will have their
	* mipmaps generated on upload. You should call this method after you make any change to the texture
	*
	* The reason for this is is can be quite expensive to update mipmaps for a texture. So by default,
	* We want you, the developer to specify when this action should happen.
	*
	* Generally you don't want to have mipmaps generated on Render targets that are changed every frame,
	*/
	updateMipmaps() {
		if (this.autoGenerateMipmaps && this.mipLevelCount > 1) this.emit("updateMipmaps", this);
	}
	set wrapMode(value) {
		this._style.wrapMode = value;
	}
	get wrapMode() {
		return this._style.wrapMode;
	}
	set scaleMode(value) {
		this._style.scaleMode = value;
	}
	/** setting this will set magFilter,minFilter and mipmapFilter all at once!  */
	get scaleMode() {
		return this._style.scaleMode;
	}
	/**
	* Refresh check for isPowerOfTwo texture based on size
	* @private
	*/
	_refreshPOT() {
		this.isPowerOfTwo = isPow2(this.pixelWidth) && isPow2(this.pixelHeight);
	}
	static test(_resource) {
		throw new Error("Unimplemented");
	}
};
/** The default options used when creating a new TextureSource. override these to add your own defaults */
_TextureSource.defaultOptions = {
	resolution: 1,
	format: "bgra8unorm",
	alphaMode: "premultiply-alpha-on-upload",
	dimensions: "2d",
	viewDimension: "2d",
	arrayLayerCount: 1,
	mipLevelCount: 1,
	autoGenerateMipmaps: false,
	sampleCount: 1,
	antialias: false,
	autoGarbageCollect: false
};
var TextureSource = _TextureSource;
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/shared/texture/sources/BufferImageSource.mjs
var BufferImageSource = class extends TextureSource {
	constructor(options) {
		const buffer = options.resource || new Float32Array(options.width * options.height * 4);
		let format = options.format;
		if (!format) {
			if (buffer instanceof Float32Array) format = "rgba32float";
			else if (buffer instanceof Int32Array) format = "rgba32uint";
			else if (buffer instanceof Uint32Array) format = "rgba32uint";
			else if (buffer instanceof Int16Array) format = "rgba16uint";
			else if (buffer instanceof Uint16Array) format = "rgba16uint";
			else if (buffer instanceof Int8Array) format = "bgra8unorm";
			else format = "bgra8unorm";
		}
		super({
			...options,
			resource: buffer,
			format
		});
		this.uploadMethodId = "buffer";
	}
	static test(resource) {
		return resource instanceof Int8Array || resource instanceof Uint8Array || resource instanceof Uint8ClampedArray || resource instanceof Int16Array || resource instanceof Uint16Array || resource instanceof Int32Array || resource instanceof Uint32Array || resource instanceof Float32Array;
	}
};
BufferImageSource.extension = ExtensionType.TextureSource;
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/shared/texture/TextureMatrix.mjs
var tempMat = new Matrix();
var TextureMatrix = class {
	/**
	* @param texture - observed texture
	* @param clampMargin - Changes frame clamping, 0.5 by default. Use -0.5 for extra border.
	*/
	constructor(texture, clampMargin) {
		this.mapCoord = new Matrix();
		this.uClampFrame = /* @__PURE__ */ new Float32Array(4);
		this.uClampOffset = /* @__PURE__ */ new Float32Array(2);
		this._updateID = 0;
		this.clampOffset = 0;
		if (typeof clampMargin === "undefined") this.clampMargin = texture.width < 10 ? 0 : .5;
		else this.clampMargin = clampMargin;
		this.isSimple = false;
		this.texture = texture;
	}
	/** Texture property. */
	get texture() {
		return this._texture;
	}
	set texture(value) {
		if (this._texture !== value) {
			this._texture?.removeListener("update", this.update, this);
			this._texture = value;
			this._texture.addListener("update", this.update, this);
		}
		this.update();
	}
	/** Releases the observed texture, removing the `update` listener from it. */
	destroy() {
		this._texture?.removeListener("update", this.update, this);
		this._texture = null;
	}
	/**
	* Multiplies uvs array to transform
	* @param uvs - mesh uvs
	* @param [out=uvs] - output
	* @returns - output
	*/
	multiplyUvs(uvs, out) {
		if (out === void 0) out = uvs;
		const mat = this.mapCoord;
		for (let i = 0; i < uvs.length; i += 2) {
			const x = uvs[i];
			const y = uvs[i + 1];
			out[i] = x * mat.a + y * mat.c + mat.tx;
			out[i + 1] = x * mat.b + y * mat.d + mat.ty;
		}
		return out;
	}
	/**
	* Updates matrices if texture was changed
	* @returns - whether or not it was updated
	*/
	update() {
		const tex = this._texture;
		this._updateID++;
		const uvs = tex.uvs;
		this.mapCoord.set(uvs.x1 - uvs.x0, uvs.y1 - uvs.y0, uvs.x3 - uvs.x0, uvs.y3 - uvs.y0, uvs.x0, uvs.y0);
		const orig = tex.orig;
		const trim = tex.trim;
		if (trim) {
			tempMat.set(orig.width / trim.width, 0, 0, orig.height / trim.height, -trim.x / trim.width, -trim.y / trim.height);
			this.mapCoord.append(tempMat);
		}
		const texBase = tex.source;
		const frame = this.uClampFrame;
		const margin = this.clampMargin / texBase._resolution;
		const offset = this.clampOffset / texBase._resolution;
		frame[0] = (tex.frame.x + margin + offset) / texBase.width;
		frame[1] = (tex.frame.y + margin + offset) / texBase.height;
		frame[2] = (tex.frame.x + tex.frame.width - margin + offset) / texBase.width;
		frame[3] = (tex.frame.y + tex.frame.height - margin + offset) / texBase.height;
		this.uClampOffset[0] = this.clampOffset / texBase.pixelWidth;
		this.uClampOffset[1] = this.clampOffset / texBase.pixelHeight;
		this.isSimple = tex.frame.width === texBase.width && tex.frame.height === texBase.height && tex.rotate === 0;
		return true;
	}
};
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/shared/texture/Texture.mjs
var Texture = class extends eventemitter3_default {
	/**
	* @param {TextureOptions} options - Options for the texture
	*/
	constructor({ source, label, frame, orig, trim, defaultAnchor, defaultBorders, rotate, dynamic } = {}) {
		super();
		/** unique id for this texture */
		this.uid = uid("texture");
		/** A uvs object based on the given frame and the texture source */
		this.uvs = {
			x0: 0,
			y0: 0,
			x1: 0,
			y1: 0,
			x2: 0,
			y2: 0,
			x3: 0,
			y3: 0
		};
		/**
		* This is the area of the BaseTexture image to actually copy to the Canvas / WebGL when rendering,
		* irrespective of the actual frame size or placement (which can be influenced by trimmed texture atlases)
		*/
		this.frame = new Rectangle();
		/**
		* Does this Texture have any frame data assigned to it?
		*
		* This mode is enabled automatically if no frame was passed inside constructor.
		*
		* In this mode texture is subscribed to baseTexture events, and fires `update` on any change.
		*
		* Beware, after loading or resize of baseTexture event can fired two times!
		* If you want more control, subscribe on baseTexture itself.
		* @example
		* texture.on('update', () => {});
		*/
		this.noFrame = false;
		/**
		* Set to true if you plan on modifying the uvs of this texture.
		* When this is the case, sprites and other objects using the texture will
		* make sure to listen for changes to the uvs and update their vertices accordingly.
		*/
		this.dynamic = false;
		/** is it a texture? yes! used for type checking */
		this.isTexture = true;
		this.label = label;
		this.source = source?.source ?? new TextureSource();
		this.noFrame = !frame;
		if (frame) this.frame.copyFrom(frame);
		else {
			const { width, height } = this._source;
			this.frame.width = width;
			this.frame.height = height;
		}
		this.orig = orig || this.frame;
		this.trim = trim;
		this.rotate = rotate ?? 0;
		this.defaultAnchor = defaultAnchor;
		this.defaultBorders = defaultBorders;
		this.destroyed = false;
		this.dynamic = dynamic || false;
		this.updateUvs();
	}
	set source(value) {
		if (this._source) this._source.off("resize", this.update, this);
		this._source = value;
		value.on("resize", this.update, this);
		this.emit("update", this);
	}
	/** the underlying source of the texture (equivalent of baseTexture in v7) */
	get source() {
		return this._source;
	}
	/** returns a TextureMatrix instance for this texture. By default, that object is not created because its heavy. */
	get textureMatrix() {
		if (!this._textureMatrix) this._textureMatrix = new TextureMatrix(this);
		return this._textureMatrix;
	}
	/** The width of the Texture in pixels. */
	get width() {
		return this.orig.width;
	}
	/** The height of the Texture in pixels. */
	get height() {
		return this.orig.height;
	}
	/** Call this function when you have modified the frame of this texture. */
	updateUvs() {
		const { uvs, frame } = this;
		const { width, height } = this._source;
		const nX = frame.x / width;
		const nY = frame.y / height;
		const nW = frame.width / width;
		const nH = frame.height / height;
		let rotate = this.rotate;
		if (rotate) {
			const w2 = nW / 2;
			const h2 = nH / 2;
			const cX = nX + w2;
			const cY = nY + h2;
			rotate = groupD8.add(rotate, groupD8.NW);
			uvs.x0 = cX + w2 * groupD8.uX(rotate);
			uvs.y0 = cY + h2 * groupD8.uY(rotate);
			rotate = groupD8.add(rotate, 2);
			uvs.x1 = cX + w2 * groupD8.uX(rotate);
			uvs.y1 = cY + h2 * groupD8.uY(rotate);
			rotate = groupD8.add(rotate, 2);
			uvs.x2 = cX + w2 * groupD8.uX(rotate);
			uvs.y2 = cY + h2 * groupD8.uY(rotate);
			rotate = groupD8.add(rotate, 2);
			uvs.x3 = cX + w2 * groupD8.uX(rotate);
			uvs.y3 = cY + h2 * groupD8.uY(rotate);
		} else {
			uvs.x0 = nX;
			uvs.y0 = nY;
			uvs.x1 = nX + nW;
			uvs.y1 = nY;
			uvs.x2 = nX + nW;
			uvs.y2 = nY + nH;
			uvs.x3 = nX;
			uvs.y3 = nY + nH;
		}
	}
	/**
	* Destroys this texture
	* @param destroySource - Destroy the source when the texture is destroyed.
	*/
	destroy(destroySource = false) {
		if (this._source) {
			this._source.off("resize", this.update, this);
			if (destroySource) {
				this._source.destroy();
				this._source = null;
			}
		}
		this._textureMatrix = null;
		this.destroyed = true;
		this.emit("destroy", this);
		this.removeAllListeners();
	}
	/**
	* Call this if you have modified the `texture outside` of the constructor.
	*
	* If you have modified this texture's source, you must separately call `texture.source.update()` to see those changes.
	*/
	update() {
		if (this.noFrame) {
			this.frame.width = this._source.width;
			this.frame.height = this._source.height;
		}
		this.updateUvs();
		this.emit("update", this);
	}
	/** @deprecated since 8.0.0 */
	get baseTexture() {
		deprecation(v8_0_0, "Texture.baseTexture is now Texture.source");
		return this._source;
	}
};
Texture.EMPTY = new Texture({
	label: "EMPTY",
	source: new TextureSource({ label: "EMPTY" })
});
Texture.EMPTY.destroy = NOOP;
Texture.WHITE = new Texture({
	source: new BufferImageSource({
		resource: new Uint8Array([
			255,
			255,
			255,
			255
		]),
		width: 1,
		height: 1,
		alphaMode: "premultiply-alpha-on-upload",
		label: "WHITE"
	}),
	label: "WHITE"
});
Texture.WHITE.destroy = NOOP;
//#endregion
//#region node_modules/pixi.js/lib/scene/container/bounds/Bounds.mjs
var defaultMatrix = new Matrix();
var Bounds = class Bounds {
	/**
	* Creates a new Bounds object.
	* @param minX - The minimum X coordinate of the bounds.
	* @param minY - The minimum Y coordinate of the bounds.
	* @param maxX - The maximum X coordinate of the bounds.
	* @param maxY - The maximum Y coordinate of the bounds.
	*/
	constructor(minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity) {
		/**
		* The minimum X coordinate of the bounds.
		* Represents the leftmost edge of the bounding box.
		* @example
		* ```ts
		* const bounds = new Bounds();
		* // Set left edge
		* bounds.minX = 100;
		* ```
		* @default Infinity
		*/
		this.minX = Infinity;
		/**
		* The minimum Y coordinate of the bounds.
		* Represents the topmost edge of the bounding box.
		* @example
		* ```ts
		* const bounds = new Bounds();
		* // Set top edge
		* bounds.minY = 100;
		* ```
		* @default Infinity
		*/
		this.minY = Infinity;
		/**
		* The maximum X coordinate of the bounds.
		* Represents the rightmost edge of the bounding box.
		* @example
		* ```ts
		* const bounds = new Bounds();
		* // Set right edge
		* bounds.maxX = 200;
		* // Get width
		* const width = bounds.maxX - bounds.minX;
		* ```
		* @default -Infinity
		*/
		this.maxX = -Infinity;
		/**
		* The maximum Y coordinate of the bounds.
		* Represents the bottommost edge of the bounding box.
		* @example
		* ```ts
		* const bounds = new Bounds();
		* // Set bottom edge
		* bounds.maxY = 200;
		* // Get height
		* const height = bounds.maxY - bounds.minY;
		* ```
		* @default -Infinity
		*/
		this.maxY = -Infinity;
		/**
		* The transformation matrix applied to this bounds object.
		* Used when calculating bounds with transforms.
		* @example
		* ```ts
		* const bounds = new Bounds();
		*
		* // Apply translation matrix
		* bounds.matrix = new Matrix()
		*     .translate(100, 100);
		*
		* // Combine transformations
		* bounds.matrix = new Matrix()
		*     .translate(50, 50)
		*     .rotate(Math.PI / 4)
		*     .scale(2, 2);
		*
		* // Use in bounds calculations
		* bounds.addFrame(0, 0, 100, 100); // Uses current matrix
		* bounds.addFrame(0, 0, 100, 100, customMatrix); // Override matrix
		* ```
		* @advanced
		*/
		this.matrix = defaultMatrix;
		this.minX = minX;
		this.minY = minY;
		this.maxX = maxX;
		this.maxY = maxY;
	}
	/**
	* Checks if bounds are empty, meaning either width or height is zero or negative.
	* Empty bounds occur when min values exceed max values on either axis.
	* @example
	* ```ts
	* const bounds = new Bounds();
	*
	* // Check if newly created bounds are empty
	* console.log(bounds.isEmpty()); // true, default bounds are empty
	*
	* // Add frame and check again
	* bounds.addFrame(0, 0, 100, 100);
	* console.log(bounds.isEmpty()); // false, bounds now have area
	*
	* // Clear bounds
	* bounds.clear();
	* console.log(bounds.isEmpty()); // true, bounds are empty again
	* ```
	* @returns True if bounds are empty (have no area)
	* @see {@link Bounds#clear} For resetting bounds
	* @see {@link Bounds#isValid} For checking validity
	*/
	isEmpty() {
		return this.minX > this.maxX || this.minY > this.maxY;
	}
	/**
	* The bounding rectangle representation of these bounds.
	* Lazily creates and updates a Rectangle instance based on the current bounds.
	* @example
	* ```ts
	* const bounds = new Bounds(0, 0, 100, 100);
	*
	* // Get rectangle representation
	* const rect = bounds.rectangle;
	* console.log(rect.x, rect.y, rect.width, rect.height);
	*
	* // Use for hit testing
	* if (bounds.rectangle.contains(mouseX, mouseY)) {
	*     console.log('Mouse is inside bounds!');
	* }
	* ```
	* @see {@link Rectangle} For rectangle methods
	* @see {@link Bounds.isEmpty} For bounds validation
	*/
	get rectangle() {
		if (!this._rectangle) this._rectangle = new Rectangle();
		const rectangle = this._rectangle;
		if (this.minX > this.maxX || this.minY > this.maxY) {
			rectangle.x = 0;
			rectangle.y = 0;
			rectangle.width = 0;
			rectangle.height = 0;
		} else rectangle.copyFromBounds(this);
		return rectangle;
	}
	/**
	* Clears the bounds and resets all coordinates to their default values.
	* Resets the transformation matrix back to identity.
	* @example
	* ```ts
	* const bounds = new Bounds(0, 0, 100, 100);
	* console.log(bounds.isEmpty()); // false
	* // Clear the bounds
	* bounds.clear();
	* console.log(bounds.isEmpty()); // true
	* ```
	* @returns This bounds object for chaining
	*/
	clear() {
		this.minX = Infinity;
		this.minY = Infinity;
		this.maxX = -Infinity;
		this.maxY = -Infinity;
		this.matrix = defaultMatrix;
		return this;
	}
	/**
	* Sets the bounds directly using coordinate values.
	* Provides a way to set all bounds values at once.
	* @example
	* ```ts
	* const bounds = new Bounds();
	* bounds.set(0, 0, 100, 100);
	* ```
	* @param x0 - Left X coordinate of frame
	* @param y0 - Top Y coordinate of frame
	* @param x1 - Right X coordinate of frame
	* @param y1 - Bottom Y coordinate of frame
	* @see {@link Bounds#addFrame} For matrix-aware bounds setting
	* @see {@link Bounds#clear} For resetting bounds
	*/
	set(x0, y0, x1, y1) {
		this.minX = x0;
		this.minY = y0;
		this.maxX = x1;
		this.maxY = y1;
	}
	/**
	* Adds a rectangular frame to the bounds, optionally transformed by a matrix.
	* Updates the bounds to encompass the new frame coordinates.
	* @example
	* ```ts
	* const bounds = new Bounds();
	* bounds.addFrame(0, 0, 100, 100);
	*
	* // Add transformed frame
	* const matrix = new Matrix()
	*     .translate(50, 50)
	*     .rotate(Math.PI / 4);
	* bounds.addFrame(0, 0, 100, 100, matrix);
	* ```
	* @param x0 - Left X coordinate of frame
	* @param y0 - Top Y coordinate of frame
	* @param x1 - Right X coordinate of frame
	* @param y1 - Bottom Y coordinate of frame
	* @param matrix - Optional transformation matrix
	* @see {@link Bounds#addRect} For adding Rectangle objects
	* @see {@link Bounds#addBounds} For adding other Bounds
	*/
	addFrame(x0, y0, x1, y1, matrix) {
		matrix || (matrix = this.matrix);
		const a = matrix.a;
		const b = matrix.b;
		const c = matrix.c;
		const d = matrix.d;
		const tx = matrix.tx;
		const ty = matrix.ty;
		let minX = this.minX;
		let minY = this.minY;
		let maxX = this.maxX;
		let maxY = this.maxY;
		let x = a * x0 + c * y0 + tx;
		let y = b * x0 + d * y0 + ty;
		if (x < minX) minX = x;
		if (y < minY) minY = y;
		if (x > maxX) maxX = x;
		if (y > maxY) maxY = y;
		x = a * x1 + c * y0 + tx;
		y = b * x1 + d * y0 + ty;
		if (x < minX) minX = x;
		if (y < minY) minY = y;
		if (x > maxX) maxX = x;
		if (y > maxY) maxY = y;
		x = a * x0 + c * y1 + tx;
		y = b * x0 + d * y1 + ty;
		if (x < minX) minX = x;
		if (y < minY) minY = y;
		if (x > maxX) maxX = x;
		if (y > maxY) maxY = y;
		x = a * x1 + c * y1 + tx;
		y = b * x1 + d * y1 + ty;
		if (x < minX) minX = x;
		if (y < minY) minY = y;
		if (x > maxX) maxX = x;
		if (y > maxY) maxY = y;
		this.minX = minX;
		this.minY = minY;
		this.maxX = maxX;
		this.maxY = maxY;
	}
	/**
	* Adds a rectangle to the bounds, optionally transformed by a matrix.
	* Updates the bounds to encompass the given rectangle.
	* @example
	* ```ts
	* const bounds = new Bounds();
	* // Add simple rectangle
	* const rect = new Rectangle(0, 0, 100, 100);
	* bounds.addRect(rect);
	*
	* // Add transformed rectangle
	* const matrix = new Matrix()
	*     .translate(50, 50)
	*     .rotate(Math.PI / 4);
	* bounds.addRect(rect, matrix);
	* ```
	* @param rect - The rectangle to be added
	* @param matrix - Optional transformation matrix
	* @see {@link Bounds#addFrame} For adding raw coordinates
	* @see {@link Bounds#addBounds} For adding other bounds
	*/
	addRect(rect, matrix) {
		this.addFrame(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height, matrix);
	}
	/**
	* Adds another bounds object to this one, optionally transformed by a matrix.
	* Expands the bounds to include the given bounds' area.
	* @example
	* ```ts
	* const bounds = new Bounds();
	*
	* // Add child bounds
	* const childBounds = sprite.getBounds();
	* bounds.addBounds(childBounds);
	*
	* // Add transformed bounds
	* const matrix = new Matrix()
	*     .scale(2, 2);
	* bounds.addBounds(childBounds, matrix);
	* ```
	* @param bounds - The bounds to be added
	* @param matrix - Optional transformation matrix
	* @see {@link Bounds#addFrame} For adding raw coordinates
	* @see {@link Bounds#addRect} For adding rectangles
	*/
	addBounds(bounds, matrix) {
		this.addFrame(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, matrix);
	}
	/**
	* Adds other Bounds as a mask, creating an intersection of the two bounds.
	* Only keeps the overlapping region between current bounds and mask bounds.
	* @example
	* ```ts
	* const bounds = new Bounds(0, 0, 100, 100);
	* // Create mask bounds
	* const mask = new Bounds();
	* mask.addFrame(50, 50, 150, 150);
	* // Apply mask - results in bounds of (50,50,100,100)
	* bounds.addBoundsMask(mask);
	* ```
	* @param mask - The Bounds to use as a mask
	* @see {@link Bounds#addBounds} For union operation
	* @see {@link Bounds#fit} For fitting to rectangle
	*/
	addBoundsMask(mask) {
		this.minX = this.minX > mask.minX ? this.minX : mask.minX;
		this.minY = this.minY > mask.minY ? this.minY : mask.minY;
		this.maxX = this.maxX < mask.maxX ? this.maxX : mask.maxX;
		this.maxY = this.maxY < mask.maxY ? this.maxY : mask.maxY;
	}
	/**
	* Applies a transformation matrix to the bounds, updating its coordinates.
	* Transforms all corners of the bounds using the given matrix.
	* @example
	* ```ts
	* const bounds = new Bounds(0, 0, 100, 100);
	* // Apply translation
	* const translateMatrix = new Matrix()
	*     .translate(50, 50);
	* bounds.applyMatrix(translateMatrix);
	* ```
	* @param matrix - The matrix to apply to the bounds
	* @see {@link Matrix} For matrix operations
	* @see {@link Bounds#addFrame} For adding transformed frames
	*/
	applyMatrix(matrix) {
		const minX = this.minX;
		const minY = this.minY;
		const maxX = this.maxX;
		const maxY = this.maxY;
		const { a, b, c, d, tx, ty } = matrix;
		let x = a * minX + c * minY + tx;
		let y = b * minX + d * minY + ty;
		this.minX = x;
		this.minY = y;
		this.maxX = x;
		this.maxY = y;
		x = a * maxX + c * minY + tx;
		y = b * maxX + d * minY + ty;
		this.minX = x < this.minX ? x : this.minX;
		this.minY = y < this.minY ? y : this.minY;
		this.maxX = x > this.maxX ? x : this.maxX;
		this.maxY = y > this.maxY ? y : this.maxY;
		x = a * minX + c * maxY + tx;
		y = b * minX + d * maxY + ty;
		this.minX = x < this.minX ? x : this.minX;
		this.minY = y < this.minY ? y : this.minY;
		this.maxX = x > this.maxX ? x : this.maxX;
		this.maxY = y > this.maxY ? y : this.maxY;
		x = a * maxX + c * maxY + tx;
		y = b * maxX + d * maxY + ty;
		this.minX = x < this.minX ? x : this.minX;
		this.minY = y < this.minY ? y : this.minY;
		this.maxX = x > this.maxX ? x : this.maxX;
		this.maxY = y > this.maxY ? y : this.maxY;
	}
	/**
	* Resizes the bounds object to fit within the given rectangle.
	* Clips the bounds if they extend beyond the rectangle's edges.
	* @example
	* ```ts
	* const bounds = new Bounds(0, 0, 200, 200);
	* // Fit within viewport
	* const viewport = new Rectangle(50, 50, 100, 100);
	* bounds.fit(viewport);
	* // bounds are now (50, 50, 150, 150)
	* ```
	* @param rect - The rectangle to fit within
	* @returns This bounds object for chaining
	* @see {@link Bounds#addBoundsMask} For intersection
	* @see {@link Bounds#pad} For expanding bounds
	*/
	fit(rect) {
		if (this.minX < rect.left) this.minX = rect.left;
		if (this.maxX > rect.right) this.maxX = rect.right;
		if (this.minY < rect.top) this.minY = rect.top;
		if (this.maxY > rect.bottom) this.maxY = rect.bottom;
		return this;
	}
	/**
	* Resizes the bounds object to include the given bounds.
	* Similar to fit() but works with raw coordinate values instead of a Rectangle.
	* @example
	* ```ts
	* const bounds = new Bounds(0, 0, 200, 200);
	* // Fit to specific coordinates
	* bounds.fitBounds(50, 150, 50, 150);
	* // bounds are now (50, 50, 150, 150)
	* ```
	* @param left - The left value of the bounds
	* @param right - The right value of the bounds
	* @param top - The top value of the bounds
	* @param bottom - The bottom value of the bounds
	* @returns This bounds object for chaining
	* @see {@link Bounds#fit} For fitting to Rectangle
	* @see {@link Bounds#addBoundsMask} For intersection
	*/
	fitBounds(left, right, top, bottom) {
		if (this.minX < left) this.minX = left;
		if (this.maxX > right) this.maxX = right;
		if (this.minY < top) this.minY = top;
		if (this.maxY > bottom) this.maxY = bottom;
		return this;
	}
	/**
	* Pads bounds object, making it grow in all directions.
	* If paddingY is omitted, both paddingX and paddingY will be set to paddingX.
	* @example
	* ```ts
	* const bounds = new Bounds(0, 0, 100, 100);
	*
	* // Add equal padding
	* bounds.pad(10);
	* // bounds are now (-10, -10, 110, 110)
	*
	* // Add different padding for x and y
	* bounds.pad(20, 10);
	* // bounds are now (-30, -20, 130, 120)
	* ```
	* @param paddingX - The horizontal padding amount
	* @param paddingY - The vertical padding amount
	* @returns This bounds object for chaining
	* @see {@link Bounds#fit} For constraining bounds
	* @see {@link Bounds#scale} For uniform scaling
	*/
	pad(paddingX, paddingY = paddingX) {
		this.minX -= paddingX;
		this.maxX += paddingX;
		this.minY -= paddingY;
		this.maxY += paddingY;
		return this;
	}
	/**
	* Ceils the bounds by rounding up max values and rounding down min values.
	* Useful for pixel-perfect calculations and avoiding fractional pixels.
	* @example
	* ```ts
	* const bounds = new Bounds();
	* bounds.set(10.2, 10.9, 50.1, 50.8);
	*
	* // Round to whole pixels
	* bounds.ceil();
	* // bounds are now (10, 10, 51, 51)
	* ```
	* @returns This bounds object for chaining
	* @see {@link Bounds#scale} For size adjustments
	* @see {@link Bounds#fit} For constraining bounds
	*/
	ceil() {
		this.minX = Math.floor(this.minX);
		this.minY = Math.floor(this.minY);
		this.maxX = Math.ceil(this.maxX);
		this.maxY = Math.ceil(this.maxY);
		return this;
	}
	/**
	* Creates a new Bounds instance with the same values.
	* @example
	* ```ts
	* const bounds = new Bounds(0, 0, 100, 100);
	*
	* // Create a copy
	* const copy = bounds.clone();
	*
	* // Original and copy are independent
	* bounds.pad(10);
	* console.log(copy.width === bounds.width); // false
	* ```
	* @returns A new Bounds instance with the same values
	* @see {@link Bounds#copyFrom} For reusing existing bounds
	*/
	clone() {
		return new Bounds(this.minX, this.minY, this.maxX, this.maxY);
	}
	/**
	* Scales the bounds by the given values, adjusting all edges proportionally.
	* @example
	* ```ts
	* const bounds = new Bounds(0, 0, 100, 100);
	*
	* // Scale uniformly
	* bounds.scale(2);
	* // bounds are now (0, 0, 200, 200)
	*
	* // Scale non-uniformly
	* bounds.scale(0.5, 2);
	* // bounds are now (0, 0, 100, 400)
	* ```
	* @param x - The X value to scale by
	* @param y - The Y value to scale by (defaults to x)
	* @returns This bounds object for chaining
	* @see {@link Bounds#pad} For adding padding
	* @see {@link Bounds#fit} For constraining size
	*/
	scale(x, y = x) {
		this.minX *= x;
		this.minY *= y;
		this.maxX *= x;
		this.maxY *= y;
		return this;
	}
	/**
	* The x position of the bounds in local space.
	* Setting this value will move the bounds while maintaining its width.
	* @example
	* ```ts
	* const bounds = new Bounds(0, 0, 100, 100);
	* // Get x position
	* console.log(bounds.x); // 0
	*
	* // Move bounds horizontally
	* bounds.x = 50;
	* console.log(bounds.minX, bounds.maxX); // 50, 150
	*
	* // Width stays the same
	* console.log(bounds.width); // Still 100
	* ```
	*/
	get x() {
		return this.minX;
	}
	set x(value) {
		const width = this.maxX - this.minX;
		this.minX = value;
		this.maxX = value + width;
	}
	/**
	* The y position of the bounds in local space.
	* Setting this value will move the bounds while maintaining its height.
	* @example
	* ```ts
	* const bounds = new Bounds(0, 0, 100, 100);
	* // Get y position
	* console.log(bounds.y); // 0
	*
	* // Move bounds vertically
	* bounds.y = 50;
	* console.log(bounds.minY, bounds.maxY); // 50, 150
	*
	* // Height stays the same
	* console.log(bounds.height); // Still 100
	* ```
	*/
	get y() {
		return this.minY;
	}
	set y(value) {
		const height = this.maxY - this.minY;
		this.minY = value;
		this.maxY = value + height;
	}
	/**
	* The width value of the bounds.
	* Represents the distance between minX and maxX coordinates.
	* @example
	* ```ts
	* const bounds = new Bounds(0, 0, 100, 100);
	* // Get width
	* console.log(bounds.width); // 100
	* // Resize width
	* bounds.width = 200;
	* console.log(bounds.maxX - bounds.minX); // 200
	* ```
	*/
	get width() {
		return this.maxX - this.minX;
	}
	set width(value) {
		this.maxX = this.minX + value;
	}
	/**
	* The height value of the bounds.
	* Represents the distance between minY and maxY coordinates.
	* @example
	* ```ts
	* const bounds = new Bounds(0, 0, 100, 100);
	* // Get height
	* console.log(bounds.height); // 100
	* // Resize height
	* bounds.height = 150;
	* console.log(bounds.maxY - bounds.minY); // 150
	* ```
	*/
	get height() {
		return this.maxY - this.minY;
	}
	set height(value) {
		this.maxY = this.minY + value;
	}
	/**
	* The left edge coordinate of the bounds.
	* Alias for minX.
	* @example
	* ```ts
	* const bounds = new Bounds(50, 0, 150, 100);
	* console.log(bounds.left); // 50
	* console.log(bounds.left === bounds.minX); // true
	* ```
	* @readonly
	*/
	get left() {
		return this.minX;
	}
	/**
	* The right edge coordinate of the bounds.
	* Alias for maxX.
	* @example
	* ```ts
	* const bounds = new Bounds(0, 0, 100, 100);
	* console.log(bounds.right); // 100
	* console.log(bounds.right === bounds.maxX); // true
	* ```
	* @readonly
	*/
	get right() {
		return this.maxX;
	}
	/**
	* The top edge coordinate of the bounds.
	* Alias for minY.
	* @example
	* ```ts
	* const bounds = new Bounds(0, 25, 100, 125);
	* console.log(bounds.top); // 25
	* console.log(bounds.top === bounds.minY); // true
	* ```
	* @readonly
	*/
	get top() {
		return this.minY;
	}
	/**
	* The bottom edge coordinate of the bounds.
	* Alias for maxY.
	* @example
	* ```ts
	* const bounds = new Bounds(0, 0, 100, 200);
	* console.log(bounds.bottom); // 200
	* console.log(bounds.bottom === bounds.maxY); // true
	* ```
	* @readonly
	*/
	get bottom() {
		return this.maxY;
	}
	/**
	* Whether the bounds has positive width and height.
	* Checks if both dimensions are greater than zero.
	* @example
	* ```ts
	* const bounds = new Bounds(0, 0, 100, 100);
	* // Check if bounds are positive
	* console.log(bounds.isPositive); // true
	*
	* // Negative bounds
	* bounds.maxX = bounds.minX;
	* console.log(bounds.isPositive); // false, width is 0
	* ```
	* @readonly
	* @see {@link Bounds#isEmpty} For checking empty state
	* @see {@link Bounds#isValid} For checking validity
	*/
	get isPositive() {
		return this.maxX - this.minX > 0 && this.maxY - this.minY > 0;
	}
	/**
	* Whether the bounds has valid coordinates.
	* Checks if the bounds has been initialized with real values.
	* @example
	* ```ts
	* const bounds = new Bounds();
	* console.log(bounds.isValid); // false, default state
	*
	* // Set valid bounds
	* bounds.addFrame(0, 0, 100, 100);
	* console.log(bounds.isValid); // true
	* ```
	* @readonly
	* @see {@link Bounds#isEmpty} For checking empty state
	* @see {@link Bounds#isPositive} For checking dimensions
	*/
	get isValid() {
		return this.minX + this.minY !== Infinity;
	}
	/**
	* Adds vertices from a Float32Array to the bounds, optionally transformed by a matrix.
	* Used for efficiently updating bounds from raw vertex data.
	* @example
	* ```ts
	* const bounds = new Bounds();
	*
	* // Add vertices from geometry
	* const vertices = new Float32Array([
	*     0, 0,    // Vertex 1
	*     100, 0,  // Vertex 2
	*     100, 100 // Vertex 3
	* ]);
	* bounds.addVertexData(vertices, 0, 6);
	*
	* // Add transformed vertices
	* const matrix = new Matrix()
	*     .translate(50, 50)
	*     .rotate(Math.PI / 4);
	* bounds.addVertexData(vertices, 0, 6, matrix);
	*
	* // Add subset of vertices
	* bounds.addVertexData(vertices, 2, 4); // Only second vertex
	* ```
	* @param vertexData - The array of vertices to add
	* @param beginOffset - Starting index in the vertex array
	* @param endOffset - Ending index in the vertex array (excluded)
	* @param matrix - Optional transformation matrix
	* @see {@link Bounds#addFrame} For adding rectangular frames
	* @see {@link Matrix} For transformation details
	*/
	addVertexData(vertexData, beginOffset, endOffset, matrix) {
		let minX = this.minX;
		let minY = this.minY;
		let maxX = this.maxX;
		let maxY = this.maxY;
		matrix || (matrix = this.matrix);
		const a = matrix.a;
		const b = matrix.b;
		const c = matrix.c;
		const d = matrix.d;
		const tx = matrix.tx;
		const ty = matrix.ty;
		for (let i = beginOffset; i < endOffset; i += 2) {
			const localX = vertexData[i];
			const localY = vertexData[i + 1];
			const x = a * localX + c * localY + tx;
			const y = b * localX + d * localY + ty;
			minX = x < minX ? x : minX;
			minY = y < minY ? y : minY;
			maxX = x > maxX ? x : maxX;
			maxY = y > maxY ? y : maxY;
		}
		this.minX = minX;
		this.minY = minY;
		this.maxX = maxX;
		this.maxY = maxY;
	}
	/**
	* Checks if a point is contained within the bounds.
	* Returns true if the point's coordinates fall within the bounds' area.
	* @example
	* ```ts
	* const bounds = new Bounds(0, 0, 100, 100);
	* // Basic point check
	* console.log(bounds.containsPoint(50, 50)); // true
	* console.log(bounds.containsPoint(150, 150)); // false
	*
	* // Check edges
	* console.log(bounds.containsPoint(0, 0));   // true, includes edges
	* console.log(bounds.containsPoint(100, 100)); // true, includes edges
	* ```
	* @param x - x coordinate to check
	* @param y - y coordinate to check
	* @returns True if the point is inside the bounds
	* @see {@link Bounds#isPositive} For valid bounds check
	* @see {@link Bounds#rectangle} For Rectangle representation
	*/
	containsPoint(x, y) {
		if (this.minX <= x && this.minY <= y && this.maxX >= x && this.maxY >= y) return true;
		return false;
	}
	/**
	* Returns a string representation of the bounds.
	* Useful for debugging and logging bounds information.
	* @example
	* ```ts
	* const bounds = new Bounds(0, 0, 100, 100);
	* console.log(bounds.toString()); // "[pixi.js:Bounds minX=0 minY=0 maxX=100 maxY=100 width=100 height=100]"
	* ```
	* @returns A string describing the bounds
	* @see {@link Bounds#copyFrom} For copying bounds
	* @see {@link Bounds#clone} For creating a new instance
	*/
	toString() {
		return `[pixi.js:Bounds minX=${this.minX} minY=${this.minY} maxX=${this.maxX} maxY=${this.maxY} width=${this.width} height=${this.height}]`;
	}
	/**
	* Copies the bounds from another bounds object.
	* Useful for reusing bounds objects and avoiding allocations.
	* @example
	* ```ts
	* const sourceBounds = new Bounds(0, 0, 100, 100);
	* // Copy bounds
	* const targetBounds = new Bounds();
	* targetBounds.copyFrom(sourceBounds);
	* ```
	* @param bounds - The bounds to copy from
	* @returns This bounds object for chaining
	* @see {@link Bounds#clone} For creating new instances
	*/
	copyFrom(bounds) {
		this.minX = bounds.minX;
		this.minY = bounds.minY;
		this.maxX = bounds.maxX;
		this.maxY = bounds.maxY;
		return this;
	}
};
//#endregion
//#region node_modules/@pixi/colord/index.mjs
var r = {
	grad: .9,
	turn: 360,
	rad: 360 / (2 * Math.PI)
};
var t = function(r) {
	return "string" == typeof r ? r.length > 0 : "number" == typeof r;
};
var n = function(r, t, n) {
	return void 0 === t && (t = 0), void 0 === n && (n = Math.pow(10, t)), Math.round(n * r) / n + 0;
};
var e = function(r, t, n) {
	return void 0 === t && (t = 0), void 0 === n && (n = 1), r > n ? n : r > t ? r : t;
};
var u = function(r) {
	return (r = isFinite(r) ? r % 360 : 0) > 0 ? r : r + 360;
};
var a = function(r) {
	return {
		r: e(r.r, 0, 255),
		g: e(r.g, 0, 255),
		b: e(r.b, 0, 255),
		a: e(r.a)
	};
};
var o = function(r) {
	return {
		r: n(r.r),
		g: n(r.g),
		b: n(r.b),
		a: n(r.a, 3)
	};
};
var i = /^#([0-9a-f]{3,8})$/i;
var s = function(r) {
	var t = r.toString(16);
	return t.length < 2 ? "0" + t : t;
};
var h = function(r) {
	var t = r.r, n = r.g, e = r.b, u = r.a, a = Math.max(t, n, e), o = a - Math.min(t, n, e), i = o ? a === t ? (n - e) / o : a === n ? 2 + (e - t) / o : 4 + (t - n) / o : 0;
	return {
		h: 60 * (i < 0 ? i + 6 : i),
		s: a ? o / a * 100 : 0,
		v: a / 255 * 100,
		a: u
	};
};
var b = function(r) {
	var t = r.h, n = r.s, e = r.v, u = r.a;
	t = t / 360 * 6, n /= 100, e /= 100;
	var a = Math.floor(t), o = e * (1 - n), i = e * (1 - (t - a) * n), s = e * (1 - (1 - t + a) * n), h = a % 6;
	return {
		r: 255 * [
			e,
			i,
			o,
			o,
			s,
			e
		][h],
		g: 255 * [
			s,
			e,
			e,
			i,
			o,
			o
		][h],
		b: 255 * [
			o,
			o,
			s,
			e,
			e,
			i
		][h],
		a: u
	};
};
var g = function(r) {
	return {
		h: u(r.h),
		s: e(r.s, 0, 100),
		l: e(r.l, 0, 100),
		a: e(r.a)
	};
};
var d = function(r) {
	return {
		h: n(r.h),
		s: n(r.s),
		l: n(r.l),
		a: n(r.a, 3)
	};
};
var f = function(r) {
	return b((n = (t = r).s, {
		h: t.h,
		s: (n *= ((e = t.l) < 50 ? e : 100 - e) / 100) > 0 ? 2 * n / (e + n) * 100 : 0,
		v: e + n,
		a: t.a
	}));
	var t, n, e;
};
var c = function(r) {
	return {
		h: (t = h(r)).h,
		s: (u = (200 - (n = t.s)) * (e = t.v) / 100) > 0 && u < 200 ? n * e / 100 / (u <= 100 ? u : 200 - u) * 100 : 0,
		l: u / 2,
		a: t.a
	};
	var t, n, e, u;
};
var l = /^hsla?\(\s*([+-]?\d*\.?\d+)(deg|rad|grad|turn)?\s*,\s*([+-]?\d*\.?\d+)%\s*,\s*([+-]?\d*\.?\d+)%\s*(?:,\s*([+-]?\d*\.?\d+)(%)?\s*)?\)$/i;
var p = /^hsla?\(\s*([+-]?\d*\.?\d+)(deg|rad|grad|turn)?\s+([+-]?\d*\.?\d+)%\s+([+-]?\d*\.?\d+)%\s*(?:\/\s*([+-]?\d*\.?\d+)(%)?\s*)?\)$/i;
var v = /^rgba?\(\s*([+-]?\d*\.?\d+)(%)?\s*,\s*([+-]?\d*\.?\d+)(%)?\s*,\s*([+-]?\d*\.?\d+)(%)?\s*(?:,\s*([+-]?\d*\.?\d+)(%)?\s*)?\)$/i;
var m = /^rgba?\(\s*([+-]?\d*\.?\d+)(%)?\s+([+-]?\d*\.?\d+)(%)?\s+([+-]?\d*\.?\d+)(%)?\s*(?:\/\s*([+-]?\d*\.?\d+)(%)?\s*)?\)$/i;
var y = {
	string: [
		[function(r) {
			var t = i.exec(r);
			return t ? (r = t[1]).length <= 4 ? {
				r: parseInt(r[0] + r[0], 16),
				g: parseInt(r[1] + r[1], 16),
				b: parseInt(r[2] + r[2], 16),
				a: 4 === r.length ? n(parseInt(r[3] + r[3], 16) / 255, 2) : 1
			} : 6 === r.length || 8 === r.length ? {
				r: parseInt(r.substr(0, 2), 16),
				g: parseInt(r.substr(2, 2), 16),
				b: parseInt(r.substr(4, 2), 16),
				a: 8 === r.length ? n(parseInt(r.substr(6, 2), 16) / 255, 2) : 1
			} : null : null;
		}, "hex"],
		[function(r) {
			var t = v.exec(r) || m.exec(r);
			return t ? t[2] !== t[4] || t[4] !== t[6] ? null : a({
				r: Number(t[1]) / (t[2] ? 100 / 255 : 1),
				g: Number(t[3]) / (t[4] ? 100 / 255 : 1),
				b: Number(t[5]) / (t[6] ? 100 / 255 : 1),
				a: void 0 === t[7] ? 1 : Number(t[7]) / (t[8] ? 100 : 1)
			}) : null;
		}, "rgb"],
		[function(t) {
			var n = l.exec(t) || p.exec(t);
			if (!n) return null;
			var e, u;
			return f(g({
				h: (e = n[1], u = n[2], void 0 === u && (u = "deg"), Number(e) * (r[u] || 1)),
				s: Number(n[3]),
				l: Number(n[4]),
				a: void 0 === n[5] ? 1 : Number(n[5]) / (n[6] ? 100 : 1)
			}));
		}, "hsl"]
	],
	object: [
		[function(r) {
			var n = r.r, e = r.g, u = r.b, o = r.a, i = void 0 === o ? 1 : o;
			return t(n) && t(e) && t(u) ? a({
				r: Number(n),
				g: Number(e),
				b: Number(u),
				a: Number(i)
			}) : null;
		}, "rgb"],
		[function(r) {
			var n = r.h, e = r.s, u = r.l, a = r.a, o = void 0 === a ? 1 : a;
			if (!t(n) || !t(e) || !t(u)) return null;
			return f(g({
				h: Number(n),
				s: Number(e),
				l: Number(u),
				a: Number(o)
			}));
		}, "hsl"],
		[function(r) {
			var n = r.h, a = r.s, o = r.v, i = r.a, s = void 0 === i ? 1 : i;
			if (!t(n) || !t(a) || !t(o)) return null;
			return b(function(r) {
				return {
					h: u(r.h),
					s: e(r.s, 0, 100),
					v: e(r.v, 0, 100),
					a: e(r.a)
				};
			}({
				h: Number(n),
				s: Number(a),
				v: Number(o),
				a: Number(s)
			}));
		}, "hsv"]
	]
};
var N = function(r, t) {
	for (var n = 0; n < t.length; n++) {
		var e = t[n][0](r);
		if (e) return [e, t[n][1]];
	}
	return [null, void 0];
};
var x = function(r) {
	return "string" == typeof r ? N(r.trim(), y.string) : "object" == typeof r && null !== r ? N(r, y.object) : [null, void 0];
};
var M = function(r, t) {
	var n = c(r);
	return {
		h: n.h,
		s: e(n.s + 100 * t, 0, 100),
		l: n.l,
		a: n.a
	};
};
var H = function(r) {
	return (299 * r.r + 587 * r.g + 114 * r.b) / 1e3 / 255;
};
var $ = function(r, t) {
	var n = c(r);
	return {
		h: n.h,
		s: n.s,
		l: e(n.l + 100 * t, 0, 100),
		a: n.a
	};
};
var j = function() {
	function r(r) {
		this.parsed = x(r)[0], this.rgba = this.parsed || {
			r: 0,
			g: 0,
			b: 0,
			a: 1
		};
	}
	return r.prototype.isValid = function() {
		return null !== this.parsed;
	}, r.prototype.brightness = function() {
		return n(H(this.rgba), 2);
	}, r.prototype.isDark = function() {
		return H(this.rgba) < .5;
	}, r.prototype.isLight = function() {
		return H(this.rgba) >= .5;
	}, r.prototype.toHex = function() {
		return r = o(this.rgba), t = r.r, e = r.g, u = r.b, i = (a = r.a) < 1 ? s(n(255 * a)) : "", "#" + s(t) + s(e) + s(u) + i;
		var r, t, e, u, a, i;
	}, r.prototype.toRgb = function() {
		return o(this.rgba);
	}, r.prototype.toRgbString = function() {
		return r = o(this.rgba), t = r.r, n = r.g, e = r.b, (u = r.a) < 1 ? "rgba(" + t + ", " + n + ", " + e + ", " + u + ")" : "rgb(" + t + ", " + n + ", " + e + ")";
		var r, t, n, e, u;
	}, r.prototype.toHsl = function() {
		return d(c(this.rgba));
	}, r.prototype.toHslString = function() {
		return r = d(c(this.rgba)), t = r.h, n = r.s, e = r.l, (u = r.a) < 1 ? "hsla(" + t + ", " + n + "%, " + e + "%, " + u + ")" : "hsl(" + t + ", " + n + "%, " + e + "%)";
		var r, t, n, e, u;
	}, r.prototype.toHsv = function() {
		return r = h(this.rgba), {
			h: n(r.h),
			s: n(r.s),
			v: n(r.v),
			a: n(r.a, 3)
		};
		var r;
	}, r.prototype.invert = function() {
		return w({
			r: 255 - (r = this.rgba).r,
			g: 255 - r.g,
			b: 255 - r.b,
			a: r.a
		});
		var r;
	}, r.prototype.saturate = function(r) {
		return void 0 === r && (r = .1), w(M(this.rgba, r));
	}, r.prototype.desaturate = function(r) {
		return void 0 === r && (r = .1), w(M(this.rgba, -r));
	}, r.prototype.grayscale = function() {
		return w(M(this.rgba, -1));
	}, r.prototype.lighten = function(r) {
		return void 0 === r && (r = .1), w($(this.rgba, r));
	}, r.prototype.darken = function(r) {
		return void 0 === r && (r = .1), w($(this.rgba, -r));
	}, r.prototype.rotate = function(r) {
		return void 0 === r && (r = 15), this.hue(this.hue() + r);
	}, r.prototype.alpha = function(r) {
		return "number" == typeof r ? w({
			r: (t = this.rgba).r,
			g: t.g,
			b: t.b,
			a: r
		}) : n(this.rgba.a, 3);
		var t;
	}, r.prototype.hue = function(r) {
		var t = c(this.rgba);
		return "number" == typeof r ? w({
			h: r,
			s: t.s,
			l: t.l,
			a: t.a
		}) : n(t.h);
	}, r.prototype.isEqual = function(r) {
		return this.toHex() === w(r).toHex();
	}, r;
}();
var w = function(r) {
	return r instanceof j ? r : new j(r);
};
var S = [];
var k = function(r) {
	r.forEach(function(r) {
		S.indexOf(r) < 0 && (r(j, y), S.push(r));
	});
};
//#endregion
//#region node_modules/@pixi/colord/plugins/names.mjs
function names_default(e, f) {
	var a = {
		white: "#ffffff",
		bisque: "#ffe4c4",
		blue: "#0000ff",
		cadetblue: "#5f9ea0",
		chartreuse: "#7fff00",
		chocolate: "#d2691e",
		coral: "#ff7f50",
		antiquewhite: "#faebd7",
		aqua: "#00ffff",
		azure: "#f0ffff",
		whitesmoke: "#f5f5f5",
		papayawhip: "#ffefd5",
		plum: "#dda0dd",
		blanchedalmond: "#ffebcd",
		black: "#000000",
		gold: "#ffd700",
		goldenrod: "#daa520",
		gainsboro: "#dcdcdc",
		cornsilk: "#fff8dc",
		cornflowerblue: "#6495ed",
		burlywood: "#deb887",
		aquamarine: "#7fffd4",
		beige: "#f5f5dc",
		crimson: "#dc143c",
		cyan: "#00ffff",
		darkblue: "#00008b",
		darkcyan: "#008b8b",
		darkgoldenrod: "#b8860b",
		darkkhaki: "#bdb76b",
		darkgray: "#a9a9a9",
		darkgreen: "#006400",
		darkgrey: "#a9a9a9",
		peachpuff: "#ffdab9",
		darkmagenta: "#8b008b",
		darkred: "#8b0000",
		darkorchid: "#9932cc",
		darkorange: "#ff8c00",
		darkslateblue: "#483d8b",
		gray: "#808080",
		darkslategray: "#2f4f4f",
		darkslategrey: "#2f4f4f",
		deeppink: "#ff1493",
		deepskyblue: "#00bfff",
		wheat: "#f5deb3",
		firebrick: "#b22222",
		floralwhite: "#fffaf0",
		ghostwhite: "#f8f8ff",
		darkviolet: "#9400d3",
		magenta: "#ff00ff",
		green: "#008000",
		dodgerblue: "#1e90ff",
		grey: "#808080",
		honeydew: "#f0fff0",
		hotpink: "#ff69b4",
		blueviolet: "#8a2be2",
		forestgreen: "#228b22",
		lawngreen: "#7cfc00",
		indianred: "#cd5c5c",
		indigo: "#4b0082",
		fuchsia: "#ff00ff",
		brown: "#a52a2a",
		maroon: "#800000",
		mediumblue: "#0000cd",
		lightcoral: "#f08080",
		darkturquoise: "#00ced1",
		lightcyan: "#e0ffff",
		ivory: "#fffff0",
		lightyellow: "#ffffe0",
		lightsalmon: "#ffa07a",
		lightseagreen: "#20b2aa",
		linen: "#faf0e6",
		mediumaquamarine: "#66cdaa",
		lemonchiffon: "#fffacd",
		lime: "#00ff00",
		khaki: "#f0e68c",
		mediumseagreen: "#3cb371",
		limegreen: "#32cd32",
		mediumspringgreen: "#00fa9a",
		lightskyblue: "#87cefa",
		lightblue: "#add8e6",
		midnightblue: "#191970",
		lightpink: "#ffb6c1",
		mistyrose: "#ffe4e1",
		moccasin: "#ffe4b5",
		mintcream: "#f5fffa",
		lightslategray: "#778899",
		lightslategrey: "#778899",
		navajowhite: "#ffdead",
		navy: "#000080",
		mediumvioletred: "#c71585",
		powderblue: "#b0e0e6",
		palegoldenrod: "#eee8aa",
		oldlace: "#fdf5e6",
		paleturquoise: "#afeeee",
		mediumturquoise: "#48d1cc",
		mediumorchid: "#ba55d3",
		rebeccapurple: "#663399",
		lightsteelblue: "#b0c4de",
		mediumslateblue: "#7b68ee",
		thistle: "#d8bfd8",
		tan: "#d2b48c",
		orchid: "#da70d6",
		mediumpurple: "#9370db",
		purple: "#800080",
		pink: "#ffc0cb",
		skyblue: "#87ceeb",
		springgreen: "#00ff7f",
		palegreen: "#98fb98",
		red: "#ff0000",
		yellow: "#ffff00",
		slateblue: "#6a5acd",
		lavenderblush: "#fff0f5",
		peru: "#cd853f",
		palevioletred: "#db7093",
		violet: "#ee82ee",
		teal: "#008080",
		slategray: "#708090",
		slategrey: "#708090",
		aliceblue: "#f0f8ff",
		darkseagreen: "#8fbc8f",
		darkolivegreen: "#556b2f",
		greenyellow: "#adff2f",
		seagreen: "#2e8b57",
		seashell: "#fff5ee",
		tomato: "#ff6347",
		silver: "#c0c0c0",
		sienna: "#a0522d",
		lavender: "#e6e6fa",
		lightgreen: "#90ee90",
		orange: "#ffa500",
		orangered: "#ff4500",
		steelblue: "#4682b4",
		royalblue: "#4169e1",
		turquoise: "#40e0d0",
		yellowgreen: "#9acd32",
		salmon: "#fa8072",
		saddlebrown: "#8b4513",
		sandybrown: "#f4a460",
		rosybrown: "#bc8f8f",
		darksalmon: "#e9967a",
		lightgoldenrodyellow: "#fafad2",
		snow: "#fffafa",
		lightgrey: "#d3d3d3",
		lightgray: "#d3d3d3",
		dimgray: "#696969",
		dimgrey: "#696969",
		olivedrab: "#6b8e23",
		olive: "#808000"
	}, r = {};
	for (var d in a) r[a[d]] = d;
	var l = {};
	e.prototype.toName = function(f) {
		if (!(this.rgba.a || this.rgba.r || this.rgba.g || this.rgba.b)) return "transparent";
		var d, i, n = r[this.toHex()];
		if (n) return n;
		if (null == f ? void 0 : f.closest) {
			var o = this.toRgb(), t = 1 / 0, b = "black";
			if (!l.length) for (var c in a) l[c] = new e(a[c]).toRgb();
			for (var g in a) {
				var u = (d = o, i = l[g], Math.pow(d.r - i.r, 2) + Math.pow(d.g - i.g, 2) + Math.pow(d.b - i.b, 2));
				u < t && (t = u, b = g);
			}
			return b;
		}
	};
	f.string.push([function(f) {
		var r = f.toLowerCase(), d = "transparent" === r ? "#0000" : a[r];
		return d ? new e(d).toRgb() : null;
	}, "name"]);
}
//#endregion
//#region node_modules/pixi.js/lib/color/Color.mjs
k([names_default]);
var _Color = class _Color {
	/**
	* @param {ColorSource} value - Optional value to use, if not provided, white is used.
	*/
	constructor(value = 16777215) {
		this._value = null;
		this._components = /* @__PURE__ */ new Float32Array(4);
		this._components.fill(1);
		this._int = 16777215;
		this.value = value;
	}
	/**
	* Get the red component of the color, normalized between 0 and 1.
	* @example
	* ```ts
	* const color = new Color('red');
	* console.log(color.red); // 1
	*
	* const green = new Color('#00ff00');
	* console.log(green.red); // 0
	* ```
	*/
	get red() {
		return this._components[0];
	}
	/**
	* Get the green component of the color, normalized between 0 and 1.
	* @example
	* ```ts
	* const color = new Color('lime');
	* console.log(color.green); // 1
	*
	* const red = new Color('#ff0000');
	* console.log(red.green); // 0
	* ```
	*/
	get green() {
		return this._components[1];
	}
	/**
	* Get the blue component of the color, normalized between 0 and 1.
	* @example
	* ```ts
	* const color = new Color('blue');
	* console.log(color.blue); // 1
	*
	* const yellow = new Color('#ffff00');
	* console.log(yellow.blue); // 0
	* ```
	*/
	get blue() {
		return this._components[2];
	}
	/**
	* Get the alpha component of the color, normalized between 0 and 1.
	* @example
	* ```ts
	* const color = new Color('red');
	* console.log(color.alpha); // 1 (fully opaque)
	*
	* const transparent = new Color('rgba(255, 0, 0, 0.5)');
	* console.log(transparent.alpha); // 0.5 (semi-transparent)
	* ```
	*/
	get alpha() {
		return this._components[3];
	}
	/**
	* Sets the color value and returns the instance for chaining.
	*
	* This is a chainable version of setting the `value` property.
	* @param value - The color to set. Accepts various formats:
	* - Hex strings/numbers (e.g., '#ff0000', 0xff0000)
	* - RGB/RGBA values (arrays, objects)
	* - CSS color names
	* - HSL/HSLA values
	* - HSV/HSVA values
	* @returns The Color instance for chaining
	* @example
	* ```ts
	* // Basic usage
	* const color = new Color();
	* color.setValue('#ff0000')
	*     .setAlpha(0.5)
	*     .premultiply(0.8);
	*
	* // Different formats
	* color.setValue(0xff0000);          // Hex number
	* color.setValue('#ff0000');         // Hex string
	* color.setValue([1, 0, 0]);         // RGB array
	* color.setValue([1, 0, 0, 0.5]);    // RGBA array
	* color.setValue({ r: 1, g: 0, b: 0 }); // RGB object
	*
	* // Copy from another color
	* const red = new Color('red');
	* color.setValue(red);
	* ```
	* @throws {Error} If the color value is invalid or null
	* @see {@link Color.value} For the underlying value property
	*/
	setValue(value) {
		this.value = value;
		return this;
	}
	/**
	* The current color source. This property allows getting and setting the color value
	* while preserving the original format where possible.
	* @remarks
	* When setting:
	* - Setting to a `Color` instance copies its source and components
	* - Setting to other valid sources normalizes and stores the value
	* - Setting to `null` throws an Error
	* - The color remains unchanged if normalization fails
	*
	* When getting:
	* - Returns `null` if color was modified by {@link Color.multiply} or {@link Color.premultiply}
	* - Otherwise returns the original color source
	* @example
	* ```ts
	* // Setting different color formats
	* const color = new Color();
	*
	* color.value = 0xff0000;         // Hex number
	* color.value = '#ff0000';        // Hex string
	* color.value = [1, 0, 0];        // RGB array
	* color.value = [1, 0, 0, 0.5];   // RGBA array
	* color.value = { r: 1, g: 0, b: 0 }; // RGB object
	*
	* // Copying from another color
	* const red = new Color('red');
	* color.value = red;  // Copies red's components
	*
	* // Getting the value
	* console.log(color.value);  // Returns original format
	*
	* // After modifications
	* color.multiply([0.5, 0.5, 0.5]);
	* console.log(color.value);  // Returns null
	* ```
	* @throws {Error} When attempting to set `null`
	*/
	set value(value) {
		if (value instanceof _Color) {
			this._value = this._cloneSource(value._value);
			this._int = value._int;
			this._components.set(value._components);
		} else if (value === null) throw new Error("Cannot set Color#value to null");
		else if (this._value === null || !this._isSourceEqual(this._value, value)) {
			this._value = this._cloneSource(value);
			this._normalize(this._value);
		}
	}
	get value() {
		return this._value;
	}
	/**
	* Copy a color source internally.
	* @param value - Color source
	*/
	_cloneSource(value) {
		if (typeof value === "string" || typeof value === "number" || value instanceof Number || value === null) return value;
		else if (Array.isArray(value) || ArrayBuffer.isView(value)) return value.slice(0);
		else if (typeof value === "object" && value !== null) return { ...value };
		return value;
	}
	/**
	* Equality check for color sources.
	* @param value1 - First color source
	* @param value2 - Second color source
	* @returns `true` if the color sources are equal, `false` otherwise.
	*/
	_isSourceEqual(value1, value2) {
		const type1 = typeof value1;
		if (type1 !== typeof value2) return false;
		else if (type1 === "number" || type1 === "string" || value1 instanceof Number) return value1 === value2;
		else if (Array.isArray(value1) && Array.isArray(value2) || ArrayBuffer.isView(value1) && ArrayBuffer.isView(value2)) {
			if (value1.length !== value2.length) return false;
			return value1.every((v, i) => v === value2[i]);
		} else if (value1 !== null && value2 !== null) {
			const keys1 = Object.keys(value1);
			const keys2 = Object.keys(value2);
			if (keys1.length !== keys2.length) return false;
			return keys1.every((key) => value1[key] === value2[key]);
		}
		return value1 === value2;
	}
	/**
	* Convert to a RGBA color object with normalized components (0-1).
	* @example
	* ```ts
	* import { Color } from 'pixi.js';
	*
	* // Convert colors to RGBA objects
	* new Color('white').toRgba();     // returns { r: 1, g: 1, b: 1, a: 1 }
	* new Color('#ff0000').toRgba();   // returns { r: 1, g: 0, b: 0, a: 1 }
	*
	* // With transparency
	* new Color('rgba(255,0,0,0.5)').toRgba(); // returns { r: 1, g: 0, b: 0, a: 0.5 }
	* ```
	* @returns An RGBA object with normalized components
	*/
	toRgba() {
		const [r, g, b, a] = this._components;
		return {
			r,
			g,
			b,
			a
		};
	}
	/**
	* Convert to a RGB color object with normalized components (0-1).
	*
	* Alpha component is omitted in the output.
	* @example
	* ```ts
	* import { Color } from 'pixi.js';
	*
	* // Convert colors to RGB objects
	* new Color('white').toRgb();     // returns { r: 1, g: 1, b: 1 }
	* new Color('#ff0000').toRgb();   // returns { r: 1, g: 0, b: 0 }
	*
	* // Alpha is ignored
	* new Color('rgba(255,0,0,0.5)').toRgb(); // returns { r: 1, g: 0, b: 0 }
	* ```
	* @returns An RGB object with normalized components
	*/
	toRgb() {
		const [r, g, b] = this._components;
		return {
			r,
			g,
			b
		};
	}
	/**
	* Convert to a CSS-style rgba string representation.
	*
	* RGB components are scaled to 0-255 range, alpha remains 0-1.
	* @example
	* ```ts
	* import { Color } from 'pixi.js';
	*
	* // Convert colors to RGBA strings
	* new Color('white').toRgbaString();     // returns "rgba(255,255,255,1)"
	* new Color('#ff0000').toRgbaString();   // returns "rgba(255,0,0,1)"
	*
	* // With transparency
	* new Color([1, 0, 0, 0.5]).toRgbaString(); // returns "rgba(255,0,0,0.5)"
	* ```
	* @returns A CSS-compatible rgba string
	*/
	toRgbaString() {
		const [r, g, b] = this.toUint8RgbArray();
		return `rgba(${r},${g},${b},${this.alpha})`;
	}
	/**
	* Convert to an [R, G, B] array of clamped uint8 values (0 to 255).
	* @param {number[]|Uint8Array|Uint8ClampedArray} [out] - Optional output array. If not provided,
	* a cached array will be used and returned.
	* @returns Array containing RGB components as integers between 0-255
	* @example
	* ```ts
	* // Basic usage
	* new Color('white').toUint8RgbArray(); // returns [255, 255, 255]
	* new Color('#ff0000').toUint8RgbArray(); // returns [255, 0, 0]
	*
	* // Using custom output array
	* const rgb = new Uint8Array(3);
	* new Color('blue').toUint8RgbArray(rgb); // rgb is now [0, 0, 255]
	*
	* // Using different array types
	* new Color('red').toUint8RgbArray(new Uint8ClampedArray(3)); // [255, 0, 0]
	* new Color('red').toUint8RgbArray([]); // [255, 0, 0]
	* ```
	* @remarks
	* - Output values are always clamped between 0-255
	* - Alpha component is not included in output
	* - Reuses internal cache array if no output array provided
	*/
	toUint8RgbArray(out) {
		const [r, g, b] = this._components;
		if (!this._arrayRgb) this._arrayRgb = [];
		out || (out = this._arrayRgb);
		out[0] = Math.round(r * 255);
		out[1] = Math.round(g * 255);
		out[2] = Math.round(b * 255);
		return out;
	}
	/**
	* Convert to an [R, G, B, A] array of normalized floats (numbers from 0.0 to 1.0).
	* @param {number[]|Float32Array} [out] - Optional output array. If not provided,
	* a cached array will be used and returned.
	* @returns Array containing RGBA components as floats between 0-1
	* @example
	* ```ts
	* // Basic usage
	* new Color('white').toArray();  // returns [1, 1, 1, 1]
	* new Color('red').toArray();    // returns [1, 0, 0, 1]
	*
	* // With alpha
	* new Color('rgba(255,0,0,0.5)').toArray(); // returns [1, 0, 0, 0.5]
	*
	* // Using custom output array
	* const rgba = new Float32Array(4);
	* new Color('blue').toArray(rgba); // rgba is now [0, 0, 1, 1]
	* ```
	* @remarks
	* - Output values are normalized between 0-1
	* - Includes alpha component as the fourth value
	* - Reuses internal cache array if no output array provided
	*/
	toArray(out) {
		if (!this._arrayRgba) this._arrayRgba = [];
		out || (out = this._arrayRgba);
		const [r, g, b, a] = this._components;
		out[0] = r;
		out[1] = g;
		out[2] = b;
		out[3] = a;
		return out;
	}
	/**
	* Convert to an [R, G, B] array of normalized floats (numbers from 0.0 to 1.0).
	* @param {number[]|Float32Array} [out] - Optional output array. If not provided,
	* a cached array will be used and returned.
	* @returns Array containing RGB components as floats between 0-1
	* @example
	* ```ts
	* // Basic usage
	* new Color('white').toRgbArray(); // returns [1, 1, 1]
	* new Color('red').toRgbArray();   // returns [1, 0, 0]
	*
	* // Using custom output array
	* const rgb = new Float32Array(3);
	* new Color('blue').toRgbArray(rgb); // rgb is now [0, 0, 1]
	* ```
	* @remarks
	* - Output values are normalized between 0-1
	* - Alpha component is omitted from output
	* - Reuses internal cache array if no output array provided
	*/
	toRgbArray(out) {
		if (!this._arrayRgb) this._arrayRgb = [];
		out || (out = this._arrayRgb);
		const [r, g, b] = this._components;
		out[0] = r;
		out[1] = g;
		out[2] = b;
		return out;
	}
	/**
	* Convert to a hexadecimal number.
	* @returns The color as a 24-bit RGB integer
	* @example
	* ```ts
	* // Basic usage
	* new Color('white').toNumber(); // returns 0xffffff
	* new Color('red').toNumber();   // returns 0xff0000
	*
	* // Store as hex
	* const color = new Color('blue');
	* const hex = color.toNumber(); // 0x0000ff
	* ```
	*/
	toNumber() {
		return this._int;
	}
	/**
	* Convert to a BGR number.
	*
	* Useful for platforms that expect colors in BGR format.
	* @returns The color as a 24-bit BGR integer
	* @example
	* ```ts
	* // Convert RGB to BGR
	* new Color(0xffcc99).toBgrNumber(); // returns 0x99ccff
	*
	* // Common use case: platform-specific color format
	* const color = new Color('orange');
	* const bgrColor = color.toBgrNumber(); // Color with swapped R/B channels
	* ```
	* @remarks
	* This swaps the red and blue channels compared to the normal RGB format:
	* - RGB 0xRRGGBB becomes BGR 0xBBGGRR
	*/
	toBgrNumber() {
		const [r, g, b] = this.toUint8RgbArray();
		return (b << 16) + (g << 8) + r;
	}
	/**
	* Convert to a hexadecimal number in little endian format (e.g., BBGGRR).
	*
	* Useful for platforms that expect colors in little endian byte order.
	* @example
	* ```ts
	* import { Color } from 'pixi.js';
	*
	* // Convert RGB color to little endian format
	* new Color(0xffcc99).toLittleEndianNumber(); // returns 0x99ccff
	*
	* // Common use cases:
	* const color = new Color('orange');
	* const leColor = color.toLittleEndianNumber(); // Swaps byte order for LE systems
	*
	* // Multiple conversions
	* const colors = {
	*     normal: 0xffcc99,
	*     littleEndian: new Color(0xffcc99).toLittleEndianNumber(), // 0x99ccff
	*     backToNormal: new Color(0x99ccff).toLittleEndianNumber()  // 0xffcc99
	* };
	* ```
	* @remarks
	* - Swaps R and B channels in the color value
	* - RGB 0xRRGGBB becomes 0xBBGGRR
	* - Useful for systems that use little endian byte order
	* - Can be used to convert back and forth between formats
	* @returns The color as a number in little endian format (BBGGRR)
	* @see {@link Color.toBgrNumber} For BGR format without byte swapping
	*/
	toLittleEndianNumber() {
		const value = this._int;
		return (value >> 16) + (value & 65280) + ((value & 255) << 16);
	}
	/**
	* Multiply with another color.
	*
	* This action is destructive and modifies the original color.
	* @param {ColorSource} value - The color to multiply by. Accepts any valid color format:
	* - Hex strings/numbers (e.g., '#ff0000', 0xff0000)
	* - RGB/RGBA arrays ([1, 0, 0], [1, 0, 0, 1])
	* - Color objects ({ r: 1, g: 0, b: 0 })
	* - CSS color names ('red', 'blue')
	* @returns this - The Color instance for chaining
	* @example
	* ```ts
	* // Basic multiplication
	* const color = new Color('#ff0000');
	* color.multiply(0x808080); // 50% darker red
	*
	* // With transparency
	* color.multiply([1, 1, 1, 0.5]); // 50% transparent
	*
	* // Chain operations
	* color
	*     .multiply('#808080')
	*     .multiply({ r: 1, g: 1, b: 1, a: 0.5 });
	* ```
	* @remarks
	* - Multiplies each RGB component and alpha separately
	* - Values are clamped between 0-1
	* - Original color format is lost (value becomes null)
	* - Operation cannot be undone
	*/
	multiply(value) {
		const [r, g, b, a] = _Color._temp.setValue(value)._components;
		this._components[0] *= r;
		this._components[1] *= g;
		this._components[2] *= b;
		this._components[3] *= a;
		this._refreshInt();
		this._value = null;
		return this;
	}
	/**
	* Converts color to a premultiplied alpha format.
	*
	* This action is destructive and modifies the original color.
	* @param alpha - The alpha value to multiply by (0-1)
	* @param {boolean} [applyToRGB=true] - Whether to premultiply RGB channels
	* @returns {Color} The Color instance for chaining
	* @example
	* ```ts
	* // Basic premultiplication
	* const color = new Color('red');
	* color.premultiply(0.5); // 50% transparent red with premultiplied RGB
	*
	* // Alpha only (RGB unchanged)
	* color.premultiply(0.5, false); // 50% transparent, original RGB
	*
	* // Chain with other operations
	* color
	*     .multiply(0x808080)
	*     .premultiply(0.5)
	*     .toNumber();
	* ```
	* @remarks
	* - RGB channels are multiplied by alpha when applyToRGB is true
	* - Alpha is always set to the provided value
	* - Values are clamped between 0-1
	* - Original color format is lost (value becomes null)
	* - Operation cannot be undone
	*/
	premultiply(alpha, applyToRGB = true) {
		if (applyToRGB) {
			this._components[0] *= alpha;
			this._components[1] *= alpha;
			this._components[2] *= alpha;
		}
		this._components[3] = alpha;
		this._refreshInt();
		this._value = null;
		return this;
	}
	/**
	* Returns the color as a 32-bit premultiplied alpha integer.
	*
	* Format: 0xAARRGGBB
	* @param {number} alpha - The alpha value to multiply by (0-1)
	* @param {boolean} [applyToRGB=true] - Whether to premultiply RGB channels
	* @returns {number} The premultiplied color as a 32-bit integer
	* @example
	* ```ts
	* // Convert to premultiplied format
	* const color = new Color('red');
	*
	* // Full opacity (0xFFRRGGBB)
	* color.toPremultiplied(1.0); // 0xFFFF0000
	*
	* // 50% transparency with premultiplied RGB
	* color.toPremultiplied(0.5); // 0x7F7F0000
	*
	* // 50% transparency without RGB premultiplication
	* color.toPremultiplied(0.5, false); // 0x7FFF0000
	* ```
	* @remarks
	* - Returns full opacity (0xFF000000) when alpha is 1.0
	* - Returns 0 when alpha is 0.0 and applyToRGB is true
	* - RGB values are rounded during premultiplication
	*/
	toPremultiplied(alpha, applyToRGB = true) {
		if (alpha === 1) return (255 << 24) + this._int;
		if (alpha === 0) return applyToRGB ? 0 : this._int;
		let r = this._int >> 16 & 255;
		let g = this._int >> 8 & 255;
		let b = this._int & 255;
		if (applyToRGB) {
			r = r * alpha + .5 | 0;
			g = g * alpha + .5 | 0;
			b = b * alpha + .5 | 0;
		}
		return (alpha * 255 << 24) + (r << 16) + (g << 8) + b;
	}
	/**
	* Convert to a hexadecimal string (6 characters).
	* @returns A CSS-compatible hex color string (e.g., "#ff0000")
	* @example
	* ```ts
	* import { Color } from 'pixi.js';
	*
	* // Basic colors
	* new Color('red').toHex();    // returns "#ff0000"
	* new Color('white').toHex();  // returns "#ffffff"
	* new Color('black').toHex();  // returns "#000000"
	*
	* // From different formats
	* new Color(0xff0000).toHex(); // returns "#ff0000"
	* new Color([1, 0, 0]).toHex(); // returns "#ff0000"
	* new Color({ r: 1, g: 0, b: 0 }).toHex(); // returns "#ff0000"
	* ```
	* @remarks
	* - Always returns a 6-character hex string
	* - Includes leading "#" character
	* - Alpha channel is ignored
	* - Values are rounded to nearest hex value
	*/
	toHex() {
		const hexString = this._int.toString(16);
		return `#${"000000".substring(0, 6 - hexString.length) + hexString}`;
	}
	/**
	* Convert to a hexadecimal string with alpha (8 characters).
	* @returns A CSS-compatible hex color string with alpha (e.g., "#ff0000ff")
	* @example
	* ```ts
	* import { Color } from 'pixi.js';
	*
	* // Fully opaque colors
	* new Color('red').toHexa();   // returns "#ff0000ff"
	* new Color('white').toHexa(); // returns "#ffffffff"
	*
	* // With transparency
	* new Color('rgba(255, 0, 0, 0.5)').toHexa(); // returns "#ff00007f"
	* new Color([1, 0, 0, 0]).toHexa(); // returns "#ff000000"
	* ```
	* @remarks
	* - Returns an 8-character hex string
	* - Includes leading "#" character
	* - Alpha is encoded in last two characters
	* - Values are rounded to nearest hex value
	*/
	toHexa() {
		const alphaString = Math.round(this._components[3] * 255).toString(16);
		return this.toHex() + "00".substring(0, 2 - alphaString.length) + alphaString;
	}
	/**
	* Set alpha (transparency) value while preserving color components.
	*
	* Provides a chainable interface for setting alpha.
	* @param alpha - Alpha value between 0 (fully transparent) and 1 (fully opaque)
	* @returns The Color instance for chaining
	* @example
	* ```ts
	* // Basic alpha setting
	* const color = new Color('red');
	* color.setAlpha(0.5);  // 50% transparent red
	*
	* // Chain with other operations
	* color
	*     .setValue('#ff0000')
	*     .setAlpha(0.8)    // 80% opaque
	*     .premultiply(0.5); // Further modify alpha
	*
	* // Reset to fully opaque
	* color.setAlpha(1);
	* ```
	* @remarks
	* - Alpha value is clamped between 0-1
	* - Can be chained with other color operations
	*/
	setAlpha(alpha) {
		this._components[3] = this._clamp(alpha);
		this._value = null;
		return this;
	}
	/**
	* Normalize the input value into rgba
	* @param value - Input value
	*/
	_normalize(value) {
		let r;
		let g;
		let b;
		let a;
		if ((typeof value === "number" || value instanceof Number) && value >= 0 && value <= 16777215) {
			const int = value;
			r = (int >> 16 & 255) / 255;
			g = (int >> 8 & 255) / 255;
			b = (int & 255) / 255;
			a = 1;
		} else if ((Array.isArray(value) || value instanceof Float32Array) && value.length >= 3 && value.length <= 4) {
			value = this._clamp(value);
			[r, g, b, a = 1] = value;
		} else if ((value instanceof Uint8Array || value instanceof Uint8ClampedArray) && value.length >= 3 && value.length <= 4) {
			value = this._clamp(value, 0, 255);
			[r, g, b, a = 255] = value;
			r /= 255;
			g /= 255;
			b /= 255;
			a /= 255;
		} else if (typeof value === "string" || typeof value === "object") {
			if (typeof value === "string") {
				const match = _Color.HEX_PATTERN.exec(value);
				if (match) value = `#${match[2]}`;
			}
			const color = w(value);
			if (color.isValid()) {
				({r, g, b, a} = color.rgba);
				r /= 255;
				g /= 255;
				b /= 255;
			}
		}
		if (r !== void 0) {
			this._components[0] = r;
			this._components[1] = g;
			this._components[2] = b;
			this._components[3] = a;
			this._refreshInt();
		} else throw new Error(`Unable to convert color ${value}`);
	}
	/** Refresh the internal color rgb number */
	_refreshInt() {
		this._clamp(this._components);
		const [r, g, b] = this._components;
		this._int = (r * 255 << 16) + (g * 255 << 8) + (b * 255 | 0);
	}
	/**
	* Clamps values to a range. Will override original values
	* @param value - Value(s) to clamp
	* @param min - Minimum value
	* @param max - Maximum value
	*/
	_clamp(value, min = 0, max = 1) {
		if (typeof value === "number") return Math.min(Math.max(value, min), max);
		value.forEach((v, i) => {
			value[i] = Math.min(Math.max(v, min), max);
		});
		return value;
	}
	/**
	* Check if a value can be interpreted as a valid color format.
	* Supports all color formats that can be used with the Color class.
	* @param value - Value to check
	* @returns True if the value can be used as a color
	* @example
	* ```ts
	* import { Color } from 'pixi.js';
	*
	* // CSS colors and hex values
	* Color.isColorLike('red');          // true
	* Color.isColorLike('#ff0000');      // true
	* Color.isColorLike(0xff0000);       // true
	*
	* // Arrays (RGB/RGBA)
	* Color.isColorLike([1, 0, 0]);      // true
	* Color.isColorLike([1, 0, 0, 0.5]); // true
	*
	* // TypedArrays
	* Color.isColorLike(new Float32Array([1, 0, 0]));          // true
	* Color.isColorLike(new Uint8Array([255, 0, 0]));          // true
	* Color.isColorLike(new Uint8ClampedArray([255, 0, 0]));   // true
	*
	* // Object formats
	* Color.isColorLike({ r: 1, g: 0, b: 0 });            // true (RGB)
	* Color.isColorLike({ r: 1, g: 0, b: 0, a: 0.5 });    // true (RGBA)
	* Color.isColorLike({ h: 0, s: 100, l: 50 });         // true (HSL)
	* Color.isColorLike({ h: 0, s: 100, l: 50, a: 0.5 }); // true (HSLA)
	* Color.isColorLike({ h: 0, s: 100, v: 100 });        // true (HSV)
	* Color.isColorLike({ h: 0, s: 100, v: 100, a: 0.5 });// true (HSVA)
	*
	* // Color instances
	* Color.isColorLike(new Color('red')); // true
	*
	* // Invalid values
	* Color.isColorLike(null);           // false
	* Color.isColorLike(undefined);      // false
	* Color.isColorLike({});             // false
	* Color.isColorLike([]);             // false
	* Color.isColorLike('not-a-color');  // false
	* ```
	* @remarks
	* Checks for the following formats:
	* - Numbers (0x000000 to 0xffffff)
	* - CSS color strings
	* - RGB/RGBA arrays and objects
	* - HSL/HSLA objects
	* - HSV/HSVA objects
	* - TypedArrays (Float32Array, Uint8Array, Uint8ClampedArray)
	* - Color instances
	* @see {@link ColorSource} For supported color format types
	* @see {@link Color.setValue} For setting color values
	* @category utility
	*/
	static isColorLike(value) {
		return typeof value === "number" || typeof value === "string" || value instanceof Number || value instanceof _Color || Array.isArray(value) || value instanceof Uint8Array || value instanceof Uint8ClampedArray || value instanceof Float32Array || value.r !== void 0 && value.g !== void 0 && value.b !== void 0 || value.r !== void 0 && value.g !== void 0 && value.b !== void 0 && value.a !== void 0 || value.h !== void 0 && value.s !== void 0 && value.l !== void 0 || value.h !== void 0 && value.s !== void 0 && value.l !== void 0 && value.a !== void 0 || value.h !== void 0 && value.s !== void 0 && value.v !== void 0 || value.h !== void 0 && value.s !== void 0 && value.v !== void 0 && value.a !== void 0;
	}
};
/**
* Static shared Color instance used for utility operations. This is a singleton color object
* that can be reused to avoid creating unnecessary Color instances.
* > [!IMPORTANT] You should be careful when using this shared instance, as it is mutable and can be
* > changed by any code that uses it.
* >
* > It is best used for one-off color operations or temporary transformations.
* > For persistent colors, create your own Color instance instead.
* @example
* ```ts
* import { Color } from 'pixi.js';
*
* // Use shared instance for one-off color operations
* Color.shared.setValue(0xff0000);
* const redHex = Color.shared.toHex();     // "#ff0000"
* const redRgb = Color.shared.toRgbArray(); // [1, 0, 0]
*
* // Temporary color transformations
* const colorNumber = Color.shared
*     .setValue('#ff0000')     // Set to red
*     .setAlpha(0.5)          // Make semi-transparent
*     .premultiply(0.8)       // Apply premultiplication
*     .toNumber();            // Convert to number
*
* // Chain multiple operations
* const result = Color.shared
*     .setValue(someColor)
*     .multiply(tintColor)
*     .toPremultiplied(alpha);
* ```
* @remarks
* - This is a shared instance - be careful about multiple code paths using it simultaneously
* - Use for temporary color operations to avoid allocating new Color instances
* - The value is preserved between operations, so reset if needed
* - For persistent colors, create your own Color instance instead
*/
_Color.shared = new _Color();
/**
* Temporary Color object for static uses internally.
* As to not conflict with Color.shared.
* @ignore
*/
_Color._temp = new _Color();
/** Pattern for hex strings */
_Color.HEX_PATTERN = /^(#|0x)?(([a-f0-9]{3}){1,2}([a-f0-9]{2})?)$/i;
var Color = _Color;
//#endregion
//#region node_modules/pixi.js/lib/culling/cullingMixin.mjs
var cullingMixin = {
	cullArea: null,
	cullable: false,
	cullableChildren: true
};
//#endregion
//#region node_modules/pixi.js/lib/utils/logging/warn.mjs
var warnCount = 0;
var maxWarnings = 500;
function warn(...args) {
	if (warnCount === maxWarnings) return;
	warnCount++;
	if (warnCount === maxWarnings) console.warn("PixiJS Warning: too many warnings, no more warnings will be reported to the console by PixiJS.");
	else console.warn("PixiJS Warning: ", ...args);
}
//#endregion
//#region node_modules/pixi.js/lib/utils/pool/GlobalResourceRegistry.mjs
var GlobalResourceRegistry = {
	/**
	* Set of registered pools and cleanable objects.
	* @private
	*/
	_registeredResources: /* @__PURE__ */ new Set(),
	/**
	* Registers a pool or cleanable object for cleanup.
	* @param {Cleanable} pool - The pool or object to register.
	*/
	register(pool) {
		this._registeredResources.add(pool);
	},
	/**
	* Unregisters a pool or cleanable object from cleanup.
	* @param {Cleanable} pool - The pool or object to unregister.
	*/
	unregister(pool) {
		this._registeredResources.delete(pool);
	},
	/** Clears all registered pools and cleanable objects. This will call clear() on each registered item. */
	release() {
		this._registeredResources.forEach((pool) => pool.clear());
	},
	/**
	* Gets the number of registered pools and cleanable objects.
	* @returns {number} The count of registered items.
	*/
	get registeredCount() {
		return this._registeredResources.size;
	},
	/**
	* Checks if a specific pool or cleanable object is registered.
	* @param {Cleanable} pool - The pool or object to check.
	* @returns {boolean} True if the item is registered, false otherwise.
	*/
	isRegistered(pool) {
		return this._registeredResources.has(pool);
	},
	/**
	* Removes all registrations without clearing the pools.
	* Useful if you want to reset the collector without affecting the pools.
	*/
	reset() {
		this._registeredResources.clear();
	}
};
//#endregion
//#region node_modules/pixi.js/lib/utils/pool/Pool.mjs
var Pool = class {
	/**
	* Constructs a new Pool.
	* @param ClassType - The constructor of the items in the pool.
	* @param {number} [initialSize] - The initial size of the pool.
	*/
	constructor(ClassType, initialSize) {
		this._pool = [];
		this._count = 0;
		this._index = 0;
		this._classType = ClassType;
		if (initialSize) this.prepopulate(initialSize);
	}
	/**
	* Prepopulates the pool with a given number of items.
	* @param total - The number of items to add to the pool.
	*/
	prepopulate(total) {
		for (let i = 0; i < total; i++) this._pool[this._index++] = new this._classType();
		this._count += total;
	}
	/**
	* Gets an item from the pool. Calls the item's `init` method if it exists.
	* If there are no items left in the pool, a new one will be created.
	* @param {I} [data] - Optional data to pass to the item's constructor.
	* @returns {T} The item from the pool.
	*/
	get(data) {
		let item;
		if (this._index > 0) item = this._pool[--this._index];
		else {
			item = new this._classType();
			this._count++;
		}
		item.init?.(data);
		return item;
	}
	/**
	* Returns an item to the pool. Calls the item's `reset` method if it exists.
	* @param {T} item - The item to return to the pool.
	*/
	return(item) {
		item.reset?.();
		this._pool[this._index++] = item;
	}
	/**
	* Gets the number of items in the pool.
	* @readonly
	*/
	get totalSize() {
		return this._count;
	}
	/**
	* Gets the number of items in the pool that are free to use without needing to create more.
	* @readonly
	*/
	get totalFree() {
		return this._index;
	}
	/**
	* Gets the number of items in the pool that are currently in use.
	* @readonly
	*/
	get totalUsed() {
		return this._count - this._index;
	}
	/** clears the pool */
	clear() {
		if (this._pool.length > 0 && this._pool[0].destroy) for (let i = 0; i < this._index; i++) this._pool[i].destroy();
		this._pool.length = 0;
		this._count = 0;
		this._index = 0;
	}
};
//#endregion
//#region node_modules/pixi.js/lib/utils/pool/PoolGroup.mjs
var PoolGroupClass = class {
	constructor() {
		/**
		* A map to store the pools by their class type.
		* @private
		*/
		this._poolsByClass = /* @__PURE__ */ new Map();
	}
	/**
	* Prepopulates a specific pool with a given number of items.
	* @template T The type of items in the pool. Must extend PoolItem.
	* @param {PoolItemConstructor<T>} Class - The constructor of the items in the pool.
	* @param {number} total - The number of items to add to the pool.
	*/
	prepopulate(Class, total) {
		this.getPool(Class).prepopulate(total);
	}
	/**
	* Gets an item from a specific pool.
	* @template T The type of items in the pool. Must extend PoolItem.
	* @param {PoolItemConstructor<T>} Class - The constructor of the items in the pool.
	* @param {unknown} [data] - Optional data to pass to the item's constructor.
	* @returns {T} The item from the pool.
	*/
	get(Class, data) {
		return this.getPool(Class).get(data);
	}
	/**
	* Returns an item to its respective pool.
	* @param {PoolItem} item - The item to return to the pool.
	*/
	return(item) {
		this.getPool(item.constructor).return(item);
	}
	/**
	* Gets a specific pool based on the class type.
	* @template T The type of items in the pool. Must extend PoolItem.
	* @param {PoolItemConstructor<T>} ClassType - The constructor of the items in the pool.
	* @returns {Pool<T>} The pool of the given class type.
	*/
	getPool(ClassType) {
		if (!this._poolsByClass.has(ClassType)) this._poolsByClass.set(ClassType, new Pool(ClassType));
		return this._poolsByClass.get(ClassType);
	}
	/** gets the usage stats of each pool in the system */
	stats() {
		const stats = {};
		this._poolsByClass.forEach((pool) => {
			const name = stats[pool._classType.name] ? pool._classType.name + pool._classType.ID : pool._classType.name;
			stats[name] = {
				free: pool.totalFree,
				used: pool.totalUsed,
				size: pool.totalSize
			};
		});
		return stats;
	}
	/** Clears all pools in the group. This will reset all pools and free their resources. */
	clear() {
		this._poolsByClass.forEach((pool) => pool.clear());
		this._poolsByClass.clear();
	}
};
var BigPool = new PoolGroupClass();
GlobalResourceRegistry.register(BigPool);
//#endregion
//#region node_modules/pixi.js/lib/scene/container/container-mixins/cacheAsTextureMixin.mjs
var cacheAsTextureMixin = {
	get isCachedAsTexture() {
		return !!this.renderGroup?.isCachedAsTexture;
	},
	cacheAsTexture(val) {
		if (typeof val === "boolean" && val === false) this.disableRenderGroup();
		else {
			this.enableRenderGroup();
			this.renderGroup.enableCacheAsTexture(val === true ? {} : val);
		}
	},
	updateCacheTexture() {
		this.renderGroup?.updateCacheTexture();
	},
	get cacheAsBitmap() {
		return this.isCachedAsTexture;
	},
	set cacheAsBitmap(val) {
		deprecation("v8.6.0", "cacheAsBitmap is deprecated, use cacheAsTexture instead.");
		this.cacheAsTexture(val);
	}
};
//#endregion
//#region node_modules/pixi.js/lib/utils/data/removeItems.mjs
function removeItems(arr, startIdx, removeCount) {
	const length = arr.length;
	let i;
	if (startIdx >= length || removeCount === 0) return;
	removeCount = startIdx + removeCount > length ? length - startIdx : removeCount;
	const len = length - removeCount;
	for (i = startIdx; i < len; ++i) arr[i] = arr[i + removeCount];
	arr.length = len;
}
//#endregion
//#region node_modules/pixi.js/lib/scene/container/container-mixins/childrenHelperMixin.mjs
var childrenHelperMixin = {
	allowChildren: true,
	removeChildren(beginIndex = 0, endIndex) {
		const end = endIndex ?? this.children.length;
		const range = end - beginIndex;
		const removed = [];
		if (range > 0 && range <= end) {
			for (let i = end - 1; i >= beginIndex; i--) {
				const child = this.children[i];
				if (!child) continue;
				removed.push(child);
				child.parent = null;
			}
			removeItems(this.children, beginIndex, end);
			const renderGroup = this.renderGroup || this.parentRenderGroup;
			if (renderGroup) renderGroup.removeChildren(removed);
			for (let i = 0; i < removed.length; ++i) {
				const child = removed[i];
				child.parentRenderLayer?.detach(child);
				this.emit("childRemoved", child, this, i);
				removed[i].emit("removed", this);
			}
			if (removed.length > 0) this._didViewChangeTick++;
			return removed;
		} else if (range === 0 && this.children.length === 0) return removed;
		throw new RangeError("removeChildren: numeric values are outside the acceptable range.");
	},
	removeChildAt(index) {
		const child = this.getChildAt(index);
		return this.removeChild(child);
	},
	getChildAt(index) {
		if (index < 0 || index >= this.children.length) throw new Error(`getChildAt: Index (${index}) does not exist.`);
		return this.children[index];
	},
	setChildIndex(child, index) {
		if (index < 0 || index >= this.children.length) throw new Error(`The index ${index} supplied is out of bounds ${this.children.length}`);
		this.getChildIndex(child);
		this.addChildAt(child, index);
	},
	getChildIndex(child) {
		const index = this.children.indexOf(child);
		if (index === -1) throw new Error("The supplied Container must be a child of the caller");
		return index;
	},
	addChildAt(child, index) {
		if (!this.allowChildren) deprecation(v8_0_0, "addChildAt: Only Containers will be allowed to add children in v8.0.0");
		const { children } = this;
		if (index < 0 || index > children.length) throw new Error(`${child}addChildAt: The index ${index} supplied is out of bounds ${children.length}`);
		const sameParent = child.parent === this;
		if (child.parent) {
			const currentIndex = child.parent.children.indexOf(child);
			if (sameParent) {
				if (currentIndex === index) return child;
				child.parent.children.splice(currentIndex, 1);
			} else child.removeFromParent();
		}
		if (index === children.length) children.push(child);
		else children.splice(index, 0, child);
		const renderGroup = this.renderGroup || this.parentRenderGroup;
		if (this.sortableChildren) this.sortDirty = true;
		if (sameParent) {
			if (renderGroup) renderGroup.structureDidChange = true;
			return child;
		}
		child.parent = this;
		child.didChange = true;
		child._updateFlags = 15;
		if (renderGroup) renderGroup.addChild(child);
		this.emit("childAdded", child, this, index);
		child.emit("added", this);
		return child;
	},
	swapChildren(child, child2) {
		if (child === child2) return;
		const index1 = this.getChildIndex(child);
		const index2 = this.getChildIndex(child2);
		this.children[index1] = child2;
		this.children[index2] = child;
		const renderGroup = this.renderGroup || this.parentRenderGroup;
		if (renderGroup) renderGroup.structureDidChange = true;
		this._didContainerChangeTick++;
	},
	removeFromParent() {
		this.parent?.removeChild(this);
	},
	reparentChild(...child) {
		if (child.length === 1) return this.reparentChildAt(child[0], this.children.length);
		child.forEach((c) => this.reparentChildAt(c, this.children.length));
		return child[0];
	},
	reparentChildAt(child, index) {
		if (child.parent === this) {
			this.setChildIndex(child, index);
			return child;
		}
		const childMat = child.worldTransform.clone();
		child.removeFromParent();
		this.addChildAt(child, index);
		const newMatrix = this.worldTransform.clone();
		newMatrix.invert();
		childMat.prepend(newMatrix);
		child.setFromMatrix(childMat);
		return child;
	},
	replaceChild(oldChild, newChild) {
		oldChild.updateLocalTransform();
		this.addChildAt(newChild, this.getChildIndex(oldChild));
		newChild.setFromMatrix(oldChild.localTransform);
		newChild.updateLocalTransform();
		this.removeChild(oldChild);
	}
};
//#endregion
//#region node_modules/pixi.js/lib/scene/container/container-mixins/collectRenderablesMixin.mjs
var collectRenderablesMixin = {
	collectRenderables(instructionSet, renderer, currentLayer) {
		if (this.parentRenderLayer && this.parentRenderLayer !== currentLayer || this.globalDisplayStatus < 7 || !this.includeInBuild) return;
		if (this.sortableChildren) this.sortChildren();
		if (this.isSimple) this.collectRenderablesSimple(instructionSet, renderer, currentLayer);
		else if (this.renderGroup) renderer.renderPipes.renderGroup.addRenderGroup(this.renderGroup, instructionSet);
		else this.collectRenderablesWithEffects(instructionSet, renderer, currentLayer);
	},
	collectRenderablesSimple(instructionSet, renderer, currentLayer) {
		const children = this.children;
		const length = children.length;
		for (let i = 0; i < length; i++) children[i].collectRenderables(instructionSet, renderer, currentLayer);
	},
	collectRenderablesWithEffects(instructionSet, renderer, currentLayer) {
		const { renderPipes } = renderer;
		for (let i = 0; i < this.effects.length; i++) {
			const effect = this.effects[i];
			renderPipes[effect.pipe].push(effect, this, instructionSet);
		}
		this.collectRenderablesSimple(instructionSet, renderer, currentLayer);
		for (let i = this.effects.length - 1; i >= 0; i--) {
			const effect = this.effects[i];
			renderPipes[effect.pipe].pop(effect, this, instructionSet);
		}
	}
};
//#endregion
//#region node_modules/pixi.js/lib/filters/FilterEffect.mjs
var FilterEffect = class {
	constructor() {
		/** the pipe that knows how to handle this effect */
		this.pipe = "filter";
		/** the priority of this effect */
		this.priority = 1;
	}
	destroy() {
		for (let i = 0; i < this.filters.length; i++) this.filters[i].destroy();
		this.filters = null;
		this.filterArea = null;
	}
};
//#endregion
//#region node_modules/pixi.js/lib/rendering/mask/MaskEffectManager.mjs
var MaskEffectManagerClass = class {
	constructor() {
		/** @private */
		this._effectClasses = [];
		this._tests = [];
		this._initialized = false;
	}
	init() {
		if (this._initialized) return;
		this._initialized = true;
		this._effectClasses.forEach((test) => {
			this.add({
				test: test.test,
				maskClass: test
			});
		});
	}
	add(test) {
		this._tests.push(test);
	}
	getMaskEffect(item) {
		if (!this._initialized) this.init();
		for (let i = 0; i < this._tests.length; i++) {
			const test = this._tests[i];
			if (test.test(item)) return BigPool.get(test.maskClass, item);
		}
		return item;
	}
	returnMaskEffect(effect) {
		BigPool.return(effect);
	}
};
var MaskEffectManager = new MaskEffectManagerClass();
extensions.handleByList(ExtensionType.MaskEffect, MaskEffectManager._effectClasses);
//#endregion
//#region node_modules/pixi.js/lib/scene/container/container-mixins/effectsMixin.mjs
var effectsMixin = {
	_maskEffect: null,
	_maskOptions: {
		inverse: false,
		channel: "red"
	},
	_filterEffect: null,
	effects: [],
	_markStructureAsChanged() {
		const renderGroup = this.renderGroup || this.parentRenderGroup;
		if (renderGroup) renderGroup.structureDidChange = true;
	},
	addEffect(effect) {
		if (this.effects.indexOf(effect) !== -1) return;
		this.effects.push(effect);
		this.effects.sort((a, b) => a.priority - b.priority);
		this._markStructureAsChanged();
		this._updateIsSimple();
	},
	removeEffect(effect) {
		const index = this.effects.indexOf(effect);
		if (index === -1) return;
		this.effects.splice(index, 1);
		this._markStructureAsChanged();
		this._updateIsSimple();
	},
	set mask(value) {
		const effect = this._maskEffect;
		if (effect?.mask === value) return;
		if (effect) {
			this.removeEffect(effect);
			MaskEffectManager.returnMaskEffect(effect);
			this._maskEffect = null;
		}
		if (value === null || value === void 0) return;
		this._maskEffect = MaskEffectManager.getMaskEffect(value);
		this.addEffect(this._maskEffect);
	},
	get mask() {
		return this._maskEffect?.mask;
	},
	setMask(options) {
		this._maskOptions = {
			...this._maskOptions,
			...options
		};
		if (options.mask) this.mask = options.mask;
		this._markStructureAsChanged();
	},
	set filters(value) {
		if (!Array.isArray(value) && value) value = [value];
		const effect = this._filterEffect || (this._filterEffect = new FilterEffect());
		value = value;
		const hasFilters = value?.length > 0;
		const didChange = hasFilters !== effect.filters?.length > 0;
		value = Array.isArray(value) ? value.slice(0) : value;
		effect.filters = Object.freeze(value);
		if (didChange) {
			if (hasFilters) this.addEffect(effect);
			else {
				this.removeEffect(effect);
				effect.filters = value ?? null;
			}
		}
	},
	get filters() {
		return this._filterEffect?.filters;
	},
	set filterArea(value) {
		this._filterEffect || (this._filterEffect = new FilterEffect());
		this._filterEffect.filterArea = value;
	},
	get filterArea() {
		return this._filterEffect?.filterArea;
	}
};
//#endregion
//#region node_modules/pixi.js/lib/scene/container/container-mixins/findMixin.mjs
var findMixin = {
	label: null,
	get name() {
		deprecation(v8_0_0, "Container.name property has been removed, use Container.label instead");
		return this.label;
	},
	set name(value) {
		deprecation(v8_0_0, "Container.name property has been removed, use Container.label instead");
		this.label = value;
	},
	getChildByName(name, deep = false) {
		return this.getChildByLabel(name, deep);
	},
	getChildByLabel(label, deep = false) {
		const children = this.children;
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			if (child.label === label || label instanceof RegExp && label.test(child.label)) return child;
		}
		if (deep) for (let i = 0; i < children.length; i++) {
			const found = children[i].getChildByLabel(label, true);
			if (found) return found;
		}
		return null;
	},
	getChildrenByLabel(label, deep = false, out = []) {
		const children = this.children;
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			if (child.label === label || label instanceof RegExp && label.test(child.label)) out.push(child);
		}
		if (deep) for (let i = 0; i < children.length; i++) children[i].getChildrenByLabel(label, true, out);
		return out;
	}
};
//#endregion
//#region node_modules/pixi.js/lib/scene/container/bounds/utils/matrixAndBoundsPool.mjs
var matrixPool = BigPool.getPool(Matrix);
var boundsPool = BigPool.getPool(Bounds);
//#endregion
//#region node_modules/pixi.js/lib/scene/container/container-mixins/getFastGlobalBoundsMixin.mjs
var tempMatrix$1 = new Matrix();
var getFastGlobalBoundsMixin = {
	getFastGlobalBounds(factorRenderLayers, bounds) {
		bounds || (bounds = new Bounds());
		bounds.clear();
		this._getGlobalBoundsRecursive(!!factorRenderLayers, bounds, this.parentRenderLayer);
		if (!bounds.isValid) bounds.set(0, 0, 0, 0);
		const renderGroup = this.renderGroup || this.parentRenderGroup;
		bounds.applyMatrix(renderGroup.worldTransform);
		return bounds;
	},
	_getGlobalBoundsRecursive(factorRenderLayers, bounds, currentLayer) {
		let localBounds = bounds;
		if (factorRenderLayers && this.parentRenderLayer && this.parentRenderLayer !== currentLayer) return;
		if (this.localDisplayStatus !== 7 || !this.measurable) return;
		const manageEffects = !!this.effects.length;
		if (this.renderGroup || manageEffects) localBounds = boundsPool.get().clear();
		if (this.boundsArea) bounds.addRect(this.boundsArea, this.worldTransform);
		else {
			if (this.renderPipeId) {
				const viewBounds = this.bounds;
				localBounds.addFrame(viewBounds.minX, viewBounds.minY, viewBounds.maxX, viewBounds.maxY, this.groupTransform);
			}
			const children = this.children;
			for (let i = 0; i < children.length; i++) children[i]._getGlobalBoundsRecursive(factorRenderLayers, localBounds, currentLayer);
		}
		if (manageEffects) {
			let advanced = false;
			const renderGroup = this.renderGroup || this.parentRenderGroup;
			for (let i = 0; i < this.effects.length; i++) if (this.effects[i].addBounds) {
				if (!advanced) {
					advanced = true;
					localBounds.applyMatrix(renderGroup.worldTransform);
				}
				this.effects[i].addBounds(localBounds, true);
			}
			if (advanced) localBounds.applyMatrix(renderGroup.worldTransform.copyTo(tempMatrix$1).invert());
			bounds.addBounds(localBounds);
			boundsPool.return(localBounds);
		} else if (this.renderGroup) {
			bounds.addBounds(localBounds, this.relativeGroupTransform);
			boundsPool.return(localBounds);
		}
	}
};
//#endregion
//#region node_modules/pixi.js/lib/scene/container/bounds/getGlobalBounds.mjs
function getGlobalBounds(target, skipUpdateTransform, bounds) {
	bounds.clear();
	let parentTransform;
	let pooledMatrix;
	if (target.parent) {
		if (!skipUpdateTransform) {
			pooledMatrix = matrixPool.get().identity();
			parentTransform = updateTransformBackwards(target, pooledMatrix);
		} else parentTransform = target.parent.worldTransform;
	} else parentTransform = Matrix.IDENTITY;
	_getGlobalBounds(target, bounds, parentTransform, skipUpdateTransform);
	if (pooledMatrix) matrixPool.return(pooledMatrix);
	if (!bounds.isValid) bounds.set(0, 0, 0, 0);
	return bounds;
}
function _getGlobalBounds(target, bounds, parentTransform, skipUpdateTransform) {
	if (!target.visible || !target.measurable) return;
	let worldTransform;
	if (!skipUpdateTransform) {
		target.updateLocalTransform();
		worldTransform = matrixPool.get();
		worldTransform.appendFrom(target.localTransform, parentTransform);
	} else worldTransform = target.worldTransform;
	const parentBounds = bounds;
	const preserveBounds = !!target.effects.length;
	if (preserveBounds) bounds = boundsPool.get().clear();
	if (target.boundsArea) bounds.addRect(target.boundsArea, worldTransform);
	else {
		const renderableBounds = target.bounds;
		if (renderableBounds && !renderableBounds.isEmpty()) {
			bounds.matrix = worldTransform;
			bounds.addBounds(renderableBounds);
		}
		for (let i = 0; i < target.children.length; i++) _getGlobalBounds(target.children[i], bounds, worldTransform, skipUpdateTransform);
	}
	if (preserveBounds) {
		for (let i = 0; i < target.effects.length; i++) target.effects[i].addBounds?.(bounds);
		parentBounds.addBounds(bounds, Matrix.IDENTITY);
		boundsPool.return(bounds);
	}
	if (!skipUpdateTransform) matrixPool.return(worldTransform);
}
function updateTransformBackwards(target, parentTransform) {
	const parent = target.parent;
	if (parent) {
		updateTransformBackwards(parent, parentTransform);
		parent.updateLocalTransform();
		parentTransform.append(parent.localTransform);
	}
	return parentTransform;
}
//#endregion
//#region node_modules/pixi.js/lib/scene/container/utils/multiplyHexColors.mjs
function multiplyHexColors(color1, color2) {
	if (color1 === 16777215 || !color2) return color2;
	if (color2 === 16777215 || !color1) return color1;
	const r1 = color1 >> 16 & 255;
	const g1 = color1 >> 8 & 255;
	const b1 = color1 & 255;
	const r2 = color2 >> 16 & 255;
	const g2 = color2 >> 8 & 255;
	const b2 = color2 & 255;
	const r = r1 * r2 / 255 | 0;
	const g = g1 * g2 / 255 | 0;
	const b = b1 * b2 / 255 | 0;
	return (r << 16) + (g << 8) + b;
}
//#endregion
//#region node_modules/pixi.js/lib/scene/container/utils/multiplyColors.mjs
var WHITE_BGR = 16777215;
function multiplyColors(localBGRColor, parentBGRColor) {
	if (localBGRColor === WHITE_BGR) return parentBGRColor;
	if (parentBGRColor === WHITE_BGR) return localBGRColor;
	return multiplyHexColors(localBGRColor, parentBGRColor);
}
//#endregion
//#region node_modules/pixi.js/lib/scene/container/container-mixins/getGlobalMixin.mjs
function bgr2rgb(color) {
	return ((color & 255) << 16) + (color & 65280) + (color >> 16 & 255);
}
var getGlobalMixin = {
	getGlobalAlpha(skipUpdate) {
		if (skipUpdate) {
			if (this.renderGroup) return this.renderGroup.worldAlpha;
			if (this.parentRenderGroup) return this.parentRenderGroup.worldAlpha * this.alpha;
			return this.alpha;
		}
		let alpha = this.alpha;
		let current = this.parent;
		while (current) {
			alpha *= current.alpha;
			current = current.parent;
		}
		return alpha;
	},
	getGlobalTransform(matrix = new Matrix(), skipUpdate) {
		if (skipUpdate) return matrix.copyFrom(this.worldTransform);
		this.updateLocalTransform();
		const parentTransform = updateTransformBackwards(this, matrixPool.get().identity());
		matrix.appendFrom(this.localTransform, parentTransform);
		matrixPool.return(parentTransform);
		return matrix;
	},
	getGlobalTint(skipUpdate) {
		if (skipUpdate) {
			if (this.renderGroup) return bgr2rgb(this.renderGroup.worldColor);
			if (this.parentRenderGroup) return bgr2rgb(multiplyColors(this.localColor, this.parentRenderGroup.worldColor));
			return this.tint;
		}
		let color = this.localColor;
		let parent = this.parent;
		while (parent) {
			color = multiplyColors(color, parent.localColor);
			parent = parent.parent;
		}
		return bgr2rgb(color);
	}
};
//#endregion
//#region node_modules/pixi.js/lib/scene/container/bounds/getLocalBounds.mjs
function getLocalBounds(target, bounds, relativeMatrix) {
	bounds.clear();
	relativeMatrix || (relativeMatrix = Matrix.IDENTITY);
	_getLocalBounds(target, bounds, relativeMatrix, target, true);
	if (!bounds.isValid) bounds.set(0, 0, 0, 0);
	return bounds;
}
function _getLocalBounds(target, bounds, parentTransform, rootContainer, isRoot) {
	let relativeTransform;
	if (!isRoot) {
		if (!target.visible || !target.measurable) return;
		target.updateLocalTransform();
		const localTransform = target.localTransform;
		relativeTransform = matrixPool.get();
		relativeTransform.appendFrom(localTransform, parentTransform);
	} else {
		relativeTransform = matrixPool.get();
		relativeTransform = parentTransform.copyTo(relativeTransform);
	}
	const parentBounds = bounds;
	const preserveBounds = !!target.effects.length;
	if (preserveBounds) bounds = boundsPool.get().clear();
	if (target.boundsArea) bounds.addRect(target.boundsArea, relativeTransform);
	else {
		if (target.renderPipeId) {
			bounds.matrix = relativeTransform;
			bounds.addBounds(target.bounds);
		}
		const children = target.children;
		for (let i = 0; i < children.length; i++) _getLocalBounds(children[i], bounds, relativeTransform, rootContainer, false);
	}
	if (preserveBounds) {
		for (let i = 0; i < target.effects.length; i++) target.effects[i].addLocalBounds?.(bounds, rootContainer);
		parentBounds.addBounds(bounds, Matrix.IDENTITY);
		boundsPool.return(bounds);
	}
	matrixPool.return(relativeTransform);
}
//#endregion
//#region node_modules/pixi.js/lib/scene/container/utils/checkChildrenDidChange.mjs
function checkChildrenDidChange(container, previousData) {
	const children = container.children;
	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		const uid = child.uid;
		const didChange = (child._didViewChangeTick & 65535) << 16 | child._didContainerChangeTick & 65535;
		const index = previousData.index;
		if (previousData.data[index] !== uid || previousData.data[index + 1] !== didChange) {
			previousData.data[previousData.index] = uid;
			previousData.data[previousData.index + 1] = didChange;
			previousData.didChange = true;
		}
		previousData.index = index + 2;
		if (child.children.length) checkChildrenDidChange(child, previousData);
	}
	return previousData.didChange;
}
//#endregion
//#region node_modules/pixi.js/lib/scene/container/container-mixins/measureMixin.mjs
var tempMatrix = new Matrix();
var measureMixin = {
	_localBoundsCacheId: -1,
	_localBoundsCacheData: null,
	_setWidth(value, localWidth) {
		const sign = Math.sign(this.scale.x) || 1;
		if (localWidth !== 0) this.scale.x = value / localWidth * sign;
		else this.scale.x = sign;
	},
	_setHeight(value, localHeight) {
		const sign = Math.sign(this.scale.y) || 1;
		if (localHeight !== 0) this.scale.y = value / localHeight * sign;
		else this.scale.y = sign;
	},
	getLocalBounds() {
		if (!this._localBoundsCacheData) this._localBoundsCacheData = {
			data: [],
			index: 1,
			didChange: false,
			localBounds: new Bounds()
		};
		const localBoundsCacheData = this._localBoundsCacheData;
		localBoundsCacheData.index = 1;
		localBoundsCacheData.didChange = false;
		if (localBoundsCacheData.data[0] !== this._didViewChangeTick) {
			localBoundsCacheData.didChange = true;
			localBoundsCacheData.data[0] = this._didViewChangeTick;
		}
		checkChildrenDidChange(this, localBoundsCacheData);
		if (localBoundsCacheData.didChange) getLocalBounds(this, localBoundsCacheData.localBounds, tempMatrix);
		return localBoundsCacheData.localBounds;
	},
	getBounds(skipUpdate, bounds) {
		return getGlobalBounds(this, skipUpdate, bounds || new Bounds());
	}
};
//#endregion
//#region node_modules/pixi.js/lib/scene/container/container-mixins/onRenderMixin.mjs
var onRenderMixin = {
	_onRender: null,
	set onRender(func) {
		const renderGroup = this.renderGroup || this.parentRenderGroup;
		if (!func) {
			if (this._onRender) renderGroup?.removeOnRender(this);
			this._onRender = null;
			return;
		}
		if (!this._onRender) renderGroup?.addOnRender(this);
		this._onRender = func;
	},
	get onRender() {
		return this._onRender;
	}
};
//#endregion
//#region node_modules/pixi.js/lib/scene/container/container-mixins/sortMixin.mjs
var sortMixin = {
	_zIndex: 0,
	sortDirty: false,
	sortableChildren: false,
	get zIndex() {
		return this._zIndex;
	},
	set zIndex(value) {
		if (this._zIndex === value) return;
		this._zIndex = value;
		this.depthOfChildModified();
	},
	depthOfChildModified() {
		if (this.parent) {
			this.parent.sortableChildren = true;
			this.parent.sortDirty = true;
		}
		if (this.parentRenderGroup) this.parentRenderGroup.structureDidChange = true;
	},
	sortChildren() {
		if (!this.sortDirty) return;
		this.sortDirty = false;
		this.children.sort(sortChildren);
	}
};
function sortChildren(a, b) {
	return a._zIndex - b._zIndex;
}
//#endregion
//#region node_modules/pixi.js/lib/scene/container/container-mixins/toLocalGlobalMixin.mjs
var toLocalGlobalMixin = {
	getGlobalPosition(point = new Point(), skipUpdate = false) {
		if (this.parent) this.parent.toGlobal(this._position, point, skipUpdate);
		else {
			point.x = this._position.x;
			point.y = this._position.y;
		}
		return point;
	},
	toGlobal(position, point, skipUpdate = false) {
		const globalMatrix = this.getGlobalTransform(matrixPool.get(), skipUpdate);
		point = globalMatrix.apply(position, point);
		matrixPool.return(globalMatrix);
		return point;
	},
	toLocal(position, from, point, skipUpdate) {
		if (from) position = from.toGlobal(position, point, skipUpdate);
		const globalMatrix = this.getGlobalTransform(matrixPool.get(), skipUpdate);
		point = globalMatrix.applyInverse(position, point);
		matrixPool.return(globalMatrix);
		return point;
	}
};
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/shared/instructions/InstructionSet.mjs
var InstructionSet = class {
	constructor() {
		/** a unique id for this instruction set used through the renderer */
		this.uid = uid("instructionSet");
		/** the array of instructions */
		this.instructions = [];
		/** the actual size of the array (any instructions passed this should be ignored) */
		this.instructionSize = 0;
		this.renderables = [];
		/** used by the garbage collector to track when the instruction set was last used */
		this.gcTick = 0;
	}
	/** reset the instruction set so it can be reused set size back to 0 */
	reset() {
		this.instructionSize = 0;
	}
	/**
	* Destroy the instruction set, clearing the instructions and renderables and notifying
	* each render pipe so it can release any per-InstructionSet cached resources.
	* @internal
	*/
	destroy() {
		if (this.renderPipes) for (const i in this.renderPipes) this.renderPipes[i].destroyInstructionSet?.(this);
		this.instructions.length = 0;
		this.renderables.length = 0;
		this.renderPipes = null;
		this.gcTick = 0;
	}
	/**
	* Add an instruction to the set
	* @param instruction - add an instruction to the set
	*/
	add(instruction) {
		this.instructions[this.instructionSize++] = instruction;
	}
	/**
	* Log the instructions to the console (for debugging)
	* @internal
	*/
	log() {
		this.instructions.length = this.instructionSize;
		console.table(this.instructions, ["type", "action"]);
	}
};
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/shared/texture/utils/ScreenSizeRegistry.mjs
var ScreenSizeRegistry = class {
	constructor() {
		/** the live screen sizes in physical pixels, keyed by renderer uid */
		this._screenSizes = /* @__PURE__ */ new Map();
		/** the unique registered screen widths in physical pixels, sorted ascending */
		this._widths = [];
		/** the unique registered screen heights in physical pixels, sorted ascending */
		this._heights = [];
	}
	/** The number of renderers with a registered screen. */
	get size() {
		return this._screenSizes.size;
	}
	/**
	* Registers, or updates, the screen size of a renderer.
	* @param rendererUid - The uid of the renderer, used to update or remove this screen later.
	* @param pixelWidth - The width of the screen in physical pixels.
	* @param pixelHeight - The height of the screen in physical pixels.
	* @returns `true` if this changed the registered screens, `false` if the size was already registered.
	*/
	set(rendererUid, pixelWidth, pixelHeight) {
		const current = this._screenSizes.get(rendererUid);
		if (current && current.pixelWidth === pixelWidth && current.pixelHeight === pixelHeight) return false;
		this._screenSizes.set(rendererUid, {
			pixelWidth,
			pixelHeight
		});
		this._update();
		return true;
	}
	/**
	* Removes the screen of a renderer.
	* @param rendererUid - The uid the screen was registered with.
	* @returns `true` if a screen was removed, `false` if the renderer had none registered.
	*/
	remove(rendererUid) {
		if (!this._screenSizes.delete(rendererUid)) return false;
		this._update();
		return true;
	}
	/**
	* The smallest registered screen width the request fits in.
	* @param pixelWidth - The requested width in physical pixels.
	* @returns The smallest live screen width that is at least `pixelWidth`, or `undefined` if none.
	*/
	getFittingWidth(pixelWidth) {
		return this._getFittingAxis(pixelWidth, this._widths);
	}
	/**
	* The smallest registered screen height the request fits in.
	* @param pixelHeight - The requested height in physical pixels.
	* @returns The smallest live screen height that is at least `pixelHeight`, or `undefined` if none.
	*/
	getFittingHeight(pixelHeight) {
		return this._getFittingAxis(pixelHeight, this._heights);
	}
	/**
	* Whether a live screen uses this width.
	* @param width - The width in physical pixels.
	*/
	hasWidth(width) {
		return this._widths.includes(width);
	}
	/**
	* Whether a live screen uses this height.
	* @param height - The height in physical pixels.
	*/
	hasHeight(height) {
		return this._heights.includes(height);
	}
	/**
	* The smallest registered screen on this axis that the request still fits in.
	* @param pixelSize - The requested size on this axis in physical pixels.
	* @param screenSizes - The live screen sizes on this axis, sorted ascending.
	* @returns The smallest screen size that is at least `pixelSize`, or `undefined` if none.
	*/
	_getFittingAxis(pixelSize, screenSizes) {
		for (let i = 0; i < screenSizes.length; i++) {
			const screenSize = screenSizes[i];
			if (screenSize >= pixelSize) return screenSize;
		}
	}
	/** Rebuilds the sorted unique sizes for each axis. */
	_update() {
		this._widths = [...this._screenSizes.values()].map((screenSize) => screenSize.pixelWidth).filter((width, i, widths) => widths.indexOf(width) === i).sort((a, b) => a - b);
		this._heights = [...this._screenSizes.values()].map((screenSize) => screenSize.pixelHeight).filter((height, i, heights) => heights.indexOf(height) === i).sort((a, b) => a - b);
	}
};
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/shared/texture/TexturePool.mjs
var count = 0;
var maxKeyDimension = 32767;
var scaleBit = 4294967296;
var formatBit = 8589934592;
var formatIds = /* @__PURE__ */ Object.create(null);
var nextFormatId = 0;
function formatId(format) {
	const id = formatIds[format];
	if (id !== void 0) return id;
	return formatIds[format] = nextFormatId++;
}
function bucketKey(width, height, antialias, autoGenerateMipmaps, format, scaleMode) {
	return (width << 17) + (height << 2) + ((autoGenerateMipmaps ? 1 : 0) << 1) + (antialias ? 1 : 0) + (scaleMode === "nearest" ? 1 : 0) * scaleBit + formatId(format) * formatBit;
}
var TexturePoolClass = class {
	/**
	* @param textureOptions - options that will be passed to BaseRenderTexture constructor
	* @param {SCALE_MODE} [textureOptions.scaleMode] - See {@link SCALE_MODE} for possible values.
	*/
	constructor(textureOptions) {
		/** idle textures, keyed by format, scale mode, size and flags */
		this._buckets = /* @__PURE__ */ new Map();
		/** the bucket key of every texture handed out, by texture uid */
		this._poolKey = /* @__PURE__ */ Object.create(null);
		/** the style the pool created for every texture handed out, by texture uid */
		this._poolStyle = /* @__PURE__ */ Object.create(null);
		/** the screens this pool is sizing its textures for */
		this._screens = new ScreenSizeRegistry();
		this._enableFullScreen = false;
		this.textureOptions = textureOptions || {};
	}
	/**
	* A style built from the pool options. The pool no longer applies it to anything.
	* @deprecated since 8.21.0, pooled textures carry their own style; pass `scaleMode` in the request instead.
	*/
	get textureStyle() {
		deprecation(v8_21_0, "TexturePool.textureStyle is no longer used, pooled textures carry their own style. Pass scaleMode in the request instead.");
		if (!this._textureStyle) this._textureStyle = new TextureStyle(this.textureOptions);
		return this._textureStyle;
	}
	set textureStyle(value) {
		deprecation(v8_21_0, "TexturePool.textureStyle is no longer used, pooled textures carry their own style. Pass scaleMode in the request instead.");
		this._textureStyle = value;
	}
	/**
	* Has no effect. The pool sizes textures to the screens registered with
	* {@link TexturePoolClass#setScreenSize|setScreenSize}.
	* @deprecated since 8.21.0
	*/
	get enableFullScreen() {
		deprecation(v8_21_0, "TexturePool.enableFullScreen is no longer used, the pool sizes textures to the screens registered with setScreenSize.");
		return this._enableFullScreen;
	}
	set enableFullScreen(value) {
		deprecation(v8_21_0, "TexturePool.enableFullScreen is no longer used, the pool sizes textures to the screens registered with setScreenSize.");
		this._enableFullScreen = value;
	}
	createTexture(...args) {
		let options = args[0];
		if (typeof options === "number") {
			deprecation(v8_21_0, "TexturePool.createTexture params are now an options object. See params: { width, height, antialias, autoGenerateMipmaps }");
			options = {
				width: options,
				height: args[1],
				antialias: args[2] ?? false,
				autoGenerateMipmaps: args[3] ?? false
			};
		}
		const format = options.format ?? this.textureOptions.format ?? TextureSource.defaultOptions.format;
		const scaleMode = options.scaleMode ?? this.textureOptions.scaleMode ?? TextureStyle.defaultOptions.scaleMode;
		return new Texture({
			source: new TextureSource({
				...this.textureOptions,
				width: options.width,
				height: options.height,
				resolution: 1,
				antialias: options.antialias ?? false,
				autoGarbageCollect: false,
				autoGenerateMipmaps: options.autoGenerateMipmaps ?? false,
				format,
				scaleMode
			}),
			label: `texturePool_${count++}`
		});
	}
	getOptimalTexture(...args) {
		let options = args[0];
		if (typeof options === "number") {
			deprecation(v8_21_0, "TexturePool.getOptimalTexture params are now an options object. See params: { width, height, resolution, antialias, autoGenerateMipmaps }");
			options = {
				width: options,
				height: args[1],
				resolution: args[2] ?? 1,
				antialias: args[3] ?? false,
				autoGenerateMipmaps: args[4] ?? false
			};
		}
		const frameWidth = options.width;
		const frameHeight = options.height;
		const resolution = options.resolution ?? 1;
		const antialias = options.antialias ?? false;
		const autoGenerateMipmaps = options.autoGenerateMipmaps ?? false;
		const format = options.format ?? this.textureOptions.format ?? TextureSource.defaultOptions.format;
		const scaleMode = options.scaleMode ?? this.textureOptions.scaleMode ?? TextureStyle.defaultOptions.scaleMode;
		const { width: textureWidth, height: textureHeight } = this.getOptimalSize(frameWidth, frameHeight, resolution);
		if (textureWidth > maxKeyDimension || textureHeight > maxKeyDimension) warn(`TexturePool: ${textureWidth}x${textureHeight} is larger than the ${maxKeyDimension}px pool key limit, textures of this size may be pooled together`);
		const key = bucketKey(textureWidth, textureHeight, antialias, autoGenerateMipmaps, format, scaleMode);
		let bucket = this._buckets.get(key);
		if (!bucket) {
			bucket = [];
			this._buckets.set(key, bucket);
		}
		let texture = bucket.pop();
		if (!texture) {
			texture = this.createTexture({
				width: textureWidth,
				height: textureHeight,
				antialias,
				autoGenerateMipmaps,
				format,
				scaleMode
			});
			this._poolStyle[texture.uid] = texture.source.style;
		}
		texture.source._resolution = resolution;
		texture.source.width = textureWidth / resolution;
		texture.source.height = textureHeight / resolution;
		texture.source.pixelWidth = textureWidth;
		texture.source.pixelHeight = textureHeight;
		texture.frame.x = 0;
		texture.frame.y = 0;
		texture.frame.width = frameWidth;
		texture.frame.height = frameHeight;
		texture.updateUvs();
		this._poolKey[texture.uid] = key;
		return texture;
	}
	/**
	* The backing size, in physical pixels, that {@link TexturePoolClass#getOptimalTexture|getOptimalTexture}
	* would allocate for a request, without taking a texture from the pool.
	*
	* Each axis is the next power of two, or the smallest registered screen the request fits inside
	* (see {@link TexturePoolClass#setScreenSize|setScreenSize}). Use it when a consumer needs to know
	* where a request's content will sit inside its pooled texture before it has one, such as a uniform
	* that maps content space onto texture space.
	* @param frameWidth - The minimum width of the texture.
	* @param frameHeight - The minimum height of the texture.
	* @param resolution - The resolution of the texture.
	* @returns The width and height the pooled texture would have, in physical pixels.
	*/
	getOptimalSize(frameWidth, frameHeight, resolution = 1) {
		const pixelWidth = Math.ceil(frameWidth * resolution - 1e-6);
		const pixelHeight = Math.ceil(frameHeight * resolution - 1e-6);
		const po2Width = nextPow2(pixelWidth);
		const screenWidth = this._screens.getFittingWidth(pixelWidth);
		const po2Height = nextPow2(pixelHeight);
		const screenHeight = this._screens.getFittingHeight(pixelHeight);
		return {
			width: screenWidth !== void 0 ? Math.min(screenWidth, po2Width) : po2Width,
			height: screenHeight !== void 0 ? Math.min(screenHeight, po2Height) : po2Height
		};
	}
	/**
	* Gets a pooled texture matching the dimensions and resolution of the given texture.
	*
	* This is a convenience wrapper around {@link TexturePoolClass#getOptimalTexture|getOptimalTexture}
	* that copies width, height, and resolution from an existing texture. Useful when a filter needs
	* a temporary texture the same size as its input (e.g., for multi-pass blur).
	* @param texture - The texture whose dimensions to match.
	* @param antialias - Whether to use antialias on the pooled texture. Defaults to `false`.
	* @returns A pooled texture with power-of-two or screen sized backing dimensions at the source resolution.
	*/
	getSameSizeTexture(texture, antialias = false) {
		const source = texture.source;
		return this.getOptimalTexture({
			width: texture.width,
			height: texture.height,
			resolution: source._resolution,
			antialias
		});
	}
	/**
	* Returns a texture to the pool so it can be reused by future
	* {@link TexturePoolClass#getOptimalTexture|getOptimalTexture}
	* or {@link TexturePoolClass#getSameSizeTexture|getSameSizeTexture} calls.
	*
	* If you gave the texture a style of your own after obtaining it (a different address mode, anisotropy
	* or similar), pass `resetStyle = true` so the pool puts its own style back. Otherwise your style stays
	* on the texture and the next consumer inherits it.
	* @param renderTexture - The texture to return to the pool.
	* @param resetStyle - When `true`, restores the style the pool created for this texture. Defaults to `false`.
	*/
	returnTexture(renderTexture, resetStyle = false) {
		const uid = renderTexture.uid;
		const key = this._poolKey[uid];
		if (key === void 0) {
			warn("TexturePool: returnTexture was passed a texture that did not come from this pool, ignoring it");
			return;
		}
		const poolStyle = this._poolStyle[uid];
		if (resetStyle && renderTexture.source.style !== poolStyle) renderTexture.source.style = poolStyle;
		const textures = this._buckets.get(key);
		if (!textures) {
			delete this._poolKey[uid];
			delete this._poolStyle[uid];
			renderTexture.destroy(true);
			return;
		}
		textures.push(renderTexture);
	}
	/**
	* Registers the screen size of a renderer with the pool, in physical pixels.
	*
	* While a screen is registered, a request that fits inside it on an axis is given that screen's size on
	* that axis instead of the next power of two, which stops a full screen filter from allocating a texture
	* far larger than the screen. Requests larger than every registered screen on an axis keep the power of
	* two size - the pool never rounds a request up to a screen it does not fit in.
	* @param rendererUid - The uid of the renderer, used to update or remove this screen later.
	* @param pixelWidth - The width of the screen in physical pixels.
	* @param pixelHeight - The height of the screen in physical pixels.
	*/
	setScreenSize(rendererUid, pixelWidth, pixelHeight) {
		if (!this._screens.set(rendererUid, pixelWidth, pixelHeight)) return;
		this._pruneScreenTextures();
	}
	/**
	* Removes a screen previously registered with
	* {@link TexturePoolClass#setScreenSize|setScreenSize}, destroying any idle textures that were
	* only being kept for it.
	* @param rendererUid - The uid the screen was registered with.
	*/
	removeScreen(rendererUid) {
		if (!this._screens.remove(rendererUid)) return;
		this._pruneScreenTextures();
	}
	/**
	* Destroys the idle textures in every bucket that has a non power of two dimension matching no live
	* screen. Power of two buckets are always kept, as any request can fall back to them.
	*/
	_pruneScreenTextures() {
		for (const [key, textures] of this._buckets) {
			const packed = key >>> 0;
			const width = packed >>> 17;
			const height = packed >>> 2 & 32767;
			if ((isPow2(width) || this._screens.hasWidth(width)) && (isPow2(height) || this._screens.hasHeight(height))) continue;
			this._dropTextures(textures, true);
			this._buckets.delete(key);
		}
	}
	/**
	* Forgets idle textures were ever handed out, so a later return is ignored, and optionally destroys them.
	* @param textures - The textures of one bucket.
	* @param destroy - Whether to destroy the textures as well.
	*/
	_dropTextures(textures, destroy) {
		for (let i = 0; i < textures.length; i++) {
			const texture = textures[i];
			delete this._poolKey[texture.uid];
			delete this._poolStyle[texture.uid];
			if (destroy) texture.destroy(true);
		}
	}
	/**
	* Clears the pool.
	* @param destroyTextures - Destroy all stored textures.
	*/
	clear(destroyTextures) {
		for (const textures of this._buckets.values()) this._dropTextures(textures, destroyTextures !== false);
		this._buckets.clear();
	}
};
var TexturePool = new TexturePoolClass();
GlobalResourceRegistry.register(TexturePool);
//#endregion
//#region node_modules/pixi.js/lib/scene/container/RenderGroup.mjs
var RenderGroup = class {
	constructor() {
		this.renderPipeId = "renderGroup";
		this.root = null;
		this.canBundle = false;
		this.renderGroupParent = null;
		this.renderGroupChildren = [];
		this.worldTransform = new Matrix();
		this.worldColorAlpha = 4294967295;
		this.worldColor = 16777215;
		this.worldAlpha = 1;
		this.childrenToUpdate = /* @__PURE__ */ Object.create(null);
		this.updateTick = 0;
		this.gcTick = 0;
		this.childrenRenderablesToUpdate = {
			list: [],
			index: 0
		};
		this.structureDidChange = true;
		this.instructionSet = new InstructionSet();
		this._onRenderContainers = [];
		/**
		* Indicates if the cached texture needs to be updated.
		* @default true
		*/
		this.textureNeedsUpdate = true;
		/**
		* Indicates if the container should be cached as a texture.
		* @default false
		*/
		this.isCachedAsTexture = false;
		this._matrixDirty = 7;
	}
	init(root) {
		this.root = root;
		if (root._onRender) this.addOnRender(root);
		root.didChange = true;
		const children = root.children;
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			child._updateFlags = 15;
			this.addChild(child);
		}
	}
	enableCacheAsTexture(options = {}) {
		this.textureOptions = options;
		this.isCachedAsTexture = true;
		this.textureNeedsUpdate = true;
	}
	disableCacheAsTexture() {
		this.isCachedAsTexture = false;
		if (this.texture) {
			TexturePool.returnTexture(this.texture);
			this.texture = null;
		}
	}
	updateCacheTexture() {
		this.textureNeedsUpdate = true;
		const cachedParent = this._parentCacheAsTextureRenderGroup;
		if (cachedParent && !cachedParent.textureNeedsUpdate) cachedParent.updateCacheTexture();
	}
	reset() {
		this.renderGroupChildren.length = 0;
		for (const i in this.childrenToUpdate) {
			const childrenAtDepth = this.childrenToUpdate[i];
			childrenAtDepth.list.fill(null);
			childrenAtDepth.index = 0;
		}
		this.childrenRenderablesToUpdate.index = 0;
		this.childrenRenderablesToUpdate.list.fill(null);
		this.root = null;
		this.updateTick = 0;
		this.structureDidChange = true;
		this._onRenderContainers.length = 0;
		this.renderGroupParent = null;
		this.disableCacheAsTexture();
	}
	get localTransform() {
		return this.root.localTransform;
	}
	addRenderGroupChild(renderGroupChild) {
		if (renderGroupChild.renderGroupParent) renderGroupChild.renderGroupParent._removeRenderGroupChild(renderGroupChild);
		renderGroupChild.renderGroupParent = this;
		this.renderGroupChildren.push(renderGroupChild);
	}
	_removeRenderGroupChild(renderGroupChild) {
		const index = this.renderGroupChildren.indexOf(renderGroupChild);
		if (index > -1) this.renderGroupChildren.splice(index, 1);
		renderGroupChild.renderGroupParent = null;
	}
	addChild(child) {
		this.structureDidChange = true;
		child.parentRenderGroup = this;
		child.updateTick = -1;
		if (child.parent === this.root) child.relativeRenderGroupDepth = 1;
		else child.relativeRenderGroupDepth = child.parent.relativeRenderGroupDepth + 1;
		child.didChange = true;
		this.onChildUpdate(child);
		if (child.renderGroup) {
			this.addRenderGroupChild(child.renderGroup);
			return;
		}
		if (child._onRender) this.addOnRender(child);
		const children = child.children;
		for (let i = 0; i < children.length; i++) this.addChild(children[i]);
	}
	removeChild(child) {
		this.structureDidChange = true;
		if (child._onRender) {
			if (!child.renderGroup) this.removeOnRender(child);
		}
		child.parentRenderGroup = null;
		if (child.renderGroup) {
			this._removeRenderGroupChild(child.renderGroup);
			return;
		}
		const children = child.children;
		for (let i = 0; i < children.length; i++) this.removeChild(children[i]);
	}
	removeChildren(children) {
		for (let i = 0; i < children.length; i++) this.removeChild(children[i]);
	}
	onChildUpdate(child) {
		let childrenToUpdate = this.childrenToUpdate[child.relativeRenderGroupDepth];
		if (!childrenToUpdate) childrenToUpdate = this.childrenToUpdate[child.relativeRenderGroupDepth] = {
			index: 0,
			list: []
		};
		childrenToUpdate.list[childrenToUpdate.index++] = child;
	}
	updateRenderable(renderable) {
		if (renderable.globalDisplayStatus < 7) return;
		this.instructionSet.renderPipes[renderable.renderPipeId].updateRenderable(renderable);
		renderable.didViewUpdate = false;
	}
	onChildViewUpdate(child) {
		this.childrenRenderablesToUpdate.list[this.childrenRenderablesToUpdate.index++] = child;
	}
	get isRenderable() {
		return this.root.localDisplayStatus === 7 && this.worldAlpha > 0;
	}
	/**
	* adding a container to the onRender list will make sure the user function
	* passed in to the user defined 'onRender` callBack
	* @param container - the container to add to the onRender list
	*/
	addOnRender(container) {
		if (this._onRenderContainers.indexOf(container) === -1) this._onRenderContainers.push(container);
	}
	removeOnRender(container) {
		const idx = this._onRenderContainers.indexOf(container);
		if (idx !== -1) this._onRenderContainers.splice(idx, 1);
	}
	runOnRender(renderer) {
		for (let i = 0; i < this._onRenderContainers.length; i++) this._onRenderContainers[i]._onRender(renderer);
	}
	destroy() {
		this.disableCacheAsTexture();
		this.renderGroupParent = null;
		this.root = null;
		this.childrenRenderablesToUpdate = null;
		this.childrenToUpdate = null;
		this.renderGroupChildren = null;
		this._onRenderContainers = null;
		this.instructionSet?.destroy();
		this.instructionSet = null;
	}
	getChildren(out = []) {
		const children = this.root.children;
		for (let i = 0; i < children.length; i++) this._getChildren(children[i], out);
		return out;
	}
	_getChildren(container, out = []) {
		out.push(container);
		if (container.renderGroup) return out;
		const children = container.children;
		for (let i = 0; i < children.length; i++) this._getChildren(children[i], out);
		return out;
	}
	invalidateMatrices() {
		this._matrixDirty = 7;
	}
	/**
	* Returns the inverse of the world transform matrix.
	* @returns {Matrix} The inverse of the world transform matrix.
	*/
	get inverseWorldTransform() {
		if ((this._matrixDirty & 1) === 0) return this._inverseWorldTransform;
		this._matrixDirty &= -2;
		this._inverseWorldTransform || (this._inverseWorldTransform = new Matrix());
		return this._inverseWorldTransform.copyFrom(this.worldTransform).invert();
	}
	/**
	* Returns the inverse of the texture offset transform matrix.
	* @returns {Matrix} The inverse of the texture offset transform matrix.
	*/
	get textureOffsetInverseTransform() {
		if ((this._matrixDirty & 2) === 0) return this._textureOffsetInverseTransform;
		this._matrixDirty &= -3;
		this._textureOffsetInverseTransform || (this._textureOffsetInverseTransform = new Matrix());
		return this._textureOffsetInverseTransform.copyFrom(this.inverseWorldTransform).translate(-this._textureBounds.x, -this._textureBounds.y);
	}
	/**
	* Returns the inverse of the parent texture transform matrix.
	* This is used to properly transform coordinates when rendering into cached textures.
	* @returns {Matrix} The inverse of the parent texture transform matrix.
	*/
	get inverseParentTextureTransform() {
		if ((this._matrixDirty & 4) === 0) return this._inverseParentTextureTransform;
		this._matrixDirty &= -5;
		const parentCacheAsTexture = this._parentCacheAsTextureRenderGroup;
		if (parentCacheAsTexture) {
			this._inverseParentTextureTransform || (this._inverseParentTextureTransform = new Matrix());
			return this._inverseParentTextureTransform.copyFrom(this.worldTransform).prepend(parentCacheAsTexture.inverseWorldTransform).translate(-parentCacheAsTexture._textureBounds.x, -parentCacheAsTexture._textureBounds.y);
		}
		return this.worldTransform;
	}
	/**
	* Returns a matrix that transforms coordinates to the correct coordinate space of the texture being rendered to.
	* This is the texture offset inverse transform of the closest parent RenderGroup that is cached as a texture.
	* @returns {Matrix | null} The transform matrix for the cached texture coordinate space,
	* or null if no parent is cached as texture.
	*/
	get cacheToLocalTransform() {
		if (this.isCachedAsTexture) return this.textureOffsetInverseTransform;
		if (!this._parentCacheAsTextureRenderGroup) return null;
		return this._parentCacheAsTextureRenderGroup.textureOffsetInverseTransform;
	}
};
//#endregion
//#region node_modules/pixi.js/lib/scene/container/utils/assignWithIgnore.mjs
function assignWithIgnore(target, options, ignore = {}) {
	for (const key in options) if (!ignore[key] && options[key] !== void 0) target[key] = options[key];
}
//#endregion
//#region node_modules/pixi.js/lib/scene/container/Container.mjs
var defaultSkew = new ObservablePoint(null);
var defaultPivot = new ObservablePoint(null);
var defaultScale = new ObservablePoint(null, 1, 1);
var defaultOrigin = new ObservablePoint(null);
var UPDATE_COLOR = 1;
var UPDATE_BLEND = 2;
var UPDATE_VISIBLE = 4;
var UPDATE_TRANSFORM = 8;
var Container = class Container extends eventemitter3_default {
	constructor(options = {}) {
		super();
		/**
		* unique id for this container
		* @internal
		*/
		this.uid = uid("renderable");
		/** @private */
		this._updateFlags = 15;
		/** @private */
		this.renderGroup = null;
		/** @private */
		this.parentRenderGroup = null;
		/** @private */
		this.parentRenderGroupIndex = 0;
		/** @private */
		this.didChange = false;
		/** @private */
		this.didViewUpdate = false;
		/** @private */
		this.relativeRenderGroupDepth = 0;
		/**
		* The array of children of this container. Each child must be a Container or extend from it.
		*
		* The array is read-only, but its contents can be modified using Container methods.
		* @example
		* ```ts
		* // Access children
		* const firstChild = container.children[0];
		* const lastChild = container.children[container.children.length - 1];
		* ```
		* @readonly
		* @see {@link Container#addChild} For adding children
		* @see {@link Container#removeChild} For removing children
		*/
		this.children = [];
		/**
		* The display object container that contains this display object.
		* This represents the parent-child relationship in the display tree.
		* @example
		* ```ts
		* // Basic parent access
		* const parent = sprite.parent;
		*
		* // Walk up the tree
		* let current = sprite;
		* while (current.parent) {
		*     console.log('Level up:', current.parent.constructor.name);
		*     current = current.parent;
		* }
		* ```
		* @readonly
		* @see {@link Container#addChild} For adding to a parent
		* @see {@link Container#removeChild} For removing from parent
		*/
		this.parent = null;
		/** @private */
		this.includeInBuild = true;
		/** @private */
		this.measurable = true;
		/** @private */
		this.isSimple = true;
		/**
		* The RenderLayer this container belongs to, if any.
		* If it belongs to a RenderLayer, it will be rendered from the RenderLayer's position in the scene.
		* @readonly
		* @advanced
		*/
		this.parentRenderLayer = null;
		/** @internal */
		this.updateTick = -1;
		/**
		* Current transform of the object based on local factors: position, scale, other stuff.
		* This matrix represents the local transformation without any parent influence.
		* @example
		* ```ts
		* // Basic transform access
		* const localMatrix = sprite.localTransform;
		* console.log(localMatrix.toString());
		* ```
		* @readonly
		* @see {@link Container#worldTransform} For global transform
		* @see {@link Container#groupTransform} For render group transform
		*/
		this.localTransform = new Matrix();
		/**
		* The relative group transform is a transform relative to the render group it belongs too. It will include all parent
		* transforms and up to the render group (think of it as kind of like a stage - but the stage can be nested).
		* If this container is is self a render group matrix will be relative to its parent render group
		* @readonly
		* @advanced
		*/
		this.relativeGroupTransform = new Matrix();
		/**
		* The group transform is a transform relative to the render group it belongs too.
		* If this container is render group then this will be an identity matrix. other wise it
		* will be the same as the relativeGroupTransform.
		* Use this value when actually rendering things to the screen
		* @readonly
		* @advanced
		*/
		this.groupTransform = this.relativeGroupTransform;
		/**
		* Whether this object has been destroyed. If true, the object should no longer be used.
		* After an object is destroyed, all of its functionality is disabled and references are removed.
		* @example
		* ```ts
		* // Cleanup with destroy
		* sprite.destroy();
		* console.log(sprite.destroyed); // true
		* ```
		* @default false
		* @see {@link Container#destroy} For destroying objects
		*/
		this.destroyed = false;
		/**
		* The coordinate of the object relative to the local coordinates of the parent.
		* @internal
		*/
		this._position = new ObservablePoint(this, 0, 0);
		/**
		* The scale factor of the object.
		* @internal
		*/
		this._scale = defaultScale;
		/**
		* The pivot point of the container that it rotates around.
		* @internal
		*/
		this._pivot = defaultPivot;
		/**
		* The origin point around which the container rotates and scales.
		* Unlike pivot, changing origin will not move the container's position.
		* @private
		*/
		this._origin = defaultOrigin;
		/**
		* The skew amount, on the x and y axis.
		* @internal
		*/
		this._skew = defaultSkew;
		/**
		* The X-coordinate value of the normalized local X axis,
		* the first column of the local transformation matrix without a scale.
		* @internal
		*/
		this._cx = 1;
		/**
		* The Y-coordinate value of the normalized local X axis,
		* the first column of the local transformation matrix without a scale.
		* @internal
		*/
		this._sx = 0;
		/**
		* The X-coordinate value of the normalized local Y axis,
		* the second column of the local transformation matrix without a scale.
		* @internal
		*/
		this._cy = 0;
		/**
		* The Y-coordinate value of the normalized local Y axis,
		* the second column of the local transformation matrix without a scale.
		* @internal
		*/
		this._sy = 1;
		/**
		* The rotation amount.
		* @internal
		*/
		this._rotation = 0;
		/** @internal */
		this.localColor = 16777215;
		/** @internal */
		this.localAlpha = 1;
		/** @internal */
		this.groupAlpha = 1;
		/** @internal */
		this.groupColor = 16777215;
		/** @internal */
		this.groupColorAlpha = 4294967295;
		/** @internal */
		this.localBlendMode = "inherit";
		/** @internal */
		this.groupBlendMode = "normal";
		/**
		* This property holds three bits: culled, visible, renderable
		* the third bit represents culling (0 = culled, 1 = not culled) 0b100
		* the second bit represents visibility (0 = not visible, 1 = visible) 0b010
		* the first bit represents renderable (0 = not renderable, 1 = renderable) 0b001
		* @internal
		*/
		this.localDisplayStatus = 7;
		/** @internal */
		this.globalDisplayStatus = 7;
		/**
		* A value that increments each time the containe is modified
		* eg children added, removed etc
		* @ignore
		*/
		this._didContainerChangeTick = 0;
		/**
		* A value that increments each time the container view is modified
		* eg texture swap, geometry change etc
		* @ignore
		*/
		this._didViewChangeTick = 0;
		/**
		* property that tracks if the container transform has changed
		* @ignore
		*/
		this._didLocalTransformChangeId = -1;
		this.effects = [];
		assignWithIgnore(this, options, {
			children: true,
			parent: true,
			effects: true
		});
		options.children?.forEach((child) => this.addChild(child));
		options.parent?.addChild(this);
	}
	/**
	* Mixes all enumerable properties and methods from a source object to Container.
	* @param source - The source of properties and methods to mix in.
	* @deprecated since 8.8.0
	*/
	static mixin(source) {
		deprecation("8.8.0", "Container.mixin is deprecated, please use extensions.mixin instead.");
		extensions.mixin(Container, source);
	}
	/**
	* We now use the _didContainerChangeTick and _didViewChangeTick to track changes
	* @deprecated since 8.2.6
	* @ignore
	*/
	set _didChangeId(value) {
		this._didViewChangeTick = value >> 12 & 4095;
		this._didContainerChangeTick = value & 4095;
	}
	/** @ignore */
	get _didChangeId() {
		return this._didContainerChangeTick & 4095 | (this._didViewChangeTick & 4095) << 12;
	}
	/**
	* Adds one or more children to the container.
	* The children will be rendered as part of this container's display list.
	* @example
	* ```ts
	* // Add a single child
	* container.addChild(sprite);
	*
	* // Add multiple children
	* container.addChild(background, player, foreground);
	*
	* // Add with type checking
	* const sprite = container.addChild<Sprite>(new Sprite(texture));
	* sprite.tint = 'red';
	* ```
	* @param children - The Container(s) to add to the container
	* @returns The first child that was added
	* @see {@link Container#removeChild} For removing children
	* @see {@link Container#addChildAt} For adding at specific index
	*/
	addChild(...children) {
		if (!this.allowChildren) deprecation(v8_0_0, "addChild: Only Containers will be allowed to add children in v8.0.0");
		if (children.length > 1) {
			for (let i = 0; i < children.length; i++) this.addChild(children[i]);
			return children[0];
		}
		const child = children[0];
		const renderGroup = this.renderGroup || this.parentRenderGroup;
		if (child.parent === this) {
			this.children.splice(this.children.indexOf(child), 1);
			this.children.push(child);
			if (renderGroup) renderGroup.structureDidChange = true;
			return child;
		}
		if (child.parent) child.parent.removeChild(child);
		this.children.push(child);
		if (this.sortableChildren) this.sortDirty = true;
		child.parent = this;
		child.didChange = true;
		child._updateFlags = 15;
		if (renderGroup) renderGroup.addChild(child);
		this.emit("childAdded", child, this, this.children.length - 1);
		child.emit("added", this);
		this._didViewChangeTick++;
		if (child._zIndex !== 0) child.depthOfChildModified();
		return child;
	}
	/**
	* Removes one or more children from the container.
	* When removing multiple children, events will be triggered for each child in sequence.
	* @example
	* ```ts
	* // Remove a single child
	* const removed = container.removeChild(sprite);
	*
	* // Remove multiple children
	* const bg = container.removeChild(background, player, userInterface);
	*
	* // Remove with type checking
	* const sprite = container.removeChild<Sprite>(childSprite);
	* sprite.texture = newTexture;
	* ```
	* @param children - The Container(s) to remove
	* @returns The first child that was removed
	* @see {@link Container#addChild} For adding children
	* @see {@link Container#removeChildren} For removing multiple children
	*/
	removeChild(...children) {
		if (children.length > 1) {
			for (let i = 0; i < children.length; i++) this.removeChild(children[i]);
			return children[0];
		}
		const child = children[0];
		const index = this.children.indexOf(child);
		if (index > -1) {
			this._didViewChangeTick++;
			this.children.splice(index, 1);
			if (this.renderGroup) this.renderGroup.removeChild(child);
			else if (this.parentRenderGroup) this.parentRenderGroup.removeChild(child);
			if (child.parentRenderLayer) child.parentRenderLayer.detach(child);
			child.parent = null;
			this.emit("childRemoved", child, this, index);
			child.emit("removed", this);
		}
		return child;
	}
	/** @ignore */
	_onUpdate(point) {
		if (point) {
			if (point === this._skew) this._updateSkew();
		}
		this._didContainerChangeTick++;
		if (this.didChange) return;
		this.didChange = true;
		if (this.parentRenderGroup) this.parentRenderGroup.onChildUpdate(this);
	}
	set isRenderGroup(value) {
		if (!!this.renderGroup === value) return;
		if (value) this.enableRenderGroup();
		else this.disableRenderGroup();
	}
	/**
	* Returns true if this container is a render group.
	* This means that it will be rendered as a separate pass, with its own set of instructions
	* @advanced
	*/
	get isRenderGroup() {
		return !!this.renderGroup;
	}
	/**
	* Calling this enables a render group for this container.
	* This means it will be rendered as a separate set of instructions.
	* The transform of the container will also be handled on the GPU rather than the CPU.
	* @advanced
	*/
	enableRenderGroup() {
		if (this.renderGroup) return;
		const parentRenderGroup = this.parentRenderGroup;
		parentRenderGroup?.removeChild(this);
		this.renderGroup = BigPool.get(RenderGroup, this);
		this.groupTransform = Matrix.IDENTITY;
		parentRenderGroup?.addChild(this);
		this._updateIsSimple();
	}
	/**
	* This will disable the render group for this container.
	* @advanced
	*/
	disableRenderGroup() {
		if (!this.renderGroup) return;
		const parentRenderGroup = this.parentRenderGroup;
		parentRenderGroup?.removeChild(this);
		BigPool.return(this.renderGroup);
		this.renderGroup = null;
		this.groupTransform = this.relativeGroupTransform;
		parentRenderGroup?.addChild(this);
		this._updateIsSimple();
	}
	/** @ignore */
	_updateIsSimple() {
		this.isSimple = !this.renderGroup && this.effects.length === 0;
	}
	/**
	* Current transform of the object based on world (parent) factors.
	*
	* This matrix represents the absolute transformation in the scene graph.
	* @example
	* ```ts
	* // Get world position
	* const worldPos = container.worldTransform;
	* console.log(`World position: (${worldPos.tx}, ${worldPos.ty})`);
	* ```
	* @readonly
	* @see {@link Container#localTransform} For local space transform
	*/
	get worldTransform() {
		this._worldTransform || (this._worldTransform = new Matrix());
		if (this.renderGroup) this._worldTransform.copyFrom(this.renderGroup.worldTransform);
		else if (this.parentRenderGroup) this._worldTransform.appendFrom(this.relativeGroupTransform, this.parentRenderGroup.worldTransform);
		return this._worldTransform;
	}
	/**
	* The position of the container on the x axis relative to the local coordinates of the parent.
	*
	* An alias to position.x
	* @example
	* ```ts
	* // Basic position
	* container.x = 100;
	* ```
	*/
	get x() {
		return this._position.x;
	}
	set x(value) {
		this._position.x = value;
	}
	/**
	* The position of the container on the y axis relative to the local coordinates of the parent.
	*
	* An alias to position.y
	* @example
	* ```ts
	* // Basic position
	* container.y = 200;
	* ```
	*/
	get y() {
		return this._position.y;
	}
	set y(value) {
		this._position.y = value;
	}
	/**
	* The coordinate of the object relative to the local coordinates of the parent.
	* @example
	* ```ts
	* // Basic position setting
	* container.position.set(100, 200);
	* container.position.set(100); // Sets both x and y to 100
	* // Using point data
	* container.position = { x: 50, y: 75 };
	* ```
	* @since 4.0.0
	*/
	get position() {
		return this._position;
	}
	set position(value) {
		this._position.copyFrom(value);
	}
	/**
	* The rotation of the object in radians.
	*
	* > [!NOTE] 'rotation' and 'angle' have the same effect on a display object;
	* > rotation is in radians, angle is in degrees.
	* @example
	* ```ts
	* // Basic rotation
	* container.rotation = Math.PI / 4; // 45 degrees
	*
	* // Convert from degrees
	* const degrees = 45;
	* container.rotation = degrees * Math.PI / 180;
	*
	* // Rotate around center
	* container.pivot.set(container.width / 2, container.height / 2);
	* container.rotation = Math.PI; // 180 degrees
	*
	* // Rotate around center with origin
	* container.origin.set(container.width / 2, container.height / 2);
	* container.rotation = Math.PI; // 180 degrees
	* ```
	*/
	get rotation() {
		return this._rotation;
	}
	set rotation(value) {
		if (this._rotation !== value) {
			this._rotation = value;
			this._onUpdate(this._skew);
		}
	}
	/**
	* The angle of the object in degrees.
	*
	* > [!NOTE] 'rotation' and 'angle' have the same effect on a display object;
	* > rotation is in radians, angle is in degrees.
	* @example
	* ```ts
	* // Basic angle rotation
	* sprite.angle = 45; // 45 degrees
	*
	* // Rotate around center
	* sprite.pivot.set(sprite.width / 2, sprite.height / 2);
	* sprite.angle = 180; // Half rotation
	*
	* // Rotate around center with origin
	* sprite.origin.set(sprite.width / 2, sprite.height / 2);
	* sprite.angle = 180; // Half rotation
	*
	* // Reset rotation
	* sprite.angle = 0;
	* ```
	*/
	get angle() {
		return this.rotation * RAD_TO_DEG;
	}
	set angle(value) {
		this.rotation = value * DEG_TO_RAD;
	}
	/**
	* The center of rotation, scaling, and skewing for this display object in its local space.
	* The `position` is the projection of `pivot` in the parent's local space.
	*
	* By default, the pivot is the origin (0, 0).
	* @example
	* ```ts
	* // Rotate around center
	* container.pivot.set(container.width / 2, container.height / 2);
	* container.rotation = Math.PI; // Rotates around center
	* ```
	* @since 4.0.0
	*/
	get pivot() {
		if (this._pivot === defaultPivot) this._pivot = new ObservablePoint(this, 0, 0);
		return this._pivot;
	}
	set pivot(value) {
		if (this._pivot === defaultPivot) {
			this._pivot = new ObservablePoint(this, 0, 0);
			if (this._origin !== defaultOrigin) warn(`Setting both a pivot and origin on a Container is not recommended. This can lead to unexpected behavior if not handled carefully.`);
		}
		typeof value === "number" ? this._pivot.set(value) : this._pivot.copyFrom(value);
	}
	/**
	* The skew factor for the object in radians. Skewing is a transformation that distorts
	* the object by rotating it differently at each point, creating a non-uniform shape.
	* @example
	* ```ts
	* // Basic skewing
	* container.skew.set(0.5, 0); // Skew horizontally
	* container.skew.set(0, 0.5); // Skew vertically
	*
	* // Skew with point data
	* container.skew = { x: 0.3, y: 0.3 }; // Diagonal skew
	*
	* // Reset skew
	* container.skew.set(0, 0);
	*
	* // Animate skew
	* app.ticker.add(() => {
	*     // Create wave effect
	*     container.skew.x = Math.sin(Date.now() / 1000) * 0.3;
	* });
	*
	* // Combine with rotation
	* container.rotation = Math.PI / 4; // 45 degrees
	* container.skew.set(0.2, 0.2); // Skew the rotated object
	* ```
	* @since 4.0.0
	* @type {ObservablePoint} Point-like object with x/y properties in radians
	* @default {x: 0, y: 0}
	*/
	get skew() {
		if (this._skew === defaultSkew) this._skew = new ObservablePoint(this, 0, 0);
		return this._skew;
	}
	set skew(value) {
		if (this._skew === defaultSkew) this._skew = new ObservablePoint(this, 0, 0);
		this._skew.copyFrom(value);
	}
	/**
	* The scale factors of this object along the local coordinate axes.
	*
	* The default scale is (1, 1).
	* @example
	* ```ts
	* // Basic scaling
	* container.scale.set(2, 2); // Scales to double size
	* container.scale.set(2); // Scales uniformly to double size
	* container.scale = 2; // Scales uniformly to double size
	* // Scale to a specific width and height
	* container.setSize(200, 100); // Sets width to 200 and height to 100
	* ```
	* @since 4.0.0
	*/
	get scale() {
		if (this._scale === defaultScale) this._scale = new ObservablePoint(this, 1, 1);
		return this._scale;
	}
	set scale(value) {
		if (this._scale === defaultScale) this._scale = new ObservablePoint(this, 0, 0);
		if (typeof value === "string") value = parseFloat(value);
		typeof value === "number" ? this._scale.set(value) : this._scale.copyFrom(value);
	}
	/**
	* @experimental
	* The origin point around which the container rotates and scales without affecting its position.
	* Unlike pivot, changing the origin will not move the container's position.
	* @example
	* ```ts
	* // Rotate around center point
	* container.origin.set(container.width / 2, container.height / 2);
	* container.rotation = Math.PI; // Rotates around center
	*
	* // Reset origin
	* container.origin.set(0, 0);
	* ```
	*/
	get origin() {
		if (this._origin === defaultOrigin) this._origin = new ObservablePoint(this, 0, 0);
		return this._origin;
	}
	set origin(value) {
		if (this._origin === defaultOrigin) {
			this._origin = new ObservablePoint(this, 0, 0);
			if (this._pivot !== defaultPivot) warn(`Setting both a pivot and origin on a Container is not recommended. This can lead to unexpected behavior if not handled carefully.`);
		}
		typeof value === "number" ? this._origin.set(value) : this._origin.copyFrom(value);
	}
	/**
	* The width of the Container, setting this will actually modify the scale to achieve the value set.
	* > [!NOTE] Changing the width will adjust the scale.x property of the container while maintaining its aspect ratio.
	* > [!NOTE] If you want to set both width and height at the same time, use {@link Container#setSize}
	* as it is more optimized by not recalculating the local bounds twice.
	* @example
	* ```ts
	* // Basic width setting
	* container.width = 100;
	* // Optimized width setting
	* container.setSize(100, 100);
	* ```
	*/
	get width() {
		return Math.abs(this.scale.x * this.getLocalBounds().width);
	}
	set width(value) {
		const localWidth = this.getLocalBounds().width;
		this._setWidth(value, localWidth);
	}
	/**
	* The height of the Container,
	* > [!NOTE] Changing the height will adjust the scale.y property of the container while maintaining its aspect ratio.
	* > [!NOTE] If you want to set both width and height at the same time, use {@link Container#setSize}
	* as it is more optimized by not recalculating the local bounds twice.
	* @example
	* ```ts
	* // Basic height setting
	* container.height = 200;
	* // Optimized height setting
	* container.setSize(100, 200);
	* ```
	*/
	get height() {
		return Math.abs(this.scale.y * this.getLocalBounds().height);
	}
	set height(value) {
		const localHeight = this.getLocalBounds().height;
		this._setHeight(value, localHeight);
	}
	/**
	* Retrieves the size of the container as a [Size]{@link Size} object.
	*
	* This is faster than get the width and height separately.
	* @example
	* ```ts
	* // Basic size retrieval
	* const size = container.getSize();
	* console.log(`Size: ${size.width}x${size.height}`);
	*
	* // Reuse existing size object
	* const reuseSize = { width: 0, height: 0 };
	* container.getSize(reuseSize);
	* ```
	* @param out - Optional object to store the size in.
	* @returns The size of the container.
	*/
	getSize(out) {
		if (!out) out = {};
		const bounds = this.getLocalBounds();
		out.width = Math.abs(this.scale.x * bounds.width);
		out.height = Math.abs(this.scale.y * bounds.height);
		return out;
	}
	/**
	* Sets the size of the container to the specified width and height.
	* This is more efficient than setting width and height separately as it only recalculates bounds once.
	* @example
	* ```ts
	* // Basic size setting
	* container.setSize(100, 200);
	*
	* // Set uniform size
	* container.setSize(100); // Sets both width and height to 100
	* ```
	* @param value - This can be either a number or a [Size]{@link Size} object.
	* @param height - The height to set. Defaults to the value of `width` if not provided.
	*/
	setSize(value, height) {
		const size = this.getLocalBounds();
		if (typeof value === "object") {
			height = value.height ?? value.width;
			value = value.width;
		} else height ?? (height = value);
		value !== void 0 && this._setWidth(value, size.width);
		height !== void 0 && this._setHeight(height, size.height);
	}
	/** Called when the skew or the rotation changes. */
	_updateSkew() {
		const rotation = this._rotation;
		const skew = this._skew;
		this._cx = Math.cos(rotation + skew._y);
		this._sx = Math.sin(rotation + skew._y);
		this._cy = -Math.sin(rotation - skew._x);
		this._sy = Math.cos(rotation - skew._x);
	}
	/**
	* Updates the transform properties of the container.
	* Allows partial updates of transform properties for optimized manipulation.
	* @example
	* ```ts
	* // Basic transform update
	* container.updateTransform({
	*     x: 100,
	*     y: 200,
	*     rotation: Math.PI / 4
	* });
	*
	* // Scale and rotate around center
	* sprite.updateTransform({
	*     pivotX: sprite.width / 2,
	*     pivotY: sprite.height / 2,
	*     scaleX: 2,
	*     scaleY: 2,
	*     rotation: Math.PI
	* });
	*
	* // Update position only
	* button.updateTransform({
	*     x: button.x + 10, // Move right
	*     y: button.y      // Keep same y
	* });
	* ```
	* @param opts - Transform options to update
	* @param opts.x - The x position
	* @param opts.y - The y position
	* @param opts.scaleX - The x-axis scale factor
	* @param opts.scaleY - The y-axis scale factor
	* @param opts.rotation - The rotation in radians
	* @param opts.skewX - The x-axis skew factor
	* @param opts.skewY - The y-axis skew factor
	* @param opts.pivotX - The x-axis pivot point
	* @param opts.pivotY - The y-axis pivot point
	* @returns This container, for chaining
	* @see {@link Container#setFromMatrix} For matrix-based transforms
	* @see {@link Container#position} For direct position access
	*/
	updateTransform(opts) {
		this.position.set(typeof opts.x === "number" ? opts.x : this.position.x, typeof opts.y === "number" ? opts.y : this.position.y);
		this.scale.set(typeof opts.scaleX === "number" ? opts.scaleX : this.scale.x, typeof opts.scaleY === "number" ? opts.scaleY : this.scale.y);
		this.rotation = typeof opts.rotation === "number" ? opts.rotation : this.rotation;
		this.skew.set(typeof opts.skewX === "number" ? opts.skewX : this.skew.x, typeof opts.skewY === "number" ? opts.skewY : this.skew.y);
		this.pivot.set(typeof opts.pivotX === "number" ? opts.pivotX : this.pivot.x, typeof opts.pivotY === "number" ? opts.pivotY : this.pivot.y);
		this.origin.set(typeof opts.originX === "number" ? opts.originX : this.origin.x, typeof opts.originY === "number" ? opts.originY : this.origin.y);
		return this;
	}
	/**
	* Updates the local transform properties by decomposing the given matrix.
	* Extracts position, scale, rotation, and skew from a transformation matrix.
	* @example
	* ```ts
	* // Basic matrix transform
	* const matrix = new Matrix()
	*     .translate(100, 100)
	*     .rotate(Math.PI / 4)
	*     .scale(2, 2);
	*
	* container.setFromMatrix(matrix);
	*
	* // Copy transform from another container
	* const source = new Container();
	* source.position.set(100, 100);
	* source.rotation = Math.PI / 2;
	*
	* target.setFromMatrix(source.localTransform);
	*
	* // Reset transform
	* container.setFromMatrix(Matrix.IDENTITY);
	* ```
	* @param matrix - The matrix to use for updating the transform
	* @see {@link Container#updateTransform} For property-based updates
	* @see {@link Matrix#decompose} For matrix decomposition details
	*/
	setFromMatrix(matrix) {
		matrix.decompose(this);
	}
	/** Updates the local transform. */
	updateLocalTransform() {
		const localTransformChangeId = this._didContainerChangeTick;
		if (this._didLocalTransformChangeId === localTransformChangeId) return;
		this._didLocalTransformChangeId = localTransformChangeId;
		const lt = this.localTransform;
		const scale = this._scale;
		const pivot = this._pivot;
		const origin = this._origin;
		const position = this._position;
		const sx = scale._x;
		const sy = scale._y;
		const px = pivot._x;
		const py = pivot._y;
		const ox = -origin._x;
		const oy = -origin._y;
		lt.a = this._cx * sx;
		lt.b = this._sx * sx;
		lt.c = this._cy * sy;
		lt.d = this._sy * sy;
		lt.tx = position._x - (px * lt.a + py * lt.c) + (ox * lt.a + oy * lt.c) - ox;
		lt.ty = position._y - (px * lt.b + py * lt.d) + (ox * lt.b + oy * lt.d) - oy;
	}
	set alpha(value) {
		if (value === this.localAlpha) return;
		this.localAlpha = value;
		this._updateFlags |= 1;
		this._onUpdate();
	}
	/**
	* The opacity of the object relative to its parent's opacity.
	* Value ranges from 0 (fully transparent) to 1 (fully opaque).
	* @example
	* ```ts
	* // Basic transparency
	* sprite.alpha = 0.5; // 50% opacity
	*
	* // Inherited opacity
	* container.alpha = 0.5;
	* const child = new Sprite(texture);
	* child.alpha = 0.5;
	* container.addChild(child);
	* // child's effective opacity is 0.25 (0.5 * 0.5)
	* ```
	* @default 1
	* @see {@link Container#visible} For toggling visibility
	* @see {@link Container#renderable} For render control
	*/
	get alpha() {
		return this.localAlpha;
	}
	set tint(value) {
		const bgr = Color.shared.setValue(value ?? 16777215).toBgrNumber();
		if (bgr === this.localColor) return;
		this.localColor = bgr;
		this._updateFlags |= 1;
		this._onUpdate();
	}
	/**
	* The tint applied to the sprite.
	*
	* This can be any valid {@link ColorSource}.
	* @example
	* ```ts
	* // Basic color tinting
	* container.tint = 0xff0000; // Red tint
	* container.tint = 'red';    // Same as above
	* container.tint = '#00ff00'; // Green
	* container.tint = 'rgb(0,0,255)'; // Blue
	*
	* // Remove tint
	* container.tint = 0xffffff; // White = no tint
	* container.tint = null;     // Also removes tint
	* ```
	* @default 0xFFFFFF
	* @see {@link Container#alpha} For transparency
	* @see {@link Container#visible} For visibility control
	*/
	get tint() {
		return bgr2rgb(this.localColor);
	}
	set blendMode(value) {
		if (this.localBlendMode === value) return;
		if (this.parentRenderGroup) this.parentRenderGroup.structureDidChange = true;
		this._updateFlags |= 2;
		this.localBlendMode = value;
		this._onUpdate();
	}
	/**
	* The blend mode to be applied to the sprite. Controls how pixels are blended when rendering.
	*
	* Setting to 'normal' will reset to default blending.
	* > [!NOTE] More blend modes are available after importing the `pixi.js/advanced-blend-modes` sub-export.
	* @example
	* ```ts
	* // Basic blend modes
	* sprite.blendMode = 'add';        // Additive blending
	* sprite.blendMode = 'multiply';   // Multiply colors
	* sprite.blendMode = 'screen';     // Screen blend
	*
	* // Reset blend mode
	* sprite.blendMode = 'normal';     // Normal blending
	* ```
	* @default 'normal'
	* @see {@link Container#alpha} For transparency
	* @see {@link Container#tint} For color adjustments
	*/
	get blendMode() {
		return this.localBlendMode;
	}
	/**
	* The visibility of the object. If false the object will not be drawn,
	* and the transform will not be updated.
	* @example
	* ```ts
	* // Basic visibility toggle
	* sprite.visible = false; // Hide sprite
	* sprite.visible = true;  // Show sprite
	* ```
	* @default true
	* @see {@link Container#renderable} For render-only control
	* @see {@link Container#alpha} For transparency
	*/
	get visible() {
		return !!(this.localDisplayStatus & 2);
	}
	set visible(value) {
		const valueNumber = value ? 2 : 0;
		if ((this.localDisplayStatus & 2) === valueNumber) return;
		if (this.parentRenderGroup) this.parentRenderGroup.structureDidChange = true;
		this._updateFlags |= 4;
		this.localDisplayStatus ^= 2;
		this._onUpdate();
		this.emit("visibleChanged", value);
	}
	/** @ignore */
	get culled() {
		return !(this.localDisplayStatus & 4);
	}
	/** @ignore */
	set culled(value) {
		const valueNumber = value ? 0 : 4;
		if ((this.localDisplayStatus & 4) === valueNumber) return;
		if (this.parentRenderGroup) this.parentRenderGroup.structureDidChange = true;
		this._updateFlags |= 4;
		this.localDisplayStatus ^= 4;
		this._onUpdate();
	}
	/**
	* Controls whether this object can be rendered. If false the object will not be drawn,
	* but the transform will still be updated. This is different from visible, which skips
	* transform updates.
	* @example
	* ```ts
	* // Basic render control
	* sprite.renderable = false; // Skip rendering
	* sprite.renderable = true;  // Enable rendering
	* ```
	* @default true
	* @see {@link Container#visible} For skipping transform updates
	* @see {@link Container#alpha} For transparency
	*/
	get renderable() {
		return !!(this.localDisplayStatus & 1);
	}
	set renderable(value) {
		const valueNumber = value ? 1 : 0;
		if ((this.localDisplayStatus & 1) === valueNumber) return;
		this._updateFlags |= 4;
		this.localDisplayStatus ^= 1;
		if (this.parentRenderGroup) this.parentRenderGroup.structureDidChange = true;
		this._onUpdate();
	}
	/**
	* Whether or not the object should be rendered.
	* @advanced
	*/
	get isRenderable() {
		return this.localDisplayStatus === 7 && this.groupAlpha > 0;
	}
	/**
	* Removes all internal references and listeners as well as removes children from the display list.
	* Do not use a Container after calling `destroy`.
	* @param options - Options parameter. A boolean will act as if all options
	*  have been set to that value
	* @example
	* ```ts
	* container.destroy();
	* container.destroy(true);
	* container.destroy({ children: true });
	* container.destroy({ children: true, texture: true, textureSource: true });
	* ```
	*/
	destroy(options = false) {
		if (this.destroyed) return;
		this.destroyed = true;
		let oldChildren;
		if (this.children.length) oldChildren = this.removeChildren(0, this.children.length);
		this.removeFromParent();
		this.parent = null;
		this._maskEffect = null;
		this._filterEffect = null;
		this.effects = null;
		this._position = null;
		this._scale = null;
		this._pivot = null;
		this._origin = null;
		this._skew = null;
		this.emit("destroyed", this);
		this.removeAllListeners();
		if ((typeof options === "boolean" ? options : options?.children) && oldChildren) for (let i = 0; i < oldChildren.length; ++i) oldChildren[i].destroy(options);
		this.renderGroup?.destroy();
		this.renderGroup = null;
	}
};
extensions.mixin(Container, childrenHelperMixin, getFastGlobalBoundsMixin, toLocalGlobalMixin, onRenderMixin, measureMixin, effectsMixin, findMixin, sortMixin, cullingMixin, cacheAsTextureMixin, getGlobalMixin, collectRenderablesMixin);
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/shared/utils/createIdFromString.mjs
var idCounts = /* @__PURE__ */ Object.create(null);
var idHash = /* @__PURE__ */ Object.create(null);
function createIdFromString(value, groupId) {
	let id = idHash[value];
	if (id === void 0) {
		if (idCounts[groupId] === void 0) idCounts[groupId] = 1;
		idHash[value] = id = idCounts[groupId]++;
	}
	return id;
}
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/shared/geometry/utils/getAttributeInfoFromFormat.mjs
var attributeFormatData = {
	uint8x2: {
		size: 2,
		stride: 2,
		normalised: false
	},
	uint8x4: {
		size: 4,
		stride: 4,
		normalised: false
	},
	sint8x2: {
		size: 2,
		stride: 2,
		normalised: false
	},
	sint8x4: {
		size: 4,
		stride: 4,
		normalised: false
	},
	unorm8x2: {
		size: 2,
		stride: 2,
		normalised: true
	},
	unorm8x4: {
		size: 4,
		stride: 4,
		normalised: true
	},
	snorm8x2: {
		size: 2,
		stride: 2,
		normalised: true
	},
	snorm8x4: {
		size: 4,
		stride: 4,
		normalised: true
	},
	uint16x2: {
		size: 2,
		stride: 4,
		normalised: false
	},
	uint16x4: {
		size: 4,
		stride: 8,
		normalised: false
	},
	sint16x2: {
		size: 2,
		stride: 4,
		normalised: false
	},
	sint16x4: {
		size: 4,
		stride: 8,
		normalised: false
	},
	unorm16x2: {
		size: 2,
		stride: 4,
		normalised: true
	},
	unorm16x4: {
		size: 4,
		stride: 8,
		normalised: true
	},
	snorm16x2: {
		size: 2,
		stride: 4,
		normalised: true
	},
	snorm16x4: {
		size: 4,
		stride: 8,
		normalised: true
	},
	float16x2: {
		size: 2,
		stride: 4,
		normalised: false
	},
	float16x4: {
		size: 4,
		stride: 8,
		normalised: false
	},
	float32: {
		size: 1,
		stride: 4,
		normalised: false
	},
	float32x2: {
		size: 2,
		stride: 8,
		normalised: false
	},
	float32x3: {
		size: 3,
		stride: 12,
		normalised: false
	},
	float32x4: {
		size: 4,
		stride: 16,
		normalised: false
	},
	uint32: {
		size: 1,
		stride: 4,
		normalised: false
	},
	uint32x2: {
		size: 2,
		stride: 8,
		normalised: false
	},
	uint32x3: {
		size: 3,
		stride: 12,
		normalised: false
	},
	uint32x4: {
		size: 4,
		stride: 16,
		normalised: false
	},
	sint32: {
		size: 1,
		stride: 4,
		normalised: false
	},
	sint32x2: {
		size: 2,
		stride: 8,
		normalised: false
	},
	sint32x3: {
		size: 3,
		stride: 12,
		normalised: false
	},
	sint32x4: {
		size: 4,
		stride: 16,
		normalised: false
	}
};
function getAttributeInfoFromFormat(format) {
	return attributeFormatData[format] ?? attributeFormatData.float32;
}
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/shared/shader/types.mjs
var UNIFORM_TYPES_VALUES = [
	"f32",
	"i32",
	"u32",
	"vec2<f32>",
	"vec3<f32>",
	"vec4<f32>",
	"mat2x2<f32>",
	"mat3x3<f32>",
	"mat4x4<f32>",
	"mat3x2<f32>",
	"mat4x2<f32>",
	"mat2x3<f32>",
	"mat4x3<f32>",
	"mat2x4<f32>",
	"mat3x4<f32>",
	"vec2<i32>",
	"vec3<i32>",
	"vec4<i32>",
	"vec2<u32>",
	"vec3<u32>",
	"vec4<u32>"
];
var UNIFORM_TYPES_MAP = UNIFORM_TYPES_VALUES.reduce((acc, type) => {
	acc[type] = true;
	return acc;
}, {});
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/shared/shader/utils/getDefaultUniformValue.mjs
function getDefaultUniformValue(type, size) {
	switch (type) {
		case "f32": return 0;
		case "vec2<f32>": return new Float32Array(2 * size);
		case "vec3<f32>": return new Float32Array(3 * size);
		case "vec4<f32>": return new Float32Array(4 * size);
		case "mat2x2<f32>": return new Float32Array([
			1,
			0,
			0,
			1
		]);
		case "mat3x3<f32>": return new Float32Array([
			1,
			0,
			0,
			0,
			1,
			0,
			0,
			0,
			1
		]);
		case "mat4x4<f32>": return new Float32Array([
			1,
			0,
			0,
			0,
			0,
			1,
			0,
			0,
			0,
			0,
			1,
			0,
			0,
			0,
			0,
			1
		]);
	}
	return null;
}
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/shared/shader/UniformGroup.mjs
var _UniformGroup = class _UniformGroup extends eventemitter3_default {
	/**
	* Create a new Uniform group
	* @param uniformStructures - The structures of the uniform group
	* @param options - The optional parameters of this uniform group
	*/
	constructor(uniformStructures, options) {
		super();
		/** a unique id for this uniform group used through the renderer */
		this.uid = uid("uniform");
		/**
		* a resource type, used to identify how to handle it when its in a bind group / shader resource
		* @internal
		*/
		this._resourceType = "uniformGroup";
		/**
		* the resource id used internally by the renderer to build bind group keys
		* @internal
		*/
		this._resourceId = uid("resource");
		/** used ito identify if this is a uniform group */
		this.isUniformGroup = true;
		/**
		* used to flag if this Uniform groups data is different from what it has stored in its buffer / on the GPU
		* @internal
		*/
		this._dirtyId = 0;
		this.destroyed = false;
		options = {
			..._UniformGroup.defaultOptions,
			...options
		};
		this.uniformStructures = uniformStructures;
		const uniforms = {};
		for (const i in uniformStructures) {
			const uniformData = uniformStructures[i];
			uniformData.name = i;
			uniformData.size = uniformData.size ?? 1;
			if (!UNIFORM_TYPES_MAP[uniformData.type]) {
				const arrayMatch = uniformData.type.match(/^array<(\w+(?:<\w+>)?),\s*(\d+)>$/);
				if (arrayMatch) {
					const [, innerType, size] = arrayMatch;
					throw new Error(`Uniform type ${uniformData.type} is not supported. Use type: '${innerType}', size: ${size} instead.`);
				}
				throw new Error(`Uniform type ${uniformData.type} is not supported. Supported uniform types are: ${UNIFORM_TYPES_VALUES.join(", ")}`);
			}
			uniformData.value ?? (uniformData.value = getDefaultUniformValue(uniformData.type, uniformData.size));
			uniforms[i] = uniformData.value;
		}
		this.uniforms = uniforms;
		this._dirtyId = 1;
		this.ubo = options.ubo;
		this.isStatic = options.isStatic;
		this._signature = createIdFromString(Object.keys(uniforms).map((i) => `${i}-${uniformStructures[i].type}`).join("-"), "uniform-group");
	}
	/**
	* an underlying buffer that will be uploaded to the GPU when using this UniformGroup.
	* It is created lazily by the renderer's ubo system on first use.
	*/
	get buffer() {
		return this._buffer;
	}
	set buffer(value) {
		if (this._buffer === value) return;
		this._buffer?.off("change", this.onBufferChange, this);
		this._buffer = value;
		value?.on("change", this.onBufferChange, this);
	}
	/**
	* The GC tracks this group's underlying buffer, not the group itself — a GC stamp on the
	* group (see BindGroup._touch) must land on the buffer, or the GC collects it while
	* cached bind groups still reference it.
	* @internal
	*/
	get _gcLastUsed() {
		return this._buffer?._gcLastUsed ?? -1;
	}
	set _gcLastUsed(value) {
		if (this._buffer) this._buffer._gcLastUsed = value;
	}
	/**
	* Bind group keys are built from this group's _resourceId, not the buffer's — so when the
	* buffer re-keys (it resized, or the GC unloaded its GPU copy), this group must re-key too,
	* or cached GPUBindGroups keep referencing the destroyed GPU buffer.
	*/
	onBufferChange() {
		this._resourceId = uid("resource");
		this.emit("change", this);
	}
	/** Call this if you want the uniform groups data to be uploaded to the GPU only useful if `isStatic` is true. */
	update() {
		this._dirtyId++;
	}
};
/**
* emits when the underlying buffer needs to be re-bound (it resized or was unloaded),
* letting cached bind groups know they must rebuild
* @event change
*/
/** The default options used by the uniform group. */
_UniformGroup.defaultOptions = {
	/** if true the UniformGroup is handled as an Uniform buffer object. */
	ubo: false,
	/** if true, then you are responsible for when the data is uploaded to the GPU by calling `update()` */
	isStatic: false
};
var UniformGroup = _UniformGroup;
//#endregion
//#region node_modules/pixi.js/lib/environment/autoDetectEnvironment.mjs
var environments = [];
extensions.handleByNamedList(ExtensionType.Environment, environments);
async function loadEnvironmentExtensions(skip) {
	if (skip) return;
	for (let i = 0; i < environments.length; i++) {
		const env = environments[i];
		if (env.value.test()) {
			await env.value.load();
			return;
		}
	}
}
async function autoDetectEnvironment(add) {
	return loadEnvironmentExtensions(!add);
}
//#endregion
//#region node_modules/pixi.js/lib/utils/browser/unsafeEvalSupported.mjs
var unsafeEval;
function unsafeEvalSupported() {
	if (typeof unsafeEval === "boolean") return unsafeEval;
	try {
		unsafeEval = new Function("param1", "param2", "param3", "return param1[param2] === param3;")({ a: "b" }, "a", "b") === true;
	} catch (_e) {
		unsafeEval = false;
	}
	return unsafeEval;
}
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/gl/const.mjs
var CLEAR = /* @__PURE__ */ ((CLEAR2) => {
	CLEAR2[CLEAR2["NONE"] = 0] = "NONE";
	CLEAR2[CLEAR2["COLOR"] = 16384] = "COLOR";
	CLEAR2[CLEAR2["STENCIL"] = 1024] = "STENCIL";
	CLEAR2[CLEAR2["DEPTH"] = 256] = "DEPTH";
	CLEAR2[CLEAR2["COLOR_DEPTH"] = 16640] = "COLOR_DEPTH";
	CLEAR2[CLEAR2["COLOR_STENCIL"] = 17408] = "COLOR_STENCIL";
	CLEAR2[CLEAR2["DEPTH_STENCIL"] = 1280] = "DEPTH_STENCIL";
	CLEAR2[CLEAR2["ALL"] = 17664] = "ALL";
	return CLEAR2;
})(CLEAR || {});
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/shared/system/SystemRunner.mjs
var SystemRunner = class {
	/**
	* @param name - The function name that will be executed on the listeners added to this Runner.
	*/
	constructor(name) {
		this.items = [];
		this._name = name;
	}
	/**
	* Dispatch/Broadcast Runner to all listeners added to the queue.
	* @param {...any} params - (optional) parameters to pass to each listener
	*/
	emit(a0, a1, a2, a3, a4, a5, a6, a7) {
		const { name, items } = this;
		for (let i = 0, len = items.length; i < len; i++) items[i][name](a0, a1, a2, a3, a4, a5, a6, a7);
		return this;
	}
	/**
	* Add a listener to the Runner
	*
	* Runners do not need to have scope or functions passed to them.
	* All that is required is to pass the listening object and ensure that it has contains a function that has the same name
	* as the name provided to the Runner when it was created.
	*
	* Eg A listener passed to this Runner will require a 'complete' function.
	*
	* ```ts
	* import { Runner } from 'pixi.js';
	*
	* const complete = new Runner('complete');
	* ```
	*
	* The scope used will be the object itself.
	* @param {any} item - The object that will be listening.
	*/
	add(item) {
		if (item[this._name]) {
			this.remove(item);
			this.items.push(item);
		}
		return this;
	}
	/**
	* Remove a single listener from the dispatch queue.
	* @param {any} item - The listener that you would like to remove.
	*/
	remove(item) {
		const index = this.items.indexOf(item);
		if (index !== -1) this.items.splice(index, 1);
		return this;
	}
	/**
	* Check to see if the listener is already in the Runner
	* @param {any} item - The listener that you would like to check.
	*/
	contains(item) {
		return this.items.indexOf(item) !== -1;
	}
	/** Remove all listeners from the Runner */
	removeAll() {
		this.items.length = 0;
		return this;
	}
	/** Remove all references, don't use after this. */
	destroy() {
		this.removeAll();
		this.items = null;
		this._name = null;
	}
	/**
	* `true` if there are no this Runner contains no listeners
	* @readonly
	*/
	get empty() {
		return this.items.length === 0;
	}
	/**
	* The name of the runner.
	* @readonly
	*/
	get name() {
		return this._name;
	}
};
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/shared/system/AbstractRenderer.mjs
var defaultRunners = [
	"init",
	"destroy",
	"contextChange",
	"resolutionChange",
	"resetState",
	"renderEnd",
	"renderStart",
	"render",
	"update",
	"postrender",
	"prerender"
];
var _AbstractRenderer = class _AbstractRenderer extends eventemitter3_default {
	/**
	* Set up a system with a collection of SystemClasses and runners.
	* Systems are attached dynamically to this class when added.
	* @param config - the config for the system manager
	*/
	constructor(config) {
		super();
		/** The current tick of the renderer. */
		this.tick = 0;
		/** @internal */
		this.uid = uid("renderer");
		/** @internal */
		this.runners = /* @__PURE__ */ Object.create(null);
		/** @internal */
		this.renderPipes = /* @__PURE__ */ Object.create(null);
		this._initOptions = {};
		this._systemsHash = /* @__PURE__ */ Object.create(null);
		this.type = config.type;
		this.name = config.name;
		this.config = config;
		const combinedRunners = [...defaultRunners, ...this.config.runners ?? []];
		this._addRunners(...combinedRunners);
		this._unsafeEvalCheck();
	}
	/**
	* Initialize the renderer.
	* @param options - The options to use to create the renderer.
	*/
	async init(options = {}) {
		const skip = options.skipExtensionImports === true ? true : options.manageImports === false;
		await loadEnvironmentExtensions(skip);
		if (!skip && this.config.loaders) await Promise.all(this.config.loaders.map((loader) => loader.value.load()));
		this._addSystems(this.config.systems);
		this._addPipes(this.config.renderPipes, this.config.renderPipeAdaptors);
		for (const systemName in this._systemsHash) options = {
			...this._systemsHash[systemName].constructor.defaultOptions,
			...options
		};
		options = {
			..._AbstractRenderer.defaultOptions,
			...options
		};
		this._roundPixels = options.roundPixels ? 1 : 0;
		for (let i = 0; i < this.runners.init.items.length; i++) await this.runners.init.items[i].init(options);
		this._initOptions = options;
	}
	render(args, deprecated) {
		this.tick++;
		let options = args;
		if (options instanceof Container) {
			options = { container: options };
			if (deprecated) {
				deprecation(v8_0_0, "passing a second argument is deprecated, please use render options instead");
				options.target = deprecated.renderTexture;
			}
		}
		options.target || (options.target = this.view.renderTarget);
		if (options.target === this.view.renderTarget) {
			this._lastObjectRendered = options.container;
			options.clearColor ?? (options.clearColor = this.background.colorRgba);
			options.clear ?? (options.clear = this.background.clearBeforeRender);
		}
		if (options.clearColor) {
			const isRGBAArray = Array.isArray(options.clearColor) && options.clearColor.length === 4;
			options.clearColor = isRGBAArray ? options.clearColor : Color.shared.setValue(options.clearColor).toArray();
		}
		if (!options.transform) {
			options.container.updateLocalTransform();
			options.transform = options.container.localTransform;
		}
		if (!options.container.visible) return;
		options.container.enableRenderGroup();
		this.runners.prerender.emit(options);
		this.runners.renderStart.emit(options);
		this.runners.render.emit(options);
		this.runners.renderEnd.emit(options);
		this.runners.postrender.emit(options);
	}
	/**
	* Resizes the WebGL view to the specified width and height.
	* @param desiredScreenWidth - The desired width of the screen.
	* @param desiredScreenHeight - The desired height of the screen.
	* @param resolution - The resolution / device pixel ratio of the renderer.
	*/
	resize(desiredScreenWidth, desiredScreenHeight, resolution) {
		const previousResolution = this.view.resolution;
		this.view.resize(desiredScreenWidth, desiredScreenHeight, resolution);
		this.emit("resize", this.view.screen.width, this.view.screen.height, this.view.resolution);
		if (resolution !== void 0 && resolution !== previousResolution) this.runners.resolutionChange.emit(resolution);
	}
	/**
	* Clears the render target.
	* @param options - The options to use when clearing the render target.
	* @param options.target - The render target to clear.
	* @param options.clearColor - The color to clear with.
	* @param options.clear - The clear mode to use.
	* @advanced
	*/
	clear(options = {}) {
		const renderer = this;
		options.target || (options.target = renderer.renderTarget.renderTarget);
		options.clearColor || (options.clearColor = this.background.colorRgba);
		options.clear ?? (options.clear = CLEAR.ALL);
		const { clear, clearColor, target, mipLevel, layer } = options;
		Color.shared.setValue(clearColor ?? this.background.colorRgba);
		renderer.renderTarget.clear(target, clear, Color.shared.toArray(), mipLevel ?? 0, layer ?? 0);
	}
	/** The resolution / device pixel ratio of the renderer. */
	get resolution() {
		return this.view.resolution;
	}
	set resolution(value) {
		this.view.resolution = value;
		this.runners.resolutionChange.emit(value);
	}
	/**
	* Same as view.width, actual number of pixels in the canvas by horizontal.
	* @type {number}
	* @readonly
	* @default 800
	*/
	get width() {
		return this.view.texture.frame.width;
	}
	/**
	* Same as view.height, actual number of pixels in the canvas by vertical.
	* @default 600
	*/
	get height() {
		return this.view.texture.frame.height;
	}
	/**
	* The canvas element that everything is drawn to.
	* @type {environment.ICanvas}
	*/
	get canvas() {
		return this.view.canvas;
	}
	/**
	* the last object rendered by the renderer. Useful for other plugins like interaction managers
	* @readonly
	*/
	get lastObjectRendered() {
		return this._lastObjectRendered;
	}
	/**
	* Flag if we are rendering to the screen vs renderTexture
	* @readonly
	* @default true
	*/
	get renderingToScreen() {
		return this.renderTarget.renderingToScreen;
	}
	/**
	* Measurements of the screen. (0, 0, screenWidth, screenHeight).
	*
	* Its safe to use as filterArea or hitArea for the whole stage.
	*/
	get screen() {
		return this.view.screen;
	}
	/**
	* Create a bunch of runners based of a collection of ids
	* @param runnerIds - the runner ids to add
	*/
	_addRunners(...runnerIds) {
		runnerIds.forEach((runnerId) => {
			this.runners[runnerId] = new SystemRunner(runnerId);
		});
	}
	_addSystems(systems) {
		let i;
		for (i in systems) {
			const val = systems[i];
			this._addSystem(val.value, val.name);
		}
	}
	/**
	* Add a new system to the renderer.
	* @param ClassRef - Class reference
	* @param name - Property name for system, if not specified
	*        will use a static `name` property on the class itself. This
	*        name will be assigned as s property on the Renderer so make
	*        sure it doesn't collide with properties on Renderer.
	* @returns Return instance of renderer
	*/
	_addSystem(ClassRef, name) {
		const system = new ClassRef(this);
		if (this[name]) throw new Error(`Whoops! The name "${name}" is already in use`);
		this[name] = system;
		this._systemsHash[name] = system;
		for (const i in this.runners) this.runners[i].add(system);
		return this;
	}
	_addPipes(pipes, pipeAdaptors) {
		const adaptors = pipeAdaptors.reduce((acc, adaptor) => {
			acc[adaptor.name] = adaptor.value;
			return acc;
		}, {});
		pipes.forEach((pipe) => {
			const PipeClass = pipe.value;
			const name = pipe.name;
			const Adaptor = adaptors[name];
			this.renderPipes[name] = new PipeClass(this, Adaptor ? new Adaptor() : null);
			this.runners.destroy.add(this.renderPipes[name]);
		});
	}
	destroy(options = false) {
		this.runners.destroy.items.reverse();
		this.runners.destroy.emit(options);
		if (options === true || typeof options === "object" && options.releaseGlobalResources) GlobalResourceRegistry.release();
		Object.values(this.runners).forEach((runner) => {
			runner.destroy();
		});
		this._systemsHash = null;
		this.renderPipes = null;
		this.removeAllListeners();
	}
	/**
	* Generate a texture from a container.
	* @param options - options or container target to use when generating the texture
	* @returns a texture
	*/
	generateTexture(options) {
		return this.textureGenerator.generateTexture(options);
	}
	/**
	* Whether the renderer will round coordinates to whole pixels when rendering.
	* Can be overridden on a per scene item basis.
	*/
	get roundPixels() {
		return !!this._roundPixels;
	}
	/**
	* Overridable function by `pixi.js/unsafe-eval` to silence
	* throwing an error if platform doesn't support unsafe-evals.
	* @private
	* @ignore
	*/
	_unsafeEvalCheck() {
		if (!unsafeEvalSupported()) throw new Error("Current environment does not allow unsafe-eval, please use pixi.js/unsafe-eval module to enable support.");
	}
	/**
	* Resets the rendering state of the renderer.
	* This is useful when you want to use the WebGL context directly and need to ensure PixiJS's internal state
	* stays synchronized. When modifying the WebGL context state externally, calling this method before the next Pixi
	* render will reset all internal caches and ensure it executes correctly.
	*
	* This is particularly useful when combining PixiJS with other rendering engines like Three.js:
	* ```js
	* // Reset Three.js state
	* threeRenderer.resetState();
	*
	* // Render a Three.js scene
	* threeRenderer.render(threeScene, threeCamera);
	*
	* // Reset PixiJS state since Three.js modified the WebGL context
	* pixiRenderer.resetState();
	*
	* // Now render Pixi content
	* pixiRenderer.render(pixiScene);
	* ```
	* @advanced
	*/
	resetState() {
		this.runners.resetState.emit();
	}
};
/** The default options for the renderer. */
_AbstractRenderer.defaultOptions = {
	/**
	* Default resolution / device pixel ratio of the renderer.
	* @default 1
	*/
	resolution: 1,
	/**
	* Should the `failIfMajorPerformanceCaveat` flag be enabled as a context option used in the `isWebGLSupported`
	* function. If set to true, a WebGL renderer can fail to be created if the browser thinks there could be
	* performance issues when using WebGL.
	*
	* In PixiJS v6 this has changed from true to false by default, to allow WebGL to work in as many
	* scenarios as possible. However, some users may have a poor experience, for example, if a user has a gpu or
	* driver version blacklisted by the
	* browser.
	*
	* If your application requires high performance rendering, you may wish to set this to false.
	* We recommend one of two options if you decide to set this flag to false:
	*
	* 1: Use the Canvas renderer as a fallback in case high performance WebGL is
	*    not supported.
	*
	* 2: Call `isWebGLSupported` (which if found in the utils package) in your code before attempting to create a
	*    PixiJS renderer, and show an error message to the user if the function returns false, explaining that their
	*    device & browser combination does not support high performance WebGL.
	*    This is a much better strategy than trying to create a PixiJS renderer and finding it then fails.
	* @default false
	*/
	failIfMajorPerformanceCaveat: false,
	/**
	* Should round pixels be forced when rendering?
	* @default false
	*/
	roundPixels: false
};
var AbstractRenderer = _AbstractRenderer;
//#endregion
//#region node_modules/pixi.js/lib/utils/data/ViewableBuffer.mjs
var ViewableBuffer = class {
	constructor(sizeOrBuffer) {
		if (typeof sizeOrBuffer === "number") this.rawBinaryData = new ArrayBuffer(sizeOrBuffer);
		else if (sizeOrBuffer instanceof Uint8Array) this.rawBinaryData = sizeOrBuffer.buffer;
		else this.rawBinaryData = sizeOrBuffer;
		this.uint32View = new Uint32Array(this.rawBinaryData);
		this.float32View = new Float32Array(this.rawBinaryData);
		this.size = this.rawBinaryData.byteLength;
	}
	/** View on the raw binary data as a `Int8Array`. */
	get int8View() {
		if (!this._int8View) this._int8View = new Int8Array(this.rawBinaryData);
		return this._int8View;
	}
	/** View on the raw binary data as a `Uint8Array`. */
	get uint8View() {
		if (!this._uint8View) this._uint8View = new Uint8Array(this.rawBinaryData);
		return this._uint8View;
	}
	/**  View on the raw binary data as a `Int16Array`. */
	get int16View() {
		if (!this._int16View) this._int16View = new Int16Array(this.rawBinaryData);
		return this._int16View;
	}
	/** View on the raw binary data as a `Int32Array`. */
	get int32View() {
		if (!this._int32View) this._int32View = new Int32Array(this.rawBinaryData);
		return this._int32View;
	}
	/** View on the raw binary data as a `Float64Array`. */
	get float64View() {
		if (!this._float64Array) this._float64Array = new Float64Array(this.rawBinaryData);
		return this._float64Array;
	}
	/** View on the raw binary data as a `BigUint64Array`. */
	get bigUint64View() {
		if (!this._bigUint64Array) this._bigUint64Array = new BigUint64Array(this.rawBinaryData);
		return this._bigUint64Array;
	}
	/**
	* Returns the view of the given type.
	* @param type - One of `int8`, `uint8`, `int16`,
	*    `uint16`, `int32`, `uint32`, and `float32`.
	* @returns - typed array of given type
	*/
	view(type) {
		return this[`${type}View`];
	}
	/** Destroys all buffer references. Do not use after calling this. */
	destroy() {
		this.rawBinaryData = null;
		this.uint32View = null;
		this.float32View = null;
		this.uint16View = null;
		this._int8View = null;
		this._uint8View = null;
		this._int16View = null;
		this._int32View = null;
		this._float64Array = null;
		this._bigUint64Array = null;
	}
	/**
	* Returns the size of the given type in bytes.
	* @param type - One of `int8`, `uint8`, `int16`,
	*   `uint16`, `int32`, `uint32`, and `float32`.
	* @returns - size of the type in bytes
	*/
	static sizeOf(type) {
		switch (type) {
			case "int8":
			case "uint8": return 1;
			case "int16":
			case "uint16": return 2;
			case "int32":
			case "uint32":
			case "float32": return 4;
			default: throw new Error(`${type} isn't a valid view type`);
		}
	}
};
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/shared/buffer/const.mjs
var BufferUsage = /* @__PURE__ */ ((BufferUsage2) => {
	BufferUsage2[BufferUsage2["MAP_READ"] = 1] = "MAP_READ";
	BufferUsage2[BufferUsage2["MAP_WRITE"] = 2] = "MAP_WRITE";
	BufferUsage2[BufferUsage2["COPY_SRC"] = 4] = "COPY_SRC";
	BufferUsage2[BufferUsage2["COPY_DST"] = 8] = "COPY_DST";
	BufferUsage2[BufferUsage2["INDEX"] = 16] = "INDEX";
	BufferUsage2[BufferUsage2["VERTEX"] = 32] = "VERTEX";
	BufferUsage2[BufferUsage2["UNIFORM"] = 64] = "UNIFORM";
	BufferUsage2[BufferUsage2["STORAGE"] = 128] = "STORAGE";
	BufferUsage2[BufferUsage2["INDIRECT"] = 256] = "INDIRECT";
	BufferUsage2[BufferUsage2["QUERY_RESOLVE"] = 512] = "QUERY_RESOLVE";
	BufferUsage2[BufferUsage2["STATIC"] = 1024] = "STATIC";
	return BufferUsage2;
})(BufferUsage || {});
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/shared/buffer/Buffer.mjs
var Buffer = class extends eventemitter3_default {
	/**
	* Creates a new Buffer with the given options
	* @param options - the options for the buffer
	*/
	constructor(options) {
		let { data, size } = options;
		const { usage, label, shrinkToFit } = options;
		super();
		/**
		* emits when the underlying buffer has changed shape (i.e. resized) or been unloaded,
		* letting the renderer know that it needs to discard the old buffer on the GPU and create a new one
		* @event change
		*/
		/**
		* emits when the underlying buffer data has been updated. letting the renderer know
		* that it needs to update the buffer on the GPU
		* @event update
		*/
		/**
		* emits when the buffer is destroyed. letting the renderer know that it needs to destroy the buffer on the GPU
		* @event destroy
		*/
		/** @internal */
		this._gpuData = /* @__PURE__ */ Object.create(null);
		/** @internal */
		this._gcLastUsed = -1;
		/** If set to true, the buffer will be garbage collected automatically when it is not used. */
		this.autoGarbageCollect = true;
		/** a unique id for this uniform group used through the renderer */
		this.uid = uid("buffer");
		/**
		* a resource type, used to identify how to handle it when its in a bind group / shader resource
		* @internal
		*/
		this._resourceType = "buffer";
		/**
		* the resource id used internally by the renderer to build bind group keys
		* @internal
		*/
		this._resourceId = uid("resource");
		/** @internal */
		this._updateID = 1;
		/** @internal */
		this._updateOffset = 0;
		this._dataInt32 = null;
		/**
		* should the GPU buffer be shrunk when the data becomes smaller?
		* changing this will cause the buffer to be destroyed and a new one created on the GPU
		* this can be expensive, especially if the buffer is already big enough!
		* setting this to false will prevent the buffer from being shrunk. This will yield better performance
		* if you are constantly setting data that is changing size often.
		* @default true
		*/
		this.shrinkToFit = true;
		/**
		* Has the buffer been destroyed?
		* @readonly
		*/
		this.destroyed = false;
		if (data instanceof Array) data = new Float32Array(data);
		this._data = data;
		size ?? (size = data?.byteLength);
		const mappedAtCreation = !!data;
		this.descriptor = {
			size,
			usage,
			mappedAtCreation,
			label
		};
		this.shrinkToFit = shrinkToFit ?? true;
	}
	/** the data in the buffer */
	get data() {
		return this._data;
	}
	set data(value) {
		this.setDataWithSize(value, value.length, true);
	}
	get dataInt32() {
		if (!this._dataInt32) this._dataInt32 = new Int32Array(this.data.buffer);
		return this._dataInt32;
	}
	/** whether the buffer is static or not */
	get static() {
		return !!(this.descriptor.usage & BufferUsage.STATIC);
	}
	set static(value) {
		if (value) this.descriptor.usage |= BufferUsage.STATIC;
		else this.descriptor.usage &= ~BufferUsage.STATIC;
	}
	/**
	* Sets the data in the buffer to the given value. This will immediately update the buffer on the GPU.
	* If you only want to update a subset of the buffer, you can pass in the size of the data.
	* @param value - the data to set
	* @param size - the size of the data in bytes
	* @param syncGPU - should the buffer be updated on the GPU immediately?
	*/
	setDataWithSize(value, size, syncGPU) {
		this._updateID++;
		this._updateSize = size * value.BYTES_PER_ELEMENT;
		this._updateOffset = 0;
		if (this._data === value) {
			if (syncGPU) this.emit("update", this);
			return;
		}
		const oldData = this._data;
		this._data = value;
		this._dataInt32 = null;
		if (!oldData || oldData.length !== value.length) {
			if (!this.shrinkToFit && oldData && value.byteLength < oldData.byteLength) {
				if (syncGPU) this.emit("update", this);
			} else {
				this.descriptor.size = value.byteLength;
				this._resourceId = uid("resource");
				this.emit("change", this);
			}
			return;
		}
		if (syncGPU) this.emit("update", this);
	}
	/**
	* updates the buffer on the GPU to reflect the data in the buffer.
	* By default it will update the entire buffer. If you only want to update a subset of the buffer,
	* you can pass in the size of the buffer to update.
	* @param sizeInBytes - the new size of the buffer in bytes
	* @param offsetInBytes - the offset to start updating from
	*/
	update(sizeInBytes, offsetInBytes) {
		this._updateSize = sizeInBytes ?? this._updateSize;
		this._updateOffset = offsetInBytes || 0;
		this._updateID++;
		this.emit("update", this);
	}
	/** Unloads the buffer from the GPU */
	unload() {
		this.emit("unload", this);
		for (const key in this._gpuData) this._gpuData[key]?.destroy();
		this._gpuData = /* @__PURE__ */ Object.create(null);
		if (!this.destroyed) {
			this._resourceId = uid("resource");
			this.emit("change", this);
		}
	}
	/** Destroys the buffer */
	destroy() {
		this.destroyed = true;
		this.unload();
		this.emit("destroy", this);
		this.emit("change", this);
		this._data = null;
		this.descriptor = null;
		this.removeAllListeners();
	}
};
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/shared/geometry/utils/ensureIsBuffer.mjs
function ensureIsBuffer(buffer, index) {
	if (!(buffer instanceof Buffer)) {
		let usage = index ? BufferUsage.INDEX : BufferUsage.VERTEX;
		if (buffer instanceof Array) {
			if (index) {
				buffer = new Uint32Array(buffer);
				usage = BufferUsage.INDEX | BufferUsage.COPY_DST;
			} else {
				buffer = new Float32Array(buffer);
				usage = BufferUsage.VERTEX | BufferUsage.COPY_DST;
			}
		}
		buffer = new Buffer({
			data: buffer,
			label: index ? "index-mesh-buffer" : "vertex-mesh-buffer",
			usage
		});
	}
	return buffer;
}
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/shared/geometry/utils/getGeometryBounds.mjs
function getGeometryBounds(geometry, attributeId, bounds) {
	const attribute = geometry.getAttribute(attributeId);
	if (!attribute) {
		bounds.minX = 0;
		bounds.minY = 0;
		bounds.maxX = 0;
		bounds.maxY = 0;
		return bounds;
	}
	const data = attribute.buffer.data;
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	const byteSize = data.BYTES_PER_ELEMENT;
	const offset = (attribute.offset || 0) / byteSize;
	const stride = (attribute.stride || 8) / byteSize;
	for (let i = offset; i < data.length; i += stride) {
		const x = data[i];
		const y = data[i + 1];
		if (x > maxX) maxX = x;
		if (y > maxY) maxY = y;
		if (x < minX) minX = x;
		if (y < minY) minY = y;
	}
	bounds.minX = minX;
	bounds.minY = minY;
	bounds.maxX = maxX;
	bounds.maxY = maxY;
	return bounds;
}
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/shared/geometry/Geometry.mjs
function ensureIsAttribute(attribute) {
	if (attribute instanceof Buffer || Array.isArray(attribute) || attribute.BYTES_PER_ELEMENT) attribute = { buffer: attribute };
	attribute.buffer = ensureIsBuffer(attribute.buffer, false);
	return attribute;
}
var Geometry = class extends eventemitter3_default {
	/**
	* Create a new instance of a geometry
	* @param options - The options for the geometry.
	*/
	constructor(options = {}) {
		super();
		/** @internal */
		this._gpuData = /* @__PURE__ */ Object.create(null);
		/** If set to true, the resource will be garbage collected automatically when it is not used. */
		this.autoGarbageCollect = true;
		/** @internal */
		this._gcLastUsed = -1;
		/** The unique id of the geometry. */
		this.uid = uid("geometry");
		/**
		* the layout key will be generated by WebGPU all geometries that have the same structure
		* will have the same layout key. This is used to cache the pipeline layout
		* @internal
		*/
		this._layoutKey = 0;
		/** the instance count of the geometry to draw */
		this.instanceCount = 1;
		/**
		* The number of indices to draw, or `0` to draw the whole index buffer.
		*
		* Set this when a geometry only covers a prefix of an index buffer it shares with others - a
		* pool of identical quads, say, where one buffer holds the six indices per quad for the largest
		* batch and each geometry draws as many quads as it currently holds. A `size` passed to the
		* draw call still wins, and a geometry with no index buffer ignores this entirely
		* ({@link Geometry.vertexCount} drives those). Read at draw time only, so changing it never
		* re-uploads or re-lays-out anything.
		* @default 0
		*/
		this.indexCount = 0;
		this._bounds = new Bounds();
		this._boundsDirty = true;
		this._vertexCount = 0;
		this._vertexCountDirty = true;
		const { attributes, indexBuffer, topology } = options;
		this.buffers = [];
		this.attributes = {};
		if (attributes) for (const i in attributes) this.addAttribute(i, attributes[i]);
		this.instanceCount = options.instanceCount ?? 1;
		this.indexCount = options.indexCount ?? 0;
		if (indexBuffer) this.addIndex(indexBuffer);
		this.topology = topology || "triangle-list";
	}
	onBufferUpdate() {
		this._boundsDirty = true;
		this._vertexCountDirty = true;
		this.emit("update", this);
	}
	/**
	* Returns the requested attribute.
	* @param id - The name of the attribute required
	* @returns - The attribute requested.
	*/
	getAttribute(id) {
		return this.attributes[id];
	}
	/**
	* Returns the index buffer
	* @returns - The index buffer.
	*/
	getIndex() {
		return this.indexBuffer;
	}
	/**
	* Returns the requested buffer.
	* @param id - The name of the buffer required.
	* @returns - The buffer requested.
	*/
	getBuffer(id) {
		return this.getAttribute(id).buffer;
	}
	/**
	* The number of vertices in this geometry, derived from the first non-instanced attribute.
	* The value is cached and only recalculated when the geometry's buffers or attributes change.
	*/
	get vertexCount() {
		if (!this._vertexCountDirty) return this._vertexCount;
		this._vertexCountDirty = false;
		const attributes = this.attributes;
		for (const i in attributes) {
			const attribute = attributes[i];
			if (attribute.instance) continue;
			const buffer = attribute.buffer;
			this._vertexCount = buffer.data.length / (attribute.stride / 4 || attribute.size);
			return this._vertexCount;
		}
		this._vertexCount = 0;
		return 0;
	}
	/**
	* Used to figure out how many vertices there are in this geometry
	* @returns the number of vertices in the geometry
	* @deprecated since 8.20.0, use {@link Geometry.vertexCount} instead
	*/
	getSize() {
		deprecation("8.20.0", "Geometry.getSize is deprecated, please use Geometry.vertexCount instead.");
		return this.vertexCount;
	}
	/**
	* Adds an attribute to the geometry.
	* @param name - The name of the attribute to add.
	* @param attributeOption - The attribute option to add.
	*/
	addAttribute(name, attributeOption) {
		const attribute = ensureIsAttribute(attributeOption);
		if (this.buffers.indexOf(attribute.buffer) === -1) {
			this.buffers.push(attribute.buffer);
			attribute.buffer.on("update", this.onBufferUpdate, this);
			attribute.buffer.on("change", this.onBufferUpdate, this);
		}
		this.attributes[name] = attribute;
		this._vertexCountDirty = true;
	}
	/**
	* Adds an index buffer to the geometry.
	* @param indexBuffer - The index buffer to add. Can be a Buffer, TypedArray, or an array of numbers.
	*/
	addIndex(indexBuffer) {
		this.indexBuffer = ensureIsBuffer(indexBuffer, true);
		this.buffers.push(this.indexBuffer);
	}
	/** Returns the bounds of the geometry. */
	get bounds() {
		if (!this._boundsDirty) return this._bounds;
		this._boundsDirty = false;
		return getGeometryBounds(this, "aPosition", this._bounds);
	}
	/** Unloads the geometry from the GPU. */
	unload() {
		this.emit("unload", this);
		for (const key in this._gpuData) this._gpuData[key]?.destroy();
		this._gpuData = /* @__PURE__ */ Object.create(null);
	}
	/**
	* destroys the geometry.
	* @param destroyBuffers - destroy the buffers associated with this geometry
	*/
	destroy(destroyBuffers = false) {
		this.emit("destroy", this);
		for (const buffer of this.buffers) {
			buffer.off("update", this.onBufferUpdate, this);
			buffer.off("change", this.onBufferUpdate, this);
			if (destroyBuffers) buffer.destroy();
		}
		this.unload();
		this.removeAllListeners();
		this.attributes = null;
		this.buffers = null;
		this.indexBuffer = null;
		this._bounds = null;
	}
};
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/shared/shader/UboSystem.mjs
var UboSystem = class {
	constructor(adaptor) {
		/** Cache of uniform buffer layouts and sync functions, so we don't have to re-create them */
		this._syncFunctionHash = /* @__PURE__ */ Object.create(null);
		this._adaptor = adaptor;
		this._systemCheck();
	}
	/**
	* Overridable function by `pixi.js/unsafe-eval` to silence
	* throwing an error if platform doesn't support unsafe-evals.
	* @private
	*/
	_systemCheck() {
		if (!unsafeEvalSupported()) throw new Error("Current environment does not allow unsafe-eval, please use pixi.js/unsafe-eval module to enable support.");
	}
	ensureUniformGroup(uniformGroup) {
		const uniformData = this.getUniformGroupData(uniformGroup);
		uniformGroup.buffer || (uniformGroup.buffer = new Buffer({
			data: new Float32Array(uniformData.layout.size / 4),
			usage: BufferUsage.UNIFORM | BufferUsage.COPY_DST
		}));
	}
	getUniformGroupData(uniformGroup) {
		return this._syncFunctionHash[uniformGroup._signature] || this._initUniformGroup(uniformGroup);
	}
	_initUniformGroup(uniformGroup) {
		const uniformGroupSignature = uniformGroup._signature;
		let uniformData = this._syncFunctionHash[uniformGroupSignature];
		if (!uniformData) {
			const elements = Object.keys(uniformGroup.uniformStructures).map((i) => uniformGroup.uniformStructures[i]);
			const layout = this._adaptor.createUboElements(elements);
			const syncFunction = this._generateUboSync(layout.uboElements);
			uniformData = this._syncFunctionHash[uniformGroupSignature] = {
				layout,
				syncFunction
			};
		}
		return this._syncFunctionHash[uniformGroupSignature];
	}
	_generateUboSync(uboElements) {
		return this._adaptor.generateUboSync(uboElements);
	}
	syncUniformGroup(uniformGroup, data, offset) {
		const uniformGroupData = this.getUniformGroupData(uniformGroup);
		uniformGroup.buffer || (uniformGroup.buffer = new Buffer({
			data: new Float32Array(uniformGroupData.layout.size / 4),
			usage: BufferUsage.UNIFORM | BufferUsage.COPY_DST
		}));
		let dataInt32 = null;
		if (!data) {
			data = uniformGroup.buffer.data;
			dataInt32 = uniformGroup.buffer.dataInt32;
		}
		offset || (offset = 0);
		uniformGroupData.syncFunction(uniformGroup.uniforms, data, dataInt32, offset);
		return true;
	}
	updateUniformGroup(uniformGroup) {
		if (uniformGroup.isStatic && !uniformGroup._dirtyId) return false;
		uniformGroup._dirtyId = 0;
		const synced = this.syncUniformGroup(uniformGroup);
		uniformGroup.buffer.update();
		return synced;
	}
	destroy() {
		this._syncFunctionHash = null;
	}
};
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/gl/shader/utils/createUboElementsSTD40.mjs
var WGSL_TO_STD40_SIZE = {
	f32: 4,
	i32: 4,
	"vec2<f32>": 8,
	"vec3<f32>": 12,
	"vec4<f32>": 16,
	"vec2<i32>": 8,
	"vec3<i32>": 12,
	"vec4<i32>": 16,
	u32: 4,
	"vec2<u32>": 8,
	"vec3<u32>": 12,
	"vec4<u32>": 16,
	"mat2x2<f32>": 32,
	"mat3x3<f32>": 48,
	"mat4x4<f32>": 64
};
function createUboElementsSTD40(uniformData) {
	const uboElements = uniformData.map((data) => ({
		data,
		offset: 0,
		size: 0
	}));
	const chunkSize = 16;
	let size = 0;
	let offset = 0;
	for (let i = 0; i < uboElements.length; i++) {
		const uboElement = uboElements[i];
		size = WGSL_TO_STD40_SIZE[uboElement.data.type];
		if (!size) throw new Error(`Unknown type ${uboElement.data.type}`);
		if (uboElement.data.size > 1) size = Math.max(size, chunkSize) * uboElement.data.size;
		const boundary = size === 12 ? 16 : size;
		uboElement.size = size;
		const curOffset = offset % chunkSize;
		if (curOffset > 0 && chunkSize - curOffset < boundary) offset += (chunkSize - curOffset) % 16;
		else offset += (size - curOffset % size) % size;
		uboElement.offset = offset;
		offset += size;
	}
	offset = Math.ceil(offset / 16) * 16;
	return {
		uboElements,
		size: offset
	};
}
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/shared/shader/utils/uniformParsers.mjs
var uniformParsers = [
	{
		type: "mat3x3<f32>",
		test: (data) => {
			return data.value.a !== void 0;
		},
		ubo: `
            var matrix = uv[name].toArray(true);
            data[offset] = matrix[0];
            data[offset + 1] = matrix[1];
            data[offset + 2] = matrix[2];
            data[offset + 4] = matrix[3];
            data[offset + 5] = matrix[4];
            data[offset + 6] = matrix[5];
            data[offset + 8] = matrix[6];
            data[offset + 9] = matrix[7];
            data[offset + 10] = matrix[8];
        `,
		uniform: `
            gl.uniformMatrix3fv(ud[name].location, false, uv[name].toArray(true));
        `
	},
	{
		type: "vec4<f32>",
		test: (data) => data.type === "vec4<f32>" && data.size === 1 && data.value.width !== void 0,
		ubo: `
            v = uv[name];
            data[offset] = v.x;
            data[offset + 1] = v.y;
            data[offset + 2] = v.width;
            data[offset + 3] = v.height;
        `,
		uniform: `
            cv = ud[name].value;
            v = uv[name];
            if (cv[0] !== v.x || cv[1] !== v.y || cv[2] !== v.width || cv[3] !== v.height) {
                cv[0] = v.x;
                cv[1] = v.y;
                cv[2] = v.width;
                cv[3] = v.height;
                gl.uniform4f(ud[name].location, v.x, v.y, v.width, v.height);
            }
        `
	},
	{
		type: "vec2<f32>",
		test: (data) => data.type === "vec2<f32>" && data.size === 1 && data.value.x !== void 0,
		ubo: `
            v = uv[name];
            data[offset] = v.x;
            data[offset + 1] = v.y;
        `,
		uniform: `
            cv = ud[name].value;
            v = uv[name];
            if (cv[0] !== v.x || cv[1] !== v.y) {
                cv[0] = v.x;
                cv[1] = v.y;
                gl.uniform2f(ud[name].location, v.x, v.y);
            }
        `
	},
	{
		type: "vec4<f32>",
		test: (data) => data.type === "vec4<f32>" && data.size === 1 && data.value.red !== void 0,
		ubo: `
            v = uv[name];
            data[offset] = v.red;
            data[offset + 1] = v.green;
            data[offset + 2] = v.blue;
            data[offset + 3] = v.alpha;
        `,
		uniform: `
            cv = ud[name].value;
            v = uv[name];
            if (cv[0] !== v.red || cv[1] !== v.green || cv[2] !== v.blue || cv[3] !== v.alpha) {
                cv[0] = v.red;
                cv[1] = v.green;
                cv[2] = v.blue;
                cv[3] = v.alpha;
                gl.uniform4f(ud[name].location, v.red, v.green, v.blue, v.alpha);
            }
        `
	},
	{
		type: "vec3<f32>",
		test: (data) => data.type === "vec3<f32>" && data.size === 1 && data.value.red !== void 0,
		ubo: `
            v = uv[name];
            data[offset] = v.red;
            data[offset + 1] = v.green;
            data[offset + 2] = v.blue;
        `,
		uniform: `
            cv = ud[name].value;
            v = uv[name];
            if (cv[0] !== v.red || cv[1] !== v.green || cv[2] !== v.blue) {
                cv[0] = v.red;
                cv[1] = v.green;
                cv[2] = v.blue;
                gl.uniform3f(ud[name].location, v.red, v.green, v.blue);
            }
        `
	}
];
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/shared/shader/utils/compileBufferSync.mjs
function compileBufferSync(uboElements, singleSettersMap, arrayGenerationFunction) {
	const funcFragments = [`
        var v = null;
        var v2 = null;
        var t = 0;
        var index = 0;
        var name = null;
        var arrayOffset = null;
    `];
	let prev = 0;
	for (let i = 0; i < uboElements.length; i++) {
		const uboElement = uboElements[i];
		const name = uboElement.data.name;
		let parsed = false;
		let offset = 0;
		for (let j = 0; j < uniformParsers.length; j++) if (uniformParsers[j].test(uboElement.data)) {
			offset = uboElement.offset / 4;
			funcFragments.push(`name = "${name}";`, `offset += ${offset - prev};`, uniformParsers[j].ubo);
			parsed = true;
			break;
		}
		if (!parsed) {
			if (uboElement.data.size > 1) {
				offset = uboElement.offset / 4;
				funcFragments.push(arrayGenerationFunction(uboElement, offset - prev));
			} else {
				const template = singleSettersMap[uboElement.data.type];
				offset = uboElement.offset / 4;
				funcFragments.push(`
                    v = uv.${name};
                    offset += ${offset - prev};
                    ${template};
                `);
			}
		}
		prev = offset;
	}
	const fragmentSrc = funcFragments.join("\n");
	return new Function("uv", "data", "dataInt32", "offset", fragmentSrc);
}
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/shared/shader/utils/uboSyncFunctions.mjs
function loopMatrix(col, row) {
	return `
        for (let i = 0; i < ${col * row}; i++) {
            data[offset + (((i / ${col})|0) * 4) + (i % ${col})] = v[i];
        }
    `;
}
var uboSyncFunctionsSTD40 = {
	f32: `
        data[offset] = v;`,
	i32: `
        dataInt32[offset] = v;`,
	u32: `
        dataInt32[offset] = v;`,
	"vec2<f32>": `
        data[offset] = v[0];
        data[offset + 1] = v[1];`,
	"vec3<f32>": `
        data[offset] = v[0];
        data[offset + 1] = v[1];
        data[offset + 2] = v[2];`,
	"vec4<f32>": `
        data[offset] = v[0];
        data[offset + 1] = v[1];
        data[offset + 2] = v[2];
        data[offset + 3] = v[3];`,
	"vec2<i32>": `
        dataInt32[offset] = v[0];
        dataInt32[offset + 1] = v[1];`,
	"vec3<i32>": `
        dataInt32[offset] = v[0];
        dataInt32[offset + 1] = v[1];
        dataInt32[offset + 2] = v[2];`,
	"vec4<i32>": `
        dataInt32[offset] = v[0];
        dataInt32[offset + 1] = v[1];
        dataInt32[offset + 2] = v[2];
        dataInt32[offset + 3] = v[3];`,
	"vec2<u32>": `
        dataInt32[offset] = v[0];
        dataInt32[offset + 1] = v[1];`,
	"vec3<u32>": `
        dataInt32[offset] = v[0];
        dataInt32[offset + 1] = v[1];
        dataInt32[offset + 2] = v[2];`,
	"vec4<u32>": `
        dataInt32[offset] = v[0];
        dataInt32[offset + 1] = v[1];
        dataInt32[offset + 2] = v[2];
        dataInt32[offset + 3] = v[3];`,
	"mat2x2<f32>": `
        data[offset] = v[0];
        data[offset + 1] = v[1];
        data[offset + 4] = v[2];
        data[offset + 5] = v[3];`,
	"mat3x3<f32>": `
        data[offset] = v[0];
        data[offset + 1] = v[1];
        data[offset + 2] = v[2];
        data[offset + 4] = v[3];
        data[offset + 5] = v[4];
        data[offset + 6] = v[5];
        data[offset + 8] = v[6];
        data[offset + 9] = v[7];
        data[offset + 10] = v[8];`,
	"mat4x4<f32>": `
        for (let i = 0; i < 16; i++) {
            data[offset + i] = v[i];
        }`,
	"mat3x2<f32>": loopMatrix(3, 2),
	"mat4x2<f32>": loopMatrix(4, 2),
	"mat2x3<f32>": loopMatrix(2, 3),
	"mat4x3<f32>": loopMatrix(4, 3),
	"mat2x4<f32>": loopMatrix(2, 4),
	"mat3x4<f32>": loopMatrix(3, 4)
};
var uboSyncFunctionsWGSL = {
	...uboSyncFunctionsSTD40,
	"mat2x2<f32>": `
        data[offset] = v[0];
        data[offset + 1] = v[1];
        data[offset + 2] = v[2];
        data[offset + 3] = v[3];
    `
};
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/gl/shader/utils/generateArraySyncSTD40.mjs
function generateArraySyncSTD40(uboElement, offsetToAdd) {
	const rowSize = Math.max(WGSL_TO_STD40_SIZE[uboElement.data.type] / 16, 1);
	const elementSize = uboElement.data.value.length / uboElement.data.size;
	const remainder = (4 - elementSize % 4) % 4;
	const data = uboElement.data.type.indexOf("i32") >= 0 ? "dataInt32" : "data";
	return `
        v = uv.${uboElement.data.name};
        offset += ${offsetToAdd};

        arrayOffset = offset;

        t = 0;

        for(var i=0; i < ${uboElement.data.size * rowSize}; i++)
        {
            for(var j = 0; j < ${elementSize}; j++)
            {
                ${data}[arrayOffset++] = v[t++];
            }
            ${remainder !== 0 ? `arrayOffset += ${remainder};` : ""}
        }
    `;
}
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/gl/shader/utils/createUboSyncSTD40.mjs
function createUboSyncFunctionSTD40(uboElements) {
	return compileBufferSync(uboElements, uboSyncFunctionsSTD40, generateArraySyncSTD40);
}
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/gl/GlUboSystem.mjs
var GlUboSystem = class extends UboSystem {
	constructor() {
		super({
			createUboElements: createUboElementsSTD40,
			generateUboSync: createUboSyncFunctionSTD40
		});
	}
};
/** @ignore */
GlUboSystem.extension = {
	type: [ExtensionType.WebGLSystem],
	name: "ubo"
};
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/shared/buffer/BufferResource.mjs
var BufferResource = class extends eventemitter3_default {
	/**
	* Create a new Buffer Resource.
	* @param options - The options for the buffer resource
	* @param options.buffer - The underlying buffer that this resource is using
	* @param options.offset - The offset of the buffer this resource is using.
	* If not provided, then it will use the offset of the buffer.
	* @param options.size - The size of the buffer this resource is using.
	* If not provided, then it will use the size of the buffer.
	*/
	constructor({ buffer, offset, size }) {
		super();
		/**
		* emits when the underlying buffer has changed shape (i.e. resized)
		* letting the renderer know that it needs to discard the old buffer on the GPU and create a new one
		* @event change
		*/
		/** a unique id for this uniform group used through the renderer */
		this.uid = uid("buffer");
		/**
		* a resource type, used to identify how to handle it when its in a bind group / shader resource
		* @internal
		*/
		this._resourceType = "bufferResource";
		/**
		* the resource id used internally by the renderer to build bind group keys
		* @internal
		*/
		this._resourceId = uid("resource");
		/**
		* A cheeky hint to the GL renderer to let it know this is a BufferResource
		* @internal
		*/
		this._bufferResource = true;
		/**
		* Has the Buffer resource been destroyed?
		* @readonly
		*/
		this.destroyed = false;
		this.buffer = buffer;
		this.offset = offset | 0;
		this.size = size;
		this.buffer.on("change", this.onBufferChange, this);
	}
	/**
	* The GC tracks the underlying buffer, not this resource — a GC stamp here (see
	* BindGroup._touch) must land on the buffer, or the GC collects it while cached
	* bind groups still reference it.
	* @internal
	*/
	get _gcLastUsed() {
		return this.buffer?._gcLastUsed ?? -1;
	}
	set _gcLastUsed(value) {
		if (this.buffer) this.buffer._gcLastUsed = value;
	}
	onBufferChange() {
		this._resourceId = uid("resource");
		this.emit("change", this);
	}
	/**
	* Destroys this resource. Make sure the underlying buffer is not used anywhere else
	* if you want to destroy it as well, or code will explode
	* @param destroyBuffer - Should the underlying buffer be destroyed as well?
	*/
	destroy(destroyBuffer = false) {
		this.destroyed = true;
		if (destroyBuffer) this.buffer.destroy();
		this.emit("change", this);
		this.buffer = null;
		this.removeAllListeners();
	}
};
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/shared/texture/TextureView.mjs
var TextureView = class extends eventemitter3_default {
	/**
	* @param source - The texture source to view.
	* @param viewDescriptor - The WebGPU texture view descriptor.
	*/
	constructor(source, viewDescriptor) {
		super();
		/** The type of resource this is (for BindGroup compatibility). */
		this._resourceType = "textureView";
		/** Unique ID for this resource. */
		this._resourceId = uid("resource");
		this.source = source;
		this.viewDescriptor = viewDescriptor;
		this._onChange = this._onChange.bind(this);
		this._onDestroy = this._onDestroy.bind(this);
		this.source.on("change", this._onChange);
		this.source.on("destroy", this._onDestroy);
	}
	_onChange() {
		this.emit("change", this);
	}
	_onDestroy() {
		this.destroy();
	}
	/** Returns whether the underlying source is destroyed. */
	get destroyed() {
		return this.source.destroyed;
	}
	/** Destroys the view and cleans up event listeners. */
	destroy() {
		if (this.source) {
			this.source.off("change", this._onChange);
			this.source.off("destroy", this._onDestroy);
		}
		this.emit("destroy", this);
		this.removeAllListeners();
	}
};
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/gl/shader/GenerateShaderSyncCode.mjs
function generateShaderSyncCode(shader, shaderSystem) {
	const funcFragments = [];
	const headerFragments = [`
        var g = s.groups;
        var sS = r.shader;
        var p = s.glProgram;
        var ugS = r.uniformGroup;
        var resources;
    `];
	let addedTextureSystem = false;
	let textureCount = 0;
	const programData = shaderSystem._getProgramData(shader.glProgram);
	for (const i in shader.groups) {
		const group = shader.groups[i];
		funcFragments.push(`
            resources = g[${i}].resources;
        `);
		for (const j in group.resources) {
			const resource = group.resources[j];
			if (resource instanceof UniformGroup) {
				if (resource.ubo) {
					const resName = shader._uniformBindMap[i][Number(j)];
					funcFragments.push(`
                        sS.bindUniformBlock(
                            resources[${j}],
                            '${resName}',
                            ${shader.glProgram._uniformBlockData[resName].index}
                        );
                    `);
				} else funcFragments.push(`
                        ugS.updateUniformGroup(resources[${j}], p, sD);
                    `);
			} else if (resource instanceof BufferResource) {
				const resName = shader._uniformBindMap[i][Number(j)];
				funcFragments.push(`
                    sS.bindUniformBlock(
                        resources[${j}],
                        '${resName}',
                        ${shader.glProgram._uniformBlockData[resName].index}
                    );
                `);
			} else if (resource instanceof TextureSource || resource instanceof TextureView) {
				const uniformName = shader._uniformBindMap[i][j];
				const uniformData = programData.uniformData[uniformName];
				if (uniformData) {
					if (!addedTextureSystem) {
						addedTextureSystem = true;
						headerFragments.push(`
                        var tS = r.texture;
                        `);
					}
					shaderSystem._gl.uniform1i(uniformData.location, textureCount);
					funcFragments.push(`
                        tS.bind(resources[${j}], ${textureCount});
                    `);
					textureCount++;
				}
			}
		}
	}
	const functionSource = [...headerFragments, ...funcFragments].join("\n");
	return new Function("r", "s", "sD", functionSource);
}
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/gl/shader/GlProgramData.mjs
var IGLUniformData = class {};
var GlProgramData = class {
	/**
	* Makes a new Pixi program.
	* @param program - webgl program
	* @param uniformData - uniforms
	*/
	constructor(program, uniformData) {
		this.program = program;
		this.uniformData = uniformData;
		this.uniformGroups = {};
		this.uniformDirtyGroups = {};
		this.uniformBlockBindings = {};
	}
	/** Destroys this program. */
	destroy() {
		this.uniformData = null;
		this.uniformGroups = null;
		this.uniformDirtyGroups = null;
		this.uniformBlockBindings = null;
		this.program = null;
	}
};
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/gl/shader/program/compileShader.mjs
function compileShader(gl, type, src) {
	const shader = gl.createShader(type);
	gl.shaderSource(shader, src);
	gl.compileShader(shader);
	return shader;
}
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/gl/shader/program/defaultValue.mjs
function booleanArray(size) {
	const array = new Array(size);
	for (let i = 0; i < array.length; i++) array[i] = false;
	return array;
}
function defaultValue(type, size) {
	switch (type) {
		case "float": return 0;
		case "vec2": return new Float32Array(2 * size);
		case "vec3": return new Float32Array(3 * size);
		case "vec4": return new Float32Array(4 * size);
		case "int":
		case "uint":
		case "sampler2D":
		case "sampler2DArray": return 0;
		case "ivec2": return new Int32Array(2 * size);
		case "ivec3": return new Int32Array(3 * size);
		case "ivec4": return new Int32Array(4 * size);
		case "uvec2": return new Uint32Array(2 * size);
		case "uvec3": return new Uint32Array(3 * size);
		case "uvec4": return new Uint32Array(4 * size);
		case "bool": return false;
		case "bvec2": return booleanArray(2 * size);
		case "bvec3": return booleanArray(3 * size);
		case "bvec4": return booleanArray(4 * size);
		case "mat2": return new Float32Array([
			1,
			0,
			0,
			1
		]);
		case "mat3": return new Float32Array([
			1,
			0,
			0,
			0,
			1,
			0,
			0,
			0,
			1
		]);
		case "mat4": return new Float32Array([
			1,
			0,
			0,
			0,
			0,
			1,
			0,
			0,
			0,
			0,
			1,
			0,
			0,
			0,
			0,
			1
		]);
	}
	return null;
}
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/gl/shader/program/mapType.mjs
var GL_TABLE = null;
var GL_TO_GLSL_TYPES = {
	FLOAT: "float",
	FLOAT_VEC2: "vec2",
	FLOAT_VEC3: "vec3",
	FLOAT_VEC4: "vec4",
	INT: "int",
	INT_VEC2: "ivec2",
	INT_VEC3: "ivec3",
	INT_VEC4: "ivec4",
	UNSIGNED_INT: "uint",
	UNSIGNED_INT_VEC2: "uvec2",
	UNSIGNED_INT_VEC3: "uvec3",
	UNSIGNED_INT_VEC4: "uvec4",
	BOOL: "bool",
	BOOL_VEC2: "bvec2",
	BOOL_VEC3: "bvec3",
	BOOL_VEC4: "bvec4",
	FLOAT_MAT2: "mat2",
	FLOAT_MAT3: "mat3",
	FLOAT_MAT4: "mat4",
	SAMPLER_2D: "sampler2D",
	INT_SAMPLER_2D: "sampler2D",
	UNSIGNED_INT_SAMPLER_2D: "sampler2D",
	SAMPLER_2D_SHADOW: "sampler2DShadow",
	SAMPLER_CUBE: "samplerCube",
	INT_SAMPLER_CUBE: "samplerCube",
	UNSIGNED_INT_SAMPLER_CUBE: "samplerCube",
	SAMPLER_CUBE_SHADOW: "samplerCubeShadow",
	SAMPLER_2D_ARRAY: "sampler2DArray",
	INT_SAMPLER_2D_ARRAY: "sampler2DArray",
	UNSIGNED_INT_SAMPLER_2D_ARRAY: "sampler2DArray",
	SAMPLER_2D_ARRAY_SHADOW: "sampler2DArrayShadow"
};
var GLSL_TO_VERTEX_TYPES = {
	float: "float32",
	vec2: "float32x2",
	vec3: "float32x3",
	vec4: "float32x4",
	int: "sint32",
	ivec2: "sint32x2",
	ivec3: "sint32x3",
	ivec4: "sint32x4",
	uint: "uint32",
	uvec2: "uint32x2",
	uvec3: "uint32x3",
	uvec4: "uint32x4",
	bool: "uint32",
	bvec2: "uint32x2",
	bvec3: "uint32x3",
	bvec4: "uint32x4"
};
function mapType(gl, type) {
	if (!GL_TABLE) {
		const typeNames = Object.keys(GL_TO_GLSL_TYPES);
		GL_TABLE = {};
		for (let i = 0; i < typeNames.length; ++i) {
			const tn = typeNames[i];
			GL_TABLE[gl[tn]] = GL_TO_GLSL_TYPES[tn];
		}
	}
	return GL_TABLE[type];
}
function mapGlToVertexFormat(gl, type) {
	return GLSL_TO_VERTEX_TYPES[mapType(gl, type)] || "float32";
}
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/gl/shader/program/extractAttributesFromGlProgram.mjs
function extractAttributesFromGlProgram(program, gl, sortAttributes = false) {
	const attributes = {};
	const totalAttributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
	for (let i = 0; i < totalAttributes; i++) {
		const attribData = gl.getActiveAttrib(program, i);
		if (attribData.name.startsWith("gl_")) continue;
		const format = mapGlToVertexFormat(gl, attribData.type);
		attributes[attribData.name] = {
			location: 0,
			format,
			stride: getAttributeInfoFromFormat(format).stride,
			offset: 0,
			instance: false,
			start: 0
		};
	}
	const keys = Object.keys(attributes);
	if (sortAttributes) {
		keys.sort((a, b) => a > b ? 1 : -1);
		for (let i = 0; i < keys.length; i++) {
			attributes[keys[i]].location = i;
			gl.bindAttribLocation(program, i, keys[i]);
		}
		gl.linkProgram(program);
	} else for (let i = 0; i < keys.length; i++) attributes[keys[i]].location = gl.getAttribLocation(program, keys[i]);
	return attributes;
}
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/gl/shader/program/getUboData.mjs
function getUboData(program, gl) {
	if (!gl.ACTIVE_UNIFORM_BLOCKS) return {};
	const uniformBlocks = {};
	const totalUniformsBlocks = gl.getProgramParameter(program, gl.ACTIVE_UNIFORM_BLOCKS);
	for (let i = 0; i < totalUniformsBlocks; i++) {
		const name = gl.getActiveUniformBlockName(program, i);
		uniformBlocks[name] = {
			name,
			index: gl.getUniformBlockIndex(program, name),
			size: gl.getActiveUniformBlockParameter(program, i, gl.UNIFORM_BLOCK_DATA_SIZE)
		};
	}
	return uniformBlocks;
}
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/gl/shader/program/getUniformData.mjs
function getUniformData(program, gl) {
	const uniforms = {};
	const totalUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
	for (let i = 0; i < totalUniforms; i++) {
		const uniformData = gl.getActiveUniform(program, i);
		const name = uniformData.name.replace(/\[.*?\]$/, "");
		const isArray = !!uniformData.name.match(/\[.*?\]$/);
		const type = mapType(gl, uniformData.type);
		uniforms[name] = {
			name,
			index: i,
			type,
			size: uniformData.size,
			isArray,
			value: defaultValue(type, uniformData.size)
		};
	}
	return uniforms;
}
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/gl/shader/program/logProgramError.mjs
function logPrettyShaderError(gl, shader) {
	const rawSource = gl.getShaderSource(shader);
	if (rawSource === null) {
		console.error("PixiJS Error: Could not retrieve shader source (WebGL context may be lost).");
		return;
	}
	const shaderSrc = rawSource.split("\n").map((line, index) => `${index}: ${line}`);
	const shaderLog = gl.getShaderInfoLog(shader) ?? "";
	const splitShader = shaderLog.split("\n");
	const dedupe = {};
	const lineNumbers = splitShader.map((line) => parseFloat(line.replace(/^ERROR\: 0\:([\d]+)\:.*$/, "$1"))).filter((n) => {
		if (n && !dedupe[n]) {
			dedupe[n] = true;
			return true;
		}
		return false;
	});
	const logArgs = [""];
	lineNumbers.forEach((number) => {
		shaderSrc[number - 1] = `%c${shaderSrc[number - 1]}%c`;
		logArgs.push("background: #FF0000; color:#FFFFFF; font-size: 10px", "font-size: 10px");
	});
	logArgs[0] = shaderSrc.join("\n");
	console.error(shaderLog);
	console.groupCollapsed("click to view full shader code");
	console.warn(...logArgs);
	console.groupEnd();
}
function logProgramError(gl, program, vertexShader, fragmentShader) {
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) logPrettyShaderError(gl, vertexShader);
		if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) logPrettyShaderError(gl, fragmentShader);
		console.error("PixiJS Error: Could not initialize shader.");
		if (gl.getProgramInfoLog(program) !== "") console.warn("PixiJS Warning: gl.getProgramInfoLog()", gl.getProgramInfoLog(program));
	}
}
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/gl/shader/program/generateProgram.mjs
function generateProgram(gl, program) {
	const glVertShader = compileShader(gl, gl.VERTEX_SHADER, program.vertex);
	const glFragShader = compileShader(gl, gl.FRAGMENT_SHADER, program.fragment);
	const webGLProgram = gl.createProgram();
	gl.attachShader(webGLProgram, glVertShader);
	gl.attachShader(webGLProgram, glFragShader);
	const transformFeedbackVaryings = program.transformFeedbackVaryings;
	if (transformFeedbackVaryings) {
		if (typeof gl.transformFeedbackVaryings !== "function") warn(`TransformFeedback is not supported but TransformFeedbackVaryings are given.`);
		else gl.transformFeedbackVaryings(webGLProgram, transformFeedbackVaryings.names, transformFeedbackVaryings.bufferMode === "separate" ? gl.SEPARATE_ATTRIBS : gl.INTERLEAVED_ATTRIBS);
	}
	gl.linkProgram(webGLProgram);
	if (!gl.getProgramParameter(webGLProgram, gl.LINK_STATUS)) logProgramError(gl, webGLProgram, glVertShader, glFragShader);
	program._attributeData = extractAttributesFromGlProgram(webGLProgram, gl, !/^[ \t]*#[ \t]*version[ \t]+300[ \t]+es[ \t]*$/m.test(program.vertex));
	program._uniformData = getUniformData(webGLProgram, gl);
	program._uniformBlockData = getUboData(webGLProgram, gl);
	gl.deleteShader(glVertShader);
	gl.deleteShader(glFragShader);
	const uniformData = {};
	for (const i in program._uniformData) {
		const data = program._uniformData[i];
		uniformData[i] = {
			location: gl.getUniformLocation(webGLProgram, i),
			value: defaultValue(data.type, data.size)
		};
	}
	return new GlProgramData(webGLProgram, uniformData);
}
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/gl/shader/GlShaderSystem.mjs
var defaultSyncData = {
	textureCount: 0,
	blockIndex: 0
};
var GlShaderSystem = class {
	constructor(renderer) {
		/** @internal */
		this._activeProgram = null;
		this._programDataHash = /* @__PURE__ */ Object.create(null);
		this._shaderSyncFunctions = /* @__PURE__ */ Object.create(null);
		this._renderer = renderer;
	}
	contextChange(gl) {
		this._gl = gl;
		this._programDataHash = /* @__PURE__ */ Object.create(null);
		this._shaderSyncFunctions = /* @__PURE__ */ Object.create(null);
		this._activeProgram = null;
	}
	/**
	* Changes the current shader to the one given in parameter.
	* @param shader - the new shader
	* @param skipSync - false if the shader should automatically sync its uniforms.
	* @returns the glProgram that belongs to the shader.
	*/
	bind(shader, skipSync) {
		this._setProgram(shader.glProgram);
		if (skipSync) return;
		defaultSyncData.textureCount = 0;
		defaultSyncData.blockIndex = 0;
		let syncFunction = this._shaderSyncFunctions[shader.glProgram._key];
		if (!syncFunction) syncFunction = this._shaderSyncFunctions[shader.glProgram._key] = this._generateShaderSync(shader, this);
		this._renderer.buffer.nextBindBase(!!shader.glProgram.transformFeedbackVaryings);
		syncFunction(this._renderer, shader, defaultSyncData);
	}
	/**
	* Updates the uniform group.
	* @param uniformGroup - the uniform group to update
	*/
	updateUniformGroup(uniformGroup) {
		this._renderer.uniformGroup.updateUniformGroup(uniformGroup, this._activeProgram, defaultSyncData);
	}
	/**
	* Binds a uniform block to the shader.
	* @param uniformGroup - the uniform group to bind
	* @param name - the name of the uniform block
	* @param index - the index of the uniform block
	*/
	bindUniformBlock(uniformGroup, name, index = 0) {
		const bufferSystem = this._renderer.buffer;
		const programData = this._getProgramData(this._activeProgram);
		const isBufferResource = uniformGroup._bufferResource;
		if (!isBufferResource) this._renderer.ubo.updateUniformGroup(uniformGroup);
		const buffer = uniformGroup.buffer;
		const glBuffer = bufferSystem.updateBuffer(buffer);
		const boundLocation = bufferSystem.freeLocationForBufferBase(glBuffer);
		if (isBufferResource) {
			const { offset, size } = uniformGroup;
			if (offset === 0 && size === buffer.data.byteLength) bufferSystem.bindBufferBase(glBuffer, boundLocation);
			else bufferSystem.bindBufferRange(glBuffer, boundLocation, offset);
		} else if (bufferSystem.getLastBindBaseLocation(glBuffer) !== boundLocation) bufferSystem.bindBufferBase(glBuffer, boundLocation);
		const uniformBlockIndex = this._activeProgram._uniformBlockData[name].index;
		if (programData.uniformBlockBindings[index] === boundLocation) return;
		programData.uniformBlockBindings[index] = boundLocation;
		this._renderer.gl.uniformBlockBinding(programData.program, uniformBlockIndex, boundLocation);
	}
	_setProgram(program) {
		if (this._activeProgram === program) return;
		this._activeProgram = program;
		const programData = this._getProgramData(program);
		this._gl.useProgram(programData.program);
	}
	/**
	* @param program - the program to get the data for
	* @internal
	*/
	_getProgramData(program) {
		return this._programDataHash[program._key] || this._createProgramData(program);
	}
	_createProgramData(program) {
		const key = program._key;
		this._programDataHash[key] = generateProgram(this._gl, program);
		return this._programDataHash[key];
	}
	destroy() {
		for (const key of Object.keys(this._programDataHash)) this._programDataHash[key].destroy();
		this._programDataHash = null;
		this._shaderSyncFunctions = null;
		this._activeProgram = null;
		this._renderer = null;
		this._gl = null;
	}
	/**
	* Creates a function that can be executed that will sync the shader as efficiently as possible.
	* Overridden by the unsafe eval package if you don't want eval used in your project.
	* @param shader - the shader to generate the sync function for
	* @param shaderSystem - the shader system to use
	* @returns - the generated sync function
	* @ignore
	*/
	_generateShaderSync(shader, shaderSystem) {
		return generateShaderSyncCode(shader, shaderSystem);
	}
	resetState() {
		this._activeProgram = null;
	}
};
/** @ignore */
GlShaderSystem.extension = {
	type: [ExtensionType.WebGLSystem],
	name: "shader"
};
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/gl/shader/utils/generateUniformsSyncTypes.mjs
var UNIFORM_TO_SINGLE_SETTERS = {
	f32: `if (cv !== v) {
            cu.value = v;
            gl.uniform1f(location, v);
        }`,
	"vec2<f32>": `if (cv[0] !== v[0] || cv[1] !== v[1]) {
            cv[0] = v[0];
            cv[1] = v[1];
            gl.uniform2f(location, v[0], v[1]);
        }`,
	"vec3<f32>": `if (cv[0] !== v[0] || cv[1] !== v[1] || cv[2] !== v[2]) {
            cv[0] = v[0];
            cv[1] = v[1];
            cv[2] = v[2];
            gl.uniform3f(location, v[0], v[1], v[2]);
        }`,
	"vec4<f32>": `if (cv[0] !== v[0] || cv[1] !== v[1] || cv[2] !== v[2] || cv[3] !== v[3]) {
            cv[0] = v[0];
            cv[1] = v[1];
            cv[2] = v[2];
            cv[3] = v[3];
            gl.uniform4f(location, v[0], v[1], v[2], v[3]);
        }`,
	i32: `if (cv !== v) {
            cu.value = v;
            gl.uniform1i(location, v);
        }`,
	"vec2<i32>": `if (cv[0] !== v[0] || cv[1] !== v[1]) {
            cv[0] = v[0];
            cv[1] = v[1];
            gl.uniform2i(location, v[0], v[1]);
        }`,
	"vec3<i32>": `if (cv[0] !== v[0] || cv[1] !== v[1] || cv[2] !== v[2]) {
            cv[0] = v[0];
            cv[1] = v[1];
            cv[2] = v[2];
            gl.uniform3i(location, v[0], v[1], v[2]);
        }`,
	"vec4<i32>": `if (cv[0] !== v[0] || cv[1] !== v[1] || cv[2] !== v[2] || cv[3] !== v[3]) {
            cv[0] = v[0];
            cv[1] = v[1];
            cv[2] = v[2];
            cv[3] = v[3];
            gl.uniform4i(location, v[0], v[1], v[2], v[3]);
        }`,
	u32: `if (cv !== v) {
            cu.value = v;
            gl.uniform1ui(location, v);
        }`,
	"vec2<u32>": `if (cv[0] !== v[0] || cv[1] !== v[1]) {
            cv[0] = v[0];
            cv[1] = v[1];
            gl.uniform2ui(location, v[0], v[1]);
        }`,
	"vec3<u32>": `if (cv[0] !== v[0] || cv[1] !== v[1] || cv[2] !== v[2]) {
            cv[0] = v[0];
            cv[1] = v[1];
            cv[2] = v[2];
            gl.uniform3ui(location, v[0], v[1], v[2]);
        }`,
	"vec4<u32>": `if (cv[0] !== v[0] || cv[1] !== v[1] || cv[2] !== v[2] || cv[3] !== v[3]) {
            cv[0] = v[0];
            cv[1] = v[1];
            cv[2] = v[2];
            cv[3] = v[3];
            gl.uniform4ui(location, v[0], v[1], v[2], v[3]);
        }`,
	bool: `if (cv !== v) {
            cu.value = v;
            gl.uniform1i(location, v);
        }`,
	"vec2<bool>": `if (cv[0] !== v[0] || cv[1] !== v[1]) {
            cv[0] = v[0];
            cv[1] = v[1];
            gl.uniform2i(location, v[0], v[1]);
        }`,
	"vec3<bool>": `if (cv[0] !== v[0] || cv[1] !== v[1] || cv[2] !== v[2]) {
            cv[0] = v[0];
            cv[1] = v[1];
            cv[2] = v[2];
            gl.uniform3i(location, v[0], v[1], v[2]);
        }`,
	"vec4<bool>": `if (cv[0] !== v[0] || cv[1] !== v[1] || cv[2] !== v[2] || cv[3] !== v[3]) {
            cv[0] = v[0];
            cv[1] = v[1];
            cv[2] = v[2];
            cv[3] = v[3];
            gl.uniform4i(location, v[0], v[1], v[2], v[3]);
        }`,
	"mat2x2<f32>": `gl.uniformMatrix2fv(location, false, v);`,
	"mat3x3<f32>": `gl.uniformMatrix3fv(location, false, v);`,
	"mat4x4<f32>": `gl.uniformMatrix4fv(location, false, v);`
};
var UNIFORM_TO_ARRAY_SETTERS = {
	f32: `gl.uniform1fv(location, v);`,
	"vec2<f32>": `gl.uniform2fv(location, v);`,
	"vec3<f32>": `gl.uniform3fv(location, v);`,
	"vec4<f32>": `gl.uniform4fv(location, v);`,
	"mat2x2<f32>": `gl.uniformMatrix2fv(location, false, v);`,
	"mat3x3<f32>": `gl.uniformMatrix3fv(location, false, v);`,
	"mat4x4<f32>": `gl.uniformMatrix4fv(location, false, v);`,
	i32: `gl.uniform1iv(location, v);`,
	"vec2<i32>": `gl.uniform2iv(location, v);`,
	"vec3<i32>": `gl.uniform3iv(location, v);`,
	"vec4<i32>": `gl.uniform4iv(location, v);`,
	u32: `gl.uniform1iv(location, v);`,
	"vec2<u32>": `gl.uniform2iv(location, v);`,
	"vec3<u32>": `gl.uniform3iv(location, v);`,
	"vec4<u32>": `gl.uniform4iv(location, v);`,
	bool: `gl.uniform1iv(location, v);`,
	"vec2<bool>": `gl.uniform2iv(location, v);`,
	"vec3<bool>": `gl.uniform3iv(location, v);`,
	"vec4<bool>": `gl.uniform4iv(location, v);`
};
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/gl/shader/utils/generateUniformsSync.mjs
function generateUniformsSync(group, uniformData) {
	const funcFragments = [`
        var v = null;
        var cv = null;
        var cu = null;
        var t = 0;
        var gl = renderer.gl;
        var name = null;
    `];
	for (const i in group.uniforms) {
		if (!uniformData[i]) {
			if (group.uniforms[i] instanceof UniformGroup) {
				if (group.uniforms[i].ubo) funcFragments.push(`
                        renderer.shader.bindUniformBlock(uv.${i}, "${i}");
                    `);
				else funcFragments.push(`
                        renderer.shader.updateUniformGroup(uv.${i});
                    `);
			} else if (group.uniforms[i] instanceof BufferResource) funcFragments.push(`
                        renderer.shader.bindBufferResource(uv.${i}, "${i}");
                    `);
			continue;
		}
		const uniform = group.uniformStructures[i];
		let parsed = false;
		for (let j = 0; j < uniformParsers.length; j++) {
			const parser = uniformParsers[j];
			if (uniform.type === parser.type && parser.test(uniform)) {
				funcFragments.push(`name = "${i}";`, uniformParsers[j].uniform);
				parsed = true;
				break;
			}
		}
		if (!parsed) {
			const template = (uniform.size === 1 ? UNIFORM_TO_SINGLE_SETTERS : UNIFORM_TO_ARRAY_SETTERS)[uniform.type].replace("location", `ud["${i}"].location`);
			funcFragments.push(`
            cu = ud["${i}"];
            cv = cu.value;
            v = uv["${i}"];
            ${template};`);
		}
	}
	return new Function("ud", "uv", "renderer", "syncData", funcFragments.join("\n"));
}
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/gl/shader/GlUniformGroupSystem.mjs
var GlUniformGroupSystem = class {
	/** @param renderer - The renderer this System works for. */
	constructor(renderer) {
		/** Cache to holds the generated functions. Stored against UniformObjects unique signature. */
		this._cache = {};
		this._uniformGroupSyncHash = {};
		this._renderer = renderer;
		this.gl = null;
		this._cache = {};
	}
	contextChange(gl) {
		this.gl = gl;
	}
	/**
	* Uploads the uniforms values to the currently bound shader.
	* @param group - the uniforms values that be applied to the current shader
	* @param program
	* @param syncData
	* @param syncData.textureCount
	*/
	updateUniformGroup(group, program, syncData) {
		const programData = this._renderer.shader._getProgramData(program);
		if (!group.isStatic || group._dirtyId !== programData.uniformDirtyGroups[group.uid]) {
			programData.uniformDirtyGroups[group.uid] = group._dirtyId;
			this._getUniformSyncFunction(group, program)(programData.uniformData, group.uniforms, this._renderer, syncData);
		}
	}
	/**
	* Overridable by the pixi.js/unsafe-eval package to use static syncUniforms instead.
	* @param group
	* @param program
	*/
	_getUniformSyncFunction(group, program) {
		return this._uniformGroupSyncHash[group._signature]?.[program._key] || this._createUniformSyncFunction(group, program);
	}
	_createUniformSyncFunction(group, program) {
		const uniformGroupSyncHash = this._uniformGroupSyncHash[group._signature] || (this._uniformGroupSyncHash[group._signature] = {});
		const id = this._getSignature(group, program._uniformData, "u");
		if (!this._cache[id]) this._cache[id] = this._generateUniformsSync(group, program._uniformData);
		uniformGroupSyncHash[program._key] = this._cache[id];
		return uniformGroupSyncHash[program._key];
	}
	_generateUniformsSync(group, uniformData) {
		return generateUniformsSync(group, uniformData);
	}
	/**
	* Takes a uniform group and data and generates a unique signature for them.
	* @param group - The uniform group to get signature of
	* @param group.uniforms
	* @param uniformData - Uniform information generated by the shader
	* @param preFix
	* @returns Unique signature of the uniform group
	*/
	_getSignature(group, uniformData, preFix) {
		const uniforms = group.uniforms;
		const strings = [`${preFix}-`];
		for (const i in uniforms) {
			strings.push(i);
			if (uniformData[i]) strings.push(uniformData[i].type);
		}
		return strings.join("-");
	}
	/** Destroys this System and removes all its textures. */
	destroy() {
		this._renderer = null;
		this._cache = null;
	}
};
/** @ignore */
GlUniformGroupSystem.extension = {
	type: [ExtensionType.WebGLSystem],
	name: "uniformGroup"
};
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/gpu/shader/utils/createUboElementsWGSL.mjs
var WGSL_ALIGN_SIZE_DATA = {
	i32: {
		align: 4,
		size: 4
	},
	u32: {
		align: 4,
		size: 4
	},
	f32: {
		align: 4,
		size: 4
	},
	f16: {
		align: 2,
		size: 2
	},
	"vec2<i32>": {
		align: 8,
		size: 8
	},
	"vec2<u32>": {
		align: 8,
		size: 8
	},
	"vec2<f32>": {
		align: 8,
		size: 8
	},
	"vec2<f16>": {
		align: 4,
		size: 4
	},
	"vec3<i32>": {
		align: 16,
		size: 12
	},
	"vec3<u32>": {
		align: 16,
		size: 12
	},
	"vec3<f32>": {
		align: 16,
		size: 12
	},
	"vec3<f16>": {
		align: 8,
		size: 6
	},
	"vec4<i32>": {
		align: 16,
		size: 16
	},
	"vec4<u32>": {
		align: 16,
		size: 16
	},
	"vec4<f32>": {
		align: 16,
		size: 16
	},
	"vec4<f16>": {
		align: 8,
		size: 8
	},
	"mat2x2<f32>": {
		align: 8,
		size: 16
	},
	"mat2x2<f16>": {
		align: 4,
		size: 8
	},
	"mat3x2<f32>": {
		align: 8,
		size: 24
	},
	"mat3x2<f16>": {
		align: 4,
		size: 12
	},
	"mat4x2<f32>": {
		align: 8,
		size: 32
	},
	"mat4x2<f16>": {
		align: 4,
		size: 16
	},
	"mat2x3<f32>": {
		align: 16,
		size: 32
	},
	"mat2x3<f16>": {
		align: 8,
		size: 16
	},
	"mat3x3<f32>": {
		align: 16,
		size: 48
	},
	"mat3x3<f16>": {
		align: 8,
		size: 24
	},
	"mat4x3<f32>": {
		align: 16,
		size: 64
	},
	"mat4x3<f16>": {
		align: 8,
		size: 32
	},
	"mat2x4<f32>": {
		align: 16,
		size: 32
	},
	"mat2x4<f16>": {
		align: 8,
		size: 16
	},
	"mat3x4<f32>": {
		align: 16,
		size: 48
	},
	"mat3x4<f16>": {
		align: 8,
		size: 24
	},
	"mat4x4<f32>": {
		align: 16,
		size: 64
	},
	"mat4x4<f16>": {
		align: 8,
		size: 32
	}
};
function createUboElementsWGSL(uniformData) {
	const uboElements = uniformData.map((data) => ({
		data,
		offset: 0,
		size: 0
	}));
	let offset = 0;
	for (let i = 0; i < uboElements.length; i++) {
		const uboElement = uboElements[i];
		let size = WGSL_ALIGN_SIZE_DATA[uboElement.data.type].size;
		const align = WGSL_ALIGN_SIZE_DATA[uboElement.data.type].align;
		if (!WGSL_ALIGN_SIZE_DATA[uboElement.data.type]) throw new Error(`[Pixi.js] WebGPU UniformBuffer: Unknown type ${uboElement.data.type}`);
		if (uboElement.data.size > 1) size = Math.max(size, align) * uboElement.data.size;
		offset = Math.ceil(offset / align) * align;
		uboElement.size = size;
		uboElement.offset = offset;
		offset += size;
	}
	offset = Math.ceil(offset / 16) * 16;
	return {
		uboElements,
		size: offset
	};
}
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/gpu/shader/utils/generateArraySyncWGSL.mjs
function generateArraySyncWGSL(uboElement, offsetToAdd) {
	const { size, align } = WGSL_ALIGN_SIZE_DATA[uboElement.data.type];
	const remainder = (align - size) / 4;
	const data = uboElement.data.type.indexOf("i32") >= 0 ? "dataInt32" : "data";
	return `
         v = uv.${uboElement.data.name};
         ${offsetToAdd !== 0 ? `offset += ${offsetToAdd};` : ""}

         arrayOffset = offset;

         t = 0;

         for(var i=0; i < ${uboElement.data.size * (size / 4)}; i++)
         {
             for(var j = 0; j < ${size / 4}; j++)
             {
                 ${data}[arrayOffset++] = v[t++];
             }
             ${remainder !== 0 ? `arrayOffset += ${remainder};` : ""}
         }
     `;
}
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/gpu/shader/utils/createUboSyncFunctionWGSL.mjs
function createUboSyncFunctionWGSL(uboElements) {
	return compileBufferSync(uboElements, uboSyncFunctionsWGSL, generateArraySyncWGSL);
}
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/gpu/GpuUboSystem.mjs
var GpuUboSystem = class extends UboSystem {
	constructor() {
		super({
			createUboElements: createUboElementsWGSL,
			generateUboSync: createUboSyncFunctionWGSL
		});
	}
};
/** @ignore */
GpuUboSystem.extension = {
	type: [ExtensionType.WebGPUSystem],
	name: "ubo"
};
//#endregion
//#region node_modules/pixi.js/lib/scene/particle-container/shared/utils/createIndicesForQuads.mjs
function createIndicesForQuads(size, outBuffer = null) {
	const totalIndices = size * 6;
	if (totalIndices > 65535) outBuffer || (outBuffer = new Uint32Array(totalIndices));
	else outBuffer || (outBuffer = new Uint16Array(totalIndices));
	if (outBuffer.length !== totalIndices) throw new Error(`Out buffer length is incorrect, got ${outBuffer.length} and expected ${totalIndices}`);
	for (let i = 0, j = 0; i < totalIndices; i += 6, j += 4) {
		outBuffer[i + 0] = j + 0;
		outBuffer[i + 1] = j + 1;
		outBuffer[i + 2] = j + 2;
		outBuffer[i + 3] = j + 0;
		outBuffer[i + 4] = j + 2;
		outBuffer[i + 5] = j + 3;
	}
	return outBuffer;
}
//#endregion
//#region node_modules/pixi.js/lib/scene/particle-container/shared/utils/generateParticleUpdateFunction.mjs
function generateParticleUpdateFunction(properties) {
	return {
		dynamicUpdate: generateUpdateFunction(properties, true),
		staticUpdate: generateUpdateFunction(properties, false)
	};
}
function generateUpdateFunction(properties, dynamic) {
	const funcFragments = [];
	funcFragments.push(`

        var index = 0;

        for (let i = 0; i < ps.length; ++i)
        {
            const p = ps[i];

            `);
	let offset = 0;
	for (const i in properties) {
		const property = properties[i];
		if (dynamic !== property.dynamic) continue;
		funcFragments.push(`offset = index + ${offset}`);
		funcFragments.push(property.code);
		const attributeInfo = getAttributeInfoFromFormat(property.format);
		offset += attributeInfo.stride / 4;
	}
	funcFragments.push(`
            index += stride * 4;
        }
    `);
	funcFragments.unshift(`
        var stride = ${offset};
    `);
	const functionSource = funcFragments.join("\n");
	return new Function("ps", "f32v", "u32v", functionSource);
}
//#endregion
//#region node_modules/pixi.js/lib/scene/particle-container/shared/ParticleBuffer.mjs
var ParticleBuffer = class {
	constructor(options) {
		this._size = 0;
		this._generateParticleUpdateCache = {};
		const size = this._size = options.size ?? 1e3;
		const properties = options.properties;
		let staticVertexSize = 0;
		let dynamicVertexSize = 0;
		for (const i in properties) {
			const property = properties[i];
			const attributeInfo = getAttributeInfoFromFormat(property.format);
			if (property.dynamic) dynamicVertexSize += attributeInfo.stride;
			else staticVertexSize += attributeInfo.stride;
		}
		this._dynamicStride = dynamicVertexSize / 4;
		this._staticStride = staticVertexSize / 4;
		this.staticAttributeBuffer = new ViewableBuffer(size * 4 * staticVertexSize);
		this.dynamicAttributeBuffer = new ViewableBuffer(size * 4 * dynamicVertexSize);
		this.indexBuffer = createIndicesForQuads(size);
		const geometry = new Geometry();
		let dynamicOffset = 0;
		let staticOffset = 0;
		this._staticBuffer = new Buffer({
			data: /* @__PURE__ */ new Float32Array(1),
			label: "static-particle-buffer",
			shrinkToFit: false,
			usage: BufferUsage.VERTEX | BufferUsage.COPY_DST
		});
		this._dynamicBuffer = new Buffer({
			data: /* @__PURE__ */ new Float32Array(1),
			label: "dynamic-particle-buffer",
			shrinkToFit: false,
			usage: BufferUsage.VERTEX | BufferUsage.COPY_DST
		});
		for (const i in properties) {
			const property = properties[i];
			const attributeInfo = getAttributeInfoFromFormat(property.format);
			if (property.dynamic) {
				geometry.addAttribute(property.attributeName, {
					buffer: this._dynamicBuffer,
					stride: this._dynamicStride * 4,
					offset: dynamicOffset * 4,
					format: property.format
				});
				dynamicOffset += attributeInfo.size;
			} else {
				geometry.addAttribute(property.attributeName, {
					buffer: this._staticBuffer,
					stride: this._staticStride * 4,
					offset: staticOffset * 4,
					format: property.format
				});
				staticOffset += attributeInfo.size;
			}
		}
		geometry.addIndex(this.indexBuffer);
		const uploadFunction = this.getParticleUpdate(properties);
		this._dynamicUpload = uploadFunction.dynamicUpdate;
		this._staticUpload = uploadFunction.staticUpdate;
		this.geometry = geometry;
	}
	getParticleUpdate(properties) {
		const key = getParticleSyncKey(properties);
		if (this._generateParticleUpdateCache[key]) return this._generateParticleUpdateCache[key];
		this._generateParticleUpdateCache[key] = this.generateParticleUpdate(properties);
		return this._generateParticleUpdateCache[key];
	}
	generateParticleUpdate(properties) {
		return generateParticleUpdateFunction(properties);
	}
	update(particles, uploadStatic) {
		if (particles.length > this._size) {
			uploadStatic = true;
			this._size = Math.max(particles.length, this._size * 1.5 | 0);
			this.staticAttributeBuffer = new ViewableBuffer(this._size * this._staticStride * 4 * 4);
			this.dynamicAttributeBuffer = new ViewableBuffer(this._size * this._dynamicStride * 4 * 4);
			this.indexBuffer = createIndicesForQuads(this._size);
			this.geometry.indexBuffer.setDataWithSize(this.indexBuffer, this.indexBuffer.byteLength, true);
		}
		const dynamicAttributeBuffer = this.dynamicAttributeBuffer;
		this._dynamicUpload(particles, dynamicAttributeBuffer.float32View, dynamicAttributeBuffer.uint32View);
		this._dynamicBuffer.setDataWithSize(this.dynamicAttributeBuffer.float32View, particles.length * this._dynamicStride * 4, true);
		if (uploadStatic) {
			const staticAttributeBuffer = this.staticAttributeBuffer;
			this._staticUpload(particles, staticAttributeBuffer.float32View, staticAttributeBuffer.uint32View);
			this._staticBuffer.setDataWithSize(staticAttributeBuffer.float32View, particles.length * this._staticStride * 4, true);
		}
	}
	destroy() {
		this._staticBuffer.destroy();
		this._dynamicBuffer.destroy();
		this.geometry.destroy();
	}
};
function getParticleSyncKey(properties) {
	const keyGen = [];
	for (const key in properties) {
		const property = properties[key];
		keyGen.push(key, property.code, property.dynamic ? "d" : "s");
	}
	return keyGen.join("_");
}
//#endregion
export { UNIFORM_TYPES_VALUES as $, nextPow2 as $t, generateArraySyncSTD40 as A, MaskEffectManager as At, ensureIsBuffer as B, GlobalResourceRegistry as Bt, GlProgramData as C, getGlobalBounds as Ct, BufferResource as D, matrixPool as Dt, TextureView as E, boundsPool as Et, WGSL_TO_STD40_SIZE as F, removeItems as Ft, SystemRunner as G, Texture as Gt, BufferUsage as H, cullingMixin as Ht, createUboElementsSTD40 as I, cacheAsTextureMixin as It, autoDetectEnvironment as J, TextureSource as Jt, CLEAR as K, TextureMatrix as Kt, UboSystem as L, BigPool as Lt, uboSyncFunctionsWGSL as M, FilterEffect as Mt, compileBufferSync as N, collectRenderablesMixin as Nt, GlUboSystem as O, findMixin as Ot, uniformParsers as P, childrenHelperMixin as Pt, UNIFORM_TYPES_MAP as Q, log2 as Qt, Geometry as R, PoolGroupClass as Rt, compileShader as S, multiplyHexColors as St, generateShaderSyncCode as T, getFastGlobalBoundsMixin as Tt, ViewableBuffer as U, Color as Ut, Buffer as V, warn as Vt, AbstractRenderer as W, Bounds as Wt, UniformGroup as X, definedProps as Xt, loadEnvironmentExtensions as Y, TextureStyle as Yt, getDefaultUniformValue as Z, isPow2 as Zt, getUboData as _, extensions as _n, checkChildrenDidChange as _t, createUboSyncFunctionWGSL as a, resetUids as an, UPDATE_TRANSFORM as at, mapType as b, getGlobalMixin as bt, createUboElementsWGSL as c, groupD8 as cn, RenderGroup as ct, UNIFORM_TO_ARRAY_SETTERS as d, DEG_TO_RAD as dn, ScreenSizeRegistry as dt, NOOP as en, getAttributeInfoFromFormat as et, UNIFORM_TO_SINGLE_SETTERS as f, PI_2 as fn, InstructionSet as ft, getUniformData as g, ExtensionType as gn, measureMixin as gt, logProgramError as h, ObservablePoint as hn, onRenderMixin as ht, GpuUboSystem as i, v8_3_4 as in, UPDATE_COLOR as it, uboSyncFunctionsSTD40 as j, MaskEffectManagerClass as jt, createUboSyncFunctionSTD40 as k, effectsMixin as kt, GlUniformGroupSystem as l, Matrix as ln, TexturePool as lt, generateProgram as m, eventemitter3_default as mn, sortMixin as mt, generateParticleUpdateFunction as n, v8_0_0 as nn, Container as nt, generateArraySyncWGSL as o, uid as on, UPDATE_VISIBLE as ot, GlShaderSystem as p, RAD_TO_DEG as pn, toLocalGlobalMixin as pt, unsafeEvalSupported as q, BufferImageSource as qt, createIndicesForQuads as r, v8_21_0 as rn, UPDATE_BLEND as rt, WGSL_ALIGN_SIZE_DATA as s, Rectangle as sn, assignWithIgnore as st, ParticleBuffer as t, deprecation as tn, createIdFromString as tt, generateUniformsSync as u, Point as un, TexturePoolClass as ut, extractAttributesFromGlProgram as v, normalizeExtensionPriority as vn, getLocalBounds as vt, IGLUniformData as w, updateTransformBackwards as wt, defaultValue as x, multiplyColors as xt, mapGlToVertexFormat as y, bgr2rgb as yt, getGeometryBounds as z, Pool as zt };
