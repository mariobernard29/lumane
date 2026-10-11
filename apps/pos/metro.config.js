/**
 * Metro dentro del monorepo.
 *
 * Por defecto Metro solo mira dentro de `apps/pos`, así que no vería
 * `packages/core` ni `packages/tokens` y cualquier cambio en ellos no
 * recargaría. Las dos líneas de `watchFolders` y `nodeModulesPaths` son lo que
 * hace que el POS pueda importar el mismo dominio que la tienda en línea.
 *
 * `disableHierarchicalLookup` queda en false: pnpm con `node-linker=hoisted`
 * deja parte de las dependencias en la raíz y desactivarlo las escondería.
 */
const { getDefaultConfig } = require('expo/metro-config')
const path = require('node:path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

// Los paquetes compartidos se publican como TypeScript sin compilar
// (`"main": "./src/index.ts"`). Metro los transpila igual que el código de la
// app, así que no hace falta un paso de build entre editar y ver el cambio.
config.resolver.sourceExts = [...config.resolver.sourceExts, 'ts', 'tsx']

// Vista previa en el navegador (`expo start --web`): el almacén seguro de
// Android no existe ahí, y se sustituye por uno sobre localStorage. Solo en
// web: el APK sigue usando el Keystore.
const resolverOriginal = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'expo-secure-store') {
    return { type: 'sourceFile', filePath: path.resolve(projectRoot, 'src/web/secure-store.ts') }
  }
  return (resolverOriginal ?? context.resolveRequest)(context, moduleName, platform)
}

module.exports = config
