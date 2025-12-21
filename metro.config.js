const { getDefaultConfig } = require('@expo/metro-config');
const path = require('path');

/** @type {import('metro-config').ConfigT} */
const config = getDefaultConfig(__dirname);

// 웹에서도 ESM(`import`)보다 `react-native` 조건을 우선 사용하도록 설정
const baseResolver = config.resolver || {};
config.resolver = {
	...baseResolver,
	unstable_conditionNames: [
		'react-native',
		'require',
		'web',
		'browser',
		'import',
		'default',
	],
	extraNodeModules: {
		'@babel/runtime/helpers/esm/objectWithoutPropertiesLoose': path.resolve(__dirname, 'shims/objectWithoutPropertiesLoose.js'),
		'@babel/runtime/helpers/esm/objectWithoutProperties': path.resolve(__dirname, 'shims/objectWithoutProperties.js'),
		'@babel/runtime/helpers/objectWithoutPropertiesLoose': path.resolve(__dirname, 'shims/objectWithoutPropertiesLoose.js'),
		'@babel/runtime/helpers/objectWithoutProperties': path.resolve(__dirname, 'shims/objectWithoutProperties.js'),
	},
    resolveRequest: (context, moduleName, platform) => {
        try {
            if (moduleName.includes('expo-router/vendor/react-helmet-async')) {
                return {
                    filePath: path.resolve(__dirname, 'shims/react-helmet-async.js'),
                    type: 'sourceFile',
                };
            }
			if (moduleName.endsWith('objectWithoutPropertiesLoose.js') || moduleName.endsWith('objectWithoutPropertiesLoose')) {
				return {
					filePath: path.resolve(__dirname, 'shims/objectWithoutPropertiesLoose.js'),
					type: 'sourceFile',
				};
			}
			if (moduleName.endsWith('objectWithoutProperties.js') || moduleName.endsWith('objectWithoutProperties')) {
				return {
					filePath: path.resolve(__dirname, 'shims/objectWithoutProperties.js'),
					type: 'sourceFile',
				};
			}
        } catch {}
        return context.resolveRequest(context, moduleName, platform);
    },
};

module.exports = config;
// Ensure polyfills/shims run before the main module
config.serializer = {
	...(config.serializer || {}),
	getModulesRunBeforeMainModule: () => [
		path.resolve(__dirname, 'shims/babel-helpers.js'),
	],
};
