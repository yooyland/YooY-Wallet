(function(){
	try {
		var mod = require('@babel/runtime/helpers/objectWithoutPropertiesLoose');
		var fn = mod && (mod.default || mod);
		if (typeof fn === 'function') {
			globalThis._objectWithoutPropertiesLoose = fn;
		}
	} catch (e) {}
	try {
		var mod2 = require('@babel/runtime/helpers/objectWithoutProperties');
		var fn2 = mod2 && (mod2.default || mod2);
		if (typeof fn2 === 'function') {
			globalThis._objectWithoutProperties = fn2;
		}
	} catch (e) {}
})();


